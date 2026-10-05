"""RD-MOPS-RED-01: runner file-based da suíte completa do plugin mission-ops.

Roda TODOS os test_*.py do diretório (um processo por arquivo, cwd do plugin,
PATH declarado), grava rerun-RD-MOPS-RED-01.json no formato do rerun-testbase-01
e sai 0 só se TODOS os arquivos fecharem exit 0 (skip tipado conta como 0).
"""
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)
ENV = dict(os.environ)
ENV["PATH"] = ("/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:"
               + ENV.get("PATH", ""))
ENV.pop("MISSION_OPS_SUITE_SHARDS", None)

targets = sorted(f for f in os.listdir(HERE)
                 if f.startswith("test_") and f.endswith(".py")
                 and not f.endswith(".bak-RD-MOPS-RED-01"))

results = []
red = 0
for t in targets:
    t0 = time.time()
    p = subprocess.run([sys.executable, t], capture_output=True, text=True,
                       env=ENV, timeout=600)
    secs = round(time.time() - t0, 1)
    tail_lines = (p.stdout + p.stderr).strip().splitlines()[-3:]
    entry = {"file": t, "exit": p.returncode, "secs": secs,
             "tail": "\n".join(tail_lines)}
    results.append(entry)
    mark = "ok" if p.returncode == 0 else "RED"
    print("%-42s exit=%-3d %5.1fs %s" % (t, p.returncode, secs, mark))
    if p.returncode != 0:
        red += 1

out = "rerun-RD-MOPS-RED-01.json"
with open(out, "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=1)
print("ARQUIVOS: %d | VERMELHOS: %d | json: %s" % (len(results), red, out))
sys.exit(1 if red else 0)
