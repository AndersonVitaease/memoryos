"""MISSION-OPS-01 tests — ocr-bridge pattern. herdr fully mocked (run_herdr monkeypatched),
state in tmp dirs. Positive + negative per recipe; idempotency; herdr failure = clean error;
palette recipe NEVER sends /quit; transcript400 NEVER resumes the poisoned session.

Run: python3 test_mission_ops.py
"""

from __future__ import annotations

import importlib.util
import itertools
import json
import os
import re
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))

sys.path.insert(0, PLUGIN_DIR)
import vast_sandbox  # noqa: E402  FLAKY-SANDBOX-FIX-01: nenhum teste chama o vastai real

vast_sandbox.install_guard()


def _load_pkg():
    """Load the plugin as a real package (sibling modules import each other relatively)."""
    spec = importlib.util.spec_from_file_location(
        "mission_ops", os.path.join(PLUGIN_DIR, "__init__.py"),
        submodule_search_locations=[PLUGIN_DIR])
    pkg = importlib.util.module_from_spec(spec)
    sys.modules["mission_ops"] = pkg
    spec.loader.exec_module(pkg)
    # FIX 28/09 ~23:05 (sequela do workers-qwen default): nos testes o gpu-up é MOCK —
    # o gpu-up.sh chama vastai do venv por caminho absoluto (escapa do seal de PATH) e
    # o tripwire dispara. O que se testa é o wiring (claude apontado p/ 8102), não o
    # script. Produção segue real: fail-open p/ OpenRouter se a ponte cair.
    pkg._gpu_up_for_mission = lambda mission_id: True
    # DISPATCH-FAST-03: a sonda da ponte também é mock (sem rede real na suíte).
    pkg._qwen_bridge_alive_real = pkg._qwen_bridge_alive
    pkg._qwen_bridge_alive = lambda timeout=2.0: True
    return pkg


PKG = _load_pkg()
mc = PKG.mc
rc = PKG.rc

# SEC-SHELL-GUARD-01: módulo da medida de adoção (sibling do plugin, mesmo sys.path)
import shell_adoption as sa  # noqa: E402


class TempState:
    """Route ledger/events/claude-home to tmp dirs for the duration of the test."""

    def __init__(self):
        self.tmp = tempfile.mkdtemp(prefix="mission-ops-test-")
        self.state = Path(self.tmp) / "state"
        self.claude_home = Path(self.tmp) / "claude-home"
        self._saved = (mc.STATE_DIR, mc.CLAUDE_HOME, PKG._MISSION_SPOOL)
        self._saved_nf = (PKG.nf.SPOOL, PKG.nf.SIGNATURES_FILE)

    def __enter__(self):
        mc.STATE_DIR = self.state
        mc.CLAUDE_HOME = self.claude_home
        # MISSION-OPS-GUARD-01: as fixtures já estão no disco — sem isso own_session_id
        # espera SESSION_WAIT_S=3s a cada chamada e a suíte vai de 32s para 50s.
        self._saved_wait = mc.SESSION_WAIT_S
        mc.SESSION_WAIT_S = 0.0
        # CHAIN-DISPATCH-GOV-01: trilha chain_dispatch de todo dispatch vai para tmp, nunca o bus real
        PKG._MISSION_SPOOL = str(Path(self.tmp) / "spool.jsonl")
        # GPU-COST-FIX-01: mission_completed/mission_cost do close vão para tmp, nunca o bus real
        PKG.nf.SPOOL = str(Path(self.tmp) / "spool.jsonl")
        PKG.nf.SIGNATURES_FILE = str(Path(self.tmp) / "notify-signatures.json")
        # ORCH-SPEND-LEDGER-01: transporte HTTP engineering desligado na suíte (hermético);
        # o caminho real com HTTP é provado na suíte própria + E2E com servidor dedicado.
        self._saved_calls_off = PKG.nf.ENG_MCP_CALLS_OFF
        PKG.nf.ENG_MCP_CALLS_OFF = True
        # RD-PERF-VERIFY-01: atrasos do ready-dance zerados na suíte (o wiring não
        # precisa dormir 0.3s/2.0s por rodada — TestReadyDance caía de 25s para ~0s).
        self._saved_dance = (PKG._DANCE_KEY_DELAY_S, PKG._DANCE_REDRAW_S)
        PKG._DANCE_KEY_DELAY_S = 0.0
        PKG._DANCE_REDRAW_S = 0.0
        return self

    def __exit__(self, *a):
        mc.STATE_DIR, mc.CLAUDE_HOME, PKG._MISSION_SPOOL = self._saved
        mc.SESSION_WAIT_S = self._saved_wait
        PKG.nf.SPOOL, PKG.nf.SIGNATURES_FILE = self._saved_nf
        PKG.nf.ENG_MCP_CALLS_OFF = self._saved_calls_off
        PKG._DANCE_KEY_DELAY_S, PKG._DANCE_REDRAW_S = self._saved_dance

    def prompt_file(self, rel: str = "missions/prompt.md") -> str:
        p = Path(self.tmp) / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text("# missão de teste\n", encoding="utf-8")
        return str(p)

    def claude_session(self, session_id: str, cwd: str) -> str:
        proj = self.claude_home / "projects" / ("-".join(cwd.split("/")))
        proj.mkdir(parents=True, exist_ok=True)
        (proj / f"{session_id}.jsonl").write_text("{}\n", encoding="utf-8")
        return session_id


def fake_herdr(script):
    """run_herdr replacement driven by argv keys. Pattern ending in '*' = prefix match.
    A script value that is already a full result dict (has "ok") is returned as-is
    (allows scripted herdr failures)."""
    def _run(args, timeout_s=10.0):
        key = " ".join(args)
        for pattern, ret in script.items():
            if isinstance(ret, dict) and ret.get("ok") is not None:
                if pattern.endswith("*"):
                    if key.startswith(pattern[:-1]):
                        return ret
                elif pattern == key:
                    return ret
            elif pattern.endswith("*"):
                if key.startswith(pattern[:-1]):
                    return {"ok": True, "data": ret}
            elif pattern == key:
                return {"ok": True, "data": ret}
        return {"ok": False, "error": f"unexpected herdr call: {key}"}
    return _run


def split_ok(pane_id="w1:pZ"):
    return {"id": "cli", "result": {"pane": {"pane_id": pane_id}}}


def tab_ok(tab_id="t1", pane_id="w1:pZ"):
    return {"id": "cli", "result": {"tab": {"tab_id": tab_id}, "pane": {"pane_id": pane_id}}}


def pane_entry(pane_id, cwd="/tmp"):
    return {"pane_id": pane_id, "cwd": cwd, "title": pane_id}


def tab_entry(tab_id, label=""):
    return {"tab_id": tab_id, "label": label}


def panes_ok(entries):
    return {"id": "cli", "result": {"panes": entries}}


def tabs_ok(entries):
    return {"id": "cli", "result": {"tabs": entries}}


def out_result(text):
    return {"id": "cli", "result": {"output": text}}


def procinfo(name):
    procs = [{"name": name}] if name else []
    return {"id": "cli", "result": {"foreground_processes": procs, "shell_pid": 42}}


READY = "? for shortcuts"


def track_calls(script=None):
    """run_herdr replacement that records every call and answers from script
    (prefix or exact match); unmatched calls succeed with empty data."""
    calls = []
    base = fake_herdr(script or {})

    def track(args, timeout_s=10.0):
        calls.append(list(args))
        ret = base(args, timeout_s)
        if ret.get("ok") is False and "unexpected herdr call" in ret.get("error", ""):
            return {"ok": True, "data": ""}
        return ret
    return calls, track


# ================================================================ mission_core

class TestValidation(unittest.TestCase):
    def test_mission_id(self):
        self.assertIsNone(mc.validate_mission_id("MISSION-OPS-01"))
        self.assertIsNone(mc.validate_mission_id("m.1_2-3"))
        self.assertIsNotNone(mc.validate_mission_id(""))
        self.assertIsNotNone(mc.validate_mission_id("a/b"))
        self.assertIsNotNone(mc.validate_mission_id("../etc"))
        self.assertIsNotNone(mc.validate_mission_id("x" * 100))

    def test_prompt_file(self):
        with TempState() as ts:
            pf, e = mc.validate_prompt_file(ts.prompt_file())
            self.assertIsNone(e)
            self.assertIsNotNone(pf)
            _, e = mc.validate_prompt_file("relative.md")
            self.assertIn("absolute", e)
            _, e = mc.validate_prompt_file("/nonexistent/p.md")
            self.assertIn("existing", e)

    def test_ledger_and_events(self):
        with TempState() as ts:
            mc.save_ledger({"missionId": "m1", "status": "dispatched", "paneId": "w1:pZ"})
            self.assertEqual(mc.load_ledger("m1")["status"], "dispatched")
            self.assertIsNone(mc.load_ledger("missing"))
            mc.append_event("m1", "w1:pZ", "prompt_sent", detail="/x/p.md")
            self.assertEqual(mc.last_event("m1")["event"], "prompt_sent")
            self.assertIsNone(mc.last_event("nope"))
            self.assertEqual(len(mc.list_ledgers()), 1)


# ================================================================ dispatch

class TestDispatch(unittest.TestCase):
    def tab_script(self, cwd, tab_id="t1", pane_id="w1:pZ", run_claude=True):
        script = {
            f"tab create --cwd {cwd} --no-focus": tab_ok(tab_id, pane_id),
            f"tab rename {tab_id} MISSION:m1": "",
            f"pane rename {pane_id} titulo": "",
        }
        if run_claude:
            script[f"pane run {pane_id} env ANTHROPIC_BASE_URL=http://127.0.0.1:8102 ANTHROPIC_AUTH_TOKEN=dummy ANTHROPIC_API_KEY=dummy CLAUDE_CONFIG_DIR={cwd}/.claude-config claude"] = ""
        return script

    def test_happy_path(self):
        with TempState() as ts:
            prompt = ts.prompt_file()
            cwd = str(Path(prompt).parent)
            sid = ts.claude_session("sess-1", cwd=cwd)
            script = self.tab_script(cwd)
            script[f"pane run w1:pZ {mc.dispatch_prompt(prompt)}"] = ""
            with mock.patch.object(mc, "run_herdr", fake_herdr(script)), \
                 mock.patch.object(mc, "wait_output", return_value=(READY, None)), \
                 mock.patch.object(mc, "deliver_prompt", return_value=(True, None)):
                res = json.loads(PKG.handle_mission_dispatch(
                    {"missionId": "m1", "promptFile": prompt, "paneTitle": "titulo"}))
            self.assertTrue(res["ok"])
            self.assertEqual(res["status"], "dispatched")
            self.assertEqual(res["paneId"], "w1:pZ")
            self.assertEqual(res["creation"], "tab")
            self.assertEqual(res["tabId"], "t1")
            led = mc.load_ledger("m1")
            self.assertEqual(led["status"], "dispatched")
            self.assertEqual(led["resumeSessionId"], sid)
            self.assertEqual(led["paneId"], "w1:pZ")
            self.assertEqual(led["tabId"], "t1")
            self.assertEqual(led["creation"], "tab")
            events = (ts.state / "events.jsonl").read_text().strip().splitlines()
            self.assertTrue(any('"pane_created"' in e for e in events))
            self.assertTrue(any('"prompt_sent"' in e for e in events))

    def test_idempotent_no_op(self):
        with TempState() as ts:
            prompt = ts.prompt_file()
            mc.save_ledger({"missionId": "m1", "status": "dispatched", "paneId": "w1:pZ",
                            "promptFile": prompt, "resumeSessionId": "s0"})
            res = json.loads(PKG.handle_mission_dispatch(
                {"missionId": "m1", "promptFile": prompt}))
            self.assertTrue(res["ok"])
            self.assertEqual(res["status"], "no_op")
            self.assertEqual(mc.load_ledger("m1")["resumeSessionId"], "s0")

    def test_prompt_failed_retries_same_pane(self):
        with TempState() as ts:
            prompt = ts.prompt_file()
            mc.save_ledger({"missionId": "m1", "status": "prompt_failed", "paneId": "w1:pZ",
                            "tabId": "t1", "promptFile": prompt, "cwd": str(Path(prompt).parent)})
            with mock.patch.object(mc, "deliver_prompt", return_value=(True, None)):
                res = json.loads(PKG.handle_mission_dispatch({"missionId": "m1", "promptFile": prompt}))
            self.assertTrue(res["ok"])
            self.assertTrue(res.get("retriedPrompt"))
            self.assertEqual(res["paneId"], "w1:pZ")
            self.assertEqual(mc.load_ledger("m1")["status"], "dispatched")

    def test_terminal_status_re_dispatches(self):
        """25/09 (prova d): delivered/closed + pane VIVO = NO_OP com pointer — sem isso
        o re-dispatch do MESMO id criava aba duplicada (provado ao vivo, w3:tM).
        26/09 fix (gap GWS-SOVEREIGN-01 ao vivo): delivered/closed + pane MORTO =
        redispatch legítimo (aba perdida em realocação não enterra a missão)."""
        with TempState() as ts:
            prompt = ts.prompt_file()
            cwd = str(Path(prompt).parent)
            # ramo 1: pane AINDA VIVO -> no_op (protecao anti-duplicata preservada)
            with mock.patch.object(mc, "pane_exists", return_value=True):
                for st in ("delivered", "closed"):
                    mc.save_ledger({"missionId": "m1", "status": st, "paneId": "w1:pZ",
                                    "tabId": "t0", "promptFile": prompt, "cwd": cwd})
                    res = json.loads(PKG.handle_mission_dispatch(
                        {"missionId": "m1", "promptFile": prompt, "cwd": cwd}))
                    self.assertTrue(res["ok"], f"status={st}")
                    self.assertEqual(res["status"], "no_op")
                    self.assertEqual(res["paneId"], "w1:pZ")
            # ramo 2: pane MORTO -> redispatch integral (novo pane/aba, ledger novo)
            with mock.patch.object(mc, "pane_exists", return_value=False), \
                 mock.patch.object(mc, "run_herdr", fake_herdr(self.tab_script(cwd))), \
                 mock.patch.object(mc, "wait_output", return_value=(READY, None)), \
                 mock.patch.object(mc, "deliver_prompt", return_value=(True, None)):
                for st in ("delivered", "closed"):
                    mc.save_ledger({"missionId": "m1", "status": st, "paneId": "w1:pZ",
                                    "tabId": "t0", "promptFile": prompt, "cwd": cwd})
                    res = json.loads(PKG.handle_mission_dispatch(
                        {"missionId": "m1", "promptFile": prompt, "cwd": cwd}))
                    self.assertTrue(res["ok"], f"status={st}")
                    self.assertEqual(res["status"], "dispatched")
                    self.assertEqual(res["paneId"], "w1:pZ")

    def test_invalid_inputs(self):
        res = json.loads(PKG.handle_mission_dispatch(
            {"missionId": "../x", "promptFile": "/x/y"}))
        self.assertEqual(res["error"], "INVALID_MISSION_ID")
        with TempState():
            res = json.loads(PKG.handle_mission_dispatch(
                {"missionId": "m", "promptFile": "/nonexistent/p.md"}))
            self.assertEqual(res["error"], "INVALID_PROMPT_FILE")
        with TempState() as ts:
            res = json.loads(PKG.handle_mission_dispatch(
                {"missionId": "m", "promptFile": ts.prompt_file(), "cwd": "/no/such/dir"}))
            self.assertEqual(res["error"], "INVALID_CWD")

    def test_herdr_failure_is_clean(self):
        with TempState() as ts:
            prompt = ts.prompt_file()
            with mock.patch.object(mc, "tab_create", return_value=(None, None, "tab create broke")), \
                 mock.patch.object(mc, "split_pane", return_value=(None, "split broke")):
                res = json.loads(PKG.handle_mission_dispatch(
                    {"missionId": "m2", "promptFile": prompt, "sourcePaneId": "w1:pS"}))
            self.assertFalse(res["ok"])
            self.assertEqual(res["error"], "HERDR_PANE_CREATE_FAILED")
            self.assertIn("split broke", res["detail"])

    def test_tab_create_failure_no_source(self):
        with TempState() as ts:
            prompt = ts.prompt_file()
            # HERDR_PANE_ID vazaria do ambiente real (o supervisor roda DENTRO de herdr) e
            # ativaria o fallback split contra panes REAIS — neutralizar p/ nunca tocar herdr de verdade.
            with mock.patch.dict(os.environ, {"HERDR_PANE_ID": ""}), \
                 mock.patch.object(mc, "tab_create", return_value=(None, None, "tab create broke")):
                res = json.loads(PKG.handle_mission_dispatch({"missionId": "m2", "promptFile": prompt}))
            self.assertFalse(res["ok"])
            self.assertEqual(res["error"], "HERDR_TAB_CREATE_FAILED")
            self.assertIn("sem sourcePaneId", res["detail"])

    def test_tab_create_payload_without_pane_id_falls_back_to_pane_list(self):
        # bug 25/09 (w3:tB/pH real): tab create pode voltar SEM pane_id — o fallback
        # descobre o pane pelo pane list (tab_id match). Nunca retornar pane None com tab vivo.
        script = {
            "tab create --cwd /tmp/x --no-focus": {"tab": {"tab_id": "w1:t1"}},
            "pane list": panes_ok([{"pane_id": "w1:p1", "tab_id": "w1:t1"}]),
        }
        with mock.patch.object(mc, "run_herdr", fake_herdr(script)):
            tab_id, pane_id, err = mc.tab_create(cwd="/tmp/x")
        self.assertIsNone(err)
        self.assertEqual((tab_id, pane_id), ("w1:t1", "w1:p1"))

    def test_split_fallback(self):
        with TempState() as ts:
            prompt = ts.prompt_file()
            sid = ts.claude_session("sess-2", cwd=str(Path(prompt).parent))
            script = {
                "pane split --pane w1:pS --direction down --ratio 0.5 --cwd "
                f"{Path(prompt).parent} --no-focus": split_ok("w1:pZ"),
                f"pane run w1:pZ env ANTHROPIC_BASE_URL=http://127.0.0.1:8102 ANTHROPIC_AUTH_TOKEN=dummy ANTHROPIC_API_KEY=dummy CLAUDE_CONFIG_DIR={Path(prompt).parent}/.claude-config claude": "",
                f"pane run w1:pZ {mc.dispatch_prompt(prompt)}": "",
            }
            with mock.patch.object(mc, "tab_create", return_value=(None, None, "boom")), \
                 mock.patch.object(mc, "run_herdr", fake_herdr(script)), \
                 mock.patch.object(mc, "wait_output", return_value=(READY, None)), \
                 mock.patch.object(mc, "deliver_prompt", return_value=(True, None)):
                res = json.loads(PKG.handle_mission_dispatch(
                    {"missionId": "m2", "promptFile": prompt, "sourcePaneId": "w1:pS",
                     "direction": "down"}))
            self.assertTrue(res["ok"])
            self.assertEqual(res["creation"], "split_fallback")
            self.assertEqual(res["paneId"], "w1:pZ")
            self.assertIsNone(res["tabId"])
            led = mc.load_ledger("m2")
            self.assertEqual(led["creation"], "split_fallback")
            self.assertEqual(led["resumeSessionId"], sid)

    def test_ready_error_detected(self):
        with TempState() as ts:
            prompt = ts.prompt_file()
            cwd = str(Path(prompt).parent)
            script = self.tab_script(cwd, run_claude=True)
            with mock.patch.object(mc, "run_herdr", fake_herdr(script)), \
                 mock.patch.object(mc, "wait_output", return_value=(None, "timeout")), \
                 mock.patch.object(mc, "read_output",
                                   return_value=("Do you trust the files in this folder?\n"
                                                 "claude has not yet visited this folder", None)), \
                 mock.patch.object(PKG.time, "time",
                                   side_effect=itertools.count(time.time(), 10.0)):
                # WATCHDOG-LANE2-01: com mocks instantâneos o loop do ready-dance
                # (deadline 180s real) gira ~46M vezes e a call-history do MagicMock
                # estoura o RLIMIT_AS de 6GB do runner (MemoryError determinístico,
                # medido com vm: 33MB estável até a explosão). Clock acelerado:
                # ~19 rodadas, mesma semântica (timeout -> READY_REGEX_ERROR).
                res = json.loads(PKG.handle_mission_dispatch({"missionId": "m9", "promptFile": prompt}))
            self.assertFalse(res["ok"])
            self.assertEqual(res["error"], "READY_REGEX_ERROR")
            self.assertEqual(mc.load_ledger("m9")["status"], "needs_recovery")
            self.assertIn("mission_recover", res["detail"])

    def test_ready_error_inline(self):
        # wait_output retorna o próprio texto da tela de erro (regex combinado casou)
        with TempState() as ts:
            prompt = ts.prompt_file()
            script = self.tab_script(str(Path(prompt).parent), run_claude=True)
            with mock.patch.object(mc, "run_herdr", fake_herdr(script)), \
                 mock.patch.object(mc, "wait_output",
                                   return_value=("Do you trust the files in this folder?", None)):
                res = json.loads(PKG.handle_mission_dispatch({"missionId": "m9", "promptFile": prompt}))
            self.assertFalse(res["ok"])
            self.assertEqual(res["error"], "READY_REGEX_ERROR")

    def test_start_timeout_records_state(self):
        with TempState() as ts:
            prompt = ts.prompt_file()
            script = self.tab_script(str(Path(prompt).parent), run_claude=True)
            # watch-detector-fix-01: relógio falso (+16s/leitura ≈ wait de 15s real). Sem
            # ele o loop de 180s girava sem sleep e os mocks gravavam milhões de chamadas
            # em mock_calls — o leak de 4-12G que OOM-matava a suíte (27-28/09).
            clock = itertools.count(time.time(), 16.0)
            with mock.patch.object(mc, "run_herdr", fake_herdr(script)), \
                 mock.patch.object(PKG.time, "time", side_effect=lambda: next(clock)), \
                 mock.patch.object(mc, "wait_output", return_value=(None, "timeout")), \
                 mock.patch.object(mc, "read_output", return_value=("nothing here", None)):
                res = json.loads(PKG.handle_mission_dispatch({"missionId": "m3", "promptFile": prompt}))
            self.assertFalse(res["ok"])
            self.assertEqual(res["error"], "CLAUDE_START_TIMEOUT")
            self.assertEqual(mc.load_ledger("m3")["status"], "start_timeout")
            # start_timeout é ativo -> re-dispatch = NO_OP (determinismo)
            res2 = json.loads(PKG.handle_mission_dispatch({"missionId": "m3", "promptFile": prompt}))
            self.assertEqual(res2["status"], "no_op")


# ================================================================ watch + classification

class TestClassification(unittest.TestCase):
    def test_each_event(self):
        cases = {
            "Relatório final da missão": "delivered",
            "FINGERPRINT {...}": "delivered",
            "API Error: 400 ...": "transcript400",
            "Type to search commands": "palette",
            "Interrupted by user": "interrupted",
            "Auto-compact enabled at 55%": "autocompact",
            "Compacting conversation": "autocompact",
            "resposta normal do chat": None,
        }
        for text, want in cases.items():
            self.assertEqual(rc.classify_text(text), want, text)


class TestWatch(unittest.TestCase):
    def _ledger(self, ts):
        prompt = ts.prompt_file()
        mc.save_ledger({"missionId": "m1", "status": "dispatched", "paneId": "w1:pZ",
                        "promptFile": prompt, "cwd": str(Path(prompt).parent),
                        "resumeSessionId": "s1"})

    def test_interrupted_auto_recipe(self):
        with TempState() as ts:
            self._ledger(ts)
            calls, track = track_calls({
                # pane list (pane_exists) precisa ver o pane vivo — payload vazio agora
                # significa honestamente "nenhum pane" -> tab_closed
                "pane list": panes_ok([pane_entry("w1:pZ")]),
                "pane wait-output w1:pZ*": out_result("Interrupted by user")})
            with mock.patch.object(mc, "run_herdr", track):
                res = json.loads(PKG.handle_mission_watch({"missionId": "m1"}))
            self.assertEqual(res["event"], "interrupted")
            self.assertEqual(res["autoRecipe"]["recipe"], "interrupted")
            self.assertEqual(mc.load_ledger("m1")["status"], "dispatched")
            keys = [c for c in calls if c[:1] == ["pane"] and c[1] in ("send-keys", "send-text")]
            self.assertEqual(keys, [
                ["pane", "send-keys", "w1:pZ", "esc"],
                ["pane", "send-text", "w1:pZ", "continue"],
                ["pane", "send-keys", "w1:pZ", "enter"],
            ])

    def test_transcript400_marks_without_recipe(self):
        with TempState() as ts:
            self._ledger(ts)
            with mock.patch.object(mc, "run_herdr",
                                   fake_herdr({"pane wait-output w1:pZ*": out_result("API Error: 400")})):
                res = json.loads(PKG.handle_mission_watch({"missionId": "m1"}))
            self.assertEqual(res["event"], "transcript400")
            self.assertIsNone(res["autoRecipe"])
            self.assertIn("mission_recover", res["note"])
            self.assertEqual(mc.load_ledger("m1")["status"], "needs_recovery")

    def test_delivered_sets_status(self):
        with TempState() as ts:
            self._ledger(ts)
            with mock.patch.object(mc, "run_herdr",
                                   fake_herdr({"pane wait-output w1:pZ*":
                                               out_result("Relatório final: tudo verde")})):
                res = json.loads(PKG.handle_mission_watch({"missionId": "m1"}))
            self.assertEqual(res["event"], "delivered")
            self.assertEqual(mc.load_ledger("m1")["status"], "delivered")
            self.assertIn("supervisor", res["note"])

    def test_pane_became_shell(self):
        with TempState() as ts:
            self._ledger(ts)
            script = {
                "pane wait-output w1:pZ*": {"id": "cli", "result": {}},
                "pane read w1:pZ --source recent-unwrapped --lines 40": out_result(""),
                "pane process-info --pane w1:pZ": procinfo(None),
            }
            with mock.patch.object(mc, "run_herdr", fake_herdr(script)):
                res = json.loads(PKG.handle_mission_watch({"missionId": "m1"}))
            self.assertEqual(res["event"], "shell_fallback")
            self.assertIsNone(res["autoRecipe"])
            self.assertEqual(mc.load_ledger("m1")["status"], "needs_recovery")

    def test_no_event(self):
        with TempState() as ts:
            self._ledger(ts)
            script = {
                "pane wait-output w1:pZ*": {"id": "cli", "result": {}},
                "pane read w1:pZ --source recent-unwrapped --lines 40": out_result(""),
                "pane process-info --pane w1:pZ": procinfo("claude"),
            }
            with mock.patch.object(mc, "run_herdr", fake_herdr(script)):
                res = json.loads(PKG.handle_mission_watch({"missionId": "m1"}))
            self.assertEqual(res["event"], "no_event")

    def test_herdr_failure_clean(self):
        with TempState() as ts:
            self._ledger(ts)

            def boom(args, timeout_s=10.0):
                raise mc.HerdrError("herdr timeout")
            with mock.patch.object(mc, "run_herdr", boom):
                res = json.loads(PKG.handle_mission_watch({"missionId": "m1", "timeoutMs": 1000}))
            self.assertFalse(res["ok"])
            self.assertIn("timeout", res["error"])

    def test_all_mode_snapshot_no_blocking_wait(self):
        """25/09: modo all = SNAPSHOT (cobrança do operador: 50s de vigília não é
        aceitável). Deve ler 1x por pane e NUNCA chamar wait-output (espera bloqueante)."""
        with TempState() as ts:
            mc.save_ledger({"missionId": "a1", "status": "dispatched", "paneId": "w1:pA",
                            "promptFile": ts.prompt_file()})
            mc.save_ledger({"missionId": "a2", "status": "dispatched", "paneId": "w1:pB",
                            "promptFile": ts.prompt_file()})
            script = {
                "pane list": panes_ok([pane_entry("w1:pA"), pane_entry("w1:pB")]),
                "pane read w1:pA --source recent-unwrapped --lines 40": out_result(
                    "Relatório final da missão"),
                "pane read w1:pB --source recent-unwrapped --lines 40": out_result(""),
                "pane process-info --pane w1:pB": procinfo("claude"),
            }
            calls, track = track_calls(script)
            with mock.patch.object(mc, "run_herdr", track):
                res = json.loads(PKG.handle_mission_watch({"all": "true"}))
            self.assertTrue(res["ok"])
            self.assertEqual(res["mode"], "snapshot")
            events = {m["missionId"]: m.get("event") for m in res["missions"]}
            self.assertEqual(events["a1"], "delivered")
            self.assertEqual(events["a2"], "no_event")
            waits = [c for c in calls if c[:2] == ["pane", "wait-output"]]
            self.assertEqual(waits, [])  # ZERO espera bloqueante
            # pane list chamado 1x (cache de existência), não 1x por missão
            self.assertEqual(len([c for c in calls if c[:2] == ["pane", "list"]]), 1)

    def test_single_snapshot_arg(self):
        with TempState() as ts:
            self._ledger(ts)
            script = {
                "pane list": panes_ok([pane_entry("w1:pZ")]),
                "pane read w1:pZ --source recent-unwrapped --lines 40": out_result(
                    "API Error: 400"),
            }
            calls, track = track_calls(script)
            with mock.patch.object(mc, "run_herdr", track):
                res = json.loads(PKG.handle_mission_watch(
                    {"missionId": "m1", "snapshot": "true"}))
            self.assertEqual(res["mode"], "snapshot")
            self.assertEqual(res["event"], "transcript400")
            self.assertEqual([c for c in calls if c[:2] == ["pane", "wait-output"]], [])

    def test_liveness_idle_vs_working(self):
        """25/09 (teste do OPERADOR: PHOTOPEA-EXEC-01 estava PARADA e o snapshot
        reportou como saudável). no_event tem que distinguir working de idle."""
        with TempState() as ts:
            def _mk(pane, footer):
                mc.save_ledger({"missionId": pane, "status": "dispatched",
                                "paneId": f"w1:p{pane}", "promptFile": ts.prompt_file()})
                return {f"pane read w1:p{pane} --source recent-unwrapped --lines 40":
                        out_result(f"qualquer coisa\n{footer}"),
                        f"pane process-info --pane w1:p{pane}": procinfo("claude")}
            mc.save_ledger({"missionId": "L1", "status": "dispatched", "paneId": "w1:pL1",
                            "promptFile": ts.prompt_file()})
            mc.save_ledger({"missionId": "L2", "status": "dispatched", "paneId": "w1:pL2",
                            "promptFile": ts.prompt_file()})
            script = {
                "pane list": panes_ok([pane_entry("w1:pL1"), pane_entry("w1:pL2")]),
                "pane read w1:pL1 --source recent-unwrapped --lines 40": out_result(
                    "⏵⏵ accept edits on (shift+tab to cycle)"),
                "pane read w1:pL2 --source recent-unwrapped --lines 40": out_result(
                    "trabalhando… esc to interrupt"),
                "pane process-info --pane w1:pL1": procinfo("claude"),
                "pane process-info --pane w1:pL2": procinfo("claude"),
            }
            with mock.patch.object(mc, "run_herdr", fake_herdr(script)):
                res = json.loads(PKG.handle_mission_watch({}))
            lv = {m["missionId"]: (m.get("liveness"), m.get("note", "")) for m in res["missions"]}
            self.assertEqual(lv["L1"][0], "idle")            # PARADA — nunca "saudável"
            self.assertIn("estacionada", lv["L1"][1])
            self.assertEqual(lv["L2"][0], "working")         # processando

    def test_all_mode_empty(self):
        with TempState():
            res = json.loads(PKG.handle_mission_watch({"all": "true"}))
            self.assertTrue(res["ok"])
            self.assertEqual(res["missions"], [])


# ================================================================ recover recipes

class TestRecipes(unittest.TestCase):
    def test_interrupted_positive(self):
        with TempState() as ts:
            mc.save_ledger({"missionId": "m1", "status": "interrupted", "paneId": "w1:pZ",
                            "promptFile": "/x/p.md", "cwd": "/opt/mission-x"})
            calls, track = track_calls()
            with mock.patch.object(mc, "run_herdr", track):
                r, err = rc.recover("w1:pZ", "interrupted", mc.load_ledger("m1"))
            self.assertIsNone(err)
            self.assertEqual(r["recipe"], "interrupted")
            keys = [c for c in calls if c[0] == "pane" and c[1] in ("send-keys", "send-text")]
            self.assertEqual(keys, [
                ["pane", "send-keys", "w1:pZ", "esc"],
                ["pane", "send-text", "w1:pZ", "continue"],
                ["pane", "send-keys", "w1:pZ", "enter"],
            ])
            self.assertEqual(mc.load_ledger("m1")["status"], "dispatched")

    def test_palette_esc_only_never_quit(self):
        with TempState() as ts:
            mc.save_ledger({"missionId": "m1", "status": "dispatched", "paneId": "w1:pZ",
                            "promptFile": "/x/p.md", "cwd": "/opt/mission-x"})
            calls, track = track_calls()
            with mock.patch.object(mc, "run_herdr", track):
                r, err = rc.recover("w1:pZ", "palette", mc.load_ledger("m1"))
            self.assertIsNone(err)
            self.assertEqual(calls, [["pane", "send-keys", "w1:pZ", "esc"]])  # NEVER /quit

    def test_transcript400_fresh_session_never_resumes_poisoned(self):
        with TempState() as ts:
            ts.claude_session("fresh-sess", cwd="/opt/mission-x")
            # WATCHDOG-LANE2-01: receita agora é relaunch.py (/exit → ready → claude com
            # CLAUDE_CONFIG_DIR → retomada por disco) — pane sintético do herdr_stub.
            import herdr_stub as hs
            pane = hs.FakePane(state="api_error", cwd="/opt/mission-x")
            with hs.install(mc, pane):
                r, err = rc.recover("w1:pZ", "transcript400",
                                    {"missionId": "m1", "paneId": "w1:pZ",
                                     "promptFile": "/x/p.md", "cwd": "/opt/mission-x",
                                     "resumeSessionId": "POISONED"})
            self.assertIsNone(err)
            self.assertEqual(r["recipe"], "transcript400")
            # fresh claude, NUNCA `claude --resume POISONED`
            self.assertTrue(pane.commands[0].endswith(" claude"))
            self.assertFalse(any("--resume POISONED" in c for c in pane.commands))
            self.assertTrue(any("no disco" in p for p in pane.prompts))
            self.assertEqual(mc.load_ledger("m1")["resumeSessionId"], "fresh-sess")

    def test_shell_fallback_uses_ledger_resume(self):
        with TempState() as ts:
            mc.save_ledger({"missionId": "m1", "status": "needs_recovery", "paneId": "w1:pZ",
                            "promptFile": "/x/p.md", "cwd": "/opt/mission-x",
                            "resumeSessionId": "sess-keep"})
            calls, track = track_calls()
            with mock.patch.object(mc, "run_herdr", track), \
                 mock.patch.object(mc, "wait_output", return_value=(READY, None)):
                r, err = rc.recover("w1:pZ", "shell_fallback", mc.load_ledger("m1"))
            self.assertIsNone(err)
            self.assertEqual(r["applied"],
                             f"claude --resume sess-keep (cd /opt/mission-x)")  # F2: cwd do ledger
            self.assertEqual(mc.load_ledger("m1")["status"], "dispatched")

    def test_shell_fallback_without_resume_id_starts_fresh(self):
        with TempState() as ts:
            ts.claude_session("sess-new", cwd="/opt/mission-x")
            calls, track = track_calls()
            with mock.patch.object(mc, "run_herdr", track), \
                 mock.patch.object(mc, "wait_output", return_value=(READY, None)):
                r, err = rc.recover("w1:pZ", "shell_fallback",
                                    {"missionId": "m1", "paneId": "w1:pZ",
                                     "promptFile": "/x/p.md", "cwd": "/opt/mission-x",
                                     "resumeSessionId": None})
            self.assertIsNone(err)
            runs = [c for c in calls if c[:2] == ["pane", "run"]]
            self.assertEqual(runs[0][3], "cd /opt/mission-x && claude")  # F2: cwd do ledger
            self.assertEqual(mc.load_ledger("m1")["resumeSessionId"], "sess-new")

    def test_autocompact_marks_only(self):
        with TempState() as ts:
            mc.save_ledger({"missionId": "m1", "status": "dispatched", "paneId": "w1:pZ",
                            "promptFile": "/x/p.md", "cwd": "/opt/mission-x"})
            calls, track = track_calls()
            with mock.patch.object(mc, "run_herdr", track):
                r, err = rc.recover("w1:pZ", "autocompact", mc.load_ledger("m1"))
            self.assertIsNone(err)
            self.assertEqual(calls, [])  # zero mutation no pane
            self.assertEqual(mc.load_ledger("m1")["status"], "autocompact")

    def test_unknown_pattern_no_mutation(self):
        calls, track = track_calls()
        with mock.patch.object(mc, "run_herdr", track):
            r, err = rc.recover("w1:pZ", "deploy_production", None)
        self.assertIsNotNone(err)
        self.assertIn("unknown", err)
        self.assertEqual(calls, [])  # zero mutation

    def test_delivered_is_not_a_recipe(self):
        r, err = rc.recover("w1:pZ", "delivered", None)
        self.assertIsNotNone(err)

    def test_transcript400_without_ledger(self):
        r, err = rc.recover("w1:pZ", "transcript400", None)
        self.assertIsNotNone(err)


class TestRecoverHandler(unittest.TestCase):
    def test_unknown_gives_needs_supervisor(self):
        with TempState():
            calls, track = track_calls()
            with mock.patch.object(mc, "run_herdr", track):
                res = json.loads(PKG.handle_mission_recover(
                    {"paneId": "w1:pZ", "pattern": "what?"}))
            self.assertFalse(res["ok"])
            self.assertTrue(res["needsSupervisor"])

    def test_requires_pane_and_pattern(self):
        self.assertEqual(json.loads(PKG.handle_mission_recover(
            {"paneId": "", "pattern": "x"}))["error"], "INVALID_PANE_ID")
        self.assertEqual(json.loads(PKG.handle_mission_recover(
            {"paneId": "w1:pZ", "pattern": ""}))["error"], "INVALID_PATTERN")

    def test_found_by_pane_scan(self):
        with TempState() as ts:
            mc.save_ledger({"missionId": "m1", "status": "interrupted", "paneId": "w9:pQ",
                            "promptFile": "/x/p.md", "cwd": "/opt/mission-x"})
            calls, track = track_calls()
            with mock.patch.object(mc, "run_herdr", track):
                res = json.loads(PKG.handle_mission_recover(
                    {"paneId": "w9:pQ", "pattern": "interrupted"}))
            self.assertTrue(res["ok"])
            self.assertEqual(res["recipe"], "interrupted")
            self.assertEqual(mc.load_ledger("m1")["status"], "dispatched")


# ================================================================ status

class TestStatus(unittest.TestCase):
    def test_one_and_all_and_empty(self):
        with TempState() as ts:
            res = json.loads(PKG.handle_mission_status({}))
            self.assertEqual(res["missions"], [])
            mc.save_ledger({"missionId": "m1", "status": "dispatched", "paneId": "w1:pZ",
                            "promptFile": "/x/p.md", "resumeSessionId": "s1",
                            "updatedAt": "2026-09-24T00:00:00Z"})
            mc.append_event("m1", "w1:pZ", "prompt_sent", detail="/x/p.md")
            one = json.loads(PKG.handle_mission_status({"missionId": "m1"}))["missions"][0]
            self.assertEqual(one["missionId"], "m1")
            self.assertEqual(one["status"], "dispatched")
            self.assertEqual(one["resumeSessionId"], "s1")
            self.assertEqual(one["lastEvent"], "prompt_sent")
            self.assertTrue(one["lastEventAt"].startswith("20"))
            all_m = json.loads(PKG.handle_mission_status({}))["missions"]
            self.assertEqual(len(all_m), 1)
            missing = json.loads(PKG.handle_mission_status({"missionId": "zzz"}))
            self.assertEqual(missing["missions"], [])


class TestLoadLedgerFix(unittest.TestCase):
    """LOAD-LEDGER-FIX-01: .json que não é mission-record (lista, inválido, vazio) nunca derruba."""

    def _poison(self, state):
        (state / "notify-signatures.json").write_text('["a", "b"]', encoding="utf-8")
        (state / "stray-list.json").write_text("[1, 2]", encoding="utf-8")
        (state / "broken.json").write_text("{not json", encoding="utf-8")
        (state / "empty.json").write_text("", encoding="utf-8")
        (state / "no-id.json").write_text('{"status": "x"}', encoding="utf-8")

    def test_list_ledgers_skips_non_records(self):
        with TempState() as ts:
            mc.save_ledger({"missionId": "m1", "status": "dispatched"})
            self._poison(ts.state)
            ledgers, skipped = mc.list_ledgers_report()
            self.assertEqual([l["missionId"] for l in ledgers], ["m1"])
            self.assertEqual(sorted(skipped), ["broken.json", "empty.json", "no-id.json",
                                               "stray-list.json"])
            self.assertNotIn("notify-signatures.json", skipped)  # denylist explícita
            self.assertIsNone(mc.load_ledger("stray-list"))
            self.assertEqual((ts.state / "notify-signatures.json").read_text(), '["a", "b"]')

    def test_status_and_list_survive_poisoned_dir(self):
        with TempState() as ts:
            mc.save_ledger({"missionId": "m1", "status": "dispatched", "paneId": "w1:pZ"})
            self._poison(ts.state)
            st = json.loads(PKG.handle_mission_status({}))
            self.assertTrue(st["ok"])
            self.assertEqual([m["missionId"] for m in st["missions"]], ["m1"])
            self.assertIn("stray-list.json", st["skipped"])
            script = {"pane list": panes_ok([]), "tab list": tabs_ok([])}
            with mock.patch.object(mc, "run_herdr", fake_herdr(script)):
                ls = json.loads(PKG.handle_mission_list({}))
            self.assertTrue(ls["ok"])
            self.assertEqual([m["missionId"] for m in ls["missions"]], ["m1"])
            self.assertTrue(any("stray-list.json" in w for w in ls["warnings"]))


# ================================================================ MISSION-OPS-02 additions


class TestClassificationExtra(unittest.TestCase):
    def test_ready_regex_error_patterns(self):
        # 25/09: o aviso do model catalog aparece em TODO claude start (settings USER-level)
        # e é NÃO-fatal — não pode mais ser classificado como ready_regex_error.
        self.assertIsNone(
            rc.classify_text("model 'z-foo' isn't described by this version's model catalog"))
        self.assertEqual(rc.classify_text("Do you trust the files in this folder?"),
                         "ready_regex_error")
        # 25/09 (RED->GREEN): wording NOVO do trust prompt no claude atual
        self.assertEqual(
            rc.classify_text(
                "Quick safety check: Is this a project you created or one you trust? "
                "(Like your own code...) ❯ No, exit / Yes, I trust this folder"),
            "ready_regex_error")
        # 25/09: marcador de REPL pronta no relançamento (sem tela de tips) — o
        # separador na tela real é NBSP (\xa0), não espaço normal
        self.assertTrue(
            re.search(mc.ready_regex(), '❯\xa0Try "create a util logging.py that..."'))

    def test_mcp_prompt_patterns(self):
        self.assertEqual(
            rc.classify_text("Use this MCP server?  ❯ Continue without using this MCP server"),
            "mcp_prompt")
        self.assertEqual(
            rc.classify_text("Use this and all future MCP servers"),
            "mcp_prompt")
        self.assertIsNone(rc.classify_text("nothing here"))


class TestDeliverPrompt(unittest.TestCase):
    """deliver_prompt: send-text + enter + verificação de aceitação; ctrl+u entre tentativas."""

    TEXT = "leia /x/p.md e execute a missao agora"
    TAIL = TEXT[-20:]

    def test_retry_after_stuck_text(self):
        reads = {"n": 0}

        def fake_read(pane_id, lines=40, source="recent-unwrapped"):
            reads["n"] += 1
            if reads["n"] == 1:
                return "❯ ", None  # F3: leitura pré-Enter da caixa — limpa (sem lixo)
            if reads["n"] == 2:
                return "junk\n" + self.TEXT, None  # última linha contém o tail -> preso na caixa
            return "prompt aceito pelo modelo", None

        calls, track = track_calls()
        with mock.patch.object(mc, "read_output", fake_read), \
             mock.patch.object(mc, "run_herdr", track), \
             mock.patch.object(mc.time, "sleep"):
            ok, err = mc.deliver_prompt("w1:pZ", self.TEXT, attempts=3)
        self.assertTrue(ok)
        self.assertIsNone(err)
        sent = [c for c in calls if c[:2] == ["pane", "send-text"]]
        enters = [c for c in calls if c[:3] == ["pane", "send-keys", "w1:pZ"] and c[3] == "enter"]
        ctrl_u = [c for c in calls if c[:3] == ["pane", "send-keys", "w1:pZ"] and c[3] == "ctrl+u"]
        self.assertEqual(len(sent), 2)    # 2 tentativas
        self.assertEqual(len(enters), 2)  # 1 enter por tentativa
        # MISSION-OPS-GUARD-01 F3: pré-clear (antes do 1º send) + entre tentativas
        self.assertGreaterEqual(len(ctrl_u), 1)
        # F3: 1 leitura pré-Enter por tentativa (2 tentativas) + 2 pós-Enter
        self.assertEqual(reads["n"], 4)

    def test_all_attempts_stuck_fails(self):
        def fake_read(pane_id, lines=40, source="recent-unwrapped"):
            return self.TEXT, None  # sempre preso na caixa

        calls, track = track_calls()
        with mock.patch.object(mc, "read_output", fake_read), \
             mock.patch.object(mc, "run_herdr", track), \
             mock.patch.object(mc.time, "sleep"):
            ok, err = mc.deliver_prompt("w1:pZ", self.TEXT, attempts=2)
        self.assertFalse(ok)
        self.assertIn("not accepted", err or "")

    def test_send_text_transport_failure(self):
        script = {"pane send-text *": {"ok": False, "error": "exit 1: boom"}}
        with mock.patch.object(mc, "run_herdr", fake_herdr(script)), \
             mock.patch.object(mc.time, "sleep"):
            ok, err = mc.deliver_prompt("w1:pZ", self.TEXT, attempts=2)
        self.assertFalse(ok)
        self.assertIn("send-text", err or "")


class TestReadyErrorRecipe(unittest.TestCase):
    """Recipe ready_regex_error: ctrl+c x2 -> relança claude no cwd correto -> re-entrega."""

    def test_recipe_relaunches_and_redelivers(self):
        with TempState() as ts:
            mc.save_ledger({"missionId": "m1", "status": "needs_recovery", "paneId": "w1:pZ",
                            "promptFile": "/x/p.md", "cwd": "/opt/mission-x"})
            ts.claude_session("sess-good", cwd="/opt/memoryos/eng-mcp")
            calls, track = track_calls()

            def fake_read(pane_id, lines=40, source="recent-unwrapped"):
                # 25/09: last_line_is_shell_prompt lê o pane — prompt de shell na tela
                return "root@srv1882271:/opt/mission-x# ", None

            with mock.patch.object(mc, "run_herdr", track), \
                 mock.patch.object(mc, "read_output", fake_read), \
                 mock.patch.object(mc, "wait_output", return_value=(READY, None)), \
                 mock.patch.object(mc, "deliver_prompt", return_value=(True, None)), \
                 mock.patch.object(rc.time, "sleep"):
                r, err = rc.recover("w1:pZ", "ready_regex_error", mc.load_ledger("m1"),
                                    cwd="/opt/memoryos/eng-mcp")
            self.assertIsNone(err)
            self.assertEqual(r["recipe"], "ready_regex_error")
            keys = [c for c in calls if c[:2] == ["pane", "send-keys"]]
            # 25/09: confirmação determinística pela última linha — o primeiro ctrl+c
            # já vê o prompt de shell no read_output mockado (1 iteração só)
            self.assertEqual(keys[0], ["pane", "send-keys", "w1:pZ", "ctrl+c"])
            runs = [c for c in calls if c[:2] == ["pane", "run"]]
            self.assertEqual(runs[0][3], "cd /opt/memoryos/eng-mcp && claude")
            led = mc.load_ledger("m1")
            self.assertEqual(led["cwd"], "/opt/memoryos/eng-mcp")
            self.assertEqual(led["resumeSessionId"], "sess-good")
            self.assertEqual(led["status"], "dispatched")
            self.assertEqual(mc.last_event("m1")["event"], "recovery_ready_regex_error")

    def test_recipe_requires_cwd(self):
        r, err = rc.recover("w1:pZ", "ready_regex_error", {"missionId": "m1", "cwd": ""}, None)
        self.assertEqual(r, {})
        self.assertIn("cwd", err or "")

    def test_recipe_requires_ledger(self):
        r, err = rc.recover("w1:pZ", "ready_regex_error", None, cwd="/tmp")
        self.assertIn("ledger", err or "")


class TestMcpPromptRecipe(unittest.TestCase):
    """Intersticial de trust de MCP: Enter no default ❯ resolve, zero relaunch."""

    MCP_TEXT = ("New MCP server found in this project: memoryos\n"
                "Use this MCP server?  ❯ Continue without using this MCP server")

    def _tab_script(self, cwd, mission_id="m10"):
        return {
            f"tab create --cwd {cwd} --no-focus": tab_ok("t10", "w1:pZ"),
            f"tab rename t10 MISSION:{mission_id}": "",
            f"pane rename w1:pZ titulo": "",
            f"pane run w1:pZ env ANTHROPIC_BASE_URL=http://127.0.0.1:8102 ANTHROPIC_AUTH_TOKEN=dummy ANTHROPIC_API_KEY=dummy CLAUDE_CONFIG_DIR={cwd}/.claude-config claude": "",
            f"pane send-keys w1:pZ enter": "",
        }

    def test_dispatch_dismisses_and_delivers(self):
        with TempState() as ts:
            prompt = ts.prompt_file()
            script = self._tab_script(str(Path(prompt).parent))
            recorded = []
            real_append = mc.append_event

            def _spy(mid, pane, event, **kw):
                recorded.append(event)
                return real_append(mid, pane, event, **kw)

            with mock.patch.object(mc, "run_herdr", fake_herdr(script)), \
                 mock.patch.object(mc, "wait_output",
                                   # loop (mcp) + wait interno do dismiss_mcp_prompt
                                   # (ready pós-enter) + wait da rodada seguinte (ready)
                                   side_effect=[(self.MCP_TEXT, None), (READY, None),
                                                (READY, None)]), \
                 mock.patch.object(mc, "deliver_prompt", return_value=(True, None)), \
                 mock.patch.object(mc, "append_event", side_effect=_spy):
                res = json.loads(PKG.handle_mission_dispatch(
                    {"missionId": "m10", "promptFile": prompt}))
            self.assertTrue(res["ok"])
            self.assertEqual(res["status"], "dispatched")
            self.assertEqual(mc.load_ledger("m10")["status"], "dispatched")
            self.assertIn("mcp_prompt", recorded)
            self.assertEqual(mc.last_event("m10")["event"], "prompt_sent")

    def test_recipe_enters_and_redelivers(self):
        with TempState() as ts:
            mc.save_ledger({"missionId": "m11", "status": "prompt_failed", "paneId": "w1:pZ",
                            "promptFile": ts.prompt_file(), "cwd": "/x"})
            with mock.patch.object(mc, "send_keys", return_value=None), \
                 mock.patch.object(mc, "wait_output", return_value=(READY, None)), \
                 mock.patch.object(mc, "deliver_prompt", return_value=(True, None)):
                r, err = rc.recover("w1:pZ", "mcp_prompt", mc.load_ledger("m11"))
            self.assertIsNone(err)
            self.assertEqual(r["recipe"], "mcp_prompt")
            led = mc.load_ledger("m11")
            self.assertEqual(led["status"], "dispatched")

    def test_recipe_no_redelivery_when_dispatched(self):
        # status já dispatched (watch auto-apply): só o Enter, sem re-entrega do prompt.
        with TempState() as ts:
            mc.save_ledger({"missionId": "m12", "status": "dispatched", "paneId": "w1:pZ",
                            "promptFile": ts.prompt_file(), "cwd": "/x"})
            with mock.patch.object(mc, "send_keys", return_value=None), \
                 mock.patch.object(mc, "wait_output", return_value=(READY, None)), \
                 mock.patch.object(mc, "deliver_prompt",
                                   return_value=(False, "should not be called")):
                r, err = rc.recover("w1:pZ", "mcp_prompt", mc.load_ledger("m12"))
            self.assertIsNone(err)
            self.assertEqual(mc.load_ledger("m12")["status"], "dispatched")

    def test_ready_error_recipe_redirects_to_mcp(self):
        # trust prompt de pasta NO branch ready_regex_error, mas o intersticial MCP está
        # visível na tela -> NÃO relança; resolve por mcp_prompt.
        with TempState() as ts:
            mc.save_ledger({"missionId": "m13", "status": "needs_recovery", "paneId": "w1:pZ",
                            "promptFile": ts.prompt_file(), "cwd": "/tmp/bad-cwd"})
            with mock.patch.object(mc, "read_output",
                                   return_value=("Do you trust the files in this folder?\n"
                                                 + self.MCP_TEXT, None)), \
                 mock.patch.object(mc, "send_keys", return_value=None), \
                 mock.patch.object(mc, "wait_output", return_value=(READY, None)), \
                 mock.patch.object(mc, "deliver_prompt", return_value=(True, None)):
                r, err = rc.recover("w1:pZ", "ready_regex_error", mc.load_ledger("m13"))
            self.assertIsNone(err)
            self.assertEqual(r["recipe"], "mcp_prompt")
            self.assertEqual(mc.load_ledger("m13")["status"], "dispatched")


class TestWatchClosed(unittest.TestCase):
    """pane/aba fechada de fora -> evento dedicado, não shell_fallback."""

    def test_tab_closed(self):
        with TempState() as ts:
            mc.save_ledger({"missionId": "m1", "status": "dispatched", "paneId": "w1:pZ",
                            "promptFile": ts.prompt_file()})
            script = {"pane list": panes_ok([]), "tab list": tabs_ok([])}
            with mock.patch.object(mc, "run_herdr", fake_herdr(script)):
                out = json.loads(PKG.handle_mission_watch({"missionId": "m1"}))
            self.assertEqual(out["event"], "tab_closed")
            self.assertEqual(mc.load_ledger("m1")["status"], "closed")

    def test_process_info_nested_payload_real_shape(self):
        """25/09: payload REAL do herdr = result.process_info.foreground_processes
        (um nível mais fundo que o formato dos mocks). claude VIVO nunca pode ser
        classificado como shell_fallback."""
        with TempState() as ts:
            mc.save_ledger({"missionId": "m1", "status": "dispatched", "paneId": "w1:pZ",
                            "promptFile": ts.prompt_file()})
            nested = {"id": "cli", "result": {"process_info": {
                "foreground_processes": [{"name": "claude"}], "shell_pid": 7}}}
            script = {
                "pane list": panes_ok([pane_entry("w1:pZ")]),
                "pane read w1:pZ --source recent-unwrapped --lines 40": out_result(""),
                "pane process-info --pane w1:pZ": nested,
            }
            with mock.patch.object(mc, "run_herdr", fake_herdr(script)):
                res = json.loads(PKG.handle_mission_watch({"missionId": "m1", "snapshot": "true"}))
            self.assertEqual(res["event"], "no_event")  # claude vivo, sem evento

    def test_pane_closed_with_tab_alive(self):
        with TempState() as ts:
            mc.save_ledger({"missionId": "m1", "status": "dispatched", "paneId": "w1:pZ",
                            "tabId": "t1", "promptFile": ts.prompt_file()})
            script = {"pane list": panes_ok([]), "tab list": tabs_ok([tab_entry("t1")])}
            with mock.patch.object(mc, "run_herdr", fake_herdr(script)):
                out = json.loads(PKG.handle_mission_watch({"missionId": "m1"}))
            self.assertEqual(out["event"], "pane_closed")
            self.assertEqual(mc.load_ledger("m1")["status"], "closed")


class TestExpandedScope(unittest.TestCase):
    """mission_read / mission_list / mission_close / worktree add+remove."""

    def test_read_by_mission_truncates_tail(self):
        with TempState():
            mc.save_ledger({"missionId": "m1", "paneId": "w1:pZ"})
            big = "x" * 100
            script = {"pane read w1:pZ --source recent-unwrapped --lines 40": out_result(big)}
            with mock.patch.object(mc, "run_herdr", fake_herdr(script)):
                out = json.loads(PKG.handle_mission_read({"missionId": "m1", "maxBytes": 50}))
            self.assertTrue(out["ok"])
            self.assertTrue(out["truncated"])
            self.assertEqual(out["text"], big[-50:])  # mantém o tail
            bad = json.loads(PKG.handle_mission_read({"missionId": "m1", "source": "bogus"}))
            self.assertEqual(bad["error"], "INVALID_SOURCE")

    def test_read_requires_pane_or_mission(self):
        out = json.loads(PKG.handle_mission_read({}))
        self.assertEqual(out["error"], "INVALID_PANE_ID")
        out2 = json.loads(PKG.handle_mission_read({"missionId": "nope"}))
        self.assertEqual(out2["error"], "MISSION_NOT_FOUND")

    def test_list_joins_ledgers_with_panes_and_tabs(self):
        with TempState():
            mc.save_ledger({"missionId": "m1", "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched", "creation": "tab"})
            script = {"pane list": panes_ok([pane_entry("w1:pZ", cwd="/tmp")]),
                      "tab list": tabs_ok([tab_entry("t1", "MISSION:m1")])}
            with mock.patch.object(mc, "run_herdr", fake_herdr(script)):
                out = json.loads(PKG.handle_mission_list({}))
            m = out["missions"][0]
            self.assertTrue(m["live"])
            self.assertEqual(m["tabLabel"], "MISSION:m1")
            self.assertEqual(out["warnings"], [])

    def test_list_reports_herdr_warnings(self):
        with TempState():
            mc.save_ledger({"missionId": "m1", "paneId": "w1:pZ"})
            script = {"tab list": {"ok": False, "error": "exit 1: tab boom"},
                      "pane list": {"ok": False, "error": "exit 1: pane boom"}}
            with mock.patch.object(mc, "run_herdr", fake_herdr(script)):
                out = json.loads(PKG.handle_mission_list({}))
            self.assertTrue(out["ok"])  # degrada com warnings, não falha
            self.assertTrue(any("tab list" in w for w in out["warnings"]))
            self.assertFalse(out["missions"][0]["live"])

    def test_close_exits_tab_and_closes_ledger(self):
        with TempState():
            mc.save_ledger({"missionId": "m1", "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched"})
            calls, track = track_calls()
            with mock.patch.object(mc, "run_herdr", track), \
                 mock.patch.object(mc.time, "sleep"):
                out = json.loads(PKG.handle_mission_close({"missionId": "m1"}))
            self.assertTrue(out["ok"])
            steps = [s["step"] for s in out["steps"]]
            self.assertIn("claude_exit", steps)   # foreground None -> nada a encerrar
            self.assertIn("tab_close", steps)
            led = mc.load_ledger("m1")
            self.assertEqual(led["status"], "closed")
            self.assertEqual(mc.last_event("m1")["event"], "mission_closed")

    def test_close_requires_target(self):
        out = json.loads(PKG.handle_mission_close({}))
        self.assertEqual(out["error"], "INVALID_MISSION_ID")

    def test_worktree_add_and_remove_roundtrip(self):
        with TempState():
            mc.save_ledger({"missionId": "m1", "paneId": "w1:pZ", "status": "dispatched"})
            # falta branch -> erro limpo
            out = json.loads(PKG.handle_mission_worktree_add({"missionId": "m1"}))
            self.assertEqual(out["error"], "INVALID_BRANCH")
            with mock.patch.object(mc, "worktree_create",
                                   return_value=({"path": "/wt/x", "branch": "b1",
                                                  "workspace_id": "ws1"}, None)):
                out = json.loads(PKG.handle_mission_worktree_add({"missionId": "m1", "branch": "b1"}))
            self.assertTrue(out["ok"])
            led = mc.load_ledger("m1")
            self.assertEqual(led["worktreeWorkspaceId"], "ws1")
            # duplicado -> recusa
            out = json.loads(PKG.handle_mission_worktree_add({"missionId": "m1", "branch": "b2"}))
            self.assertEqual(out["error"], "WORKTREE_ALREADY_RECORDED")
            # remove
            with mock.patch.object(mc, "worktree_remove", return_value=None):
                out = json.loads(PKG.handle_mission_worktree_remove({"missionId": "m1"}))
            self.assertTrue(out["ok"])
            led = mc.load_ledger("m1")
            self.assertNotIn("worktreeWorkspaceId", led)

    def test_worktree_remove_never_blind(self):
        with TempState():
            mc.save_ledger({"missionId": "m1", "status": "dispatched"})
            out = json.loads(PKG.handle_mission_worktree_remove({"missionId": "m1"}))
            self.assertEqual(out["error"], "WORKTREE_NOT_RECORDED")


class TestOperatorChannelGate(unittest.TestCase):
    """SUPERVISOR-VERIFY-01 — dispatch persiste operatorChannel; close prova no canal real.
    Canal morto -> reabre (interrupted + nudge + operator_channel_red); canal vivo -> fecha;
    sem canal -> closeWarning no ledger."""

    def test_dispatch_persists_operator_channel(self):
        with TempState() as ts:
            prompt = ts.prompt_file()
            script = TestMcpPromptRecipe._tab_script(self, str(Path(prompt).parent), "mc1")
            with mock.patch.object(mc, "run_herdr", fake_herdr(script)), \
                 mock.patch.object(mc, "wait_output", return_value=(READY, None)), \
                 mock.patch.object(mc, "deliver_prompt", return_value=(True, None)):
                out = json.loads(PKG.handle_mission_dispatch({
                    "missionId": "mc1", "promptFile": prompt,
                    "operatorChannel": {"url": "http://x/y", "expect_status": 200}}))
            self.assertTrue(out["ok"])
            led = mc.load_ledger("mc1")
            self.assertEqual(led["operatorChannel"],
                             {"url": "http://x/y", "expect_status": 200})

    def test_dispatch_accepts_string_channel(self):
        with TempState() as ts:
            prompt = ts.prompt_file()
            script = TestMcpPromptRecipe._tab_script(self, str(Path(prompt).parent), "mc2")
            with mock.patch.object(mc, "run_herdr", fake_herdr(script)), \
                 mock.patch.object(mc, "wait_output", return_value=(READY, None)), \
                 mock.patch.object(mc, "deliver_prompt", return_value=(True, None)):
                out = json.loads(PKG.handle_mission_dispatch({
                    "missionId": "mc2", "promptFile": prompt,
                    "operatorChannel": "http://x/only-url"}))
            self.assertTrue(out["ok"])
            led = mc.load_ledger("mc2")
            self.assertEqual(led["operatorChannel"], {"url": "http://x/only-url"})

    def test_close_dead_channel_reopens(self):
        with TempState():
            mc.save_ledger({"missionId": "m2", "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched", "operatorChannel": "http://dead.example/"})
            calls, track = track_calls()
            with mock.patch.object(mc, "run_herdr", track), \
                 mock.patch.object(mc.time, "sleep"), \
                 mock.patch.object(mc, "pane_exists", return_value=False), \
                 mock.patch.object(PKG.vg, "run_channel_proof",
                                   return_value=(False, {"url": "http://dead.example/",
                                                         "status": 0, "error": "canal morto"})), \
                 mock.patch.object(PKG.vg, "emit_bus_event") as bus:
                out = json.loads(PKG.handle_mission_close({"missionId": "m2"}))
            self.assertFalse(out["ok"])
            self.assertTrue(out.get("reopenedByOperatorChannel"))
            led = mc.load_ledger("m2")
            self.assertEqual(led["status"], "interrupted")
            bus.assert_any_call("operator_channel_red", "m2", mock.ANY)

    def test_close_alive_channel_proceeds(self):
        with TempState():
            mc.save_ledger({"missionId": "m3", "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched", "operatorChannel": "http://live.example/"})
            calls, track = track_calls()
            with mock.patch.object(mc, "run_herdr", track), \
                 mock.patch.object(mc.time, "sleep"), \
                 mock.patch.object(PKG.vg, "run_channel_proof",
                                   return_value=(True, {"url": "http://live.example/",
                                                        "status": 200, "error": ""})):
                out = json.loads(PKG.handle_mission_close({"missionId": "m3"}))
            self.assertTrue(out["ok"])
            self.assertNotIn("reopenedByOperatorChannel", out)
            steps = [s["step"] for s in out["steps"]]
            self.assertIn("operator_channel_proof", steps)
            led = mc.load_ledger("m3")
            self.assertEqual(led["status"], "closed")

    def test_close_without_channel_sets_close_warning(self):
        with TempState():
            mc.save_ledger({"missionId": "m4", "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched"})
            calls, track = track_calls()
            with mock.patch.object(mc, "run_herdr", track), \
                 mock.patch.object(mc.time, "sleep"):
                out = json.loads(PKG.handle_mission_close({"missionId": "m4"}))
            self.assertTrue(out["ok"])
            led = mc.load_ledger("m4")
            self.assertEqual(led["status"], "closed")
            self.assertIn("SEM operator_channel", led.get("closeWarning", ""))

    def test_mission_verify_rejects_invalid_id(self):
        out = json.loads(PKG.handle_mission_verify({}))
        self.assertEqual(out["error"], "INVALID_MISSION_ID")

    def test_mission_verify_structured_output(self):
        # design engmcp-tools-fix-02 (vinculante): id inexistente -> MISSION_NOT_FOUND,
        # NUNCA bateria inferida silenciosa (não inventa estado/veredito)
        out = json.loads(PKG.handle_mission_verify(
            {"missionId": "mv-struct-%d" % int(__import__("time").time())}))
        self.assertEqual(out["error"], "MISSION_NOT_FOUND")


class TestDispatchTemplateAntiStopAsk(unittest.TestCase):
    """WATCHDOG-02: cláusula anti-stop-and-ask no template de dispatch."""

    def test_template_contains_anti_stopask_clauses(self):
        t = mc.dispatch_prompt("/x/missao.md")
        self.assertIn("leia /x/missao.md e execute", t)
        self.assertIn("perguntas de ESCOPO TÉCNICO", t)
        self.assertIn("decida e siga o contrato", t)
        self.assertIn("SOMENTE para", t)
        self.assertIn("consequência externa, credencial ou orçamento", t)
        self.assertIn("releia por cat /x/missao.md", t)
        self.assertIn("nunca peça colagem", t)

    def test_template_rejects_colagem_request(self):
        # a cláusula proíbe explicitamente pedir colagem de conteúdo
        self.assertNotIn("cole o contrato", mc.dispatch_prompt("/x/p.md"))
        self.assertIn("nunca peça colagem", mc.dispatch_prompt("/x/p.md"))

    def test_template_empty_promptfile(self):
        t = mc.dispatch_prompt("")
        self.assertIn("nunca peça colagem", t)  # cláusula sobrevive mesmo sem arquivo
        self.assertIn("leia  e execute", t)

    def test_template_contains_typed_verify_format(self):
        # HERDR-VERIFY-TEMPLATE-01: template obriga verify.json no formato tipado
        t = mc.dispatch_prompt("/x/missao.md")
        self.assertIn("/opt/deliver-verify/verify.py", t)
        self.assertIn("mission_verify", t)
        self.assertIn("verdict pass", t)
        self.assertIn('campo "mission" EXATAMENTE igual', t)
        self.assertIn('"run"', t)
        self.assertIn('"expect_exit"', t)
        self.assertIn('"file": [{"path"', t)
        self.assertIn('NÃO usar "cmds"/"files"', t)
        self.assertIn('campo "cmd"', t)

    def test_all_dispatch_sites_use_template(self):
        # nenhuma entrega de prompt fora do template canônico (se deriva, alguém
        # voltou a montar o prompt à mão — reintroduzindo o stop-and-ask)
        import pathlib
        here = pathlib.Path(__file__).parent
        for fname in ("__init__.py", "recipes.py"):
            src = (here / fname).read_text(encoding="utf-8")
            self.assertNotRegex(
                src, r"leia \{",
                f"{fname} monta prompt de dispatch fora do template (use mc.dispatch_prompt)")


# ================================================================ DISPATCH-FAST-02
# config dourada + ready-dance + ready-regex estendido + métrica despacho→working

class TestReadyRegexExtended(unittest.TestCase):
    def test_welcome_theme_screen_is_ready(self):
        # contrato item 3 (ajustado pela prova P2 real 27/09): a tela de welcome/theme
        # é um DIÁLOGO de dance (Enter), não ready — tratá-la como ready entregava o
        # prompt na tela errada e o perdia. Banner auto-mode e bypass continuam ready.
        self.assertFalse(re.search(mc.ready_regex(), "Syntax theme   Dark"))
        self.assertTrue(re.search(mc.ready_regex(), "bypass permissions on"))
        self.assertTrue(re.search(mc.ready_regex(), "auto-accept mode"))

    def test_legacy_markers_kept(self):
        for marker in ("? for shortcuts", "Tips for getting started"):
            self.assertTrue(re.search(mc.ready_regex(), marker))


class TestReadyDance(unittest.TestCase):
    def test_api_key_dialog_maps_enter(self):
        self.assertEqual(mc.ready_dance_keys("Do you want to use this API key?"), "enter")

    def test_trust_folder_maps_down_enter(self):
        # menu "❯ No, exit / Yes, I trust this folder" -> Down seleciona Yes
        self.assertEqual(mc.ready_dance_keys("❯ No, exit\nYes, I trust this folder"),
                         "down enter")

    def test_auto_mode_banner_maps_enter(self):
        self.assertEqual(mc.ready_dance_keys("Auto-accept mode enabled"), "enter")

    def test_welcome_theme_maps_enter(self):
        self.assertEqual(mc.ready_dance_keys("Syntax theme"), "enter")

    def test_no_dialog_returns_none(self):
        self.assertIsNone(mc.ready_dance_keys(READY))
        self.assertIsNone(mc.ready_dance_keys(""))

    def test_dispatch_dances_dialog_and_reaches_ready(self):
        # P3 (fallback): config dourada falha -> diálogo aparece -> dance navega ->
        # working, sem relançar claude.
        with TempState() as ts:
            prompt = ts.prompt_file()
            cwd = str(Path(prompt).parent)
            ts.claude_session("sess-1", cwd=cwd)
            script = {
                f"tab create --cwd {cwd} --no-focus": tab_ok("t1", "w1:pZ"),
                "tab rename t1 MISSION:m1": "",
                "pane rename w1:pZ titulo": "",
                f"pane run w1:pZ env ANTHROPIC_BASE_URL=http://127.0.0.1:8102 ANTHROPIC_AUTH_TOKEN=dummy ANTHROPIC_API_KEY=dummy CLAUDE_CONFIG_DIR={cwd}/.claude-config claude": "",
                f"pane run w1:pZ {mc.dispatch_prompt(prompt)}": "",
                "pane send-keys w1:pZ enter": "",
            }
            dialog = "Do you want to use this API key?"
            with mock.patch.object(mc, "run_herdr", fake_herdr(script)), \
                 mock.patch.object(mc, "wait_output",
                                   side_effect=[(dialog, None), (READY, None)]), \
                 mock.patch.object(mc, "read_output",
                                   return_value=(dialog, None)), \
                 mock.patch.object(mc, "send_keys", return_value=None), \
                 mock.patch.object(mc, "deliver_prompt", return_value=(True, None)):
                res = json.loads(PKG.handle_mission_dispatch(
                    {"missionId": "m1", "promptFile": prompt}))
            self.assertTrue(res["ok"])
            events = (ts.state / "events.jsonl").read_text()
            self.assertIn("ready_dance", events)
            self.assertIn("prompt_sent", events)

    def test_dispatch_dance_exhausts_to_timeout(self):
        # dance limitado a 3 rodadas: diálogo que nunca sai -> CLAUDE_START_TIMEOUT
        # determinístico, sem loop infinito e sem relançar claude.
        with TempState() as ts:
            prompt = ts.prompt_file()
            cwd = str(Path(prompt).parent)
            script = {
                f"tab create --cwd {cwd} --no-focus": tab_ok("t1", "w1:pZ"),
                "tab rename t1 MISSION:m1": "",
                "pane rename w1:pZ titulo": "",
                f"pane run w1:pZ env ANTHROPIC_BASE_URL=http://127.0.0.1:8102 ANTHROPIC_AUTH_TOKEN=dummy ANTHROPIC_API_KEY=dummy CLAUDE_CONFIG_DIR={cwd}/.claude-config claude": "",
                "pane send-keys w1:pZ enter": "",
            }
            dialog = "Syntax theme"
            with mock.patch.object(mc, "run_herdr", fake_herdr(script)), \
                 mock.patch.object(mc, "wait_output", return_value=(dialog, None)), \
                 mock.patch.object(mc, "read_output", return_value=(dialog, None)), \
                 mock.patch.object(mc, "send_keys", return_value=None):
                res = json.loads(PKG.handle_mission_dispatch(
                    {"missionId": "m1", "promptFile": prompt}))
            self.assertFalse(res["ok"])
            self.assertEqual(res["error"], "CLAUDE_START_TIMEOUT")


class TestGoldenConfig(unittest.TestCase):
    def test_copy_creates_target_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "golden"
            src.mkdir()
            (src / "config.json").write_text("{}", encoding="utf-8")
            cwd = Path(tmp) / "mission-cwd"
            cwd.mkdir()
            with mock.patch.object(mc, "GOLDEN_CONFIG_DIR", str(src)):
                self.assertIsNone(mc.golden_config_copy(str(cwd)))
                self.assertTrue((cwd / ".claude-config" / "config.json").is_file())
                self.assertIsNone(mc.golden_config_copy(str(cwd)))  # idempotente

    def test_copy_failure_fails_open(self):
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.object(mc, "GOLDEN_CONFIG_DIR",
                                   str(Path(tmp) / "inexistente")):
                err = mc.golden_config_copy(str(Path(tmp) / "cwd"))
            self.assertIsInstance(err, str)
            self.assertIn("fail-open", err)

    def test_tab_create_copies_golden_config(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "golden"
            src.mkdir()
            (src / "config.json").write_text("{}", encoding="utf-8")
            cwd = Path(tmp) / "cwd"
            cwd.mkdir()
            with mock.patch.object(mc, "GOLDEN_CONFIG_DIR", str(src)), \
                 mock.patch.object(mc, "run_herdr",
                                   return_value={"ok": True, "data": tab_ok()}):
                tab_id, _pane, err = mc.tab_create(str(cwd))
            self.assertIsNone(err)
            self.assertEqual(tab_id, "t1")
            self.assertTrue((cwd / ".claude-config" / "config.json").is_file())


class TestDispatchMetric(unittest.TestCase):
    def test_fast_badge_under_90s(self):
        led = {"dispatchedAt": "2026-09-27T00:00:00Z",
               "workingAt": "2026-09-27T00:01:05Z"}
        m = mc.dispatch_metric(led)
        self.assertEqual(m["badge"], "dispatch_fast")
        self.assertEqual(m["dispatchToWorkingMs"], 65_000)

    def test_slow_badge_over_90s(self):
        led = {"dispatchedAt": "2026-09-27T00:00:00Z",
               "workingAt": "2026-09-27T00:02:00Z"}
        self.assertEqual(mc.dispatch_metric(led)["badge"], "dispatch_slow")

    def test_exact_90s_is_finding_not_fast(self):
        led = {"dispatchedAt": "2026-09-27T00:00:00Z",
               "workingAt": "2026-09-27T00:01:30Z"}
        self.assertEqual(mc.dispatch_metric(led)["badge"], "dispatch_slow")

    def test_no_working_at_no_metric(self):
        self.assertIsNone(mc.dispatch_metric({"dispatchedAt": "x"}))

    def test_bad_base_time_no_metric(self):
        led = {"dispatchedAt": "não-é-data", "workingAt": "2026-09-27T00:01:00Z"}
        self.assertIsNone(mc.dispatch_metric(led))

    def test_watch_first_working_marks_working_at(self):
        # P4: 1º liveness=working grava workingAt + badge dispatch_fast no ledger
        # e evento mission_working.
        with TempState() as ts:
            prompt = ts.prompt_file()
            mc.save_ledger({"missionId": "m1", "status": "dispatched", "paneId": "w1:pZ",
                            "promptFile": prompt, "cwd": str(Path(prompt).parent),
                            "dispatchedAt": mc._now()})
            script = {"pane list": panes_ok([pane_entry("w1:pZ")]),
                      "pane read w1:pZ --source recent-unwrapped --lines 40":
                          out_result("esc to interrupt — trabalhando"),
                      "pane process-info --pane w1:pZ": procinfo("claude")}
            with mock.patch.object(mc, "run_herdr", fake_herdr(script)):
                res = json.loads(PKG.handle_mission_watch(
                    {"missionId": "m1", "snapshot": "true"}))
            self.assertEqual(res["liveness"], "working")
            led = mc.load_ledger("m1")
            self.assertIn("workingAt", led)
            self.assertEqual(led["badge"], "dispatch_fast")
            events = (Path(mc.STATE_DIR) / "events.jsonl").read_text()
            self.assertIn("mission_working", events)

    def test_watch_working_over_90s_plants_finding(self):
        # P4: sleep plantado — working depois de >90s vira FINDING (dispatch_slow).
        with TempState() as ts:
            prompt = ts.prompt_file()
            mc.save_ledger({"missionId": "m1", "status": "dispatched", "paneId": "w1:pZ",
                            "promptFile": prompt, "cwd": str(Path(prompt).parent),
                            "dispatchedAt": "2026-09-27T00:00:00Z"})
            script = {"pane list": panes_ok([pane_entry("w1:pZ")]),
                      "pane read w1:pZ --source recent-unwrapped --lines 40":
                          out_result("esc to interrupt"),
                      "pane process-info --pane w1:pZ": procinfo("claude")}
            with mock.patch.object(mc, "_now", return_value="2026-09-27T00:05:00Z"), \
                 mock.patch.object(mc, "run_herdr", fake_herdr(script)):
                json.loads(PKG.handle_mission_watch(
                    {"missionId": "m1", "snapshot": "true"}))
            events = (Path(mc.STATE_DIR) / "events.jsonl").read_text()
            self.assertIn("FINDING", events)
            self.assertIn("dispatch_slow", events)


class TestConsequenceGuard(unittest.TestCase):
    """CLOSE-VERIFY-GUARD-01 — guarda de consequência no mission_close.
    Declarada (dispatch/prompt) sem verify.json -> reabre com verify_required (b);
    só heurística -> fecha com closed_unverified_consequence + warning (a);
    verify.json VERDE -> badge verified_e2e normal; missão comum -> close inalterado."""

    def _close(self, args, verify_proc=None):
        calls, track = track_calls()
        patches = [mock.patch.object(mc, "run_herdr", track),
                   mock.patch.object(mc.time, "sleep"),
                   mock.patch.object(mc, "pane_exists", return_value=False),
                   mock.patch.object(PKG.nf, "mission_completed",
                                     return_value={"ok": True, "emitted": True}),
                   mock.patch.object(PKG.nf, "mission_reopened",
                                     return_value={"ok": True, "emitted": True})]
        if verify_proc is not None:
            patches.append(mock.patch.object(PKG.subprocess, "run", return_value=verify_proc))
        with mock.patch.object(PKG.vg, "emit_bus_event") as bus:
            for p in patches:
                p.start()
            try:
                out = json.loads(PKG.handle_mission_close(args))
                return (out, bus, PKG.nf.mission_completed.call_args,
                        PKG.nf.mission_reopened.call_count)
            finally:
                for p in reversed(patches):
                    p.stop()

    def test_detection_patterns_and_declaration(self):
        d = mc.detect_consequence("reinicie gpu-bridge.service com systemctl restart; /opt/x")
        self.assertTrue(d["consequence"])
        self.assertEqual(d["source"], "heuristic")
        for w in ("systemctl", ".service", "restart", "/opt/"):
            self.assertIn(w, d["matches"])
        self.assertTrue(mc.detect_consequence("deploy em Produção")["consequence"])
        self.assertFalse(mc.detect_consequence("# missão de teste\nunit tests")["consequence"])
        # declaração explícita vence a heurística (nos dois sentidos)
        off = mc.detect_consequence("- **consequence**: false\nsystemctl restart x")
        self.assertEqual((off["consequence"], off["source"]), (False, "prompt"))
        on = mc.detect_consequence("consequence: true\nsó docs")
        self.assertEqual((on["consequence"], on["source"]), (True, "prompt"))
        # flag do dispatch vence o prompt
        self.assertEqual(mc.resolve_consequence("false", None)["source"], "dispatch")

    def test_dispatch_records_consequence_on_ledger(self):
        with TempState() as ts:
            prompt = ts.prompt_file()
            Path(prompt).write_text("# infra\nsystemctl restart gpu-bridge.service\n",
                                    encoding="utf-8")
            script = TestMcpPromptRecipe._tab_script(self, str(Path(prompt).parent), "cq1")
            with mock.patch.object(mc, "run_herdr", fake_herdr(script)), \
                 mock.patch.object(mc, "wait_output", return_value=(READY, None)), \
                 mock.patch.object(mc, "deliver_prompt", return_value=(True, None)):
                out = json.loads(PKG.handle_mission_dispatch(
                    {"missionId": "cq1", "promptFile": prompt}))
            self.assertTrue(out["ok"])
            led = mc.load_ledger("cq1")
            self.assertTrue(led["consequence"])
            self.assertEqual(led["consequenceSource"], "heuristic")
            self.assertIn("systemctl", led["consequenceMatches"])

    def test_close_declared_consequence_without_verify_reopens(self):
        # (a) do contrato: consequence=true sem verify.json -> NÃO fecha
        with TempState() as ts:
            cwd = Path(ts.tmp) / "cq-cwd"
            cwd.mkdir()
            mc.save_ledger({"missionId": "cq2", "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched", "cwd": str(cwd),
                            "consequence": True, "consequenceSource": "dispatch"})
            out, bus, _completed, reopened = self._close({"missionId": "cq2"})
            self.assertFalse(out["ok"])
            self.assertTrue(out.get("reopenedByVerifyRequired"))
            led = mc.load_ledger("cq2")
            self.assertEqual(led["status"], "interrupted")
            self.assertNotIn("closedAt", led)
            bus.assert_any_call("verify_required", "cq2", mock.ANY)
            self.assertEqual(reopened, 1)
            self.assertEqual(mc.last_event("cq2")["event"], "verify_required")
            self.assertNotIn("tab_close", [s["step"] for s in out["steps"]])

    def test_close_declared_consequence_override_closes_with_warning(self):
        with TempState() as ts:
            cwd = Path(ts.tmp) / "cq-cwd"
            cwd.mkdir()
            mc.save_ledger({"missionId": "cq3", "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched", "cwd": str(cwd),
                            "consequence": True, "consequenceSource": "prompt"})
            out, bus, completed, _r = self._close(
                {"missionId": "cq3", "acceptUnverified": "supervisor verificou na mão"})
            self.assertTrue(out["ok"])
            self.assertIn("acceptUnverified", out["warnings"][0])
            led = mc.load_ledger("cq3")
            self.assertEqual(led["status"], "closed")
            self.assertIn("SEM VERIFICAÇÃO", led["consequenceWarning"])
            bus.assert_any_call("closed_unverified_consequence", "cq3", mock.ANY)
            self.assertEqual(completed.kwargs["verdict"], "unverified_consequence")

    def test_close_heuristic_consequence_closes_with_event(self):
        with TempState() as ts:
            prompt = ts.prompt_file()
            Path(prompt).write_text("alterar hermes-health-sentinel.service em produção\n",
                                    encoding="utf-8")
            # ledger legado (sem campo consequence): heurística recalculada no close
            mc.save_ledger({"missionId": "cq4", "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched", "promptFile": prompt,
                            "cwd": str(Path(prompt).parent)})
            out, bus, completed, reopened = self._close({"missionId": "cq4"})
            self.assertTrue(out["ok"])
            self.assertEqual(reopened, 0)
            self.assertEqual(mc.load_ledger("cq4")["status"], "closed")
            g = [s for s in out["steps"] if s["step"] == "consequence_guard"][0]
            self.assertEqual(g["verdict"], "closed_unverified_consequence")
            self.assertEqual(g["source"], "heuristic")
            self.assertTrue(out["warnings"])
            bus.assert_any_call("closed_unverified_consequence", "cq4", mock.ANY)
            evs = (Path(mc.STATE_DIR) / "events.jsonl").read_text()
            self.assertIn("closed_unverified_consequence", evs)
            self.assertEqual(completed.kwargs["verdict"], "unverified_consequence")

    def test_close_consequence_with_green_verify_gets_badge(self):
        # (b) do contrato: consequence=true + verify.json VERDE -> badge verified_e2e normal
        mid = "cq5-test-%d" % os.getpid()
        report = "/root/.hermes/mission-state/%s.verify.json" % mid
        try:
            with TempState() as ts:
                cwd = Path(ts.tmp) / "cq-cwd"
                cwd.mkdir()
                (cwd / "verify.json").write_text("{}", encoding="utf-8")
                mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                                "status": "dispatched", "cwd": str(cwd),
                                "consequence": True, "consequenceSource": "dispatch"})
                green = mock.Mock(returncode=0, stdout=json.dumps(
                    {"verdict": "pass", "checks": [{"id": "svc", "ok": True}]}).encode())
                out, bus, completed, reopened = self._close({"missionId": mid},
                                                            verify_proc=green)
                self.assertTrue(out["ok"])
                # SUP-OBEY-01: warning typed do guard de fecho (cwd sem RELATORIO-<id>.md)
                self.assertEqual([w.get("code") for w in out.get("warnings", [])
                                  if isinstance(w, dict)],
                                 # ORCH-SPEND-LEDGER-01: fail-open do custo (transporte
                                 # desligado na suíte) é warning honesto do close.
                                 # GUARD-SUPERVISOR-READONLY-01 (RELATÓRIO-INTEGRA): sem
                                 # colagem registrada, o warning tipado é esperado.
                                 ["mission_cost_unmeasured", "relatorio_nao_entregado_chat",
                                  "relatorio_integra_missing"])
                steps = [s["step"] for s in out["steps"]]
                self.assertIn("deliver_verify", steps)
                self.assertNotIn("consequence_guard", steps)
                led = mc.load_ledger(mid)
                self.assertEqual(led["status"], "closed")
                self.assertEqual(led["verified_e2e"]["verdict"], "pass")
                self.assertEqual(completed.kwargs["badge"], "verified_e2e")
                self.assertEqual(reopened, 0)
                for c in bus.call_args_list:
                    self.assertNotIn(c.args[0], ("verify_required",
                                                 "closed_unverified_consequence"))
        finally:
            if os.path.exists(report):
                os.remove(report)

    def test_close_common_mission_without_verify_unchanged(self):
        # (c) do contrato: missão comum sem verify.json -> close normal, sem guarda
        with TempState() as ts:
            prompt = ts.prompt_file()  # "# missão de teste" — nenhum padrão
            mc.save_ledger({"missionId": "cq6", "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched", "promptFile": prompt,
                            "cwd": str(Path(prompt).parent)})
            out, bus, completed, reopened = self._close({"missionId": "cq6"})
            self.assertTrue(out["ok"])
            # SUP-OBEY-01: warning typed do guard de fecho (cwd sem RELATORIO-<id>.md)
            self.assertEqual([w.get("code") for w in out.get("warnings", [])
                              if isinstance(w, dict)],
                             # ORCH-SPEND-LEDGER-01: fail-open do custo (transporte
                             # desligado na suíte) é warning honesto do close.
                             # GUARD-SUPERVISOR-READONLY-01 (RELATÓRIO-INTEGRA): warning
                             # tipado esperado enquanto a colagem não é registrada.
                             ["mission_cost_unmeasured", "relatorio_nao_entregado_chat",
                              "relatorio_integra_missing"])
            self.assertNotIn("consequence_guard", [s["step"] for s in out["steps"]])
            led = mc.load_ledger("cq6")
            self.assertEqual(led["status"], "closed")
            self.assertNotIn("consequenceWarning", led)
            self.assertEqual(completed.kwargs["verdict"], "no_verify_manifest")
            self.assertEqual(reopened, 0)
            bus.assert_not_called()
            self.assertEqual(mc.last_event("cq6")["event"], "mission_closed")

class TestGpuDownFix01(unittest.TestCase):
    """GPU-DOWN-FIX-01: mission_close(model-swap-01) → gpu_down estourou
    `TypeError: unsupported operand type(s) for -: 'float' and 'str'` no garfo
    anti-thrash (ledger grava updatedAt ISO str; `now - ts`). Fix = coerção
    epoch()/num() em gpu-down.sh. O script roda em CÓPIA sandbox: vastai fake,
    todos os caminhos reais trocados por tmp, sleep/pkill neutralizados —
    NUNCA toca no state.json real, no mission-state real nem no vast.ai."""

    FIXED = Path("/opt/gpu-orchestrator/gpu-down.sh")
    PREFIX = Path("/opt/gpu-orchestrator/gpu-down.sh.bak-20260927-gpu-down-fix")
    CID = 52953260

    def setUp(self):
        # FLAKY-SANDBOX-FIX-01: sandbox via vast_sandbox.OrchSandbox — copia lib-vastai.sh +
        # ports.env (o gpu-down.sh pós gpu-orch-pin-01 dá source neles), VASTAI_TARGETS/
        # VASTAI_BIN → fake, pkill/ssh neutralizados. Antes: lib ausente no tmp → exit 5
        # determinístico; lib copiada crua → resolveria o vastai REAL do guardian-compute.
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.tmp = Path(self._tmp.name)
        self.sb = vast_sandbox.OrchSandbox(self.tmp)
        self.calls = self.sb.calls

    def _script(self, src: Path) -> Path:
        if not src.exists():
            self.skipTest("%s ausente" % src)
        return self.sb.script(src)  # assert estático: nenhum caminho/vastai real sobrou

    def _state(self, **over) -> None:
        # tipos REAIS mistos: dph_usd/cost_usd/to como string, sem ssh/pids
        s = {"instance_id": str(self.CID), "model": "Qwen/Qwen2.5-Coder-32B",
             "dph_usd": "0.3747", "status": "up", "startedAt": 1790521642,
             "tunnel_pid": None, "proxy_pid": None,
             "cost_ledger": [{"instance_id": self.CID, "from": 1790521642, "to": "1790522000",
                              "dph_usd": "0.3747", "cost_usd": "0.0374",
                              "kind": "populate_interim"}]}
        s.update(over)
        (self.tmp / "orch" / "state.json").write_text(json.dumps(s))

    def _ledger(self, name: str, **over) -> None:
        l = {"missionId": name, "engine": "gpu", "status": "closed",
             "updatedAt": "2026-09-27T14:40:16Z", "closedAt": "2026-09-27T14:40:16Z"}
        l.update(over)
        (self.tmp / "mission-state" / (name + ".json")).write_text(json.dumps(l))

    def _run(self, src: Path, **env) -> "subprocess.CompletedProcess":
        return self.sb.run(self._script(src), GPU_SKIP_MISSION="model-swap-01", **env)

    def _st(self) -> dict:
        return json.loads((self.tmp / "orch" / "state.json").read_text())

    # ---------- VERMELHO: o script pré-fix reproduz o bug do fechamento ----------
    def test_red_prefix_garfo_float_minus_str(self):
        self._state()
        self._ledger("model-swap-01")      # a própria (pulada)
        self._ledger("gpu-volume-02")      # outra gpu com updatedAt ISO str
        out = self._run(self.PREFIX)
        self.assertIn("TypeError: unsupported operand type(s) for -: 'float' and 'str'",
                      out.stderr)

    def test_red_prefix_final_cost_str_in_ledger(self):
        self._state()
        out = self._run(self.PREFIX)
        self.assertIn("TypeError: unsupported operand type(s) for +: 'int' and 'str'",
                      out.stderr)
        self.assertEqual(self._st()["status"], "up")  # custo final nunca gravado

    # ---------- VERDE ----------
    def test_green_full_path_mixed_types(self):
        self._state()
        self._ledger("model-swap-01")
        self._ledger("gpu-volume-02")  # antiga (>10min) → não segura o garfo
        (self.tmp / "mission-state" / "lista.json").write_text("[1, 2]")  # .json não-ledger
        out = self._run(self.FIXED)
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)
        self.assertNotIn("Traceback", out.stderr)
        self.assertIn("DESTRUÍDA", out.stdout)
        st = self._st()
        self.assertEqual(st["status"], "down")
        fin = st["cost_ledger"][-1]
        self.assertEqual(fin["kind"], "final")
        self.assertEqual(fin["from"], 1790522000)  # 'to' string coagido
        self.assertAlmostEqual(fin["dph_usd"], 0.3747)
        self.assertAlmostEqual(st["final_cost_usd"],
                               round(0.0374 + fin["cost_usd"], 4), places=4)
        self.assertIn("destroy instance %d" % self.CID, self.calls.read_text())
        self.assertIn('"gpu_down"', (self.tmp / "audit.jsonl").read_text())

    def test_green_missing_and_none_fields(self):
        self._state(dph_usd=None, startedAt=None,
                    cost_ledger=[{"to": None}, {"cost_usd": None}, {"cost_usd": "lixo"}, {}])
        out = self._run(self.FIXED)
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)
        self.assertNotIn("Traceback", out.stderr)
        st = self._st()
        self.assertEqual(st["status"], "down")
        self.assertEqual(st["final_cost_usd"], 0)

    def test_green_garfo_defers_on_recent_iso_updatedat(self):
        # pré-fix: TypeError → heredoc exit 1 → garfo falhava ABERTO → destruía
        recent = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - 60))
        self._state()
        self._ledger("outra-gpu-01", updatedAt=recent, closedAt=recent)
        out = self._run(self.FIXED)
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertIn("GARFO", out.stdout)
        self.assertEqual(self.calls.read_text(), "")  # zero chamada ao vast
        self.assertEqual(self._st()["status"], "up")

    def test_green_garfo_skips_own_recent_mission(self):
        recent = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - 60))
        self._state()
        self._ledger("model-swap-01", updatedAt=recent)
        out = self._run(self.FIXED)
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertNotIn("GARFO", out.stdout)
        self.assertEqual(self._st()["status"], "down")

    def test_green_destroy_unverified_exit4_ledgers_extra(self):
        self._state()
        out = self._run(self.FIXED, GPU_FAKE_VAST_ROWS='[{"id": %d}]' % self.CID)
        self.assertEqual(out.returncode, 4, out.stdout + out.stderr)
        self.assertNotIn("Traceback", out.stderr)
        self.assertIn("AINDA VIVA", out.stdout)
        st = self._st()
        self.assertTrue(st["destroy_unverified"])
        extra = [e for e in st["cost_ledger"] if e["kind"] == "extra_unverified"]
        self.assertEqual(len(extra), 1)
        self.assertAlmostEqual(extra[0]["dph_usd"], 0.3747)
        self.assertIn("gpu_destroy_unverified", (self.tmp / "spool" / "spool.jsonl").read_text())

    def test_gpu_down_detail_separates_verdict_from_stderr(self):
        # pré-fix: stdout+stderr concatenados → "detail" virava a linha do traceback
        class P:
            stdout = b"a\n[gpu-down] ERRO: instancia AINDA VIVA\n"
            stderr = b"Traceback...\nTypeError: x\n"
        self.assertEqual(PKG._gpu_down_detail(P()),
                         ("[gpu-down] ERRO: instancia AINDA VIVA", "TypeError: x"))
        self.assertEqual(PKG._gpu_down_detail(None), ("", ""))

    def test_mission_close_gpu_down_step_uses_stdout_verdict(self):
        src = Path(PKG.__file__).read_text()
        self.assertIn("last, err_tail = _gpu_down_detail(proc)", src)
        self.assertNotIn('(proc.stderr or b"")[-200:]).decode', src)



class TestVastSandboxGuard(unittest.TestCase):
    """FLAKY-SANDBOX-FIX-01: nenhum teste da suíte emite vastai que NÃO seja o fake.
    Nenhum destes testes executa o binário real — o guard recusa ANTES do exec."""

    REAL = "/opt/guardian-compute/venv/bin/vastai"

    def test_popen_real_vastai_absolute_refused(self):
        import subprocess
        with self.assertRaisesRegex(vast_sandbox.RealVastaiError, "teste tentou vastai real"):
            subprocess.run([self.REAL, "show", "user", "--raw"], capture_output=True)

    def test_bare_vastai_resolves_tripwire_never_real(self):
        import shutil
        w = shutil.which("vastai")
        self.assertIsNotNone(w)
        self.assertEqual(Path(w).parent, Path(os.environ["VASTAI_BIN"]).parent)
        self.assertNotIn(os.path.realpath(w), {os.path.realpath(p) for p in
                                               vast_sandbox.real_vastai_paths()
                                               if os.path.exists(p)})
        self.assertIn("vast-tripwire-", os.environ["VASTAI_BIN"])

    def test_env_vastai_bin_real_refused(self):
        import subprocess
        with self.assertRaisesRegex(vast_sandbox.RealVastaiError, "VASTAI_BIN"):
            subprocess.run(["true"], env={**os.environ, "VASTAI_BIN": self.REAL})

    def test_shell_string_real_vastai_refused(self):
        import subprocess
        with self.assertRaisesRegex(vast_sandbox.RealVastaiError, "teste tentou vastai real"):
            subprocess.run("%s show instances" % self.REAL, shell=True)

    def test_bash_script_citing_real_vastai_refused(self):
        import subprocess
        with tempfile.TemporaryDirectory() as d:
            scr = Path(d) / "x.sh"
            scr.write_text("VAST=%s\n\"$VAST\" destroy instance 1\n" % self.REAL)
            with self.assertRaisesRegex(vast_sandbox.RealVastaiError, "cita"):
                subprocess.run(["bash", str(scr)])

    def test_seal_refuses_unneutralized_script(self):
        with tempfile.TemporaryDirectory() as d:
            sb = vast_sandbox.OrchSandbox(Path(d))
            for bad in ("pkill -f x\n", "echo /opt/gpu-orchestrator/state.json\n",
                        "V=%s\n" % self.REAL):
                with self.assertRaises(AssertionError):
                    sb.assert_sealed(bad)

    def test_sandbox_lib_resolves_fake_even_with_hostile_invoker_env(self):
        # invocador exporta VASTAI_BIN real + PATH com o venv real: o sandbox ignora os dois
        import subprocess
        with tempfile.TemporaryDirectory() as d:
            sb = vast_sandbox.OrchSandbox(Path(d))
            lib = Path(d) / "orch" / "lib-vastai.sh"
            if not lib.exists():
                self.skipTest("lib-vastai.sh ausente")
            hostile = {"VASTAI_BIN": self.REAL,
                       "PATH": os.path.dirname(self.REAL) + os.pathsep + os.environ["PATH"]}
            with mock.patch.dict(os.environ, hostile):
                e = sb.env()
            self.assertEqual(e["VASTAI_BIN"], str(sb.fake))
            # mesmo sem VASTAI_BIN, VASTAI_TARGETS do lib sandboxado = fake
            out = subprocess.run(["bash", "-c", '. "$1"; unset VASTAI_BIN; resolve_vastai '
                                  '&& echo "$VAST"', "_", str(lib)],
                                 env=e, capture_output=True, text=True, timeout=30)
            self.assertEqual(out.stdout.strip(), str(sb.fake), out.stderr)

    def test_every_vast_touching_test_file_is_guarded(self):
        pat = re.compile(r"vastai|gpu-down\.sh|gpu-up\.sh|gpu_down|gpu_up")
        for f in sorted(Path(PLUGIN_DIR).glob("test_*.py")):
            t = f.read_text()
            if pat.search(t):
                self.assertTrue(re.search(r"^(import vast_sandbox|from test_mission_ops import)",
                                          t, flags=re.M),
                                "%s toca vastai/gpu sem o guard vast_sandbox" % f.name)

    def test_seal_path_independent_no_false_positive_on_comment(self):
        # reprovação 28/09: PATH do supervisor com /bin → '/bin/vastai' (INEXISTENTE) casava
        # por substring no comentário '.../bin/vastai' → 7 falhas. Selo não pode depender do PATH.
        std = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin"
        with tempfile.TemporaryDirectory() as d, \
                mock.patch.object(vast_sandbox, "_ORIG_PATH", std):
            sb = vast_sandbox.OrchSandbox(Path(d))
            for src in (TestGpuDownFix01.FIXED, TestGpuDownFix01.PREFIX):
                if src.exists():
                    sb.script(src)  # não levanta
            sb.assert_sealed("# VAST antigo: /root/.hermes/tools/py/bin/vastai\n")

    def test_seal_catches_existing_vastai_on_invoker_path(self):
        # um vastai que EXISTE num dir do PATH do invocador é real: citá-lo em código falha
        with tempfile.TemporaryDirectory() as d, tempfile.TemporaryDirectory() as rd:
            real = Path(rd) / "vastai"
            real.write_text("#!/bin/sh\nexit 0\n")
            os.chmod(real, 0o755)
            with mock.patch.object(vast_sandbox, "_ORIG_PATH", rd + os.pathsep + "/bin"):
                sb = vast_sandbox.OrchSandbox(Path(d))
                with self.assertRaisesRegex(vast_sandbox.RealVastaiError, "sandbox cita"):
                    sb.assert_sealed('VAST=%s\n"$VAST" show user\n' % real)
                sb.assert_sealed("# comentário citando %s\n" % real)  # comentário não executa


class TestMissionBatch(unittest.TestCase):
    """MISSION-BATCH-01: lote sequencial determinístico, tolerante a falha,
    com anti-fantasma (ledger dispatching/failed/interrupted + pane morto)."""

    def _fake_dispatch(self, ok_ids):
        """Substituto determinístico de handle_mission_dispatch."""
        def fake(args, **kw):
            mid = args["missionId"]
            if mid in ok_ids:
                return json.dumps({"ok": True, "status": "dispatched",
                                   "paneId": f"wX:p{mid[-1]}", "tabId": "tX"})
            return json.dumps({"ok": False, "error": "PROMPT_MISSING",
                               "detail": "promptFile não existe"})
        return fake

    def _mk_items(self, n, tmp):
        items = []
        for i in range(1, n + 1):
            p = Path(tmp) / f"prompt-{i}.md"
            p.write_text(f"# lote {i}\n")
            items.append({"missionId": f"b1-m{i}", "promptFile": str(p),
                          "cwd": str(Path(tmp))})
        return items

    def test_lote_happy_path(self):
        with TempState() as ts:
            items = self._mk_items(3, ts.tmp)
            with mock.patch.object(PKG, "handle_mission_dispatch",
                                   self._fake_dispatch({"b1-m1", "b1-m2", "b1-m3"})):
                out = json.loads(PKG.handle_mission_batch({"missions": items}))
            self.assertTrue(out["ok"])
            self.assertEqual((out["total"], out["despachadas"], out["falhas"]), (3, 3, 0))
            self.assertEqual([r["result"] for r in out["itens"]], ["ok"] * 3)
            self.assertIn("tempoPorMissao", out)

    def test_lote_tolera_falha_individual(self):
        with TempState() as ts:
            items = self._mk_items(3, ts.tmp)
            with mock.patch.object(PKG, "handle_mission_dispatch",
                                   self._fake_dispatch({"b1-m1", "b1-m3"})):
                out = json.loads(PKG.handle_mission_batch({"missions": items}))
            self.assertFalse(out["ok"])
            self.assertEqual((out["despachadas"], out["falhas"]), (2, 1))
            self.assertEqual(out["itens"][1]["error"], "PROMPT_MISSING")

    def test_lote_anti_fantasma(self):
        with TempState() as ts:
            items = self._mk_items(2, ts.tmp)
            # fantasma: b1-m1 em dispatching com pane provadamente morto
            led = mc.load_ledger("b1-m1") or {"missionId": "b1-m1"}
            led.update(status="dispatching", paneId="wZ:pDead", tabId="wZ:tDead")
            mc.save_ledger(led)
            with mock.patch.object(mc, "pane_exists", return_value=False), \
                 mock.patch.object(PKG, "handle_mission_dispatch",
                                   self._fake_dispatch({"b1-m1", "b1-m2"})):
                out = json.loads(PKG.handle_mission_batch({"missions": items}))
            self.assertEqual(out["fantasmasLimpos"], 1)
            self.assertEqual(out["itens"][0]["result"], "fantasma-limpo")
            after = mc.load_ledger("b1-m1")
            # o fake não escreve ledger — o que se prova aqui: ghost cancelado com
            # previousStatus, e o re-despacho delegado ao dispatch (result fantasma-limpo)
            self.assertEqual(after["status"], "cancelled")
            self.assertEqual(after["previousStatus"], "dispatching")

    def test_lote_valida_tamanho_e_duplicado(self):
        with TempState() as ts:
            one = self._mk_items(1, ts.tmp)
            out = json.loads(PKG.handle_mission_batch({"missions": one}))
            self.assertEqual(out["error"], "BATCH_SIZE_OUT_OF_RANGE")
            two = self._mk_items(2, ts.tmp)
            two[1]["missionId"] = "b1-m1"
            out = json.loads(PKG.handle_mission_batch({"missions": two}))
            self.assertEqual(out["error"], "INVALID_MANIFEST")
            self.assertIn("repetido", out["detail"])

    def test_ready_dance_cobre_banner_billing(self):
        # F1: banner "Enter to continue · Esc to cancel" deve casar o dance
        self.assertEqual(mc.ready_dance_keys("... Enter to continue · Esc to cancel"), "enter")


def tearDownModule():
    hits = vast_sandbox.tripwire_hits()
    if hits:
        raise AssertionError("teste tentou vastai real (tripwire): %s" % hits[:300])


class TestToolsFix02Close(unittest.TestCase):
    """ENG-MCP-TOOLS-FIX-02 — lacunas A.1-A.6 no handle_mission_close:
    dryRun (plano sem mutação), expectBadge (fail-closed opt-in), keepPane,
    decisionNote/cancel com motivo, lock de corrida + idempotência, WORKER_ACTIVE."""

    def _close(self, args, verify_proc=None):
        calls, track = track_calls()
        patches = [mock.patch.object(mc, "run_herdr", track),
                   mock.patch.object(mc.time, "sleep"),
                   mock.patch.object(mc, "pane_exists", return_value=False),
                   mock.patch.object(PKG.nf, "mission_completed",
                                     return_value={"ok": True, "emitted": True}),
                   mock.patch.object(PKG.nf, "mission_reopened",
                                     return_value={"ok": True, "emitted": True})]
        if verify_proc is not None:
            patches.append(mock.patch.object(PKG.subprocess, "run", return_value=verify_proc))
        with mock.patch.object(PKG.vg, "emit_bus_event") as bus:
            for p in patches:
                p.start()
            try:
                out = json.loads(PKG.handle_mission_close(args))
                return out, bus, calls
            finally:
                for p in reversed(patches):
                    p.stop()

    def test_close_dry_run_zero_mutation(self):
        # A.1: dryRun executa pre_close + deliver-verify e devolve o PLANO sem mutar
        with TempState() as ts:
            cwd = Path(ts.tmp) / "dr-cwd"
            cwd.mkdir()
            (cwd / "verify.json").write_text("{}", encoding="utf-8")
            mc.save_ledger({"missionId": "dr1", "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched", "cwd": str(cwd)})
            green = mock.Mock(returncode=0, stdout=json.dumps(
                {"verdict": "pass", "checks": [{"id": "x", "ok": True}]}).encode())
            out, bus, calls = self._close({"missionId": "dr1", "dryRun": True},
                                          verify_proc=green)
            self.assertTrue(out["ok"])
            self.assertTrue(out["dryRun"])
            self.assertEqual(out["deliverVerify"]["verdict"], "pass")
            self.assertIn("tab_close", " ".join(out["plannedSteps"]))
            # zero mutação: ledger intocado, sem evento de fechamento, sem bus
            led = mc.load_ledger("dr1")
            self.assertEqual(led["status"], "dispatched")
            self.assertNotIn("closedAt", led)
            self.assertNotIn("verified_e2e", led)
            bus.assert_not_called()
            evs = (Path(mc.STATE_DIR) / "events.jsonl").read_text() if \
                (Path(mc.STATE_DIR) / "events.jsonl").exists() else ""
            self.assertNotIn("mission_closed", evs)

    def test_close_dry_run_preview_red_reopens(self):
        # A.1: dryRun com prova vermelha REAL prevê a reabertura (deliver_verify_red)
        with TempState() as ts:
            cwd = Path(ts.tmp) / "dr-red"
            cwd.mkdir()
            (cwd / "verify.json").write_text("{}", encoding="utf-8")
            mc.save_ledger({"missionId": "dr2", "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched", "cwd": str(cwd),
                            "consequence": True, "consequenceSource": "dispatch"})
            red = mock.Mock(returncode=2, stdout=json.dumps(
                {"verdict": "fail",
                 "checks": [{"id": "cmd-1", "ok": False, "error": "x"}]}).encode())
            out, _b, _c = self._close({"missionId": "dr2", "dryRun": True}, verify_proc=red)
            self.assertTrue(out["dryRun"])
            self.assertEqual(out["deliverVerify"]["verdict"], "fail")
            self.assertTrue(any("REABRIRIA" in w for w in out["warnings"]))
            self.assertEqual(mc.load_ledger("dr2")["status"], "dispatched")  # zero mutação

    def test_close_expect_badge_required(self):
        # A.2: expectBadge + fechamento terminaria sem badge -> BADGE_REQUIRED sem mutar
        with TempState() as ts:
            mc.save_ledger({"missionId": "eb1", "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched"})
            out, _b, _c = self._close({"missionId": "eb1", "expectBadge": True})
            self.assertFalse(out["ok"])
            self.assertEqual(out["error"], "BADGE_REQUIRED")
            self.assertIn("expectBadge", out["reason"])
            self.assertEqual(mc.load_ledger("eb1")["status"], "dispatched")

    def test_close_keep_pane_preserves_tab(self):
        # A.3: keepPane fecha o ledger mas preserva a aba
        with TempState() as ts:
            mc.save_ledger({"missionId": "kp1", "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched"})
            with mock.patch.object(mc, "tab_close") as tc:
                out, _b, _c = self._close({"missionId": "kp1", "keepPane": True})
            self.assertTrue(out["ok"])
            self.assertEqual(mc.load_ledger("kp1")["status"], "closed")
            tc.assert_not_called()
            kp = [s for s in out["steps"] if s["step"] == "tab_close"][0]
            self.assertIn("keepPane", kp.get("note", ""))
            # sem keepPane: aba fecha normalmente
            mc.save_ledger({"missionId": "kp2", "paneId": "w1:pZ", "tabId": "t2",
                            "status": "dispatched"})
            with mock.patch.object(mc, "tab_close", return_value=None) as tc2:
                out2, _b, _c = self._close({"missionId": "kp2"})
            self.assertTrue(out2["ok"])
            tc2.assert_called_once_with("t2")

    def test_close_cancel_requires_reason_and_records_note(self):
        # A.4: cancel sem motivo -> CANCEL_REASON_REQUIRED; com decisionNote ->
        # fecha, grava no ledger, emite mission_cancelled no ledger + bus
        with TempState() as ts:
            mc.save_ledger({"missionId": "cn1", "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched"})
            out, _b, _c = self._close({"missionId": "cn1", "cancel": True})
            self.assertFalse(out["ok"])
            self.assertEqual(out["error"], "CANCEL_REASON_REQUIRED")
            self.assertEqual(mc.load_ledger("cn1")["status"], "dispatched")
            # com decisionNote: cancelamento governado
            out2, bus, _c = self._close(
                {"missionId": "cn1", "cancel": True, "decisionNote": "requisito mudou"})
            self.assertTrue(out2["ok"])
            led = mc.load_ledger("cn1")
            self.assertEqual(led["status"], "closed")
            self.assertEqual(led.get("decisionNote"), "requisito mudou")
            self.assertEqual(mc.last_event("cn1")["event"], "mission_cancelled")
            bus.assert_any_call("mission_cancelled", "cn1", mock.ANY)

    def test_close_idempotent_and_lock(self):
        # A.5: já closed -> ok idempotent com badge; corrida -> CLOSE_BUSY
        with TempState() as ts:
            mc.save_ledger({"missionId": "id1", "paneId": "w1:pZ", "tabId": "t1",
                            "status": "closed", "verified_e2e": {"verdict": "pass"}})
            out, _b, _c = self._close({"missionId": "id1"})
            self.assertTrue(out["ok"])
            self.assertTrue(out["idempotent"])
            self.assertEqual(out["badge"], "verified_e2e")
            # lock ocupado por outro chamador -> CLOSE_BUSY honesto
            import fcntl
            lock_path = Path(mc.STATE_DIR) / ".id2.close.lock"
            mc.save_ledger({"missionId": "id2", "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched"})
            fd = os.open(str(lock_path), os.O_CREAT | os.O_RDWR, 0o600)
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                out2, _b, _c = self._close({"missionId": "id2"})
                self.assertFalse(out2["ok"])
                self.assertEqual(out2["error"], "CLOSE_BUSY")
                self.assertEqual(mc.load_ledger("id2")["status"], "dispatched")
            finally:
                fcntl.flock(fd, fcntl.LOCK_UN)
                os.close(fd)

    def test_close_worker_active_refused(self):
        # A.6: turno vivo no pane -> WORKER_ACTIVE antes de qualquer mutação
        with TempState() as ts:
            mc.save_ledger({"missionId": "wa1", "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched"})
            with mock.patch.object(mc, "pane_exists", return_value=True), \
                 mock.patch.object(PKG, "_pane_agent_status", return_value=("working", None)), \
                 mock.patch.object(mc, "foreground_agent_name", return_value=("other", None)):
                with mock.patch.object(PKG.vg, "emit_bus_event") as bus:
                    out = json.loads(PKG.handle_mission_close({"missionId": "wa1"}))
            self.assertFalse(out["ok"])
            self.assertEqual(out["error"], "WORKER_ACTIVE")
            self.assertEqual(mc.load_ledger("wa1")["status"], "dispatched")
            bus.assert_not_called()

    def test_resolve_fragment_and_ambiguity(self):
        # A.7: fragment substring case-insensitive; >=2 = AMBIGUOUS; 0/2 resolvedores
        with TempState() as ts:
            mc.save_ledger({"missionId": "frag-alpha", "paneId": "w1:p1",
                            "status": "dispatched"})
            mc.save_ledger({"missionId": "frag-beta", "paneId": "w1:p2",
                            "status": "dispatched"})
            out = json.loads(PKG.handle_mission_close({"fragment": "ALPHA", "dryRun": True}))
            self.assertTrue(out["ok"])  # case-insensitive resolve 1
            amb = json.loads(PKG.handle_mission_close({"fragment": "frag-"}))
            self.assertFalse(amb["ok"])
            self.assertEqual(amb["error"], "AMBIGUOUS")
            self.assertIn("frag-alpha", amb["detail"])
            bad = json.loads(PKG.handle_mission_close({"fragment": "x", "missionId": "frag-alpha"}))
            self.assertEqual(bad["error"], "INVALID_INPUT")
            nf_ = json.loads(PKG.handle_mission_close({"fragment": "inexistente-xyz"}))
            self.assertEqual(nf_["error"], "MISSION_NOT_FOUND")


class TestToolsFix02Verify(unittest.TestCase):
    """ENG-MCP-TOOLS-FIX-02 — lacunas A.7/A.8 no handle_mission_verify:
    fragment/paneId, checks[] parcial, timeoutMs, NO_MANIFEST honesto."""

    def _verify(self, args, proc=None):
        patches = []
        if proc is not None:
            patches.append(mock.patch.object(PKG.subprocess, "run", return_value=proc))
        with mock.patch.object(PKG.vg, "emit_bus_event"):
            for p in patches:
                p.start()
            try:
                return json.loads(PKG.handle_mission_verify(args))
            finally:
                for p in reversed(patches):
                    p.stop()

    def test_verify_fragment_resolution(self):
        with TempState() as ts:
            mc.save_ledger({"missionId": "vfrag-alpha", "paneId": "w1:p1",
                            "status": "dispatched"})
            mc.save_ledger({"missionId": "vfrag-beta", "paneId": "w1:p2",
                            "status": "dispatched"})
            proc = mock.Mock(returncode=0, stdout=json.dumps(
                {"missionId": "vfrag-alpha", "source": "manifest", "verdict": "pass",
                 "checks": []}).encode())
            out = self._verify({"fragment": "vfrag-a"}, proc=proc)
            self.assertEqual(out["missionId"], "vfrag-alpha")
            self.assertEqual(out["verdict"], "pass")
            self.assertEqual(out["ledgerStatus"], "dispatched")
            amb = self._verify({"fragment": "vfrag"})
            self.assertEqual(amb["error"], "AMBIGUOUS")

    def test_verify_checks_filter_partial(self):
        # A.8: roda o runner completo, devolve subconjunto partial:true (nunca "pass")
        with TempState() as ts:
            mc.save_ledger({"missionId": "vf2", "paneId": "w1:pZ", "status": "dispatched"})
            full = {"missionId": "vf2", "source": "manifest", "verdict": "pass",
                    "checks": [{"id": "c1", "ok": True}, {"id": "c2", "ok": False}]}
            proc = mock.Mock(returncode=0, stdout=json.dumps(full).encode())
            out = self._verify({"missionId": "vf2", "checks": ["c1"]}, proc=proc)
            self.assertTrue(out["partial"])
            self.assertEqual(out["verdict"], "partial")
            self.assertEqual([c["id"] for c in out["checks"]], ["c1"])
            self.assertTrue(out["ok"])
            # check pedido inexistente -> warning + subconjunto vazio nunca ok
            out2 = self._verify({"missionId": "vf2", "checks": ["zzz"]}, proc=proc)
            self.assertFalse(out2["ok"])
            self.assertTrue(any("não encontrados" in w for w in out2.get("warnings", [])))

    def test_verify_no_manifest_warning(self):
        # bateria inferida sem verify.json no cwd -> warning NO_MANIFEST (não é prova)
        with TempState() as ts:
            cwd = Path(ts.tmp) / "nm-cwd"
            cwd.mkdir()
            mc.save_ledger({"missionId": "vf3", "paneId": "w1:pZ", "status": "dispatched",
                            "cwd": str(cwd)})
            proc = mock.Mock(returncode=0, stdout=json.dumps(
                {"missionId": "vf3", "source": "inferred:cmd", "verdict": "pass",
                 "checks": [{"id": "i1", "ok": True}]}).encode())
            out = self._verify({"missionId": "vf3"}, proc=proc)
            self.assertTrue(any("NO_MANIFEST" in w for w in out.get("warnings", [])))

    def test_verify_invalid_inputs(self):
        with TempState() as ts:
            mc.save_ledger({"missionId": "vf4", "status": "dispatched"})
            two = self._verify({"missionId": "vf4", "paneId": "p"})
            self.assertEqual(two["error"], "INVALID_INPUT")
            bad_t = self._verify({"missionId": "vf4", "timeoutMs": "x"})
            self.assertEqual(bad_t["error"], "INVALID_INPUT")
            nf_ = self._verify({"missionId": "vf4-outra"})
            self.assertEqual(nf_["error"], "MISSION_NOT_FOUND")


class TestDeliverVerifyRedReal(unittest.TestCase):
    """ENG-MCP-TOOLS-FIX-02 — caso vermelho REAL (sem mock do runner): scratch com
    verify.json de owner ERRADO -> close reabre com nudge + evento deliver_verify_red.
    Prova o gate DELIVER-VERIFY de ponta a ponta com o runner verdadeiro."""

    def test_wrong_owner_verify_reopens(self):
        mid = "toolsfix02-red-%d" % os.getpid()
        with TempState() as ts:
            cwd = Path(ts.tmp) / "red-cwd"
            cwd.mkdir()
            # verify.json declarando OUTRA missão (owner errado) — o runner roda de verdade
            (cwd / "verify.json").write_text(
                json.dumps({"mission": "outra-missao",
                            "cmd": [{"run": "true", "expect_exit": 0}]}), encoding="utf-8")
            mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched", "cwd": str(cwd),
                            "consequence": True, "consequenceSource": "dispatch"})
            with mock.patch.object(mc, "run_herdr", track_calls()[1]), \
                 mock.patch.object(mc.time, "sleep"), \
                 mock.patch.object(mc, "pane_exists", return_value=False), \
                 mock.patch.object(PKG.nf, "mission_completed",
                                   return_value={"ok": True, "emitted": True}), \
                 mock.patch.object(PKG.nf, "mission_reopened",
                                   return_value={"ok": True, "emitted": True}) as reopened, \
                 mock.patch.object(PKG.vg, "emit_bus_event") as bus:
                try:
                    out = json.loads(PKG.handle_mission_close({"missionId": mid}))
                finally:
                    # dv_report é gravado no STATE_DIR real (path absoluto do handler)
                    try:
                        os.remove("/root/.hermes/mission-state/%s.verify.json" % mid)
                    except OSError:
                        pass
                self.assertFalse(out["ok"])
            self.assertTrue(out.get("reopenedByDeliverVerify"))
            led = mc.load_ledger(mid)
            self.assertEqual(led["status"], "interrupted")
            dv = [s for s in out["steps"] if s["step"] == "deliver_verify"][0]
            self.assertEqual(dv["verdict"], "fail")
            self.assertIn("manifest-owner", dv["failed"])
            self.assertEqual(reopened.call_count, 1)
            bus.assert_any_call("deliver_verify_red", mid, mock.ANY)
            self.assertEqual(mc.last_event(mid)["event"], "deliver_verify_red")


# ================================================================ RD-MOPS-01
class TestCloseLockFdReleased(unittest.TestCase):
    """RD-MOPS-01 — o fd do close.lock NÃO sobrevive ao turno do mission_close.
    Bug real de 04/10: close reaberto por deliver_verify vazava o _lock_fd no
    processo gateway (flock retido -> TODO re-close seguinte falhava CLOSE_BUSY,
    Errno 11, até remoção manual do lock). Provas: após o close reabrir, (1) um
    flock novo no MESMO lock-file succeeds — fd vazado o negaria com Errno 11;
    (2) /proc/self/fd não mostra o arquivo de lock; (3) o 2º close no MESMO
    processo (simulação do gateway longo-vivo) não recusa CLOSE_BUSY — reabre
    pelo mesmo gate."""

    def _close_reopen(self, mid):
        with mock.patch.object(mc, "run_herdr", track_calls()[1]), \
             mock.patch.object(mc.time, "sleep"), \
             mock.patch.object(mc, "pane_exists", return_value=False), \
             mock.patch.object(PKG.nf, "mission_completed",
                               return_value={"ok": True, "emitted": True}), \
             mock.patch.object(PKG.nf, "mission_reopened",
                               return_value={"ok": True, "emitted": True}) as reopened, \
             mock.patch.object(PKG.vg, "emit_bus_event") as bus:
            out = json.loads(PKG.handle_mission_close({"missionId": mid}))
        return out, reopened, bus

    def test_lock_fd_released_after_reopen_and_reclose(self):
        import fcntl
        mid = "rdmops01-%d" % os.getpid()
        with TempState() as ts:
            cwd = Path(ts.tmp) / "lockfd-cwd"
            cwd.mkdir()
            # verify.json de owner ERRADO -> runner real roda e o close REABRE
            # (deliver_verify_red: o caminho que vazava o fd em produção)
            (cwd / "verify.json").write_text(
                json.dumps({"mission": "outra-missao",
                            "cmd": [{"run": "true", "expect_exit": 0}]}), encoding="utf-8")
            mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched", "cwd": str(cwd),
                            "consequence": True, "consequenceSource": "dispatch"})
            out, reopened, bus = self._close_reopen(mid)
            self.assertFalse(out["ok"])
            self.assertTrue(out.get("reopenedByDeliverVerify"))
            self.assertEqual(mc.load_ledger(mid)["status"], "interrupted")
            reopened.assert_called_once()
            bus.assert_any_call("deliver_verify_red", mid, mock.ANY)
            self.assertEqual(mc.last_event(mid)["event"], "deliver_verify_red")
            # PROBE 1 — flock novo no MESMO lock-file: com o fd vazado, seria
            # Errno 11 (o lock por open-file-description do leak ainda vivo)
            lock_path = Path(mc.STATE_DIR) / (".%s.close.lock" % mid)
            fd2 = os.open(str(lock_path), os.O_CREAT | os.O_RDWR, 0o600)
            try:
                fcntl.flock(fd2, fcntl.LOCK_EX | fcntl.LOCK_NB)
                fcntl.flock(fd2, fcntl.LOCK_UN)
            finally:
                os.close(fd2)
            # PROBE 2 — /proc/self/fd sem referência ao lock-file
            targets = set()
            for f in Path("/proc/self/fd").iterdir():
                try:
                    targets.add(os.readlink(f))
                except OSError:
                    pass
            self.assertNotIn(str(lock_path), targets)
            # 2º close no MESMO processo: NÃO recusa CLOSE_BUSY — reabre de novo
            out2, _r2, _b2 = self._close_reopen(mid)
            self.assertNotEqual(out2.get("error"), "CLOSE_BUSY")
            self.assertTrue(out2.get("reopenedByDeliverVerify"))
            try:
                os.remove(str(Path(mc.STATE_DIR) / ("%s.verify.json" % mid)))
            except OSError:
                pass


# ================================================================ SEC-SHELL-GUARD-01
# Shell.run como caminho padrão do worker: cláusula SHELL GUARD no template de
# dispatch (prompt builder) + medida de adoção Bash vs shell.run por missão.

class TestShellGuardDispatchClause(unittest.TestCase):
    """SEC-SHELL-GUARD-01: o prompt de despacho instrui shell.run como caminho padrão."""

    def test_template_instructs_shell_run_default(self):
        t = mc.dispatch_prompt("/x/missao.md")
        self.assertIn("engineering.shell.run", t)
        self.assertIn("SEC_PATH_FORBIDDEN", t)
        self.assertIn("shell-allowlist-<componente>.json", t)
        self.assertIn("Bash nativo SÓ como fallback", t)

    def test_template_with_clause_still_inline(self):
        # a cláusula nova não pode empurrar o template canônico para o fallback
        # de arquivo (TEMPLATE-PROTOCOL-01): o template inteiro segue inline.
        t = mc.dispatch_prompt("/x/missao.md")
        self.assertNotIn("contrato completo em:", t)
        self.assertLessEqual(len(t), mc.DISPATCH_INLINE_LIMIT)


class TestShellAdoption(unittest.TestCase):
    """SEC-SHELL-GUARD-01: medida de adoção (metadata-only, LGPD-safe)."""

    @staticmethod
    def _write_transcript(path, tool_uses):
        lines = []
        for name, n in tool_uses:
            for _ in range(n):
                lines.append(json.dumps({"message": {"content": [{"type": "tool_use", "name": name}]}}))
        with open(path, "w", encoding="utf-8") as fh:
            fh.write("\n".join(lines) + "\n")

    def test_counts_bash_vs_shell_run_per_mission(self):
        with tempfile.TemporaryDirectory() as tmp:
            ledger_dir = os.path.join(tmp, "ledger")
            projects = os.path.join(tmp, "projects")
            os.makedirs(ledger_dir)
            os.makedirs(os.path.join(projects, "-opt-mission-events"))
            with open(os.path.join(ledger_dir, "M1.json"), "w", encoding="utf-8") as fh:
                json.dump({"missionId": "M1", "resumeSessionId": "sess-1", "cwd": "/opt/mission-events"}, fh)
            self._write_transcript(
                os.path.join(projects, "-opt-mission-events", "sess-1.jsonl"),
                [("Bash", 3), ("mcp__engineering__shell_run", 1), ("engineering_shell_run", 1), ("Read", 9)])
            out = sa.measure_adoption(["M1"], ledger_dir=ledger_dir, transcripts_base=projects)
            row = out["missions"][0]
            self.assertEqual(row["bash"], 3)
            self.assertEqual(row["shellRun"], 2)
            self.assertEqual(row["adoptionPct"], 40.0)
            self.assertIn("sess-1.jsonl", row["transcript"])
            self.assertEqual(out["totals"]["adoptionPct"], 40.0)

    def test_missing_transcript_is_reported_not_crash(self):
        with tempfile.TemporaryDirectory() as tmp:
            ledger_dir = os.path.join(tmp, "ledger")
            os.makedirs(ledger_dir)
            with open(os.path.join(ledger_dir, "M2.json"), "w", encoding="utf-8") as fh:
                json.dump({"missionId": "M2", "resumeSessionId": "nope", "cwd": "/opt/mission-events"}, fh)
            out = sa.measure_adoption(["M2"], ledger_dir=ledger_dir, transcripts_base=os.path.join(tmp, "projects"))
            self.assertEqual(out["missions"][0]["transcript"], "missing")
            self.assertIsNone(out["missions"][0]["adoptionPct"])
            self.assertIsNone(out["totals"]["adoptionPct"])

    def test_mission_without_shell_commands_is_none(self):
        with tempfile.TemporaryDirectory() as tmp:
            ledger_dir = os.path.join(tmp, "ledger")
            projects = os.path.join(tmp, "projects")
            os.makedirs(ledger_dir)
            os.makedirs(os.path.join(projects, "-opt-mission-events"))
            with open(os.path.join(ledger_dir, "M3.json"), "w", encoding="utf-8") as fh:
                json.dump({"missionId": "M3", "resumeSessionId": "sess-3", "cwd": "/opt/mission-events"}, fh)
            self._write_transcript(os.path.join(projects, "-opt-mission-events", "sess-3.jsonl"), [("Read", 4)])
            out = sa.measure_adoption(["M3"], ledger_dir=ledger_dir, transcripts_base=projects)
            self.assertEqual(out["missions"][0]["bash"] + out["missions"][0]["shellRun"], 0)
            self.assertIsNone(out["missions"][0]["adoptionPct"])

    def test_metadata_only_never_reads_command_content(self):
        # garantia LGPD: a contagem só olha type/name do tool_use — comando com
        # texto sensível no input não vaza para o resultado da medida.
        with tempfile.TemporaryDirectory() as tmp:
            ledger_dir = os.path.join(tmp, "ledger")
            projects = os.path.join(tmp, "projects")
            os.makedirs(ledger_dir)
            os.makedirs(os.path.join(projects, "-opt-mission-events"))
            with open(os.path.join(ledger_dir, "M4.json"), "w", encoding="utf-8") as fh:
                json.dump({"missionId": "M4", "resumeSessionId": "sess-4", "cwd": "/opt/mission-events"}, fh)
            lines = [json.dumps({"message": {"content": [{"type": "tool_use", "name": "Bash",
                                                          "input": {"command": "cat /root/.git-credentials SECRET-TOKEN-XYZ"}}]}})]
            with open(os.path.join(projects, "-opt-mission-events", "sess-4.jsonl"), "w", encoding="utf-8") as fh:
                fh.write("\n".join(lines) + "\n")
            out = sa.measure_adoption(["M4"], ledger_dir=ledger_dir, transcripts_base=projects)
            self.assertEqual(out["missions"][0]["bash"], 1)
            self.assertNotIn("SECRET-TOKEN-XYZ", json.dumps(out))


class TestGuardianMobile01(unittest.TestCase):
    """GUARDIAN-MOBILE-01 — approval cards no Telegram (toque = ordem).

    Hermético: STATE_DIR/(token|allowlist|spool) em tmp; PTB falso injetado;
    NUNCA missão real, NUNCA rede real. Fail-closed provado em cada estado.
    """

    def setUp(self):
        self.state = TempState()
        self.state.__enter__()
        self.addCleanup(self.state.__exit__, None, None, None)
        self.ac = PKG.ac
        self.sg = PKG.sg
        self.ot = PKG.ac.ot
        self.env = mock.patch.dict(os.environ, {
            "MISSION_OPS_GUARD_SPOOL_FILE": os.path.join(self.state.tmp, "spool-guard.jsonl"),
            "MISSION_OPS_OPERATOR_TOKEN_FILE": os.path.join(self.state.tmp, "operator-order-token.json"),
            "MISSION_OPS_OPERATOR_ALLOWLIST_FILE": os.path.join(self.state.tmp, "operator-allowlist.json"),
        })
        self.env.start()
        self.addCleanup(self.env.stop)
        self._gw_saved = dict(self.ac._GATEWAY)
        self.addCleanup(self.ac._GATEWAY.update, self._gw_saved)
        self._booted_saved = self.sg._GATEWAY_BOOTED
        self.addCleanup(setattr, self.sg, "_GATEWAY_BOOTED", self._booted_saved)
        self.spool_file = os.path.join(self.state.tmp, "spool-guard.jsonl")

    # ---- fixtures

    def _ledger(self, mission_id="M1"):
        ledger = {"missionId": mission_id, "status": "working", "cwd": "/opt/mission-events"}
        mc.save_ledger(ledger)
        return ledger

    def _token_file(self, token="tok-guardian-test-0123456789abcdef"):
        import hashlib
        art = {"version": 1, "tokenHash": hashlib.sha256(token.encode()).hexdigest(),
               "createdAt": "2026-10-04T00:00:00.000Z"}
        art["hash16"] = self.ot._self_hash16(art)
        path = os.environ["MISSION_OPS_OPERATOR_TOKEN_FILE"]
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            json.dump(art, f)
        return token

    def _allowlist_file(self, chat_id="12345"):
        art = {"version": 1, "telegram": {"chatIds": [{"chatId": chat_id}]}}
        art["hash16"] = self.ot._self_hash16(art)
        path = os.environ["MISSION_OPS_OPERATOR_ALLOWLIST_FILE"]
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            json.dump(art, f)
        return art

    def _raw(self):
        try:
            with open(self.spool_file, encoding="utf-8") as f:
                return f.read()
        except OSError:
            return ""

    def _spool(self):
        try:
            with open(self.spool_file, encoding="utf-8") as f:
                return [json.loads(l) for l in f if l.strip()]
        except OSError:
            return []

    def _create(self, **kw):
        args = {"missionId": "M1", "action": "close", "target": "host: systemd unit x",
                "costRisk": "reinicia serviço em produção"}
        args.update(kw)
        return self.ac.create_approval(args)

    # ---- card / criação

    def test_01_card_resumo_tipado_e_keyboard(self):
        res = self._create()
        self.assertTrue(res["ok"])
        intent = self.ac.load_intent(res["approvalId"])
        card = self.ac.render_card(intent)
        for field in ("M1", "close", "host: systemd unit x", "reinicia serviço em produção", res["approvalId"]):
            self.assertIn(field, card["text"])
        (row,) = card["keyboard"]
        self.assertEqual(row[0]["text"], "APROVAR")
        self.assertEqual(row[1]["text"], "CANCELAR")
        self.assertEqual(row[0]["callback_data"], "gmob01:approve:%s" % res["approvalId"])
        self.assertEqual(row[1]["callback_data"], "gmob01:cancel:%s" % res["approvalId"])

    def test_02_create_valida_campos_e_nao_grava(self):
        self.assertEqual(self._create(missionId="")["error"], "INVALID_MISSION_ID")
        self.assertEqual(self._create(action="")["error"], "INVALID_ACTION")
        self.assertEqual(self._create(target="")["error"], "INVALID_TARGET")
        self.assertEqual(self._create(ttlMin="abc")["error"], "INVALID_TTL")
        self.assertEqual(os.listdir(self.ac._approvals_dir()) if os.path.isdir(self.ac._approvals_dir()) else [],
                         [])

    def test_03_create_intent_0600_canal_inactive_honesto_ledger(self):
        ledger = self._ledger()
        res = self._create()
        self.assertTrue(res["ok"])
        path = self.ac._approval_path(res["approvalId"])
        self.assertEqual(os.stat(path).st_mode & 0o077, 0)  # 0600 owner-only
        self.assertEqual(res["channel"]["status"], "inactive")
        self.assertEqual(res["channel"]["reason"], "GATEWAY_TELEGRAM_NOT_WIRED")
        events = [e["kind"] for e in self._spool()]
        self.assertIn("operator_approval_requested", events)
        ledger2 = mc.load_ledger("M1")
        self.assertEqual(ledger2["status"], "waiting_operator")
        self.assertEqual(ledger2["pendingApproval"]["approvalId"], res["approvalId"])
        self.assertEqual(ledger2["pendingApproval"]["status"], "pending")

    def test_04_create_idempotente_mesma_missao_acao(self):
        self._ledger()
        r1 = self._create()
        r2 = self._create()
        self.assertTrue(r2["existing"])
        self.assertEqual(r1["approvalId"], r2["approvalId"])

    # ---- toque = ordem

    def test_05_aprovar_injeta_ordem_intent_e_ledger_sem_chat_em_claro(self):
        self._ledger()
        self._allowlist_file("12345")
        res = self._create()
        out = self.ac.decide(res["approvalId"], "approved", chat_id="12345")
        self.assertTrue(out["ok"])
        self.assertEqual(out["basis"], "telegram-binding")
        intent = self.ac.load_intent(res["approvalId"])
        self.assertEqual(intent["status"], "approved")
        self.assertEqual(intent["injectedOrder"]["orderRef"], "approval:%s" % res["approvalId"])
        self.assertEqual(intent["injectedOrder"]["chatHash16"], self.ot.hash16_of("12345"))
        ledger = mc.load_ledger("M1")
        self.assertEqual(ledger["operatorApproval"]["decision"], "approved")
        self.assertEqual(ledger["operatorApproval"]["orderRef"], "approval:%s" % res["approvalId"])
        raw = self._raw()
        self.assertIn("operator_approval_granted", raw)
        self.assertIn(self.ot.hash16_of("12345"), raw)
        self.assertNotIn("12345", raw.replace(str(self.state.tmp), ""))  # chat_id NUNCA em claro

    def test_06_toque_fora_da_allowlist_recusa_tipada(self):
        self._ledger()
        self._allowlist_file("12345")
        res = self._create()
        out = self.ac.decide(res["approvalId"], "approved", chat_id="99999")
        self.assertEqual(out["error"], "OPERATOR_ORDER_UNVERIFIED")
        self.assertEqual(self.ac.load_intent(res["approvalId"])["status"], "pending")
        unv = [e for e in self._spool() if e["kind"] == "operator_order_unverified"]
        self.assertTrue(unv and unv[0]["tokenStatus"] in ("absent", "disabled", "invalid"))

    def test_07_cancelar_tipado_com_evidencia_e_idempotente(self):
        self._ledger()
        self._allowlist_file("12345")
        res = self._create()
        out = self.ac.decide(res["approvalId"], "cancelled", chat_id="12345")
        self.assertTrue(out["ok"])
        intent = self.ac.load_intent(res["approvalId"])
        self.assertEqual(intent["status"], "cancelled")
        self.assertEqual(intent["cancellation"]["chatHash16"], self.ot.hash16_of("12345"))
        self.assertEqual(intent["cancellation"]["source"], "telegram-card")
        again = self.ac.decide(res["approvalId"], "approved", chat_id="12345")
        self.assertTrue(again["idempotent"])
        self.assertEqual(self.ac.load_intent(res["approvalId"])["status"], "cancelled")
        self.assertIn("operator_approval_cancelled", self._raw())

    def test_08_toque_apos_ttl_recusado_e_permanece_pendente(self):
        self._ledger()
        self._allowlist_file("12345")
        res = self._create()
        intent = self.ac.load_intent(res["approvalId"])
        intent["expiresAtMs"] = self.ac._now_ms() - 1000
        self.ac._write_intent(intent)
        out = self.ac.decide(res["approvalId"], "approved", chat_id="12345")
        self.assertEqual(out["error"], "APPROVAL_EXPIRED")
        self.assertEqual(out["status"], "pending")  # NUNCA executa por default
        self.assertEqual(self.ac.load_intent(res["approvalId"])["status"], "pending")
        self.assertIn("operator_approval_expired_touch", self._raw())

    def test_09_sem_toque_permanece_pendente_com_nota_honesta(self):
        self._ledger()
        res = self._create()
        intent = self.ac.load_intent(res["approvalId"])
        intent["expiresAtMs"] = self.ac._now_ms() - 1000
        self.ac._write_intent(intent)
        out = self.ac.approval_status({"approvalId": res["approvalId"]})
        self.assertEqual(out["status"], "pending")
        self.assertIn("permanece pendente", out["ttlNote"])

    # ---- ordem por texto

    def test_10_texto_sem_token_sem_binding_unverified_com_token_status(self):
        self._ledger()
        res = self._create()
        out = self.ac.text_order("APROVAR %s" % res["approvalId"], chat_id="12345")
        self.assertEqual(out["error"], "OPERATOR_ORDER_UNVERIFIED")
        unv = [e for e in self._spool() if e["kind"] == "operator_order_unverified"]
        self.assertTrue(unv and unv[0].get("tokenStatus"))
        self.assertEqual(self.ac.load_intent(res["approvalId"])["status"], "pending")

    def test_11_texto_com_token_valido_aprova_por_token(self):
        self._ledger()
        token = self._token_file()
        res = self._create()
        out = self.ac.text_order("APROVAR %s %s" % (res["approvalId"], token), chat_id="12345")
        self.assertTrue(out["ok"])
        self.assertEqual(out["basis"], "token")
        self.assertEqual(self.ac.load_intent(res["approvalId"])["status"], "approved")

    def test_12_texto_nao_ordem_retorna_none(self):
        self.assertIsNone(self.ac.text_order("oi, tudo bem?"))
        self.assertIsNone(self.ac.text_order("APROVAREMOS tudo"))

    # ---- guard: base approval-card

    def _approved_ledger(self, action="close"):
        self._ledger()
        self._allowlist_file("12345")
        res = self._create(action=action)
        self.ac.decide(res["approvalId"], "approved", chat_id="12345")
        return mc.load_ledger("M1"), res["approvalId"]

    def test_13_guard_aceita_aprovacao_do_card_na_janela(self):
        ledger, apid = self._approved_ledger()
        self.sg._GATEWAY_BOOTED = True
        out = self.sg.assert_action_allowed("close", {"missionId": "M1"}, ledger=ledger)
        self.assertIsNone(out)  # permitido pela base approval-card
        raw = self._raw()
        self.assertIn('"basis": "approval-card"', raw)
        self.assertIn("operator_order_verified", raw)
        self.assertIn(apid, raw)

    def test_14_guard_recusa_aprovacao_fora_da_janela(self):
        ledger, apid = self._approved_ledger()
        intent = self.ac.load_intent(apid)
        intent["injectedOrder"]["validUntilMs"] = self.ac._now_ms() - 1000
        self.ac._write_intent(intent)
        self.sg._GATEWAY_BOOTED = True
        out = self.sg.assert_action_allowed("close", {"missionId": "M1"}, ledger=ledger)
        self.assertEqual(out["code"], "SUPERVISOR_ACTION_NEEDS_ORDER")

    def test_15_guard_recusa_acao_diferente_da_aprovada(self):
        ledger, _ = self._approved_ledger(action="recover")
        self.sg._GATEWAY_BOOTED = True
        out = self.sg.assert_action_allowed("close", {"missionId": "M1"}, ledger=ledger)
        self.assertEqual(out["code"], "SUPERVISOR_ACTION_NEEDS_ORDER")

    # ---- wiring do gateway (PTB falso)

    def _fake_ptb(self):
        import types
        tg = types.ModuleType("telegram")

        class Btn:
            def __init__(self, text, callback_data=None):
                self.text, self.callback_data = text, callback_data

        class Markup:
            def __init__(self, keyboard):
                self.keyboard = keyboard

        tg.InlineKeyboardButton, tg.InlineKeyboardMarkup = Btn, Markup
        ext = types.ModuleType("telegram.ext")

        class CQH:
            def __init__(self, callback, pattern=None):
                self.callback, self.pattern = callback, pattern

        class MH:
            def __init__(self, filters_, callback):
                self.filters, self.callback = filters_, callback

        ext.CallbackQueryHandler, ext.MessageHandler = CQH, MH
        ext.filters = types.SimpleNamespace(Regex=lambda r: types.SimpleNamespace(pattern=r))
        return tg, ext

    def test_16_factory_registra_handlers_com_prefixo_exclusivo(self):
        tg, ext = self._fake_ptb()
        tg.ext = ext
        sys.modules["telegram"], sys.modules["telegram.ext"] = tg, ext
        self.addCleanup(sys.modules.pop, "telegram", None)
        self.addCleanup(sys.modules.pop, "telegram.ext", None)

        class FakeNative:
            def __init__(self):
                self.handlers = []

            def add_handler(self, h):
                self.handlers.append(h)

        native = FakeNative()
        self.ac.telegram_handler_factory(native, None)
        self.assertEqual(len(native.handlers), 2)
        self.assertEqual(native.handlers[0].pattern, "^gmob01:")
        self.assertIsNotNone(self.ac._GATEWAY["native"])

    def test_17_entrega_do_card_e2e_ptb_falso(self):
        import asyncio
        import threading
        import types as _types
        tg, ext = self._fake_ptb()
        tg.ext = ext
        sys.modules["telegram"], sys.modules["telegram.ext"] = tg, ext
        self.addCleanup(sys.modules.pop, "telegram", None)
        self.addCleanup(sys.modules.pop, "telegram.ext", None)
        self._ledger()
        self._allowlist_file("12345")

        class FakeBot:
            def __init__(self):
                self.sent = []

            async def send_message(self, chat_id, text, reply_markup=None):
                self.sent.append({"chat_id": chat_id, "text": text, "markup": reply_markup})
                return _types.SimpleNamespace(message_id=len(self.sent))

        class FakeNative:
            def __init__(self):
                self.bot = FakeBot()

        native = FakeNative()
        loop = asyncio.new_event_loop()
        th = threading.Thread(target=loop.run_forever, daemon=True)
        th.start()
        self.addCleanup(loop.call_soon_threadsafe, loop.stop)
        self.ac._GATEWAY.update({"native": native, "loop": loop, "adapter": None})
        res = self._create()
        self.assertEqual(res["delivery"]["status"], "scheduled")
        for _ in range(100):
            if native.bot.sent and "operator_card_sent" in self._raw():
                break  # evento do spool é o ÚLTIMO write do coroutine — fim honesto
            time.sleep(0.02)
        self.assertEqual(len(native.bot.sent), 1)
        card_text = native.bot.sent[0]["text"]
        for field in ("M1", "close", "reinicia serviço em produção"):
            self.assertIn(field, card_text)
        self.assertEqual(native.bot.sent[0]["markup"].keyboard[0][0].callback_data,
                         "gmob01:approve:%s" % res["approvalId"])
        intent = self.ac.load_intent(res["approvalId"])
        self.assertEqual(len(intent["cardMessageIds"]), 1)
        self.assertIn("operator_card_sent", self._raw())

    def test_18_callback_toque_e2e_ptb_falso(self):
        import asyncio
        import types
        tg, ext = self._fake_ptb()
        tg.ext = ext
        sys.modules["telegram"], sys.modules["telegram.ext"] = tg, ext
        self.addCleanup(sys.modules.pop, "telegram", None)
        self.addCleanup(sys.modules.pop, "telegram.ext", None)
        self._ledger()
        self._allowlist_file("12345")
        res = self._create()

        answered = []

        class FakeQuery:
            data = "gmob01:approve:%s" % res["approvalId"]
            message = types.SimpleNamespace(chat_id="12345", text="card")

            async def answer(self, text=None, show_alert=False):
                answered.append(text)

            async def edit_message_text(self, text=None):
                pass

        update = types.SimpleNamespace(callback_query=FakeQuery())
        asyncio.run(self.ac._on_approval_callback(update, None))
        self.assertTrue(any("ordem injetada" in (a or "") for a in answered))
        self.assertEqual(self.ac.load_intent(res["approvalId"])["status"], "approved")

    def test_19_status_por_missao(self):
        self._ledger()
        res = self._create()
        out = self.ac.approval_status({"missionId": "M1"})
        self.assertEqual(out["approvalId"], res["approvalId"])
        self.assertEqual(out["status"], "pending")
        self.assertEqual(self.ac.approval_status({})["error"], "MISSING_APPROVAL_ID_OR_MISSION_ID")
        self.assertEqual(self.ac.approval_status({"approvalId": "gmob-nao-existe"})["error"],
                         "APPROVAL_NOT_FOUND")


def _suite_classes():
    """Classes de teste DESTE módulo (ordem estável) — entrada do plano de shards."""
    import inspect
    return [o for n, o in inspect.getmembers(sys.modules[__name__], inspect.isclass)
            if issubclass(o, unittest.TestCase) and o.__module__ == __name__]


def _shard_plan(count=2):
    """RD-PERF-VERIFY-01: distribuição round-robin das classes em `count` shards.
    Cobertura exata: toda classe em exatamente 1 shard (provado em test_rd_perf_verify_01)."""
    classes = _suite_classes()
    return {i: sorted(c.__name__ for j, c in enumerate(classes) if j % count == i)
            for i in range(count)}


if __name__ == "__main__":
    # RD-PERF-VERIFY-01: suíte paralela por padrão — 2 shards, um subprocesso por shard
    # (TempState muta globals do módulo; processo próprio isola). SUITE-LOCK do runner
    # fica no ancestral (verify.py) e os shards são seus descendentes — mutex mantido.
    # Fallback serial: MISSION_OPS_SUITE_SERIAL=1 ou --serial (comportamento antigo).
    if "--shard-plan" in sys.argv:
        print(json.dumps(_shard_plan(int(os.environ.get("MISSION_OPS_SUITE_SHARDS") or 2))))
        raise SystemExit(0)
    if os.environ.get("MISSION_OPS_SUITE_SERIAL") or "--serial" in sys.argv:
        unittest.main(argv=[sys.argv[0]], verbosity=2)
        raise SystemExit(0)
    import subprocess as _sp
    _t0 = time.time()
    _count = int(os.environ.get("MISSION_OPS_SUITE_SHARDS") or 2)
    _plan = _shard_plan(_count)
    _procs = []
    for _i, _names in sorted(_plan.items()):
        if not _names:
            continue
        _env = dict(os.environ, MISSION_OPS_SUITE_SERIAL="1")
        _procs.append((_i, _sp.Popen(
            [sys.executable, "-m", "unittest", "-v"]
            + ["test_mission_ops." + n for n in _names],
            cwd=PLUGIN_DIR, env=_env)))
    _fail = 0
    for _i, _p in _procs:
        _rc = _p.wait()
        _fail += 1 if _rc else 0
        print("[shard %d] exit=%d" % (_i, _rc))
    print("SUITE PARALELA: %s em %.1fs (%d shards)"
          % ("OK" if not _fail else "%d SHARD(S) VERMELHO(S)" % _fail,
             time.time() - _t0, _count))
    raise SystemExit(1 if _fail else 0)
