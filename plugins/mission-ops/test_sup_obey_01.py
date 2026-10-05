"""SUP-OBEY-01 (03/10) — guardas de obediência: as ordens do operator viram código.

  G1  OBRIGACOES.md carregado no boot (boot_context) e injetado no bus (obrigacoes_boot)
  G2  close retorna chatDeliverable = conteúdo INTEGRAL do RELATORIO-<id>.md; ausente →
      warning relatorio_nao_entregado_chat (E2E no handler real, herdr mockado)
  G3  ship direto (git push/merge/engineering_release_pipeline fora de SHIP-*) do dia →
      direct_ship_violation detectado, anunciado no bus e listado no fecho
  G4  despacho supervisor-side com fila pendente → warning dispatch_not_orchestrator
      (daemon marcado ORCH_DAEMON_APPROVED=1 não recebe o warning)

Run: python3 test_sup_obey_01.py   (herdr 100% mockado; estado em tmp)
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_mission_ops import PKG, TempState, track_calls  # noqa: E402

mc = PKG.mc
ob = PKG.ob  # obedience — carregado por test_mission_ops antes do rehook (IMPORT-FIX)


def _real_runner():
    """Runner VERDADEIRO do close; só redireciona o ledger-dir para o state do teste."""
    real_run = subprocess.run

    def runner(cmd, *a, **kw):
        if isinstance(cmd, list) and "/opt/deliver-verify/verify.py" in cmd \
                and "--ledger-dir" not in cmd:
            cmd = cmd + ["--ledger-dir", str(mc.STATE_DIR)]
        return real_run(cmd, *a, **kw)
    return runner


class TestG1BootObrigacoes(unittest.TestCase):

    def test_boot_context_loads_full_file(self):
        """G1(a): OBRIGACOES.md carregado no boot — bloco integral dentro da tag."""
        boot = ob.boot_context()
        self.assertIsNotNone(boot)
        self.assertTrue(boot.startswith("<obrigacoes-operator>"))
        self.assertIn("Ship via missão", boot)          # item 2
        self.assertIn("orquestrador", boot)             # item 3
        self.assertIn("TÉCNICA-ENG", boot)              # item 4

    def test_boot_missing_file_is_none(self):
        """Fail-open: sem OBRIGACOES.md o boot devolve None (não derruba o plugin)."""
        self.assertIsNone(ob.boot_context(path="/nonexistent/OBRIGACOES.md"))

    def test_register_boot_spools_full_block(self):
        """G1(b): register() injeta o bloco INTEGRAL no bus (sem cap de 400)."""
        import tempfile
        tmp = tempfile.mkdtemp(prefix="sup-obey-boot-")
        spool = Path(tmp) / "spool.jsonl"
        # RD-TESTBASE-01: register() marca o processo como gateway (global PERMANENTE
        # de supervisor_guard) — fixture restaura a marca depois do boot.
        _booted_saved = PKG.sg._GATEWAY_BOOTED
        with mock.patch.object(PKG, "_MISSION_SPOOL", str(spool)):
            PKG.register(type("Ctx", (), {"register_tool": lambda *a, **k: None})())
        PKG.sg._GATEWAY_BOOTED = _booted_saved
        self.assertTrue(spool.exists())
        recs = [json.loads(l) for l in spool.read_text(encoding="utf-8").splitlines() if l.strip()]
        boots = [r for r in recs if r.get("kind") == "obrigacoes_boot"]
        self.assertEqual(len(boots), 1)
        self.assertEqual(boots[0]["mission_id"], "supervisor")
        self.assertIn("<obrigacoes-operator>", boots[0]["detail"])
        self.assertGreater(len(boots[0]["detail"]), 400)  # integral, não truncado


class TestG2CloseChatDeliverable(unittest.TestCase):

    def _close(self, mid):
        with mock.patch.object(mc, "run_herdr", track_calls()[1]), \
             mock.patch.object(mc.time, "sleep"), \
             mock.patch.object(mc, "pane_exists", return_value=False), \
             mock.patch.object(PKG.nf, "mission_completed",
                               return_value={"ok": True, "emitted": True}), \
             mock.patch.object(PKG.nf, "mission_reopened",
                               return_value={"ok": True, "emitted": True}), \
             mock.patch.object(PKG.subprocess, "run", side_effect=_real_runner()), \
             mock.patch.object(PKG.vg, "emit_bus_event"):
            return json.loads(PKG.handle_mission_close({"missionId": mid}))

    def test_close_returns_chat_deliverable_integral(self):
        """G2 E2E: close de missão de teste → chatDeliverable com o conteúdo
        INTEGRAL do RELATORIO-<id>.md do cwd da missão."""
        mid = "ob1-%d" % os.getpid()
        with TempState() as ts:
            cwd = Path(ts.tmp) / "cwd"
            cwd.mkdir(parents=True)
            rel = "# RELATÓRIO-%s\n\nProblema → entrega → prova.\n\nPASS\n" % mid
            (cwd / ("RELATORIO-%s.md" % mid)).write_text(rel, encoding="utf-8")
            (cwd / ("verify-%s.json" % mid)).write_text(json.dumps(
                {"mission": mid, "cmd": [{"run": "echo ok", "expect_exit": 0,
                                          "timeout": 30}]}), encoding="utf-8")
            mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                            "status": "awaiting_close", "cwd": str(cwd)})
            out = self._close(mid)
            self.assertIn("chatDeliverable", out)
            self.assertEqual(out["chatDeliverable"]["missionId"], mid)
            self.assertEqual(out["chatDeliverable"]["content"], rel)  # INTEGRAL
            self.assertNotIn("relatorio_nao_entregado_chat",
                             [w.get("code") for w in out.get("warnings", [])
                              if isinstance(w, dict)])

    def test_close_without_relatorio_warns_typed(self):
        """G2: cwd sem RELATORIO-<id>.md → chatDeliverable None + warning tipado."""
        mid = "ob2-%d" % os.getpid()
        with TempState() as ts:
            cwd = Path(ts.tmp) / "cwd"
            cwd.mkdir(parents=True)
            mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                            "status": "awaiting_close", "cwd": str(cwd)})
            out = self._close(mid)
            self.assertIsNone(out.get("chatDeliverable"))
            codes = [w.get("code") for w in out.get("warnings", []) if isinstance(w, dict)]
            self.assertIn("relatorio_nao_entregado_chat", codes)


class TestG3DirectShip(unittest.TestCase):

    def test_detect_patterns(self):
        """G3(c): git push / git merge / engineering_release_pipeline → violation."""
        for text in ("git push origin master", "git merge main",
                     "engineering_release_pipeline execute=true"):
            v = ob.detect_ship_direct(text)
            self.assertIsNotNone(v, text)
            self.assertEqual(v["code"], "direct_ship_violation")
        self.assertIsNone(ob.detect_ship_direct("git status; git log --oneline -3"))

    def test_scan_day_skips_ship_missions_and_yesterday(self):
        """G3 determinístico: só o dia corrente; missão SHIP-<alvo> é o caminho correto."""
        # SELFTEST-LEAK-01: fixture em TempState — NUNCA "w" no events.jsonl de produção.
        with TempState():
            ev = Path(mc.STATE_DIR) / "events.jsonl"
            ev.parent.mkdir(parents=True, exist_ok=True)
            now = time.time()
            with open(ev, "w", encoding="utf-8") as f:
                f.write(json.dumps({"ts": now - 10, "missionId": "FOO-01", "event": "x",
                                    "detail": "git push origin master"}) + "\n")
                f.write(json.dumps({"ts": now - 5, "missionId": "SHIP-eng-mcp", "event": "x",
                                    "detail": "git push origin master"}) + "\n")
                f.write(json.dumps({"ts": now - 90000, "missionId": "FOO-01", "event": "x",
                                    "detail": "git push"}) + "\n")  # ontem
            viol = ob.scan_day_direct_ship(events_path=str(ev), now=now)
            self.assertEqual(len(viol), 1)
            self.assertEqual(viol[0]["missionId"], "FOO-01")
            self.assertEqual(viol[0]["code"], "direct_ship_violation")

    def test_new_findings_dedupe(self):
        """G3: 2º ciclo com o MESMO events.jsonl não re-anuncia (dedupe por fingerprint)."""
        # SELFTEST-LEAK-01: fixture em TempState — zero fixture no estado de produção.
        with TempState():
            ev = Path(mc.STATE_DIR) / "events2.jsonl"
            ev.parent.mkdir(parents=True, exist_ok=True)
            now = time.time()
            ev.write_text(json.dumps({"ts": now, "missionId": "BAR-01", "event": "x",
                                      "detail": "git merge main"}) + "\n", encoding="utf-8")
            first = ob.new_direct_ship_findings(events_path=str(ev), now=now)
            self.assertEqual(len(first), 1)
            self.assertEqual(ob.new_direct_ship_findings(events_path=str(ev), now=now), [])

    def test_close_lists_day_violations(self):
        """G3 E2E: o fecho do dia LISTA as violações (directShipViolations no payload)."""
        mid = "ob3-%d" % os.getpid()
        with TempState() as ts:
            cwd = Path(ts.tmp) / "cwd"
            cwd.mkdir(parents=True)
            (cwd / ("RELATORIO-%s.md" % mid)).write_text("x", encoding="utf-8")
            (cwd / ("verify-%s.json" % mid)).write_text(json.dumps(
                {"mission": mid, "cmd": [{"run": "echo ok", "expect_exit": 0,
                                          "timeout": 30}]}), encoding="utf-8")
            mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                            "status": "awaiting_close", "cwd": str(cwd)})
            ev = Path(mc.STATE_DIR) / "events.jsonl"
            ev.write_text(json.dumps({"ts": time.time(), "missionId": "OUTRA-9",
                                      "event": "x", "detail": "git push origin main"}) + "\n",
                          encoding="utf-8")
            with mock.patch.object(mc, "run_herdr", track_calls()[1]), \
                 mock.patch.object(mc.time, "sleep"), \
                 mock.patch.object(mc, "pane_exists", return_value=False), \
                 mock.patch.object(PKG.nf, "mission_completed",
                                   return_value={"ok": True, "emitted": True}), \
                 mock.patch.object(PKG.nf, "mission_reopened",
                                   return_value={"ok": True, "emitted": True}), \
                 mock.patch.object(PKG.subprocess, "run", side_effect=_real_runner()), \
                 mock.patch.object(PKG.vg, "emit_bus_event"), \
                 mock.patch.object(PKG, "_MISSION_SPOOL",
                                   str(Path(ts.tmp) / "spool.jsonl")), \
                 mock.patch.dict(os.environ,
                                 {"MISSION_OPS_STATE_DIR": str(mc.STATE_DIR)}):
                out = json.loads(PKG.handle_mission_close({"missionId": mid}))
            viol = out.get("directShipViolations", [])
            self.assertEqual(len(viol), 1)
            self.assertEqual(viol[0]["missionId"], "OUTRA-9")


class TestG4DispatchOwner(unittest.TestCase):

    def _queue(self, n=1):
        q = Path(mc.STATE_DIR) / "queue.jsonl"
        q.parent.mkdir(parents=True, exist_ok=True)
        with open(q, "w", encoding="utf-8") as f:
            for i in range(n):
                f.write(json.dumps({"id": "o%d" % i, "type": "mission_dispatch",
                                    "payload": {"missionId": "Z%d" % i},
                                    "priority": 1}) + "\n")
        return str(q)

    def test_supervisor_side_dispatch_warns(self):
        """G4(d): fila pendente + chamador ≠ daemon → dispatch_not_orchestrator."""
        w = ob.dispatch_owner_guard("w1:p1", "w9:p9", queue_path=self._queue(2))
        self.assertIsNotNone(w)
        self.assertEqual(w["code"], "dispatch_not_orchestrator")
        self.assertEqual(w["pendingIntents"], 2)

    def test_daemon_dispatch_no_warning(self):
        """Chamador == pane do daemon → sem warning (é o orquestrador)."""
        q = self._queue(1)
        self.assertIsNone(ob.dispatch_owner_guard("w1:p1", "w1:p1", queue_path=q))

    def test_empty_queue_no_warning(self):
        """Sem fila pendente, chamador supervisor-side não recebe o warning."""
        self.assertIsNone(ob.dispatch_owner_guard("w1:p1", "w9:p9",
                                                  queue_path=str(Path(mc.STATE_DIR) / "nope.jsonl")))

    def test_watch_helper_honors_daemon_flag(self):
        """G4 integração: _obedience_warnings com ORCH_DAEMON_APPROVED=1 é silenciosa;
        sem o flag e com fila pendente (env MISSION_ORCH_QUEUE), o warning aparece."""
        q = self._queue(1)
        base = {"HERDR_PANE_ID": "w1:p1", "ORCH_DAEMON_PANE_ID": "w9:p9",
                "MISSION_ORCH_QUEUE": q}
        with mock.patch.dict(os.environ, {**base, "ORCH_DAEMON_APPROVED": "1"}):
            self.assertEqual(PKG._obedience_warnings(), [])
        with mock.patch.dict(os.environ, base, clear=False):
            ws = PKG._obedience_warnings()
            self.assertEqual(len(ws), 1)
            self.assertEqual(ws[0]["code"], "dispatch_not_orchestrator")


class TestG5Suite(unittest.TestCase):

    def test_obedience_module_never_raises_on_garbage(self):
        """G5: entradas lixo não derrubam nenhum guard (padrão de robustez do plugin)."""
        self.assertIsNone(ob.detect_ship_direct(""))
        self.assertIsNone(ob.detect_conceptual_question(None))
        self.assertEqual(ob.queue_pending_count("/nonexistent/q.jsonl"), 0)
        self.assertEqual(ob.scan_day_direct_ship(events_path="/nonexistent/e.jsonl"), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
