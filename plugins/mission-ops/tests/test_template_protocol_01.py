"""TEMPLATE-PROTOCOL-01: testes stdlib para itens 1/2/3 da missão.

Cobertura:
- Item 1: dispatch_prompt — eco CONTRATO OK, ZERO-BASH-BY-DESIGN, DEFER-HOST-SIDE,
  operator_channel, RECEITA DE FECHAMENTO no template; fallback 1ª linha + path
  para prompt > 800 chars.
- Item 2: _watch_one — eco `CONTRATO OK <id>` no pane → contractIngestedAt no
  ledger + evento contract_ingested; dedupe (2º ciclo não re-registra); nunca
  bloqueia (status não muda).
- Item 3: mission_close — sem operatorChannel → closeWarning honesto + step
  operator_channel_proof skipped; com operatorChannel → step ok.
"""
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import mission_core as mc  # noqa: E402
import __init__ as mo  # noqa: E402


class TestDispatchTemplate(unittest.TestCase):
    """Item 1: cláusulas do template + fallback anti-truncamento."""

    def test_template_has_ingestion_echo(self):
        self.assertIn("CONTRATO OK", mc.DISPATCH_TEMPLATE)
        self.assertIn("{mission_id}", mc.DISPATCH_TEMPLATE)

    def test_template_has_zero_bash(self):
        self.assertIn("ZERO-BASH-BY-DESIGN", mc.DISPATCH_TEMPLATE)
        self.assertIn("ESSENCIAIS da prova", mc.DISPATCH_TEMPLATE)

    def test_template_has_defer_host_side(self):
        self.assertIn("DEFER-HOST-SIDE", mc.DISPATCH_TEMPLATE)
        self.assertIn("Classifier unavailable", mc.DISPATCH_TEMPLATE)
        self.assertIn("FAIL honesto", mc.DISPATCH_TEMPLATE)

    def test_template_has_operator_channel(self):
        self.assertIn("operator_channel", mc.DISPATCH_TEMPLATE)
        self.assertIn("closeWarning", mc.DISPATCH_TEMPLATE)

    def test_template_has_closing_recipe(self):
        self.assertIn("RECEITA DE FECHAMENTO", mc.DISPATCH_TEMPLATE)
        self.assertIn("PARE", mc.DISPATCH_TEMPLATE)

    def test_short_prompt_inline(self):
        out = mc.dispatch_prompt("/tmp/x.md", "M-TEST")
        self.assertNotIn("contrato completo em:", out)
        self.assertIn("CONTRATO OK M-TEST", out)

    def test_long_prompt_falls_back_to_path(self):
        # template já passa de 800 chars; força o caminho do arquivo
        with mock.patch.object(mc, "DISPATCH_INLINE_LIMIT", 10):
            with tempfile.TemporaryDirectory() as td:
                with mock.patch.dict(os.environ, {"MISSION_DISPATCH_DIR": td}):
                    out = mc.dispatch_prompt("/tmp/x.md", "M-LONG")
                # asserts DENTRO do with: o TemporaryDirectory apaga o arquivo
                # no exit do contexto (o dispatch file vive dentro dele).
                self.assertIn("contrato completo em:", out)
                path = out.split("contrato completo em: ")[1].split("]")[0]
                self.assertTrue(os.path.isfile(path))
                body = open(path, encoding="utf-8").read()
                self.assertIn("CONTRATO OK M-LONG", body)
                self.assertIn("/tmp/x.md", body)
                os.unlink(path)


class _FakePane:
    """Pane mínimo para _watch_one: captura o texto passado."""

    def __init__(self, text):
        self.text = text


def _make_ledger(tmp, mission_id="M-W", **extra):
    ledger = {"missionId": mission_id, "paneId": "pane-x", "status": "dispatched",
              "promptFile": os.path.join(tmp, "prompt.md"), "cwd": tmp}
    ledger.update(extra)
    return ledger


class TestWatchContractEcho(unittest.TestCase):
    """Item 2: eco CONTRATO OK → contract_ingested (registra, nunca bloqueia)."""

    def _watch(self, ledger, pane_text):
        with tempfile.TemporaryDirectory() as td:
            ledger["cwd"] = td
            with mock.patch.object(mo.mc, "read_output", return_value=pane_text), \
                 mock.patch.object(mo.mc, "save_ledger"), \
                 mock.patch.object(mo.mc, "append_event") as ev, \
                 mock.patch.object(mo.rc, "classify_text", return_value=None), \
                 mock.patch.object(mo.rc, "classify_pane", return_value=(None, None)), \
                 mock.patch.object(mo.mc, "pane_exists", return_value=True), \
                 mock.patch.object(mo.mc, "foreground_agent_name",
                                   return_value=("claude", None)), \
                 mock.patch.object(mo.nf, "run_probes", return_value=[]), \
                 mock.patch.object(mo.mc, "wait_output", return_value=(pane_text, None)):
                res = mo._watch_one(ledger["missionId"], ledger, timeout_ms=0)
        return res, ev

    def test_echo_registers_ingestion(self):
        ledger = _make_ledger("/tmp")
        res, ev = self._watch(ledger, "CONTRATO OK M-W\ntrabalhando...")
        self.assertTrue(ledger.get("contractIngestedAt"))
        self.assertEqual(ev.call_args_list[0].args[2], "contract_ingested")
        self.assertNotIn("error", res)

    def test_echo_dedupes(self):
        ledger = _make_ledger("/tmp", contractIngestedAt="2025-10-03T00:00:00Z")
        _, ev = self._watch(ledger, "CONTRATO OK M-W")
        ev.assert_not_called()

    def test_echo_never_blocks(self):
        ledger = _make_ledger("/tmp")
        res, _ = self._watch(ledger, "CONTRATO OK M-W")
        self.assertEqual(ledger["status"], "dispatched")  # status intacto
        self.assertNotIn("needs_recovery", str(res))


class TestCloseOperatorChannel(unittest.TestCase):
    """Item 3: close sem operatorChannel → warning honesto + step skipped."""

    def _close(self, ledger, tmp):
        with mock.patch.object(mo.mc, "load_ledger", return_value=ledger), \
             mock.patch.object(mo.mc, "save_ledger"), \
             mock.patch.object(mo.mc, "append_event"), \
             mock.patch.object(mo.mc, "pane_exists", return_value=False), \
             mock.patch.object(mo, "_ms", return_value=None), \
             mock.patch.object(mo.nf, "run_probes", return_value=[]), \
             mock.patch.object(mo.vg, "run_channel_proof",
                               return_value=(True, {"ok": True, "url": "http://x",
                                                    "status": 200})), \
             mock.patch.object(mo.vg, "emit_bus_event"), \
             mock.patch.object(mo.nf, "mission_reopened"):
            return mo.handle_mission_close({"missionId": ledger["missionId"], "cwd": tmp})

    def test_close_without_channel_warns(self):
        with tempfile.TemporaryDirectory() as td:
            ledger = _make_ledger(td, "M-C")
            out = json.loads(self._close(ledger, td))
        self.assertIn("operator_channel", ledger.get("closeWarning", ""))
        steps = out.get("steps", [])
        skipped = [s for s in steps if s.get("step") == "operator_channel_proof"
                   and s.get("skipped")]
        self.assertTrue(skipped)

    def test_close_with_channel_no_warning(self):
        with tempfile.TemporaryDirectory() as td:
            ledger = _make_ledger(td, "M-C2", operatorChannel={"url": "http://x"})
            self._close(ledger, td)
        self.assertNotIn("operator_channel", ledger.get("closeWarning", ""))


if __name__ == "__main__":
    unittest.main()