"""DISPATCH-FAST-03: fail-fast do dispatch na era sem-GPU.

- sonda E2E da ponte Qwen: /health da 8102 ok com upstream morto = MORTA;
- ponte morta: gpu_up_skipped no bus, sem gpu-up, engine=openrouter-fallback, claude no 8103;
- ponte viva: gpu-up normal (o fail-fast não esconde a ponte quando a GPU voltar);
- relaunch de missão openrouter/openrouter-fallback segue no 8103.
"""
import http.server
import json
import threading
import unittest
from pathlib import Path
from unittest import mock

from test_mission_ops import PKG  # noqa: F401  (guard vast_sandbox via test_mission_ops)
import test_mission_ops as T

PKG, mc = T.PKG, T.mc


def _real_probe():
    return PKG._qwen_bridge_alive_real  # test_mission_ops mocka o atributo; a real fica guardada


class _Srv:
    """HTTP local: /health aponta p/ upstream; /v1/models responde `models_status`."""

    def __init__(self, health_status=200, upstream=None, models_status=200):
        outer = self

        class H(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_GET(self):
                if self.path.startswith("/health"):
                    body = json.dumps({"ok": True, "upstream": outer.upstream}).encode()
                    self.send_response(outer.health_status)
                elif self.path.startswith("/v1/models"):
                    body = b'{"data":[]}'
                    self.send_response(outer.models_status)
                else:
                    body = b"{}"
                    self.send_response(404)
                self.end_headers()
                self.wfile.write(body)

        self.health_status, self.models_status = health_status, models_status
        self.httpd = http.server.HTTPServer(("127.0.0.1", 0), H)
        self.url = "http://127.0.0.1:%d" % self.httpd.server_port
        self.upstream = upstream if upstream is not None else self.url
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def close(self):
        self.httpd.shutdown()
        self.httpd.server_close()


def _probe_against(srv):
    """Roda a sonda real trocando o 8102 fixo pela URL do servidor de teste."""
    import urllib.request as ur
    real = ur.urlopen

    def fake(url, timeout=None):
        return real(url.replace("http://127.0.0.1:8102", srv.url), timeout=timeout)
    with mock.patch.object(ur, "urlopen", fake):
        return _real_probe()(timeout=2.0)


class TestQwenBridgeProbe(unittest.TestCase):
    def test_health_ok_but_upstream_dead_is_dead(self):
        """Caso real 29/09: proxy node vivo, túnel ssh escutando, vast morto."""
        srv = _Srv(upstream="http://127.0.0.1:1")  # porta fechada = ECONNREFUSED
        try:
            self.assertFalse(_probe_against(srv))
        finally:
            srv.close()

    def test_upstream_5xx_is_dead(self):
        srv = _Srv(models_status=502)
        try:
            self.assertFalse(_probe_against(srv))
        finally:
            srv.close()

    def test_health_non200_is_dead(self):
        srv = _Srv(health_status=503)
        try:
            self.assertFalse(_probe_against(srv))
        finally:
            srv.close()

    def test_bridge_down_is_dead(self):
        import urllib.request as ur
        with mock.patch.object(ur, "urlopen", side_effect=OSError("refused")):
            self.assertFalse(_real_probe()())

    def test_full_chain_alive(self):
        srv = _Srv()
        try:
            self.assertTrue(_probe_against(srv))
        finally:
            srv.close()


class TestDispatchFailFast(unittest.TestCase):
    def _dispatch(self, ts, base_url, alive):
        prompt = ts.prompt_file()
        cwd = str(Path(prompt).parent)
        ts.claude_session("sess-1", cwd=cwd)
        script = {
            f"tab create --cwd {cwd} --no-focus": T.tab_ok("t1", "w1:pZ"),
            "tab rename t1 MISSION:m1": "",
            "pane rename w1:pZ titulo": "",
            f"pane run w1:pZ env ANTHROPIC_BASE_URL={base_url} ANTHROPIC_AUTH_TOKEN=dummy "
            f"ANTHROPIC_API_KEY=dummy CLAUDE_CONFIG_DIR={cwd}/.claude-config claude": "",
            f"pane run w1:pZ {mc.dispatch_prompt(prompt)}": "",
        }
        gpu_up = mock.Mock(return_value=True)
        with mock.patch.object(mc, "run_herdr", T.fake_herdr(script)), \
             mock.patch.object(mc, "wait_output", return_value=(T.READY, None)), \
             mock.patch.object(mc, "deliver_prompt", return_value=(True, None)), \
             mock.patch.object(PKG, "_qwen_bridge_alive", return_value=alive), \
             mock.patch.object(PKG, "_gpu_up_for_mission", gpu_up):
            res = json.loads(PKG.handle_mission_dispatch(
                {"missionId": "m1", "promptFile": prompt, "paneTitle": "titulo"}))
        spool = Path(PKG._MISSION_SPOOL)
        kinds = [json.loads(l).get("kind") for l in spool.read_text().splitlines()] if spool.exists() else []
        return res, gpu_up, kinds

    def test_dead_bridge_skips_gpu_up_and_falls_back_to_8103(self):
        with T.TempState() as ts:
            res, gpu_up, kinds = self._dispatch(ts, "http://127.0.0.1:8103", alive=False)
            self.assertTrue(res["ok"], res)
            gpu_up.assert_not_called()
            self.assertIn("gpu_up_skipped", kinds)
            led = mc.load_ledger("m1")
            self.assertEqual(led["engine"], "openrouter-fallback")
            self.assertFalse(led["gpuUpOk"])

    def test_live_bridge_runs_gpu_up_normally(self):
        """QUANDO A GPU VOLTAR: health 2s positivo → gpu-up normal, claude no 8102."""
        with T.TempState() as ts:
            res, gpu_up, kinds = self._dispatch(ts, "http://127.0.0.1:8102", alive=True)
            self.assertTrue(res["ok"], res)
            gpu_up.assert_called_once_with("m1")
            self.assertNotIn("gpu_up_skipped", kinds)
            led = mc.load_ledger("m1")
            self.assertEqual(led["engine"], "gpu")
            self.assertTrue(led["gpuUpOk"])


class TestRelaunchFollowsEngine(unittest.TestCase):
    def test_openrouter_engines_relaunch_on_8103(self):
        import importlib
        rl = importlib.import_module("mission_ops.relaunch")
        for eng in ("openrouter", "openrouter-fallback"):
            cmd = rl.claude_command({"cwd": "/opt/m", "engine": eng, "gpuUpOk": False})
            self.assertIn("ANTHROPIC_BASE_URL=http://127.0.0.1:8103", cmd, eng)
        self.assertNotIn("ANTHROPIC_BASE_URL", rl.claude_command({"cwd": "/opt/m"}))


if __name__ == "__main__":
    unittest.main()
