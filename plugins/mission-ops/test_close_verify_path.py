"""CLOSE-VERIFY-PATH-01 (02/10) — guard do close usa o mesmo resolved_by do verify.

R1: o deliver_verify do close resolve o manifesto pela MESMA função do verify
    (/opt/deliver-verify/verify.py resolve_manifest_with_owner — RD-LOOP-01: canônico
    verify-<missionId>.json no STATE DIR; cwd-mission/cwd-legacy com owner==mission
    são lidos uma vez e MIGRADOS; verify.json estrangeiro/sem owner é ignorado).
R2: verdict=pass RECENTE (< 30 min) do verify é prova E2E: o close não marca
    unverified_consequence nem reabre por verify_required (ex.: gate fail-open
    por timeout, verify passou minutos antes). Relatório velho/corrompido não prova.
R3: manifesto com nome verify-<missionId>.json fecha com badge (o template antigo
    dizia que NÃO fechava); verify.json legado (owner==mission) segue fechando —
    agora via migração para o state dir (RD-LOOP-01).

Run: python3 test_close_verify_path.py   (herdr 100% mockado; estado em tmp)
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


class TestCloseVerifyPath(unittest.TestCase):

    def _close(self, mid, subprocess_side_effect=None):
        """Close com herdr mockado e runner do verify redirecionado para o state tmp."""
        se = subprocess_side_effect if subprocess_side_effect is not None else _real_runner()
        with mock.patch.object(mc, "run_herdr", track_calls()[1]), \
             mock.patch.object(mc.time, "sleep"), \
             mock.patch.object(mc, "pane_exists", return_value=False), \
             mock.patch.object(PKG.nf, "mission_completed",
                               return_value={"ok": True, "emitted": True}), \
             mock.patch.object(PKG.nf, "mission_reopened",
                               return_value={"ok": True, "emitted": True}), \
             mock.patch.object(PKG.subprocess, "run", side_effect=se), \
             mock.patch.object(PKG.vg, "emit_bus_event"):
            return json.loads(PKG.handle_mission_close({"missionId": mid}))

    @staticmethod
    def _mk_cwd(ts: TempState, mid: str, name: str, owner: str = None):
        cwd = Path(ts.tmp) / "cwd"
        cwd.mkdir(parents=True, exist_ok=True)
        (cwd / name).write_text(json.dumps(
            {"mission": owner or mid,
             "cmd": [{"run": "echo ok", "expect_exit": 0, "timeout": 30}]}),
            encoding="utf-8")
        return str(cwd)

    # ================================================================ R3 + R1 cwd-mission
    def test_badge_via_verify_mission_named_manifest(self):
        """Manifesto verify-<missionId>.json (nome específico) fecha com badge.
        Antes da missão o guard só lia verify.json — worker seguindo o template novo
        ficava sem badge / com warning fantasma."""
        mid = "cvp1-%d" % os.getpid()
        with TempState() as ts:
            cwd = self._mk_cwd(ts, mid, "verify-%s.json" % mid)
            mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched", "cwd": cwd})
            out = self._close(mid)
            dv = [s for s in out["steps"] if s["step"] == "deliver_verify"][0]
            self.assertEqual(dv["verdict"], "pass", dv)
            self.assertEqual(dv["resolved_by"], "state-dir-migrated")
            led = mc.load_ledger(mid)
            self.assertEqual(led["status"], "closed")
            self.assertEqual(led["verified_e2e"]["verdict"], "pass")
            self.assertNotIn("consequenceWarning", led)
            # SUP-OBEY-01: warning typed do guard de fecho (cwd sem RELATORIO)
            # ORCH-SPEND-LEDGER-01: fail-open do custo (transporte off na suíte) é warning honesto.
            self.assertEqual([w.get("code") for w in out.get("warnings", [])
                              if isinstance(w, dict)],
                             ["mission_cost_unmeasured", "relatorio_nao_entregado_chat",
                              "relatorio_integra_missing", "violates-obligation-O1"])  # GUARD-SUPERVISOR-READONLY-01 (RELATÓRIO-INTEGRA)

    def test_badge_via_legacy_verify_json_still_works(self):
        """NÃO-QUEBRA: verify.json legado (owner=mission) no cwd segue fechando com badge."""
        mid = "cvp2-%d" % os.getpid()
        with TempState() as ts:
            cwd = self._mk_cwd(ts, mid, "verify.json")
            mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched", "cwd": cwd})
            out = self._close(mid)
            dv = [s for s in out["steps"] if s["step"] == "deliver_verify"][0]
            self.assertEqual(dv["verdict"], "pass", dv)
            self.assertEqual(dv["resolved_by"], "state-dir-migrated")
            led = mc.load_ledger(mid)
            self.assertEqual(led["verified_e2e"]["verdict"], "pass")

    # ================================================================ R1 search-specific
    def test_manifest_of_other_owner_found_in_extra_dir(self):
        """Mesma resolução do verify: verify.json no cwd de OUTRA missão (colisão) não
        engana o close — o manifesto correto em extraDirs é encontrado (search-specific)."""
        mid = "cvp3-%d" % os.getpid()
        with TempState() as ts:
            cwd = self._mk_cwd(ts, mid, "verify.json", owner="outra-missao")
            extra = Path(ts.tmp) / "extra"
            extra.mkdir()
            (extra / ("verify-%s.json" % mid)).write_text(json.dumps(
                {"mission": mid, "cmd": [{"run": "echo ok", "expect_exit": 0, "timeout": 30}]}),
                encoding="utf-8")
            mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched", "cwd": cwd,
                            "extraDirs": [str(extra)]})
            out = self._close(mid)
            dv = [s for s in out["steps"] if s["step"] == "deliver_verify"][0]
            self.assertEqual(dv["verdict"], "pass", dv)
            self.assertEqual(dv["resolved_by"], "state-dir-migrated")

    # ================================================================ R2 prova recente
    def test_recent_verify_pass_prevents_unverified_consequence(self):
        """Gate fail-open AGORA (timeout do runner) + verify PASSOU minutos antes
        (relatório < 30 min) → close não marca unverified_consequence."""
        mid = "cvp4-%d" % os.getpid()
        with TempState() as ts:
            cwd = self._mk_cwd(ts, mid, "verify-%s.json" % mid)
            mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched", "cwd": cwd,
                            "consequence": True, "consequenceSource": "prompt",
                            "consequenceMatches": ["deploy"]})
            # relatório de um mission_verify standalone minutos antes
            mc.STATE_DIR.mkdir(parents=True, exist_ok=True)
            rep = Path(str(mc.STATE_DIR)) / ("%s.verify.json" % mid)
            rep.write_text(json.dumps({"verdict": "pass"}), encoding="utf-8")
            out = self._close(mid, subprocess_side_effect=subprocess.TimeoutExpired("py", 35))
            cg = [s for s in out["steps"] if s["step"] == "consequence_guard"][0]
            self.assertEqual(cg["verdict"], "proof_recent_verify_pass", cg)
            # SUP-OBEY-01: warning typed do guard de fecho (cwd sem RELATORIO)
            # ORCH-SPEND-LEDGER-01: fail-open do custo (transporte off na suíte) é warning honesto.
            self.assertEqual([w.get("code") for w in out.get("warnings", [])
                              if isinstance(w, dict)],
                             ["mission_cost_unmeasured", "relatorio_nao_entregado_chat",
                              "relatorio_integra_missing", "violates-obligation-O1"])  # GUARD-SUPERVISOR-READONLY-01 (RELATÓRIO-INTEGRA)
            led = mc.load_ledger(mid)
            self.assertEqual(led["status"], "closed")
            self.assertNotIn("consequenceWarning", led)

    def test_recent_verify_pass_prevents_verify_required_reopen(self):
        """Escopo DECLARADO + sem manifesto em lugar algum, MAS verify passou há minutos
        → não reabre (verify_required): o relatório recente é prova."""
        mid = "cvp5-%d" % os.getpid()
        with TempState() as ts:
            cwd = Path(ts.tmp) / "cwd"
            cwd.mkdir()
            mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched", "cwd": str(cwd),
                            "consequence": True, "consequenceSource": "dispatch",
                            "consequenceMatches": ["delete"]})
            mc.STATE_DIR.mkdir(parents=True, exist_ok=True)
            (Path(str(mc.STATE_DIR)) / ("%s.verify.json" % mid)).write_text(
                json.dumps({"verdict": "pass"}), encoding="utf-8")
            out = self._close(mid)
            self.assertTrue(out["ok"], out)
            self.assertNotIn("reopenedByVerifyRequired", out)
            led = mc.load_ledger(mid)
            self.assertEqual(led["status"], "closed")

    def test_stale_verify_pass_does_not_prove(self):
        """Relatório > 30 min NÃO é prova: fail-open + relatório velho → warning mantido."""
        mid = "cvp6-%d" % os.getpid()
        with TempState() as ts:
            cwd = self._mk_cwd(ts, mid, "verify-%s.json" % mid)
            mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched", "cwd": cwd,
                            "consequence": True, "consequenceSource": "prompt",
                            "consequenceMatches": ["deploy"]})
            mc.STATE_DIR.mkdir(parents=True, exist_ok=True)
            rep = Path(str(mc.STATE_DIR)) / ("%s.verify.json" % mid)
            rep.write_text(json.dumps({"verdict": "pass"}), encoding="utf-8")
            os.utime(rep, (time.time() - 3600, time.time() - 3600))  # 1h atrás
            out = self._close(mid, subprocess_side_effect=subprocess.TimeoutExpired("py", 35))
            cg = [s for s in out["steps"] if s["step"] == "consequence_guard"][0]
            self.assertEqual(cg["verdict"], "closed_unverified_consequence", cg)
            self.assertIn("warnings", out)

    def test_close_without_verify_keeps_warning(self):
        """Close sem manifesto em lugar algum (escopo heurístico) → warning mantido.
        Comportamento pré-existente preservado."""
        mid = "cvp7-%d" % os.getpid()
        with TempState() as ts:
            cwd = Path(ts.tmp) / "cwd"
            cwd.mkdir()
            mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched", "cwd": str(cwd),
                            "consequence": True, "consequenceSource": "heuristic",
                            "consequenceMatches": ["delete"]})
            out = self._close(mid)
            cg = [s for s in out["steps"] if s["step"] == "consequence_guard"][0]
            self.assertEqual(cg["verdict"], "closed_unverified_consequence", cg)
            self.assertIn("warnings", out)

    # ================================================================ helper unitário
    def test_recent_verify_pass_helper(self):
        mid = "cvp8-%d" % os.getpid()
        with TempState():
            mc.STATE_DIR.mkdir(parents=True, exist_ok=True)
            rep = Path(str(mc.STATE_DIR)) / ("%s.verify.json" % mid)
            self.assertFalse(PKG._recent_verify_pass(mid))          # sem relatório
            rep.write_text(json.dumps({"verdict": "fail"}), encoding="utf-8")
            self.assertFalse(PKG._recent_verify_pass(mid))          # verdict vermelho
            rep.write_text(json.dumps({"verdict": "pass"}), encoding="utf-8")
            self.assertTrue(PKG._recent_verify_pass(mid))           # pass recente
            os.utime(rep, (time.time() - 1801, time.time() - 1801))
            self.assertFalse(PKG._recent_verify_pass(mid))          # 30min1s = velho
            rep.write_text("não é json", encoding="utf-8")
            self.assertFalse(PKG._recent_verify_pass(mid))          # corrompido

    def test_template_tells_correct_manifest_name(self):
        """O wrapper de dispatch não pode mais dizer que verify-<missionId>.json NÃO fecha."""
        p = mc.dispatch_prompt("/x/missao.md")
        self.assertIn("verify-<missionId>.json", p)
        self.assertNotIn("verify-<missionId>.json NÃO fecha", p)


if __name__ == "__main__":
    unittest.main(verbosity=2)