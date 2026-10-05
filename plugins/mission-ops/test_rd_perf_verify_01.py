"""RD-PERF-VERIFY-01 (05/10) — teto do runner 150s + cache de verify por contentHash
+ suíte paralela de test_mission_ops.

T1 (teto): DV_CLOSE_TIMEOUT_S == 150 e mission_verify usa o teto como default e clamp.
T2 (_dv_close_timeout): sem timeouts declarados = 150; cmd com timeout 300 -> 310
    (crescimento por prova declarada preservado, PROOF-LINT-03).
T3 (hash): _manifest_content_hash determinístico; muda com conteúdo de arquivo provado
    e com spec cmd alterado; estável quando nada muda.
T4 (reuso por conteúdo): contentHash batendo -> reuso INDEPENDENTE de idade (31min+),
    evidência com contentHash + reuse_by=content-hash.
T5/T6 (invalidação): arquivo provado alterado OU run alterado -> None (re-executa).
T7 (legado): manifesto SEM contentHash segue a regra de mtime de 30 min (não-quebra).
T8 (kill switch): MISSION_CLOSE_VERIFY_REUSE=0 desliga o reuso mesmo com hash batendo.
T9 (E2E dryRun): close dryRun com verify-<mid>.json velho (31min) + contentHash válido
    -> reuse-fresh com evidence.contentHash e runner NUNCA chamado; arquivo alterado ->
    runner REAL re-executa e o passo vem do caminho antigo.
T10 (shards): plano de shards cobre TODAS as classes de test_mission_ops exatamente 1x.
T11 (knobs): atrasos do ready-dance existem e são floats não-negativos (suíte zera).

Run: python3 test_rd_perf_verify_01.py   (herdr 100% mockado; estado em tmp)
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
    """Runner VERDADEIRO do close/verify; garante --ledger-dir do teste."""
    real_run = subprocess.run

    def runner(cmd, *a, **kw):
        if isinstance(cmd, list) and "/opt/deliver-verify/verify.py" in cmd \
                and "--ledger-dir" not in cmd:
            cmd = cmd + ["--ledger-dir", str(mc.STATE_DIR)]
        return real_run(cmd, *a, **kw)
    return runner


class TestRdPerfVerify01(unittest.TestCase):

    # ================================================================ T1 teto do runner
    def test_runner_ceiling_is_150(self):
        """Constante = 150s e mission_verify: default = teto; clamp em timeoutMs."""
        self.assertEqual(PKG.DV_CLOSE_TIMEOUT_S, 150)
        mid = "rpv1a-%d" % os.getpid()
        with TempState() as ts:
            mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "status": "dispatched"})
            seen = []

            def recorder(cmd, *a, **kw):
                seen.append(kw.get("timeout"))
                return mock.Mock(returncode=0, stdout=json.dumps(
                    {"missionId": mid, "source": "manifest", "verdict": "pass",
                     "checks": []}).encode())

            with mock.patch.object(mc, "run_herdr", track_calls()[1]), \
                 mock.patch.object(PKG.subprocess, "run", side_effect=recorder):
                out = json.loads(PKG.handle_mission_verify({"missionId": mid}))
                self.assertEqual(out["verdict"], "pass", out)
                self.assertEqual(seen[-1], 150.0, seen)          # default = teto
                out2 = json.loads(PKG.handle_mission_verify(
                    {"missionId": mid, "timeoutMs": 300000}))
                self.assertEqual(seen[-1], 150.0, seen)          # clamp = teto (era 120)
                out3 = json.loads(PKG.handle_mission_verify(
                    {"missionId": mid, "timeoutMs": 5000}))
                self.assertEqual(seen[-1], 5.0, seen)            # pedido menor respeitado

    # ================================================================ T2 _dv_close_timeout
    def test_dv_close_timeout_base_and_margin(self):
        with TempState() as ts:
            cwd = Path(ts.tmp) / "cwd"
            cwd.mkdir()
            self.assertEqual(PKG._dv_close_timeout(str(cwd), "rpv2"), 150)  # era 35
            (cwd / "verify.json").write_text(json.dumps(
                {"mission": "rpv2",
                 "cmd": [{"run": "echo ok", "expect_exit": 0, "timeout": 300}]}),
                encoding="utf-8")
            self.assertEqual(PKG._dv_close_timeout(str(cwd), "rpv2"), 310)  # margem 10s

    # ================================================================ T3 hash helper
    @staticmethod
    def _manifest(cwd: Path, mid: str, *, verdict="pass", content_hash=None,
                  prov_file="prova.txt"):
        (cwd / prov_file).write_text("conteudo original\n", encoding="utf-8")
        data = {"mission": mid, "verdict": verdict,
                "cmd": [{"run": "cat %s" % prov_file, "expect_exit": 0, "timeout": 30,
                         "cwd": str(cwd)}],
                "file": [{"path": str(cwd / prov_file)}]}
        if content_hash is not None:
            data["contentHash"] = content_hash
        return data

    def test_content_hash_deterministic_and_sensitive(self):
        import tempfile
        tmp = tempfile.mkdtemp(prefix="rpv-hash-")
        mid = "rpv3-%d" % os.getpid()
        data = self._manifest(Path(tmp), mid)
        h1 = PKG._manifest_content_hash(data, tmp)
        h2 = PKG._manifest_content_hash(data, tmp)
        self.assertEqual(h1, h2)  # determinístico
        # conteúdo do arquivo provado muda -> hash muda
        Path(tmp, "prova.txt").write_text("conteudo ALTERADO\n", encoding="utf-8")
        h3 = PKG._manifest_content_hash(data, tmp)
        self.assertNotEqual(h1, h3)
        Path(tmp, "prova.txt").write_text("conteudo original\n", encoding="utf-8")
        # spec cmd muda (run diferente) -> hash muda
        data2 = dict(data, cmd=[dict(data["cmd"][0], run="echo outro")])
        self.assertNotEqual(h1, PKG._manifest_content_hash(data2, tmp))

    # ================================================================ T4-T8 helper
    def _reuse_case(self, ts, mid, *, age_s=1861, with_hash=True, tamper=None):
        """cwd com verify-<mid>.json velho (default 31min) + contentHash coerente.
        tamper(path) roda ANTES do retorno para invalidar o hash."""
        cwd = Path(ts.tmp) / ("cwd-%s" % mid)
        cwd.mkdir(exist_ok=True)
        data = self._manifest(cwd, mid)
        if with_hash:
            data["contentHash"] = PKG._manifest_content_hash(data, str(cwd))
        if tamper:
            tamper(cwd)
        p = cwd / ("verify-%s.json" % mid)
        p.write_text(json.dumps(data), encoding="utf-8")
        os.utime(p, (time.time() - age_s, time.time() - age_s))
        mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "status": "dispatched",
                        "cwd": str(cwd)})
        return mc.load_ledger(mid), cwd

    def test_reuse_by_content_hash_ignores_age(self):
        """contentHash batendo -> reuso com 31min (31min reais re-executavam antes)."""
        mid = "rpv4-%d" % os.getpid()
        with TempState() as ts:
            ledger, cwd = self._reuse_case(ts, mid)
            ev = PKG._fresh_verify_manifest(ledger)
            self.assertIsNotNone(ev)
            self.assertEqual(ev["reuse_by"], "content-hash", ev)
            self.assertTrue(ev["contentHash"], ev)
            self.assertGreater(ev["age_s"], 1800, ev)  # idade NÃO bloqueia mais

    def test_altered_proven_file_reexecutes(self):
        mid = "rpv5-%d" % os.getpid()
        with TempState() as ts:
            ledger, cwd = self._reuse_case(
                ts, mid, tamper=lambda c: (c / "prova.txt").write_text(
                    "conteudo ALTERADO\n", encoding="utf-8"))
            self.assertIsNone(PKG._fresh_verify_manifest(ledger))  # re-executa runner

    def test_altered_run_spec_reexecutes(self):
        mid = "rpv6-%d" % os.getpid()
        with TempState() as ts:
            ledger, cwd = self._reuse_case(ts, mid, with_hash=True)
            # run alterado DEPOIS do hash gravado (hash do manifesto ficou velho)
            p = Path(cwd) / ("verify-%s.json" % mid)
            data = json.loads(p.read_text(encoding="utf-8"))
            data["cmd"][0]["run"] = "echo diferente"
            p.write_text(json.dumps(data), encoding="utf-8")
            self.assertIsNone(PKG._fresh_verify_manifest(ledger))

    def test_legacy_manifest_keeps_mtime_rule(self):
        """Sem contentHash: velho >30min -> None (re-executa); fresco -> reuso mtime."""
        mid = "rpv7-%d" % os.getpid()
        with TempState() as ts:
            ledger, cwd = self._reuse_case(ts, mid, age_s=1861, with_hash=False)
            self.assertIsNone(PKG._fresh_verify_manifest(ledger))       # velho, legado
            ledger, cwd = self._reuse_case(ts, mid, age_s=5, with_hash=False)
            ev = PKG._fresh_verify_manifest(ledger)
            self.assertIsNotNone(ev)
            self.assertNotIn("contentHash", ev)                         # caminho mtime

    def test_kill_switch_beats_content_hash(self):
        mid = "rpv8-%d" % os.getpid()
        with TempState() as ts:
            ledger, _cwd = self._reuse_case(ts, mid)
            with mock.patch.dict(os.environ, {"MISSION_CLOSE_VERIFY_REUSE": "0"}):
                self.assertIsNone(PKG._fresh_verify_manifest(ledger))

    # ================================================================ T9 E2E dryRun
    def _dry(self, mid, env=None, subprocess_side_effect=None):
        envd = dict(env or {})
        se = subprocess_side_effect if subprocess_side_effect is not None else _real_runner()
        with mock.patch.dict(os.environ, envd, clear=False), \
             mock.patch.object(mc, "run_herdr", track_calls()[1]), \
             mock.patch.object(PKG.subprocess, "run", side_effect=se):
            return json.loads(PKG.handle_mission_close({"missionId": mid, "dryRun": True}))

    def test_dryrun_reuse_fresh_content_hash_no_runner(self):
        """E2E: dryRun com manifest 31min + contentHash válido -> reuse-fresh com
        evidence.contentHash; runner NUNCA executado (close < 30s sem re-execução)."""
        mid = "rpv9a-%d" % os.getpid()
        with TempState() as ts:
            ledger, cwd = self._reuse_case(ts, mid)

            def _no_runner(cmd, *a, **kw):
                raise AssertionError("runner re-executado no reuso por hash: %r" % (cmd,))

            t0 = time.time()
            out = self._dry(mid, subprocess_side_effect=_no_runner)
            self.assertTrue(out["ok"], out)
            self.assertLess(time.time() - t0, 30)  # alvo do contrato: E2E < 30s
            dv = [s for s in out["steps"] if s["step"] == "deliver_verify"][0]
            self.assertEqual(dv["verdict"], "pass", dv)
            self.assertEqual(dv["resolved_by"], "reuse-fresh", dv)
            self.assertEqual(dv["evidence"]["reuse_by"], "content-hash", dv)
            self.assertTrue(dv["evidence"]["contentHash"], dv)

    def test_dryrun_altered_file_reexecutes_real_runner(self):
        """E2E: arquivo provado alterado -> dryRun NÃO reusa; runner REAL executa e
        o passo vem do caminho antigo (resolved_by != reuse-fresh)."""
        mid = "rpv9b-%d" % os.getpid()
        with TempState() as ts:
            ledger, cwd = self._reuse_case(
                ts, mid, tamper=lambda c: (c / "prova.txt").write_text(
                    "conteudo ALTERADO\n", encoding="utf-8"))
            out = self._dry(mid)
            self.assertTrue(out["ok"], out)
            dv = [s for s in out["steps"] if s["step"] == "deliver_verify"][0]
            self.assertNotEqual(dv.get("resolved_by"), "reuse-fresh", dv)
            self.assertEqual(dv["verdict"], "pass", dv)  # runner real verde no echo/prova

    # ================================================================ T10 shards
    def test_shard_plan_covers_all_classes_once(self):
        import test_mission_ops as tmo
        classes = {c.__name__ for c in tmo._suite_classes()}
        self.assertGreater(len(classes), 20)
        for count in (2, 3):
            plan = tmo._shard_plan(count)
            merged = []
            for names in plan.values():
                merged.extend(names)
            self.assertEqual(sorted(merged), sorted(classes), count)
            self.assertEqual(len(merged), len(set(merged)), count)  # sem duplicata
        plan2 = tmo._shard_plan(2)
        self.assertEqual(len(plan2[0]) + len(plan2[1]), len(classes))

    # ================================================================ T11 dance knobs
    def test_dance_knobs_exist(self):
        self.assertIsInstance(PKG._DANCE_KEY_DELAY_S, float)
        self.assertIsInstance(PKG._DANCE_REDRAW_S, float)
        self.assertGreaterEqual(PKG._DANCE_KEY_DELAY_S, 0.0)
        self.assertGreaterEqual(PKG._DANCE_REDRAW_S, 0.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
