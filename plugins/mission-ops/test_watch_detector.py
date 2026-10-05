"""WATCH-DETECTOR-FIX-01 — needs_supervisor sem falso positivo (red→green por caso).

  FP1  snapshot NÃO flagga missão `closed` (judge-deploy-01, 28/09: flag 14:33 pós-close)
  FP2  last_content_line (gpu-watchdog) descarta linhas separadoras ─/━/═
  FP3  turn_done + relatório final em disco + verify.json no cwd = aguardando close
  FP4  evento mais antigo que a última intervenção do supervisor = `stale`, não "AGORA"

Run: python3 test_watch_detector.py
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
import time
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_mission_ops import (PKG, TempState, fake_herdr, out_result, pane_entry,  # noqa: E402
                              panes_ok, procinfo)

mc = PKG.mc

WATCHDOG_PY = os.environ.get("GPU_WATCHDOG_PY", "/opt/gpu-watchdog/watchdog.py")


def _load_watchdog():
    spec = importlib.util.spec_from_file_location("gpu_watchdog_under_test", WATCHDOG_PY)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _footer(epoch: float) -> str:
    """Rodapé real de fim de turno do claude: '· done 4:32 PM' (hora local)."""
    return "· done " + time.strftime("%I:%M %p", time.localtime(epoch)).lstrip("0")


def _snapshot(mid="m1", pane="w1:pZ", text=""):
    return {
        "pane list": panes_ok([pane_entry(pane)]),
        f"pane read {pane} --source recent-unwrapped --lines 40": out_result(text),
        f"pane process-info --pane {pane}": procinfo("claude"),
    }


def _events(mid):
    try:
        with open(mc.STATE_DIR / "events.jsonl", encoding="utf-8") as f:
            return [json.loads(l) for l in f if l.strip() and json.loads(l)["missionId"] == mid]
    except OSError:
        return []


class TestFP1ClosedNeverFlagged(unittest.TestCase):
    def test_closed_single_watch_no_needs_supervisor(self):
        with TempState() as ts:
            mc.save_ledger({"missionId": "m1", "status": "closed", "paneId": "w1:pZ",
                            "promptFile": ts.prompt_file(), "closedAt": mc._now()})
            text = "recap final\n" + _footer(time.time())
            with mock.patch.object(mc, "run_herdr", fake_herdr(_snapshot(text=text))):
                res = json.loads(PKG.handle_mission_watch({"missionId": "m1", "snapshot": "true"}))
            self.assertNotEqual(res.get("note"), "needs_supervisor")
            self.assertEqual(res.get("verdict"), "closed")
            self.assertEqual(mc.load_ledger("m1")["status"], "closed")
            self.assertEqual(_events("m1"), [])  # snapshot de missão fechada não escreve evento

    def test_closed_between_list_and_read_all_mode(self):
        """Corrida real: mission_close grava closed DEPOIS do list_ledgers do snapshot."""
        with TempState() as ts:
            mc.save_ledger({"missionId": "m1", "status": "dispatched", "paneId": "w1:pZ",
                            "promptFile": ts.prompt_file()})
            stale_view = [mc.load_ledger("m1")]
            closed = dict(stale_view[0], status="closed", closedAt=mc._now())
            mc.save_ledger(closed)
            text = "ok\n" + _footer(time.time())
            with mock.patch.object(mc, "list_ledgers", return_value=stale_view), \
                    mock.patch.object(mc, "run_herdr", fake_herdr(_snapshot(text=text))), \
                    mock.patch.object(PKG.nf, "run_probes", return_value=[]):
                res = json.loads(PKG.handle_mission_watch({"all": "true"}))
            m = res["missions"][0]
            self.assertNotEqual(m.get("note"), "needs_supervisor")
            self.assertEqual(m.get("verdict"), "closed")


class TestFP2SeparatorLines(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.W = _load_watchdog()

    def test_separators_skipped(self):
        W = self.W
        for sep in ("─" * 40, "━" * 40, "═" * 40, "  ────  ────  "):
            txt = f"Missão concluída; relatório em disco.\n{sep}\n❯ \n{sep}\n? for shortcuts"
            self.assertEqual(W.last_content_line(txt), "Missão concluída; relatório em disco.",
                             repr(sep))

    def test_only_separators_is_empty(self):
        self.assertEqual(self.W.last_content_line("──────\n━━━━\n════"), "")

    def test_text_with_rule_chars_kept(self):
        self.assertEqual(self.W.last_content_line("fase ─ 2 ok\n──────"), "fase ─ 2 ok")


class TestFP3TurnDoneConcluded(unittest.TestCase):
    def _setup(self, ts, report=True, verify=True):
        cwd = Path(ts.tmp) / "cwd"
        cwd.mkdir(parents=True, exist_ok=True)
        if report:
            (cwd / "RELATORIO-m1.md").write_text("# relatório final\n", encoding="utf-8")
        if verify:
            (cwd / "verify.json").write_text('{"file": []}', encoding="utf-8")
        mc.save_ledger({"missionId": "m1", "status": "dispatched", "paneId": "w1:pZ",
                        "promptFile": ts.prompt_file(), "cwd": str(cwd)})

    def _watch(self):
        text = "tudo verde\n" + _footer(time.time())
        with mock.patch.object(mc, "run_herdr", fake_herdr(_snapshot(text=text))):
            return json.loads(PKG.handle_mission_watch({"missionId": "m1", "snapshot": "true"}))

    def test_turn_done_report_verify_is_awaiting_close(self):
        with TempState() as ts:
            self._setup(ts)
            res = self._watch()
            self.assertEqual(res["event"], "turn_done")
            self.assertEqual(res.get("verdict"), "awaiting_close")
            self.assertNotEqual(res.get("note"), "needs_supervisor")
            self.assertEqual(mc.load_ledger("m1")["status"], "dispatched")  # não fecha sozinho

    def test_turn_done_without_verify_still_needs_supervisor(self):
        with TempState() as ts:
            self._setup(ts, verify=False)
            res = self._watch()
            self.assertEqual(res.get("verdict"), "needs_supervisor")

    def test_turn_done_without_report_still_needs_supervisor(self):
        with TempState() as ts:
            self._setup(ts, report=False)
            res = self._watch()
            self.assertEqual(res.get("verdict"), "needs_supervisor")


class TestFP4StaleSnapshot(unittest.TestCase):
    def _run(self, ts, turn_epoch, nudge_epoch):
        mc.save_ledger({"missionId": "m1", "status": "dispatched", "paneId": "w1:pZ",
                        "promptFile": ts.prompt_file(), "cwd": ts.tmp})
        if nudge_epoch is not None:
            mc._save_nudges({"m1": {"ts": nudge_epoch, "at": mc._now(),
                                    "sender": "supervisor:hermes"}})
        text = "parei aqui\n" + _footer(turn_epoch)
        with mock.patch.object(mc, "run_herdr", fake_herdr(_snapshot(text=text))):
            return json.loads(PKG.handle_mission_watch({"missionId": "m1", "snapshot": "true"}))

    def test_event_older_than_intervention_is_stale(self):
        with TempState() as ts:
            now = time.time()
            res = self._run(ts, turn_epoch=now - 600, nudge_epoch=now - 120)
            self.assertEqual(res["event"], "turn_done")
            self.assertEqual(res.get("verdict"), "stale")
            self.assertNotEqual(res.get("note"), "needs_supervisor")

    def test_event_after_intervention_needs_supervisor(self):
        with TempState() as ts:
            now = time.time()
            res = self._run(ts, turn_epoch=now, nudge_epoch=now - 600)
            self.assertEqual(res.get("verdict"), "needs_supervisor")

    def test_same_minute_is_not_stale(self):
        """Rodapé tem granularidade de minuto: turno no MESMO minuto do nudge não é stale."""
        with TempState() as ts:
            now = time.time()
            res = self._run(ts, turn_epoch=now, nudge_epoch=now)
            self.assertEqual(res.get("verdict"), "needs_supervisor")

    def test_no_intervention_needs_supervisor(self):
        with TempState() as ts:
            res = self._run(ts, turn_epoch=time.time() - 600, nudge_epoch=None)
            self.assertEqual(res.get("verdict"), "needs_supervisor")


if __name__ == "__main__":
    unittest.main()
