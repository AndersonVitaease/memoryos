#!/usr/bin/env bash
# mission-list-compact-default-01: prova determinística (read-only no estado real).
# 1) testes novos verdes; 2) regressão lane2 + compacto-01; 3) ao vivo: default <8KB, verbose==full.
set -euo pipefail
cd /root/.hermes/plugins/mission-ops
python3 -m unittest -q test_mission_list_compact_default test_mission_list_compacto test_lane2 2>&1 | tail -1 | grep -qx OK
python3 - <<'PY'
import json, sys
exec(open("provas/mission-list-compact-default-01/medir.py").read().split("def med")[0])
d = seen["mission_list"]({}); f = seen["mission_list"]({"full": True}); v = seen["mission_list"]({"verbose": True})
assert json.loads(d)["view"] == "compact", "default não é compacto"
assert len(d.encode()) < 8192, "default %d B >= 8KB" % len(d.encode())
assert v == f, "verbose != full"
assert "panesTotal" in json.loads(m.handle_mission_list({})), "Python direto deixou de ser full (fast-router)"
print("OK default=%dB full=%dB" % (len(d.encode()), len(f.encode())))
PY
