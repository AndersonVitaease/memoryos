#!/usr/bin/env bash
# GPU-COST-FIX-01 — prova executável read-only: 23 casos (state/spool/audit em tmp, gpu-down
# mockado) + no-op honesto contra o state REAL (53163485 destruída antes desta missão →
# cost_unmeasured, nunca US$0.6185 alheio). Saída final: "GPU-COST OK <n>".
set -euo pipefail
cd /root/.hermes/plugins/mission-ops
out=$(python3 -m unittest test_gpu_cost_trail test_gpu_cost_coerce 2>&1) || { echo "$out" | tail -20; echo "GPU-COST FAIL tests"; exit 1; }
n=$(echo "$out" | sed -n 's/^Ran \([0-9]*\) tests.*/\1/p')
cd /root/.hermes/plugins
python3 - <<'PY' || { echo "GPU-COST FAIL no-op vivo"; exit 1; }
import importlib, json
nf = importlib.import_module("mission-ops.notify")
led = {"missionId": "probe", "engine": "gpu", "gpuUpOk": True, "dispatchedAt": "2026-09-28T15:36:02Z"}
s = json.load(open(nf.GPU_STATE))
rec = nf.mission_cost_record(led, audit_path="/nonexistent")
if s.get("status") == "down" and (nf.cost_coerce.epoch(s.get("destroyedAt")) or 0) < 1790609762:
    assert "cost_usd" not in rec and "instance_destroyed_before_mission" in rec["cost_unmeasured"], rec
assert nf.probe_budget_alert("probe", mission_cost_usd="lixo") is None
PY
echo "GPU-COST OK $n"
