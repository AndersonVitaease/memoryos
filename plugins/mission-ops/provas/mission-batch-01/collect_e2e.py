#!/usr/bin/env python3
"""MISSION-BATCH-01: valida o e2e-result.json gravado pelo run_e2e.py. Exit 0 = E2E provado:
(a) 1 chamada despachou os 2 canários (0 falhas) com tempos no resumo; (b) os 2 panes vivos e
com agent_status observado working/idle/done; (c) os 2 canários responderam; (d) os 2 fechados;
(e) credits antes/depois registrados."""
import json
import os
import sys

p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "e2e-result.json")
if not os.path.isfile(p):
    print("PENDENTE: e2e-result.json ausente — run_e2e.py não rodou")
    sys.exit(2)
r = json.load(open(p))
if r.get("blocked"):
    print("BLOQUEADO pelo gate de cadeia:", json.dumps(r.get("refused"), ensure_ascii=False))
    sys.exit(3)
s, obs, cl = r.get("summary", {}), r.get("observed", {}), r.get("close", {})
ok = {
    "a_batch": s.get("despachadas") == 2 and s.get("falhas") == 0
               and isinstance(s.get("tempoTotalS"), (int, float)) and len(s.get("tempoPorMissao", {})) == 2,
    "b_panes": len(obs) == 2 and all(o.get("alive") or o.get("answer") for o in obs.values())
               and all(set(o.get("statuses") or []) & {"working", "idle", "done"} for o in obs.values()),
    "c_answer": len(obs) == 2 and all(o.get("answer") for o in obs.values()),
    "d_closed": len(cl) == 2 and all(c.get("status") == "closed" for c in cl.values()),
    "e_credits": bool(r.get("credits_before", {}).get("line")) and bool(r.get("credits_after", {}).get("line")),
}
print(json.dumps({"verdict": ok, "tempoTotalS": s.get("tempoTotalS"),
                  "tempoPorMissao": s.get("tempoPorMissao")}, ensure_ascii=False))
sys.exit(0 if all(ok.values()) else 1)
