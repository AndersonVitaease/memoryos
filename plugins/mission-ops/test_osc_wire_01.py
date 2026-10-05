#!/usr/bin/env python3
"""RD-OSC-WIRE-01 — wiring do osc_guard no launch/detecção do mission-ops.

Cobre os 2 difs da seção 5 do relatório RD-HERDR-OSC-01:
  D1: recipes.claude_launch_cmd lança o claude atrás do osc_guard (filtro pty
      anti-injeção OSC), preservando cd e --resume.
  D2: mission_core.foreground_agent_name classifica o carrier do guard
      (python3 + osc_guard.py no cmdline) como 'claude' — o guard reporta o
      ciclo de vida via pane report-agent; sem o dif, o worker guardado seria
      lido como 'python3' (falso shell_fallback / agent unknown).

Uso: python3 test_osc_wire_01.py
"""
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import mission_core as mc  # noqa: E402
import recipes as rec  # noqa: E402


def _payload(procs):
    """Payload no formato REAL do herdr (result aninhado — ver fix 25/09)."""
    return {"ok": True, "data": {"id": "cli:pane:process-info",
                                 "result": {"foreground_processes": procs}}}


class TestLaunchCmdGuard(unittest.TestCase):
    """D1: launch do worker sempre atrás do guard."""

    def test_launch_cmd_emite_guard(self):
        cmd = rec.claude_launch_cmd("/opt/mission-supervisor", None)
        self.assertIn("osc_guard.py", cmd)
        self.assertIn("OSC_GUARD_PANE=${HERDR_PANE_ID:-unknown}", cmd)
        self.assertIn("cd /opt/mission-supervisor && ", cmd)
        self.assertTrue(cmd.endswith("claude"))

    def test_launch_cmd_preserva_resume(self):
        cmd = rec.claude_launch_cmd("/tmp-missao", "sess-42")
        self.assertIn("--resume sess-42", cmd)
        self.assertIn("osc_guard.py", cmd)
        self.assertIn("cd /tmp-missao && ", cmd)


class TestForegroundAgentGuard(unittest.TestCase):
    """D2: carrier do guard = claude protegido."""

    def _agent(self, procs):
        with mock.patch.object(mc, "run_herdr", return_value=_payload(procs)):
            return mc.foreground_agent_name("w0:p1")

    def test_guard_carrier_classificado_como_claude(self):
        procs = [{"name": "python3",
                  "cmdline": "python3 /opt/mission-supervisor/osc_guard.py claude"}]
        self.assertEqual(self._agent(procs), ("claude", None))

    def test_python3_sem_guard_continua_python3(self):
        procs = [{"name": "python3", "cmdline": "python3 -m http.server"}]
        self.assertEqual(self._agent(procs), ("python3", None))

    def test_claude_direto_inalterado(self):
        procs = [{"name": "claude", "cmdline": "claude --resume x"}]
        self.assertEqual(self._agent(procs), ("claude", None))

    def test_shell_vazio_continua_none(self):
        self.assertEqual(self._agent([]), (None, None))


if __name__ == "__main__":
    unittest.main(verbosity=2)