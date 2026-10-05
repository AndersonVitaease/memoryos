"""RD-OPS-03-SPEND-01 — custo no relatório/ledger + dívidas herdadas no close.

(1) forma do contrato no ledger["cost"]: {inputTokens, outputTokens, cacheReadTokens,
    costUsdEstimate, source} com a fonte citada (transcript path + sha256-16);
(2) unmeasured segue honesto (custo null + causa nomeada, sem os campos do contrato);
(3) roadmap_debts: componente do promptFile → dívidas abertas do ROADMAP relevantes;
    tag [operator-charged] sobe Prio→1 automaticamente (idempotente, atômico);
(4) fiação no close: step inherited_debts + resp.inheritedDebtsLine;
(5) DISPATCH_TEMPLATE tem a cláusula `## Custo` e segue inline.

NUNCA toca produção: fixtures em TempState/tmp, transportes fakes, ROADMAP em tmp.

Run: python3 -m unittest test_rd_ops_spend_01
"""

from __future__ import annotations

import json
import os
import tempfile
import unittest
from unittest import mock

from test_mission_ops import PKG, TempState, track_calls

mc = PKG.mc
nf = PKG.nf
rd = PKG.rd  # mesma instância que o wiring do close usa (from . import no __init__)

_ORIG_TRANSCRIPT_COST = nf.transcript_cost_record

_FULL_PAYLOAD = {
    "missionId": "spend-full", "costUsd": 0.421, "tokensIn": 1500, "tokensOut": 750,
    "cacheReadTokens": 40532608, "transcriptPath": "/opt/mission-events/.claude-config/projects/-opt-mission-events/sess-abc.jsonl",
    "transcriptSha16": "1d432855c8a7dd26",
    "source": "orchestrate.spend:transcript+price-table", "reason": None,
    "sessionId": "sess-abc", "model": "z-ai/glm-5.3-flash", "sessionSource": "ledger-session-id",
}


def _fake_transport(payload, err=None):
    def _call(tool, args, timeout_s=10.0):
        return payload, err
    return _call


class TestContractShape(unittest.TestCase):
    """(1) forma do contrato no ledger["cost"] — breakdown completo + fonte citada."""

    def test_full_shape_with_source_cited(self):
        rec = nf.transcript_cost_record({"missionId": "spend-full"},
                                        transport=_fake_transport(dict(_FULL_PAYLOAD)))
        self.assertEqual(rec["costUsd"], 0.421)
        self.assertEqual(rec["costUsdEstimate"], 0.421)
        self.assertEqual(rec["inputTokens"], 1500)
        self.assertEqual(rec["outputTokens"], 750)
        self.assertEqual(rec["cacheReadTokens"], 40532608)
        self.assertEqual(rec["transcriptPath"],
                         _FULL_PAYLOAD["transcriptPath"])
        self.assertEqual(rec["transcriptSha16"], "1d432855c8a7dd26")
        self.assertIn("transcript=", rec["source"])
        self.assertIn("sha256-16=1d432855c8a7dd26", rec["source"])
        # compat preservada
        self.assertEqual(rec["cost_usd"], 0.421)
        self.assertEqual(rec["tokens_in"], 1500)

    def test_missing_fields_are_none_not_invented(self):
        payload = {"missionId": "m", "costUsd": 0.1, "tokensIn": 10, "tokensOut": 5,
                   "source": "s"}  # server antigo: sem cacheRead/path/sha
        rec = nf.transcript_cost_record({"missionId": "m"}, transport=_fake_transport(payload))
        self.assertIsNone(rec["cacheReadTokens"])
        self.assertIsNone(rec["transcriptPath"])
        self.assertIsNone(rec["transcriptSha16"])
        self.assertEqual(rec["costUsdEstimate"], 0.1)
        self.assertNotIn("transcript=", rec["source"])  # sem path não cita path

    def test_unmeasured_keeps_named_cause(self):
        payload = {"missionId": "m", "costUsd": None, "reason": "no-transcript"}
        rec = nf.transcript_cost_record({"missionId": "m"}, transport=_fake_transport(payload))
        self.assertIsNone(rec.get("costUsdEstimate"))
        self.assertEqual(rec["cost_unmeasured"], "spend_no-transcript")


# ROADMAP fixture (tmp) — 2 dívidas, 1 resolvida, 1 com tag operator-charged prio 3
ROADMAP_FIXTURE = """# ROADMAP TESTE

## 1. Itens pendentes

| ID proposto | Fonte | Escopo em 1 linha | Dependências | Prio | Estado |
|---|---|---|---|---|---|
| RD-MOPS-02 | test | conserta fixtures do plugin mission-ops | — | 1 | em execução |
| RD-OPS-09 | test | lookup de spend no orchestrate | — | 3 | [operator-charged] pendente |
| RD-XXX-01 | test | nada a ver com o componente | — | 3 | pendente |

## 3. Resolvidos

| Item de origem | Prova |
|---|---|
| RD-MOPS-01 | fechou com try/finally |
"""


class TestRoadmapDebts(unittest.TestCase):
    """(3) componente do promptFile → dívidas herdadas; cobrança do operator → P1."""

    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="rd-ops-debts-")
        self.roadmap = os.path.join(self.dir, "ROADMAP.md")
        with open(self.roadmap, "w", encoding="utf-8") as fh:
            fh.write(ROADMAP_FIXTURE)
        self.contract = os.path.join(self.dir, "missao-teste.md")
        with open(self.contract, "w", encoding="utf-8") as fh:
            fh.write("# MISSÃO T-01\n\n**Componente:** mission-ops (/root/.hermes/plugins/mission-ops)"
                     " + orchestrate.spend · **Prioridade:** 1 · **Autoria:** operator\n")

    def tearDown(self):
        import shutil
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_component_from_prompt_file(self):
        self.assertEqual(rd.mission_component(self.contract),
                         "mission-ops (/root/.hermes/plugins/mission-ops) + orchestrate.spend")
        self.assertIsNone(rd.mission_component(None))
        self.assertIsNone(rd.mission_component(os.path.join(self.dir, "nao-existe.md")))

    def test_tokens_no_noise(self):
        toks = rd.component_tokens("mission-ops (/root/.hermes/plugins/mission-ops) + orchestrate.spend")
        self.assertIn("mission-ops", toks)
        self.assertIn("orchestrate.spend", toks)
        self.assertNotIn("hermes", toks)
        self.assertNotIn("plugins", toks)

    def test_inherited_debts_relevant_only(self):
        debts = rd.inherited_debts(rd.mission_component(self.contract), self.roadmap,
                                   exclude_ids=["T-01"])
        ids = [d["id"] for d in debts]
        self.assertIn("RD-MOPS-02", ids)   # prefixo mapeado + cita mission-ops
        self.assertIn("RD-OPS-09", ids)    # prefixo mapeado
        self.assertNotIn("RD-XXX-01", ids)  # sem relação
        # resolvidos nunca vêm
        self.assertNotIn("RD-MOPS-01", ids)

    def test_operator_charged_promotion_idempotent(self):
        r1 = rd.promote_operator_charged(self.roadmap)
        self.assertEqual(r1["changed"], ["RD-OPS-09"])
        self.assertIsNone(r1["error"])
        text = open(self.roadmap, encoding="utf-8").read()
        line = next(l for l in text.splitlines() if "RD-OPS-09" in l)
        cells = [c.strip() for c in line.strip("|").split("|")]
        self.assertEqual(cells[4], "1")  # prio virou 1
        self.assertIn("[operator-charged]", line)  # tag preservada
        # idempotente: 2ª passada não muda nada
        r2 = rd.promote_operator_charged(self.roadmap)
        self.assertEqual(r2["changed"], [])

    def test_missing_roadmap_fail_open(self):
        r = rd.promote_operator_charged(os.path.join(self.dir, "ausente.md"))
        self.assertEqual(r["changed"], [])
        self.assertTrue(str(r["error"]).startswith("roadmap_ilegivel"))
        self.assertEqual(rd.inherited_debts("mission-ops", os.path.join(self.dir, "ausente.md")), [])

    def test_herdadas_line(self):
        debts = rd.inherited_debts(rd.mission_component(self.contract), self.roadmap)
        line = rd.herdadas_line(debts, "mission-ops")
        self.assertTrue(line.startswith("Dívidas herdadas: "))
        self.assertIn("RD-MOPS-02", line)
        self.assertTrue(rd.herdadas_line([], "mission-ops")
                        .startswith("Dívidas herdadas: nenhuma"))


class TestCloseWiring(unittest.TestCase):
    """(4) close inclui step inherited_debts + resp.inheritedDebtsLine (fail-open)."""

    def _close(self, ledger_extra=None):
        with TempState():
            mc.save_ledger({"missionId": "debt-close", "status": "dispatched",
                            "promptFile": self.contract, **(ledger_extra or {})})
            calls, track = track_calls()
            with mock.patch.object(mc, "run_herdr", track), \
                 mock.patch.object(mc.time, "sleep"), \
                 mock.patch.object(nf, "ENG_MCP_CALLS_OFF", True), \
                 mock.patch.object(rd, "DEFAULT_ROADMAP", self.roadmap):
                out = json.loads(PKG.handle_mission_close({"missionId": "debt-close"}))
            return out

    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="rd-ops-wire-")
        self.roadmap = os.path.join(self.dir, "ROADMAP.md")
        with open(self.roadmap, "w", encoding="utf-8") as fh:
            fh.write(ROADMAP_FIXTURE)
        self.contract = os.path.join(self.dir, "missao-debt-close.md")
        with open(self.contract, "w", encoding="utf-8") as fh:
            fh.write("**Componente:** mission-ops (/root/.hermes/plugins/mission-ops)\n")

    def tearDown(self):
        import shutil
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_close_carries_inherited_debts(self):
        out = self._close()
        self.assertTrue(out["ok"])
        step = next(s for s in out["steps"] if s["step"] == "inherited_debts")
        self.assertTrue(step["ok"])
        self.assertIn("mission-ops", str(step["component"]))
        self.assertIn("RD-MOPS-02", step["line"])
        self.assertIn("Dívidas herdadas: ", out["inheritedDebtsLine"])
        ids = [d["id"] for d in out["inheritedDebts"]]
        self.assertIn("RD-MOPS-02", ids)

    def test_close_fail_open_sem_roadmap(self):
        os.rename(self.roadmap, self.roadmap + ".ausente")
        out = self._close()
        self.assertTrue(out["ok"])  # close NUNCA derruba por dívida
        step = next(s for s in out["steps"] if s["step"] == "inherited_debts")
        self.assertIsNone(step["ok"])
        self.assertIn("roadmap_error", step)
        self.assertTrue(str(step["roadmap_error"]).startswith("roadmap_ilegivel"))
        self.assertIn("indisponível", step["line"])


class TestTemplateCustoClause(unittest.TestCase):
    """(5) DISPATCH_TEMPLATE com cláusula CUSTO, ainda inline."""

    def test_clause_present(self):
        body = PKG.mc.DISPATCH_TEMPLATE.format(prompt_file="/x/m.md", mission_id="T-02")
        self.assertIn("## Custo", body)
        self.assertIn("custo não medido", body)
        self.assertIn("RD-OPS-03-SPEND-01", body)

    def test_template_still_inline(self):
        self.assertLessEqual(len(PKG.mc.DISPATCH_TEMPLATE), PKG.mc.DISPATCH_INLINE_LIMIT,
                             "template passou do limite inline — despacho iria via arquivo")


if __name__ == "__main__":
    unittest.main()
