"""mission_resume.py — suíte própria (DISPATCH-FAST-03: consertada).

Antes: `from .mission_resume import ...` não importava no discover (sem pacote) e os 3
testes eram contraditórios (mesma entrada esperando MISSION_TERMINAL, PANE_NOT_FOUND e
no_op). O módulo é um STUB não-wirado a nenhum handler: usa load_ledger/pane_list/
read_output como globais sem importá-los. Aqui eles são injetados por teste, e cada
caminho implementado do stub é exercitado com entrada própria.
"""
import unittest
from unittest import mock

from test_mission_ops import PKG  # noqa: F401  carrega o plugin como pacote (mission_ops.*)
import importlib

mr = importlib.import_module("mission_ops.mission_resume")


def _run(ledger, panes, output=""):
    with mock.patch.object(mr, "load_ledger", create=True, return_value=ledger), \
         mock.patch.object(mr, "pane_list", create=True, return_value=panes), \
         mock.patch.object(mr, "read_output", create=True, return_value=output):
        return mr.mission_resume("m1", force=False)


PANE = {"id": "w1:pZ", "title": "MISSION:m1", "state": "idle"}


class TestMissionResume(unittest.TestCase):
    def test_terminal_state_refused(self):
        for st in ("closed", "failed", "cancelled", "delivered"):
            res = _run({"status": st}, [PANE])
            self.assertEqual(res["error"], "MISSION_TERMINAL", st)
            self.assertFalse(res["ok"])

    def test_pane_not_found(self):
        res = _run({"status": "dispatched"}, [{"id": "w1:pX", "title": "outra", "state": "idle"}])
        self.assertEqual(res, {"ok": False, "error": "PANE_NOT_FOUND",
                               "detail": "Target pane not found."})

    def test_claude_working_is_no_op(self):
        res = _run({"status": "dispatched"}, [PANE], output="claude working ...")
        self.assertEqual(res["action"], "no_op")
        self.assertTrue(res["ok"])

    def test_stub_not_wired_to_plugin_handlers(self):
        """Guarda do estado real: nenhum handler do plugin chama o stub (mr.*)."""
        import os, re
        src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "__init__.py"),
                   encoding="utf-8").read()
        self.assertIsNone(re.search(r"\bmr\.\w+\(", src))


if __name__ == "__main__":
    unittest.main()
