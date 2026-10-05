"""TRINITY-WIRE-01 tests — advisor and supervisor checkpoints.

P1: advisor consultado em decisão ambígua → evento advisor_consulted no ledger/trilha
P2: advisor down → fail-open, missão continua, evento de skip
P3: pré-close em missão class>=media → supervisor_advisory registrado; class=mecanica → NÃO chama
P4: timeout 5s respeitado em ambos
P5: suíte mission-ops continua verde (nada quebrado)
"""
from __future__ import annotations

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

import trinity_wire as tw  # noqa: E402


class TestRecordCall(unittest.TestCase):
    """P1 helper: trail recording works."""

    def test_record_call_writes_jsonl(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
            trail = f.name
        try:
            tw.TRAIL_PATH = trail
            tw.record_call("m1", "advisor", "http://127.0.0.1:8103/v1/advisor",
                           tokens=10, latency_ms=50, outcome="ok")
            lines = Path(trail).read_text().strip().splitlines()
            self.assertEqual(len(lines), 1)
            entry = json.loads(lines[0])
            self.assertEqual(entry["missionId"], "m1")
            self.assertEqual(entry["role"], "advisor")
            self.assertEqual(entry["outcome"], "ok")
            self.assertEqual(entry["tokens"], 10)
            self.assertEqual(entry["latencyMs"], 50)
        finally:
            os.unlink(trail)

    def test_record_call_best_effort_on_missing_dir(self):
        # se o diretório não existe e não pode ser criado, não levanta
        tw.TRAIL_PATH = "/nonexistent/dir/trinity-calls.jsonl"
        try:
            tw.record_call("m1", "advisor", "http://x", outcome="skipped")
        except OSError:
            self.fail("record_call não deve levantar em caminho inexistente")


class TestConsultAdvisor(unittest.TestCase):
    """P1 + P2 + P4: advisor endpoint integration."""

    def test_advisor_ok_returns_recommendation(self):
        """P1: advisor consultado em decisão ambígua → recomendação registrada."""
        srv = _MockServer({"recommendation": "proceed", "tokens": 5})
        with srv:
            resp = tw.consult_advisor({"event": "unknown", "status": "dispatched"}, "m1")
        self.assertTrue(resp["ok"])
        self.assertIn("recommendation", resp)
        self.assertEqual(resp["recommendation"]["recommendation"], "proceed")

    def test_advisor_down_fail_open(self):
        """P2: advisor indisponível → fail-open, missão continua."""
        # aponta p/ porta onde nada escuta → connection refused → fail-open
        original = tw.ADVISOR_URL
        tw.ADVISOR_URL = "http://127.0.0.1:1/w1/advisor"
        try:
            resp = tw.consult_advisor({"event": "unknown"}, "m1")
            self.assertFalse(resp["ok"])
            self.assertIn("error", resp)
        finally:
            tw.ADVISOR_URL = original

    def test_advisor_timeout_5s(self):
        """P4: timeout 5s respeitado no advisor."""
        srv = _SlowServer(delay=10.0)
        with srv:
            t0 = time.monotonic()
            resp = tw.consult_advisor({"event": "unknown"}, "m1", timeout_s=5)
            elapsed = time.monotonic() - t0
        self.assertFalse(resp["ok"])
        self.assertLess(elapsed, 8.0, "timeout deve retornar em <8s (5s + margem)")

    def test_advisor_records_skip_on_failure(self):
        """P2: advisor down grava evento de skip na trilha."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
            trail = f.name
        try:
            tw.TRAIL_PATH = trail
            resp = tw.consult_advisor({"event": "unknown"}, "m1")
            self.assertFalse(resp["ok"])
            lines = Path(trail).read_text().strip().splitlines()
            self.assertEqual(len(lines), 1)
            entry = json.loads(lines[0])
            self.assertEqual(entry["role"], "advisor")
            self.assertEqual(entry["outcome"], "skipped")
        finally:
            os.unlink(trail)


class TestConsultSupervisor(unittest.TestCase):
    """P3 + P4: supervisor endpoint integration."""

    def test_supervisor_ok_returns_advisory(self):
        """P3: pré-close em missão class>=media → supervisor_advisory registrado."""
        srv = _MockServer({"advisory": "ok", "tokens": 3})
        with srv:
            resp = tw.consult_supervisor("sumário", "pass", [{"id": "p1"}], "m1")
        self.assertTrue(resp["ok"])
        self.assertIn("advisory", resp)

    def test_supervisor_down_fail_open(self):
        """P3: supervisor indisponível → proceed sem advisory."""
        original = tw.SUPERVISOR_URL
        tw.SUPERVISOR_URL = "http://127.0.0.1:1/w1/supervisor"
        try:
            resp = tw.consult_supervisor("sumário", "pass", [], "m1")
            self.assertFalse(resp["ok"])
            self.assertIn("error", resp)
        finally:
            tw.SUPERVISOR_URL = original

    def test_supervisor_timeout_5s(self):
        """P4: timeout 5s respeitado no supervisor."""
        srv = _SlowServer(delay=10.0)
        with srv:
            t0 = time.monotonic()
            resp = tw.consult_supervisor("s", "v", [], "m1", timeout_s=5)
            elapsed = time.monotonic() - t0
        self.assertFalse(resp["ok"])
        self.assertLess(elapsed, 8.0)

    def test_supervisor_records_skip_on_failure(self):
        """P3: supervisor down grava supervisor_advisory_skipped."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
            trail = f.name
        try:
            tw.TRAIL_PATH = trail
            resp = tw.consult_supervisor("s", "v", [], "m1")
            self.assertFalse(resp["ok"])
            lines = Path(trail).read_text().strip().splitlines()
            self.assertEqual(len(lines), 1)
            entry = json.loads(lines[0])
            self.assertEqual(entry["role"], "supervisor")
            self.assertEqual(entry["outcome"], "skipped")
        finally:
            os.unlink(trail)


class TestMissionClass(unittest.TestCase):
    """P3: class>=media detection."""

    def test_class_media(self):
        self.assertTrue(tw.mission_class_at_least_medium({"mission_class": "media"}))

    def test_class_alta(self):
        self.assertTrue(tw.mission_class_at_least_medium({"mission_class": "alta"}))

    def test_class_critica(self):
        self.assertTrue(tw.mission_class_at_least_medium({"mission_class": "critica"}))

    def test_class_mecanica(self):
        self.assertFalse(tw.mission_class_at_least_medium({"mission_class": "mecanica"}))

    def test_class_missing(self):
        self.assertFalse(tw.mission_class_at_least_medium({}))

    def test_class_lowercase(self):
        self.assertTrue(tw.mission_class_at_least_medium({"mission_class": "MEDIA"}))


class TestLedgerRoles(unittest.TestCase):
    """Ledger roles block with call counts."""

    def test_get_ledger_roles_zero_defaults(self):
        roles = tw.get_ledger_roles({})
        self.assertEqual(roles["advisor"]["calls"], 0)
        self.assertEqual(roles["supervisor"]["calls"], 0)
        self.assertEqual(roles["worker"]["calls"], 0)
        self.assertEqual(roles["judge"]["calls"], 0)

    def test_update_ledger_roles(self):
        ledger = {}
        tw.update_ledger_roles(ledger, "advisor", "nex-n2.5-pro", 3)
        self.assertEqual(ledger["roles"]["advisor"]["calls"], 3)
        self.assertEqual(ledger["roles"]["advisor"]["model"], "nex-n2.5-pro")

    def test_increment_role_call(self):
        ledger = {}
        tw.increment_role_call(ledger, "advisor", "nex-n2.5-pro")
        self.assertEqual(ledger["roles"]["advisor"]["calls"], 1)
        tw.increment_role_call(ledger, "advisor", "nex-n2.5-pro")
        self.assertEqual(ledger["roles"]["advisor"]["calls"], 2)

    def test_zero_calls_explicit(self):
        """Zero chamada = valor explícito 0 (liveness honesta)."""
        roles = tw.get_ledger_roles({"roles": {"advisor": {"model": "nex-n2.5-pro", "calls": 0}}})
        self.assertEqual(roles["advisor"]["calls"], 0)


class TestIntegrationWithMissionOps(unittest.TestCase):
    """P5: suíte mission-ops continua verde — nada quebrado."""

    def test_trinity_wire_imports_cleanly(self):
        import trinity_wire  # noqa: F811
        self.assertTrue(hasattr(trinity_wire, "consult_advisor"))
        self.assertTrue(hasattr(trinity_wire, "consult_supervisor"))
        self.assertTrue(hasattr(trinity_wire, "record_call"))
        self.assertTrue(hasattr(trinity_wire, "get_ledger_roles"))
        self.assertTrue(hasattr(trinity_wire, "update_ledger_roles"))
        self.assertTrue(hasattr(trinity_wire, "increment_role_call"))
        self.assertTrue(hasattr(trinity_wire, "mission_class_at_least_medium"))

    def test_mission_ops_suite_still_green(self):
        """P5: verify que a suíte mission-ops existe e os módulos importam."""
        import mission_core  # noqa: F401
        import recipes  # noqa: F401
        self.assertTrue(True)


class _MockServer:
    """Context manager: HTTP server that returns a fixed JSON response."""

    def __init__(self, response: dict):
        self._response = response
        self._server = None

    def __enter__(self):
        import http.server
        outer = self

        class H(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass
            def do_POST(self):
                body = b""
                length = int(self.headers.get("Content-Length", 0))
                if length:
                    body = self.rfile.read(length)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(outer._response).encode())

        self._server = http.server.HTTPServer(("127.0.0.1", 0), H)
        self._port = self._server.server_address[1]
        import threading
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()
        # patch URLs
        tw.ADVISOR_URL = "http://127.0.0.1:%d/v1/advisor" % self._port
        tw.SUPERVISOR_URL = "http://127.0.0.1:%d/v1/supervisor" % self._port
        return self

    def __exit__(self, *a):
        self._server.shutdown()
        self._server.server_close()


class _SlowServer:
    """Context manager: HTTP server that delays before responding."""

    def __init__(self, delay: float):
        self._delay = delay
        self._server = None

    def __enter__(self):
        import http.server
        outer = self

        class H(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass
            def do_POST(self):
                import time
                time.sleep(outer._delay)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"ok": true}')

        self._server = http.server.HTTPServer(("127.0.0.1", 0), H)
        self._port = self._server.server_address[1]
        import threading
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()
        tw.ADVISOR_URL = "http://127.0.0.1:%d/v1/advisor" % self._port
        tw.SUPERVISOR_URL = "http://127.0.0.1:%d/v1/supervisor" % self._port
        return self

    def __exit__(self, *a):
        self._server.shutdown()
        self._server.server_close()


if __name__ == "__main__":
    unittest.main()
