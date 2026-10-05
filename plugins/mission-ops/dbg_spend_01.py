import json, sys
sys.path.insert(0, '/root/.hermes/plugins/mission-ops')
from test_mission_ops import PKG, TempState, track_calls
import unittest.mock as mock
mc = PKG.mc; nf = PKG.nf
with TempState():
    mc.save_ledger({"missionId": "spend-dbg", "status": "dispatched"})
    def tp(ledger):
        return {"missionId": "spend-dbg", "cost_usd": 0.421, "final": True, "source": "x"}
    calls, track = track_calls()
    with mock.patch.object(mc, "run_herdr", track), \
         mock.patch.object(mc.time, "sleep"), \
         mock.patch.object(nf, "transcript_cost_record", side_effect=tp):
        out = json.loads(PKG.handle_mission_close({"missionId": "spend-dbg"}))
    print("OUT:", json.dumps(out)[:1200])
    print("LEDGER:", json.dumps(mc.load_ledger("spend-dbg"))[:500])
    print("SPOOL NF:", PKG.nf.SPOOL, "| env MISSION_BUS_SPOOL:", __import__('os').environ.get("MISSION_BUS_SPOOL"))
