import json, sys
sys.path.insert(0, '/root/.hermes/plugins/mission-ops')
from test_mission_ops import PKG, TempState
nf = PKG.nf
with TempState():
    rec = {"missionId": "spend-d1", "cost_usd": 0.421, "final": True, "source": "x"}
    trail = nf.record_mission_cost(rec)
    print("trail:", trail)
    print("SPOOL:", PKG.nf.SPOOL)
    import os
    print("exists:", os.path.exists(PKG.nf.SPOOL))
    if os.path.exists(PKG.nf.SPOOL):
        for l in open(PKG.nf.SPOOL):
            print("ROW:", l[:160])
    print("sig file:", PKG.nf.SIGNATURES_FILE, os.path.exists(PKG.nf.SIGNATURES_FILE))
