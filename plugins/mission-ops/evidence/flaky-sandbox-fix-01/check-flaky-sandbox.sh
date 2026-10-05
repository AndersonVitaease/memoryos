#!/usr/bin/env bash
# flaky-sandbox-fix-01 — reprodutível: N rodadas diretas + ambiente hostil + estado real intacto.
set -u
cd "$(dirname "$0")/../.."
T="test_mission_ops.TestGpuDownFix01 test_mission_ops.TestVastSandboxGuard"
N=${N:-5}; fail=0
SP=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
snap(){ sha256sum /opt/gpu-orchestrator/state.json; grep -c '"source":"gpu-orchestrator"' /opt/mission-events/spool.jsonl; grep -c '"gpu_down"' /opt/gpu-bridge/audit.jsonl; }
B=$(snap)
for i in $(seq 1 "$N"); do env PATH="$SP" python3 -m unittest test_mission_ops.TestGpuDownFix01 >/dev/null 2>&1 && python3 -m unittest $T >/dev/null 2>&1 && echo "run$i OK" || { echo "run$i FAIL"; fail=1; }; done
env VASTAI_BIN=/opt/guardian-compute/venv/bin/vastai PATH=/opt/guardian-compute/venv/bin:$PATH HOME=$(mktemp -d) \
  python3 -m unittest $T >/dev/null 2>&1 && echo "hostil OK" || { echo "hostil FAIL"; fail=1; }
[ "$B" = "$(snap)" ] && echo "estado real intacto" || { echo "ESTADO REAL MUDOU"; fail=1; }
exit $fail
