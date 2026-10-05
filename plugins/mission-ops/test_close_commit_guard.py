"""CLOSE-COMMIT-01 tests — guard de close contra entrega não-commitada.

Classe recorrente (MISSION-MANIFEST-PATCH-01-R2 fechou PASS com src/test/RELATORIO
untracked): o close verificava o relatório, mas nunca o git. Cobre o contrato:
worktree limpo -> close normal; untracked/modificado em deploy path -> badge
verified_e2e bloqueado + closeWarning acionável + auto-nudge ao worker; session
files (verify*/.claude/.glgpd) ignorados; não-repo/cancel -> caminho inalterado;
red-then-green: suja -> bloqueia, commita -> verde.

Run: python3 test_close_commit_guard.py
"""

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, PLUGIN_DIR)


def _load_pkg():
    # REUSE-LOADED (03/10): re-executar __init__.py cria um pacote NOVO e o
    # último exec vence o mc.SPOOL_HOOK (fecha sobre _MISSION_SPOOL do módulo
    # errado) → poluição entre suítes. Reuse o pacote já carregado.
    _pre = sys.modules.get("mission_ops")
    if _pre is not None and hasattr(_pre, "mc"):
        return _pre
    spec = importlib.util.spec_from_file_location(
        "mission_ops", os.path.join(PLUGIN_DIR, "__init__.py"),
        submodule_search_locations=[PLUGIN_DIR])
    pkg = importlib.util.module_from_spec(spec)
    sys.modules["mission_ops"] = pkg
    spec.loader.exec_module(pkg)
    pkg._gpu_up_for_mission = lambda mission_id: True
    pkg._qwen_bridge_alive_real = pkg._qwen_bridge_alive
    pkg._qwen_bridge_alive = lambda timeout=2.0: True
    return pkg


PKG = _load_pkg()
mc = PKG.mc
cg = PKG.cg

# TempState/fake_herdr do test_mission_ops (mesmo molde da suíte canônica)
from test_mission_ops import TempState, track_calls  # noqa: E402


def make_git_repo(tmp: str, with_verify: bool = True) -> Path:
    """Repo git mínimo com commit base (user configurado p/ commit determinístico).
    verify.json no cwd = chave do deliver-verify (session file — o guard ignora)."""
    d = Path(tmp) / "ccg-repo"
    d.mkdir()
    git = lambda *a: subprocess.run(  # noqa: E731
        ["git", "-C", str(d)] + list(a), check=True, capture_output=True)
    git("init", "-q")
    git("config", "user.email", "t@t")
    git("config", "user.name", "t")
    (d / "README.md").write_text("base\n", encoding="utf-8")
    if with_verify:
        (d / "verify.json").write_text("{}", encoding="utf-8")
    git("add", "-A")
    git("commit", "-qm", "base")
    return d


def green_verify():
    return mock.Mock(returncode=0, stdout=json.dumps(
        {"verdict": "pass", "checks": [{"id": "svc", "ok": True}]}).encode())


class TestClassifyWorktree(unittest.TestCase):
    """close_commit_guard.classify_worktree — classificação determinística."""

    def _classify(self, d):
        return cg.classify_worktree(str(d))

    def test_clean_worktree(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = make_git_repo(tmp)
            out = self._classify(d)
            self.assertTrue(out["repo"])
            self.assertEqual(out["deliveryPaths"], [])
            self.assertEqual(out["sessionPaths"], [])
            self.assertTrue(out["head"])

    def test_deploy_paths_modified_and_untracked(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = make_git_repo(tmp)
            (d / "src").mkdir()
            (d / "src" / "bar.ts").write_text("export {};\n")
            subprocess.run(["git", "-C", str(d), "add", "-A"], check=True,
                           capture_output=True)
            subprocess.run(["git", "-C", str(d), "commit", "-qm", "src"], check=True,
                           capture_output=True)
            (d / "src" / "bar.ts").write_text("export const x = 1;\n")  # modificado
            (d / "src" / "new.ts").write_text("novo\n")                 # untracked
            (d / "scripts").mkdir()
            (d / "scripts" / "run.sh").write_text("novo\n")
            out = self._classify(d)
            self.assertIn("src/bar.ts", out["deliveryPaths"])
            self.assertIn("src/new.ts", out["deliveryPaths"])
            self.assertIn("scripts/run.sh", out["deliveryPaths"])

    def test_package_json_modified(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = make_git_repo(tmp)
            (d / "package.json").write_text('{"name": "x"}\n')
            subprocess.run(["git", "-C", str(d), "add", "-A"], check=True,
                           capture_output=True)
            subprocess.run(["git", "-C", str(d), "commit", "-qm", "pkg"], check=True,
                           capture_output=True)
            (d / "package.json").write_text('{"name": "y"}\n')
            out = self._classify(d)
            self.assertIn("package.json", out["deliveryPaths"])

    def test_new_component_file_untracked(self):
        # "arquivos novos do componente": untracked com extensão de código-fonte
        # (a forma do incidente: módulo entregue, fechado, nunca commitado).
        with tempfile.TemporaryDirectory() as tmp:
            d = make_git_repo(tmp)
            (d / "novo_modulo.py").write_text("x = 1\n")
            out = self._classify(d)
            self.assertIn("novo_modulo.py", out["deliveryPaths"])

    def test_relatorio_counts_as_delivery(self):
        # Contrato CLOSE-COMMIT-01: RELATORIO NÃO é session file — faz parte do
        # commit (foi ele que se perdeu no incidente src/test/RELATORIO).
        with tempfile.TemporaryDirectory() as tmp:
            d = make_git_repo(tmp)
            (d / "RELATORIO-close-commit-01.md").write_text("rel\n")
            out = self._classify(d)
            self.assertIn("RELATORIO-close-commit-01.md", out["deliveryPaths"])
            self.assertNotIn("RELATORIO-close-commit-01.md", out["sessionPaths"])

    def test_session_files_ignored(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = make_git_repo(tmp)
            for p in ("verify.json", "verify-CLOSE-COMMIT-01.json", "m.verify.json",
                      ".claude/settings.json", ".glgpd/audit.jsonl",
                      ".claude-config/cache/changelog.md",
                      "__pycache__/mod.pyc", "mod.bak-close-commit-01",
                      "mod.destroyed-20261002-forense"):
                fp = d / p
                fp.parent.mkdir(parents=True, exist_ok=True)
                fp.write_text("x\n")
            out = self._classify(d)
            self.assertEqual(out["deliveryPaths"], [])
            self.assertEqual(len(out["sessionPaths"]), 9)

    def test_other_paths_not_delivery(self):
        # README/notes não são deploy path nem novo componente -> otherPaths.
        with tempfile.TemporaryDirectory() as tmp:
            d = make_git_repo(tmp)
            (d / "README.md").write_text("mudou\n")
            (d / "notes.md").write_text("novo\n")
            out = self._classify(d)
            self.assertEqual(out["deliveryPaths"], [])
            self.assertEqual(sorted(out["otherPaths"]), ["README.md", "notes.md"])

    def test_not_a_repo(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp) / "nao-repo"
            d.mkdir()
            (d / "src").mkdir()
            (d / "src" / "a.ts").write_text("x\n")
            out = self._classify(d)
            self.assertFalse(out["repo"])
            self.assertEqual(out["deliveryPaths"], [])

    def test_missing_cwd(self):
        out = cg.classify_worktree("/tmp/nao-existe-ccg-%d" % os.getpid())
        self.assertFalse(out["repo"])
        self.assertEqual(out["deliveryPaths"], [])


class TestCloseWiring(unittest.TestCase):
    """Guard conectado ao handle_mission_close — red-then-green no molde da suíte."""

    def _close(self, args, verify_proc=None, pane_exists=False):
        calls, track = track_calls()
        patches = [mock.patch.object(mc, "run_herdr", track),
                   mock.patch.object(mc.time, "sleep"),
                   mock.patch.object(mc, "pane_exists", return_value=pane_exists),
                   mock.patch.object(mc, "deliver_prompt", return_value=(True, None)),
                   mock.patch.object(PKG.nf, "mission_completed",
                                     return_value={"ok": True, "emitted": True}),
                   mock.patch.object(PKG.nf, "mission_reopened",
                                     return_value={"ok": True, "emitted": True})]
        if verify_proc is not None:
            patches.append(mock.patch.object(PKG.subprocess, "run",
                                             return_value=verify_proc))
        with mock.patch.object(PKG.vg, "emit_bus_event"):
            for p in patches:
                p.start()
            try:
                out = json.loads(PKG.handle_mission_close(args))
                return (out, PKG.nf.mission_completed.call_args, mc.deliver_prompt)
            finally:
                for p in reversed(patches):
                    p.stop()

    def _ledger(self, mid, cwd):
        mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                        "status": "dispatched", "cwd": str(cwd)})
        # RD-MOPS-RED-01: canônico do manifesto é verify-<mid>.json no state dir
        # (RD-LOOP-01, commit d95aba9) — sem manifesto o close não roda o runner
        # (fallback honesto: nunca prova fabricada) e o badge não nasce. Com o
        # manifesto canônico o deliver_verify roda (verify_proc mockado) e o
        # guard de commit trava/libera o badge como o contrato pede.
        with open(os.path.join(str(mc.STATE_DIR), "verify-%s.json" % mid),
                  "w", encoding="utf-8") as f:
            json.dump({"mission": mid,
                       "cmd": [{"run": "echo ok", "expect_exit": 0, "timeout": 30}]}, f)

    def test_red_untracked_deploy_path_blocks_badge_and_warns(self):
        # (contrato) untracked em deploy path -> badge bloqueado + closeWarning + nudge.
        with tempfile.TemporaryDirectory() as tmp:
            with TempState() as ts:
                d = make_git_repo(tmp)
                (d / "src").mkdir()
                (d / "src" / "feat.ts").write_text("novo\n")
                mid = "ccg1-test-%d" % os.getpid()
                self._ledger(mid, d)
                out, completed, deliver = self._close({"missionId": mid},
                                                      verify_proc=green_verify())
                led = mc.load_ledger(mid)
                self.assertEqual(led["status"], "closed")  # guard não reabre
                self.assertNotIn("verified_e2e", led)       # badge bloqueado
                self.assertIn("entrega não-commitada", led["closeWarning"])
                self.assertIn("src/feat.ts", led["closeWarning"])
                self.assertIn("recover-%s-fim" % mid, led["closeWarning"])
                g = [s for s in out["steps"] if s["step"] == "close_commit_guard"][0]
                self.assertEqual(g["verdict"], "uncommitted_delivery")
                self.assertTrue(g["badgeBlocked"])
                self.assertIn("src/feat.ts", g["paths"])
                nud = [s for s in out["steps"]
                       if s["step"] == "close_commit_guard_nudge"][0]
                self.assertTrue(nud["ok"])
                self.assertIn("pane inexistente", nud["note"])
                self.assertEqual(completed.kwargs["badge"], None)  # sem badge no bus
                self.assertFalse(out["ok"])

    def test_green_commit_the_artifacts_then_close(self):
        # (contrato) red-then-green: o mesmo dirt COMMITADO antes do close fecha verde
        # (badge preserved, sem closeWarning, guard verdict clean).
        with tempfile.TemporaryDirectory() as tmp:
            with TempState() as ts:
                d = make_git_repo(tmp)
                (d / "src").mkdir()
                (d / "src" / "feat.ts").write_text("novo\n")
                mid = "ccg2-red-%d" % os.getpid()
                self._ledger(mid, d)
                out, _c, _d = self._close({"missionId": mid}, verify_proc=green_verify())
                self.assertFalse(mc.load_ledger(mid).get("verified_e2e"))
                # remédio acionável: o worker commita os artefatos antes do PARE
                subprocess.run(["git", "-C", str(d), "add", "-A"], check=True,
                               capture_output=True)
                subprocess.run(["git", "-C", str(d), "commit", "-qm", "feat"],
                               check=True, capture_output=True)
                mid2 = "ccg2-green-%d" % os.getpid()
                self._ledger(mid2, d)
                out2, completed2, _d2 = self._close({"missionId": mid2},
                                                    verify_proc=green_verify())
                led2 = mc.load_ledger(mid2)
                self.assertTrue(out2["ok"])
                self.assertEqual(led2["status"], "closed")
                self.assertEqual(led2["verified_e2e"]["verdict"], "pass")
                # closeWarning do operator_channel pode existir; o do guard não
                self.assertNotIn("entrega não-commitada", led2.get("closeWarning") or "")
                g2 = [s for s in out2["steps"] if s["step"] == "close_commit_guard"][0]
                self.assertEqual(g2["verdict"], "clean")
                self.assertEqual(completed2.kwargs["badge"], "verified_e2e")

    def test_session_only_dirt_close_unchanged(self):
        # (contrato) session files (verify*/.claude) -> ignorados, close normal.
        with tempfile.TemporaryDirectory() as tmp:
            with TempState() as ts:
                d = make_git_repo(tmp)
                (d / ".claude").mkdir()
                (d / ".claude" / "state.json").write_text("{}", encoding="utf-8")
                mid = "ccg3-test-%d" % os.getpid()
                self._ledger(mid, d)
                out, completed, _d = self._close({"missionId": mid},
                                                 verify_proc=green_verify())
                led = mc.load_ledger(mid)
                self.assertTrue(out["ok"])
                self.assertEqual(led["verified_e2e"]["verdict"], "pass")
                self.assertNotIn("entrega não-commitada", led.get("closeWarning") or "")
                g = [s for s in out["steps"] if s["step"] == "close_commit_guard"][0]
                self.assertEqual(g["verdict"], "clean")
                self.assertEqual(completed.kwargs["badge"], "verified_e2e")

    def test_not_git_cwd_unchanged(self):
        with tempfile.TemporaryDirectory() as tmp:
            with TempState() as ts:
                d = Path(tmp) / "nao-repo-ccg"
                d.mkdir()
                (d / "src").mkdir()
                (d / "src" / "feat.ts").write_text("novo\n")
                (d / "verify.json").write_text("{}", encoding="utf-8")
                mid = "ccg4-test-%d" % os.getpid()
                self._ledger(mid, d)
                out, completed, _d = self._close({"missionId": mid},
                                                 verify_proc=green_verify())
                led = mc.load_ledger(mid)
                self.assertTrue(out["ok"])
                self.assertEqual(led["verified_e2e"]["verdict"], "pass")
                self.assertNotIn("entrega não-commitada", led.get("closeWarning") or "")
                g = [s for s in out["steps"] if s["step"] == "close_commit_guard"][0]
                self.assertEqual(g["verdict"], "not-git")
                self.assertEqual(completed.kwargs["badge"], "verified_e2e")

    def test_cancel_skips_guard(self):
        # Cancelamento governado (acceptUnverified+cancel) pula o guard, como pula o
        # deliver-verify — cancelamento não é claim de entrega.
        with tempfile.TemporaryDirectory() as tmp:
            with TempState() as ts:
                d = make_git_repo(tmp)
                (d / "src").mkdir()
                (d / "src" / "feat.ts").write_text("novo\n")
                mid = "ccg5-test-%d" % os.getpid()
                self._ledger(mid, d)
                out, _c, _d = self._close({"missionId": mid, "cancel": "true",
                                           "acceptUnverified": "cancelado pelo operator"})
                led = mc.load_ledger(mid)
                self.assertEqual(led["status"], "closed")
                self.assertNotIn("entrega não-commitada", led.get("closeWarning") or "")
                self.assertNotIn("close_commit_guard",
                                 [s["step"] for s in out["steps"]])

    def test_dirty_without_verify_manifest_still_warns(self):
        # Guard independe do deliver-verify: sem verify.json (sem badge de qualquer
        # forma) o dirt de entrega continua virando closeWarning acionável.
        with tempfile.TemporaryDirectory() as tmp:
            with TempState() as ts:
                d = make_git_repo(tmp, with_verify=False)
                (d / "novo_modulo.py").write_text("x = 1\n")
                mid = "ccg6-test-%d" % os.getpid()
                self._ledger(mid, d)
                # RD-MOPS-RED-01: escopo DESTE teste é close SEM manifesto — o
                # canônico criado por _ledger sai do state dir (sem manifesto o
                # close não roda o runner e não nasce badge; guard independe).
                os.remove(os.path.join(str(mc.STATE_DIR),
                                       "verify-%s.json" % mid))
                out, completed, _d = self._close({"missionId": mid})
                led = mc.load_ledger(mid)
                self.assertEqual(led["status"], "closed")
                self.assertIn("entrega não-commitada", led["closeWarning"])
                self.assertIn("novo_modulo.py", led["closeWarning"])
                g = [s for s in out["steps"] if s["step"] == "close_commit_guard"][0]
                self.assertEqual(g["verdict"], "uncommitted_delivery")
                self.assertFalse(g["badgeBlocked"])  # não havia badge para bloquear
                nud = [s for s in out["steps"]
                       if s["step"] == "close_commit_guard_nudge"][0]
                self.assertTrue(nud["ok"])  # sem pane vivo: só ledger + evento
                self.assertEqual(completed.kwargs["badge"], None)

    def test_nudge_with_live_pane(self):
        # CLOSE auto-nudge ao worker: pane vivo recebe o remédio com os paths exatos.
        with tempfile.TemporaryDirectory() as tmp:
            with TempState() as ts:
                d = make_git_repo(tmp)
                (d / "scripts").mkdir()
                (d / "scripts" / "deploy.sh").write_text("novo\n")
                mid = "ccg7-test-%d" % os.getpid()
                self._ledger(mid, d)
                out, _c, deliver = self._close({"missionId": mid},
                                               verify_proc=green_verify(),
                                               pane_exists=True)
                nud = [s for s in out["steps"]
                       if s["step"] == "close_commit_guard_nudge"][0]
                self.assertTrue(nud["ok"])
                self.assertNotIn("note", nud)
                deliver.assert_called_once()
                msg = deliver.call_args[0][1]
                self.assertIn("scripts/deploy.sh", msg)
                self.assertIn("commit os artefatos antes do PARE", msg)
                self.assertIn("recover-%s-fim" % mid, msg)


if __name__ == "__main__":
    unittest.main(verbosity=2)