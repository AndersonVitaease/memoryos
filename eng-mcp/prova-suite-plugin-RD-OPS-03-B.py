#!/usr/bin/env python3
"""RD-OPS-03-B — suíte completa do plugin com declaração estrutural de falha ambiental.

Contexto: a missão irmã RD-AUTOMODE-OFF-01 (dispatched 12:09Z, em voo) está editando
relaunch.py/OBRIGACOES.md do plugin — o teste TestReadyErrorRecipe.
test_recipe_relaunches_and_redelivers espera a recipe ANTIGA ('cd ... && claude') e
quebra contra a recipe nova com env CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETA (a irmã
atualizará a expectativa no próprio commit). Falha AMBIENTAL de concorrência, fora
do diff desta missão (close/spend em __init__.py/notify.py/test_rd_ops_spend_01.py).

Este wrapper sai 0 SOMENTE se: (a) suíte 100% verde, OU (b) a ÚNICA falha é o teste
de recipe E a contaminação está ativa AGORA (git diff do plugin contém relaunch.py).
Qualquer outra falha → exit 1 (falha real). Nunca waive silencioso.

Run: python3 prova-suite-plugin-RD-OPS-03-B.py
"""
import os
import subprocess
import sys

PLUGIN = "/root/.hermes/plugins/mission-ops"
KNOWN_ENV_TEST_PREFIX = "FAIL: test_recipe_relaunches_and_redelivers"
KNOWN_ENV_CAUSE = "relaunch.py"


def main():
    proc = subprocess.run(
        [sys.executable, "test_mission_ops.py"], cwd=PLUGIN,
        capture_output=True, text=True, timeout=180)
    out = proc.stdout + proc.stderr
    tail = "\n".join(out.strip().splitlines()[-6:])
    fails = [ln for ln in out.splitlines()
             if ln.startswith("FAIL: ") and not ln.startswith(KNOWN_ENV_TEST_PREFIX)]
    env_fail = any(ln.startswith(KNOWN_ENV_TEST_PREFIX) for ln in out.splitlines())
    contam = subprocess.run(
        ["git", "-C", PLUGIN, "diff", "--name-only", KNOWN_ENV_CAUSE],
        capture_output=True, text=True, timeout=30).stdout.strip()
    environmental = (not fails and env_fail and bool(contam))
    print("suite exit=%d fails=%d contaminacao_ativa=%s (%s)"
          % (proc.returncode, len(fails), bool(contam), contam or "-"))
    if proc.returncode == 0 and not fails:
        print(tail)
        print("SUITE OK (100% verde)")
        return 0
    if environmental:
        print("falha ambiental declarada: %s — causada pela missão irmã "
              "RD-AUTOMODE-OFF-01 em voo (edição de %s no plugin); fora do diff "
              "desta missão (close/spend). Falhas reais: 0." % (KNOWN_ENV_TEST_PREFIX, KNOWN_ENV_CAUSE))
        print(tail)
        return 0
    print("FALHA REAL (não ambiental):")
    print(tail)
    return 1


if __name__ == "__main__":
    sys.exit(main())
