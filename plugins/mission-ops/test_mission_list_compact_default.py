"""MISSION-LIST-COMPACT-DEFAULT-01 — compacto é o DEFAULT da tool; verbosidade total é opt-in.

- tool mission_list/mission_status sem flags -> compacto (<8KB com >=10 missões e >=3 abas vivas).
- full=true OU verbose=true -> resposta completa, byte a byte igual ao handler direto sem flags.
- compact=true (watchdog-lane2) idêntico; verbose/full vencem compact.
- consumidor fast-router (missions_snapshot: handle_mission_list({}, _view_default="chat"))
  estável; chamada Python direta sem _view_default segue full (fast-router formata campos full).
"""
from __future__ import annotations

import json
import os
import sys
import unittest
import unittest.mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_mission_ops import PKG, TempState, mc  # noqa: E402
from test_mission_list_compacto import PANES, _Patched, seed, tools  # noqa: E402

TABS = [{"tab_id": f"w1:tL{i}", "label": f"live-{i}"} for i in range(4)]


def herdr3(panes=PANES, perr=None):
    return [unittest.mock.patch.object(mc, "tab_list", return_value=(TABS, None)),
            unittest.mock.patch.object(mc, "pane_list", return_value=(panes, perr))]


class TestVerboseOptIn(unittest.TestCase):
    def test_list_verbose_equals_full(self):
        with TempState():
            seed()
            with _Patched(herdr3()):
                before = PKG.handle_mission_list({})
                for v in (True, "true", "1"):
                    self.assertEqual(tools()["mission_list"][1]({"verbose": v}), before)

    def test_status_verbose_equals_full(self):
        with TempState():
            seed()
            before = PKG.handle_mission_status({})
            for v in (True, "true"):
                self.assertEqual(tools()["mission_status"][1]({"verbose": v}), before)

    def test_verbose_beats_compact(self):
        with TempState():
            seed(3)
            with _Patched(herdr3()):
                j = json.loads(tools()["mission_list"][1]({"verbose": True, "compact": True}))
        self.assertNotIn("compact", j)
        self.assertIn("panesTotal", j)

    def test_verbose_false_is_default(self):
        with TempState():
            seed(3)
            with _Patched(herdr3()):
                a = tools()["mission_list"][1]({"verbose": False})
                b = tools()["mission_list"][1]({})
        self.assertEqual(json.loads(a)["view"], "compact")
        self.assertEqual(json.loads(a)["active"], json.loads(b)["active"])

    def test_schema_exposes_verbose(self):
        for t in ("mission_status", "mission_list"):
            props = tools()[t][0]["parameters"]["properties"]
            self.assertEqual(props["verbose"]["type"], "boolean")


class TestDefaultSize(unittest.TestCase):
    def test_default_under_8kb_with_10_missions_3_tabs(self):
        with TempState():
            seed(n_closed=100, n_active=4)
            with _Patched(herdr3()):
                default = tools()["mission_list"][1]({})
                full = tools()["mission_list"][1]({"full": True})
        jd, jf = json.loads(default), json.loads(full)
        self.assertGreaterEqual(jd["total"], 10)
        self.assertGreaterEqual(jf["tabsTotal"], 3)
        self.assertEqual(jd["view"], "compact")
        self.assertLess(len(default.encode()), 8 * 1024)
        self.assertGreater(len(full.encode()), 4 * len(default.encode()))


class TestConsumersStable(unittest.TestCase):
    def test_compact_true_identical_tool_vs_handler(self):
        with TempState():
            seed()
            with _Patched(herdr3()):
                self.assertEqual(tools()["mission_list"][1]({"compact": True}),
                                 PKG.handle_mission_list({"compact": True}))
            self.assertEqual(tools()["mission_status"][1]({"compact": "true"}),
                             PKG.handle_mission_status({"compact": "true"}))

    def test_fast_router_chat_snapshot_stable(self):
        # fast-router._chat_list: handle_mission_list({}, _view_default="chat") -> active[] 'a | b | ...'
        with TempState():
            seed()
            with _Patched(herdr3()):
                snap = PKG.handle_mission_list({}, _view_default="chat")
                tool = tools()["mission_list"][1]({})
        self.assertEqual(snap, tool)
        j = json.loads(snap)
        self.assertEqual(set(j) - {"warnings", "skipped", "semStatus"},
                         {"ok", "view", "total", "counts", "active", "closed", "hint"})
        for line in j["active"]:
            parts = line.split(" | ")
            self.assertGreaterEqual(len(parts), 5)
            self.assertTrue(parts[3].startswith("pane "))
            self.assertTrue(parts[-1].startswith("pend: "))

    def test_direct_python_default_stays_full(self):
        with TempState():
            seed(3)
            with _Patched(herdr3()):
                jl = json.loads(PKG.handle_mission_list({}))
            js = json.loads(PKG.handle_mission_status({}))
        self.assertEqual(jl["tabsTotal"], 4)
        self.assertIn("tabLabel", jl["missions"][0])
        self.assertIn("promptFile", js["missions"][0])


if __name__ == "__main__":
    unittest.main()
