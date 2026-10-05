"""CLOSE-SHIP-VISIBILITY-01 — guard "merged?" + auto-despacho SHIP consciente de voos.

Classe de incidente (ordem do operator 03/10): SNAPSHOT-WRAP-01 fechou PASS com o
entregável na branch do worktree SEM merge em main — ninguém percebeu por horas.
Contrato: close com branch não-mergeada -> shipState {merged:false, branch, headSha16}
+ evento unshipped_delivery + SHIP-<alvo>-01 despachada (caminho governado, prompt
enxuto determinístico); SHIP duplicada -> no_op; branch mergeada -> nada; missão
ativa dependente -> aviso no prompt da SHIP; prova E2E em voo -> SHIP fica
awaiting_ship_window e é despachada quando o voo aterrissar (close dela); tier-3
sem preauth -> prompt manda aguardar o operador (gate não interceptável).

Run: python3 test_close_ship.py
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


# ORDEM IMPORTA: test_mission_ops._load_pkg NÃO tem guard de reuso — ele cria um
# segundo módulo mission_ops e re-executa `cs._dispatch = lambda...`, que religa os
# globals do lambda ao módulo DELE. Carregando-o primeiro, o _load_pkg daqui reusa
# esse módulo e o mock.patch.object(PKG, "handle_mission_dispatch") intercepta o
# que o lambda resolve (mesmo objeto de módulo).
from test_mission_ops import TempState, track_calls  # noqa: E402
from test_close_commit_guard import green_verify  # noqa: E402

PKG = _load_pkg()  # reusa sys.modules["mission_ops"] criado por test_mission_ops
mc = PKG.mc
cg = PKG.cg
cs = PKG.cs

READY = "? for shortcuts"


def git(d, *a):
    return subprocess.run(["git", "-C", str(d)] + list(a), check=True,
                          capture_output=True)


def make_ship_repo(tmp, name="ship-repo", with_verify=True):
    """Repo determinístico com main explícita (git init default varia)."""
    d = Path(tmp) / name
    d.mkdir()
    git(d, "init", "-q")
    git(d, "config", "user.email", "t@t")
    git(d, "config", "user.name", "t")
    (d / "README.md").write_text("base\n", encoding="utf-8")
    if with_verify:
        (d / "verify.json").write_text("{}", encoding="utf-8")
    git(d, "add", "-A")
    git(d, "commit", "-qm", "base")
    git(d, "branch", "-m", "main")
    return d


def commit_branch(d, branch, fname, content="x = 1\n", base="main"):
    """Branch com 1 commit de entrega (worktree limpo)."""
    git(d, "checkout", "-q", base)
    git(d, "checkout", "-q", "-b", branch)
    (d / "src").mkdir(exist_ok=True)
    (d / "src" / fname).write_text(content, encoding="utf-8")
    git(d, "add", "-A")
    git(d, "commit", "-qm", branch)


def ship_id_for(d):
    return cs.ship_mission_id(str(d))


class TestClassifyShip(unittest.TestCase):
    """close_commit_guard.classify_ship — guard "merged?" determinístico."""

    def test_unmerged_branch(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = make_ship_repo(tmp)
            commit_branch(d, "feat-a", "a.ts")
            s = cg.classify_ship(str(d))
            self.assertTrue(s["repo"])
            self.assertTrue(s["applicable"])
            self.assertEqual(s["branch"], "feat-a")
            self.assertEqual(s["mainBranch"], "main")
            self.assertFalse(s["merged"])
            self.assertFalse(s["diverged"])
            self.assertTrue(s["headSha16"])
            self.assertTrue(s["mainSha16"])

    def test_merged_branch(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = make_ship_repo(tmp)
            commit_branch(d, "feat-m", "m.ts")
            git(d, "checkout", "-q", "main")
            git(d, "merge", "-q", "--no-ff", "-m", "merge", "feat-m")
            git(d, "checkout", "-q", "feat-m")
            s = cg.classify_ship(str(d))
            self.assertFalse(s["applicable"])
            self.assertTrue(s["merged"])

    def test_diverged_branch(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = make_ship_repo(tmp)
            commit_branch(d, "feat-d", "d.ts")
            git(d, "checkout", "-q", "main")
            (d / "main.txt").write_text("main avançou\n", encoding="utf-8")
            git(d, "add", "-A")
            git(d, "commit", "-qm", "main avança")
            git(d, "checkout", "-q", "feat-d")
            s = cg.classify_ship(str(d))
            self.assertTrue(s["applicable"])
            self.assertTrue(s["diverged"])

    def test_mainline_delivery_not_applicable(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = make_ship_repo(tmp)  # cwd na main
            s = cg.classify_ship(str(d))
            self.assertFalse(s["applicable"])
            self.assertTrue(s["merged"])

    def test_not_a_repo(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp) / "nao-repo-ship"
            d.mkdir()
            s = cg.classify_ship(str(d))
            self.assertFalse(s["repo"])
            self.assertFalse(s["applicable"])


class TestShipHelpers(unittest.TestCase):
    """close_ship — target/id, dependentes, gate de voo E2E."""

    def test_ship_target_sanitize(self):
        self.assertEqual(cs.ship_target("/a/b/mission-ops"), "mission-ops")
        self.assertEqual(cs.ship_target("/a/b/repo~1"), "repo-1")
        self.assertEqual(cs.ship_mission_id("/x/y/mission-ops"), "SHIP-mission-ops-01")

    def test_dependents_in_repo(self):
        with tempfile.TemporaryDirectory() as tmp, TempState() as ts:
            d = make_ship_repo(tmp)
            mc.save_ledger({"missionId": "dep-1", "paneId": "w1:p1", "status":
                            "dispatched", "cwd": str(d)})
            mc.save_ledger({"missionId": "outro-1", "paneId": "w1:p2", "status":
                            "dispatched", "cwd": str(ts.tmp)})
            mc.save_ledger({"missionId": "fechada-1", "paneId": "w1:p3", "status":
                            "closed", "cwd": str(d)})
            deps = cs.dependents_in_repo(str(d), ["dep-1"])
            self.assertEqual([x["missionId"] for x in deps], [])  # excluído
            deps2 = cs.dependents_in_repo(str(d))
            self.assertIn("dep-1", [x["missionId"] for x in deps2])
            self.assertNotIn("outro-1", [x["missionId"] for x in deps2])
            self.assertNotIn("fechada-1", [x["missionId"] for x in deps2])

    def test_e2e_in_flight_last_event(self):
        with tempfile.TemporaryDirectory() as tmp, TempState() as ts:
            d = make_ship_repo(tmp)
            mc.save_ledger({"missionId": "e2e-1", "paneId": "w1:p9", "status":
                            "dispatched", "cwd": str(d), "consequence": True})
            mc.append_event("e2e-1", "w1:p9", "deliver_verify", detail="prova em curso")
            fl = cs.e2e_in_flight(str(d))
            self.assertEqual(len(fl), 1)
            self.assertEqual(fl[0]["missionId"], "e2e-1")
            self.assertTrue(fl[0]["signal"].startswith("last_event:"))

    def test_prompt_contract(self):
        content = cs.build_ship_prompt(
            "orig-01", "/repo", "feat-a", "main", "0123456789abcdef",
            "SHIP-repo-01", [{"missionId": "dep-1", "path": "/repo/wt"}], True)
        self.assertIn("engineering.git.merge", content)
        self.assertIn("sourceBranch=feat-a, into=main", content)
        self.assertIn("DRIFT", content)
        self.assertIn("merge de main PARA feat-a", content)
        self.assertIn("engineering.git.push", content)
        self.assertIn("engineering.release.pipeline", content)
        self.assertIn("preauth do operador", content)
        self.assertIn("AGUARDE", content)
        self.assertIn("nunca contorne", content)
        self.assertIn("voo dependente", content)
        self.assertIn("dep-1", content)
        self.assertIn("NÃO rebaseie o worktree", content)


class TestCloseWiring(unittest.TestCase):
    """Guard conectado ao handle_mission_close — molde da suíte canônica."""

    def _close(self, args, verify_proc=None, live_dispatch=False, pane_exists=False):
        from test_mission_ops import track_calls
        calls, track = track_calls()
        dispatch_calls = []

        def fake_dispatch(a):
            dispatch_calls.append(dict(a))
            led = {"missionId": a["missionId"], "paneId": "w9:pship", "tabId": "t-ship",
                   "status": "dispatched", "promptFile": a["promptFile"],
                   "cwd": a["cwd"], "consequence": True,
                   "spawned_by": a.get("spawnedBy"), "createdAt": mc._now(),
                   "updatedAt": mc._now()}
            mc.save_ledger(led)
            return json.dumps({"ok": True, "status": "dispatched",
                               "missionId": a["missionId"], "paneId": "w9:pship",
                               "promptFile": a["promptFile"]})

        patches = [mock.patch.object(mc, "run_herdr", track),
                   mock.patch.object(mc.time, "sleep"),
                   mock.patch.object(mc, "pane_exists", return_value=pane_exists),
                   mock.patch.object(mc, "deliver_prompt", return_value=(True, None)),
                   mock.patch.object(PKG.nf, "mission_completed",
                                     return_value={"ok": True, "emitted": True}),
                   mock.patch.object(PKG.nf, "mission_reopened",
                                     return_value={"ok": True, "emitted": True})]
        if not live_dispatch:
            patches.append(mock.patch.object(PKG, "handle_mission_dispatch",
                                             side_effect=fake_dispatch))
        else:
            # despacho REAL: herdr mockado no molde do test_chain_dispatch
            tc = mock.Mock(return_value=("t-ship", "w9:pship", None))
            patches += [
                mock.patch.object(mc, "tab_create", tc),
                mock.patch.object(mc, "tab_rename", return_value=None),
                mock.patch.object(mc, "run_command", return_value=None),
                mock.patch.object(mc, "wait_output", return_value=(READY, None)),
                mock.patch.object(mc, "latest_session_id", return_value=None),
            ]
        if verify_proc is not None:
            patches.append(mock.patch.object(PKG.subprocess, "run",
                                             return_value=verify_proc))
        with mock.patch.dict(os.environ, {"HERDR_PANE_ID": ""}), \
             mock.patch.object(PKG.vg, "emit_bus_event"):
            for p in patches:
                p.start()
            try:
                out = json.loads(PKG.handle_mission_close(args))
                return out, dispatch_calls
            finally:
                for p in reversed(patches):
                    p.stop()

    def _ship_steps(self, out):
        g = [s for s in out["steps"] if s["step"] == "ship_guard"]
        d = [s for s in out["steps"] if s["step"] == "ship_dispatch"]
        return (g[0] if g else None), (d[0] if d else None)

    def test_unshipped_close_shipState_and_ship_dispatched(self):
        # (contrato) branch não-mergeada -> shipState + evento + SHIP-<alvo>-01 despachada
        with tempfile.TemporaryDirectory() as tmp:
            with TempState() as ts:
                cs.EVENTS_DIR = str(Path(ts.tmp) / "events")
                d = make_ship_repo(tmp)
                commit_branch(d, "feat-a", "a.ts")
                mid = "ship1-%d" % os.getpid()
                mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                                "status": "dispatched", "cwd": str(d)})
                out, dispatch_calls = self._close({"missionId": mid},
                                                 verify_proc=green_verify())
                led = mc.load_ledger(mid)
                self.assertEqual(led["status"], "closed")
                ss = led.get("shipState") or {}
                self.assertFalse(ss.get("merged"))
                self.assertEqual(ss.get("branch"), "feat-a")
                self.assertEqual(ss.get("mainBranch"), "main")
                self.assertTrue(ss.get("headSha16"))
                g, dsp = self._ship_steps(out)
                self.assertEqual(g["verdict"], "unshipped_delivery")
                self.assertEqual(dsp["verdict"], "dispatched")
                self.assertEqual(dsp["shipMissionId"], ship_id_for(d))
                self.assertEqual(len(dispatch_calls), 1)
                a = dispatch_calls[0]
                self.assertEqual(a["missionId"], ship_id_for(d))
                self.assertEqual(a["cwd"], str(d))
                self.assertEqual(a["spawnedBy"], "supervisor")
                ship_led = mc.load_ledger(ship_id_for(d))
                self.assertEqual(ship_led["status"], "dispatched")
                prompt = Path(a["promptFile"]).read_text(encoding="utf-8")
                self.assertIn("engineering.git.merge", prompt)
                self.assertIn("sourceBranch=feat-a, into=main", prompt)
                self.assertIn("preauth do operador", prompt)
                # evento unshipped_delivery no events.jsonl
                with open(mc.STATE_DIR / "events.jsonl", encoding="utf-8") as f:
                    evs = [json.loads(l) for l in f if l.strip()]
                self.assertIn("unshipped_delivery", [e.get("event") for e in evs])
                # badge NÃO é bloqueado pelo unshipped (segue o existente)
                self.assertEqual(led["verified_e2e"]["verdict"], "pass")
                
    def test_unshipped_e2e_real_dispatch(self):
        # (contrato, E2E) despacho REAL (chain_gate + ledger + prompt file):
        # SHIP-<repo>-01 nasce no ledger com prompt correto.
        with tempfile.TemporaryDirectory() as tmp:
            with TempState() as ts:
                cs.EVENTS_DIR = str(Path(ts.tmp) / "events")
                d = make_ship_repo(tmp, "e2e-repo", with_verify=False)
                commit_branch(d, "feat-e2e", "e.ts")
                mid = "ship-e2e-%d" % os.getpid()
                mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                                "status": "dispatched", "cwd": str(d)})
                out, dispatch_calls = self._close({"missionId": mid}, live_dispatch=True)
                sid = ship_id_for(d)
                self.assertEqual(sid, "SHIP-e2e-repo-01")
                ship_led = mc.load_ledger(sid)
                self.assertIsNotNone(ship_led)
                self.assertEqual(ship_led["status"], "dispatched")
                # caminho governado: despachado como supervisor (OBRIGACOES #2)
                self.assertEqual(ship_led["spawned_by"], mc.SPAWNED_BY_SUPERVISOR)
                prompt = Path(ship_led["promptFile"]).read_text(encoding="utf-8")
                self.assertIn("feat-e2e", prompt)
                self.assertIn("into=main", prompt)
                self.assertIn("preauth do operador", prompt)

    def test_duplicate_ship_is_no_op(self):
        # (contrato) SHIP já ativa no ledger -> no_op tipado, sem 2o despacho
        with tempfile.TemporaryDirectory() as tmp:
            with TempState() as ts:
                cs.EVENTS_DIR = str(Path(ts.tmp) / "events")
                d = make_ship_repo(tmp)
                commit_branch(d, "feat-a", "a.ts")
                commit_branch(d, "feat-b", "b.ts")
                mc.save_ledger({"missionId": ship_id_for(d), "paneId": "w8:p1",
                                "status": "dispatched", "cwd": str(d)})
                mid = "ship2-%d" % os.getpid()
                mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                                "status": "dispatched", "cwd": str(d)})
                out, dispatch_calls = self._close({"missionId": mid},
                                                 verify_proc=green_verify())
                _g, dsp = self._ship_steps(out)
                self.assertEqual(dsp["verdict"], "no_op")
                self.assertIn("ativa", str(dsp.get("reason")))
                self.assertEqual(dispatch_calls, [])  # zero despacho duplicado

    def test_merged_close_no_ship(self):
        # (contrato) branch mergeada em main -> nada (sem shipState, sem despacho)
        with tempfile.TemporaryDirectory() as tmp:
            with TempState() as ts:
                cs.EVENTS_DIR = str(Path(ts.tmp) / "events")
                d = make_ship_repo(tmp)
                commit_branch(d, "feat-m", "m.ts")
                git(d, "checkout", "-q", "main")
                git(d, "merge", "-q", "--no-ff", "-m", "merge", "feat-m")
                git(d, "checkout", "-q", "feat-m")
                mid = "ship3-%d" % os.getpid()
                mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                                "status": "dispatched", "cwd": str(d)})
                out, dispatch_calls = self._close({"missionId": mid},
                                                 verify_proc=green_verify())
                led = mc.load_ledger(mid)
                self.assertEqual(led["status"], "closed")
                self.assertIsNone(led.get("shipState"))
                g, dsp = self._ship_steps(out)
                # wiring emite ship_guard com verdict "merged" (visibilidade),
                # mas sem shipState, sem evento unshipped e sem despacho
                self.assertIsNotNone(g)
                self.assertEqual(g["verdict"], "merged")
                self.assertIsNone(dsp)
                self.assertEqual(dispatch_calls, [])

    def test_dependent_flight_warned_in_prompt(self):
        # (contrato) missão ativa dependente -> prompt da SHIP contém o aviso
        with tempfile.TemporaryDirectory() as tmp:
            with TempState() as ts:
                cs.EVENTS_DIR = str(Path(ts.tmp) / "events")
                d = make_ship_repo(tmp)
                commit_branch(d, "feat-a", "a.ts")
                mc.save_ledger({"missionId": "dep-ativo", "paneId": "w7:p1",
                                "status": "dispatched", "cwd": str(d)})
                mid = "ship4-%d" % os.getpid()
                mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                                "status": "dispatched", "cwd": str(d)})
                out, dispatch_calls = self._close({"missionId": mid},
                                                 verify_proc=green_verify())
                self.assertEqual(len(dispatch_calls), 1)
                prompt = Path(dispatch_calls[0]["promptFile"]).read_text(encoding="utf-8")
                self.assertIn("voo dependente", prompt)
                self.assertIn("dep-ativo", prompt)
                self.assertIn("NÃO rebaseie o worktree", prompt)

    def test_e2e_flight_holds_ship_in_window(self):
        # (contrato) prova E2E em voo -> SHIP não despacha: awaiting_ship_window
        with tempfile.TemporaryDirectory() as tmp:
            with TempState() as ts:
                cs.EVENTS_DIR = str(Path(ts.tmp) / "events")
                d = make_ship_repo(tmp)
                commit_branch(d, "feat-a", "a.ts")
                mc.save_ledger({"missionId": "e2e-voo", "paneId": "w7:p2", "status":
                                "dispatched", "cwd": str(d), "consequence": True})
                mc.append_event("e2e-voo", "w7:p2", "deliver_verify",
                                detail="E2E contra produção em curso")
                mid = "ship5-%d" % os.getpid()
                mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                                "status": "dispatched", "cwd": str(d)})
                out, dispatch_calls = self._close({"missionId": mid},
                                                 verify_proc=green_verify())
                self.assertEqual(dispatch_calls, [])  # gate fechado: não despacha
                _g, dsp = self._ship_steps(out)
                self.assertEqual(dsp["verdict"], "awaiting_ship_window")
                ship_led = mc.load_ledger(ship_id_for(d))
                self.assertEqual(ship_led["status"], "awaiting_ship_window")
                self.assertEqual(ship_led["shipFor"], mid)

    def test_window_opens_when_flight_lands(self):
        # (contrato) voo aterrissou (close da missão E2E) -> SHIP despachada
        # (step ship_window_release — o "nudge interno quando o voo aterrissar")
        with tempfile.TemporaryDirectory() as tmp:
            with TempState() as ts:
                cs.EVENTS_DIR = str(Path(ts.tmp) / "events")
                d = make_ship_repo(tmp)
                commit_branch(d, "feat-a", "a.ts")
                mc.save_ledger({"missionId": "e2e-voo2", "paneId": "w7:p3", "status":
                                "dispatched", "cwd": str(d), "consequence": True})
                mc.append_event("e2e-voo2", "w7:p3", "deliver_verify", detail="E2E")
                mid = "ship6-%d" % os.getpid()
                mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                                "status": "dispatched", "cwd": str(d)})
                out, _ = self._close({"missionId": mid}, verify_proc=green_verify())
                ship_led = mc.load_ledger(ship_id_for(d))
                self.assertEqual(ship_led["status"], "awaiting_ship_window")
                # agora o voo aterrissa: close da missão E2E (pane inexistente)
                git(d, "checkout", "-q", "main")  # voo aterrissa na mainline: guard não re-dispacha
                out2, _d2 = self._close({"missionId": "e2e-voo2"},
                                        verify_proc=green_verify())
                rel = [s for s in out2["steps"] if s["step"] == "ship_window_release"]
                self.assertEqual(len(rel), 1)
                self.assertEqual(rel[0]["released"][0]["shipMissionId"],
                                 ship_id_for(d))
                self.assertEqual(rel[0]["released"][0]["verdict"], "dispatched")
                ship_led2 = mc.load_ledger(ship_id_for(d))
                self.assertEqual(ship_led2["status"], "dispatched")

    def test_tier3_without_preauth_prompt_order(self):
        # (contrato) tier-3 (push/release) na SHIP sem preauth -> prompt ordena
        # AGUARDE o operador; gate operator-* não é interceptável
        with tempfile.TemporaryDirectory() as tmp:
            with TempState() as ts:
                cs.EVENTS_DIR = str(Path(ts.tmp) / "events")
                d = make_ship_repo(tmp)
                commit_branch(d, "feat-a", "a.ts")
                mid = "ship7-%d" % os.getpid()
                mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                                "status": "dispatched", "cwd": str(d)})
                out, dispatch_calls = self._close({"missionId": mid},
                                                 verify_proc=green_verify())
                self.assertEqual(len(dispatch_calls), 1)
                prompt = Path(dispatch_calls[0]["promptFile"]).read_text(encoding="utf-8")
                self.assertIn("tier-3", prompt)
                self.assertIn("preauth do operador", prompt)
                self.assertIn("AGUARDE o operador", prompt)
                self.assertIn("nunca contorne", prompt)
                self.assertIn("engineering.release.pipeline", prompt)


if __name__ == "__main__":
    unittest.main(verbosity=2)