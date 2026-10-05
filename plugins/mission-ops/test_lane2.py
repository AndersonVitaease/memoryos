"""WATCHDOG-LANE2-01 — testes do lado mission-ops (red-then-green).

1. relaunch.py: receita /exit → polling-ready (❯/auto mode on) → claude novo com
   CLAUDE_CONFIG_DIR → prompt de retomada por estado no disco (padrão provado 4x em 27/09),
   contra pane sintético (herdr_stub). Liveness honesta: nunca "recovered" sem ready no pane.
2. recipes.recover("transcript400") SUBSTITUÍDA: nada de ctrl+c, usa o relaunch.
3. mission_list / mission_status compact=true: só não-closed + contadores; default intacto.
4. smoke_mission_ops.py (sanity pós-turno) verde.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_mission_ops import PKG, TempState, mc, rc  # noqa: E402  (carrega o pacote real)
import herdr_stub as hs  # noqa: E402

PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))


def ledger(cwd="/opt/mission-x", **kw):
    led = {"missionId": "m1", "paneId": "w1:pZ", "status": "needs_recovery",
           "promptFile": "/opt/mission-x/missao-m1.md", "cwd": cwd,
           "resumeSessionId": "POISONED"}
    led.update(kw)
    return led


def relaunch_mod():
    import importlib
    return importlib.import_module("mission_ops.relaunch")


class TestRelaunchRecipe(unittest.TestCase):
    def test_api_error_exit_poll_ready_fresh_config_resume(self):
        rl = relaunch_mod()
        with TempState() as ts:
            ts.claude_session("fresh-sess", cwd="/opt/mission-x")
            pane = hs.FakePane(state="api_error", api_code="502", cwd="/opt/mission-x")
            with hs.install(mc, pane) as clock:
                res, err = rl.relaunch("w1:pZ", ledger(), reason="API Error 502",
                                       exit_first=True)
            self.assertIsNone(err, err)
            self.assertTrue(res["recovered"])
            self.assertTrue(res["engaged"])
            self.assertNotIn("ctrl+c", pane.keys)             # receita quebrada morreu
            self.assertIn("/exit", pane.texts)
            self.assertEqual(len(pane.commands), 1)
            cmd = pane.commands[0]
            self.assertIn("CLAUDE_CONFIG_DIR=/opt/mission-x/.claude-config", cmd)
            self.assertNotIn("--resume", cmd)                 # transcript envenenado nunca
            self.assertEqual(len(pane.prompts), 1)
            p = pane.prompts[0]
            self.assertIn("/opt/mission-x/missao-m1.md", p)
            self.assertIn("disco", p)
            self.assertIn("nunca peça colagem", p)            # cláusula do template
            # prompt só depois do ready ter aparecido no pane (polling, não wait cego)
            self.assertIsNotNone(pane.ready_seen_at)
            self.assertLess(res["elapsed_s"], 60)
            led = mc.load_ledger("m1")
            self.assertEqual(led["status"], "dispatched")
            self.assertEqual(led["resumeSessionId"], "fresh-sess")

    def test_absent_agent_shell_launches_without_exit(self):
        rl = relaunch_mod()
        with TempState():
            pane = hs.FakePane(state="shell", cwd="/opt/mission-x")
            with hs.install(mc, pane):
                res, err = rl.relaunch("w1:pZ", ledger(), reason="shell pós-morte (OOM)",
                                       exit_first=False)
            self.assertIsNone(err, err)
            self.assertTrue(res["recovered"])
            self.assertNotIn("/exit", pane.texts)            # shell: /exit viraria comando bash
            self.assertEqual(len(pane.prompts), 1)

    def test_first_run_dialog_is_danced_before_prompt(self):
        rl = relaunch_mod()
        with TempState():
            pane = hs.FakePane(state="shell", cwd="/opt/mission-x", first_run=True)
            with hs.install(mc, pane):
                res, err = rl.relaunch("w1:pZ", ledger(), reason="OOM", exit_first=False)
            self.assertIsNone(err, err)
            self.assertIn("down", pane.keys)
            self.assertEqual(len(pane.prompts), 1)

    def test_exit_swallowed_once_is_retried(self):
        rl = relaunch_mod()
        with TempState():
            pane = hs.FakePane(state="api_error", cwd="/opt/mission-x", exit_ignored=1)
            with hs.install(mc, pane):
                res, err = rl.relaunch("w1:pZ", ledger(), reason="API Error 400")
            self.assertIsNone(err, err)
            self.assertEqual(pane.texts.count("/exit"), 2)

    def test_never_ready_is_honest_failure(self):
        rl = relaunch_mod()
        with TempState():
            mc.save_ledger(ledger())
            pane = hs.FakePane(state="shell", cwd="/opt/mission-x", launch_fails=True)
            with hs.install(mc, pane):
                res, err = rl.relaunch("w1:pZ", ledger(), reason="OOM", exit_first=False)
            self.assertIsNotNone(err)
            self.assertFalse(res.get("recovered"))
            self.assertEqual(pane.prompts, [])                # nunca entrega às cegas
            self.assertNotEqual(mc.load_ledger("m1")["status"], "dispatched")

    def test_exit_never_returns_to_shell_fails_without_launch(self):
        rl = relaunch_mod()
        with TempState():
            pane = hs.FakePane(state="api_error", cwd="/opt/mission-x", exit_ignored=99)
            with hs.install(mc, pane):
                res, err = rl.relaunch("w1:pZ", ledger(), reason="API Error 400")
            self.assertIsNotNone(err)
            self.assertEqual(pane.commands, [])               # nada digitado no claude

    def test_no_cwd_refuses(self):
        rl = relaunch_mod()
        pane = hs.FakePane(state="shell")
        with hs.install(mc, pane):
            res, err = rl.relaunch("w1:pZ", ledger(cwd=""), reason="OOM", exit_first=False)
        self.assertIsNotNone(err)
        self.assertEqual(pane.commands, [])

    def test_gpu_engine_keeps_bridge_env(self):
        rl = relaunch_mod()
        cmd = rl.claude_command(ledger(engine="gpu", gpuUpOk=True))
        self.assertIn("ANTHROPIC_BASE_URL=http://127.0.0.1:8102", cmd)
        self.assertIn("CLAUDE_CONFIG_DIR=/opt/mission-x/.claude-config", cmd)
        self.assertNotIn("ANTHROPIC_BASE_URL", rl.claude_command(ledger()))


class TestTranscript400Replaced(unittest.TestCase):
    def test_recover_transcript400_uses_exit_not_ctrl_c(self):
        with TempState() as ts:
            ts.claude_session("fresh-sess", cwd="/opt/mission-x")
            pane = hs.FakePane(state="api_error", api_code="400", cwd="/opt/mission-x")
            with hs.install(mc, pane):
                r, err = rc.recover("w1:pZ", "transcript400", ledger())
            self.assertIsNone(err, err)
            self.assertEqual(r["recipe"], "transcript400")
            self.assertTrue(r["recovered"])
            self.assertNotIn("ctrl+c", pane.keys)
            self.assertIn("/exit", pane.texts)
            self.assertIn("CLAUDE_CONFIG_DIR=", pane.commands[0])
            self.assertFalse(any("--resume POISONED" in c for c in pane.commands))
            self.assertEqual(len(pane.prompts), 1)


class TestCompactStatus(unittest.TestCase):
    def _seed(self, n_closed=60):
        for i in range(n_closed):
            mc.save_ledger({"missionId": f"old-{i:02d}", "status": "closed", "paneId": f"w1:p{i}",
                            "promptFile": f"/opt/memoryos/eng-mcp/missao-old-{i:02d}.md",
                            "cwd": f"/opt/old-{i}", "resumeSessionId": "x" * 36,
                            "updatedAt": "2026-09-27T10:00:00Z", "tabId": f"w1:t{i}",
                            "creation": "tab"})
        mc.save_ledger({"missionId": "live-1", "status": "dispatched", "paneId": "w1:pL",
                        "promptFile": "/x/missao-live-1.md", "cwd": "/opt/live"})
        mc.save_ledger({"missionId": "wait-1", "status": "waiting_operator", "paneId": "w1:pW",
                        "promptFile": "/x/missao-wait-1.md", "cwd": "/opt/wait"})

    def test_status_compact_small_and_counts(self):
        with TempState():
            self._seed()
            full = PKG.handle_mission_status({})
            comp = PKG.handle_mission_status({"compact": True})
            jf, jc = json.loads(full), json.loads(comp)
            self.assertEqual(len(jf["missions"]), 62)                    # default intacto
            self.assertEqual(sorted(m["missionId"] for m in jc["missions"]),
                             ["live-1", "wait-1"])
            self.assertEqual(jc["counts"]["closed"], 60)
            self.assertEqual(jc["counts"]["dispatched"], 1)
            self.assertEqual(jc["total"], 62)
            self.assertTrue(jc["compact"])
            self.assertLess(len(comp), 1200)
            self.assertLess(len(comp) * 10, len(full))

    def test_status_compact_string_true(self):
        with TempState():
            self._seed(3)
            jc = json.loads(PKG.handle_mission_status({"compact": "true"}))
            self.assertTrue(jc.get("compact"))

    def test_status_single_mission_ignores_compact_filter(self):
        with TempState():
            self._seed(2)
            jc = json.loads(PKG.handle_mission_status({"missionId": "old-00", "compact": True}))
            self.assertEqual([m["missionId"] for m in jc["missions"]], ["old-00"])

    def test_list_compact(self):
        with TempState():
            self._seed()
            pane = hs.FakePane(pane_id="w1:pL", state="working", cwd="/opt/live")
            with hs.install(mc, pane), \
                    unittest.mock.patch.object(mc, "tab_list", return_value=([], None)):
                full = PKG.handle_mission_list({})
                comp = PKG.handle_mission_list({"compact": True})
            jf, jc = json.loads(full), json.loads(comp)
            self.assertEqual(len(jf["missions"]), 62)                    # default intacto
            self.assertNotIn("compact", jf)
            ids = {m["missionId"]: m for m in jc["missions"]}
            self.assertEqual(sorted(ids), ["live-1", "wait-1"])
            self.assertTrue(ids["live-1"]["live"])
            self.assertEqual(ids["live-1"]["agentStatus"], "working")
            self.assertEqual(jc["counts"]["closed"], 60)
            self.assertLess(len(comp), 1200)

    def test_schema_exposes_compact(self):
        seen = {}

        class Ctx:
            def register_tool(self, name, toolset, schema, handler, *a, **k):
                seen[name] = schema
        # RD-TESTBASE-01: register() marca o processo como gateway (global
        # PERMANENTE de supervisor_guard) — fixture restaura para não vazar a
        # marca para os testes seguintes do mesmo processo.
        _booted_saved = PKG.sg._GATEWAY_BOOTED
        PKG.register(Ctx())
        PKG.sg._GATEWAY_BOOTED = _booted_saved
        for tool in ("mission_status", "mission_list"):
            props = seen[tool]["parameters"]["properties"]
            self.assertIn("compact", props)
            self.assertEqual(props["compact"]["type"], "boolean")


class TestSmoke(unittest.TestCase):
    def test_smoke_script_green(self):
        r = subprocess.run([sys.executable, os.path.join(PLUGIN_DIR, "smoke_mission_ops.py")],
                           capture_output=True, text=True, timeout=60, cwd=PLUGIN_DIR)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("SMOKE OK", r.stdout)


if __name__ == "__main__":
    unittest.main()
