"""RD-LOOP-01 — suíte de REALIDADE: o ambiente que gerou o incidente de 05/10.

Classes simuladas (item 6 do contrato):
- fila compartilhada re-lida a cada varredura (entradas que NÃO saem = loop);
- no_op do re-despacho contado como sucesso (mecanismo central do loop vivo);
- verify.json compartilhado por cwd com dono de missão ativa diferente;
- bind read-only sombreado (classe EROFS em produção);
- campos ausentes no payload (contractFile vs promptFile vs prompt);
- constantes/submódulos ausentes (classe do NameError do incidente);
- modo shadow: decide mas NUNCA despacha nem muta produção.

Consumer carregado do arquivo REAL (/opt/mission-events/orchestrator-consumer.py)
com paths redirecionados para tmp — zero efeito colateral em produção.

Run: python3 test_rd_loop_01.py   (unittest; sem pytest neste ambiente)
"""
from __future__ import annotations

import importlib.util
import io
import json
import os
import sys
import tempfile
import time
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

_CONSUMER_PATH = "/opt/mission-events/orchestrator-consumer.py"


def _load_consumer():
    spec = importlib.util.spec_from_file_location("oc_rd_loop_01", _CONSUMER_PATH)
    oc = importlib.util.module_from_spec(spec)
    sys.modules["oc_rd_loop_01"] = oc
    spec.loader.exec_module(oc)
    return oc


oc = _load_consumer()
PKG = __import__("test_mission_ops").PKG  # plugin real (source) para testes de realidade
mc = PKG.mc

GO = {"verdict": "GO"}


class ConsumerEnv:
    """Redireciona TODOS os paths do consumer para tmp + stubs de routing/plan."""

    def __init__(self, tmp):
        self.tmp = tmp
        self._saved = {}
        self.paths = {
            "QUEUE_PATH": os.path.join(tmp, "queue.jsonl"),
            "STATE_PATH": os.path.join(tmp, "state.json"),
            "LOCK_PATH": os.path.join(tmp, "lock"),
            "SPOOL_PATH": os.path.join(tmp, "spool.jsonl"),
            "LOG_PATH": os.path.join(tmp, "consumer.log"),
            "SHADOW_LOG_PATH": os.path.join(tmp, "shadow.jsonl"),
            "MISSION_STATE_DIR": os.path.join(tmp, "mission-state"),
        }
        os.makedirs(self.paths["MISSION_STATE_DIR"], exist_ok=True)

    def __enter__(self):
        for k, v in self.paths.items():
            self._saved[k] = getattr(oc, k)
            setattr(oc, k, v)
        self._patches = [
            mock.patch.object(oc, "run_orchestrate_plan", return_value=dict(GO)),
            mock.patch.object(oc, "get_routed_worker", return_value="mock-worker"),
            mock.patch.object(oc, "load_routing_table", return_value={}),
            mock.patch.object(oc, "write_settings_json_pin", return_value=None),
        ]
        for p in self._patches:
            p.start()
        return self

    def __exit__(self, *a):
        for p in self._patches:
            p.stop()
        for k, v in self._saved.items():
            setattr(oc, k, v)
        return False

    # ------------------------------------------------------------- helpers
    def write_queue(self, entries):
        with open(self.paths["QUEUE_PATH"], "w", encoding="utf-8") as f:
            for e in entries:
                f.write(json.dumps(e) + "\n")

    def read_queue(self):
        p = self.paths["QUEUE_PATH"]
        if not os.path.exists(p):
            return []
        with open(p, encoding="utf-8") as f:
            return [json.loads(l) for l in f if l.strip()]

    def spool_lines(self, kind=None):
        p = self.paths["SPOOL_PATH"]
        if not os.path.exists(p):
            return []
        out = []
        with open(p, encoding="utf-8") as f:
            for l in f:
                try:
                    d = json.loads(l)
                except json.JSONDecodeError:
                    continue
                if kind is None or d.get("event") == kind or d.get("kind") == kind:
                    out.append(d)
        return out

    def read_state(self):
        p = self.paths["STATE_PATH"]
        if not os.path.exists(p):
            return {}
        with open(p, encoding="utf-8") as f:
            return json.load(f)

    def write_state(self, st):
        with open(self.paths["STATE_PATH"], "w", encoding="utf-8") as f:
            json.dump(st, f)

    @staticmethod
    def entry(mid, prompt_file, **kw):
        payload = {"missionId": mid, "promptFile": prompt_file}
        payload.update(kw.get("payload", {}))
        e = {"id": kw.get("id", "e-%s" % mid), "type": "mission_dispatch",
             "priority": 5, "enqueuedAt": "2026-10-05T00:00:00Z", "payload": payload}
        if "payload_only" in kw:
            e["payload"] = kw["payload_only"]
        return e

    def mk_prompt(self, name="missao-rd-loop.md"):
        p = os.path.join(self.tmp, name)
        with open(p, "w", encoding="utf-8") as f:
            f.write("# missão de teste\n")
        return p

    def consume(self, **kw):
        return oc.consume_queue(**kw)


class TestFilaConsomeDeVerdade(unittest.TestCase):
    """Item 6: entrada consumida SAI da fila — a releitura eterna era o amplificador."""

    def test_promoted_entry_leaves_queue(self):
        with tempfile.TemporaryDirectory() as tmp, ConsumerEnv(tmp) as env:
            pf = env.mk_prompt()
            env.write_queue([env.entry("RL-P1", pf)])
            with mock.patch.object(oc, "dispatch_mission",
                                   return_value={"ok": True, "status": "dispatched"}):
                res = env.consume()
            self.assertEqual(res["promoted"], 1, res)
            self.assertEqual(env.read_queue(), [], "entrada promovida deve SAIR da fila")
            st = env.read_state()
            self.assertEqual(len(st.get("promotions", {}).get("RL-P1", [])), 1)
            self.assertTrue([l for l in env.spool_lines("orch_promoted")])

    def test_no_op_nao_e_promocao(self):
        """Mecanismo central do loop de 05/10: no_op contado como sucesso a cada
        varredura. Agora: skipped 'already_dispatched', sem promoção, fila esvazia."""
        with tempfile.TemporaryDirectory() as tmp, ConsumerEnv(tmp) as env:
            pf = env.mk_prompt()
            env.write_queue([env.entry("RL-N1", pf)])
            with mock.patch.object(oc, "dispatch_mission",
                                   return_value={"ok": True, "status": "no_op",
                                                 "reason": "active mission already dispatched"}):
                res = env.consume()
            self.assertEqual(res["promoted"], 0, res)
            self.assertEqual(res["skipped"], 1, res)
            self.assertEqual(env.read_queue(), [])
            st = env.read_state()
            self.assertNotIn("RL-N1", st.get("promotions", {}))
            self.assertTrue([l for l in env.spool_lines("orch_skip")])

    def test_requeue_nao_duplica_e_dead_letter_esvazia(self):
        """Falha de transporte: requeue substitui a entrada (não acrescenta cópia à
        original); 3 tentativas → dead-letter e fila esvazia."""
        with tempfile.TemporaryDirectory() as tmp, ConsumerEnv(tmp) as env:
            pf = env.mk_prompt()
            env.write_queue([env.entry("RL-R1", pf)])
            with mock.patch.object(oc, "dispatch_mission",
                                   return_value={"ok": False, "error": "boom"}):
                res1 = env.consume()
            self.assertEqual(res1["requeued"], 1, res1)
            q = env.read_queue()
            self.assertEqual(len(q), 1, "original + cópia = duplicação (bug do loop)")
            self.assertEqual(q[0]["payload"].get("_attempt_count"), 1)
            with mock.patch.object(oc, "dispatch_mission",
                                   return_value={"ok": False, "error": "boom"}):
                env.consume()
            q = env.read_queue()
            self.assertEqual(q[0]["payload"].get("_attempt_count"), 2)
            with mock.patch.object(oc, "dispatch_mission",
                                   return_value={"ok": False, "error": "boom"}):
                env.consume()
            self.assertEqual(env.read_queue(), [], "dead-letter deve sair da fila")
            self.assertTrue([l for l in env.spool_lines("orch_dead_letter")])

    def test_novas_entradas_durante_varredura_persistem(self):
        """Reescrita da fila preserva entradas chegadas durante o consumo."""
        with tempfile.TemporaryDirectory() as tmp, ConsumerEnv(tmp) as env:
            pf = env.mk_prompt()
            env.write_queue([env.entry("RL-K1", pf)])

            def fake_dispatch(mid, pf_, *a, **k):
                # produtor enfileira nova missão durante o despacho
                with open(env.paths["QUEUE_PATH"], "a", encoding="utf-8") as f:
                    f.write(json.dumps(env.entry("RL-K2-NOVA", pf)) + "\n")
                return {"ok": True, "status": "dispatched"}
            with mock.patch.object(oc, "dispatch_mission", side_effect=fake_dispatch):
                env.consume()
            q = env.read_queue()
            self.assertEqual([e["payload"].get("missionId") for e in q], ["RL-K2-NOVA"])


class TestPreflightConsumer(unittest.TestCase):
    """Item 2 no consumer: gates ANTES do despacho, com marcação gate-operator."""

    def test_verify_cwd_conflict_gates_e_nao_despacha(self):
        with tempfile.TemporaryDirectory() as tmp, ConsumerEnv(tmp) as env:
            pf = env.mk_prompt()
            cwd = os.path.join(tmp, "cwd-alvo")
            os.makedirs(cwd)
            with open(os.path.join(cwd, "verify.json"), "w", encoding="utf-8") as f:
                json.dump({"mission": "RL-OUTRA"}, f)
            with open(os.path.join(env.paths["MISSION_STATE_DIR"], "RL-OUTRA.json"),
                      "w", encoding="utf-8") as f:
                json.dump({"missionId": "RL-OUTRA", "status": "dispatched"}, f)
            env.write_queue([env.entry("RL-G1", pf, payload={"cwd": cwd})])
            with mock.patch.object(oc, "dispatch_mission") as dm:
                res = env.consume()
            dm.assert_not_called()
            self.assertEqual(res["gated"], 1, res)
            self.assertEqual(len(env.read_queue()), 1, "entrada gated permanece (operator decide)")
            self.assertTrue([l for l in env.spool_lines("orch_gate_operator")])
            st = env.read_state()
            self.assertEqual(st["gatedEntries"]["e-RL-G1"]["code"], "VERIFY_CWD_CONFLICT")

    def test_gate_antispan_no_remark(self):
        """Mesma entrada + mesmo código → 1 único gate-operator (sem spam a cada sweep)."""
        with tempfile.TemporaryDirectory() as tmp, ConsumerEnv(tmp) as env:
            pf = env.mk_prompt()
            cwd = os.path.join(tmp, "cwd-alvo")
            os.makedirs(cwd)
            with open(os.path.join(cwd, "verify.json"), "w", encoding="utf-8") as f:
                json.dump({"mission": "RL-OUTRA"}, f)
            with open(os.path.join(env.paths["MISSION_STATE_DIR"], "RL-OUTRA.json"),
                      "w", encoding="utf-8") as f:
                json.dump({"missionId": "RL-OUTRA", "status": "dispatched"}, f)
            env.write_queue([env.entry("RL-G2", pf, payload={"cwd": cwd})])
            with mock.patch.object(oc, "dispatch_mission"):
                env.consume()
                env.consume()
            self.assertEqual(len(env.spool_lines("orch_gate_operator")), 1,
                             "gate repetido NÃO re-marca")

    def test_gate_limpa_quando_conflito_resolvido(self):
        with tempfile.TemporaryDirectory() as tmp, ConsumerEnv(tmp) as env:
            pf = env.mk_prompt()
            cwd = os.path.join(tmp, "cwd-alvo")
            os.makedirs(cwd)
            vf = os.path.join(cwd, "verify.json")
            with open(vf, "w", encoding="utf-8") as f:
                json.dump({"mission": "RL-OUTRA"}, f)
            with open(os.path.join(env.paths["MISSION_STATE_DIR"], "RL-OUTRA.json"),
                      "w", encoding="utf-8") as f:
                json.dump({"missionId": "RL-OUTRA", "status": "dispatched"}, f)
            env.write_queue([env.entry("RL-G3", pf, payload={"cwd": cwd})])
            with mock.patch.object(oc, "dispatch_mission",
                                   return_value={"ok": True, "status": "dispatched"}):
                env.consume()
            os.unlink(vf)  # operator resolveu o estado sujo
            with mock.patch.object(oc, "dispatch_mission",
                                   return_value={"ok": True, "status": "dispatched"}):
                env.consume()
            st = env.read_state()
            self.assertNotIn("e-RL-G3", st.get("gatedEntries", {}),
                             "gate resolvido deve limpar a memória")
            self.assertEqual(len(env.spool_lines("orch_promoted")), 1)

    def test_preflight_uses_state_promotions_regression(self):
        """Regressão: dedupe/cap precisam honrar o state DA PASSADA (não só o disco)."""
        now = time.time()
        with tempfile.TemporaryDirectory() as tmp, ConsumerEnv(tmp) as env:
            cwd = os.path.join(tmp, "cwd-ok")
            os.makedirs(cwd)
            st = {"promotions": {"RL-D1": [now - 3600]}}
            gate = oc.dispatch_preflight("RL-D1", cwd, st)
            self.assertIsNotNone(gate)
            self.assertEqual(gate[0], "DISPATCH_DEDUPE_12H", gate)


class TestShadowSoak(unittest.TestCase):
    """Item 5: shadow decide e loga o que FARIA — nunca despacha, nunca muta."""

    def test_shadow_never_dispatches_nor_mutates(self):
        with tempfile.TemporaryDirectory() as tmp, ConsumerEnv(tmp) as env:
            pf = env.mk_prompt()
            cwd = os.path.join(tmp, "cwd-alvo")
            os.makedirs(cwd)
            with open(os.path.join(cwd, "verify.json"), "w", encoding="utf-8") as f:
                json.dump({"mission": "RL-OUTRA"}, f)
            with open(os.path.join(env.paths["MISSION_STATE_DIR"], "RL-OUTRA.json"),
                      "w", encoding="utf-8") as f:
                json.dump({"missionId": "RL-OUTRA", "status": "dispatched"}, f)
            env.write_queue([env.entry("RL-S1", pf, payload={"cwd": cwd}),
                             env.entry("RL-S2", pf)])
            state_before = env.read_state()
            with mock.patch.object(oc, "dispatch_mission") as dm:
                res = env.consume(shadow=True)
            dm.assert_not_called()
            self.assertEqual(env.read_queue(), [  # fila intacta
                json.loads(json.dumps(e)) for e in
                [env.entry("RL-S1", pf, payload={"cwd": cwd}), env.entry("RL-S2", pf)]])
            self.assertEqual(env.read_state(), state_before, "shadow não persiste estado")
            # decisões registradas: um gate hipotético + um despacho hipotético
            with open(env.paths["SHADOW_LOG_PATH"], encoding="utf-8") as f:
                decisions = [json.loads(l) for l in f if l.strip()]
            kinds = [d["kind"] for d in decisions]
            self.assertIn("gate", kinds, kinds)
            self.assertIn("would_dispatch", kinds, kinds)
            self.assertTrue(all(d["mode"] == "shadow" for d in decisions))

    def test_shadow_simula_loop_breaker_sem_acionar_producao(self):
        now = time.time()
        with tempfile.TemporaryDirectory() as tmp, ConsumerEnv(tmp) as env:
            pf = env.mk_prompt()
            env.write_queue([env.entry("RL-S3", pf)])
            oc.active_ledgers_count = lambda: 2
            self.addCleanup(setattr, oc, "active_ledgers_count", _real_active_ledgers_count)
            env.write_state({"promotions": {"RL-S3": [now - 30] * 7},
                             "loopBreaker": {"active": False}})
            with mock.patch.object(oc, "dispatch_mission") as dm:
                env.consume(shadow=True)
            dm.assert_not_called()
            st = env.read_state()
            self.assertFalse(st["loopBreaker"]["active"],
                             "shadow NÃO aciona o breaker de produção")
            with open(env.paths["SHADOW_LOG_PATH"], encoding="utf-8") as f:
                decisions = [json.loads(l) for l in f if l.strip()]
            lb = [d for d in decisions if d["kind"] == "loopBreaker"]
            self.assertTrue(lb and lb[-1]["wouldTrip"] is True,
                            "shadow DEVE simular que o breaker acionaria")


class TestDetectorLoop(unittest.TestCase):
    """Item 4: razão promoções/ledgers ativos > 3 em 15min → auto-corte."""

    def test_breaker_aciona_e_bloqueia_promocoes(self):
        now = time.time()
        with tempfile.TemporaryDirectory() as tmp, ConsumerEnv(tmp) as env:
            pf = env.mk_prompt()
            env.write_queue([env.entry("RL-L1", pf)])
            oc.active_ledgers_count = lambda: 2
            self.addCleanup(setattr, oc, "active_ledgers_count", _real_active_ledgers_count)
            env.write_state({"promotions": {"RL-X": [now - 30] * 7},
                             "loopBreaker": {"active": False}})
            with mock.patch.object(oc, "dispatch_mission") as dm:
                res = env.consume()
            dm.assert_not_called()
            self.assertTrue([r for r in res["results"] if r["action"] == "loop_breaker"], res)
            self.assertEqual(len(env.read_queue()), 1, "nada é consumido em auto-corte")
            st = env.read_state()
            self.assertTrue(st["loopBreaker"]["active"])
            finding = [l for l in env.spool_lines("finding")
                       if l.get("kind") == "dispatch_loop_detected"]
            self.assertTrue(finding, "finding dispatch_loop_detected no bus")
            self.assertEqual(finding[-1]["kind"], "dispatch_loop_detected")

    def test_breaker_ativo_persiste_bloqueio(self):
        with tempfile.TemporaryDirectory() as tmp, ConsumerEnv(tmp) as env:
            pf = env.mk_prompt()
            env.write_queue([env.entry("RL-L2", pf)])
            env.write_state({"promotions": {}, "loopBreaker": {"active": True}})
            with mock.patch.object(oc, "dispatch_mission") as dm:
                env.consume()
            dm.assert_not_called()

    def test_reset_loop_breaker_cli(self):
        """Liberação do auto-corte = ordem do operator via CLI (fica no bus)."""
        with tempfile.TemporaryDirectory() as tmp, ConsumerEnv(tmp) as env:
            env.write_state({"promotions": {}, "loopBreaker": {"active": True, "ratio": 6.5}})
            argv = sys.argv
            buf = io.StringIO()
            with mock.patch.object(sys, "argv", ["oc", "reset-loop-breaker"]), \
                 mock.patch.object(sys, "stdout", buf):
                with self.assertRaises(SystemExit) as cm:
                    oc.main()
            self.assertEqual(cm.exception.code, 0)
            st = env.read_state()
            self.assertFalse(st["loopBreaker"]["active"])
            self.assertTrue([l for l in env.spool_lines("orch_loop_breaker_reset")])

    def test_razao_abaixo_do_limiar_nao_aciona(self):
        now = time.time()
        with tempfile.TemporaryDirectory() as tmp, ConsumerEnv(tmp) as env:
            pf = env.mk_prompt()
            env.write_queue([env.entry("RL-L3", pf)])
            oc.active_ledgers_count = lambda: 3
            self.addCleanup(setattr, oc, "active_ledgers_count", _real_active_ledgers_count)
            env.write_state({"promotions": {"RL-Y": [now - 60] * 3},
                             "loopBreaker": {"active": False}})
            with mock.patch.object(oc, "dispatch_mission",
                                   return_value={"ok": True, "status": "dispatched"}):
                res = env.consume()
            self.assertEqual(res["promoted"], 1, res)


class TestRealidadeAmbienteIncidente(unittest.TestCase):
    """Classes reais do incidente: campos ausentes, NameError, stdout do plugin."""

    def test_payload_sem_promptfile_e_skipped(self):
        """Payload sem prompt/promptFile/contractFile → skip determinístico (não loop)."""
        with tempfile.TemporaryDirectory() as tmp, ConsumerEnv(tmp) as env:
            env.write_queue([env.entry("RL-M1", None, payload={"foo": "bar"})])
            with mock.patch.object(oc, "dispatch_mission") as dm:
                res = env.consume()
            dm.assert_not_called()
            self.assertEqual(res["skipped"], 1, res)
            self.assertEqual(env.read_queue(), [])

    def test_payload_só_com_contractFile_despacha(self):
        """contractFile (e não promptFile) presente no payload → despacha com ele."""
        with tempfile.TemporaryDirectory() as tmp, ConsumerEnv(tmp) as env:
            pf = env.mk_prompt("contrato.md")
            env.write_queue([env.entry("RL-M2", None, payload={"contractFile": pf})])
            with mock.patch.object(oc, "dispatch_mission",
                                   return_value={"ok": True, "status": "dispatched"}) as dm:
                res = env.consume()
            dm.assert_called_once()
            self.assertEqual(dm.call_args[0][1], pf)
            self.assertEqual(res["promoted"], 1, res)

    def test_dispatch_mission_parse_stdout_do_plugin(self):
        """Classe do incidente: handler devolve JSON tipado e o consumer RESPEITA
        (no_op e gates não são mais '{ok: True}' às cegas)."""
        class FakeProc:
            returncode = 0
            stdout = json.dumps({"ok": True, "status": "no_op",
                                 "reason": "active mission already dispatched"})
            stderr = ""

        with mock.patch.object(oc, "dispatch_via_systemd", return_value=None), \
             mock.patch("subprocess.run", return_value=FakeProc()):
            out = oc.dispatch_mission("RL-M3", "/x/missao.md")
        self.assertEqual(out.get("status"), "no_op", out)
        self.assertTrue(out.get("ok"))

        class FakeGate:
            returncode = 0
            stdout = json.dumps({"ok": False, "error": "DISPATCH_CAP_EXCEEDED",
                                 "detail": "máx 2 tentativas/24h"})
            stderr = ""

        with mock.patch.object(oc, "dispatch_via_systemd", return_value=None), \
             mock.patch("subprocess.run", return_value=FakeGate()):
            out = oc.dispatch_mission("RL-M4", "/x/missao.md")
        self.assertEqual(out.get("error"), "DISPATCH_CAP_EXCEEDED", out)

    def test_gate_do_plugin_nao_vira_requeue_nem_dead_letter(self):
        """Erro tipado de gate do plugin → gated no consumer (sem backoff infinito)."""
        with tempfile.TemporaryDirectory() as tmp, ConsumerEnv(tmp) as env:
            pf = env.mk_prompt()
            env.write_queue([env.entry("RL-M5", pf)])
            with mock.patch.object(oc, "dispatch_mission",
                                   return_value={"ok": False, "error": "DISPATCH_CAP_EXCEEDED",
                                                 "detail": "máx 2 tentativas/24h"}):
                res = env.consume()
            self.assertEqual(res["gated"], 1, res)
            self.assertEqual(res["requeued"], 0, res)
            self.assertEqual(res["deadLettered"], 0, res)
            self.assertTrue([l for l in env.spool_lines("orch_gate_operator")])

    def test_consumer_importa_subprocess_no_topo(self):
        """Classe do NameError do incidente: subprocess usado em dispatch_via_systemd
        precisa existir no escopo do módulo (constante nunca definida = NameError)."""
        self.assertTrue(hasattr(oc, "subprocess"), "subprocess deve ser import no topo")
        self.assertTrue(hasattr(oc.subprocess, "run"))

    def test_active_statuses_espelha_plugin(self):
        """Espelho de mc.ACTIVE_STATUSES: detector de ledgers ativos não pode dessincronizar."""
        self.assertEqual(oc.ACTIVE_LEDGER_STATUSES, set(mc.ACTIVE_STATUSES),
                         "espelho desatualizado = detector erra o denominador")


class TestPluginRealidade(unittest.TestCase):
    """Plugin (handle_mission_dispatch): conflito verify/cwd e bind RO sombreado."""

    def test_verify_cwd_conflict_dono_ativo(self):
        from test_mission_ops import TempState
        with TempState() as ts:
            cwd = os.path.join(str(ts.tmp), "cwd")
            os.makedirs(cwd)
            with open(os.path.join(cwd, "verify.json"), "w", encoding="utf-8") as f:
                json.dump({"mission": "RL-ATIVA-OUTRA"}, f)
            mc.save_ledger({"missionId": "RL-ATIVA-OUTRA", "paneId": "w1:pX",
                            "tabId": "t1", "status": "dispatched", "cwd": "/x"})
            confl = PKG._verify_cwd_conflict("RL-MINHA", cwd)
            self.assertIsNotNone(confl)
            self.assertIn("RL-ATIVA-OUTRA", confl)
            # dono terminal → sem conflito
            led = mc.load_ledger("RL-ATIVA-OUTRA")
            led["status"] = "closed"
            mc.save_ledger(led)
            self.assertIsNone(PKG._verify_cwd_conflict("RL-MINHA", cwd))

    def test_bind_ro_sombreado_classe_erofs(self):
        """statvfs ST_RDONLY no cwd → CWD_NOT_WRITABLE (classe do EROFS em produção)."""
        from test_mission_ops import TempState
        with TempState():
            cwd = os.path.join(tempfile.gettempdir(), "ro-bind-rd-loop-%d" % os.getpid())
            os.makedirs(cwd, exist_ok=True)
            self.addCleanup(lambda: __import__("shutil").rmtree(cwd, ignore_errors=True))

            class FakeStat:
                f_flag = 0x1  # ST_RDONLY

            with mock.patch.object(mc.os, "statvfs", return_value=FakeStat()):
                gate = PKG._dispatch_preflight("RL-RO1", cwd)
            self.assertIsNotNone(gate)
            self.assertEqual(gate[0], "CWD_NOT_WRITABLE", gate)
            self.assertIn("read-only", gate[1], gate)

    def test_gate_codes_do_plugin_cobertos_pelo_consumer(self):
        """Todo gate tipado que o plugin devolve via _err é reconhecido pelo consumer
        (senão vira requeue/dead-letter em vez de gate-operator)."""
        self.assertTrue(oc._PLUGIN_GATE_CODES >= {
            "INVALID_CWD", "VERIFY_CWD_CONFLICT", "CWD_NOT_WRITABLE",
            "DISPATCH_DEDUPE_12H", "DISPATCH_CAP_EXCEEDED"}, oc._PLUGIN_GATE_CODES)


def _real_active_ledgers_count():
    """Restaura o original após mocks do denominador (cleanup)."""
    return _REAL_ACTIVE_LEDGERS_COUNT()


_REAL_ACTIVE_LEDGERS_COUNT = oc.active_ledgers_count


if __name__ == "__main__":
    unittest.main(verbosity=2)