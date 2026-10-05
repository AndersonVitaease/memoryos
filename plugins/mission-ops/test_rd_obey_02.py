#!/usr/bin/env python3
"""RD-OBEY-02 — obediência do supervisor por MECANISMO (não por memória).

  R1  Registry: ordens numeradas (O1..O5) parseadas do OBRIGACOES.md + hash de versão
  R2  SUP-ACK no boot: sup_ack {orders, hash} no bus + ack file; idempotente
  R3  Watchdog do ack: ordem nova desde o último ack = finding obligation_stale
      (1x por hash) até novo ack
  R4  Gates fail-open: close sem relatório entregável → violates-obligation-O1;
      ship direto da missão → violates-obligation-O2; despacho da fila fora do
      orquestrador → violates-obligation-O3 (ORCH_DAEMON_APPROVED isento)
  R5  Violação → missão automática: dívida tipada `obedience`, prio 1, intent
      dispatch_mission na fila AUTOMATICAMENTE; dedupe por ordem (1 dívida por ordem)
  R6  Score: % closes com chatIntegra, % ordens cumpridas, violações por ordem
      (hoje/7d); violação derruba o score, caminho feliz = 100%

Run: python3 test_rd_obey_02.py   (estado 100% em tmp via env; zero LLM)
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

import obey_registry as obr            # noqa: E402
import mission_debts as mdb            # noqa: E402


class ObeyEnv:
    """Estado 100% tmp: registry/queue/bus/events/ack redirecionados por env +
    paths explícitos (nada toca /root/.hermes nem /opt/mission-events)."""

    def __init__(self):
        self.tmp = tempfile.mkdtemp(prefix="rd-obey-02-")
        self.state = os.path.join(self.tmp, "state")
        self.registry = os.path.join(self.tmp, "debts.jsonl")
        self.queue = os.path.join(self.tmp, "orchestrator-queue.jsonl")
        self.spool = os.path.join(self.tmp, "spool.jsonl")
        self.events = os.path.join(self.state, "events.jsonl")
        self.obedience = os.path.join(self.state, "obedience.jsonl")
        self.ack = os.path.join(self.state, "obey-ack.json")
        self.contract_dir = os.path.join(self.tmp, "contracts")
        os.makedirs(self.state, exist_ok=True)
        os.makedirs(self.contract_dir, exist_ok=True)
        self._saved = {k: os.environ.get(k) for k in (
            "MISSION_DEBTS_REGISTRY", "MISSION_ORCH_QUEUE", "MISSION_OPS_SPOOL",
            "MISSION_OPS_STATE_DIR", "MISSION_DEBTS_CONTRACT_DIR",
            "MISSION_DEBTS_BUS", "ORCH_DAEMON_APPROVED")}

    def __enter__(self):
        os.environ["MISSION_DEBTS_REGISTRY"] = self.registry
        os.environ["MISSION_ORCH_QUEUE"] = self.queue
        os.environ["MISSION_OPS_SPOOL"] = self.spool
        os.environ["MISSION_OPS_STATE_DIR"] = self.state
        os.environ["MISSION_DEBTS_CONTRACT_DIR"] = self.contract_dir
        os.environ["MISSION_DEBTS_BUS"] = self.spool
        os.environ.pop("ORCH_DAEMON_APPROVED", None)
        return self

    def __exit__(self, *exc):
        for k, v in self._saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    # ---- leituras de prova
    def bus_kinds(self) -> list:
        if not os.path.exists(self.spool):
            return []
        with open(self.spool, encoding="utf-8") as f:
            return [json.loads(l).get("kind") for l in f if l.strip()]

    def queue_intents(self) -> list:
        if not os.path.exists(self.queue):
            return []
        with open(self.queue, encoding="utf-8") as f:
            return [json.loads(l) for l in f if l.strip()]

    def debt_rows(self) -> list:
        if not os.path.exists(self.registry):
            return []
        with open(self.registry, encoding="utf-8") as f:
            return [json.loads(l) for l in f if l.strip()]

    def obedience_rows(self) -> list:
        if not os.path.exists(self.obedience):
            return []
        with open(self.obedience, encoding="utf-8") as f:
            return [json.loads(l) for l in f if l.strip()]


class TestR1Registry(unittest.TestCase):
    """R1: parse das ordens numeradas + hash de versão."""

    def test_parse_real_source(self):
        orders = obr.load_orders()
        self.assertEqual([o["id"] for o in orders],
                         ["O1", "O2", "O3", "O4", "O5"])
        self.assertIn("Relatório", orders[0]["titulo"])
        self.assertIn("missão", orders[1]["titulo"])

    def test_parse_missing_file_failopen(self):
        self.assertEqual(obr.load_orders(path="/nonexistent/OBRIGACOES.md"), [])
        self.assertIsNone(obr.obligations_hash(path="/nonexistent/OBRIGACOES.md"))

    def test_hash_deterministic_and_versioned(self):
        with ObeyEnv() as env:
            src = os.path.join(env.tmp, "OBRIGACOES.md")
            obr_hash1 = None
            with open(src, "w", encoding="utf-8") as f:
                f.write("# OBRIGACOES\n\n1. **Ordem um** — texto\n\n2. **Ordem dois** — texto\n")
            obr_hash1 = obr.obligations_hash(src)
            self.assertEqual(obr_hash1, obr.obligations_hash(src))
            with open(src, "a", encoding="utf-8") as f:
                f.write("\n3. **Ordem três** — nova ordem do operator\n")
            obr_hash2 = obr.obligations_hash(src)
            self.assertNotEqual(obr_hash1, obr_hash2)
            ids = [o["id"] for o in obr.load_orders(src)]
            self.assertEqual(ids, ["O1", "O2", "O3"])


class TestR2SupAck(unittest.TestCase):
    """R2: SUP-ACK no boot — bus + ack file, idempotente."""

    def test_ack_written_then_noop(self):
        with ObeyEnv() as env:
            r1 = obr.sup_ack(spool_path=env.spool, ack_path=env.ack)
            self.assertTrue(r1["ok"])
            self.assertEqual(r1["ack"], "written")
            self.assertEqual(r1["orders"], ["O1", "O2", "O3", "O4", "O5"])
            self.assertIn("sup_ack", env.bus_kinds())
            ack = obr.read_ack(env.ack)
            self.assertEqual(ack["hash"], obr.obligations_hash())
            r2 = obr.sup_ack(spool_path=env.spool, ack_path=env.ack)
            self.assertEqual(r2["ack"], "no_op")
            self.assertEqual(env.bus_kinds().count("sup_ack"), 1)

    def test_ack_missing_source_failopen(self):
        with ObeyEnv() as env:
            r = obr.sup_ack(spool_path=env.spool, ack_path=env.ack,
                            path="/nonexistent/OBRIGACOES.md")
            self.assertFalse(r["ok"])
            self.assertEqual(r.get("reason"), "sem_fonte_ou_vazia")


class TestR3StaleWatchdog(unittest.TestCase):
    """R3: ordem nova desde o último ack = obligation_stale até novo ack."""

    def test_stale_after_order_change_once(self):
        with ObeyEnv() as env:
            src = os.path.join(env.tmp, "OBRIGACOES.md")
            obr.sup_ack(spool_path=env.spool, ack_path=env.ack, path=src)
            s0 = obr.check_stale(spool_path=env.spool, ack_path=env.ack, path=src)
            self.assertFalse(s0["stale"])
            with open(src, "a", encoding="utf-8") as f:
                f.write("\n6. **Ordem nova** — sem ack ainda\n")
            s1 = obr.check_stale(spool_path=env.spool, ack_path=env.ack, path=src)
            self.assertTrue(s1["stale"])
            self.assertTrue(s1["emitted"])
            self.assertIn("obligation_stale", env.bus_kinds())
            s2 = obr.check_stale(spool_path=env.spool, ack_path=env.ack, path=src)
            self.assertTrue(s2["stale"])
            self.assertNotIn("emitted", s2)  # dedupe: 1x por hash
            self.assertEqual(env.bus_kinds().count("obligation_stale"), 1)
            # novo ack limpa o stale (novo boot do plugin re-acka)
            obr.sup_ack(spool_path=env.spool, ack_path=env.ack, path=src)
            s3 = obr.check_stale(spool_path=env.spool, ack_path=env.ack, path=src)
            self.assertFalse(s3["stale"])


class TestR4Gates(unittest.TestCase):
    """R4: gates mutantes marcando violação tipada — SEMPRE fail-open."""

    def test_close_without_deliverable_marks_o1(self):
        with ObeyEnv() as env:
            resp = obr.gate_close("RD-TEST-X", {"ok": True},
                                  spool_path=env.spool, obedience_path=env.obedience,
                                  registry=env.registry, queue=env.queue)
            codes = [w["code"] for w in resp["obeyWarnings"]]
            self.assertEqual(codes, ["violates-obligation-O1"])
            viol = env.obedience_rows()
            self.assertEqual(len(viol), 1)
            self.assertEqual(viol[0]["obligation"], "O1")
            self.assertIn("violates-obligation-O1", env.bus_kinds())
            # events.jsonl de missão NÃO é poluído (last_event permanece do fecho)
            self.assertNotIn("violates-obligation-O1", env.event_names() if os.path.exists(env.events) else [])
            rows = env.debt_rows()
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["tipo"], "obedience")
            self.assertEqual(rows[0]["prio"], 1)
            self.assertEqual(rows[0]["obligation"], "O1")
            intents = env.queue_intents()
            self.assertEqual(len(intents), 1)
            self.assertEqual(intents[0]["type"], "dispatch_mission")
            self.assertEqual(intents[0]["payload"]["debtId"], rows[0]["debtId"])
            self.assertEqual(intents[0]["priority"], 1)
            self.assertTrue(intents[0]["payload"].get("needsContract"))
            self.assertIn("O1", intents[0]["payload"]["summary"])

    def test_close_with_deliverable_no_violation(self):
        with ObeyEnv() as env:
            resp = obr.gate_close(
                "RD-TEST-X",
                {"ok": True, "chatDeliverable": {"path": "/x/RELATORIO-RD-TEST-X.md",
                                                 "content": "# relatório integral"}},
                spool_path=env.spool, obedience_path=env.obedience,
                registry=env.registry, queue=env.queue)
            self.assertEqual(resp["obeyWarnings"], [])
            self.assertEqual(env.debt_rows(), [])
            self.assertEqual(env.queue_intents(), [])

    def test_close_o2_only_this_mission(self):
        with ObeyEnv() as env:
            resp = obr.gate_close(
                "RD-TEST-X",
                {"ok": True,
                 "chatDeliverable": {"content": "# ok"},
                 "directShipViolations": [
                     {"missionId": "RD-TEST-X", "match": "git push", "pattern": r"push"},
                     {"missionId": "OUTRA-01", "match": "git push", "pattern": r"push"}]},
                spool_path=env.spool, obedience_path=env.obedience,
                registry=env.registry, queue=env.queue)
            codes = [w["code"] for w in resp["obeyWarnings"]]
            self.assertEqual(codes, ["violates-obligation-O2"])
            self.assertIn("git push", resp["obeyWarnings"][0]["detail"])

    def test_dispatch_o3_with_pending_queue(self):
        with ObeyEnv() as env:
            with open(env.queue, "w", encoding="utf-8") as f:
                f.write(json.dumps({"id": "orch-1", "type": "dispatch_mission",
                                    "payload": {}, "priority": 2}) + "\n")
            with mock.patch.dict(os.environ, {}, clear=False):
                os.environ.pop("ORCH_DAEMON_APPROVED", None)
                w = obr.gate_dispatch("RD-TEST-X", spool_path=env.spool,
                                      obedience_path=env.obedience,
                                      registry=env.registry, queue=env.queue,
                                      queue_path=env.queue)
            self.assertEqual([x["code"] for x in w], ["violates-obligation-O3"])
            self.assertIn("violates-obligation-O3", env.bus_kinds())

    def test_dispatch_clean_paths(self):
        with ObeyEnv() as env:
            w = obr.gate_dispatch("RD-TEST-X", spool_path=env.spool,
                                  obedience_path=env.obedience,
                                  registry=env.registry, queue=env.queue,
                                  queue_path=env.queue)
            self.assertEqual(w, [])  # fila vazia = sem violação
            with open(env.queue, "w", encoding="utf-8") as f:
                f.write(json.dumps({"id": "orch-2", "type": "dispatch_mission",
                                    "payload": {}, "priority": 2}) + "\n")
            with mock.patch.dict(os.environ, {"ORCH_DAEMON_APPROVED": "1"}):
                w2 = obr.gate_dispatch("RD-TEST-X", spool_path=env.spool,
                                       obedience_path=env.obedience,
                                       registry=env.registry, queue=env.queue,
                                       queue_path=env.queue)
            self.assertEqual(w2, [])  # chamador É o orquestrador = sem violação

    def test_gate_never_raises(self):
        """Fail-open estrutural: registry/queue ilegíveis nunca derrubam o gate."""
        with ObeyEnv() as env:
            with open(env.registry, "w", encoding="utf-8") as f:
                f.write("isto não é json\n")
            resp = obr.gate_close("RD-TEST-X", {"ok": True},
                                  spool_path=env.spool, obedience_path=env.obedience,
                                  registry=env.registry, queue=env.queue)
            self.assertTrue(resp.get("ok"))  # close segue de pé (fail-open)
            self.assertTrue(resp["obeyWarnings"][0]["debt"].get("ok") is False
                            or "error" in resp["obeyWarnings"][0]["debt"])


class TestR5ViolationToMission(unittest.TestCase):
    """R5: violação gera a própria correção na fila — dedupe por ordem."""

    def test_repeat_violation_single_debt_single_intent(self):
        with ObeyEnv() as env:
            for i in range(2):
                obr.gate_close("RD-TEST-X%d" % i, {"ok": True},
                               spool_path=env.spool, obedience_path=env.obedience,
                               registry=env.registry, queue=env.queue)
            rows = env.debt_rows()
            self.assertEqual(len(rows), 1)          # 1 dívida por ordem (dedupe)
            self.assertEqual(len(env.queue_intents()), 1)  # 1 intent, sem spam
            self.assertEqual(rows[0]["fontes"], ["obey:RD-TEST-X0", "obey:RD-TEST-X1"])

    def test_obey_promote_bypasses_gate(self):
        """gate_bypass: correção de obediência vai à fila mesmo com palavra de gate."""
        with ObeyEnv() as env:
            r = mdb.obey_promote("O1", "Obediência O1 (violada): relatório — orçamento",
                                 "obey:RD-TEST-Y", registry=env.registry,
                                 queue=env.queue)
            self.assertTrue(r["ok"])
            self.assertEqual(r["status"], "queued")   # NÃO gate-operator
            self.assertEqual(r["needsContract"], True)
            rows = env.debt_rows()
            self.assertEqual(rows[0]["tipo"], "obedience")
            self.assertEqual(rows[0]["prio"], 1)


class TestR6Score(unittest.TestCase):
    """R6: score de obediência — violação desce; caminho feliz = 100%."""

    def _append_event(self, path, mid, event, detail=None):
        # RD-MOPS-RED-01: score() é read-only por desenho (lê via _read_events) —
        # a injeção de eventos no arquivo tipado é plumbing do teste (em produção
        # mission_core segue sendo o único escritor do events.jsonl). ts epoch
        # float: formato aceito por score._ts.
        row = {"ts": time.time(), "missionId": mid, "event": event}
        if detail:
            row["detail"] = detail
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(row) + "\n")

    def _close_event(self, env, mid):
        self._append_event(env.events, mid, "mission_closed", "fecho")

    def test_happy_path_score_100(self):
        with ObeyEnv() as env:
            obr.sup_ack(spool_path=env.spool, ack_path=env.ack)
            self._close_event(env, "RD-OK-1")
            self._close_event(env, "RD-OK-2")
            self._append_event(env.events, "RD-OK-1", "relatorio_integra_delivered", "colado")
            self._append_event(env.events, "RD-OK-2", "relatorio_integra_delivered", "colado")
            s = obr.score(events_path=env.events, obedience_path=env.obedience,
                          path=os.path.join(os.path.dirname(obr.__file__),
                                            "OBRIGACOES.md"))
            w = s["windows"]["hoje"]
            self.assertEqual(w["closes"], 2)
            self.assertEqual(w["closesChatIntegraOk"], 2)
            self.assertEqual(w["pctClosesChatIntegra"], 100.0)
            self.assertEqual(w["violacoesPorOrdem"], {})
            self.assertEqual(w["pctOrdensCumpridas"], 100.0)
            self.assertFalse(s["stale"])

    def test_violation_drops_score(self):
        with ObeyEnv() as env:
            obr.sup_ack(spool_path=env.spool, ack_path=env.ack)
            self._close_event(env, "RD-BAD-1")
            obr._append_violation(env.obedience, "RD-BAD-1", "O1",
                                  "close sem relatório entregável")
            self._close_event(env, "RD-OK-1")
            self._append_event(env.events, "RD-OK-1", "relatorio_integra_delivered", "colado")
            s = obr.score(events_path=env.events, obedience_path=env.obedience,
                          path=os.path.join(os.path.dirname(obr.__file__),
                                            "OBRIGACOES.md"))
            w = s["windows"]["hoje"]
            self.assertEqual(w["closes"], 2)
            self.assertEqual(w["closesChatIntegraOk"], 1)
            self.assertEqual(w["pctClosesChatIntegra"], 50.0)
            self.assertEqual(w["violacoesPorOrdem"], {"O1": 1})
            self.assertEqual(w["ordensCumpridas"], 4)   # 4 de 5 ordens sem violação
            self.assertEqual(w["pctOrdensCumpridas"], 80.0)

    def test_score_readonly_never_raises(self):
        with ObeyEnv() as env:
            s = obr.score(events_path=os.path.join(env.tmp, "nao-existe.jsonl"),
                          obedience_path=os.path.join(env.tmp, "nao-existe2.jsonl"),
                          path="/nonexistent/OBRIGACOES.md")
            self.assertTrue(s["ok"])  # fail-open: score vazio, nunca exceção
            self.assertEqual(s["orders"], ["O1", "O2", "O3", "O4", "O5"])


class TestE2EHandler(unittest.TestCase):
    """Item 6 (aceite): superfície da tool mission_obey no handler real."""

    @classmethod
    def setUpClass(cls):
        import test_mission_ops
        cls.PKG = test_mission_ops.PKG

    def test_mission_obey_score_tool(self):
        with ObeyEnv() as env:
            obr.sup_ack(spool_path=env.spool, ack_path=env.ack)
            out = json.loads(self.PKG._handle_mission_obey({"action": "score"}))
            self.assertTrue(out["ok"])
            self.assertIn("hoje", out["windows"])
            self.assertIn("7d", out["windows"])
            self.assertIn("obligationsHash", out)
            stale = json.loads(self.PKG._handle_mission_obey({"action": "stale"}))
            self.assertIn("stale", stale)
            bad = json.loads(self.PKG._handle_mission_obey({"action": "xpto"}))
            self.assertEqual(bad.get("error"), "BAD_REQUEST")


if __name__ == "__main__":
    unittest.main(verbosity=2)
