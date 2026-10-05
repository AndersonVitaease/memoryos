"""SUPERVISOR-VERIFY-01 — gate de canal-do-operator + gatilho verify no mission_close.

Componentes (usados pelo mission_close em __init__.py — a lógica do gate vive lá,
passos 0/0.5; este módulo só fornece os primitivos):
  run_channel_proof(channel)      — prova de uso no CANAL REAL do operator (URL curl; dict
                                    opcional {url, expect_status, method}). Read-only.
  run_verify(mission)             — roda /opt/deliver-verify/verify.py (zero-LLM) e devolve o
                                    resultado JSON (manifest verify.json do cwd da missão ou
                                    bateria inferida por tipo de entrega).
  emit_bus_event(kind, id, detail) — evento no spool do supervisor (best-effort).
Zero LLM; read-only fora do ledger (relatório verify/<id>.json é a única escrita nova).
"""
from __future__ import annotations

import json
import os
import subprocess
from datetime import datetime, timezone


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


from typing import Any, Dict, Optional, Tuple

VERIFY_RUNNER = "/opt/deliver-verify/verify.py"
STATE_DIR = "/root/.hermes/mission-state"
SPOOL = "/opt/mission-events/spool.jsonl"
MAX_BYTES = 10 * 1024  # anti-crash


def _sh(cmd, timeout):
    try:
        p = subprocess.run(cmd, shell=isinstance(cmd, str), capture_output=True, timeout=timeout)
        return (p.returncode, (p.stdout or b"")[:MAX_BYTES].decode("utf-8", "replace"))
    except subprocess.TimeoutExpired:
        return (124, "")
    except Exception as e:
        return (1, "exec error: %s" % e)


def run_channel_proof(channel: Any) -> Tuple[bool, Dict[str, Any]]:
    """Prova o canal REAL do operator. String URL ou {url, expect_status}. Read-only (GET)."""
    if isinstance(channel, str):
        spec = {"url": channel.strip()}
    elif isinstance(channel, dict):
        spec = dict(channel)
    else:
        return False, {"error": "operator_channel inválido (use URL ou {url, expect_status})"}
    url = spec.get("url")
    if not url:
        return False, {"error": "operator_channel sem url"}
    expect = int(spec.get("expect_status") or 0)  # 0 = só exige canal vivo (status < 500)
    code, out = _sh(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}",
                     "--max-time", "10", url], 15)
    try:
        actual = int((out or "").strip() or 0)
    except ValueError:
        actual = 0
    alive = code == 0 and 0 < actual < 500
    if expect:
        ok = code == 0 and actual == expect
        why = "HTTP %s (esperado %s)" % (actual, expect) if not ok else ""
    else:
        ok = alive
        why = "" if alive else "canal morto/inacessível (HTTP %s, exit %s)" % (actual, code)
    return ok, {"url": url, "status": actual, "error": why}


def run_verify(mission_id: str, manifest: Optional[str] = None,
               ledger_dir: str = STATE_DIR) -> Dict[str, Any]:
    """Roda o runner determinístico e devolve o veredito estruturado."""
    if not os.path.isfile(VERIFY_RUNNER):
        return {"missionId": mission_id, "source": "none", "verdict": "fail",
                "checks": [], "error": "runner ausente: %s" % VERIFY_RUNNER,
                "ts": "", "durationMs": 0}
    cmd = ["python3", VERIFY_RUNNER, "--mission", mission_id, "--ledger-dir", ledger_dir]
    if manifest:
        cmd += ["--manifest", str(manifest)]
    code, out = _sh(cmd, 330)
    try:
        return json.loads(out)
    except Exception:
        return {"missionId": mission_id, "source": "error", "verdict": "fail", "checks": [],
                "error": "verify.py exit %s: %s" % (code, out[:300]), "ts": "", "durationMs": 0}


def emit_bus_event(kind: str, mission_id: str, detail: str) -> None:
    """Evento no spool do supervisor Hermes (best-effort, fire-and-forget)."""
    try:
        line = json.dumps({"ts": _now(), "kind": kind, "missionId": mission_id,
                           "detail": str(detail)[:400]}, ensure_ascii=False) + "\n"
        os.makedirs(os.path.dirname(SPOOL), exist_ok=True)
        with open(SPOOL, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass
