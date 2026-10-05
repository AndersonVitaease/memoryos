#!/usr/bin/env python3
"""SNAPSHOT-FAST-01 — E2E real do mission_snapshot com 1 canário descartável.

Uso (supervisor Hermes / operator — NÃO de dentro de um pane de missão sem badge):
    python3 /root/.hermes/plugins/mission-ops/provas/snapshot-fast-01/run_e2e.py

Passos: gate de cadeia ANTES (recusa = nada é despachado, exit 3) -> handle_mission_dispatch
direto (engine=openrouter: 8103, zero GPU/vast) -> mission_snapshot(canário) até OK com
claude vivo -> tab close do canário (mata o pane) -> mission_snapshot -> FANTASMA cancelado
-> mission_close acceptUnverified. Grava e2e-result.json; collect_e2e.py valida (exit 0).
Custo: 1 turno trivial no worker 8103 = centavos. Zero restart.
"""
import importlib.util
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
PLUGIN = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(HERE, "e2e-result.json")
MID = "snapshot-fast-01-canario"
CDIR = "/tmp/sf01-canario"

spec = importlib.util.spec_from_file_location("mission_ops", os.path.join(PLUGIN, "__init__.py"),
                                              submodule_search_locations=[PLUGIN])
m = importlib.util.module_from_spec(spec)
sys.modules["mission_ops"] = m
spec.loader.exec_module(m)
mc = m.mc


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def dump(res, code):
    res["finishedAt"] = now()
    json.dump(res, open(OUT, "w"), ensure_ascii=False, indent=2)
    print(json.dumps(res, ensure_ascii=False, indent=2))
    sys.exit(code)


def snap():
    t = time.time()
    r = json.loads(m.handle_mission_snapshot({"missionId": MID}))
    row = (r.get("missions") or [{}])[0]
    return {"at": now(), "callSeconds": round(time.time() - t, 3), "verdict": row.get("verdict"),
            "pane": row.get("pane"), "remedy": row.get("remedy"), "fixed": r.get("fixed"),
            "ghosts": r.get("ghosts"), "error": r.get("error")}


res = {"mission": "snapshot-fast-01", "canary": MID, "startedAt": now(),
       "caller_pane": os.environ.get("HERDR_PANE_ID") or None}

g = mc.chain_gate(MID, None, os.environ.get("HERDR_PANE_ID"))
if g["verdict"] != "accepted":
    res.update(blocked=True, refused=f"{g['reason']}: {g['detail']}",
               note="gate de cadeia recusou — rode do supervisor/operator")
    dump(res, 3)
prev = mc.load_ledger(MID)
if prev and prev.get("status") not in mc.TERMINAL_STATUSES:
    res.update(blocked=True, refused=f"canário já ativo ({prev.get('status')}) — feche antes")
    dump(res, 3)

os.makedirs(CDIR, exist_ok=True)
prompt = os.path.join(CDIR, "canario.md")
with open(prompt, "w", encoding="utf-8") as f:
    f.write("# canário SNAPSHOT-FAST-01\nconsequence: false\n\n"
            "Responda exatamente `CANARIO-SNAPSHOT OK` e pare. Não rode ferramentas.\n")

# 1. dispatch real direto
t0 = time.time()
d = json.loads(m.handle_mission_dispatch({"missionId": MID, "promptFile": prompt, "cwd": CDIR,
                                          "consequence": False, "engine": "openrouter"}))
res["dispatch"] = {"seconds": round(time.time() - t0, 2), "ok": d.get("ok"),
                   "status": d.get("status"), "paneId": d.get("paneId"), "tabId": d.get("tabId"),
                   "error": d.get("error"), "detail": d.get("detail")}
if not d.get("ok") or not d.get("tabId"):
    dump(res, 1)

# 2. canário vivo -> OK (claude no foreground)
res["snapshot_alive"] = None
deadline = time.time() + 60
while time.time() < deadline:
    s = snap()
    res["snapshot_alive"] = s
    if s["verdict"] == "OK" and (s.get("pane") or {}).get("agent") == "claude":
        break
    time.sleep(3)

# 3. mata o pane (tab close) -> FANTASMA cancelado
tab = d["tabId"]
res["kill"] = {"at": now(), "tabId": tab, "error": mc.tab_close(tab)}
for _ in range(10):
    if mc.pane_exists(d["paneId"]) is False:
        break
    time.sleep(1)
res["kill"]["paneGone"] = mc.pane_exists(d["paneId"]) is False
res["snapshot_dead"] = snap()
led = mc.load_ledger(MID) or {}
res["ledger_after_snapshot"] = {k: led.get(k) for k in
                                ("status", "cancelledBy", "cancelReason", "previousStatus")}
evs = []
try:
    with open(mc.STATE_DIR / "events.jsonl", encoding="utf-8") as f:
        evs = [json.loads(l) for l in f if f'"{MID}"' in l]
except OSError:
    pass
res["ghost_event"] = next((e for e in reversed(evs) if e.get("event") == "snapshot_ghost_cancelled"), None)

# 4. fecha o canário (descartável)
c = json.loads(m.handle_mission_close({
    "missionId": MID, "acceptUnverified": "canário descartável SNAPSHOT-FAST-01 (E2E do snapshot)"}))
res["close"] = {"ok": c.get("ok"), "error": c.get("error"),
                "status": (mc.load_ledger(MID) or {}).get("status")}
dump(res, 0)
