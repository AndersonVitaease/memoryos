#!/usr/bin/env python3
"""SNAPSHOT-FAST-01 — prova com herdr REAL (sem claude, sem dispatch, sem custo).
STATE_DIR temporário isolado (nenhum ledger real tocado). Aba shell própria:
 1) ledger aponta pane FALSO + aba MISSION:<id> real -> PANEID_OBSOLETO re-sincronizado
 2) pane real sem claude -> INTERROMPIDA (shell)
 3) tab close da própria aba -> FANTASMA cancelado. Grava real-herdr-probe.json."""
import importlib.util, json, os, sys, tempfile, time
from pathlib import Path
HERE = os.path.dirname(os.path.abspath(__file__))
PLUGIN = os.path.abspath(os.path.join(HERE, "..", ".."))
spec = importlib.util.spec_from_file_location("mission_ops", os.path.join(PLUGIN, "__init__.py"),
                                              submodule_search_locations=[PLUGIN])
m = importlib.util.module_from_spec(spec); sys.modules["mission_ops"] = m; spec.loader.exec_module(m)
mc = m.mc
tmp = tempfile.mkdtemp(prefix="sf01-probe-")
mc.STATE_DIR = Path(tmp) / "state"
m.ms = None  # sem supervisor por missão no ledger sintético
MID = "sf01-probe"
res = {"stateDir": str(mc.STATE_DIR)}

def snap():
    t = time.time(); r = json.loads(m.handle_mission_snapshot({"missionId": MID}))
    row = r["missions"][0]
    return {"callSeconds": round(time.time() - t, 3), "verdict": row["verdict"], "pane": row.get("pane"),
            "remedy": row["remedy"], "fixed": r["fixed"], "ghosts": r["ghosts"]}

tab, pane, err = mc.tab_create("/tmp", label=f"MISSION:{MID}")
res["tab"] = {"tabId": tab, "paneId": pane, "error": err}
try:
    mc.save_ledger({"missionId": MID, "status": "dispatched", "paneId": "w6:pSTALE",
                    "tabId": "w6:tSTALE", "cwd": "/tmp", "createdAt": mc._now(), "updatedAt": mc._now()})
    res["1_stale"] = snap()
    led = mc.load_ledger(MID)
    res["1_ledger"] = {"paneId": led["paneId"], "tabId": led["tabId"], "paneResync": led.get("paneResync")}
    res["2_shell"] = snap()
finally:
    res["kill"] = {"error": mc.tab_close(tab) if tab else "no tab"}
for _ in range(10):
    if mc.pane_exists(pane) is False:
        break
    time.sleep(0.5)
res["kill"]["paneGone"] = mc.pane_exists(pane) is False
res["3_dead"] = snap()
led = mc.load_ledger(MID)
res["3_ledger"] = {k: led.get(k) for k in ("status", "cancelledBy", "cancelReason", "previousStatus")}
res["events"] = [json.loads(l)["event"] for l in open(mc.STATE_DIR / "events.jsonl")]
res["proved"] = (res["1_stale"]["verdict"] == "PANEID_OBSOLETO" and res["1_stale"]["fixed"] == [MID]
                 and res["1_ledger"]["paneId"] == pane and res["2_shell"]["verdict"] == "INTERROMPIDA"
                 and res["kill"]["paneGone"] and res["3_dead"]["verdict"] == "FANTASMA"
                 and res["3_ledger"]["status"] == "cancelled")
json.dump(res, open(os.path.join(HERE, "real-herdr-probe.json"), "w"), ensure_ascii=False, indent=2)
print(json.dumps(res, ensure_ascii=False, indent=1))
sys.exit(0 if res["proved"] else 1)
