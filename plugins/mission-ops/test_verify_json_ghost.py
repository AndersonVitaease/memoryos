"""PLUGIN-PROD-01 §5 — <id>.verify.json (relatório DELIVER-VERIFY) não é missão.

O relatório vive em mission-state/ e carrega "missionId" → passava no _is_ledger e
aparecia como registro fantasma (duplicando a missão real). Regra: ledger é sempre
<missionId>.json (save_ledger); relatório de verify é ignorado em silêncio (não é
"skipped"/inválido). full=true continua com todos os ledgers reais, byte a byte.
"""
from __future__ import annotations

import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_mission_ops import PKG, TempState, mc  # noqa: E402
from test_mission_list_compacto import PANES, _Patched, herdr, seed, tools  # noqa: E402

REPORT = {"missionId": "", "source": "verify.json", "verdict": "PASS", "llm_calls": 0,
          "checks": [], "ts": "2026-09-28T11:00:00Z", "durationMs": 12}


def ghost(state, mission_id):
    (state / f"{mission_id}.verify.json").write_text(
        json.dumps(dict(REPORT, missionId=mission_id)), encoding="utf-8")


class TestVerifyJsonGhost(unittest.TestCase):
    def test_report_not_listed_nor_skipped(self):
        with TempState() as ts:
            mc.save_ledger({"missionId": "m1", "status": "closed"})
            ghost(ts.state, "m1")
            ghost(ts.state, "orphan-01")  # relatório sem ledger correspondente
            ledgers, skipped = mc.list_ledgers_report()
            self.assertEqual([l["missionId"] for l in ledgers], ["m1"])
            self.assertEqual(skipped, [])
            self.assertEqual(mc.load_ledger("m1")["status"], "closed")
            self.assertTrue((ts.state / "m1.verify.json").exists())  # intocado

    def test_mission_id_with_dot_verify_is_still_a_ledger(self):
        with TempState():
            mc.save_ledger({"missionId": "x.verify", "status": "dispatched"})
            self.assertEqual([l["missionId"] for l in mc.list_ledgers_report()[0]],
                             ["x.verify"])

    def test_full_true_intact_with_reports(self):
        with TempState() as ts:
            seed()
            with _Patched(herdr(PANES)):
                before_list = tools()["mission_list"][1]({"full": True})
            before_status = tools()["mission_status"][1]({"full": True})
            for mid in ("old-000", "live-0", "rec-1", "orphan-01"):
                ghost(ts.state, mid)
            with _Patched(herdr(PANES)):
                self.assertEqual(tools()["mission_list"][1]({"full": True}), before_list)
            self.assertEqual(tools()["mission_status"][1]({"full": True}), before_status)
            j = json.loads(tools()["mission_status"][1]({"full": True}))
            ids = [m["missionId"] for m in j["missions"]]
            self.assertEqual(len(ids), 105)
            self.assertEqual(len(ids), len(set(ids)))

    def test_compact_total_ignores_reports(self):
        with TempState() as ts:
            seed()
            ghost(ts.state, "live-0")
            with _Patched(herdr(PANES)):
                j = json.loads(tools()["mission_list"][1]({}))
            self.assertEqual(j["total"], 105)
            j = json.loads(PKG.handle_mission_status({"compact": True}))
            self.assertEqual(j["total"], 105)


if __name__ == "__main__":
    unittest.main()
