"""LEDGER-HYGIENE-01 — 1 linha por missão real; cópias/relatórios viram histórico.

Regra: ledger é SEMPRE <missionId>.json (único path que save_ledger grava e load_ledger
lê). Qualquer outro .json que carregue "missionId" (<id>.verify.json, <id>.bak.json,
cópia manual com outro nome) é histórico daquela missão: não conta, não duplica, não é
"skipped", fica intocado no disco e é consultável por mc.ledger_history().
"""
from __future__ import annotations

import collections
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_mission_ops import PKG, TempState, mc  # noqa: E402
from test_mission_list_compacto import PANES, _Patched, herdr, seed, tools  # noqa: E402


def stray(state, name, mission_id, **extra):
    (state / name).write_text(json.dumps(dict({"missionId": mission_id}, **extra)),
                              encoding="utf-8")


class TestLedgerHygiene(unittest.TestCase):
    def test_affine_copies_do_not_duplicate(self):
        with TempState() as ts:
            mc.save_ledger({"missionId": "m1", "status": "closed", "paneId": "w1:p1"})
            stray(ts.state, "m1.bak.json", "m1", status="dispatched")
            stray(ts.state, "m1-copy.json", "m1")
            stray(ts.state, "m1.verify.json", "m1", verdict="PASS")
            ledgers, skipped = mc.list_ledgers_report()
            self.assertEqual([(l["missionId"], l["status"]) for l in ledgers], [("m1", "closed")])
            self.assertEqual(skipped, [])

    def test_history_keeps_non_canonical_files(self):
        with TempState() as ts:
            mc.save_ledger({"missionId": "m1", "status": "closed"})
            stray(ts.state, "m1.verify.json", "m1")
            stray(ts.state, "m1.bak.json", "m1")
            stray(ts.state, "gone-01.verify.json", "gone-01")  # sem ledger vigente
            self.assertEqual(mc.ledger_history(), {
                "gone-01": ["gone-01.verify.json"],
                "m1": ["m1.bak.json", "m1.verify.json"]})
            for n in ("m1.verify.json", "m1.bak.json", "gone-01.verify.json"):
                self.assertTrue((ts.state / n).exists())  # arquivado, não apagado
            self.assertEqual(mc.load_ledger("m1")["status"], "closed")

    def test_one_line_per_mission_in_views(self):
        with TempState() as ts:
            seed()
            for mid in ("old-000", "live-0", "rec-1"):
                stray(ts.state, f"{mid}.verify.json", mid, verdict="PASS")
                stray(ts.state, f"{mid}.bak.json", mid, status="?")
            j = json.loads(tools()["mission_status"][1]({"full": True}))
            ids = [m["missionId"] for m in j["missions"]]
            self.assertEqual(len(ids), 105)
            self.assertEqual(collections.Counter(ids).most_common(1)[0][1], 1)
            with _Patched(herdr(PANES)):
                raw = tools()["mission_list"][1]({})
            self.assertLessEqual(len(raw.encode()), 2048)
            self.assertEqual(json.loads(raw)["total"], 105)
            self.assertEqual(json.loads(PKG.handle_mission_status({"compact": True}))["total"], 105)

    def test_full_true_byte_identical_minus_ghosts(self):
        with TempState() as ts:
            seed()
            with _Patched(herdr(PANES)):
                before_list = tools()["mission_list"][1]({"full": True})
            before_status = tools()["mission_status"][1]({"full": True})
            for mid in ("old-000", "live-0", "rec-1", "orphan-01"):
                stray(ts.state, f"{mid}.verify.json", mid)
                stray(ts.state, f"{mid}.bak.json", mid)
            with _Patched(herdr(PANES)):
                self.assertEqual(tools()["mission_list"][1]({"full": True}), before_list)
            self.assertEqual(tools()["mission_status"][1]({"full": True}), before_status)


if __name__ == "__main__":
    unittest.main()
