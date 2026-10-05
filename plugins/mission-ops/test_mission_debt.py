"""RD-DEBT-01 (DEBT-SWEEP-01) — ciclo de vida automático das dívidas herdadas.

Cobre (contrato item 7):
  R1 CAPTURA   — debt_sweep no close grava cada dívida herdada no registry
                 debts.jsonl ({debtId, texto, origem, componente, ts, status}).
  R2 DEDUPE    — mesma dívida citada por N missões = 1 registro com N fontes
                 (normalização barata + similaridade; zero LLM).
  R3 PROMOÇÃO  — worker-doable → intent dispatch_mission na fila do orquestrador
                 (contractFile se o padrão missao-<roadmapId>.md existe, senão
                 needsContract: true); credencial/orçamento → gate-operator.
  R4 ENVELHEC. — aberta > 3 dias prio 2; > 7 dias P1 + finding debt_aging no
                 bus (uma vez por dívida); citação do operator → P1 mecânico.
  R5 FECHAMENTO— missão dona fecha PASS → closed; verdict não-pass NUNCA fecha.
  R6 WIRING    — mission_close roda o passo debt_sweep (fail-open) e a tool
                 mission_debt consulta o painel (E2E do aceite do operator).

Run: python3 test_mission_debt.py   (estado 100% em tmp — /tmp do PROIBIDO vale
para provas cmd do verify; na suíte unittest tempfile é o padrão do plugin)
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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_mission_ops import PKG, TempState, track_calls  # noqa: E402

mc = PKG.mc
mdb = PKG.mdb


class DebtEnv(TempState):
    """TempState + registry/fila/bus/contratos de dívida em tmp."""

    def __enter__(self):
        super().__enter__()
        self.registry = str(Path(self.tmp) / "debts.jsonl")
        self.queue = str(Path(self.tmp) / "orchestrator-queue.jsonl")
        self.bus = str(Path(self.tmp) / "spool.jsonl")
        self.contracts = str(Path(self.tmp) / "contracts")
        os.makedirs(self.contracts, exist_ok=True)
        self._saved_env = (os.environ.get("MISSION_DEBTS_REGISTRY"),
                           os.environ.get("MISSION_ORCH_QUEUE"),
                           os.environ.get("MISSION_DEBTS_BUS"),
                           os.environ.get("MISSION_DEBTS_CONTRACT_DIR"))
        os.environ["MISSION_DEBTS_REGISTRY"] = self.registry
        os.environ["MISSION_ORCH_QUEUE"] = self.queue
        os.environ["MISSION_DEBTS_BUS"] = self.bus
        os.environ["MISSION_DEBTS_CONTRACT_DIR"] = self.contracts
        return self

    def __exit__(self, *exc):
        for key, old in zip(("MISSION_DEBTS_REGISTRY", "MISSION_ORCH_QUEUE",
                             "MISSION_DEBTS_BUS", "MISSION_DEBTS_CONTRACT_DIR"), self._saved_env):
            if old is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = old
        super().__exit__(*exc)


DEBT_ROW = {"id": "RD-EXEMPLO-01", "prio": "2", "estado": "aberto",
            "escopo": "migrar o relaunch do ready_regex_error para claude_launch_cmd"}


class TestCaptureDedupe(unittest.TestCase):
    """R1 + R2: captura e dedupe."""

    def test_captura_1_registro_com_campos_do_contrato(self):
        with DebtEnv() as env:
            res = mdb.capture("RD-EXEMPLO-01 — migrar relaunch", "M-A", "mission-ops",
                              roadmap_id="RD-EXEMPLO-01")
            self.assertTrue(res["ok"])
            rows = mdb.load_registry(env.registry)
            self.assertEqual(len(rows), 1)
            row = rows[0]
            for key in ("debtId", "texto", "origem", "componente", "ts", "status"):
                self.assertIn(key, row)
            self.assertEqual(row["status"], "open")
            self.assertEqual(row["origem"], "M-A")
            self.assertEqual(row["fontes"], ["M-A"])
            self.assertTrue(row["debtId"].startswith("DEBT-"))

    def test_dedupe_mesma_divida_1_registro_n_fontes(self):
        with DebtEnv() as env:
            mdb.capture("RD-EXEMPLO-01 — migrar relaunch", "M-A", "mission-ops")
            # mesma dívida, texto com ruído (case/pontuação/espaços) → dedupe
            res = mdb.capture("rd-exemplo-01 —   migrar  RELAUNCH!", "M-B", "mission-ops")
            self.assertTrue(res["ok"])
            self.assertTrue(res["deduped"])
            rows = mdb.load_registry(env.registry)
            self.assertEqual(len(rows), 1)
            self.assertEqual(sorted(rows[0]["fontes"]), ["M-A", "M-B"])
            self.assertEqual(rows[0]["origem"], "M-A")  # 1ª fonte preservada

    def test_dedupe_por_similaridade_barata_sem_llm(self):
        with DebtEnv() as env:
            mdb.capture("RD-EXEMPLO-01 — migrar o relaunch do ready_regex_error para claude_launch_cmd",
                        "M-A", "mission-ops")
            res = mdb.capture("RD-EXEMPLO-01 — migrar o relaunch do ready_regex_error "
                              "para claude_launch_cmd (revisado)", "M-B", "mission-ops")
            self.assertTrue(res["ok"])
            self.assertTrue(res["deduped"])
            self.assertEqual(len(mdb.load_registry(env.registry)), 1)

    def test_texto_vazio_erro_tipado(self):
        with DebtEnv():
            res = mdb.capture("  ", "M-A", "mission-ops")
            self.assertFalse(res["ok"])
            self.assertEqual(res["error"], "texto_vazio")


class TestPromocao(unittest.TestCase):
    """R3: promoção — fila automática vs gate-operator."""

    def test_worker_doable_vira_intent_na_fila_com_needs_contract(self):
        with DebtEnv() as env:
            cap = mdb.capture("RD-EXEMPLO-01 — migrar relaunch", "M-A", "mission-ops",
                              roadmap_id="RD-EXEMPLO-01")
            rows = mdb.load_registry(env.registry)
            cls = mdb.classify(rows[0])
            self.assertTrue(cls["ok"])
            self.assertEqual(cls["status"], "queued")
            qrows = [json.loads(l) for l in open(env.queue, encoding="utf-8")]
            self.assertEqual(len(qrows), 1)
            intent = qrows[0]
            self.assertEqual(intent["type"], "dispatch_mission")
            self.assertEqual(intent["payload"]["missionId"], cap["debtId"])
            self.assertTrue(intent["payload"]["needsContract"])  # sem contrato no padrão
            self.assertNotIn("contractFile", intent["payload"])
            self.assertEqual(intent["payload"]["spawnedBy"], "debt-sweep")
            self.assertEqual(intent["payload"]["debtId"], cap["debtId"])
            # registry marca queued + ownerMission (ligação missionId↔debtId)
            rows = mdb.load_registry(env.registry)
            self.assertEqual(rows[0]["status"], "queued")
            self.assertEqual(rows[0]["ownerMission"], cap["debtId"])

    def test_contrato_no_padrao_vai_no_payload(self):
        with DebtEnv() as env:
            Path(env.contracts, "missao-rd-exemplo-01.md").write_text("# contrato\n")
            mdb.capture("RD-EXEMPLO-01 — migrar relaunch", "M-A", "mission-ops",
                        roadmap_id="RD-EXEMPLO-01")
            rows = mdb.load_registry(env.registry)
            mdb.classify(rows[0])
            qrows = [json.loads(l) for l in open(env.queue, encoding="utf-8")]
            self.assertEqual(qrows[0]["payload"].get("contractFile"),
                             str(Path(env.contracts, "missao-rd-exemplo-01.md")))
            self.assertNotIn("needsContract", qrows[0]["payload"])

    def test_credencial_vira_gate_operator_sem_fila(self):
        with DebtEnv() as env:
            mdb.capture("renovar credencial do gateway (exige operator)", "M-A", "mission-ops")
            rows = mdb.load_registry(env.registry)
            cls = mdb.classify(rows[0])
            self.assertTrue(cls["ok"])
            self.assertEqual(cls["status"], "gate-operator")
            self.assertFalse(os.path.exists(env.queue))  # NUNCA na fila
            rows = mdb.load_registry(env.registry)
            self.assertEqual(rows[0]["status"], "gate-operator")

    def test_orcamento_vira_gate_operator(self):
        with DebtEnv() as env:
            mdb.capture("aumentar orçamento do pool de GPU com o operator", "M-A", "orchestrate")
            rows = mdb.load_registry(env.registry)
            self.assertEqual(mdb.classify(rows[0])["status"], "gate-operator")

    def test_promocao_idempotente_nao_duplica_fila(self):
        with DebtEnv() as env:
            mdb.capture("RD-EXEMPLO-01 — migrar relaunch", "M-A", "mission-ops")
            rows = mdb.load_registry(env.registry)
            mdb.classify(rows[0])
            rows2 = mdb.load_registry(env.registry)
            cls2 = mdb.classify(rows2[0])
            self.assertTrue(cls2["ok"])
            self.assertEqual(cls2["status"], "queued")
            self.assertEqual(cls2.get("note"), "já classificada")  # no-op idempotente
            qrows = [json.loads(l) for l in open(env.queue, encoding="utf-8")]
            self.assertEqual(len(qrows), 1)  # 1 intent só


class TestEnvelhecimento(unittest.TestCase):
    """R4: envelhecimento — prioridade e finding no bus."""

    def _capture_old(self, env, age_days):
        old = time.time() - age_days * 86400.0
        return mdb.capture("RD-EXEMPLO-01 — dívida envelhecida", "M-A", "mission-ops",
                           now=old)

    def test_mais_de_3_dias_sobe_prioridade(self):
        with DebtEnv() as env:
            self._capture_old(env, 4)
            ag = mdb.aging_scan()
            self.assertTrue(ag["ok"])
            self.assertIn(mdb.load_registry(env.registry)[0]["debtId"], ag["escalated"])
            self.assertEqual(mdb.load_registry(env.registry)[0]["prio"], 2)
            self.assertFalse(os.path.exists(env.bus))  # finding só > 7 dias

    def test_mais_de_7_dias_p1_e_finding_no_bus_uma_vez(self):
        with DebtEnv() as env:
            self._capture_old(env, 8)
            ag1 = mdb.aging_scan()
            self.assertTrue(ag1["ok"])
            row = mdb.load_registry(env.registry)[0]
            self.assertEqual(row["prio"], 1)
            self.assertIn(row["debtId"], ag1["findings"])
            self.assertTrue(os.path.exists(env.bus))
            self.assertIn("debt_aging", open(env.bus, encoding="utf-8").read())
            # idempotente: 2ª passada não re-emite finding
            ag2 = mdb.aging_scan()
            self.assertEqual(ag2["findings"], [])
            self.assertEqual(len([l for l in open(env.bus, encoding="utf-8")
                                  if "debt_aging" in l]), 1)

    def test_citacao_do_operator_vira_p1_mecanica(self):
        with DebtEnv() as env:
            cap = mdb.capture("RD-EXEMPLO-01 — migrar relaunch do relaunch path", "M-A",
                              "mission-ops")
            row = mdb.load_registry(env.registry)[0]
            res = mdb.cite("operator: resolve logo o %s por favor" % row["debtId"])
            self.assertTrue(res["ok"])
            self.assertIn(row["debtId"], res["matched"])
            self.assertEqual(res["promoted"], [row["debtId"]])
            row = mdb.load_registry(env.registry)[0]
            self.assertEqual(row["prio"], 1)
            self.assertEqual(row["p1Source"], "operator-chat")
            # idempotente: 2ª citação não re-promove
            res2 = mdb.cite("de novo o %s" % cap["debtId"])
            self.assertEqual(res2["promoted"], [])

    def test_citacao_por_texto_normalizado_sem_token(self):
        with DebtEnv() as env:
            mdb.capture("RD-EXEMPLO-01 — migrar o relaunch do ready_regex_error "
                        "para claude_launch_cmd", "M-A", "mission-ops",
                        roadmap_id="RD-EXEMPLO-01")
            # citação pelo roadmapId
            res = mdb.cite("pode resolver o RD-EXEMPLO-01 essa semana?")
            self.assertTrue(res["ok"])
            self.assertEqual(len(res["matched"]), 1)
            # citação pelo escopo sem ID (fala contém o texto normalizado da dívida)
            mdb.capture("RD-EXEMPLO-02 — auditar o guard de fecho do mission_close "
                        "por closes silenciosos", "M-A", "mission-ops")
            res2 = mdb.cite("feche a divida 'auditar o guard de fecho do mission_close "
                            "por closes silenciosos' hoje")
            self.assertTrue(res2["ok"])
            self.assertEqual(len(res2["matched"]), 1)

    def test_citacao_sem_match_nao_promove_nada(self):
        with DebtEnv() as env:
            mdb.capture("RD-EXEMPLO-01 — migrar o relaunch do ready_regex_error "
                        "para claude_launch_cmd", "M-A", "mission-ops")
            res = mdb.cite("quantas missões fecharam hoje?")
            self.assertTrue(res["ok"])
            self.assertEqual(res["matched"], [])
            self.assertEqual(res["promoted"], [])


class TestFechamento(unittest.TestCase):
    """R5: fecho — só por ledger PASS."""

    def _queued(self, env):
        mdb.capture("RD-EXEMPLO-01 — migrar relaunch", "M-A", "mission-ops")
        rows = mdb.load_registry(env.registry)
        mdb.classify(rows[0])
        rows = mdb.load_registry(env.registry)
        self.assertEqual(rows[0]["status"], "queued")
        return rows[0]["debtId"]

    def test_dona_fechou_pass_divida_closed(self):
        with DebtEnv() as env:
            debt_id = self._queued(env)
            # dona = a missão despachada para resolver (payload.missionId == debtId)
            cl = mdb.close_link(debt_id, "pass")
            self.assertTrue(cl["ok"])
            self.assertEqual(cl["closed"], [debt_id])
            row = mdb.load_registry(env.registry)[0]
            self.assertEqual(row["status"], "closed")
            self.assertEqual(row["closedByMission"], debt_id)
            self.assertEqual(row["closedByVerdict"], "pass")

    def test_verdict_nao_pass_nunca_fecha(self):
        with DebtEnv() as env:
            debt_id = self._queued(env)
            for verdict in ("fail", "red", None, "unverified_consequence"):
                cl = mdb.close_link(debt_id, verdict)
                self.assertEqual(cl["closed"], [], "verdict %r não fecha" % verdict)
            self.assertEqual(mdb.load_registry(env.registry)[0]["status"], "queued")

    def test_missao_que_deixou_a_divida_nao_a_fecha(self):
        with DebtEnv() as env:
            debt_id = self._queued(env)
            cl = mdb.close_link("M-A", "pass")  # M-A só citou a dívida (origem)
            self.assertEqual(cl["closed"], [])
            self.assertEqual(mdb.load_registry(env.registry)[0]["status"], "queued")


class TestDebtSweepE2E(unittest.TestCase):
    """R1+R3+R4+R5 encadeados + R6 (wiring no close e tool de consulta)."""

    def test_debt_sweep_captura_promove_e_fecha(self):
        with DebtEnv() as env:
            out = mdb.debt_sweep("M-1", "mission-ops", [dict(DEBT_ROW)],
                                 verdict=None, cancel=False)
            self.assertEqual(out["ok"], True)
            self.assertEqual(len(out["captured"]), 1)
            self.assertEqual(len(out["promoted"]), 1)
            debt_id = out["promoted"][0]
            rows = mdb.load_registry(env.registry)
            self.assertEqual(rows[0]["status"], "queued")
            # fecho real da missão dona fecha a dívida
            out2 = mdb.debt_sweep(debt_id, "mission-ops", [], verdict="pass")
            self.assertEqual(out2["closed"], [debt_id])
            self.assertEqual(mdb.load_registry(env.registry)[0]["status"], "closed")
            # nova captura após closed NÃO dedupe contra closed (reabre como novo)
            out3 = mdb.debt_sweep("M-2", "mission-ops", [dict(DEBT_ROW)])
            self.assertEqual(len(out3["captured"]), 1)

    def test_debt_sweep_cancel_nao_captura_nem_fecha(self):
        with DebtEnv() as env:
            out = mdb.debt_sweep("M-1", "mission-ops", [dict(DEBT_ROW)], cancel=True)
            self.assertIn(out.get("skipped"), ("cancel",))
            self.assertEqual(mdb.load_registry(env.registry), [])

    def test_debt_sweep_roadmap_error_fail_open(self):
        with DebtEnv():
            out = mdb.debt_sweep("M-1", "mission-ops", [], rd_err="roadmap_ilegivel: x")
            self.assertEqual(out["ok"], True)
            self.assertEqual(out["roadmapError"], "roadmap_ilegivel: x")

    def test_wiring_close_roda_debt_sweep_e_tool_consulta(self):
        """R6 E2E: mission_close (herdr mockado, manifesto verify no cwd tmp) roda o
        passo debt_sweep — captura a dívida herdada do ROADMAP tmp, promove o intent
        na fila tmp — e a tool mission_debt (aceite do painel do operator) lista."""
        with DebtEnv() as env:
            mid = "debtwire-%d" % os.getpid()
            cwd = Path(env.tmp) / "cwd"
            cwd.mkdir(parents=True, exist_ok=True)
            # RD-MOPS-RED-01: fecho bem-comportado (RELATORIO-<id>.md no cwd →
            # chatDeliverable) — o gate O1 do RD-OBEY-02 não promove dívida
            # obedience neste e2e, cujo escopo é o wiring do debt_sweep
            # (1 linha esperada no registry).
            (cwd / ("RELATORIO-%s.md" % mid)).write_text(
                "# relatório e2e %s\n" % mid, encoding="utf-8")
            (cwd / ("verify-%s.json" % mid)).write_text(json.dumps(
                {"mission": mid, "cmd": [{"run": "echo ok", "expect_exit": 0, "timeout": 30}]}),
                encoding="utf-8")
            prompt = Path(env.tmp) / "prompt.md"
            prompt.write_text("# M\n**Componente:** mission-ops\n", encoding="utf-8")
            # ROADMAP tmp com 1 linha do componente (rd.DEFAULT_ROADMAP é global de módulo)
            roadmap = Path(env.tmp) / "ROADMAP.md"
            roadmap.write_text(
                "## 1. Itens pendentes\n"
                "| ID proposto | Prio | Escopo | Autoria | Origem | Fila | DependsOn | Estado |\n"
                "|---|---|---|---|---|---|---|---|\n"
                "| RD-EXEMPLO-01 | 2 | migrar o relaunch no mission-ops | worker | close | - | - | aberto |\n",
                encoding="utf-8")
            mc.save_ledger({"missionId": mid, "paneId": "w9:pZ", "tabId": "w9:tZ",
                            "status": "dispatched", "cwd": str(cwd),
                            "promptFile": str(prompt)})
            real_run = __import__("subprocess").run

            def runner(cmd, *a, **kw):
                if isinstance(cmd, list) and "/opt/deliver-verify/verify.py" in cmd \
                        and "--ledger-dir" not in cmd:
                    cmd = cmd + ["--ledger-dir", str(mc.STATE_DIR)]
                return real_run(cmd, *a, **kw)

            with mock.patch.object(mc, "run_herdr", track_calls()[1]), \
                 mock.patch.object(mc.time, "sleep"), \
                 mock.patch.object(mc, "pane_exists", return_value=False), \
                 mock.patch.object(PKG.nf, "mission_completed",
                                   return_value={"ok": True, "emitted": True}), \
                 mock.patch.object(PKG.nf, "mission_reopened",
                                   return_value={"ok": True, "emitted": True}), \
                 mock.patch.object(PKG.subprocess, "run", side_effect=runner), \
                 mock.patch.object(PKG.rd, "DEFAULT_ROADMAP", str(roadmap)), \
                 mock.patch.object(PKG.vg, "emit_bus_event"):
                resp = json.loads(PKG.handle_mission_close({"missionId": mid}))
            steps = {s.get("step"): s for s in resp.get("steps", [])}
            ds = steps.get("debt_sweep")
            self.assertIsNotNone(ds, "close sem passo debt_sweep: %s" % list(steps))
            self.assertEqual(ds.get("ok"), True, ds)
            self.assertEqual(ds.get("captured"), 1, ds)
            self.assertEqual(ds.get("promoted"), 1, ds)
            # registry: 1 registro queued; fila tmp: 1 intent dispatch_mission
            rows = mdb.load_registry(env.registry)
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["status"], "queued")
            self.assertEqual(rows[0]["componente"], "mission-ops")
            self.assertEqual(rows[0]["origem"], mid)
            qrows = [json.loads(l) for l in open(env.queue, encoding="utf-8")]
            self.assertEqual(len(qrows), 1)
            self.assertEqual(qrows[0]["type"], "dispatch_mission")
            self.assertEqual(qrows[0]["payload"]["debtId"], rows[0]["debtId"])
            # o fecho da própria missão citante NÃO fecha a dívida dela (não é dona)
            self.assertEqual(mdb.load_registry(env.registry)[0]["status"], "queued")
            # aceite do operator: painel via tool handler
            panel = json.loads(PKG.handle_mission_debt({"action": "list"}))
            self.assertTrue(panel["ok"])
            self.assertEqual(panel["summary"]["total"], 1)
            self.assertEqual(panel["summary"]["queued"], 1)
            self.assertEqual(panel["records"][0]["debtId"], rows[0]["debtId"])

    def test_tool_cited_e_aging_pelo_handler(self):
        with DebtEnv() as env:
            cap = mdb.capture("RD-EXEMPLO-01 — migrar relaunch", "M-A", "mission-ops")
            res = json.loads(PKG.handle_mission_debt(
                {"action": "cited", "text": "feche já o %s" % cap["debtId"]}))
            self.assertTrue(res["ok"])
            self.assertEqual(res["promoted"], [cap["debtId"]])
            ag = json.loads(PKG.handle_mission_debt({"action": "aging"}))
            self.assertTrue(ag["ok"])
            lst = json.loads(PKG.handle_mission_debt({"action": "list", "status": "open",
                                                      "minAgeDays": 0}))
            self.assertTrue(lst["ok"])
            self.assertEqual(lst["records"][0]["prio"], 1)
            bad = json.loads(PKG.handle_mission_debt({"action": "inexistente"}))
            self.assertFalse(bad.get("ok", True))


if __name__ == "__main__":
    unittest.main(verbosity=1)
