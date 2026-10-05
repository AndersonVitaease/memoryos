#!/usr/bin/env python3
"""RD-OBEY-02 — E2E do aceite (item 6 do contrato), mecanismo ponta a ponta:

  (A) VIOLAÇÃO FORÇADA: close sem relatório entregável → warning tipado
      violates-obligation-O1 → finding no bus → dívida tipada `obedience` P1 →
      intent dispatch_mission AUTOMÁTICO na fila → score desce.
  (B) CAMINHO FELIZ: sessão nova com sup_ack + zero violação = score 100%.

Estado 100% em tmp (env redirecionados); zero LLM; sai 0 só se todos os
checks passarem. Rodar: python3 prova_rd_obey_02.py
"""
from __future__ import annotations

import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import obey_registry as obr  # noqa: E402
import mission_debts as mdb  # noqa: E402

CHECKS = []


def check(name: str, cond: bool, detail: str = "") -> None:
    CHECKS.append((name, bool(cond), detail))
    print("  [%s] %s %s" % ("OK" if cond else "ERRO", name, detail))


def novo_env() -> dict:
    tmp = tempfile.mkdtemp(prefix="prova-rd-obey-02-")
    state = os.path.join(tmp, "state")
    os.makedirs(state, exist_ok=True)
    env = {
        "tmp": tmp,
        "state": state,
        "registry": os.path.join(tmp, "debts.jsonl"),
        "queue": os.path.join(tmp, "queue.jsonl"),
        "spool": os.path.join(tmp, "spool.jsonl"),
        "obedience": os.path.join(state, "obedience.jsonl"),
        "ack": os.path.join(state, "obey-ack.json"),
        "saved": {k: os.environ.get(k) for k in
                  ("MISSION_DEBTS_REGISTRY", "MISSION_ORCH_QUEUE", "MISSION_OPS_SPOOL",
                   "MISSION_OPS_STATE_DIR", "MISSION_DEBTS_BUS", "ORCH_DAEMON_APPROVED")},
    }
    return env


def aplicar(env: dict) -> None:
    os.environ["MISSION_DEBTS_REGISTRY"] = env["registry"]
    os.environ["MISSION_ORCH_QUEUE"] = env["queue"]
    os.environ["MISSION_OPS_SPOOL"] = env["spool"]
    os.environ["MISSION_OPS_STATE_DIR"] = env["state"]
    os.environ["MISSION_DEBTS_BUS"] = env["spool"]
    os.environ.pop("ORCH_DAEMON_APPROVED", None)


def restaurar(env: dict) -> None:
    for k, v in env["saved"].items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v


def bus_kinds(path: str) -> list:
    if not os.path.exists(path):
        return []
    return [json.loads(l).get("kind") for l in open(path, encoding="utf-8") if l.strip()]


def linhas_jsonl(path: str) -> list:
    if not os.path.exists(path):
        return []
    return [json.loads(l) for l in open(path, encoding="utf-8") if l.strip()]


def main() -> int:
    print("E2E-RD-OBEY-02 (A): violação forçada — close sem relatório entregável")
    env = novo_env()
    try:
        aplicar(env)
        obr.sup_ack(spool_path=env["spool"], ack_path=env["ack"])
        resp = obr.gate_close("RD-OBEY-E2E", {"ok": True},
                              spool_path=env["spool"], obedience_path=env["obedience"],
                              registry=env["registry"], queue=env["queue"])
        codes = [w.get("code") for w in resp.get("obeyWarnings") or []]
        check("1. finding tipado na resposta", codes == ["violates-obligation-O1"], str(codes))
        check("2. finding `violates-obligation-O1` no bus",
              "violates-obligation-O1" in bus_kinds(env["spool"]))
        debts = linhas_jsonl(env["registry"])
        check("3. dívida tipada obedience",
              len(debts) == 1 and debts[0].get("tipo") == "obedience",
              json.dumps({k: debts[0].get(k) for k in ("debtId", "tipo", "prio", "status")},
                         ensure_ascii=False) if debts else "sem registro")
        intents = linhas_jsonl(env["queue"])
        check("4. intent dispatch_mission AUTOMÁTICO na fila",
              len(intents) == 1 and intents[0].get("type") == "dispatch_mission"
              and int(intents[0].get("priority") or 0) == 1,
              "priority=%s" % (intents[0].get("priority") if intents else "-"))
        # score desce: a violação do gate (check 1) já está no obedience.jsonl
        s = obr.score(events_path=os.path.join(env["state"], "events.jsonl"),
                      obedience_path=env["obedience"])
        w = s["windows"]["hoje"]
        check("5. score desce (violacoesPorOrdem O1:1, ordensCumpridas 4/5)",
              w.get("violacoesPorOrdem") == {"O1": 1}
              and w.get("ordensCumpridas") == 4 and w.get("pctOrdensCumpridas") == 80.0,
              json.dumps({k: w.get(k) for k in ("violacoesPorOrdem", "ordensCumpridas",
                                                "pctOrdensCumpridas")},
                         ensure_ascii=False))
        # re-violação NÃO duplica (dedupe por ordem — o operator nunca mais repete)
        obr.gate_close("RD-OUTRA-X", {"ok": True},
                       spool_path=env["spool"], obedience_path=env["obedience"],
                       registry=env["registry"], queue=env["queue"])
        check("6. dedupe: 1 dívida, 1 intent (nada de spam na fila)",
              len(linhas_jsonl(env["registry"])) == 1
              and len(linhas_jsonl(env["queue"])) == 1)
    finally:
        restaurar(env)

    print("E2E-RD-OBEY-02 (B): caminho feliz — ack de sessão nova + zero violação = 100%")
    env2 = novo_env()
    try:
        aplicar(env2)
        obr.sup_ack(spool_path=env2["spool"], ack_path=env2["ack"])
        st = obr.check_stale(spool_path=env2["spool"], ack_path=env2["ack"])
        check("7. sup_ack com hash (sem obligation_stale)",
              st.get("stale") is False and bool(st.get("ackHash")),
              "hash=%s" % st.get("ackHash"))
        s = obr.score(obedience_path=env2["obedience"])
        w = s["windows"]["hoje"]
        check("8. score 100% (ordensCumpridas 5/5, violações 0)",
              w.get("pctOrdensCumpridas") == 100.0 and not w.get("violacoesPorOrdem"))
        check("9. ack/stale no payload do score (painel do operator)",
              s.get("stale") is False and bool(s.get("obligationsHash")))
    finally:
        restaurar(env2)

    erros = [c for c in CHECKS if not c[1]]
    print("E2E-RD-OBEY-02: %d/%d checks — %s"
          % (len(CHECKS) - len(erros), len(CHECKS),
             "TODOS OK" if not erros else "FALHAS: %s" % [c[0] for c in erros]))
    return 0 if not erros else 1


if __name__ == "__main__":
    sys.exit(main())
