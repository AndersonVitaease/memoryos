"""GUARD-SUPERVISOR-READONLY-01 (04/10) + SEC-OPERATOR-IDENTITY-01 — guardas
determinísticas do supervisor.

  R1  resolve_caller: direct/daemon/http(worker) NUNCA são supervisor;
      gateway (register do plugin) e http(subject supervisor) SÃO.
  R2  assert_action_allowed: close/recover/nudge do supervisor sem
      operatorOrder → recusa tipada SUPERVISOR_ACTION_NEEDS_ORDER + evento
      tipado no spool; com TOKEN verificado → passa + operator_order_verified
      (+ evento legado allowed_by_order com orderHash16, nunca o token);
      ordem textual sem token → recusa tipada OPERATOR_ORDER_UNVERIFIED.
  R3  Isenções de fluxo registrado: close awaiting_close / verify verde /
      dryRun; recover com needs_recovery (watcher). Canais daemon/direct
      passam sempre (compat worker/daemon).
  R4  E2E handler real: mission_close de missão ativa pelo supervisor →
      SUPERVISOR_ACTION_NEEDS_ORDER, ledger INTOCADO; daemon passa.
  R5  RELATÓRIO-INTEGRA: close sem colagem registrada → evento
      relatorio_integra_missing + warning; mission_report_ack registra
      (idempotente) e o guard passa; chatDeliverable ausente → missing.
      SEC-OPERATOR-IDENTITY-01: report_ack é consequência — supervisor exige
      token; daemon passa.
  R6  operatorOrder nos schemas das 4 tools guardadas.
  R7  Token de ordem + binding Telegram (operator_token.py): arquivo fail-closed
      (absente/inseguro/corrompido/revogado/disabled/hash divergente/expirado),
      verificação por hash (nunca vaza o token), anti-self-write, camada 2
      (origem telegram allowlistada conta como token; ausente = inativa).

Run: python3 test_supervisor_guard.py   (herdr 100% mockado; estado em tmp)
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_mission_ops import PKG, TempState, track_calls  # noqa: E402

mc = PKG.mc
sg = PKG.sg
try:
    from . import operator_token as ot  # pacote (se o dir for pacote)
except ImportError:
    import operator_token as ot  # top-level (suíte)

GUARD_TOKEN = "ordem-token-SEC-OPERATOR-IDENTITY-01-9f2c"


def _write_token_file(tmpdir_path: str, token: str = GUARD_TOKEN, extra: dict = None) -> str:
    """Fixture: arquivo do token com autointegridade correta, modo 0600."""
    body = {"version": 1, "tokenHash": __import__("hashlib").sha256(token.encode()).hexdigest()}
    body.update(extra or {})
    body["hash16"] = ot._self_hash16(body)
    path = os.path.join(tmpdir_path, "operator-order-token-%s.json" % abs(hash(json.dumps(body, sort_keys=True))) )
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(json.dumps(body, indent=2) + "\n")
    os.chmod(path, 0o600)
    return path


def _write_allowlist(tmpdir_path: str, chat_ids=("424242",)) -> str:
    body = {"version": 1, "telegram": {"chatIds": [{"chatId": c, "label": "operator"} for c in chat_ids]}}
    body["hash16"] = ot._self_hash16(body)
    path = os.path.join(tmpdir_path, "operator-allowlist.json")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(json.dumps(body, indent=2) + "\n")
    os.chmod(path, 0o600)
    return path


def _no_origin_env():
    """Env de origem autenticada limpo (default dos testes: camada 2 inativa)."""
    return mock.patch.dict(os.environ, {"MISSION_OPS_ORDER_ORIGIN_PLATFORM": "",
                                        "MISSION_OPS_ORDER_ORIGIN_CHAT_ID": ""}, clear=False)


def _real_runner():
    real_run = subprocess.run

    def runner(cmd, *a, **kw):
        if isinstance(cmd, list) and "/opt/deliver-verify/verify.py" in cmd \
                and "--ledger-dir" not in cmd:
            cmd = cmd + ["--ledger-dir", str(mc.STATE_DIR)]
        return real_run(cmd, *a, **kw)
    return runner


def _spool_records(spool: Path, kind: str):
    if not spool.exists():
        return []
    recs = []
    for line in spool.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            rec = json.loads(line)
        except ValueError:
            continue
        if rec.get("kind") == kind:
            recs.append(rec)
    return recs


class _Supervisor:
    """Contexto de canal supervisor (gateway simulado) com spool tmp."""

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


class TestR1CallerResolution(unittest.TestCase):

    def test_direct_import_never_supervisor(self):
        """Sem register() do gateway e sem env → canal direct, nunca supervisor."""
        with mock.patch.dict(os.environ, {"MISSION_OPS_GUARD_CHANNEL": "",
                                          "MISSION_OPS_GUARD_SUBJECT": ""}, clear=False):
            with mock.patch.object(sg, "_GATEWAY_BOOTED", False):
                c = sg.resolve_caller()
        self.assertFalse(c["supervisor"])
        self.assertEqual(c["channel"], "direct")

    def test_gateway_channel_is_supervisor(self):
        with _Supervisor(Path("/tmp/guard-r1-spool")):
            c = sg.resolve_caller()
        self.assertTrue(c["supervisor"])
        self.assertEqual(c["channel"], "gateway")

    def test_http_subject_resolves(self):
        with mock.patch.dict(os.environ, {"MISSION_OPS_GUARD_CHANNEL": "http",
                                          "MISSION_OPS_GUARD_SUBJECT": "supervisor"}, clear=False):
            self.assertTrue(sg.resolve_caller()["supervisor"])
        with mock.patch.dict(os.environ, {"MISSION_OPS_GUARD_CHANNEL": "http",
                                          "MISSION_OPS_GUARD_SUBJECT": "worker-x"}, clear=False):
            self.assertFalse(sg.resolve_caller()["supervisor"])

    def test_daemon_channel_never_supervisor(self):
        with mock.patch.dict(os.environ, {"MISSION_OPS_GUARD_CHANNEL": "daemon",
                                          "MISSION_OPS_GUARD_SUBJECT": "supervisor"}, clear=False):
            self.assertFalse(sg.resolve_caller()["supervisor"])

    def test_subjects_config_sources(self):
        """roles.json supervisorSubjects + env + default canônico {"supervisor"}."""
        with mock.patch.dict(os.environ, {"MISSION_OPS_SUPERVISOR_SUBJECTS": "hermes-2026-10, op-1"},
                             clear=False):
            subs = sg.supervisor_subjects()
        self.assertIn("supervisor", subs)
        self.assertIn("hermes-2026-10", subs)
        self.assertIn("op-1", subs)


class TestR2GuardDecisions(unittest.TestCase):

    def test_operator_order_validation(self):
        self.assertIsNone(sg.operator_order({}))
        self.assertIsNone(sg.operator_order({"operatorOrder": "curto"}))
        self.assertEqual(sg.operator_order({"operatorOrder": "  SHIP-eng-mcp-05  "}),
                         "SHIP-eng-mcp-05")
        self.assertIsNone(sg.operator_order({"operatorOrder": 123}))

    def test_supervisor_close_active_refused_and_spooled(self):
        """R2/R4: supervisor fecha missão ATIVA sem ordem → recusa tipada + spool."""
        mid = "sg1-%d" % os.getpid()
        with TempState() as ts:
            mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched", "cwd": str(ts.tmp)})
            with _Supervisor(Path(ts.tmp) / "spool.jsonl"):
                ref = sg.assert_action_allowed("close", {"missionId": mid},
                                               ledger=mc.load_ledger(mid))
            self.assertIsNotNone(ref)
            self.assertEqual(ref["code"], "SUPERVISOR_ACTION_NEEDS_ORDER")
            recs = _spool_records(Path(ts.tmp) / "spool.jsonl", "supervisor_action_needs_order")
            self.assertEqual(len(recs), 1)
            self.assertEqual(recs[0]["missionId"], mid)
            self.assertIsNone(recs[0]["operatorOrder"])
            self.assertEqual(recs[0]["action"], "close")

    def test_supervisor_close_with_verified_token_allowed_and_spooled(self):
        """R2/SEC-OPERATOR-IDENTITY-01: ordem = token verificado → passa, audit
        operator_order_verified com hash16 (NUNCA o token) + evento legado."""
        mid = "sg2-%d" % os.getpid()
        with TempState() as ts:
            mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched", "cwd": str(ts.tmp)})
            spool = Path(ts.tmp) / "spool.jsonl"
            tok = _write_token_file(str(ts.tmp))
            with _Supervisor(spool), _no_origin_env(), \
                 mock.patch.dict(os.environ, {"MISSION_OPS_OPERATOR_TOKEN_FILE": tok}, clear=False):
                self.assertIsNone(sg.assert_action_allowed(
                    "close", {"missionId": mid, "operatorOrder": GUARD_TOKEN},
                    ledger=mc.load_ledger(mid)))
            verified = _spool_records(spool, "operator_order_verified")
            self.assertEqual(len(verified), 1)
            self.assertEqual(verified[0]["basis"], "token")
            self.assertEqual(verified[0]["tokenHash16"], __import__("hashlib").sha256(GUARD_TOKEN.encode()).hexdigest()[:16])
            legacy = _spool_records(spool, "supervisor_action_allowed_by_order")
            self.assertEqual(len(legacy), 1)
            self.assertIn("orderHash16", legacy[0])
            self.assertNotIn("operatorOrder", legacy[0])  # NUNCA o token em claro
            self.assertNotIn(GUARD_TOKEN, json.dumps([verified, legacy], default=str))

    def test_supervisor_close_with_textual_order_refused_unverified(self):
        """R2/SEC-OPERATOR-IDENTITY-01: referência textual SEM token → recusa
        tipada OPERATOR_ORDER_UNVERIFIED, audit operator_order_unverified com
        nota honesta de canal inativo (camada 2 não configurada)."""
        mid = "sg2b-%d" % os.getpid()
        with TempState() as ts:
            mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched", "cwd": str(ts.tmp)})
            spool = Path(ts.tmp) / "spool.jsonl"
            # hermético: token file fixado como AUSENTE (default /data/manifests
            # pode ter placeholder do operator provisionado)
            with _Supervisor(spool), _no_origin_env(), \
                 mock.patch.dict(os.environ, {"MISSION_OPS_OPERATOR_TOKEN_FILE": str(Path(ts.tmp) / "absent-token.json")}, clear=False):
                ref = sg.assert_action_allowed(
                    "close", {"missionId": mid, "operatorOrder": "SHIP-eng-mcp-05"},
                    ledger=mc.load_ledger(mid))
            self.assertIsNotNone(ref)
            self.assertEqual(ref["code"], "OPERATOR_ORDER_UNVERIFIED")
            self.assertEqual(ref["tokenStatus"], "absent")
            recs = _spool_records(spool, "operator_order_unverified")
            self.assertEqual(len(recs), 1)
            self.assertIn("inactive", recs[0]["channelNote"])
            self.assertEqual(_spool_records(spool, "supervisor_action_allowed_by_order"), [])

    def test_supervisor_close_with_invalid_or_expired_token_refused(self):
        """R2: token errado/expirado/revogado → recusa tipada com status preservado."""
        mid = "sg2c-%d" % os.getpid()
        with TempState() as ts:
            mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched", "cwd": str(ts.tmp)})
            spool = Path(ts.tmp) / "spool.jsonl"
            cases = [
                ({"tokenHash": "f" * 64}, "invalid"),
                ({"expiresAt": "2020-01-01T00:00:00Z"}, "expired"),
                ({"revoked": True}, "revoked"),
            ]
            for extra, status in cases:
                tok = _write_token_file(str(ts.tmp), extra=extra)
                with _Supervisor(spool), _no_origin_env(), \
                     mock.patch.dict(os.environ, {"MISSION_OPS_OPERATOR_TOKEN_FILE": tok}, clear=False):
                    ref = sg.assert_action_allowed(
                        "nudge", {"missionId": mid, "operatorOrder": GUARD_TOKEN})
                self.assertIsNotNone(ref, status)
                self.assertEqual(ref["code"], "OPERATOR_ORDER_UNVERIFIED", status)
                self.assertEqual(ref["tokenStatus"], status, status)
                self.assertTrue(any(r["tokenStatus"] == status for r in _spool_records(spool, "operator_order_unverified")), status)

    def test_registered_flow_exemptions(self):
        """R3: awaiting_close / verify verde / dryRun / needs_recovery passam."""
        with TempState() as ts:
            spool = Path(ts.tmp) / "spool.jsonl"
            tok = _write_token_file(str(ts.tmp))
            with _Supervisor(spool), _no_origin_env(), \
                 mock.patch.dict(os.environ, {"MISSION_OPS_OPERATOR_TOKEN_FILE": tok}, clear=False):
                self.assertIsNone(sg.assert_action_allowed(
                    "close", {"missionId": "X"}, ledger={"missionId": "X", "status": "awaiting_close"}))
                self.assertIsNone(sg.assert_action_allowed(
                    "close", {"missionId": "X"},
                    ledger={"missionId": "X", "status": "dispatched",
                            "verified_e2e": {"verdict": "pass"}}))
                self.assertIsNone(sg.assert_action_allowed(
                    "close", {"missionId": "X", "dryRun": "true"}, ledger={"missionId": "X"}))
                self.assertIsNone(sg.assert_action_allowed(
                    "recover", {"paneId": "p"},
                    ledger={"missionId": "X", "needs_recovery": True}))
                self.assertIsNotNone(sg.assert_action_allowed(
                    "recover", {"paneId": "p"}, ledger={"missionId": "X", "status": "dispatched"}))
                # nudge nunca tem isenção: só passa com token verificado
                self.assertIsNotNone(sg.assert_action_allowed("nudge", {"missionId": "X"}))
                self.assertIsNotNone(sg.assert_action_allowed(
                    "nudge", {"missionId": "X", "operatorOrder": "ORD-token-2026-10-04"}),
                    "ordem textual sem token não autoriza mais mutação")
                self.assertIsNone(sg.assert_action_allowed(
                    "nudge", {"missionId": "X", "operatorOrder": GUARD_TOKEN}))

    def test_daemon_and_worker_channels_pass(self):
        """R3 compat: daemon/direct e http não-supervisor passam SEM operatorOrder."""
        with TempState():
            with mock.patch.dict(os.environ, {"MISSION_OPS_GUARD_CHANNEL": "daemon"}, clear=False):
                self.assertIsNone(sg.assert_action_allowed(
                    "close", {"missionId": "X"}, ledger={"missionId": "X", "status": "dispatched"}))
                self.assertIsNone(sg.assert_action_allowed("nudge", {"missionId": "X"}))
            with mock.patch.dict(os.environ, {"MISSION_OPS_GUARD_CHANNEL": "http",
                                              "MISSION_OPS_GUARD_SUBJECT": "worker-token-1"}, clear=False):
                self.assertIsNone(sg.assert_action_allowed(
                    "recover", {"paneId": "p"}, ledger={"missionId": "X", "status": "dispatched"}))


class TestR4HandlerE2E(unittest.TestCase):

    def _close(self, mid, extra=None):
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

    def test_close_active_by_supervisor_refused_ledger_untouched(self):
        mid = "sg4-%d" % os.getpid()
        with TempState() as ts:
            mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched", "cwd": str(ts.tmp)})
            with _Supervisor(Path(ts.tmp) / "spool.jsonl"):
                out = self._close(mid)
            self.assertEqual(out["ok"], False)
            self.assertEqual(out["error"], "SUPERVISOR_ACTION_NEEDS_ORDER")
            led = mc.load_ledger(mid)
            self.assertEqual(led.get("status"), "dispatched")  # INTOCADO
            self.assertNotIn("closed", str(led.get("status")))

    def test_close_active_by_daemon_passes(self):
        """Compat: mesmo close pelo canal daemon segue o fluxo normal (não-supervisor)."""
        mid = "sg5-%d" % os.getpid()
        with TempState() as ts:
            cwd = Path(ts.tmp) / "cwd"
            cwd.mkdir(parents=True)
            (cwd / ("RELATORIO-%s.md" % mid)).write_text("rel\n", encoding="utf-8")
            (cwd / ("verify-%s.json" % mid)).write_text(json.dumps(
                {"mission": mid, "cmd": [{"run": "echo ok", "expect_exit": 0, "timeout": 30}]}),
                encoding="utf-8")
            mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched", "cwd": str(cwd)})
            with mock.patch.dict(os.environ, {"MISSION_OPS_GUARD_CHANNEL": "daemon"}, clear=False):
                out = self._close(mid)
            self.assertNotIn("SUPERVISOR_ACTION_NEEDS_ORDER", str(out))
            self.assertEqual(mc.load_ledger(mid).get("status"), "closed")

    def test_nudge_by_supervisor_refused(self):
        mid = "sg6-%d" % os.getpid()
        with TempState() as ts:
            mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched", "cwd": str(ts.tmp)})
            with _Supervisor(Path(ts.tmp) / "spool.jsonl"):
                out = json.loads(PKG.handle_mission_nudge(
                    {"missionId": mid, "message": "continue",
                     "verifySeconds": 0, "force": True}))
            self.assertEqual(out["error"], "SUPERVISOR_ACTION_NEEDS_ORDER")

    def test_recover_by_supervisor_refused_without_marker(self):
        mid = "sg7-%d" % os.getpid()
        with TempState() as ts:
            mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched", "cwd": str(ts.tmp)})
            with _Supervisor(Path(ts.tmp) / "spool.jsonl"):
                out = json.loads(PKG.handle_mission_recover(
                    {"paneId": "w1:pZ", "pattern": "interrupted", "missionId": mid}))
            self.assertEqual(out["error"], "SUPERVISOR_ACTION_NEEDS_ORDER")

    def test_recover_by_supervisor_allowed_with_marker(self):
        """Isenção do fluxo registrado: needs_recovery marcado pelo watcher passa."""
        mid = "sg8-%d" % os.getpid()
        with TempState() as ts:
            mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                            "status": "needs_recovery", "cwd": str(ts.tmp),
                            "needs_recovery": True})
            stub = {"ok": True, "pattern": "interrupted"}
            with _Supervisor(Path(ts.tmp) / "spool.jsonl"), \
                 mock.patch.object(PKG.rc, "recover", return_value=(stub, None)), \
                 mock.patch.object(PKG.nf, "mission_recovering",
                                   return_value={"ok": True, "emitted": True}):
                out = json.loads(PKG.handle_mission_recover(
                    {"paneId": "w1:pZ", "pattern": "interrupted", "missionId": mid}))
            self.assertNotIn("SUPERVISOR_ACTION_NEEDS_ORDER", str(out))
            self.assertTrue(out.get("ok"))


class TestR5RelatorioIntegra(unittest.TestCase):

    def _close_env(self):
        return (mock.patch.object(mc, "run_herdr", track_calls()[1]),
                mock.patch.object(mc.time, "sleep"),
                mock.patch.object(mc, "pane_exists", return_value=False),
                mock.patch.object(PKG.nf, "mission_completed",
                                  return_value={"ok": True, "emitted": True}),
                mock.patch.object(PKG.nf, "mission_reopened",
                                  return_value={"ok": True, "emitted": True}),
                mock.patch.object(PKG.subprocess, "run", side_effect=_real_runner()),
                mock.patch.object(PKG.vg, "emit_bus_event"))

    def test_close_missing_integra_event_and_warning(self):
        """R5: close sem chatDeliverable e sem ack → relatorio_integra_missing."""
        mid = "sg9-%d" % os.getpid()
        with TempState() as ts:
            cwd = Path(ts.tmp) / "cwd"
            cwd.mkdir(parents=True)
            (cwd / ("verify-%s.json" % mid)).write_text(json.dumps(
                {"mission": mid, "cmd": [{"run": "echo ok", "expect_exit": 0, "timeout": 30}]}),
                encoding="utf-8")
            mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                            "status": "awaiting_close", "cwd": str(cwd)})
            spool = Path(ts.tmp) / "spool.jsonl"
            with _Supervisor(spool):
                patches = self._close_env()
                for p in patches:
                    p.start()
                try:
                    out = json.loads(PKG.handle_mission_close({"missionId": mid}))
                finally:
                    for p in reversed(patches):
                        p.stop()
            integ = out.get("relatorioIntegra") or {}
            self.assertFalse(integ.get("ok"))
            self.assertFalse(integ.get("delivered"))
            self.assertFalse(integ.get("ackRegistered"))
            codes = [w.get("code") for w in out.get("warnings", []) if isinstance(w, dict)]
            self.assertIn("relatorio_integra_missing", codes)
            self.assertEqual(len(_spool_records(spool, "relatorio_integra_missing")), 1)

    def test_ack_registration_and_guard_ok(self):
        """R5: mission_report_ack registra (idempotente) e o guard passa com o
        chatDeliverable integral anexado. SEC-OPERATOR-IDENTITY-01: report_ack
        é consequência — supervisor registra com token verificado."""
        mid = "sg10-%d" % os.getpid()
        with TempState() as ts:
            cwd = Path(ts.tmp) / "cwd"
            cwd.mkdir(parents=True)
            rel = "RELATORIO INTEGRO %s\n" % mid
            (cwd / ("RELATORIO-%s.md" % mid)).write_text(rel, encoding="utf-8")
            (cwd / ("verify-%s.json" % mid)).write_text(json.dumps(
                {"mission": mid, "cmd": [{"run": "echo ok", "expect_exit": 0, "timeout": 30}]}),
                encoding="utf-8")
            mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                            "status": "awaiting_close", "cwd": str(cwd)})
            spool = Path(ts.tmp) / "spool.jsonl"
            tok = _write_token_file(str(ts.tmp))
            with _Supervisor(spool), _no_origin_env(), \
                 mock.patch.dict(os.environ, {"MISSION_OPS_OPERATOR_TOKEN_FILE": tok}, clear=False):
                first = json.loads(PKG.handle_mission_report_ack({"missionId": mid, "operatorOrder": GUARD_TOKEN}))
                second = json.loads(PKG.handle_mission_report_ack({"missionId": mid, "operatorOrder": GUARD_TOKEN}))
            self.assertTrue(first["ok"])
            self.assertTrue(second["idempotent"])
            self.assertTrue(sg.integra_ack_registered(mid))
            evs = Path(mc.STATE_DIR, "events.jsonl").read_text(encoding="utf-8") \
                .splitlines()
            acks = [json.loads(l) for l in evs
                    if l.strip() and json.loads(l).get("event") == "relatorio_integra_delivered"]
            self.assertEqual(len(acks), 1)
            self.assertEqual(len(_spool_records(spool, "operator_order_verified")), 2)
            # guard com deliverable integral + ack → ok
            resp = {"chatDeliverable": {"missionId": mid, "content": rel}}
            out = sg.relatorio_integra_guard(mid, str(cwd), resp, spool_path=str(spool))
            self.assertTrue(out["relatorioIntegra"]["ok"])
            self.assertEqual(len(_spool_records(spool, "relatorio_integra_missing")), 0)

    def test_ack_by_supervisor_without_token_refused_no_event(self):
        """R5/SEC-OPERATOR-IDENTITY-01: report_ack de supervisor sem ordem →
        SUPERVISOR_ACTION_NEEDS_ORDER; com ordem textual →
        OPERATOR_ORDER_UNVERIFIED. Em ambos: events.jsonl intocado."""
        mid = "sg10b-%d" % os.getpid()
        with TempState() as ts:
            cwd = Path(ts.tmp) / "cwd"
            cwd.mkdir(parents=True)
            (cwd / ("RELATORIO-%s.md" % mid)).write_text("rel\n", encoding="utf-8")
            mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                            "status": "awaiting_close", "cwd": str(cwd)})
            spool = Path(ts.tmp) / "spool.jsonl"
            with _Supervisor(spool), _no_origin_env():
                out = json.loads(PKG.handle_mission_report_ack({"missionId": mid}))
                self.assertEqual(out["error"], "SUPERVISOR_ACTION_NEEDS_ORDER")
                out2 = json.loads(PKG.handle_mission_report_ack(
                    {"missionId": mid, "operatorOrder": "SHIP-qualquer"}))
                self.assertEqual(out2["error"], "OPERATOR_ORDER_UNVERIFIED")
            self.assertFalse(sg.integra_ack_registered(mid))

    def test_ack_by_daemon_passes_without_token(self):
        """R5/compat: canal daemon (automação registrada) registra sem token."""
        mid = "sg10c-%d" % os.getpid()
        with TempState() as ts:
            cwd = Path(ts.tmp) / "cwd"
            cwd.mkdir(parents=True)
            (cwd / ("RELATORIO-%s.md" % mid)).write_text("rel\n", encoding="utf-8")
            mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                            "status": "awaiting_close", "cwd": str(cwd)})
            with mock.patch.dict(os.environ, {"MISSION_OPS_GUARD_CHANNEL": "daemon"}, clear=False):
                out = json.loads(PKG.handle_mission_report_ack({"missionId": mid}))
            self.assertTrue(out["ok"])
            self.assertTrue(sg.integra_ack_registered(mid))

    def test_deliverable_without_ack_still_missing(self):
        """R5: chatDeliverable presente mas colagem não registrada → missing."""
        mid = "sg11-%d" % os.getpid()
        with TempState() as ts:
            spool = Path(ts.tmp) / "spool.jsonl"
            resp = {"chatDeliverable": {"missionId": mid, "content": "x"}}
            out = sg.relatorio_integra_guard(mid, None, resp, spool_path=str(spool))
            self.assertFalse(out["relatorioIntegra"]["ok"])
            self.assertTrue(out["relatorioIntegra"]["delivered"])
            self.assertFalse(out["relatorioIntegra"]["ackRegistered"])


class TestR6Schemas(unittest.TestCase):

    def test_operator_order_in_guarded_schemas(self):
        """register(ctx fake): as 4 tools guardadas expõem operatorOrder e
        mission_report_ack é registrada com o handler real."""
        captured = {}

        def fake_register(name, toolset, schema, handler, *extra):
            captured[name] = (schema, handler)

        tmp = tempfile.mkdtemp(prefix="sg-schema-")
        # RD-TESTBASE-01: register() marca o processo como gateway (global PERMANENTE
        # de supervisor_guard) — fixture restaura a marca depois do catálogo.
        _booted_saved = sg._GATEWAY_BOOTED
        with mock.patch.object(PKG, "_MISSION_SPOOL", os.path.join(tmp, "spool.jsonl")):
            PKG.register(type("Ctx", (), {"register_tool": staticmethod(fake_register)})())
        sg._GATEWAY_BOOTED = _booted_saved
        for tool in ("mission_close", "mission_recover", "mission_nudge", "mission_report_ack"):
            schema, _handler = captured[tool]
            self.assertIn("operatorOrder", schema["parameters"]["properties"], tool)
        self.assertIn("mission_report_ack", captured)
        self.assertIs(captured["mission_report_ack"][1], PKG.handle_mission_report_ack)

    def test_handler_report_ack_exists(self):
        self.assertTrue(callable(PKG.handle_mission_report_ack))


class TestR7OperatorToken(unittest.TestCase):
    """SEC-OPERATOR-IDENTITY-01: token de ordem + binding Telegram (camada 2)."""

    def test_verify_order_token_matrix(self):
        """Verificação determinística: válido verifica; inválido/ausente/expirado/
        revogado/disabled/hash divergente NUNCA verificam (fail-closed)."""
        with tempfile.TemporaryDirectory(prefix="sg-r7-") as tmp:
            tok = _write_token_file(tmp)
            ok = ot.verify_order_token(GUARD_TOKEN, tok)
            self.assertTrue(ok["verified"])
            self.assertEqual(ok["tokenHash16"], __import__("hashlib").sha256(GUARD_TOKEN.encode()).hexdigest()[:16])
            bad = ot.verify_order_token("outro-token-totalmente-diferente", tok)
            self.assertFalse(bad["verified"])
            self.assertEqual(bad["status"], "invalid")
            self.assertEqual(bad["reason"], "TOKEN_HASH_MISMATCH")
            self.assertRegex(bad["presentedHash16"], r"^[0-9a-f]{16}$")
            # ausente (caminho inexistente)
            self.assertFalse(ot.verify_order_token(GUARD_TOKEN, os.path.join(tmp, "nope.json"))["verified"])
            # matrix de estados
            cases = [
                ({"revoked": True}, "revoked"),
                ({"disabled": True}, "disabled"),
                ({"expiresAt": "2020-01-01T00:00:00Z"}, "expired"),
                ({"tokenHash": "f" * 64}, "invalid"),
            ]
            for extra, status in cases:
                path = _write_token_file(tmp, extra=extra)
                res = ot.verify_order_token(GUARD_TOKEN, path)
                self.assertEqual(res["status"], status, extra)
                self.assertFalse(res["verified"], extra)
            # hash16 de autointegridade divergente
            body = {"version": 1, "tokenHash": __import__("hashlib").sha256(GUARD_TOKEN.encode()).hexdigest(), "hash16": "deadbeefdeadbeef"}
            path = os.path.join(tmp, "violado.json")
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, "w") as f:
                f.write(json.dumps(body))
            os.chmod(path, 0o600)
            self.assertEqual(ot.read_token_file(path)["status"], "hash_mismatch")

    def test_token_never_leaks(self):
        """NUNCA loga/imprime o token: veredito contém só hash16."""
        with tempfile.TemporaryDirectory(prefix="sg-r7-") as tmp:
            tok = _write_token_file(tmp)
            payload = json.dumps([ot.verify_order_token(GUARD_TOKEN, tok),
                                  ot.verify_order_token("errado-xyz", tok)])
            self.assertNotIn(GUARD_TOKEN, payload)

    def test_insecure_mode_refused(self):
        """Modo group/world legível → recusa (padrão 0600 do contrato)."""
        with tempfile.TemporaryDirectory(prefix="sg-r7-") as tmp:
            path = _write_token_file(tmp)
            os.chmod(path, 0o644)
            self.assertEqual(ot.read_token_file(path)["reason"], "INSECURE_MODE")

    def test_anti_self_write(self):
        """ANTI-SELF-WRITE: só 'read' — escrita recusa."""
        with self.assertRaises(RuntimeError) as ctx:
            ot.assert_token_access("write")
        self.assertIn("ANTI_SELF_APPROVE", str(ctx.exception))

    def test_telegram_binding_layer2(self):
        """Camada 2: allowlist válida + origem allowlistada conta como token;
        chat estranho/origem ausente/plataforma errada não; ausente = inativa."""
        with tempfile.TemporaryDirectory(prefix="sg-r7-") as tmp:
            absent = ot.read_allowlist(os.path.join(tmp, "nope.json"))
            self.assertEqual(absent["status"], "inactive")
            self.assertIn("inactive", ot.telegram_binding_allows(None, os.path.join(tmp, "nope.json"))["note"])
            path = _write_allowlist(tmp)
            allowed = ot.telegram_binding_allows({"platform": "telegram", "chatId": "424242"}, path)
            self.assertTrue(allowed["allowed"])
            self.assertRegex(allowed["chatHash16"], r"^[0-9a-f]{16}$")
            self.assertFalse(ot.telegram_binding_allows({"platform": "telegram", "chatId": "999999"}, path)["allowed"])
            self.assertFalse(ot.telegram_binding_allows({"platform": "discord", "chatId": "424242"}, path)["allowed"])
            self.assertFalse(ot.telegram_binding_allows(None, path)["allowed"])

    def test_binding_via_guard_gateway(self):
        """Camada 2 no guard: supervisor com binding + origem autenticada passa
        MESMO com ordem textual (a origem é o token); sem origem → recusa."""
        mid = "sg7b-%d" % os.getpid()
        with TempState() as ts:
            spool = Path(ts.tmp) / "spool.jsonl"
            allow = _write_allowlist(str(ts.tmp))
            with _Supervisor(spool), \
                 mock.patch.dict(os.environ, {
                     "MISSION_OPS_ORDER_ORIGIN_PLATFORM": "telegram",
                     "MISSION_OPS_ORDER_ORIGIN_CHAT_ID": "424242",
                     "MISSION_OPS_OPERATOR_ALLOWLIST_FILE": allow}, clear=False):
                self.assertIsNone(sg.assert_action_allowed(
                    "recover", {"paneId": "p", "operatorOrder": "SHIP-qualquer"},
                    ledger={"missionId": mid, "status": "dispatched"}))
            verified = _spool_records(spool, "operator_order_verified")
            self.assertEqual(len(verified), 1)
            self.assertEqual(verified[0]["basis"], "telegram-binding")
            # origem estranha: fail-closed
            spool2 = Path(ts.tmp) / "spool2.jsonl"
            with _Supervisor(spool2), \
                 mock.patch.dict(os.environ, {
                     "MISSION_OPS_ORDER_ORIGIN_PLATFORM": "telegram",
                     "MISSION_OPS_ORDER_ORIGIN_CHAT_ID": "999999",
                     "MISSION_OPS_OPERATOR_ALLOWLIST_FILE": allow}, clear=False):
                ref = sg.assert_action_allowed(
                    "recover", {"paneId": "p", "operatorOrder": "SHIP-qualquer"},
                    ledger={"missionId": mid, "status": "dispatched"})
            self.assertEqual(ref["code"], "OPERATOR_ORDER_UNVERIFIED")


if __name__ == "__main__":
    unittest.main(verbosity=2)