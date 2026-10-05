"""ORCH-SPEND-LEDGER-01 — custo LLM REAL gravado no ledger no mission_close.

(a) payload costUsd>0 do engineering.orchestrate.mission_spend → ledger["cost"] medido
    (cost_usd, tokens_in/out, source) + spool mission_cost;
(b) sem transcript/sessão (reason tipado do server) → cost null + motivo, close segue ok;
(c) erro no cálculo/transporte → cost_unmeasured + warning tipado, close segue ok;
(d) idempotência: re-record com mesmo payload → dedupe do spool (não duplica);
(e) hermeticidade: ENG_MCP_CALLS_OFF → cost_unmeasured sem HTTP (suíte 427 intacta).

NUNCA chama o servidor engineering real nem toca o bus real: transportes fakes + tmp.

Run: python3 -m unittest test_orch_spend_ledger
"""

from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from test_mission_ops import PKG, TempState, track_calls

mc = PKG.mc
nf = PKG.nf

# ORIG capturado ANTES de qualquer patch: os lambdas do _close usam a função real
# (o patch no módulo troca o nome; a referência original continua válida).
_ORIG_TRANSCRIPT_COST = nf.transcript_cost_record


def _fake_payload(cost_usd=0.421, tokens_in=1500, tokens_out=750,
                  source="orchestrate.spend:transcript+price-table",
                  reason=None, session_id="sess-abc", model="z-ai/glm-5.3-flash"):
    return {"missionId": "spend-m1", "costUsd": cost_usd, "tokensIn": tokens_in,
            "tokensOut": tokens_out, "source": source, "reason": reason,
            "sessionId": session_id, "model": model}


def _fake_transport(payload=None, err=None):
    def _call(tool, args, timeout_s=10.0):
        assert tool == "engineering.orchestrate.mission_spend", tool
        assert isinstance(args, dict) and args.get("missionId"), args
        return payload, err
    return _call


class TestTranscriptCostRecord(unittest.TestCase):
    """(a) medido / (b) reason tipado / (c) erro de transporte — formato compatível GPU."""

    def test_a_measured_payload(self):
        led = {"missionId": "spend-m1"}
        rec = nf.transcript_cost_record(led, transport=_fake_transport(_fake_payload()))
        self.assertEqual(rec["cost_usd"], 0.421)
        self.assertEqual(rec["tokens_in"], 1500)
        self.assertEqual(rec["tokens_out"], 750)
        self.assertEqual(rec["source"], "orchestrate.spend:transcript+price-table")
        self.assertTrue(rec["final"])
        self.assertNotIn("cost_unmeasured", rec)
        self.assertEqual(rec["session_id"], "sess-abc")
        # ORCH-SPEND-SESSIONID-01: ledger["cost"] na forma do contrato
        self.assertEqual(rec["costUsd"], 0.421)
        self.assertEqual(rec["tokensIn"], 1500)
        self.assertEqual(rec["tokensOut"], 750)
        self.assertEqual(rec["sessionId"], "sess-abc")

    def test_b_null_cost_with_reason(self):
        led = {"missionId": "spend-m2"}
        rec = nf.transcript_cost_record(
            led, transport=_fake_transport(_fake_payload(cost_usd=None, reason="no-transcript")))
        self.assertIsNone(rec.get("cost_usd"))
        self.assertEqual(rec["cost_unmeasured"], "spend_no-transcript")
        self.assertIn("tokens_unmeasured", rec)
        self.assertIsNone(rec.get("costUsd"))  # ORCH-SPEND-SESSIONID-01: null honesto na forma do contrato

    def test_b_no_session_id_reason(self):
        rec = nf.transcript_cost_record(
            {"missionId": "spend-m3"},
            transport=_fake_transport(_fake_payload(cost_usd=None, reason="no-session-id")))
        self.assertEqual(rec["cost_unmeasured"], "spend_no-session-id")

    def test_c_transport_error_fail_open(self):
        rec = nf.transcript_cost_record(
            {"missionId": "spend-m4"}, transport=_fake_transport(None, "mcp_http_failed: URLError"))
        self.assertIsNone(rec.get("cost_usd"))
        self.assertTrue(rec["cost_unmeasured"].startswith("spend_call_failed:"))

    def test_c_transport_raises_fail_open(self):
        def _boom(tool, args, timeout_s=10.0):
            raise RuntimeError("boom")
        rec = nf.transcript_cost_record({"missionId": "spend-m5"}, transport=_boom)
        self.assertTrue(rec["cost_unmeasured"].startswith("spend_transport_error:"))

    def test_c_payload_garbage_fail_open(self):
        rec = nf.transcript_cost_record(
            {"missionId": "spend-m6"}, transport=_fake_transport({"lixo": True}, None))
        self.assertEqual(rec["cost_unmeasured"], "spend_cost-unavailable")

    def test_e_calls_off_hermetic(self):
        led = {"missionId": "spend-m7"}
        with mock.patch.object(nf, "ENG_MCP_CALLS_OFF", True), \
             mock.patch.object(nf, "engineering_call") as never:
            rec = nf.transcript_cost_record(led)
        never.assert_not_called()
        self.assertEqual(rec["cost_unmeasured"], "transport_disabled: transporte engineering desligado (suíte)")

    def test_cost_unmeasured_never_invents(self):
        """Custo nunca inventado: sem payload medido, rec não tem cost_usd numérico."""
        for transport in (_fake_transport(None, "x"), _fake_transport(_fake_payload(cost_usd=None, reason="r"))):
            rec = nf.transcript_cost_record({"missionId": "m"}, transport=transport)
            self.assertNotIn("cost_usd", rec)


class TestSpoolTrail(unittest.TestCase):
    """(d) trilha no spool com dedupe — mesmo mecanismo do caminho GPU."""

    def test_record_and_dedupe(self):
        with TempState(), mock.patch.object(nf, "ENG_MCP_CALLS_OFF", False):
            rec = nf.transcript_cost_record({"missionId": "spend-d1"},
                                            transport=_fake_transport(_fake_payload()))
            trail1 = nf.record_mission_cost(rec)
            self.assertTrue(trail1["ok"])
            self.assertTrue(trail1["emitted"])
            trail2 = nf.record_mission_cost(dict(rec))
            self.assertEqual(trail2.get("reason"), "duplicate")
            # spool tmp recebeu exatamente 1 linha mission_cost
            rows = [json.loads(l) for l in open(PKG.nf.SPOOL, encoding="utf-8")]
            self.assertEqual(sum(1 for r in rows if r.get("kind") == "mission_cost"), 1)
            lookup = nf.mission_cost_lookup("spend-d1", spool=PKG.nf.SPOOL)
            self.assertEqual(lookup["cost_usd"], 0.421)


class TestCloseWiring(unittest.TestCase):
    """Fiação no handle_mission_close: ledger["cost"] gravado; (b)/(c) close segue ok."""

    def _close(self, transport):
        with TempState():
            mc.save_ledger({"missionId": "spend-close", "status": "dispatched"})
            calls, track = track_calls()
            with mock.patch.object(mc, "run_herdr", track), \
                 mock.patch.object(mc.time, "sleep"), \
                 mock.patch.object(nf, "ENG_MCP_CALLS_OFF", False), \
                 mock.patch.object(nf, "transcript_cost_record", side_effect=transport):
                out = json.loads(PKG.handle_mission_close({"missionId": "spend-close"}))
            led = mc.load_ledger("spend-close")
            return out, led

    def test_a_close_records_cost(self):
        out, led = self._close(lambda ledger: dict(
            _ORIG_TRANSCRIPT_COST(ledger, transport=_fake_transport(_fake_payload()))))
        self.assertTrue(out["ok"])
        step = next(s for s in out["steps"] if s["step"] == "mission_cost")
        self.assertTrue(step["ok"])
        self.assertEqual(step["cost_usd"], 0.421)
        self.assertEqual(step["source"], "orchestrate.spend:transcript+price-table")
        self.assertEqual(led["cost"]["cost_usd"], 0.421)
        # ORCH-SPEND-SESSIONID-01: forma do contrato no ledger["cost"]
        self.assertEqual(led["cost"]["costUsd"], 0.421)
        self.assertEqual(led["cost"]["tokensIn"], 1500)
        self.assertEqual(led["cost"]["tokensOut"], 750)
        self.assertEqual(led["cost"]["sessionId"], "sess-abc")
        self.assertEqual(led["status"], "closed")

    def test_b_close_unmeasured_still_ok(self):
        out, led = self._close(lambda ledger: _ORIG_TRANSCRIPT_COST(
            ledger, transport=_fake_transport(_fake_payload(cost_usd=None, reason="no-transcript"))))
        self.assertTrue(out["ok"])  # close segue ok (contrato item 3)
        self.assertIsNone(led["cost"].get("cost_usd"))
        self.assertEqual(led["cost"]["cost_unmeasured"], "spend_no-transcript")
        self.assertTrue(any(isinstance(w, dict) and w.get("code") == "mission_cost_unmeasured"
                            for w in out.get("warnings", [])))

    def test_c_close_transport_error_still_ok(self):
        out, led = self._close(lambda ledger: _ORIG_TRANSCRIPT_COST(
            ledger, transport=_fake_transport(None, "mcp_http_failed: URLError")))
        self.assertTrue(out["ok"])
        self.assertTrue(led["cost"]["cost_unmeasured"].startswith("spend_call_failed:"))
        self.assertTrue(any(isinstance(w, dict) and w.get("code") == "mission_cost_unmeasured"
                            for w in out.get("warnings", [])))

    def test_gpu_path_untouched(self):
        """NÃO-QUEBRA: missão engine=gpu segue o caminho GPU (mission_cost_record)."""
        with TempState():
            mc.save_ledger({"missionId": "spend-gpu", "engine": "gpu", "gpuUpOk": False,
                            "status": "dispatched"})
            calls, track = track_calls()
            with mock.patch.object(mc, "run_herdr", track), \
                 mock.patch.object(mc.time, "sleep"):
                out = json.loads(PKG.handle_mission_close({"missionId": "spend-gpu"}))
            self.assertTrue(out["ok"])
            led = mc.load_ledger("spend-gpu")
            self.assertTrue(str(led["cost"]["cost_unmeasured"]).startswith("gpu_up_failed"))


if __name__ == "__main__":
    unittest.main()