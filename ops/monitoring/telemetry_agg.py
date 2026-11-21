#!/usr/bin/env python3
"""
Bozzii AI Public Telemetry Aggregator (Strictly Read-Only & Redacted).

Aggregates the last 7 days of consumption logs from xseek-new-api-postgres using
dual-semantic (Anthropic vs OpenAI) cache accounting, merges live canary probe
verification state, strips all private/channel/user fields, and atomically writes
a public JSON feed for transparency & pricing UIs.
"""

import argparse
import datetime as dt
import json
import os
import subprocess
import sys
from pathlib import Path

SQL_7D = r"""
WITH recent AS (
  SELECT
    model_name,
    type,
    prompt_tokens,
    completion_tokens,
    use_time,
    CASE WHEN other LIKE '{%' THEN other::jsonb ELSE '{}'::jsonb END AS oj
  FROM logs
  WHERE created_at >= extract(epoch from now() - interval '7 days')::bigint
    AND type IN (2, 5)
    AND model_name <> ''
    AND COALESCE(other, '') NOT LIKE '%"Model test"%'
),
norm AS (
  SELECT
    model_name,
    type,
    use_time,
    prompt_tokens,
    COALESCE((oj->>'cache_tokens')::bigint, 0) AS cache_read,
    COALESCE((oj->>'cache_creation_tokens')::bigint, 0) AS cache_write,
    (
      COALESCE(oj->>'usage_semantic', '') = 'anthropic'
      OR COALESCE((oj->>'claude')::boolean, false)
    ) AS is_anthropic
  FROM recent
),
calc AS (
  SELECT
    model_name,
    type,
    use_time,
    cache_read,
    CASE
      WHEN type <> 2 THEN 0
      WHEN is_anthropic THEN prompt_tokens + cache_read + cache_write
      ELSE GREATEST(prompt_tokens, cache_read)
    END AS total_input
  FROM norm
)
SELECT json_agg(row_to_json(t))
FROM (
  SELECT
    model_name AS model,
    count(*) FILTER (WHERE type = 2) AS ok_requests,
    count(*) FILTER (WHERE type = 5) AS err_requests,
    ROUND(
      100.0 * count(*) FILTER (WHERE type = 2) / NULLIF(count(*), 0),
      2
    ) AS success_rate_pct,
    ROUND(
      (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY use_time) FILTER (WHERE type = 2 AND use_time > 0))::numeric,
      1
    ) AS p50_latency_s,
    ROUND(
      100.0 * SUM(cache_read) FILTER (WHERE type = 2)
      / NULLIF(SUM(total_input) FILTER (WHERE type = 2), 0),
      2
    ) AS cache_hit_rate_pct
  FROM calc
  GROUP BY model_name
  HAVING count(*) FILTER (WHERE type = 2) >= 20
  ORDER BY count(*) FILTER (WHERE type = 2) DESC
) t;
"""


def query_pg_stats(container: str) -> list[dict]:
    cmd = [
        "docker",
        "exec",
        container,
        "psql",
        "-U",
        "newapi",
        "-d",
        "newapi",
        "-t",
        "-A",
        "-c",
        SQL_7D,
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=30, check=True)
    raw = res.stdout.strip()
    if not raw:
        return []
    return json.loads(raw) or []


def build_public_payload(pg_rows: list[dict], canary_state: dict | None) -> dict:
    now_iso = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    canary_models = (canary_state or {}).get("models") or {}
    models_out = {}

    for row in pg_rows:
        m = row["model"]
        entry = {
            "model": m,
            "window": "7d",
            "ok_requests": int(row.get("ok_requests") or 0),
            "success_rate_pct": float(row["success_rate_pct"]) if row.get("success_rate_pct") is not None else None,
            "p50_latency_s": float(row["p50_latency_s"]) if row.get("p50_latency_s") is not None else None,
            "cache_hit_rate_pct": float(row["cache_hit_rate_pct"]) if row.get("cache_hit_rate_pct") is not None else 0.0,
        }
        if m in canary_models:
            cm = canary_models[m]
            entry["canary"] = {
                "checked_at": cm.get("checked_at"),
                "passed": bool(cm.get("passed")),
                "cache_hit_pct": round(float(cm.get("cache_hit_ratio") or 0) * 100, 1),
                "integrity_ratio": cm.get("integrity_ratio"),
                "latency_ms_warm": cm.get("latency_ms_r2"),
            }
        models_out[m] = entry

    # Ensure canary models appear even if <20 user requests in last 7d
    for m, cm in canary_models.items():
        if m not in models_out:
            models_out[m] = {
                "model": m,
                "window": "7d",
                "ok_requests": 0,
                "success_rate_pct": None,
                "p50_latency_s": None,
                "cache_hit_rate_pct": None,
                "canary": {
                    "checked_at": cm.get("checked_at"),
                    "passed": bool(cm.get("passed")),
                    "cache_hit_pct": round(float(cm.get("cache_hit_ratio") or 0) * 100, 1),
                    "integrity_ratio": cm.get("integrity_ratio"),
                    "latency_ms_warm": cm.get("latency_ms_r2"),
                },
            }

    return {
        "generated_at": now_iso,
        "window_days": 7,
        "status_page": "https://status.bozzii.com/",
        "integrity": (canary_state or {}).get("integrity") or {},
        "models": models_out,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pg-container", default="xseek-new-api-postgres")
    ap.add_argument("--canary-state", default="/opt/ops/bozzii-canary/canary_state.json")
    ap.add_argument("--out", default="/opt/1panel/www/sites/ai.bozzii.com/index/brand/telemetry.json")
    args = ap.parse_args()

    pg_rows = query_pg_stats(args.pg_container)
    canary_state = None
    cpath = Path(args.canary_state)
    if cpath.exists():
        try:
            canary_state = json.loads(cpath.read_text(encoding="utf-8"))
        except Exception:
            canary_state = None

    payload = build_public_payload(pg_rows, canary_state)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.chmod(tmp, 0o644)
    os.replace(tmp, out)
    print(f"Wrote {out} ({len(payload['models'])} models)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
