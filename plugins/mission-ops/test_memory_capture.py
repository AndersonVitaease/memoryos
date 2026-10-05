"""MEMORY-CAPTURE-01: testes unitários (stdlib) para mc.memory_capture.

4 casos: capture ok; capture falha (close segue — não levanta); dedupe por marker;
RD-EV-03: projectId na payload + resolve_project_for_cwd (tabela declarada).
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import mission_core as mc


class MemoryCaptureTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.state = Path(self._tmp.name)
        self._old_state = mc.STATE_DIR
        mc.STATE_DIR = self.state
        self.addCleanup(self._restore)

    def _restore(self):
        mc.STATE_DIR = self._old_state
        self._tmp.cleanup()

    def test_capture_ok(self):
        calls = []

        def transport(args):
            calls.append(args)
            return {"ok": True, "data": {"captured": True}}

        ok, err, deduped = mc.memory_capture("m-ok", "resumo", transport=transport)
        self.assertTrue(ok)
        self.assertIsNone(err)
        self.assertFalse(deduped)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][3], "engineering")  # --server
        self.assertEqual(calls[0][5], "memory.capture")  # --tool
        payload = json.loads(calls[0][7])
        self.assertEqual(payload["missionId"], "m-ok")
        marker = self.state / mc.MEMORY_CAPTURE_MARKER.format(mission_id="m-ok")
        self.assertTrue(marker.exists())

    def test_capture_failure_does_not_raise(self):
        def transport(args):
            return {"ok": False, "error": "server unavailable"}

        try:
            ok, err, deduped = mc.memory_capture("m-fail", "resumo", transport=transport)
        except Exception as e:  # close NUNCA deve derrubar por capture
            self.fail("memory_capture levantou em falha: %r" % e)
        self.assertFalse(ok)
        self.assertIn("server unavailable", err)
        self.assertFalse(deduped)
        marker = self.state / mc.MEMORY_CAPTURE_MARKER.format(mission_id="m-fail")
        self.assertFalse(marker.exists())

    def test_dedupe(self):
        calls = []

        def transport(args):
            calls.append(args)
            return {"ok": True, "data": {"captured": True}}

        ok1, _, dedup1 = mc.memory_capture("m-dup", "resumo", transport=transport)
        ok2, err2, dedup2 = mc.memory_capture("m-dup", "resumo", transport=transport)
        self.assertTrue(ok1 and ok2)
        self.assertIsNone(err2)
        self.assertFalse(dedup1)
        self.assertTrue(dedup2)
        self.assertEqual(len(calls), 1)  # segunda chamada não chega ao transport


class ProjectIdTest(unittest.TestCase):
    """RD-EV-03: projectId por tabela declarada (fonte única com o server-side)."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.state = Path(self._tmp.name)
        self._old_state = mc.STATE_DIR
        mc.STATE_DIR = self.state
        self.addCleanup(self._restore)

    def _restore(self):
        mc.STATE_DIR = self._old_state
        self._tmp.cleanup()

    def _write_map(self, mapping, fallback="hermes-config"):
        table = {"fallback": fallback, "map": mapping}
        path = self.state / "project-map.json"
        path.write_text(json.dumps(table), encoding="utf-8")
        return str(path)

    def test_payload_carries_project_id(self):
        calls = []

        def transport(args):
            calls.append(args)
            return {"ok": True, "data": {"captured": True}}

        ok, err, _ = mc.memory_capture("m-pid", "resumo", transport=transport, project_id="mission-events")
        self.assertTrue(ok)
        payload = json.loads(calls[0][7])
        self.assertEqual(payload.get("projectId"), "mission-events")

    def test_payload_sem_project_id_nao_envia_chave(self):
        calls = []

        def transport(args):
            calls.append(args)
            return {"ok": True, "data": {"captured": True}}

        ok, _, _ = mc.memory_capture("m-nopid", "resumo", transport=transport)
        self.assertTrue(ok)
        payload = json.loads(calls[0][7])
        self.assertNotIn("projectId", payload)

    def test_resolve_longest_prefix_e_fallback(self):
        map_file = self._write_map({
            "/root/.hermes/plugins/mission-ops": "mission-ops",
            "/root/.hermes": "hermes-config",
            "/opt/mission-events": "mission-events",
        })
        self.assertEqual(mc.resolve_project_for_cwd("/opt/mission-events", map_file), "mission-events")
        self.assertEqual(mc.resolve_project_for_cwd("/root/.hermes/plugins/mission-ops/test", map_file), "mission-ops")
        self.assertEqual(mc.resolve_project_for_cwd("/root/.hermes/plugins/outro", map_file), "hermes-config")
        self.assertEqual(mc.resolve_project_for_cwd("/desconhecido/x", map_file), "hermes-config")
        self.assertEqual(mc.resolve_project_for_cwd("", map_file), "hermes-config")

    def test_resolve_tabela_ausente_degrada_sem_levantar(self):
        self.assertEqual(mc.resolve_project_for_cwd("/opt/mission-events",
                                                    str(self.state / "nao-existe.json")),
                         "hermes-config")


if __name__ == "__main__":
    unittest.main(verbosity=2)
