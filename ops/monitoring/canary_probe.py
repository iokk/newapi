#!/usr/bin/env python3
"""
Bozzii AI Canary Probe — Real-Liveness + Real-Prompt-Cache + 1.00x Token Integrity.

Sends a deterministic ~2,200-token prefix + random arithmetic check in two rounds
(3s apart) to each flagship model line, verifies:
  1. Real liveness (HTTP 200 + exact arithmetic answer)
  2. Real prompt caching (Round 2 cache_read / total_in >= 0.65)
  3. 1.00x billing integrity (no cached-token bloat: 0.95 <= T2/T1 <= 1.05 and
     within +-8% of calibrated baseline)

Reports passes/failures to Better Stack Heartbeat URLs and optional Feishu webhook,
and writes redacted state JSON for the public telemetry aggregator.
"""

import argparse
import datetime as dt
import json
import os
import random
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

# Deterministic ~2,200-token technical spec prefix (>2,048 tokens to exceed both
# OpenAI 1,024-token and Anthropic 1,024/2,048-token cache thresholds).
_SECTION = (
    "Section {idx:02d} — Distributed API Gateway Reliability Specification: "
    "An enterprise LLM gateway routes chat completions, messages, and responses "
    "across heterogeneous inference providers while preserving deterministic "
    "billing, prompt prefix caching, TLS transport integrity, structured audit "
    "logs, circuit breaking, and strict token accounting. Every request header, "
    "cache breakpoint, stop sequence, and stream frame must pass through without "
    "silently inflating cached prompt tokens or dropping usage metadata. "
    "Operators validate health by measuring round-trip latency, arithmetic "
    "correctness, cache read ratios, and cross-round token stability across "
    "cold-write and warm-read pairs separated by a short settlement window.\n"
)
CANARY_PREFIX = "\n".join(_SECTION.format(idx=i) for i in range(1, 22))

PROBES = [
    {
        "key": "claude_sonnet",
        "model": "claude-sonnet-5-5",
        "protocol": "anthropic",
        "every_hours": 1,
        "hb_env": "HB_CLAUDE_SONNET",
    },
    {
        "key": "claude_opus",
        "model": "claude-opus-5-5",
        "protocol": "anthropic",
        "every_hours": 2,
        "hb_env": "HB_CLAUDE_OPUS",
    },
    {
        "key": "gpt_sol",
        "model": "gpt-6.1-sol",
        "protocol": "openai",
        "every_hours": 1,
        "hb_env": "HB_GPT_SOL",
    },
    {
        "key": "deepseek_flash",
        "model": "deepseek-v4.1-flash",
        "protocol": "openai",
        "every_hours": 1,
        "hb_env": "HB_DEEPSEEK_FLASH",
    },
]


def load_env(path: Path) -> dict:
    env = dict(os.environ)
    if path.exists():
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def extract_usage(protocol: str, body: dict) -> dict:
    """Normalize input/cache tokens across Anthropic, OpenAI, and DeepSeek formats."""
    u = body.get("usage") or {}
    if protocol == "anthropic":
        inp = int(u.get("input_tokens") or 0)
        cc = int(u.get("cache_creation_input_tokens") or 0)
        cr = int(u.get("cache_read_input_tokens") or 0)
        total_in = inp + cc + cr
        out = int(u.get("output_tokens") or 0)
        return {"total_in": total_in, "cache_read": cr, "cache_write": cc, "output": out}

    # OpenAI / DeepSeek chat completions
    prompt = int(u.get("prompt_tokens") or 0)
    details = u.get("prompt_tokens_details") or {}
    cr = int(
        details.get("cached_tokens")
        or u.get("prompt_cache_hit_tokens")
        or u.get("cache_read_input_tokens")
        or 0
    )
    cc = int(u.get("cache_creation_input_tokens") or 0)
    # Guard Anthropic-semantic upstreams wrapped in OpenAI response shape
    total_in = (prompt + cr + cc) if (cr > 0 and prompt < cr) else prompt
    out = int(u.get("completion_tokens") or 0)
    return {"total_in": total_in, "cache_read": cr, "cache_write": cc, "output": out}


def extract_text(protocol: str, body: dict) -> str:
    if protocol == "anthropic":
        parts = body.get("content") or []
        return " ".join(p.get("text", "") for p in parts if isinstance(p, dict)).strip()
    choices = body.get("choices") or []
    if not choices:
        return ""
    msg = choices[0].get("message") or {}
    return str(msg.get("content") or "").strip()


def evaluate_pair(r1: dict, r2: dict, baseline_tokens: int | None = None) -> dict:
    """Evaluate liveness, real caching, and 1.00x token integrity for a 2-round probe."""
    alive_ok = bool(r1.get("answer_ok") and r2.get("answer_ok"))
    t1 = int(r1.get("total_in") or 0)
    t2 = int(r2.get("total_in") or 0)
    cr2 = int(r2.get("cache_read") or 0)

    cache_hit_ratio = round(cr2 / t2, 4) if t2 > 0 else 0.0
    cache_ok = t2 >= 500 and cache_hit_ratio >= 0.65

    round_ratio = round(t2 / t1, 4) if t1 > 0 else 0.0
    baseline_ratio = round(t2 / baseline_tokens, 4) if (baseline_tokens and baseline_tokens > 0) else 1.0
    # Integrity ratio captures worst deviation above/below 1.00x
    integrity_ratio = (
        round_ratio
        if abs(round_ratio - 1.0) >= abs(baseline_ratio - 1.0)
        else baseline_ratio
    )
    integrity_ok = (
        t1 > 0
        and t2 > 0
        and 0.95 <= round_ratio <= 1.05
        and 0.92 <= baseline_ratio <= 1.08
    )

    passed = alive_ok and cache_ok and integrity_ok
    reasons = []
    if not alive_ok:
        reasons.append("liveness_failed")
    if not cache_ok:
        reasons.append(f"cache_miss({cache_hit_ratio:.1%})")
    if not integrity_ok:
        reasons.append(f"token_drift(r2/r1={round_ratio:.3f},base={baseline_ratio:.3f})")

    return {
        "passed": passed,
        "alive_ok": alive_ok,
        "cache_ok": cache_ok,
        "integrity_ok": integrity_ok,
        "total_in_r1": t1,
        "total_in_r2": t2,
        "cache_read_r2": cr2,
        "cache_hit_ratio": cache_hit_ratio,
        "round_ratio": round_ratio,
        "integrity_ratio": integrity_ratio,
        "latency_ms_r1": r1.get("latency_ms", 0),
        "latency_ms_r2": r2.get("latency_ms", 0),
        "reasons": reasons,
    }


def call_model(base_url: str, api_key: str, protocol: str, model: str, a: int, b: int) -> dict:
    question = f"Compute {a} + {b}. Reply with ONLY the integer sum."
    expected = str(a + b)
    if protocol == "anthropic":
        url = base_url.rstrip("/") + "/v1/messages"
        payload = {
            "model": model,
            "max_tokens": 24,
            "system": [
                {
                    "type": "text",
                    "text": CANARY_PREFIX,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            "messages": [{"role": "user", "content": question}],
        }
        headers = {
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "Authorization": f"Bearer {api_key}",
            "anthropic-version": "2023-06-01",
            "User-Agent": "bozzii-canary/1.0",
        }
    else:
        url = base_url.rstrip("/") + "/v1/chat/completions"
        payload = {
            "model": model,
            "max_tokens": 24,
            "messages": [
                {"role": "system", "content": CANARY_PREFIX},
                {"role": "user", "content": question},
            ],
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "User-Agent": "bozzii-canary/1.0",
        }

    t0 = time.monotonic()
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            ms = int((time.monotonic() - t0) * 1000)
            body = json.loads(resp.read().decode("utf-8"))
            text = extract_text(protocol, body)
            usage = extract_usage(protocol, body)
            return {
                "http_status": resp.status,
                "latency_ms": ms,
                "answer_ok": expected in text,
                **usage,
            }
    except urllib.error.HTTPError as e:
        ms = int((time.monotonic() - t0) * 1000)
        return {
            "http_status": e.code,
            "latency_ms": ms,
            "answer_ok": False,
            "error": f"HTTP {e.code}",
            "total_in": 0,
            "cache_read": 0,
        }
    except Exception as e:
        ms = int((time.monotonic() - t0) * 1000)
        return {
            "http_status": 0,
            "latency_ms": ms,
            "answer_ok": False,
            "error": type(e).__name__,
            "total_in": 0,
            "cache_read": 0,
        }


def ping_heartbeat(url: str, fail: bool = False) -> int:
    if not url:
        return 0
    target = url.rstrip("/") + ("/fail" if fail else "")
    req = urllib.request.Request(
        target,
        method="POST" if fail else "GET",
        headers={"User-Agent": "bozzii-canary/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return -1


def notify_feishu(webhook: str, title: str, lines: list[str]) -> None:
    if not webhook:
        return
    payload = {
        "msg_type": "text",
        "content": {"text": f"[Bozzii Canary] {title}\n" + "\n".join(lines)},
    }
    req = urllib.request.Request(
        webhook,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=10).read()
    except Exception:
        pass


def atomic_write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.chmod(tmp, 0o644)
    os.replace(tmp, path)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--env", default="/opt/ops/bozzii-canary/.env")
    ap.add_argument("--state", default="/opt/ops/bozzii-canary/canary_state.json")
    ap.add_argument("--force-all", action="store_true")
    ap.add_argument("--dry-run", action="store_true", help="Run probes without pinging Better Stack")
    args = ap.parse_args()

    env = load_env(Path(args.env))
    base_url = env.get("BOZZII_BASE_URL", "https://api.bozzii.com")
    api_key = env.get("BOZZII_API_KEY", "")
    feishu = env.get("FEISHU_WEBHOOK_URL", "")
    if not api_key:
        print("ERROR: BOZZII_API_KEY missing in env", file=sys.stderr)
        return 2

    state_path = Path(args.state)
    state = {"models": {}, "integrity": {}, "updated_at": None}
    if state_path.exists():
        try:
            state = json.loads(state_path.read_text(encoding="utf-8"))
        except Exception:
            pass
    state.setdefault("models", {})

    now = dt.datetime.now(dt.timezone.utc)
    now_iso = now.replace(microsecond=0).isoformat().replace("+00:00", "Z")
    ran_models = []
    alerts = []

    for spec in PROBES:
        key = spec["key"]
        model = spec["model"]
        if not args.force_all and (now.hour % spec["every_hours"] != 0):
            continue

        prev = state["models"].get(model) or {}
        baseline = prev.get("baseline_tokens")

        a1, b1 = random.randint(12, 48), random.randint(12, 48)
        a2, b2 = random.randint(51, 89), random.randint(11, 49)

        r1 = call_model(base_url, api_key, spec["protocol"], model, a1, b1)
        time.sleep(3)
        r2 = call_model(base_url, api_key, spec["protocol"], model, a2, b2)

        ev = evaluate_pair(r1, r2, baseline_tokens=baseline)
        # Calibrate baseline on first clean pass
        if ev["passed"] and not baseline and ev["total_in_r2"] >= 500:
            baseline = ev["total_in_r2"]

        consec = 0 if ev["passed"] else int(prev.get("consecutive_failures") or 0) + 1
        hb_status = 0
        hb_url = env.get(spec["hb_env"], "")
        if not args.dry_run and hb_url:
            if ev["passed"]:
                hb_status = ping_heartbeat(hb_url, fail=False)
            elif consec >= 2:
                hb_status = ping_heartbeat(hb_url, fail=True)

        if not ev["passed"]:
            alerts.append(
                f"{model}: FAIL ({','.join(ev['reasons'])}) consec={consec}"
            )

        record = {
            "model": model,
            "key": key,
            "checked_at": now_iso,
            "passed": ev["passed"],
            "alive_ok": ev["alive_ok"],
            "cache_ok": ev["cache_ok"],
            "integrity_ok": ev["integrity_ok"],
            "cache_hit_ratio": ev["cache_hit_ratio"],
            "integrity_ratio": ev["integrity_ratio"],
            "round_ratio": ev["round_ratio"],
            "total_in_r1": ev["total_in_r1"],
            "total_in_r2": ev["total_in_r2"],
            "cache_read_r2": ev["cache_read_r2"],
            "latency_ms_r1": ev["latency_ms_r1"],
            "latency_ms_r2": ev["latency_ms_r2"],
            "baseline_tokens": baseline,
            "consecutive_failures": consec,
            "reasons": ev["reasons"],
        }
        state["models"][model] = record
        ran_models.append(record)
        print(
            f"[{now_iso}] {model}: pass={ev['passed']} "
            f"cache={ev['cache_hit_ratio']:.1%} ratio={ev['integrity_ratio']:.3f} "
            f"r1={ev['total_in_r1']} r2={ev['total_in_r2']}(cr={ev['cache_read_r2']}) "
            f"ms={ev['latency_ms_r1']}/{ev['latency_ms_r2']} hb={hb_status} reasons={ev['reasons']}"
        )

    # Aggregate billing integrity across probed models with valid usage
    valid_runs = [m for m in ran_models if m["total_in_r1"] > 0 and m["total_in_r2"] > 0]
    inflated = [m for m in valid_runs if not m["integrity_ok"]]
    integrity_pass = len(valid_runs) >= 2 and len(inflated) == 0
    hb_int_url = env.get("HB_BILLING_INTEGRITY", "")
    hb_int_status = 0
    if not args.dry_run and hb_int_url:
        if integrity_pass:
            hb_int_status = ping_heartbeat(hb_int_url, fail=False)
        elif inflated:
            hb_int_status = ping_heartbeat(hb_int_url, fail=True)

    state["integrity"] = {
        "checked_at": now_iso,
        "passed": integrity_pass,
        "probed_count": len(valid_runs),
        "max_ratio": max((m["integrity_ratio"] for m in valid_runs), default=1.0),
        "inflated_models": [m["model"] for m in inflated],
    }
    state["updated_at"] = now_iso
    atomic_write_json(state_path, state)
    print(f"[{now_iso}] billing_integrity: pass={integrity_pass} max_ratio={state['integrity']['max_ratio']:.3f} hb={hb_int_status}")

    if alerts:
        notify_feishu(feishu, "探针异常告警", alerts)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
