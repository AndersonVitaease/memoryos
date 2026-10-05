#!/usr/bin/env python3
"""RD-TESTBASE-01 — baseline/re-run da suíte do plugin mission-ops (repo /opt).

Roda cada test_*.py como subprocesso próprio (isolamento: TempState muta globals
por processo), captura exit code e tail de saída. Uso:
    python3 prova_testbase_01.py [saida.json]
Sem argumento: imprime resumo e sai 1 se algo vermelho.
"""
import json
import os
import subprocess
import sys
import time

PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))
SKIP_LIVE = set()  # nenhum zz-live no plugin; rd_perf tem skip condicional próprio
# RD-TESTBASE-01: vermelho pré-existente FORA do escopo desta missão — dona citada
# no resumo (nunca silêncio; precedência: RD-LEG-01/02, dívida herdada nomeada).
AMBIENT_NAMED = {
    "test_mission_debt.py": "dona RD-DEBT-01 (irmã em voo, WIP debt_sweep no mesmo cwd)",
}


def files():
    out = []
    for n in sorted(os.listdir(PLUGIN_DIR)):
        if n.startswith("test_") and n.endswith(".py") and not n.endswith(".bak"):
            out.append(n)
    return [n for n in out if n not in SKIP_LIVE]


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else None
    results = []
    for n in files():
        t0 = time.time()
        p = subprocess.run([sys.executable, n], cwd=PLUGIN_DIR,
                           capture_output=True, text=True, timeout=420)
        dt = time.time() - t0
        tail = (p.stdout or "").strip().splitlines()[-3:]
        results.append({"file": n, "exit": p.returncode, "secs": round(dt, 1),
                        "tail": tail[-1] if tail else ""})
        flag = "OK " if p.returncode == 0 else "RED"
        print(f"[{flag}] {n:48s} exit={p.returncode:3d} {dt:6.1f}s  {tail[-1] if tail else ''}"
              [:160], flush=True)
    reds = [r for r in results if r["exit"] != 0]
    ambient = [r for r in reds if r["file"] in AMBIENT_NAMED]
    in_scope_reds = [r for r in reds if r["file"] not in AMBIENT_NAMED]
    for a in ambient:
        print(f"AMBIENT-NAMED: {a['file']} — {AMBIENT_NAMED[a['file']]}")
    print(f"\nRESUMO: {len(results) - len(reds)}/{len(results)} verdes; "
          f"{len(in_scope_reds)} vermelho(s) EM ESCOPO: {[r['file'] for r in in_scope_reds]}"
          + (f"; {len(ambient)} vermelho(s) fora do escopo (nomeado acima)" if ambient else ""))
    if out_path:
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=1)
    return 1 if in_scope_reds else 0


if __name__ == "__main__":
    sys.exit(main())
