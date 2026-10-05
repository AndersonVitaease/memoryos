"""BUS-DELIVERY-GUARD-01 — E2E tests for the anti-resurrection delivery guard.

Covers the contract's three invariants:
1. Lease TTL ~30s: lease refreshed on activity; expired lease = no delivery.
2. Never resurrect: delivery without live lease NEVER injects into the session —
   the event goes to the journal instead.
3. Fallback = journal: journaled events are persisted and replayable.

Run: python3 test_bus_guard.py
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, PLUGIN_DIR)

import vast_sandbox  # noqa: E402  (nenhum teste chama o vastai real)
vast_sandbox.install_guard()


def _load_pkg():
    # REUSE-LOADED (03/10): re-executar __init__.py cria um pacote NOVO e o
    # último exec vence o mc.SPOOL_HOOK (fecha sobre _MISSION_SPOOL do módulo
    # errado) → poluição entre suítes. Reuse o pacote já carregado.
    _pre = sys.modules.get("mission_ops")
    if _pre is not None and hasattr(_pre, "mc"):
        return _pre
    spec = importlib.util.spec_from_file_location(
        "mission_ops", os.path.join(PLUGIN_DIR, "__init__.py"),
        submodule_search_locations=[PLUGIN_DIR])
    pkg = importlib.util.module_from_spec(spec)
    sys.modules["mission_ops"] = pkg
    spec.loader.exec_module(pkg)
    pkg._gpu_up_for_mission = lambda mission_id: True
    pkg._qwen_bridge_alive = lambda timeout=2.0: True
    return pkg


PKG = _load_pkg()
mc = PKG.mc
bg = mc._bus_guard()
# A suíte testa o guard ATIVO (produção liga via env BUS_DELIVERY_GUARD=1).
# BUG de poluição (descoberto na reconciliação 03/10): o set era MÓDULO-LEVEL —
# depois desta suíte, BUS_GUARD_ENABLED ficava True e a suíte do guard (F3) rodava
# com o guard de produção ligado sem journal → entrega recusada. Agora é por-teste.
_SAVED_BUS_GUARD = mc.BUS_GUARD_ENABLED


def setUpModule():
    mc.BUS_GUARD_ENABLED = True


def tearDownModule():
    mc.BUS_GUARD_ENABLED = _SAVED_BUS_GUARD


class TempState:
    """Ledger/events/nudges/journal in tmp dirs (production STATE_DIR untouched)."""

    def __init__(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.path = Path(self._tmp.name)

    def __enter__(self):
        self._old_state = mc.STATE_DIR
        self._old_journal = bg._JOURNAL_PATH
        mc.STATE_DIR = self.path
        bg._JOURNAL_PATH = self.path / "journal.json"
        return self

    def __exit__(self, *a):
        mc.STATE_DIR = self._old_state
        bg._JOURNAL_PATH = self._old_journal
        self._tmp.cleanup()

    def __exit__(self, *a):
        self._tmp.cleanup()


class TestLeaseTTL(unittest.TestCase):
    """Invariant 1: lease TTL ~30s, refreshed on activity."""

    def test_register_then_live(self):
        bg._LEASES.clear()
        bg.register_lease("w1:pA")
        self.assertTrue(bg.has_live_lease("w1:pA"))

    def test_lease_expires(self):
        bg._LEASES.clear()
        bg.register_lease("w1:pB")
        # simulate expiry by rewinding the stored expiry
        bg._LEASES["w1:pB"] = bg._now() - 1.0
        self.assertFalse(bg.has_live_lease("w1:pB"))
        # expired entry is cleaned up on check
        self.assertNotIn("w1:pB", bg._LEASES)

    def test_cleanup_expired(self):
        bg._LEASES.clear()
        bg.register_lease("w1:pC")
        bg._LEASES["w1:pC"] = bg._now() - 1.0
        bg.register_lease("w1:pD")
        bg.cleanup_expired()
        self.assertNotIn("w1:pC", bg._LEASES)
        self.assertIn("w1:pD", bg._LEASES)

    def test_ttl_is_30s(self):
        self.assertEqual(bg._LEASE_TTL, 30.0)


class TestNeverResurrect(unittest.TestCase):
    """Invariant 2: no live lease -> NEVER injects; event goes to journal."""

    def setUp(self):
        bg._LEASES.clear()

    def test_no_lease_journals_not_injects(self):
        injected = []
        with TempState() as ts:
            res = mc.guarded_deliver("m1", "w1:pX", "hello", "test")
            self.assertEqual(res["delivery"], "journaled")
            self.assertTrue(res["ok"])
            self.assertEqual(injected, [])
            journal = json.loads(bg._JOURNAL_PATH.read_text())
            self.assertEqual(len(journal), 1)
            self.assertEqual(journal[0]["paneId"], "w1:pX")
            self.assertEqual(journal[0]["reason"], "no_live_lease")

    def test_expired_lease_journals_not_injects(self):
        bg.register_lease("w1:pY")
        bg._LEASES["w1:pY"] = bg._now() - 1.0  # expired
        with TempState():
            res = mc.guarded_deliver("m1", "w1:pY", "hello", "test")
            self.assertEqual(res["delivery"], "journaled")

    def test_live_lease_injects(self):
        bg.register_lease("w1:pZ")
        calls = []
        with mock.patch.object(mc, "deliver_prompt",
                               return_value=(True, None)) as dp:
            res = mc.guarded_deliver("m1", "w1:pZ", "hello", "test")
            self.assertEqual(res["delivery"], "injected")
            self.assertTrue(res["ok"])
            dp.assert_called_once()
        # delivery activity refreshed the lease
        self.assertTrue(bg.has_live_lease("w1:pZ"))

    def test_guard_off_passthrough(self):
        """Guard OFF (default): behavior identical to legacy deliver_prompt."""
        calls = []
        saved = mc.BUS_GUARD_ENABLED
        mc.BUS_GUARD_ENABLED = False
        try:
            with mock.patch.object(mc, "deliver_prompt",
                                   side_effect=lambda p, t: calls.append(p) or (True, None)):
                res = mc.guarded_deliver("m1", "w1:pOFF", "hello", "test")
        finally:
            mc.BUS_GUARD_ENABLED = saved
        self.assertEqual(res["delivery"], "injected")
        self.assertEqual(calls, ["w1:pOFF"])


class TestJournalFallback(unittest.TestCase):
    """Invariant 3: journaled events are persisted and replayable."""

    def test_journal_append_and_replay(self):
        with TempState() as ts:
            bg._LEASES.clear()
            mc.guarded_deliver("m1", "w1:pJ", "msg-1", "test")
            mc.guarded_deliver("m2", "w1:pJ", "msg-2", "test")
            journal = json.loads(bg._JOURNAL_PATH.read_text())
            self.assertEqual(len(journal), 2)
            self.assertEqual(journal[0]["message"], "msg-1")
            self.assertEqual(journal[1]["missionId"], "m2")
            # replayable: entries carry everything the plantão needs
            for e in journal:
                self.assertIn("ts", e)
                self.assertIn("paneId", e)
                self.assertIn("message", e)

    def test_journal_corrupt_file_recovers(self):
        with TempState() as ts:
            bg._JOURNAL_PATH.write_text("NOT JSON")
            bg._LEASES.clear()
            mc.guarded_deliver("m1", "w1:pK", "msg", "test")
            journal = json.loads(bg._JOURNAL_PATH.read_text())
            self.assertEqual(len(journal), 1)  # corrupt content replaced, event kept


class TestNudgeWiring(unittest.TestCase):
    """nudge_mission goes through the guard; journaled nudge is reported, not lost."""

    def setUp(self):
        bg._LEASES.clear()

    def _ledger(self, pane="w1:pN"):
        return {"missionId": "m1", "paneId": pane, "status": "dispatched"}

    def test_nudge_without_lease_journals(self):
        with TempState(), \
             mock.patch.object(mc, "load_ledger", return_value=self._ledger()), \
             mock.patch.object(mc, "pane_state", return_value=("idle", "", None)), \
             mock.patch.object(mc, "_load_nudges", return_value={}), \
             mock.patch.object(mc, "_save_nudges", lambda s: None), \
             mock.patch.object(mc, "append_event", lambda *a, **k: None):
            res = mc.nudge_mission("m1", "nudge text", sender="test")
            self.assertEqual(res["status"], "journaled")
            journal = json.loads(bg._JOURNAL_PATH.read_text())
            self.assertEqual(journal[-1]["message"], "nudge text")

    def test_nudge_with_lease_injects(self):
        bg.register_lease("w1:pN2")
        with TempState(), \
             mock.patch.object(mc, "load_ledger", return_value=self._ledger("w1:pN2")), \
             mock.patch.object(mc, "pane_state", side_effect=[("idle", "", None), ("working", "", None)]), \
             mock.patch.object(mc, "deliver_prompt", return_value=(True, None)), \
             mock.patch.object(mc, "_load_nudges", return_value={}), \
             mock.patch.object(mc, "_save_nudges", lambda s: None), \
             mock.patch.object(mc, "append_event", lambda *a, **k: None), \
             mock.patch("time.sleep", lambda s: None):
            res = mc.nudge_mission("m1", "nudge text", sender="test", verify_s=0)
            self.assertEqual(res["status"], "nudged")


if __name__ == "__main__":
    unittest.main(verbosity=2)
