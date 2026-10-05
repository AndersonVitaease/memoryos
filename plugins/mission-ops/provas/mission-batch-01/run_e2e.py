#!/usr/bin/env python3
"""MISSION-BATCH-01 — E2E real: 1 lote (mission_batch) com 2 canários descartáveis.

Uso (supervisor Hermes / operator — NÃO de dentro de um pane de missão sem badge):
    python3 /root/.hermes/plugins/mission-ops/provas/mission-batch-01/run_e2e.py

Passos: gate de cadeia checado ANTES (recusa = nada é despachado, exit 3) -> credits antes
-> handle_mission_batch(lote-canarios.json) numa chamada -> observa os 2 panes (vivo +
agent_status working/idle/done + resposta CANARIO-X OK) por até 90s -> mission_close
acceptUnverified nos 2 -> credits depois. Grava e2e-result.json ao lado; collect_e2e.py valida.
Custo: 2 turnos triviais no gpt-oss-120b (8103) = centavos. Zero GPU/vast, zero restart.
"""
import importlib.util
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
PLUGIN = os.path.abspath(os.path.join(HERE, "..", ".."))
MANIFEST = os.path.join(HERE, "lote-canarios.json")
OUT = os.path.join(HERE, "e2e-result.json")

spec = importlib.util.spec_from_file_location("mission_ops", os.path.join(PLUGIN, "__init__.py"),
                                              submodule_search_locations=[PLUGIN])
m = importlib.util.module_from_spec(spec)
sys.modules["mission_ops"] = m
spec.loader.exec_module(m)
mc = m.mc


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def credits(tag):
    path = os.path.join(HERE, f"credits-e2e-{tag}.json")
    r = subprocess.run([sys.executable, os.path.join(HERE, "credits.py"), path],
                       capture_output=True, text=True, timeout=30)
    return {"at": now(), "file": path, "line": (r.stdout or r.stderr).strip()[-200:]}


def dump(res, code):
    json.dump(res, open(OUT, "w"), ensure_ascii=False, indent=2)
    print(json.dumps(res, ensure_ascii=False, indent=2))
    sys.exit(code)


items = json.load(open(MANIFEST))["missions"]
res = {"mission": "mission-batch-01", "startedAt": now(), "manifest": MANIFEST,
       "caller_pane": os.environ.get("HERDR_PANE_ID") or None}

# 1. governança: o gate do dispatch decidiria igual — aqui só evita despachar metade
gates = {it["missionId"]: mc.chain_gate(it["missionId"], None, os.environ.get("HERDR_PANE_ID"))
         for it in items}
refused = {k: f"{g['reason']}: {g['detail']}" for k, g in gates.items() if g["verdict"] != "accepted"}
if refused:
    res.update(blocked=True, refused=refused, note="gate de cadeia recusou — rode do supervisor/operator")
    dump(res, 3)

res["credits_before"] = credits("before")

# 2. UMA chamada para o lote inteiro
t0 = time.time()
summary = json.loads(m.handle_mission_batch({"manifest": MANIFEST}))
res["batch_call_seconds"] = round(time.time() - t0, 2)
res["summary"] = summary

# 3. panes vivos/working + resposta do canário
obs = {}
panes_by_mid = {r["missionId"]: r.get("paneId") for r in summary.get("itens", []) if r.get("paneId")}
deadline = time.time() + 90
while time.time() < deadline:
    plist, _ = mc.pane_list()
    by_id = {p.get("pane_id"): p for p in (plist or [])}
    for mid, pane in panes_by_mid.items():
        o = obs.setdefault(mid, {"paneId": pane, "alive": False, "statuses": [], "answer": False})
        p = by_id.get(pane)
        o["alive"] = p is not None
        st = (p or {}).get("agent_status")
        if st and st not in o["statuses"]:
            o["statuses"].append(st)
        text, _ = mc.read_output(pane, lines=80)
        tag = "CANARIO-" + mid.rsplit("-", 1)[-1].upper() + " OK"
        if text and tag in text and not o["answer"]:
            o["answer"] = True
            o["answerAt"] = now()
    if obs and all(o["answer"] for o in obs.values()):
        break
    time.sleep(3)
res["observed"] = obs

# 4. fecha os canários (descartáveis, sem verify.json)
res["close"] = {}
for mid in panes_by_mid:
    c = json.loads(m.handle_mission_close({
        "missionId": mid, "acceptUnverified": "canário descartável MISSION-BATCH-01 (E2E do lote)"}))
    res["close"][mid] = {"ok": c.get("ok"), "status": (mc.load_ledger(mid) or {}).get("status"),
                         "error": c.get("error")}

res["credits_after"] = credits("after")
res["finishedAt"] = now()
dump(res, 0 if summary.get("ok") else 1)
