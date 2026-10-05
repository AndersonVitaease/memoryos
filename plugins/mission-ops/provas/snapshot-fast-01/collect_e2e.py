#!/usr/bin/env python3
"""Valida e2e-result.json do SNAPSHOT-FAST-01. exit 0 = E2E provado; imprime o veredito."""
import json
import os
import sys

p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "e2e-result.json")
try:
    r = json.load(open(p))
except (OSError, ValueError) as e:
    print(f"E2E NAO PROVADO: sem e2e-result.json ({e})")
    sys.exit(1)
mid = r.get("canary")
a, dd = r.get("snapshot_alive") or {}, r.get("snapshot_dead") or {}
checks = {
    "not_blocked": not r.get("blocked"),
    "dispatch_ok": (r.get("dispatch") or {}).get("ok") is True,
    "alive_verdict_OK": a.get("verdict") == "OK" and (a.get("pane") or {}).get("exists") is True,
    "alive_call_lt_5s": (a.get("callSeconds") or 99) < 5,
    "pane_killed": (r.get("kill") or {}).get("paneGone") is True,
    "dead_verdict_FANTASMA": dd.get("verdict") == "FANTASMA" and mid in (dd.get("ghosts") or []),
    "dead_call_lt_5s": (dd.get("callSeconds") or 99) < 5,
    "ledger_cancelled_by_snapshot": (r.get("ledger_after_snapshot") or {}).get("status") == "cancelled"
    and (r.get("ledger_after_snapshot") or {}).get("cancelledBy") == "mission_snapshot",
    "ghost_event": bool(r.get("ghost_event")),
    "canary_closed": (r.get("close") or {}).get("status") in ("closed", "cancelled"),
}
bad = [k for k, v in checks.items() if not v]
print(("E2E PROVADO" if not bad else "E2E NAO PROVADO: " + ", ".join(bad)) + " " + json.dumps(checks))
sys.exit(0 if not bad else 1)
