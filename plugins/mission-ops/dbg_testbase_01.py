#!/usr/bin/env python3
"""Debug RD-TESTBASE-01: reproduz test_close_real_runner_long_proof_gets_badge e
imprime o `out` real do handle_mission_close (o teste só vê KeyError: 'steps')."""
import json
import os
import subprocess
import sys
from pathlib import Path
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_mission_ops import PKG, TempState, mc, track_calls  # noqa: E402

mid = "pl3-dbg-%d" % os.getpid()
report = "/root/.hermes/mission-state/%s.verify.json" % mid
real_run = subprocess.run
try:
    with TempState() as ts:
        cwd = Path(ts.tmp) / "cwd"
        cwd.mkdir()
        (cwd / "verify.json").write_text(json.dumps(
            {"mission": mid, "cmd": [{"run": "sleep 37", "expect_exit": 0, "timeout": 300}]}),
            encoding="utf-8")
        mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                        "status": "dispatched", "cwd": str(cwd)})

        def runner(cmd, *a, **kw):
            if (isinstance(cmd, list) and "/opt/deliver-verify/verify.py" in cmd
                    and "--ledger-dir" not in cmd):
                cmd = cmd + ["--ledger-dir", str(mc.STATE_DIR)]
            return real_run(cmd, *a, **kw)
        with mock.patch.object(mc, "run_herdr", track_calls()[1]), \
             mock.patch.object(mc.time, "sleep"), \
             mock.patch.object(mc, "pane_exists", return_value=False), \
             mock.patch.object(PKG.nf, "mission_completed",
                               return_value={"ok": True, "emitted": True}), \
             mock.patch.object(PKG.nf, "mission_reopened",
                               return_value={"ok": True, "emitted": True}), \
             mock.patch.object(PKG.subprocess, "run", side_effect=runner), \
             mock.patch.object(PKG.vg, "emit_bus_event"):
            out = json.loads(PKG.handle_mission_close({"missionId": mid}))
        print(json.dumps(out, indent=1, ensure_ascii=False)[:4000])
finally:
    if os.path.exists(report):
        os.remove(report)
