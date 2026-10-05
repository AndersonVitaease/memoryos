"""PROOF-LINT-03 — plugin: author por execução (A), cláusula de template (C) e timeout do
subprocess do deliver_verify no mission_close (adendo do operator, watch-fp-01).

  A1 gravar = rodar 1x: expect_exit real, timeout 2× medido (mín 30; suíte mín 60), evidence_tail real
  A2 dryRun não executa nada (nem rehearsal) e não grava
  A3 exit real ≠ 0 → recusa REHEARSAL_EXIT_NONZERO sem force+note; com ambos grava + flag
  C  dispatch_prompt carrega a cláusula PROOF-LINT-03
  T1 _dv_close_timeout: max(35, maior timeout cmd + 10); sem timeouts = 35
  T2 close REAL: prova de ~37s com timeout 300 → badge verified_e2e (antes: fail-open em 35s)
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_mission_ops import PKG, TempState, mc, track_calls  # noqa: E402
from test_verify_author import _Cwd, author_tool  # noqa: E402

va = PKG.va


def _manifest(c):
    with open(os.path.join(c.dir, "verify.json"), encoding="utf-8") as f:
        return json.load(f)


class TestAuthorByExecution(unittest.TestCase):
    def _fixture(self, c, mid, cmd):
        out = c.write("out.txt", "linha-real-1\nRESULTADO_REAL ok 42\n")
        c.write("RELATORIO-%s.md" % mid, "# R\n- prova: `%s`\n- arquivo: `%s`\n%s"
                % (cmd, out, "." * 600))
        mc.save_ledger({"missionId": mid, "status": "closed", "cwd": c.dir})
        return out

    def test_write_rehearses_real_exit_timeout_tail(self):
        with TempState(), _Cwd() as c:
            self._fixture(c, "pl3-a1", "cat out.txt")
            j = author_tool({"missionId": "pl3-a1"})
            self.assertTrue(j["ok"] and j["written"], j)
            cmd = _manifest(c)["cmd"][0]
            self.assertEqual(cmd["expect_exit"], 0)
            self.assertEqual(cmd["timeout"], 30)              # 2× ~0s → mínimo 30
            self.assertIn("RESULTADO_REAL ok 42", cmd["evidence_tail"])   # saída REAL, não memória
            self.assertNotIn("rehearsed_exit_nonzero", cmd)
            self.assertEqual(j["rehearsals"][0]["exit"], 0)
            self.assertEqual(j["verify"]["verdict"], "pass")

    def test_timeout_is_twice_measured_and_suite_floor(self):
        m = {"cmd": [{"run": "cd /x && slow-thing", "expect_exit": 0},
                     {"run": "cd /x && python3 -m unittest test_x", "expect_exit": 0}],
             "file": [{"path": "/etc/hostname"}]}
        r = va.rehearse(m, runner=lambda run: (0, "x" * 900, 40.2 if "slow" in run else 3.0))
        self.assertEqual(r["manifest"]["cmd"][0]["timeout"], 81)
        self.assertEqual(r["manifest"]["cmd"][1]["timeout"], 60)
        self.assertEqual(len(r["manifest"]["cmd"][0]["evidence_tail"].encode()), 500)
        self.assertEqual(r["manifest"]["file"], m["file"])     # provas file intocadas
        self.assertNotIn("evidence_tail", m["cmd"][0])         # entrada não mutada

    def test_dry_run_never_executes(self):
        with TempState(), _Cwd() as c:
            self._fixture(c, "pl3-a2", "cat out.txt")
            with mock.patch.object(va, "run_rehearsal") as rh:
                j = author_tool({"missionId": "pl3-a2", "dryRun": True})
            self.assertEqual(rh.call_count, 0)
            self.assertFalse(j["written"])
            self.assertFalse(os.path.exists(os.path.join(c.dir, "verify.json")))

    def test_nonzero_exit_refused_without_force_and_note(self):
        with TempState(), _Cwd() as c:
            self._fixture(c, "pl3-a3", "grep -q NAO_EXISTE_XYZ out.txt")
            j = author_tool({"missionId": "pl3-a3"})
            self.assertFalse(j["ok"])
            self.assertEqual(j["error"], "REHEARSAL_EXIT_NONZERO")
            self.assertFalse(os.path.exists(os.path.join(c.dir, "verify.json")))
            j = author_tool({"missionId": "pl3-a3", "force": "true"})
            self.assertEqual(j["error"], "REHEARSAL_EXIT_NONZERO")   # force sem nota não basta
            j = author_tool({"missionId": "pl3-a3", "force": "true",
                             "note": "prova negativa de propósito: string não pode existir"})
            self.assertTrue(j["written"], j)
            cmd = _manifest(c)["cmd"][0]
            self.assertEqual(cmd["expect_exit"], 1)
            self.assertTrue(cmd["rehearsed_exit_nonzero"])
            self.assertIn("propósito", cmd["rehearsal_note"])


class TestTemplateClause(unittest.TestCase):
    def test_dispatch_prompt_has_proof_lint_clause(self):
        p = mc.dispatch_prompt("/opt/x/missao.md")
        self.assertIn("PROVA (PROOF-LINT-03)", p)
        self.assertIn("evidence_tail", p)
        self.assertIn("2× a duração da sua execução real", p)
        self.assertIn("REPORT-QA-01", p)        # cláusula anterior preservada


class TestCloseVerifyTimeout(unittest.TestCase):
    def test_timeout_from_manifest(self):
        with _Cwd() as c:
            # RD-PERF-VERIFY-01: teto base 35s -> 150s (provas de ~99s legítimas)
            self.assertEqual(PKG._dv_close_timeout(c.dir, "m"), 150)    # sem manifesto
            c.write("verify.json", json.dumps({"cmd": [{"run": "true"}]}))
            self.assertEqual(PKG._dv_close_timeout(c.dir, "m"), 150)    # sem timeouts declarados
            c.write("verify.json", json.dumps({"cmd": [{"run": "a", "timeout": 20},
                                                       {"run": "b", "timeout": 300}]}))
            self.assertEqual(PKG._dv_close_timeout(c.dir, "m"), 310)
            c.write("verify.json", "{quebrado")
            # RD-TESTBASE-01: linha ficara obsoleta — o default já é DV_CLOSE_TIMEOUT_S=150
            # desde a RD-PERF-VERIFY-01 (teto base 35s -> 150s); max(150, 0) = 150 também
            # com manifesto ilegível (mesma semântica, valor novo).
            self.assertEqual(PKG._dv_close_timeout(c.dir, "m"), 150)    # ilegível = default
            # layout watch-fp-01: cwd = <wt>/eng-mcp com verify.json obsoleto; o runner usa o do
            # PARENT (stale_manifest_ignored) — o teto tem que seguir a mesma resolução
            sub = os.path.join(c.dir, "eng-mcp")
            os.makedirs(sub)
            with open(os.path.join(sub, "verify.json"), "w") as f:
                json.dump({"mission": "outra", "cmd": [{"run": "x"}]}, f)
            c.write("verify.json", json.dumps({"mission": "m", "cmd": [{"run": "p3", "timeout": 300}]}))
            self.assertEqual(PKG._dv_close_timeout(sub, "m"), 310)
            extra = os.path.join(c.dir, "extra")
            os.makedirs(extra)
            with open(os.path.join(extra, "verify-m.json"), "w") as f:
                json.dump({"mission": "m", "cmd": [{"run": "y", "timeout": 500}]}, f)
            self.assertEqual(PKG._dv_close_timeout(sub, "m", [extra]), 510)

    def test_close_real_runner_long_proof_gets_badge(self):
        """watch-fp-01: prova real verde de ~37s > 35s fixo → fechou SEM BADGE (fail-open)."""
        mid = "pl3-close-%d" % os.getpid()
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
                    # runner VERDADEIRO; só aponta o ledger-dir para o state temporário do teste
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
                dv = [s for s in out["steps"] if s["step"] == "deliver_verify"][0]
                self.assertEqual(dv["verdict"], "pass", dv)
                led = mc.load_ledger(mid)
                self.assertEqual(led["status"], "closed")
                self.assertEqual(led["verified_e2e"]["verdict"], "pass")
        finally:
            if os.path.exists(report):
                os.remove(report)


if __name__ == "__main__":
    unittest.main(verbosity=2)
