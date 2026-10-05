"""RD-GUARD-CLOSE-STATE-01 (04/10) — guard G1 fecha o ciclo do close:

  A1  turn_done (relatório + verify.json) → ledger `awaitingClose: true`
      (watcher, mesmo padrão do needs_recovery) + trilha awaiting_close_marked
  A2  idempotente: re-watch não duplica trilha nem re-marca
  A3  estados terminais (closed) NUNCA clobbered
  B1  close de supervisor com flag → passa SEM token de ordem; o close grava
      chatDeliverable.delivered: true no ledger (relatório integral entregue)
  C1  close de supervisor SEM flag → SUPERVISOR_ACTION_NEEDS_ORDER, ledger
      INTOCADO (sem awaitingClose, status intacto)
  D1  report_ack isento com chatDeliverable.delivered: true no ledger
  D2  report_ack com registro prévio da colagem (evento) → isento
  D3  report_ack sem entrega registrada → SUPERVISOR_ACTION_NEEDS_ORDER
  D4  ciclo completo: supervisor close (flag) → report_ack isento

Run: python3 test_rd_guard_close_state_01.py   (herdr 100% mockado; estado em tmp)
"""

from __future__ import annotations

import json
import os
import sys
import time
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_mission_ops import PKG, TempState, track_calls, fake_herdr, out_result, \
    pane_entry, panes_ok, procinfo  # noqa: E402

mc = PKG.mc
sg = PKG.sg


# ------------------------------------------------------------ helpers (padrão das suítes existentes)

def _footer(epoch: float) -> str:
    """Rodapé real de fim de turno do claude: '· done 4:32 PM' (hora local)."""
    return "· done " + time.strftime("%I:%M %p", time.localtime(epoch)).lstrip("0")


def _snapshot(mid="m1", pane="w1:pZ", text=""):
    return {
        "pane list": panes_ok([pane_entry(pane)]),
        f"pane read {pane} --source recent-unwrapped --lines 40": out_result(text),
        f"pane process-info --pane {pane}": procinfo("claude"),
    }


def _watch(mid, cwd, text):
    script = _snapshot(mid, text=text)
    with mock.patch.object(mc, "run_herdr", fake_herdr(script)):
        return json.loads(PKG.handle_mission_watch({"missionId": mid, "snapshot": "true"}))


def _setup_done_mission(ts, mid="m1", pane="w1:pZ", report=True, verify=True,
                        status="dispatched", extra=None):
    """Missão sintética CONCLUÍDA: relatório + manifests no cwd, ledger dispatched.
    Grava os DOIS nomes como na produção: verify.json (nome que o veredito do
    watcher e o dryRun/deliver-verify do close leem) e verify-<mid>.json
    (CLOSE-VERIFY-PATH-01 — resolvedor do mission_verify)."""
    cwd = Path(ts.tmp) / "cwd"
    cwd.mkdir(parents=True, exist_ok=True)
    if report:
        (cwd / ("RELATORIO-%s.md" % mid)).write_text("# relatório final\n", encoding="utf-8")
    if verify:
        manifest = json.dumps({"mission": mid, "cmd": [{"run": "echo ok", "expect_exit": 0}]})
        (cwd / "verify.json").write_text(manifest, encoding="utf-8")
        (cwd / ("verify-%s.json" % mid)).write_text(manifest, encoding="utf-8")
    led = {"missionId": mid, "paneId": pane, "tabId": "t1", "status": status,
           "cwd": str(cwd), "promptFile": ts.prompt_file()}
    led.update(extra or {})
    mc.save_ledger(led)
    return cwd


def _events(mid, kind=None):
    try:
        with open(mc.STATE_DIR / "events.jsonl", encoding="utf-8") as f:
            recs = [json.loads(l) for l in f if l.strip() and json.loads(l)["missionId"] == mid]
    except OSError:
        return []
    if kind:
        return [r for r in recs if r.get("event") == kind]
    return recs


def _real_runner():
    """subprocess.run real com --ledger-dir injetado no verify.py do close."""
    real_run = PKG.subprocess.run

    def runner(cmd, *a, **kw):
        if isinstance(cmd, list) and "/opt/deliver-verify/verify.py" in cmd \
                and "--ledger-dir" not in cmd:
            cmd = cmd + ["--ledger-dir", str(mc.STATE_DIR)]
        return real_run(cmd, *a, **kw)
    return runner


def _supervisor_close(mid, extra=None):
    """mission_close com canal de supervisor MOCKADO (gateway) e SEM token de ordem."""
    with mock.patch.object(mc, "run_herdr", track_calls()[1]), \
         mock.patch.object(mc.time, "sleep"), \
         mock.patch.object(mc, "pane_exists", return_value=False), \
         mock.patch.object(PKG.nf, "mission_completed",
                           return_value={"ok": True, "emitted": True}), \
         mock.patch.object(PKG.nf, "mission_reopened",
                           return_value={"ok": True, "emitted": True}), \
         mock.patch.object(PKG.subprocess, "run", side_effect=_real_runner()), \
         mock.patch.object(PKG.vg, "emit_bus_event"):
        return json.loads(PKG.handle_mission_close(dict(extra or {}, missionId=mid)))


class _Supervisor:
    """Contexto de canal supervisor (gateway simulado) com spool tmp — mesmo padrão
    da suíte do guard (test_supervisor_guard.py)."""

    def __init__(self, spool: Path):
        self.spool = str(spool)
        self._patches = [
            mock.patch.object(sg, "_GATEWAY_BOOTED", True),
            mock.patch.object(sg, "_DEFAULT_SPOOL", self.spool),
            mock.patch.dict(os.environ, {"MISSION_OPS_GUARD_CHANNEL": "",
                                         "MISSION_OPS_GUARD_SUBJECT": ""},
                            clear=False),
        ]

    def __enter__(self):
        for p in self._patches:
            p.start()
        return self

    def __exit__(self, *a):
        for p in reversed(self._patches):
            p.stop()


# ------------------------------------------------------------ A — watcher grava a flag

class TestAWatcherMarksAwaitingClose(unittest.TestCase):

    def test_turn_done_marks_awaiting_close_in_ledger(self):
        with TempState() as ts:
            cwd = _setup_done_mission(ts)
            res = _watch("m1", cwd, "tudo verde\n" + _footer(time.time()))
            self.assertEqual(res["event"], "turn_done")
            self.assertEqual(res.get("verdict"), "awaiting_close")
            self.assertTrue(res.get("awaitingCloseMarked"))
            led = mc.load_ledger("m1")
            self.assertTrue(led.get("awaitingClose") is True)  # flag no ledger
            self.assertTrue(led.get("awaitingCloseAt"))
            self.assertEqual(led["status"], "dispatched")  # não fecha sozinho
            self.assertEqual(len(_events("m1", "awaiting_close_marked")), 1)  # trilha

    def test_rewatch_is_idempotent(self):
        with TempState() as ts:
            cwd = _setup_done_mission(ts)
            _watch("m1", cwd, "tudo verde\n" + _footer(time.time()))
            first_at = mc.load_ledger("m1")["awaitingCloseAt"]
            _watch("m1", cwd, "de novo\n" + _footer(time.time()))
            led = mc.load_ledger("m1")
            self.assertTrue(led.get("awaitingClose") is True)
            self.assertEqual(led["awaitingCloseAt"], first_at)  # não re-marca
            self.assertEqual(len(_events("m1", "awaiting_close_marked")), 1)

    def test_terminal_closed_never_clobbered(self):
        with TempState() as ts:
            cwd = _setup_done_mission(ts, status="closed")
            led = mc.load_ledger("m1")
            res = PKG._on_event("m1", led, "turn_done", "tudo verde")
            self.assertEqual(res.get("verdict"), "closed")
            self.assertNotIn("awaitingClose", led)
            self.assertEqual(led["status"], "closed")

    def test_turn_done_without_verify_no_flag(self):
        with TempState() as ts:
            cwd = _setup_done_mission(ts, verify=False)
            res = _watch("m1", cwd, "tudo verde\n" + _footer(time.time()))
            self.assertEqual(res.get("verdict"), "needs_supervisor")
            self.assertNotIn("awaitingClose", mc.load_ledger("m1"))


# ------------------------------------------------------------ B/C — close do supervisor

class TestCloseWithFlag(unittest.TestCase):

    def test_close_by_supervisor_with_flag_passes_without_token(self):
        mid = "gcs1-%d" % os.getpid()
        with TempState() as ts:
            _setup_done_mission(ts, mid)
            mc.save_ledger(dict(mc.load_ledger(mid), awaitingClose=True,
                                awaitingCloseAt=mc._now()))
            with _Supervisor(Path(ts.tmp) / "spool.jsonl"):
                out = _supervisor_close(mid)  # SEM operatorOrder/token
            self.assertNotIn("SUPERVISOR_ACTION_NEEDS_ORDER", str(out))
            self.assertTrue(out.get("ok"), out)
            led = mc.load_ledger(mid)
            self.assertEqual(led["status"], "closed")
            # close entregou o relatório integral → registra no ledger
            cd = led.get("chatDeliverable") or {}
            self.assertTrue(cd.get("delivered") is True)
            self.assertTrue(str(cd.get("path") or "").endswith("RELATORIO-%s.md" % mid))

    def test_close_by_supervisor_without_flag_refused_ledger_untouched(self):
        mid = "gcs2-%d" % os.getpid()
        with TempState() as ts:
            cwd = _setup_done_mission(ts, mid)
            with _Supervisor(Path(ts.tmp) / "spool.jsonl"):
                out = _supervisor_close(mid)
            self.assertEqual(out["ok"], False)
            self.assertEqual(out["error"], "SUPERVISOR_ACTION_NEEDS_ORDER")
            led = mc.load_ledger(mid)
            self.assertEqual(led["status"], "dispatched")  # INTOCADO
            self.assertNotIn("awaitingClose", led)  # flag nunca sai da recusa
            self.assertEqual(led["cwd"], str(cwd))

    def test_daemon_close_still_passes_without_flag(self):
        """Compat (restrição do contrato): canal daemon segue nunca-supervisor."""
        mid = "gcs3-%d" % os.getpid()
        with TempState() as ts:
            _setup_done_mission(ts, mid)
            with mock.patch.dict(os.environ, {"MISSION_OPS_GUARD_CHANNEL": "daemon"},
                                 clear=False):
                out = _supervisor_close(mid)
            self.assertNotIn("SUPERVISOR_ACTION_NEEDS_ORDER", str(out))
            self.assertEqual(mc.load_ledger(mid)["status"], "closed")


# ------------------------------------------------------------ D — report_ack

class TestReportAckExemption(unittest.TestCase):

    def _ack(self, mid, extra=None):
        return json.loads(PKG.handle_mission_report_ack(dict(extra or {}, missionId=mid)))

    def test_exempt_with_chat_deliverable_in_ledger(self):
        mid = "gcs4-%d" % os.getpid()
        with TempState() as ts:
            _setup_done_mission(ts, mid)
            mc.save_ledger(dict(mc.load_ledger(mid),
                                chatDeliverable={"delivered": True,
                                                 "path": "/cwd/RELATORIO-%s.md" % mid}))
            with _Supervisor(Path(ts.tmp) / "spool.jsonl"):
                out = self._ack(mid)  # sem token
            self.assertTrue(out.get("ok"), out)
            self.assertFalse(out.get("idempotent"))
            self.assertEqual(len(_events(mid, "relatorio_integra_delivered")), 1)

    def test_exempt_with_prior_chat_registration(self):
        mid = "gcs5-%d" % os.getpid()
        with TempState() as ts:
            _setup_done_mission(ts, mid)
            with _Supervisor(Path(ts.tmp) / "spool.jsonl"):
                # registro prévio da colagem no chat (fora do guard — o supervisor
                # já tinha registrado antes; o re-ack é idempotente e isento)
                first = sg.register_integra_ack(mid)
                self.assertTrue(first.get("ok"))
                out = self._ack(mid)
            self.assertTrue(out.get("ok"), out)
            self.assertTrue(out.get("idempotent"))

    def test_refused_without_registered_delivery(self):
        mid = "gcs6-%d" % os.getpid()
        with TempState() as ts:
            _setup_done_mission(ts, mid)  # relatório em disco, mas SEM entrega registrada
            with _Supervisor(Path(ts.tmp) / "spool.jsonl"):
                out = self._ack(mid)
            self.assertEqual(out["ok"], False)
            self.assertEqual(out["error"], "SUPERVISOR_ACTION_NEEDS_ORDER")
            self.assertEqual(len(_events(mid, "relatorio_integra_delivered")), 0)

    def test_full_cycle_close_then_ack_exempt(self):
        """Ciclo E2E do contrato: turn_done → flag do watcher → close supervisor
        (grava chatDeliverable.delivered) → ack isento; após o ack, o guard do
        close considera o RELATÓRIO-INTEGRA ok (delivered + acked)."""
        mid = "gcs7-%d" % os.getpid()
        with TempState() as ts:
            cwd = _setup_done_mission(ts, mid)
            res = _watch(mid, cwd, "tudo verde\n" + _footer(time.time()))
            self.assertEqual(res.get("verdict"), "awaiting_close")
            self.assertTrue(mc.load_ledger(mid).get("awaitingClose") is True)
            with _Supervisor(Path(ts.tmp) / "spool.jsonl"):
                close = _supervisor_close(mid)  # close grava chatDeliverable.delivered
                self.assertTrue(close.get("ok"), close)
                self.assertEqual(close["relatorioIntegra"]["ackRegistered"], False)
                out = self._ack(mid)
            self.assertTrue(out.get("ok"), out)
            self.assertEqual(len(_events(mid, "relatorio_integra_delivered")), 1)
            self.assertTrue(sg.integra_ack_registered(mid))
            led = mc.load_ledger(mid)
            self.assertEqual(led["status"], "closed")
            self.assertTrue(led["chatDeliverable"]["delivered"])


if __name__ == "__main__":
    unittest.main(verbosity=2)