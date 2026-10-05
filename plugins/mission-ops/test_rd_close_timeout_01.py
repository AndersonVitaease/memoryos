"""RD-CLOSE-TIMEOUT-01 (04/10) — reuso de verify fresco no deliver-verify do close.

R1 (helper): verify-<missionId>.json do CWD do ledger, fresco (< 30 min), verdict=pass
    e mission==missionId gravados no próprio arquivo -> evidência de reuso
    ({path, mtime, age_s}). Ausente, vermelho, velho (> 30 min), missionId
    divergente, corrompido ou kill switch env -> None (fallback = re-executar runner).
R2 (dryRun): close dryRun com verify fresco espelha o veredito do close real SEM
    re-executar o runner (subprocess jamais chamado), com resolved_by=reuse-fresh
    e evidence com path + mtime — zero mutação.
R3 (kill switch): MISSION_CLOSE_VERIFY_REUSE=0 desliga o reuso — dryRun cai no
    caminho anterior (runner re-executado; comportamento pré-missão preservado).
R4 (não-quebra): manifesto SEM campo verdict (formato da suíte existente) NUNCA
    reusa — o fallback re-executa o runner exatamente como antes.

Run: python3 test_rd_close_timeout_01.py   (herdr 100% mockado; estado em tmp)
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_mission_ops import PKG, TempState, track_calls  # noqa: E402

mc = PKG.mc


def _real_runner():
    """Runner VERDADEIRO do close; só redireciona o ledger-dir para o state do teste."""
    real_run = subprocess.run

    def runner(cmd, *a, **kw):
        if isinstance(cmd, list) and "/opt/deliver-verify/verify.py" in cmd \
                and "--ledger-dir" not in cmd:
            cmd = cmd + ["--ledger-dir", str(mc.STATE_DIR)]
        return real_run(cmd, *a, **kw)
    return runner


class TestRdCloseTimeout01(unittest.TestCase):

    @staticmethod
    def _mk_fresh_manifest(cwd: Path, mid: str, *, verdict=None, owner=None):
        data = {"mission": owner or mid,
                "cmd": [{"run": "echo ok", "expect_exit": 0, "timeout": 30}]}
        if verdict is not None:
            data["verdict"] = verdict
        p = cwd / ("verify-%s.json" % mid)
        p.write_text(json.dumps(data), encoding="utf-8")
        return str(p)

    def _ledger(self, ts: TempState, mid: str, cwd: str, **extra):
        mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                        "status": "dispatched", "cwd": cwd, **extra})
        return mc.load_ledger(mid)

    def _dry(self, mid, env=None, subprocess_side_effect=None):
        """dryRun com herdr mockado; runner opcionalmente interceptado."""
        envd = dict(env or {})
        se = subprocess_side_effect if subprocess_side_effect is not None else _real_runner()
        with mock.patch.dict(os.environ, envd, clear=False), \
             mock.patch.object(mc, "run_herdr", track_calls()[1]), \
             mock.patch.object(PKG.subprocess, "run", side_effect=se):
            return json.loads(PKG.handle_mission_close({"missionId": mid, "dryRun": True}))

    # ================================================================ R1 helper
    def test_helper_fresh_pass_owner(self):
        """Fresco + verdict=pass + owner==missionId -> evidência com path/mtime/age_s."""
        mid = "rct1a-%d" % os.getpid()
        with TempState() as ts:
            cwd = Path(ts.tmp) / "cwd"
            cwd.mkdir()
            path = self._mk_fresh_manifest(cwd, mid, verdict="pass")
            ledger = self._ledger(ts, mid, str(cwd))
            ev = PKG._fresh_verify_manifest(ledger)
            self.assertIsNotNone(ev)
            self.assertEqual(ev["path"], path)
            self.assertEqual(ev["mtime"], int(os.stat(path).st_mtime))
            self.assertLess(ev["age_s"], 30)

    def test_helper_fallback_cases(self):
        """Ausente, vermelho, owner divergente, velho, corrompido, sem cwd/mission -> None."""
        mid = "rct1b-%d" % os.getpid()
        with TempState() as ts:
            cwd = Path(ts.tmp) / "cwd"
            cwd.mkdir()
            ledger = self._ledger(ts, mid, str(cwd))
            self.assertIsNone(PKG._fresh_verify_manifest(ledger))            # ausente
            self._mk_fresh_manifest(cwd, mid, verdict="fail")                # vermelho
            self.assertIsNone(PKG._fresh_verify_manifest(ledger))
            self._mk_fresh_manifest(cwd, mid, verdict="pass",
                                    owner="outra-missao-%d" % os.getpid())   # owner divergente
            self.assertIsNone(PKG._fresh_verify_manifest(ledger))
            self._mk_fresh_manifest(cwd, mid, verdict="pass")                # velho (> 30 min)
            p = cwd / ("verify-%s.json" % mid)
            os.utime(p, (time.time() - 1801, time.time() - 1801))            # 30min1s
            self.assertIsNone(PKG._fresh_verify_manifest(ledger))
            p.write_text("não é json", encoding="utf-8")                     # corrompido
            self.assertIsNone(PKG._fresh_verify_manifest(ledger))
            self.assertIsNone(PKG._fresh_verify_manifest({"missionId": mid}))  # sem cwd

    def test_helper_kill_switch_env(self):
        """MISSION_CLOSE_VERIFY_REUSE=0/off/false desliga o reuso (kill switch)."""
        mid = "rct1c-%d" % os.getpid()
        with TempState() as ts:
            cwd = Path(ts.tmp) / "cwd"
            cwd.mkdir()
            self._mk_fresh_manifest(cwd, mid, verdict="pass")
            ledger = self._ledger(ts, mid, str(cwd))
            for v in ("0", "off", "false"):
                with mock.patch.dict(os.environ, {"MISSION_CLOSE_VERIFY_REUSE": v}):
                    self.assertIsNone(PKG._fresh_verify_manifest(ledger), v)
            with mock.patch.dict(os.environ, {"MISSION_CLOSE_VERIFY_REUSE": "1"}):
                self.assertIsNotNone(PKG._fresh_verify_manifest(ledger), "1")

    # ================================================================ R2 dryRun reuso
    def test_dryrun_reuse_does_not_run_runner(self):
        """dryRun com verify fresco: verdict pass + reuse-fresh + evidence, e o runner
        NUNCA é executado (reuso é a proof de < 30s sem re-execução)."""
        mid = "rct1d-%d" % os.getpid()
        with TempState() as ts:
            cwd = Path(ts.tmp) / "cwd"
            cwd.mkdir()
            path = self._mk_fresh_manifest(cwd, mid, verdict="pass")
            self._ledger(ts, mid, str(cwd))

            def _no_runner(cmd, *a, **kw):
                raise AssertionError("runner re-executado no reuso: %r" % (cmd,))

            out = self._dry(mid, subprocess_side_effect=_no_runner)
            self.assertTrue(out["ok"], out)
            dv = [s for s in out["steps"] if s["step"] == "deliver_verify"][0]
            self.assertEqual(dv["verdict"], "pass", dv)
            self.assertEqual(dv["resolved_by"], "reuse-fresh", dv)
            # RD-MOPS-RED-01: RD-LOOP-01 (commit d95aba9) torna verify-<mid>.json no
            # state dir o canônico — o dryRun migra o manifesto do cwd (dono certo,
            # read-once-and-move) ANTES do reuso, então a evidência do reuso é a
            # cópia canônica (age 0), não o path de origem no cwd.
            state_path = os.path.join(str(mc.STATE_DIR), "verify-%s.json" % mid)
            self.assertEqual(dv["evidence"]["path"], state_path, dv)
            self.assertFalse(os.path.exists(path), dv)  # cwd: movido, não copiado
            self.assertIn("mtime", dv["evidence"], dv)
            self.assertIn("age_s", dv["evidence"], dv)

    # ================================================================ R3 kill switch no dryRun
    def test_dryrun_kill_switch_reexecutes_runner(self):
        """Kill switch env: dryRun re-executa o runner (caminho pré-missão preservado).
        Manifesto legado verify.json no cwd (o fallback do dryRun exige has_manifest)."""
        mid = "rct1e-%d" % os.getpid()
        with TempState() as ts:
            cwd = Path(ts.tmp) / "cwd"
            cwd.mkdir()
            (cwd / "verify.json").write_text(json.dumps(
                {"mission": mid, "cmd": [{"run": "echo ok", "expect_exit": 0, "timeout": 30}]}),
                encoding="utf-8")
            self._ledger(ts, mid, str(cwd))
            calls = []
            real = PKG.subprocess.run  # captura ANTES do patch (evita recursão do mock)

            def recorder(cmd, *a, **kw):
                calls.append(list(cmd) if isinstance(cmd, list) else cmd)
                if isinstance(cmd, list) and "/opt/deliver-verify/verify.py" in cmd \
                        and "--ledger-dir" not in cmd:
                    cmd = cmd + ["--ledger-dir", str(mc.STATE_DIR)]
                return real(cmd, *a, **kw)

            out = self._dry(mid, env={"MISSION_CLOSE_VERIFY_REUSE": "0"},
                            subprocess_side_effect=recorder)
            self.assertTrue(out["ok"], out)
            dv = [s for s in out["steps"] if s["step"] == "deliver_verify"][0]
            self.assertEqual(dv["verdict"], "pass", dv)
            self.assertNotEqual(dv.get("resolved_by"), "reuse-fresh", dv)
            self.assertTrue(calls, "runner deveria re-executar com kill switch")

    # ================================================================ R4 não-quebra
    def test_manifest_without_verdict_never_reuses(self):
        """Manifesto sem campo verdict (formato legado da suíte existente) nunca reusa:
        sem verify.json no cwd (só verify-<mid>.json sem verdict) o dryRun cai no
        veredito do caminho antigo — e com verify.json legado o runner re-executa."""
        mid = "rct1f-%d" % os.getpid()
        with TempState() as ts:
            cwd = Path(ts.tmp) / "cwd"
            cwd.mkdir()
            self._mk_fresh_manifest(cwd, mid)  # SEM verdict
            self._ledger(ts, mid, str(cwd))
            out = self._dry(mid)
            dv = [s for s in out["steps"] if s["step"] == "deliver_verify"][0]
            self.assertNotEqual(dv.get("resolved_by"), "reuse-fresh", dv)


if __name__ == "__main__":
    unittest.main(verbosity=2)