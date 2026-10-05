"""TRINITY-WIRE-01: advisor and supervisor checkpoints with liveness tracking.

Two checkpoints in the mission cycle:
  1. ADVISOR — called when a decision is ambiguous (JEV fail-open).
     POST http://127.0.0.1:8103/v1/advisor with decision context.
  2. SUPERVISOR — called on mission_close for class>=media BEFORE deliver_verify.
     POST http://127.0.0.1:8103/v1/supervisor with report summary.

Both use HTTP with 5s timeout, fail-open ALWAYS (never block the mission).
Trail: /opt/mission-events/trinity-calls.jsonl
Ledger roles block: roles:{worker:{model,calls}, advisor:{model,calls},
  supervisor:{model,calls}, judge:{model,calls}} — zero calls = explicit 0.
"""
from __future__ import annotations

import json
import os
import time
from typing import Any, Dict, Optional

import urllib.request
import urllib.error

ADVISOR_URL = "http://127.0.0.1:8103/v1/advisor"
SUPERVISOR_URL = "http://127.0.0.1:8103/v1/supervisor"
TRAIL_PATH = "/opt/mission-events/trinity-calls.jsonl"
TIMEOUT_S = 5

ROLES_KEY = "roles"
ROLE_MODELS = {
    "worker": {"model": "", "calls": 0},
    "advisor": {"model": "nex-n2.5-pro", "calls": 0},
    "supervisor": {"model": "nex-n2.5-pro", "calls": 0},
    "judge": {"model": "", "calls": 0},
}


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


# ---------------------------------------------------------------- trail

def record_call(mission_id: str, role: str, endpoint: str,
                tokens: int = 0, latency_ms: int = 0,
                outcome: str = "ok") -> None:
    """Append a trinity call entry to the trail file. Best-effort, never raises."""
    entry = {
        "ts": _now_iso(),
        "missionId": mission_id,
        "role": role,
        "endpoint": endpoint,
        "tokens": tokens,
        "latencyMs": latency_ms,
        "outcome": outcome,
    }
    try:
        os.makedirs(os.path.dirname(TRAIL_PATH), exist_ok=True)
        fd = os.open(TRAIL_PATH, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        try:
            os.write(fd, (json.dumps(entry, ensure_ascii=False) + "\n").encode())
        finally:
            os.close(fd)
    except OSError:
        pass


# ---------------------------------------------------------------- HTTP

def _http_post(url: str, body: Dict[str, Any],
               timeout_s: float = TIMEOUT_S) -> tuple[Optional[Dict[str, Any]], Optional[str], int]:
    """POST JSON body to url. Returns (response_dict, error, latency_ms)."""
    t0 = time.monotonic()
    try:
        data = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(url, data=data,
                                      headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            raw = resp.read().decode("utf-8", "replace")
            latency = int((time.monotonic() - t0) * 1000)
            try:
                return json.loads(raw), None, latency
            except json.JSONDecodeError:
                return {"raw": raw}, None, latency
    except urllib.error.URLError as e:
        return None, str(e), int((time.monotonic() - t0) * 1000)
    except Exception as e:
        return None, str(e), int((time.monotonic() - t0) * 1000)


# ---------------------------------------------------------------- advisor checkpoint

def consult_advisor(context: Dict[str, Any], mission_id: str = "",
                    timeout_s: float = TIMEOUT_S) -> Dict[str, Any]:
    """POST to advisor endpoint. Returns {ok, recommendation, latencyMs}
    or {ok: False, error} on failure/timeout (fail-open)."""
    body = {"context": context, "missionId": mission_id}
    resp, err, latency = _http_post(ADVISOR_URL, body, timeout_s)
    if err or resp is None:
        record_call(mission_id, "advisor", ADVISOR_URL,
                    latency_ms=latency, outcome="skipped")
        return {"ok": False, "error": err or "no response", "latencyMs": latency}
    record_call(mission_id, "advisor", ADVISOR_URL,
                tokens=resp.get("tokens", 0), latency_ms=latency, outcome="ok")
    return {"ok": True, "recommendation": resp, "latencyMs": latency}


# ---------------------------------------------------------------- supervisor checkpoint

def consult_supervisor(summary: str, verdict: str, proofs: list,
                       mission_id: str = "",
                       timeout_s: float = TIMEOUT_S) -> Dict[str, Any]:
    """POST to supervisor endpoint. Returns {ok, advisory, latencyMs}
    or {ok: False, error} on failure/timeout (fail-open, proceed without advisory)."""
    body = {"summary": summary, "verdict": verdict,
            "proofs": proofs, "missionId": mission_id}
    resp, err, latency = _http_post(SUPERVISOR_URL, body, timeout_s)
    if err or resp is None:
        record_call(mission_id, "supervisor", SUPERVISOR_URL,
                    latency_ms=latency, outcome="skipped")
        return {"ok": False, "error": err or "no response", "latencyMs": latency}
    record_call(mission_id, "supervisor", SUPERVISOR_URL,
                tokens=resp.get("tokens", 0), latency_ms=latency, outcome="ok")
    return {"ok": True, "advisory": resp, "latencyMs": latency}


# ---------------------------------------------------------------- ledger roles

def update_ledger_roles(ledger: Dict[str, Any], role: str,
                        model: str, calls: int) -> None:
    """Update the roles count in the ledger. Creates the roles block if absent."""
    ledger.setdefault(ROLES_KEY, {})
    ledger[ROLES_KEY][role] = {"model": model, "calls": calls}


def get_ledger_roles(ledger: Dict[str, Any]) -> Dict[str, Any]:
    """Get the roles block from the ledger, with zero defaults for missing roles."""
    roles = ledger.get(ROLES_KEY, {})
    result = {}
    for role, default in ROLE_MODELS.items():
        entry = roles.get(role, default)
        result[role] = {
            "model": entry.get("model", default["model"]),
            "calls": entry.get("calls", 0),
        }
    return result


def increment_role_call(ledger: Dict[str, Any], role: str,
                        model: str = "") -> None:
    """Increment the call count for a role in the ledger."""
    roles = ledger.setdefault(ROLES_KEY, {})
    entry = roles.get(role, {"model": model, "calls": 0})
    entry["calls"] = entry.get("calls", 0) + 1
    if model:
        entry["model"] = model
    roles[role] = entry


# ---------------------------------------------------------------- mission-class helper

MISSION_CLASS_ORDER = ["mecanica", "media", "alta", "critica"]


def mission_class_at_least_medium(ledger: Dict[str, Any]) -> bool:
    """True if the mission class is >= medium (media, alta, critica).
    Missing or unknown class defaults to False (class < medium)."""
    cls = str(ledger.get("mission_class") or ledger.get("class") or "").strip().lower()
    return cls in ("media", "alta", "critica", "high", "critical")
