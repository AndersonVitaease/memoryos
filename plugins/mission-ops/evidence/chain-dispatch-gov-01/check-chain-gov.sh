#!/usr/bin/env bash
# CHAIN-DISPATCH-GOV-01 — prova executável read-only: 17 casos (estado/spool em tmp) +
# trilha viva da sonda recusada no bus real. Saída final: "CHAIN-GOV OK <n>".
set -euo pipefail
cd /root/.hermes/plugins/mission-ops
out=$(python3 -m unittest test_chain_dispatch 2>&1) || { echo "$out" | tail -20; echo "CHAIN-GOV FAIL tests"; exit 1; }
n=$(echo "$out" | sed -n 's/^Ran \([0-9]*\) tests.*/\1/p')
grep -q '"mission_id": "chain-gov-live-probe-01".*"verdict": "refused", "reason": "CHAIN_DISPATCH_NOT_ALLOWED"' \
  /opt/mission-events/spool.jsonl || { echo "CHAIN-GOV FAIL trilha viva ausente"; exit 1; }
test ! -e /root/.hermes/mission-state/chain-gov-live-probe-01.json || { echo "CHAIN-GOV FAIL sonda virou ledger"; exit 1; }
echo "CHAIN-GOV OK $n"
