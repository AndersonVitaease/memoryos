"""MISSION-OPS-GUARD-01 (01/10) — red→green dos 3 findings de sessão/cwd/input.

F1 SESSION-SHARE-01: dispatch/recover NUNCA herdam a sessão de outra missão do mesmo cwd.
F2 RECOVER-CWD-01:   recover relança o claude no cwd do LEDGER (arg só se validado).
F3 PANE-INPUT-GARBAGE-01: lixo de escape no input box (/0000, /afaf<35;34;12M, db) é
                     limpo antes do send; prefixo detectado = clear+retry 1x + evento.

Run: python3 test_mission_ops_guard.py   (herdr 100% mockado; estado em tmp)
"""

from __future__ import annotations

import json
import os
import sys
import time
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_mission_ops import (PKG, READY, TempState, fake_herdr, procinfo,  # noqa: E402
                              tab_ok, track_calls)

mc = PKG.mc
rc = PKG.rc

# sessão REAL compartilhada de 01/10 (watch-fp-01 recover 10:39Z -> fix-02 dispatch 10:49Z)
SHARED_SID = "8329080a-86f4-4435-8773-c2b4bd8f5d9d"
GARBAGE_REAL = ["/0000", "/afaf<35;34;12M", "db"]


def _iso(ts: float) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime(ts))


def write_session(ts: TempState, sid: str, cwd: str, started: float) -> Path:
    """jsonl no formato real do claude: 1º registro com timestamp = início da sessão."""
    proj = ts.claude_home / "projects" / ("-".join(cwd.split("/")))
    proj.mkdir(parents=True, exist_ok=True)
    p = proj / f"{sid}.jsonl"
    p.write_text(json.dumps({"type": "mode", "sessionId": sid}) + "\n"
                 + json.dumps({"type": "user", "timestamp": _iso(started),
                               "sessionId": sid}) + "\n", encoding="utf-8")
    return p


# ================================================================ F1

class TestF1SessionShare(unittest.TestCase):

    def _dispatch(self, ts, cwd, prompt, on_deliver=None):
        script = {f"tab create --cwd {cwd} --no-focus": tab_ok("t9", "w9:pF"),
                  "tab rename t9 MISSION:engmcp-tools-fix-02": "",
                  "pane run w9:pF *": ""}

        def deliver(pane, text, *a, **k):
            if on_deliver:
                on_deliver()
            return True, None
        with mock.patch.object(mc, "run_herdr", fake_herdr(script)), \
             mock.patch.object(mc, "wait_output", return_value=(READY, None)), \
             mock.patch.object(mc, "deliver_prompt", side_effect=deliver):
            return json.loads(PKG.handle_mission_dispatch(
                {"missionId": "engmcp-tools-fix-02", "promptFile": prompt, "cwd": cwd}))

    def test_dispatch_refuses_live_session_of_other_mission(self):
        """Fixture real: watch-fp-01 (ledger resumeSessionId=null!) com sessão VIVA no
        mesmo project dir, começada 10min antes -> fix-02 NÃO pode herdá-la."""
        with TempState() as ts:
            prompt = ts.prompt_file()
            cwd = str(Path(prompt).parent)
            mc.save_ledger({"missionId": "watch-fp-01", "status": "dispatched",
                            "paneId": "w6:p3A", "cwd": cwd + "-wt", "resumeSessionId": None})
            p = write_session(ts, SHARED_SID, cwd, started=time.time() - 600)
            os.utime(p)  # sessão viva: mtime agora (o claude do watch-fp escrevendo)
            res = self._dispatch(ts, cwd, prompt)
            self.assertTrue(res["ok"], res)
            self.assertNotEqual(res["resumeSessionId"], SHARED_SID)  # red: compartilhava
            self.assertIsNone(mc.load_ledger("engmcp-tools-fix-02")["resumeSessionId"])

    def test_dispatch_records_own_fresh_session(self):
        """green: a sessão nascida NESTE lançamento é a gravada (não a alheia mais velha)."""
        with TempState() as ts:
            prompt = ts.prompt_file()
            cwd = str(Path(prompt).parent)
            p = write_session(ts, SHARED_SID, cwd, started=time.time() - 600)
            os.utime(p, (time.time() + 30, time.time() + 30))  # alheia com mtime MAIS novo
            res = self._dispatch(ts, cwd, prompt, on_deliver=lambda: write_session(
                ts, "own-sess-fix02", cwd, started=time.time()))
            self.assertEqual(res["resumeSessionId"], "own-sess-fix02")

    def test_dispatch_skips_session_claimed_by_other_ledger(self):
        with TempState() as ts:
            prompt = ts.prompt_file()
            cwd = str(Path(prompt).parent)
            mc.save_ledger({"missionId": "watch-fp-01", "status": "dispatched",
                            "paneId": "w6:p3A", "cwd": cwd, "resumeSessionId": SHARED_SID})
            res = self._dispatch(ts, cwd, prompt, on_deliver=lambda: write_session(
                ts, SHARED_SID, cwd, started=time.time()))
            self.assertIsNone(res["resumeSessionId"])

    def test_shell_fallback_refuses_resume_of_other_missions_session(self):
        with TempState() as ts:
            mc.save_ledger({"missionId": "watch-fp-01", "status": "dispatched",
                            "paneId": "w6:p3A", "cwd": "/opt/mission-x",
                            "resumeSessionId": SHARED_SID})
            mc.save_ledger({"missionId": "fix-02", "status": "needs_recovery",
                            "paneId": "w6:p3P", "promptFile": "/x/p.md",
                            "cwd": "/opt/mission-x", "resumeSessionId": SHARED_SID})
            calls, track = track_calls()
            with mock.patch.object(mc, "run_herdr", track), \
                 mock.patch.object(mc, "wait_output", return_value=(READY, None)):
                r, err = rc.recover("w6:p3P", "shell_fallback", mc.load_ledger("fix-02"))
            self.assertIsNone(err)
            runs = [c[3] for c in calls if c[:2] == ["pane", "run"]]
            self.assertFalse(any(SHARED_SID in c for c in runs), runs)  # red: --resume alheio
            self.assertNotEqual(mc.load_ledger("fix-02")["resumeSessionId"], SHARED_SID)

    def test_shell_fallback_idempotent_when_claude_alive_in_pane(self):
        with TempState() as ts:
            mc.save_ledger({"missionId": "m1", "status": "needs_recovery", "paneId": "w1:pZ",
                            "promptFile": "/x/p.md", "cwd": "/opt/mission-x",
                            "resumeSessionId": "sess-own"})
            calls, track = track_calls({"pane process-info --pane w1:pZ": procinfo("claude")})
            with mock.patch.object(mc, "run_herdr", track):
                r, err = rc.recover("w1:pZ", "shell_fallback", mc.load_ledger("m1"))
            self.assertIsNone(err)
            self.assertFalse([c for c in calls if c[:2] == ["pane", "run"]])  # nenhum 2º claude
            self.assertIn("no_op", r["applied"])

    def test_own_session_waits_for_late_jsonl_and_real_slug(self):
        """prova E2E 01/10: o jsonl nasce ~1s DEPOIS do prompt e o slug do claude troca
        TODO não-alfanumérico por '-' ('/x/.hermes' -> '-x--hermes')."""
        with TempState() as ts:
            cwd = str(Path(ts.tmp) / ".hermes" / "wt")
            slug = "".join(c if c.isalnum() else "-" for c in cwd)
            proj = Path(cwd) / ".claude-config" / "projects" / slug
            t0 = time.time()
            ticks = {"n": 0}

            def fake_sleep(_s):
                ticks["n"] += 1
                if ticks["n"] == 2:  # jsonl aparece no meio do polling
                    proj.mkdir(parents=True)
                    (proj / "late-sess.jsonl").write_text(json.dumps(
                        {"type": "user", "timestamp": _iso(t0)}) + "\n")
            with mock.patch.object(mc.time, "sleep", fake_sleep):
                sid = mc.own_session_id("m1", cwd, since=t0, wait_s=30)
            self.assertEqual(sid, "late-sess")
            self.assertIsNone(mc.own_session_id("m1", cwd, since=t0 + 60))

    def test_resumable_own_session_still_resumes(self):
        """regressão: sessão própria (sem outro dono, sem processo vivo) segue retomável."""
        with TempState():
            mc.save_ledger({"missionId": "m1", "status": "needs_recovery", "paneId": "w1:pZ",
                            "cwd": "/opt/mission-x", "resumeSessionId": "sess-keep"})
            self.assertEqual(mc.resumable_session_id(mc.load_ledger("m1")), ("sess-keep", None))


# ================================================================ F2

class TestF2RecoverCwd(unittest.TestCase):

    def test_shell_fallback_relaunches_in_ledger_worktree_cwd(self):
        with TempState() as ts:
            wt = Path(ts.tmp) / "eng-mcp-wt-watch-fp-01" / "eng-mcp"
            wt.mkdir(parents=True)
            calls, track = track_calls()
            with mock.patch.object(mc, "run_herdr", track), \
                 mock.patch.object(mc, "wait_output", return_value=(READY, None)):
                r, err = rc.recover("w6:p3A", "shell_fallback",
                                    {"missionId": "watch-fp-01", "paneId": "w6:p3A",
                                     "promptFile": "/x/p.md", "cwd": str(wt),
                                     "resumeSessionId": None})
            self.assertIsNone(err)
            runs = [c[3] for c in calls if c[:2] == ["pane", "run"]]
            self.assertTrue(runs[0].startswith(f"cd {wt} && "), runs)  # red: "claude" puro

    def test_ready_regex_error_invalid_arg_falls_back_to_ledger(self):
        with TempState() as ts:
            wt = Path(ts.tmp) / "wt" / "eng-mcp"
            wt.mkdir(parents=True)
            mc.save_ledger({"missionId": "m1", "status": "needs_recovery", "paneId": "w1:pZ",
                            "promptFile": "/x/p.md", "cwd": str(wt)})
            calls, track = track_calls()
            with mock.patch.object(mc, "run_herdr", track), \
                 mock.patch.object(mc, "read_output", return_value=("root@h:/x#", None)), \
                 mock.patch.object(mc, "wait_output", return_value=(READY, None)), \
                 mock.patch.object(mc, "deliver_prompt", return_value=(True, None)), \
                 mock.patch.object(rc.time, "sleep"):
                r, err = rc.recover("w1:pZ", "ready_regex_error", mc.load_ledger("m1"),
                                    cwd="/nao/existe/eng-mcp")
            self.assertIsNone(err)
            runs = [c[3] for c in calls if c[:2] == ["pane", "run"]]
            self.assertEqual(runs[0], f"cd {wt} && claude")  # red: cd /nao/existe
            self.assertEqual(mc.load_ledger("m1")["cwd"], str(wt))

    def test_relaunch_in_ledger_cwd_dances_first_run_dialogs(self):
        """prova E2E 01/10: worktree do ledger abre em trust + 'Security notes' — o recover
        navega (mesmo READY_DANCE do dispatch) em vez de morrer em 180s."""
        screens = iter(["Is this a project you created or one you trust\n❯ No, exit\n"
                        "  Yes, I trust this folder",
                        "Security notes:\n Press Enter to continue…", READY])
        keys = []
        with TempState():
            with mock.patch.object(mc, "wait_output", return_value=(None, "timeout")), \
                 mock.patch.object(mc, "read_output",
                                   side_effect=lambda *a, **k: (next(screens), None)), \
                 mock.patch.object(mc, "send_keys", side_effect=lambda p, k: keys.append(k)), \
                 mock.patch.object(rc.time, "sleep"):
                out, err = rc.wait_ready_dancing("w1:pZ", "m1")
        self.assertIsNone(err)
        self.assertEqual(keys, ["down", "enter", "enter"])

    def test_recover_cwd_rules(self):
        led = {"cwd": "/ledger/cwd"}
        self.assertEqual(mc.recover_cwd(led, None), "/ledger/cwd")
        self.assertEqual(mc.recover_cwd(led, "/nao/existe"), "/ledger/cwd")
        self.assertEqual(mc.recover_cwd(led, "/opt"), "/opt")  # explícito E validado

    def test_transcript400_relaunch_uses_ledger_cwd(self):
        with TempState():
            import herdr_stub as hs
            pane = hs.FakePane(state="api_error", cwd="/opt/memoryos/eng-mcp")
            with hs.install(mc, pane):
                r, err = rc.recover("w1:pZ", "transcript400",
                                    {"missionId": "m1", "paneId": "w1:pZ",
                                     "promptFile": "/x/p.md", "cwd": "/opt/wt-m1/eng-mcp"})
            self.assertIsNone(err)
            self.assertTrue(pane.commands[0].startswith("cd /opt/wt-m1/eng-mcp && "))


# ================================================================ F3

class FakeInputPane:
    """Caixa de input do claude simulada: send-text acumula, ctrl+u limpa, Enter submete.
    `garbage` = resíduo já no input; `inject` = resíduo que chega NO 1º send (mouse)."""

    def __init__(self, garbage: str = "", inject: str = ""):
        self.box = garbage
        self.inject = inject
        self.history = []
        self.submitted = []

    def send_keys(self, pane_id, key):
        if key == "ctrl+u":
            self.box = ""
        elif key == "enter":
            self.submitted.append(self.box)
            self.history.append(f"❯ {self.box}")
            if self.box.startswith("/"):
                self.history.append(f"  ⎿  Unknown command: {self.box}")
            self.box = ""
        return None

    def send_text(self, pane_id, text):
        if self.inject:
            self.box += self.inject
            self.inject = ""
        self.box += text
        return None

    def screen(self):
        return "\n".join(self.history[-4:] + ["─" * 20, f"❯ {self.box}", "─" * 20,
                                             "  ? for shortcuts"])

    def read_output(self, pane_id, lines=40, source="recent-unwrapped"):
        return self.screen(), None

    def patches(self):
        return [mock.patch.object(mc, "send_keys", self.send_keys),
                mock.patch.object(mc, "send_text", self.send_text),
                mock.patch.object(mc, "read_output", self.read_output),
                mock.patch.object(mc, "wait_output", return_value=("", None)),
                mock.patch.object(mc.time, "sleep")]


MSG = "SUP-01: continue a missão; rode a suíte e grave o verify.json"


class TestF3InputGarbage(unittest.TestCase):

    def _deliver(self, pane):
        ps = pane.patches()
        for p in ps:
            p.start()
        try:
            return mc.deliver_prompt("w1:pZ", MSG)
        finally:
            for p in reversed(ps):
                p.stop()

    def test_residue_in_box_is_cleared_before_send(self):
        for g in GARBAGE_REAL:
            with self.subTest(garbage=g), TempState():
                pane = FakeInputPane(garbage=g)
                ok, err = self._deliver(pane)
                self.assertTrue(ok, err)
                self.assertEqual(pane.submitted, [MSG])  # red: "/0000SUP-01..." entregue

    def test_residue_arriving_mid_send_is_detected_and_retried_once(self):
        with TempState() as ts:
            mc.save_ledger({"missionId": "m1", "status": "dispatched", "paneId": "w1:pZ"})
            pane = FakeInputPane(inject="/afaf<35;34;12M")
            ok, err = self._deliver(pane)
            self.assertTrue(ok, err)
            self.assertEqual(pane.submitted, [MSG])  # lixo nunca submetido
            ev = [json.loads(l) for l in (ts.state / "events.jsonl").read_text().splitlines()]
            self.assertTrue(any(e["event"] == "nudge_input_garbage" for e in ev))
            spool = Path(PKG._MISSION_SPOOL).read_text()
            self.assertIn('"kind": "nudge_input_garbage"', spool)
            self.assertIn("/afaf<35;34;12M", spool)

    def test_prefix_detector_real_strings(self):
        for g in GARBAGE_REAL:
            self.assertEqual(mc.input_garbage_prefix(f"❯ {g}{MSG}", MSG), g)
        self.assertEqual(mc.input_garbage_prefix(
            f"  ⎿  Unknown command: /0000{MSG}\n❯ \n? for shortcuts", MSG), "/0000")
        self.assertIsNone(mc.input_garbage_prefix(f"❯ {MSG}", MSG))
        self.assertIsNone(mc.input_garbage_prefix("❯ \n? for shortcuts", MSG))
        # comando legítimo que começa com "/" não é lixo
        self.assertIsNone(mc.input_garbage_prefix("Unknown command: /foo", "/foo"))

    def test_nudge_delivers_clean_text_on_dirty_pane(self):
        with TempState():
            mc.save_ledger({"missionId": "m1", "status": "dispatched", "paneId": "w1:pZ"})
            pane = FakeInputPane(garbage="/0000")
            ps = pane.patches() + [
                mock.patch.object(mc, "pane_exists", return_value=True),
                mock.patch.object(mc, "foreground_agent_name", return_value=("claude", None))]
            for p in ps:
                p.start()
            try:
                res = mc.nudge_mission("m1", MSG, verify_s=0)
            finally:
                for p in reversed(ps):
                    p.stop()
            self.assertNotIn(res["status"], ("pane_lost", "refused_busy"), res)
            self.assertEqual(pane.submitted, [MSG])


if __name__ == "__main__":
    unittest.main(verbosity=2)
