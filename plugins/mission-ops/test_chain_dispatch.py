"""CHAIN-DISPATCH-GOV-01 — governança de despacho em cadeia (red→green por caso).

  (a) worker SEM badge despacha → recusa determinística citando a missão de origem + trilha
  (b) worker COM badge (allow_chain_dispatch: true) → aceito, spawned_by/chain_depth no ledger
  (c) neto (profundidade 2) → recusa CHAIN_DEPTH_EXCEEDED (mission.chain_depth_max, default 1)
  (d) supervisor/operator despacham normalmente (regressão zero) — spawned_by gravado
  (e) ledger antigo sem os campos carrega sem erro (loader/list/status)

Emissor: HERDR_PANE_ID do processo chamador casado com o paneId de um ledger vivo = worker
daquela missão (vence qualquer spawnedBy declarado — anti-spoof). Sem pane de missão: arg
spawnedBy (operator | supervisor:hermes | <missionId>) > pane herdr qualquer = operator >
sem pane (gateway) = supervisor:hermes.

Run: python3 test_chain_dispatch.py
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_mission_ops import PKG, TempState  # noqa: E402

mc = PKG.mc

READY = "? for shortcuts"


class ChainCase(unittest.TestCase):
    def setUp(self):
        self.ts = TempState().__enter__()
        self.addCleanup(self.ts.__exit__)
        self.spool = Path(self.ts.tmp) / "spool.jsonl"
        self.cfg = Path(self.ts.tmp) / "config.yaml"
        p1 = mock.patch.object(PKG, "_MISSION_SPOOL", str(self.spool))
        p2 = mock.patch.object(mc, "CONFIG_PATH", self.cfg)
        for p in (p1, p2):
            p.start()
            self.addCleanup(p.stop)

    def prompt(self, name: str, body: str = "# missão\n") -> str:
        p = Path(self.ts.tmp) / "missions" / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(body, encoding="utf-8")
        return str(p)

    def parent(self, mid: str, pane: str, body: str = "# pai\n", **extra) -> None:
        led = {"missionId": mid, "paneId": pane, "tabId": "t-" + mid, "status": "dispatched",
               "promptFile": self.prompt(mid + ".md", body), "cwd": self.ts.tmp}
        led.update(extra)
        mc.save_ledger(led)

    def dispatch(self, mid: str, env_pane: str = "", **args):
        """Despacho com herdr todo mockado; devolve (resposta, tab_create mock)."""
        body = args.pop("body", "# filho\n")
        a = {"missionId": mid, "promptFile": self.prompt(mid + ".md", body)}
        a.update(args)
        tc = mock.Mock(return_value=("t-" + mid, "w9:p" + mid, None))
        with mock.patch.dict(os.environ, {"HERDR_PANE_ID": env_pane}), \
             mock.patch.object(mc, "tab_create", tc), \
             mock.patch.object(mc, "tab_rename", return_value=None), \
             mock.patch.object(mc, "run_command", return_value=None), \
             mock.patch.object(mc, "wait_output", return_value=(READY, None)), \
             mock.patch.object(mc, "deliver_prompt", return_value=(True, None)), \
             mock.patch.object(mc, "latest_session_id", return_value=None):
            return json.loads(PKG.handle_mission_dispatch(a)), tc

    def spool_events(self):
        if not self.spool.exists():
            return []
        return [json.loads(l) for l in self.spool.read_text().splitlines() if l.strip()]

    def chain_events(self, mid: str):
        return [e for e in self.spool_events()
                if e.get("kind") == "chain_dispatch" and e.get("mission_id") == mid]


class TestA_WorkerWithoutBadge(ChainCase):
    def test_worker_pane_refused_with_trail(self):
        self.parent("pai-01", "w9:pPAI")
        res, tc = self.dispatch("filho-01", env_pane="w9:pPAI")
        self.assertFalse(res["ok"])
        self.assertEqual(res["error"], "CHAIN_DISPATCH_NOT_ALLOWED")
        self.assertIn("pai-01", res["detail"])
        self.assertIn("allow_chain_dispatch", res["detail"])
        tc.assert_not_called()                       # nada de herdr: recusa tier-1
        self.assertIsNone(mc.load_ledger("filho-01"))  # missão recusada não nasce
        ev = self.chain_events("filho-01")
        self.assertEqual(len(ev), 1)
        self.assertEqual(ev[0]["spawned_by"], "pai-01")
        self.assertEqual(ev[0]["chain_depth"], 1)
        self.assertEqual(ev[0]["verdict"], "refused")
        self.assertEqual(ev[0]["reason"], "CHAIN_DISPATCH_NOT_ALLOWED")
        local = (self.ts.state / "events.jsonl").read_text()
        self.assertIn("chain_dispatch_refused", local)

    def test_declared_spawned_by_mission_refused(self):
        # gateway sem pane, mas o chamador declara ser a missão pai-01 → mesma regra
        self.parent("pai-01", "w9:pPAI")
        res, tc = self.dispatch("filho-01", spawnedBy="pai-01")
        self.assertEqual(res.get("error"), "CHAIN_DISPATCH_NOT_ALLOWED")
        tc.assert_not_called()

    def test_worker_cannot_spoof_supervisor(self):
        self.parent("pai-01", "w9:pPAI")
        res, tc = self.dispatch("filho-01", env_pane="w9:pPAI", spawnedBy="supervisor:hermes")
        self.assertEqual(res.get("error"), "CHAIN_DISPATCH_NOT_ALLOWED")
        tc.assert_not_called()
        self.assertEqual(self.chain_events("filho-01")[0]["declared"], "supervisor:hermes")

    def test_self_grant_after_dispatch_does_not_count(self):
        # ledger gravou allow_chain_dispatch=false NO DESPACHO; worker edita o próprio prompt
        self.parent("pai-01", "w9:pPAI", body="allow_chain_dispatch: true\n",
                    allow_chain_dispatch=False)
        res, tc = self.dispatch("filho-01", env_pane="w9:pPAI")
        self.assertEqual(res.get("error"), "CHAIN_DISPATCH_NOT_ALLOWED")
        tc.assert_not_called()

    def test_unknown_declared_parent_refused(self):
        res, tc = self.dispatch("filho-01", spawnedBy="missao-fantasma-01")
        self.assertEqual(res.get("error"), "CHAIN_PARENT_UNKNOWN")
        tc.assert_not_called()
        self.assertEqual(self.chain_events("filho-01")[0]["verdict"], "refused")


class TestB_WorkerWithBadge(ChainCase):
    def test_badge_accepted_and_recorded(self):
        self.parent("pai-01", "w9:pPAI", body="# pai\n- `allow_chain_dispatch: true`\n")
        res, tc = self.dispatch("filho-01", env_pane="w9:pPAI")
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["status"], "dispatched")
        self.assertEqual(res["spawned_by"], "pai-01")
        tc.assert_called_once()
        led = mc.load_ledger("filho-01")
        self.assertEqual(led["spawned_by"], "pai-01")
        self.assertEqual(led["chain_depth"], 1)
        ev = self.chain_events("filho-01")
        self.assertEqual([e["verdict"] for e in ev], ["accepted"])
        self.assertEqual(ev[0]["chain_depth"], 1)

    def test_badge_recorded_on_ledger_at_dispatch(self):
        res, _ = self.dispatch("pai-02", body="allow_chain_dispatch: true\n")
        self.assertTrue(res["ok"], res)
        self.assertIs(mc.load_ledger("pai-02")["allow_chain_dispatch"], True)
        res, _ = self.dispatch("pai-03")
        self.assertIs(mc.load_ledger("pai-03")["allow_chain_dispatch"], False)


class TestC_DepthLimit(ChainCase):
    def test_grandchild_refused_by_default(self):
        self.parent("filho-01", "w9:pF", body="allow_chain_dispatch: true\n",
                    spawned_by="pai-01", chain_depth=1, allow_chain_dispatch=True)
        res, tc = self.dispatch("neto-01", env_pane="w9:pF")
        self.assertFalse(res["ok"])
        self.assertEqual(res["error"], "CHAIN_DEPTH_EXCEEDED")
        self.assertIn("filho-01", res["detail"])
        self.assertIn("chain_depth_max", res["detail"])
        tc.assert_not_called()
        self.assertIsNone(mc.load_ledger("neto-01"))
        ev = self.chain_events("neto-01")[0]
        self.assertEqual((ev["spawned_by"], ev["chain_depth"], ev["verdict"]),
                         ("filho-01", 2, "refused"))
        self.assertEqual(ev["chain_depth_max"], 1)

    def test_depth_configurable(self):
        self.cfg.write_text("model:\n  default: x\nmission:\n  # governança\n"
                            "  chain_depth_max: 2\ncron:\n  a: 1\n", encoding="utf-8")
        self.parent("filho-01", "w9:pF", spawned_by="pai-01", chain_depth=1,
                    allow_chain_dispatch=True)
        res, _ = self.dispatch("neto-01", env_pane="w9:pF")
        self.assertTrue(res["ok"], res)
        self.assertEqual(mc.load_ledger("neto-01")["chain_depth"], 2)

    def test_depth_zero_blocks_any_worker(self):
        self.cfg.write_text("mission:\n  chain_depth_max: 0\n", encoding="utf-8")
        self.parent("pai-01", "w9:pPAI", allow_chain_dispatch=True)
        res, _ = self.dispatch("filho-01", env_pane="w9:pPAI")
        self.assertEqual(res.get("error"), "CHAIN_DEPTH_EXCEEDED")

    def test_config_parser(self):
        self.assertEqual(mc.chain_depth_max(), 1)  # sem arquivo
        for text, want in [("mission:\n  chain_depth_max: 3\n", 3),
                           ("mission:\n  chain_depth_max: 3  # comentário\n", 3),
                           ("mission:\n  other: 1\n", 1),
                           ("other:\n  chain_depth_max: 5\n", 1),   # fora do bloco mission
                           ("mission:\n  chain_depth_max: -2\n", 1),
                           ("mission:\n  chain_depth_max: lixo\n", 1),
                           ("::: não é yaml\n", 1)]:
            self.cfg.write_text(text, encoding="utf-8")
            self.assertEqual(mc.chain_depth_max(), want, text)


class TestD_SupervisorOperator(ChainCase):
    def test_supervisor_default_no_pane(self):
        res, tc = self.dispatch("sup-01")
        self.assertTrue(res["ok"], res)
        tc.assert_called_once()
        led = mc.load_ledger("sup-01")
        self.assertEqual((led["spawned_by"], led["chain_depth"]), ("supervisor:hermes", 0))
        ev = self.chain_events("sup-01")
        self.assertEqual([(e["spawned_by"], e["verdict"]) for e in ev],
                         [("supervisor:hermes", "accepted")])

    def test_operator_declared(self):
        res, _ = self.dispatch("op-01", spawnedBy="operator")
        self.assertTrue(res["ok"], res)
        self.assertEqual(mc.load_ledger("op-01")["spawned_by"], "operator")

    def test_non_mission_pane_is_operator(self):
        self.parent("fechada-01", "w9:pX", status="closed")  # pane de missão FECHADA não conta
        res, _ = self.dispatch("op-02", env_pane="w9:pX")
        self.assertTrue(res["ok"], res)
        self.assertEqual(mc.load_ledger("op-02")["spawned_by"], "operator")

    def test_supervisor_unaffected_by_depth_zero(self):
        self.cfg.write_text("mission:\n  chain_depth_max: 0\n", encoding="utf-8")
        res, _ = self.dispatch("sup-02", spawnedBy="supervisor:hermes")
        self.assertTrue(res["ok"], res)

    def test_idempotent_no_op_keeps_working(self):
        self.parent("sup-03", "w9:pS")
        res, tc = self.dispatch("sup-03")
        self.assertEqual(res["status"], "no_op")
        tc.assert_not_called()


class TestE_LegacyLedger(ChainCase):
    def test_legacy_ledger_loads_and_is_depth_zero(self):
        legacy = {"missionId": "velha-01", "paneId": "w9:pV", "status": "dispatched",
                  "promptFile": self.prompt("velha-01.md", "allow_chain_dispatch: true\n")}
        (self.ts.state).mkdir(parents=True, exist_ok=True)
        (self.ts.state / "velha-01.json").write_text(json.dumps(legacy), encoding="utf-8")
        led = mc.load_ledger("velha-01")
        self.assertEqual(led["missionId"], "velha-01")
        self.assertNotIn("spawned_by", led)
        self.assertEqual([l["missionId"] for l in mc.list_ledgers()], ["velha-01"])
        st = json.loads(PKG.handle_mission_status({"missionId": "velha-01"}))
        self.assertTrue(st["ok"], st)
        info = mc.chain_info(led)
        self.assertEqual((info["spawned_by"], info["chain_depth"], info["allow_chain_dispatch"]),
                         (None, 0, True))  # legado: badge lido do prompt, profundidade 0
        # legado com badge no prompt despacha filho em profundidade 1
        res, _ = self.dispatch("filho-v", env_pane="w9:pV")
        self.assertTrue(res["ok"], res)
        self.assertEqual(mc.load_ledger("filho-v")["chain_depth"], 1)


class TestF_ChainBasisPayload(ChainCase):
    """ORCH-CHAIN-CWD-01 — consume do orquestrador: pai da cadeia EXCLUSIVAMENTE do
    payload.spawnedBy (chainBasis=payload); ambiente (pane) nunca decide. O caso do
    incidente: daemon rodando num pane de missão viva inferia o pai da cadeia do
    ambiente e recusava CHAIN_DISPATCH_NOT_ALLOWED antes de dead-letter."""

    def test_payload_beats_worker_pane_incident_case(self):
        # (a) intent com spawnedBy explícito → 1ª tentativa aceita, zero dead-letter:
        # daemon no pane do worker pai-01 (sem badge) já NÃO infere o pai do ambiente.
        self.parent("pai-01", "w9:pPAI")  # ledger sem badge — inferência de pane recusaria
        res, tc = self.dispatch("filho-01", env_pane="w9:pPAI",
                                spawnedBy="operator", chainBasis="payload")
        self.assertTrue(res["ok"], res)
        led = mc.load_ledger("filho-01")
        self.assertEqual(led["spawned_by"], "operator")   # payload, não ambiente
        self.assertEqual(led["chain_depth"], 0)
        tc.assert_called_once()
        ev = self.chain_events("filho-01")[0]
        self.assertEqual(ev["chain_basis"], "payload")
        self.assertEqual(ev["spawned_by"], "operator")
        self.assertEqual(ev["verdict"], "accepted")

    def test_payload_parent_mission_counts_depth_from_it(self):
        # depth contado a partir do payload.spawnedBy: pai em profundidade 0 → filho 1.
        self.parent("pai-01", "w9:pPAI", body="allow_chain_dispatch: true\n")
        res, _ = self.dispatch("filho-01", spawnedBy="pai-01", chainBasis="payload")
        self.assertTrue(res["ok"], res)
        self.assertEqual(mc.load_ledger("filho-01")["chain_depth"], 1)
        # neto pela mesma via estoura o teto (payload não fura chain_depth_max)
        self.dispatch("neto-01", spawnedBy="filho-01", chainBasis="payload")
        ev = self.chain_events("neto-01")[-1]
        self.assertEqual((ev["reason"], ev["chain_depth"]), ("CHAIN_DEPTH_EXCEEDED", 2))

    def test_payload_empty_declared_refused(self):
        # (c) declaração vazia sob payload → fail-closed (ambiente nunca vira supervisor)
        res, tc = self.dispatch("filho-02", chainBasis="payload")
        self.assertEqual(res.get("error"), "CHAIN_PARENT_UNKNOWN")
        tc.assert_not_called()
        self.assertIsNone(mc.load_ledger("filho-02"))

    def test_payload_unknown_mission_refused_not_supervisor(self):
        res, tc = self.dispatch("filho-03", spawnedBy="missao-fantasma-01", chainBasis="payload")
        self.assertEqual(res.get("error"), "CHAIN_PARENT_UNKNOWN")
        tc.assert_not_called()

    def test_payload_parent_without_ledger_refused(self):
        self.parent("pai-01", "w9:pPAI", status="closed")  # pai existe mas fechado
        res, tc = self.dispatch("filho-04", spawnedBy="pai-01", chainBasis="payload")
        # ledger fechado AINDA é ledger: chain_gate conta profundidade a partir dele
        self.assertEqual(res.get("error"), "CHAIN_DISPATCH_NOT_ALLOWED")
        tc.assert_not_called()
        ev = self.chain_events("filho-04")[0]
        self.assertEqual(ev["chain_depth"], 1)

    def test_auto_basis_keeps_legacy_pane_precedence(self):
        # regressão: sem chainBasis (=auto) o pane de missão viva vence a declaração
        # (anti-spoof CHAIN-DISPATCH-GOV-01 intocado).
        self.parent("pai-01", "w9:pPAI")
        res, tc = self.dispatch("filho-05", env_pane="w9:pPAI",
                                spawnedBy="operator", chainBasis="auto")
        self.assertEqual(res.get("error"), "CHAIN_DISPATCH_NOT_ALLOWED")
        tc.assert_not_called()
        ev = self.chain_events("filho-05")[0]
        self.assertEqual(ev["spawned_by"], "pai-01")  # ambiente decidiu (legado)


if __name__ == "__main__":
    unittest.main(verbosity=2)
