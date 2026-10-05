#!/usr/bin/env python3
"""Debug RD-TESTBASE-01 (ordem): roda cada teste prévio do proof-lint03 isolado e depois
o badge test, imprimindo o `out` real do handle_mission_close quando faltar 'steps'."""
import io
import json
import os
import subprocess
import sys
import unittest
from unittest import mock
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_mission_ops import PKG, TempState, mc, track_calls  # noqa: E402
import test_proof_lint03_plugin as T  # noqa: E402
from test_verify_author import _Cwd  # noqa: E402


def badge_out():
    """Réplica literal de test_close_real_runner_long_proof_gets_badge, com out impresso."""
    mid = "pl3-dbg2-%d" % os.getpid()
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
            return out
    finally:
        if os.path.exists(report):
            os.remove(report)


def run_one(test_id):
    suite = unittest.TestLoader().loadTestsFromName(test_id)
    buf = io.StringIO()
    res = unittest.TextTestRunner(stream=buf, verbosity=0).run(suite)
    return bool(res.wasSuccessful())


def main():
    priors = [
        "test_proof_lint03_plugin.TestAuthorByExecution.test_write_rehearses_real_exit_timeout_tail",
        "test_proof_lint03_plugin.TestAuthorByExecution.test_timeout_is_twice_measured_and_suite_floor",
        "test_proof_lint03_plugin.TestAuthorByExecution.test_dry_run_never_executes",
        "test_proof_lint03_plugin.TestAuthorByExecution.test_nonzero_exit_refused_without_force_and_note",
        "test_proof_lint03_plugin.TestTemplateClause.test_dispatch_prompt_has_proof_lint_clause",
    ]
    order = []
    for i in range(len(priors) + 1):
        order.append((priors[:i], priors[i] if i < len(priors) else None))
    # roda cumulativamente: 0..k testes prévios + badge
    for prefix, _ in order:
        ok_prefix = all(run_one(t) for t in prefix)
        out = badge_out()
        has_steps = "steps" in out
        print(f"prefix={len(prefix)} prefix_ok={ok_prefix} steps={'OK' if has_steps else 'AUSENTE'}"
              + ("" if has_steps else " out=" + json.dumps(out, ensure_ascii=False)[:300]))
        if not has_steps:
            print(json.dumps(out, indent=1, ensure_ascii=False)[:2000])
            break


if __name__ == "__main__":
    main()
