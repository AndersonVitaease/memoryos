"""SNAPSHOT-FAST-01: mission_snapshot — estado verdadeiro da missão em 1 chamada (zero LLM).

- fragment com typo ("watchhdog") casa a missão certa (difflib ratio >= 0.8);
- paneId obsoleto + aba MISSION:<id> viva -> ledger re-sincronizado (caso real
  watchdog02-detectores-02, w6:p9 -> w6:p8) + evento no ledger;
- paneId obsoleto SEM aba -> fantasma cancelado (padrão _batch_cancel_ghost);
- sem argumento -> todas as ativas com verdict; missão fechada -> ok;
- herdr indisponível -> DESCONHECIDO (nunca adivinha, não toca ledger).
"""
import json
import os
import unittest
from unittest import mock

from test_mission_ops import PKG  # noqa: F401  (guard vast_sandbox via test_mission_ops)
import test_mission_ops as T

PKG, mc = T.PKG, T.mc

WD = "watchdog02-detectores-02"


def _tabs(*entries):
    return {"id": "cli", "result": {"tabs": [
        {"tab_id": t, "label": lbl, "workspace_id": "w6"} for t, lbl in entries]}}


def _panes(*entries):
    return {"id": "cli", "result": {"panes": [
        {"pane_id": p, "tab_id": t, "cwd": cwd, "agent": agent,
         "agent_status": st, "workspace_id": "w6"} for p, t, cwd, agent, st in entries]}}


def _led(mid, status="dispatched", pane="w6:p9", tab="w6:t8", cwd="/opt/gpu-watchdog"):
    led = {"missionId": mid, "status": status, "paneId": pane, "tabId": tab,
           "cwd": cwd, "createdAt": "2026-09-29T11:45:55Z", "updatedAt": "2026-09-29T11:57:58Z"}
    mc.save_ledger(led)
    return led


def _events(ts):
    p = ts.state / "events.jsonl"
    return [json.loads(l) for l in p.read_text().splitlines()] if p.exists() else []


class TestMissionSnapshot(unittest.TestCase):
    def setUp(self):
        self._env = mock.patch.dict(os.environ, {"HERDR_PANE_ID": ""})
        self._env.start()

    def tearDown(self):
        self._env.stop()

    def _snap(self, args, tabs, panes):
        calls = []
        script = {"tab list": tabs, "pane list": panes}
        real = T.fake_herdr(script)

        def _run(a, timeout_s=10.0):
            calls.append(" ".join(a))
            return real(a, timeout_s)
        with mock.patch.object(mc, "run_herdr", _run):
            res = json.loads(PKG.handle_mission_snapshot(args))
        return res, calls

    def test_fragment_typo_matches_right_mission(self):
        with T.TempState():
            _led(WD, pane="w6:p8")
            _led("snapshot-fast-01", pane="w6:pN", tab="w6:tH")
            _led("gpu-cost-fix-01", status="closed")
            res, _ = self._snap({"fragment": "watchhdog"},
                                _tabs(("w6:t8", f"MISSION:{WD}")),
                                _panes(("w6:p8", "w6:t8", "/opt/gpu-watchdog", "claude", "working")))
            self.assertTrue(res["ok"], res)
            self.assertEqual([m["missionId"] for m in res["missions"]], [WD])
            self.assertGreaterEqual(res["missions"][0]["match"]["score"], 0.8)
            self.assertEqual(res["missions"][0]["verdict"], "OK")

    def test_fragment_ranks_active_then_most_recent(self):
        with T.TempState():
            for mid, st, up in (("watchdog-02", "closed", "2026-09-26T23:22:23Z"),
                                ("watchdog02-detectores-01", "closed", "2026-09-29T02:14:01Z"),
                                ("watchdog-lane2-01", "closed", "2026-09-28T10:08:45Z")):
                mc.save_ledger({"missionId": mid, "status": st, "updatedAt": up})
            res, _ = self._snap({"fragment": "watchhdog"}, _tabs(), _panes())
            self.assertEqual([m["missionId"] for m in res["missions"]],
                             ["watchdog02-detectores-01", "watchdog-lane2-01", "watchdog-02"])
            _led(WD, pane="w6:p8", tab="w6:t8")
            res, _ = self._snap({"fragment": "watchhdog"},
                                _tabs(("w6:t8", f"MISSION:{WD}")),
                                _panes(("w6:p8", "w6:t8", "/opt/gpu-watchdog", "claude", "working")))
            self.assertEqual(res["missions"][0]["missionId"], WD)

    def test_stale_paneid_with_real_tab_is_resynced(self):
        # caso real 29/09: restart do gateway renumerou w6:p9 -> w6:p8 (aba MISSION:<id> viva)
        with T.TempState() as ts:
            _led(WD, pane="w6:p9", tab="w6:t9")
            res, calls = self._snap({"missionId": WD},
                                    _tabs(("w6:t1", "1"), ("w6:t8", f"MISSION:{WD}")),
                                    _panes(("w6:p1", "w6:t1", "/root", None, "unknown"),
                                           ("w6:p8", "w6:t8", "/opt/gpu-watchdog", "claude", "working")))
            m = res["missions"][0]
            self.assertEqual(m["verdict"], "PANEID_OBSOLETO", m)
            self.assertEqual(m["remedy"]["applied"], True)
            self.assertEqual(res["fixed"], [WD])
            self.assertEqual(res["ghosts"], [])
            led = mc.load_ledger(WD)
            self.assertEqual((led["paneId"], led["tabId"]), ("w6:p8", "w6:t8"))
            self.assertEqual(led["status"], "dispatched")
            self.assertEqual(led["paneResync"]["from"], {"paneId": "w6:p9", "tabId": "w6:t9"})
            ev = [e for e in _events(ts) if e["event"] == "snapshot_pane_resync"]
            self.assertEqual(len(ev), 1)
            self.assertIn("w6:p9", ev[0]["detail"])
            # 1 chamada = 1 tab list + 1 pane list, nada que escreva no pane
            self.assertEqual(sorted(calls), ["pane list", "tab list"])

    def test_stale_paneid_without_tab_is_ghost_cancelled(self):
        with T.TempState() as ts:
            _led(WD, pane="w6:p9", tab="w6:t9")
            res, calls = self._snap({"missionId": WD},
                                    _tabs(("w6:t1", "1")),
                                    _panes(("w6:p1", "w6:t1", "/root", None, "unknown")))
            m = res["missions"][0]
            self.assertEqual(m["verdict"], "FANTASMA", m)
            self.assertEqual(res["ghosts"], [WD])
            led = mc.load_ledger(WD)
            self.assertEqual(led["status"], "cancelled")
            self.assertEqual(led["cancelledBy"], "mission_snapshot")
            self.assertEqual(led["previousStatus"], "dispatched")
            self.assertIn("mission_snapshot anti-fantasma", led["cancelReason"])
            self.assertTrue(any(e["event"] == "snapshot_ghost_cancelled" for e in _events(ts)))
            self.assertFalse(any(c.startswith(("tab close", "pane ")) and c != "pane list"
                                 for c in calls), calls)

    def test_no_args_lists_all_active_with_verdict(self):
        with T.TempState():
            _led("m-ok", pane="w6:pA", tab="w6:tA")
            _led("m-int", status="interrupted", pane="w6:pB", tab="w6:tB")
            _led("m-ghost", pane="w6:pX", tab="w6:tX")
            _led("m-closed", status="closed", pane="w6:pZ", tab="w6:tZ")
            res, _ = self._snap({},
                                _tabs(("w6:tA", "MISSION:m-ok"), ("w6:tB", "MISSION:m-int")),
                                _panes(("w6:pA", "w6:tA", "/x", "claude", "working"),
                                       ("w6:pB", "w6:tB", "/x", "claude", "idle")))
            by = {m["missionId"]: m for m in res["missions"]}
            self.assertEqual(set(by), {"m-ok", "m-int", "m-ghost"})
            self.assertEqual(by["m-ok"]["verdict"], "OK")
            self.assertTrue(by["m-ok"]["pane"]["exists"])
            self.assertEqual(by["m-ok"]["pane"]["agent_status"], "working")
            self.assertEqual(by["m-int"]["verdict"], "INTERROMPIDA")
            self.assertIn("mission_recover", by["m-int"]["remedy"]["suggested"])
            self.assertEqual(by["m-ghost"]["verdict"], "FANTASMA")
            self.assertEqual(res["summary"]["ok"], ["m-ok"])
            self.assertEqual(res["summary"]["ghosts"], ["m-ghost"])
            self.assertEqual(res["ghosts"], ["m-ghost"])

    def test_closed_mission_is_ok_without_touching_ledger(self):
        with T.TempState():
            led = _led(WD, status="closed", pane="w6:p9")
            res, _ = self._snap({"missionId": WD}, _tabs(), _panes())
            m = res["missions"][0]
            self.assertEqual(m["verdict"], "OK")
            self.assertEqual(m["status"], "closed")
            self.assertEqual(mc.load_ledger(WD), led)

    def test_herdr_down_is_unknown_and_never_guesses(self):
        with T.TempState():
            led = _led(WD, pane="w6:p9")
            res, _ = self._snap({"missionId": WD},
                                {"ok": False, "error": "herdr down"},
                                {"ok": False, "error": "herdr down"})
            m = res["missions"][0]
            self.assertEqual(m["verdict"], "DESCONHECIDO")
            self.assertEqual(res["fixed"] + res["ghosts"], [])
            self.assertEqual(mc.load_ledger(WD), led)
            self.assertTrue(res["warnings"])

    def test_pane_alive_but_shell_is_interrupted(self):
        with T.TempState():
            _led(WD, pane="w6:p8", tab="w6:t8")
            res, _ = self._snap({"missionId": WD},
                                _tabs(("w6:t8", f"MISSION:{WD}")),
                                _panes(("w6:p8", "w6:t8", "/opt/gpu-watchdog", None, "unknown")))
            m = res["missions"][0]
            self.assertEqual(m["verdict"], "INTERROMPIDA")
            self.assertIn("shell_fallback", m["remedy"]["suggested"])

    def test_duplicate_tabs_reported_not_closed(self):
        with T.TempState():
            _led("snapshot-fast-01", pane="w6:pN", tab="w6:tH")
            res, calls = self._snap({"missionId": "snapshot-fast-01"},
                                    _tabs(("w6:tG", "MISSION:snapshot-fast-01"),
                                          ("w6:tH", "MISSION:snapshot-fast-01")),
                                    _panes(("w6:pM", "w6:tG", "/x", "claude", "idle"),
                                           ("w6:pN", "w6:tH", "/x", "claude", "working")))
            m = res["missions"][0]
            self.assertEqual(m["verdict"], "OK")
            self.assertEqual(m["duplicateTabs"], [{"tabId": "w6:tG", "paneId": "w6:pM"}])
            self.assertNotIn("tab close w6:tG", calls)

    def test_stale_paneid_ambiguous_tabs_only_suggests(self):
        with T.TempState():
            led = _led(WD, pane="w6:p9", tab="w6:t9")
            res, _ = self._snap({"missionId": WD},
                                _tabs(("w6:tA", f"MISSION:{WD}"), ("w6:tB", f"MISSION:{WD}")),
                                _panes(("w6:pA", "w6:tA", "/x", "claude", "idle"),
                                       ("w6:pB", "w6:tB", "/x", "claude", "working")))
            m = res["missions"][0]
            self.assertEqual(m["verdict"], "PANEID_OBSOLETO")
            self.assertFalse(m["remedy"]["applied"])
            self.assertEqual(res["fixed"], [])
            self.assertEqual(mc.load_ledger(WD), led)

    def test_dispatching_young_without_pane_is_left_alone(self):
        with T.TempState():
            led = {"missionId": "m-new", "status": "dispatching", "cwd": "/x",
                   "createdAt": mc._now(), "updatedAt": mc._now()}
            mc.save_ledger(led)
            res, _ = self._snap({"missionId": "m-new"}, _tabs(), _panes())
            m = res["missions"][0]
            self.assertEqual(m["verdict"], "DESPACHANDO")
            self.assertEqual(mc.load_ledger("m-new")["status"], "dispatching")

    def test_unknown_mission_suggests_fuzzy(self):
        with T.TempState():
            _led(WD, status="closed")
            res, _ = self._snap({"missionId": "watchdog02-detectores-2"}, _tabs(), _panes())
            self.assertFalse(res["ok"])
            self.assertEqual(res["error"], "MISSION_NOT_FOUND")
            self.assertIn(WD, res["detail"])

    def test_batch_ghost_pattern_unchanged(self):
        with T.TempState() as ts:
            led = _led("b3", status="interrupted", pane="w1:pDEAD")
            out = PKG._batch_cancel_ghost(led, "interrupted com pane w1:pDEAD morto")
            got = mc.load_ledger("b3")
            self.assertEqual(got["cancelledBy"], "mission_batch")
            self.assertIn("re-despachado no lote", out["reason"])
            self.assertTrue(any(e["event"] == "batch_ghost_cancelled" for e in _events(ts)))


if __name__ == "__main__":
    unittest.main()
