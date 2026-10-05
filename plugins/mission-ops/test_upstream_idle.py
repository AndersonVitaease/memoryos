"""Teste da receita upstream-idle para erro de rede do provider OpenRouter.

Verifica: (a) aplicação da receita com send-text "continue" + Enter após timeout,
(b) escalonamento para needs_supervisor se o erro persistir, (c) confirmação de recuperação.
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))

# Adiciona o diretório ao sys.path para permitir a importação direta
sys.path.insert(0, PLUGIN_DIR)

# Carrega o pacote como um módulo real
# REUSE-LOADED (03/10): re-executar __init__.py cria um pacote NOVO e o último
# exec vence o mc.SPOOL_HOOK (fecha sobre _MISSION_SPOOL do módulo errado) →
# poluição entre suítes. Reuse o pacote já carregado quando existir.
_pre = sys.modules.get("mission_ops")
if _pre is not None and hasattr(_pre, "mc"):
    pkg = _pre
else:
    spec = importlib.util.spec_from_file_location(
        "mission_ops", os.path.join(PLUGIN_DIR, "__init__.py"),
        submodule_search_locations=[PLUGIN_DIR])
    pkg = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(pkg)
mc = pkg.mc
rc = pkg.rc


class TempState:
    """Gerencia estado temporário em diretórios tmp."""

    def __init__(self):
        self.tmp = tempfile.mkdtemp(prefix="test-upstream-idle-")
        self.state = Path(self.tmp) / "state"
        self.claude_home = Path(self.tmp) / "claude-home"
        self._saved = (mc.STATE_DIR, mc.CLAUDE_HOME, pkg._MISSION_SPOOL)

    def __enter__(self):
        mc.STATE_DIR = self.state
        mc.CLAUDE_HOME = self.claude_home
        # Caminho temporário para spool
        pkg._MISSION_SPOOL = str(Path(self.tmp) / "spool.jsonl")
        return self

    def __exit__(self, *a):
        mc.STATE_DIR, mc.CLAUDE_HOME, pkg._MISSION_SPOOL = self._saved


def fake_herdr(script):
    """Substitui run_herdr com base em padrões de argv."""
    def _run(args, timeout_s=10.0):
        key = " ".join(args)
        for pattern, ret in script.items():
            if isinstance(ret, dict) and ret.get("ok") is not None:
                if pattern.endswith("*") and key.startswith(pattern[:-1]):
                    return ret
                elif pattern == key:
                    return ret
            elif pattern.endswith("*") and key.startswith(pattern[:-1]):
                return {"ok": True, "data": ret}
            elif pattern == key:
                return {"ok": True, "data": ret}
        return {"ok": False, "error": f"unexpected herdr call: {key}"}
    return _run

def out_result(text):
    return {"id": "cli", "result": {"output": text}}

def procinfo(name):
    procs = [{"name": name}] if name else []
    return {"id": "cli", "result": {"foreground_processes": procs, "shell_pid": 42}}

def track_calls(script=None):
    """Registra chamadas e responde conforme script."""
    calls = []
    base = fake_herdr(script or {})

    def track(args, timeout_s=10.0):
        calls.append(list(args))
        ret = base(args, timeout_s)
        if ret.get("ok") is False and "unexpected herdr call" in ret.get("error", ""):
            return {"ok": True, "data": ""}
        return ret
    return calls, track

class TestUpstreamIdleRecipe(unittest.TestCase):
    def setUp(self):
        self.pane_id = "w1:pZ"
        self.mission_id = "upstream-test-01"
        self.cwd = "/tmp/test-mission"

    def _ledger(self, status="dispatched"):
        return {
            "missionId": self.mission_id,
            "status": status,
            "paneId": self.pane_id,
            "promptFile": "/x/p.md",
            "cwd": self.cwd
        }

    def test_apply_recipe_and_recover(self):
        """Caso feliz: erro de rede seguido por continue → claude volta a trabalhar."""
        with TempState() as ts:
            ledger = self._ledger(status="needs_recovery")
            mc.save_ledger(ledger)
            # Simula que o pane ainda está ativo e o claude voltou a trabalhar
            script = {
                "pane read w1:pZ --source recent-unwrapped --lines 40": out_result("trabalhando... esc to interrupt"),
                "pane process-info --pane w1:pZ": procinfo("claude")
            }
            calls, track = track_calls(script)
            with mock.patch.object(mc, "run_herdr", track), \
                 mock.patch.object(mc.time, "sleep"):
                result, err = rc.recover(self.pane_id, "upstream_idle", ledger)
            self.assertIsNone(err)
            self.assertEqual(result["recipe"], "upstream_idle")
            self.assertEqual(result["applied"], "continue + Enter, recovered")
            # Verifica as ações no herdr
            sent_text = [c for c in calls if c[:3] == ["pane", "send-text", self.pane_id]]
            keys_enter = [c for c in calls if c[:4] == ["pane", "send-keys", self.pane_id, "enter"]]
            self.assertEqual(len(sent_text), 1)
            self.assertEqual(sent_text[0][3], "continue")
            self.assertEqual(len(keys_enter), 1)
            # Status deve ser atualizado para dispatched
            updated_ledger = mc.load_ledger(self.mission_id)
            self.assertEqual(updated_ledger["status"], "dispatched")

    def test_persistent_error_escapes_to_supervisor(self):
        """Erro persistente após continue → escala para needs_supervisor."""
        with TempState() as ts:
            ledger = self._ledger(status="needs_recovery")
            mc.save_ledger(ledger)
            # Simula que o erro de rede persiste após o continue
            script = {
                "pane read w1:pZ --source recent-unwrapped --lines 40": out_result("fetch failed\nConnection error\nupstream-idle: retry 3x exceeded\nupstream-idle: final failure\nupstream-idle: maximum retries reached"),
                "pane process-info --pane w1:pZ": procinfo("claude")
            }
            calls, track = track_calls(script)
            with mock.patch.object(mc, "run_herdr", track), \
                 mock.patch.object(mc.time, "sleep"):
                result, err = rc.recover(self.pane_id, "upstream_idle", ledger)
            self.assertIsNone(err)
            self.assertEqual(result["recipe"], "upstream_idle")
            self.assertEqual(result["applied"], "continue + Enter, escalated")
            # Status deve ser atualizado para needs_supervisor
            updated_ledger = mc.load_ledger(self.mission_id)
            self.assertEqual(updated_ledger["status"], "needs_supervisor")

    def test_no_mission_still_applies_continue(self):
        """A receita pode ser aplicada mesmo sem ledger (só envia continue)."""
        with TempState() as ts:
            script = {
                "pane read w1:pZ --source recent-unwrapped --lines 40": out_result("trabalhando... esc to interrupt"),
                "pane process-info --pane w1:pZ": procinfo("claude")
            }
            calls, track = track_calls(script)
            with mock.patch.object(mc, "run_herdr", track), \
                 mock.patch.object(mc.time, "sleep"):
                result, err = rc.recover(self.pane_id, "upstream_idle", None)
            self.assertIsNone(err)
            self.assertEqual(result["recipe"], "upstream_idle")
            self.assertEqual(result["applied"], "continue + Enter, recovered")
            sent_text = [c for c in calls if c[:3] == ["pane", "send-text", self.pane_id]]
            self.assertEqual(len(sent_text), 1)
            self.assertEqual(sent_text[0][3], "continue")

if __name__ == "__main__":
    unittest.main(verbosity=2)
