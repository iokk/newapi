#!/usr/bin/env python3
"""Unit self-checks for Bozzii canary probe & telemetry aggregator."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import canary_probe as cp
import telemetry_agg as ta

# 1. Anthropic usage normalization
u_ant = cp.extract_usage(
    "anthropic",
    {"usage": {"input_tokens": 25, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 2175, "output_tokens": 4}},
)
assert u_ant == {"total_in": 2200, "cache_read": 2175, "cache_write": 0, "output": 4}, u_ant

# 2. OpenAI & DeepSeek usage normalization
u_oai = cp.extract_usage(
    "openai",
    {"usage": {"prompt_tokens": 2200, "prompt_tokens_details": {"cached_tokens": 2048}, "completion_tokens": 4}},
)
assert u_oai["total_in"] == 2200 and u_oai["cache_read"] == 2048, u_oai

u_ds = cp.extract_usage(
    "openai",
    {"usage": {"prompt_tokens": 2200, "prompt_cache_hit_tokens": 2112, "completion_tokens": 4}},
)
assert u_ds["total_in"] == 2200 and u_ds["cache_read"] == 2112, u_ds

# 3. Clean 1.00x cached run passes
ev_ok = cp.evaluate_pair(
    {"answer_ok": True, "total_in": 2200, "cache_read": 0, "latency_ms": 900},
    {"answer_ok": True, "total_in": 2205, "cache_read": 2150, "latency_ms": 420},
    baseline_tokens=2200,
)
assert ev_ok["passed"] and ev_ok["cache_ok"] and ev_ok["integrity_ok"], ev_ok

# 4. 1.30x cached token inflation fails integrity immediately
ev_bloat = cp.evaluate_pair(
    {"answer_ok": True, "total_in": 2200, "cache_read": 0, "latency_ms": 900},
    {"answer_ok": True, "total_in": 2860, "cache_read": 2700, "latency_ms": 420},
    baseline_tokens=2200,
)
assert not ev_bloat["passed"] and not ev_bloat["integrity_ok"], ev_bloat
assert ev_bloat["integrity_ratio"] >= 1.29, ev_bloat

# 5. Fake cache (0 cached tokens) fails cache check
ev_nocache = cp.evaluate_pair(
    {"answer_ok": True, "total_in": 2200, "cache_read": 0, "latency_ms": 900},
    {"answer_ok": True, "total_in": 2200, "cache_read": 0, "latency_ms": 910},
    baseline_tokens=2200,
)
assert not ev_nocache["passed"] and not ev_nocache["cache_ok"], ev_nocache

# 6. Public telemetry payload strips secrets and merges canary info
pub = ta.build_public_payload(
    [{"model": "claude-sonnet-5-5", "ok_requests": 3000, "success_rate_pct": 99.1, "p50_latency_s": 8.2, "cache_hit_rate_pct": 78.5}],
    {"integrity": {"passed": True, "max_ratio": 1.002}, "models": {"claude-sonnet-5-5": {"checked_at": "2026-11-21T09:00:00Z", "passed": True, "cache_hit_ratio": 0.96, "integrity_ratio": 1.002, "latency_ms_r2": 420}}},
)
raw_pub = json.dumps(pub)
assert "sk-" not in raw_pub and "heartbeat" not in raw_pub
assert pub["models"]["claude-sonnet-5-5"]["canary"]["passed"] is True
assert pub["models"]["claude-sonnet-5-5"]["canary"]["cache_hit_pct"] == 96.0

print("ALL MONITORING SELF-CHECKS PASSED (6/6)")
