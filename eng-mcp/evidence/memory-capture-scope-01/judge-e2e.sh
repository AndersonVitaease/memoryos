#!/bin/sh
# hermes bearer judge.verify live (read-only) — expects JUDGED
cd /root/.hermes/plugins/mission-ops/provas/chain-dispatch-gov-01 && python3 mcp_call.py engineering.judge.verify judge-payload.json /tmp/mcs01-judge.json >/dev/null 2>&1; grep -q '\\"status\\":\\"JUDGED\\"\|"status":"JUDGED"' /tmp/mcs01-judge.json
