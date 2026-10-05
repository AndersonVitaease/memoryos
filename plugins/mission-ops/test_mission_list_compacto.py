"""MISSION-LIST-COMPACTO-01 — default compacto na TOOL (chat) de mission_list/mission_status.

(a) tool sem flags: 1 linha por missão ativa + resumo das encerradas, ≤2KB com 4 ativas.
(b) full=true na tool == resposta atual (handler direto sem flags), byte a byte.
    compact=true (watchdog-lane2) intacto; chamada Python direta (fast-router) segue full.
Liveness honesta: pane ausente = MORTA só com pane list OK; herdr falhou = '?'.
"""
from __future__ import annotations

import json
import os
import sys
import unittest
import unittest.mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_mission_ops import PKG, TempState, mc  # noqa: E402  (carrega o pacote real)


def tools():
    seen = {}

    class Ctx:
        def register_tool(self, name, toolset, schema, handler, *a, **k):
            seen[name] = (schema, handler)
    # RD-TESTBASE-01: register(ctx) é o ÚNICO caminho que marca o processo como
    # canal do supervisor (sg.mark_gateway_booted — global PERMANENTE). Chamado por
    # um fixture com Ctx falso, vaza a marca: todo close no mesmo processo passa a
    # exigir operatorOrder (SUPERVISOR_ACTION_NEEDS_ORDER) e o T2 do proof-lint03
    # quebrava com KeyError 'steps' quando rodava DEPOIS de qualquer teste que usa
    # author_tool. Restaurar a marca = o processo segue no canal "direct" (padrão
    # save/addCleanup já usado em test_mission_ops.TestGuardianMobile01.setUp).
    _booted_saved = PKG.sg._GATEWAY_BOOTED
    PKG.register(Ctx())
    PKG.sg._GATEWAY_BOOTED = _booted_saved
    return seen


def seed(n_closed=100, n_active=4):
    for i in range(n_closed):
        mc.save_ledger({"missionId": f"old-{i:03d}", "status": "closed", "paneId": f"w1:p{i}",
                        "promptFile": f"/opt/memoryos/eng-mcp/missao-old-{i:03d}.md",
                        "cwd": f"/opt/old-{i}", "resumeSessionId": "x" * 36,
                        "updatedAt": "2026-09-27T10:%02d:00Z" % (i % 60), "tabId": f"w1:t{i}",
                        "creation": "tab", "consequence": False})
    for i in range(n_active):
        mc.save_ledger({"missionId": f"live-{i}", "status": "dispatched", "paneId": f"w1:pL{i}",
                        "tabId": f"w1:tL{i}", "creation": "tab",
                        "promptFile": f"/opt/memoryos/eng-mcp/missao-live-{i}.md",
                        "cwd": f"/opt/live-{i}", "resumeSessionId": None,
                        "consequence": i == 0, "updatedAt": "2026-09-28T11:00:00Z"})
        mc.append_event(f"live-{i}", f"w1:pL{i}", "turn_done", detail="x" * 300)
    mc.save_ledger({"missionId": "rec-1", "status": "needs_recovery", "paneId": "w1:pR",
                    "promptFile": "/x/missao-rec-1.md", "cwd": "/opt/rec"})


def herdr(panes, perr=None):
    return [unittest.mock.patch.object(mc, "tab_list", return_value=([], None)),
            unittest.mock.patch.object(mc, "pane_list", return_value=(panes, perr))]


class _Patched:
    def __init__(self, patches):
        self.p = patches

    def __enter__(self):
        for p in self.p:
            p.start()

    def __exit__(self, *a):
        for p in self.p:
            p.stop()


PANES = [{"pane_id": f"w1:pL{i}", "agent_status": "working" if i == 1 else "idle",
          "cwd": f"/opt/live-{i}"} for i in range(4)]  # rec-1 (w1:pR) sem pane


class TestChatDefault(unittest.TestCase):
    def test_list_tool_default_compact_small(self):
        with TempState():
            seed()
            with _Patched(herdr(PANES)):
                out = tools()["mission_list"][1]({})
        j = json.loads(out)
        self.assertEqual(j["view"], "compact")
        self.assertLessEqual(len(out.encode()), 2048)
        self.assertEqual(j["total"], 105)
        self.assertEqual(j["closed"]["count"], 100)
        self.assertEqual(len(j["closed"]["last"]), PKG.CLOSED_LAST_N)
        lines = {l.split(" | ")[0]: l for l in j["active"]}
        self.assertEqual(sorted(lines), ["live-0", "live-1", "live-2", "live-3", "rec-1"])
        self.assertIn("turn_done há", lines["live-0"])
        self.assertIn("pane viva/idle", lines["live-0"])
        self.assertIn("close exige verify", lines["live-0"])
        self.assertIn("pane viva/working", lines["live-1"])
        self.assertIn("pend: -", lines["live-2"])
        self.assertIn("pane MORTA", lines["rec-1"])
        self.assertIn("recover", lines["rec-1"])
        self.assertIn("sem evento", lines["rec-1"])

    def test_list_herdr_failure_is_unknown_not_dead(self):
        with TempState():
            seed(5)
            with _Patched(herdr([], "herdr down")):
                j = json.loads(tools()["mission_list"][1]({}))
        self.assertTrue(all("pane ?" in l for l in j["active"]), j["active"])
        self.assertFalse(any("MORTA" in l for l in j["active"]))
        self.assertTrue(any("herdr down" in w for w in j["warnings"]))

    def test_status_tool_default_compact_small(self):
        with TempState():
            seed()
            out = tools()["mission_status"][1]({})
        j = json.loads(out)
        self.assertEqual(j["view"], "compact")
        self.assertLessEqual(len(out.encode()), 2048)
        self.assertEqual(len(j["active"]), 5)
        self.assertNotIn("pane", j["active"][0])  # status não consulta herdr

    def test_status_tool_single_mission_is_full_record(self):
        with TempState():
            seed(3)
            j = json.loads(tools()["mission_status"][1]({"missionId": "live-0"}))
        self.assertEqual(j["missions"][0]["promptFile"], "/opt/memoryos/eng-mcp/missao-live-0.md")


class TestFullIdentical(unittest.TestCase):
    def test_list_full_true_equals_current(self):
        with TempState():
            seed()
            with _Patched(herdr(PANES)):
                before = PKG.handle_mission_list({})
                for v in (True, "true"):
                    self.assertEqual(tools()["mission_list"][1]({"full": v}), before)

    def test_status_full_true_equals_current(self):
        with TempState():
            seed()
            before = PKG.handle_mission_status({})
            for v in (True, "true"):
                self.assertEqual(tools()["mission_status"][1]({"full": v}), before)

    def test_direct_python_call_stays_full(self):
        # fast-router chama handle_mission_list({}) / handle_mission_status({}) direto.
        with TempState():
            seed(3)
            with _Patched(herdr(PANES)):
                jl = json.loads(PKG.handle_mission_list({}))
            js = json.loads(PKG.handle_mission_status({}))
        self.assertIn("panesTotal", jl)
        self.assertEqual(len(jl["missions"]), 8)
        self.assertEqual(len(js["missions"]), 8)

    def test_compact_true_keeps_watchdog_format(self):
        with TempState():
            seed(3)
            j = json.loads(tools()["mission_status"][1]({"compact": True}))
        self.assertTrue(j["compact"])
        self.assertIn("missions", j)

    def test_full_beats_compact(self):
        with TempState():
            seed(3)
            j = json.loads(tools()["mission_status"][1]({"full": True, "compact": True}))
        self.assertNotIn("compact", j)

    def test_schema_exposes_full(self):
        for t in ("mission_status", "mission_list"):
            props = tools()[t][0]["parameters"]["properties"]
            self.assertEqual(props["full"]["type"], "boolean")
            self.assertEqual(props["compact"]["type"], "boolean")


if __name__ == "__main__":
    unittest.main()
