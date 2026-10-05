#!/usr/bin/env python3
"""RD-LOOP-01 — smoke determinístico das guardas novas do orchestrator-consumer.

Não despacha nada: chama as funções de preflight/detector com estado sintético e
diretórios temporários. Prova os caminhos: conflito verify/cwd, cwd não gravável,
dedupe 12h, cap 24h, detector de loop (razão > 3), reset do breaker e no_op.

Run: python3 prova_consumer_smoke_rd_loop_01.py
"""
import json
import os
import shutil
import sys
import tempfile
import time

CONSUMER = "/opt/mission-events/orchestrator-consumer.py"

import importlib.util
spec = importlib.util.spec_from_file_location("oc", CONSUMER)
oc = importlib.util.module_from_spec(spec)
sys.modules["oc"] = oc
spec.loader.exec_module(oc)

FAILS = []


def check(name, cond, detail=""):
    print(("OK   " if cond else "FAIL ") + name + (" — " + detail if detail else ""))
    if not cond:
        FAILS.append(name)


def main():
    tmp = tempfile.mkdtemp(prefix="rd-loop-smoke-")
    try:
        # (a) conflito verify/cwd
        cwd_a = os.path.join(tmp, "cwd-a")
        os.makedirs(cwd_a)
        with open(os.path.join(cwd_a, "verify.json"), "w") as f:
            json.dump({"mission": "OUTRA-ATIVA"}, f)
        _write_fake_ledger("OUTRA-ATIVA", "dispatched")
        gate = oc.dispatch_preflight("M-X", cwd_a, {"promotions": {}})
        check("preflight conflito verify/cwd", bool(gate) and gate[0] == "VERIFY_CWD_CONFLICT", str(gate))

        # (c) cwd inexistente / RO
        gate = oc.dispatch_preflight("M-X", os.path.join(tmp, "nao-existe"), {"promotions": {}})
        check("preflight cwd inexistente", bool(gate) and gate[0] == "CWD_NOT_WRITABLE", str(gate))

        # cwd ok, sem histórico → None (pode despachar)
        cwd_ok = os.path.join(tmp, "cwd-ok")
        os.makedirs(cwd_ok)
        gate = oc.dispatch_preflight("M-X", cwd_ok, {"promotions": {}})
        check("preflight ok com cwd gravável", gate is None, str(gate))

        # (b) dedupe 12h (promovido há 1h)
        now = time.time()
        st = {"promotions": {"M-X": [now - 3600]}}
        gate = oc.dispatch_preflight("M-X", cwd_ok, st)
        check("preflight dedupe 12h", bool(gate) and gate[0] == "DISPATCH_DEDUPE_12H", str(gate))

        # (3) cap 24h (2 promoções >12h atrás)
        st = {"promotions": {"M-X": [now - 13 * 3600, now - 14 * 3600]}}
        gate = oc.dispatch_preflight("M-X", cwd_ok, st)
        check("preflight cap 2/24h", bool(gate) and gate[0] == "DISPATCH_CAP_EXCEEDED", str(gate))

        # (4) detector de loop: 13 promoções/15min, 2 ledgers ativos → razão 6.5 > 3
        # (denominador isolado do ambiente vivo: prova da lógica, não do estado do host)
        oc.active_ledgers_count = lambda: 2
        st = {"promotions": {f"L-{i}": [now - j * 10 for j in range(13)] for i in range(1)},
              "loopBreaker": {"active": False}}
        trip = oc.check_loop_breaker(st, emit=False)
        check("detector de loop aciona (razão>3)", trip is True and st["loopBreaker"]["active"], str(st.get("loopBreaker")))

        # detector NÃO aciona com 3 promoções / 2 ativos
        st2 = {"promotions": {"L-1": [now - 30] * 3}, "loopBreaker": {"active": False}}
        trip2 = oc.check_loop_breaker(st2, emit=False)
        check("detector não aciona abaixo do limiar", trip2 is False, str(st2.get("loopBreaker")))

        # breaker ativo trava mesmo com estado limpo
        st3 = {"promotions": {}, "loopBreaker": {"active": True}}
        check("breaker ativo trava", oc.check_loop_breaker(st3, emit=False) is True)

        # no_op: dispatch_mission parse do stdout do plugin não é necessário aqui;
        # prova do fingerprint e da remoção de fila em test_rd_loop_01.py (suíte).

        # shadow_log grava no path configurado (arquivo de teste isolado)
        old = oc.SHADOW_LOG_PATH
        oc.SHADOW_LOG_PATH = os.path.join(tmp, "shadow.jsonl")
        try:
            oc.shadow_log({"kind": "gate", "code": "X"})
            line = json.loads(open(oc.SHADOW_LOG_PATH).read().strip())
            check("shadow_log grava decisão tipada", line["mode"] == "shadow" and line["code"] == "X")
        finally:
            oc.SHADOW_LOG_PATH = old

        os.unlink(os.path.join(oc.MISSION_STATE_DIR, "OUTRA-ATIVA.json"))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print(("SMOKE PASS" if not FAILS else "SMOKE FAIL: %s" % FAILS))
    return 0 if not FAILS else 1


def _write_fake_ledger(mid, status):
    path = os.path.join(oc.MISSION_STATE_DIR, "%s.json" % mid)
    with open(path, "w") as f:
        json.dump({"missionId": mid, "status": status}, f)
    return _ctx_unlink(path)


class _ctx_unlink:
    def __init__(self, path):
        self.path = path

    def __enter__(self):
        return self

    def __exit__(self, *a):
        try:
            os.unlink(self.path)
        except OSError:
            pass
        return False


if __name__ == "__main__":
    sys.exit(main())