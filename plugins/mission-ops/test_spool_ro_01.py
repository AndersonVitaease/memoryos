"""SPOOL-RO-01 — regressão das escritas de runtime env-overridable.

Cobre o contrato da missão:
1. notify: spool é env-overridable (MISSION_BUS_SPOOL | ENG_MCP_SPOOL_PATH) e a
   escrita cai para o próximo candidato no primeiro OSError (EROFS em
   /opt/mission-events no container eng-mcp) — nunca novo rw sob /opt/mission-events.
2. bus_guard: journal é env-overridable (MISSION_BUS_JOURNAL) e cai para
   /run/mission-bus/journal.json no primeiro OSError.

Run: python3 test_spool_ro_01.py
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
notify = PKG.nf         # a MESMA instância que o pacote mission-ops usa
bg = mc._bus_guard()


def _tmp():
    return tempfile.TemporaryDirectory()


class TestSpoolEnvOverride(unittest.TestCase):
    """notify: env override honrado; escrita aterrissa no path do env."""

    def tearDown(self):
        os.environ.pop("MISSION_BUS_SPOOL", None)
        os.environ.pop("ENG_MCP_SPOOL_PATH", None)

    def test_spool_path_env_first(self):
        os.environ["MISSION_BUS_SPOOL"] = "/tmp/x/spool.jsonl"
        self.assertEqual(notify.spool_path(), "/tmp/x/spool.jsonl")

    def test_spool_path_eng_mcp_env(self):
        os.environ["ENG_MCP_SPOOL_PATH"] = "/run/mission-bus/spool.jsonl"
        self.assertEqual(notify.spool_path(), "/run/mission-bus/spool.jsonl")

    def test_spool_path_default_histórico(self):
        self.assertEqual(notify.spool_path(), notify.SPOOL)

    def test_emit_event_writes_env_spool(self):
        with _tmp() as d:
            spool = os.path.join(d, "spool.jsonl")
            os.environ["MISSION_BUS_SPOOL"] = spool
            sigs = os.path.join(d, "sigs.json")
            res = notify.emit_event("test_kind", "m-env", "detail", signatures_path=sigs)
            self.assertTrue(res["ok"])
            self.assertTrue(res["emitted"])
            rows = [json.loads(l) for l in Path(spool).read_text().splitlines()]
            self.assertEqual(rows[0]["kind"], "test_kind")
            self.assertEqual(rows[0]["missionId"], "m-env")

    def test_spool_write_falls_back_on_rofs(self):
        """Primeiro candidato EROFS → escrita aterrissa no fallback."""
        with _tmp() as d:
            os.environ.pop("MISSION_BUS_SPOOL", None)
            os.environ.pop("ENG_MCP_SPOOL_PATH", None)
            fallback_dir = Path(d)
            with mock.patch.object(notify, "_JOURNAL_FALLBACK_DIR", str(fallback_dir)), \
                 mock.patch.object(notify, "SPOOL", "/dev/null/spool.jsonl"):
                # /dev/null não é dir: os.makedirs levanta OSError → próximo candidato
                notify._spool_write(json.dumps({"probe": "fallback"}) + "\n")
            rows = [json.loads(l) for l in (fallback_dir / "spool.jsonl").read_text().splitlines()]
            self.assertEqual(rows[0]["probe"], "fallback")

    def test_record_mission_cost_env_spool(self):
        with _tmp() as d:
            spool = os.path.join(d, "spool.jsonl")
            os.environ["MISSION_BUS_SPOOL"] = spool
            sigs = os.path.join(d, "sigs.json")
            res = notify.record_mission_cost(
                {"missionId": "m-cost", "cost_usd": 0.5}, signatures_path=sigs)
            self.assertTrue(res["ok"])
            rows = [json.loads(l) for l in Path(spool).read_text().splitlines()]
            self.assertEqual(rows[0]["kind"], "mission_cost")
            # lookup varre candidatos: acha o registro gravado
            found = notify.mission_cost_lookup("m-cost")
            self.assertIsNotNone(found)
            self.assertEqual(found["cost_usd"], 0.5)


class TestJournalEnvOverride(unittest.TestCase):
    """bus_guard: journal env-overridable + fallback EROFS."""

    def tearDown(self):
        os.environ.pop("MISSION_BUS_JOURNAL", None)

    def test_journal_path_env(self):
        os.environ["MISSION_BUS_JOURNAL"] = "/run/mission-bus/journal.json"
        self.assertEqual(bg.journal_path(), Path("/run/mission-bus/journal.json"))

    def test_journal_path_default(self):
        self.assertEqual(bg.journal_path(), bg._JOURNAL_PATH)

    def test_append_env_journal(self):
        with _tmp() as d:
            jpath = Path(d) / "journal.json"
            os.environ["MISSION_BUS_JOURNAL"] = str(jpath)
            bg.append_to_journal({"paneId": "w1:pE", "message": "env"})
            journal = json.loads(jpath.read_text())
            self.assertEqual(journal[0]["message"], "env")

    def test_append_falls_back_on_rofs(self):
        """Path primário EROFS → evento aterrissa no fallback /run/mission-bus."""
        with _tmp() as d:
            os.environ.pop("MISSION_BUS_JOURNAL", None)
            fallback = Path(d) / "journal.json"
            real = bg._append_journal_once

            def rofs_first(path, event):
                if path == bg._JOURNAL_PATH:
                    raise OSError(30, "Read-only file system")
                return real(path, event)

            with mock.patch.object(bg, "_JOURNAL_FALLBACK", fallback), \
                 mock.patch.object(bg, "_append_journal_once", side_effect=rofs_first):
                bg.append_to_journal({"paneId": "w1:pR", "message": "fallback"})
            journal = json.loads(fallback.read_text())
            self.assertEqual(journal[0]["message"], "fallback")

    def test_append_all_fail_raises(self):
        """Todos os candidatos falham → erro sobe (nunca silenciado)."""
        os.environ.pop("MISSION_BUS_JOURNAL", None)
        with mock.patch.object(bg, "_append_journal_once",
                               side_effect=OSError(30, "Read-only file system")):
            with self.assertRaises(OSError):
                bg.append_to_journal({"paneId": "w1:pX", "message": "x"})


if __name__ == "__main__":
    unittest.main(verbosity=2)
