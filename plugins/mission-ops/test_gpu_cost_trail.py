"""GPU-COST-FIX-01 — custo por missão MEDIDO no mission_close + trilha honesta.

(a) o TypeError float×str reproduzido (revisão pré-d54724d) e ausente no caminho atual;
(b) campos str-lixo/None/ausentes → sem crash, cost_unmeasured com motivo gravado;
(c) campos numéricos (e str numérica de API) → custo calculado correto;
(d) no-op "instância já destruída" (antes da missão) / gpu-up falho → sem custo inventado.

NUNCA roda gpu-down.sh real nem toca o bus/state reais: tudo em tmp + mocks.

Run: python3 -m unittest test_gpu_cost_trail
"""

from __future__ import annotations

import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from test_mission_ops import PKG, TempState, track_calls

mc = PKG.mc
nf = PKG.nf
cc = nf.cost_coerce

T0 = 1790593110.0          # startedAt da instância
MSTART = T0 + 60.0         # missão despachada 1 min depois
TEND = T0 + 3600.0         # destroy 1h depois


def _iso(ep: float) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ep))


def _state(tmp: str, **over) -> str:
    data = {"instance_id": "53163485", "status": "down", "dph_usd": 0.45,
            "startedAt": int(T0), "readyAt": int(T0 + 240), "destroyedAt": int(TEND),
            "billed_to": int(TEND),
            "cost_ledger": [{"instance_id": "53163485", "from": int(T0), "to": int(TEND),
                             "dph_usd": 0.45, "cost_usd": 0.45, "kind": "final"}]}
    data.update(over)
    p = os.path.join(tmp, "state.json")
    Path(p).write_text(json.dumps(data), encoding="utf-8")
    return p


def _audit(tmp: str, rows) -> str:
    p = os.path.join(tmp, "audit.jsonl")
    Path(p).write_text("".join(json.dumps(r) + "\n" for r in rows) + "lixo não-json\n",
                       encoding="utf-8")
    return p


def _ledger(**over):
    led = {"missionId": "gpu-m1", "engine": "gpu", "gpuUpOk": True,
           "createdAt": _iso(MSTART - 5), "dispatchedAt": _iso(MSTART)}
    led.update(over)
    return led


class TestTypeErrorRepro(unittest.TestCase):
    """(a) a operação exata que quebrava: `now - readyAt` com readyAt str ISO."""

    def test_pre_fix_expression_raises_typeerror(self):
        ready_iso = "2026-09-27T14:00:42Z"
        with self.assertRaises(TypeError):
            (TEND - ready_iso)  # noqa: B018 — expressão do gpu-down/notify pré-fix
        with self.assertRaises(ValueError):
            float(ready_iso)    # o float() cru do notify pré-d54724d

    def test_record_with_iso_and_str_fields_no_crash(self):
        tmp = tempfile.mkdtemp(prefix="gpu-cost-trail-")
        p = _state(tmp, status="up", startedAt=_iso(T0), readyAt=_iso(T0 + 240),
                   dph_usd="0.45", billed_to=None, destroyedAt=None, cost_ledger=[])
        rec = nf.mission_cost_record(_ledger(), gpu_state_path=p,
                                     audit_path=os.path.join(tmp, "none"), now=TEND)
        self.assertNotIn("cost_unmeasured", rec)
        self.assertAlmostEqual(rec["cost_usd"], 0.45, places=6)
        self.assertFalse(rec["final"])


class TestUnmeasured(unittest.TestCase):
    """(b) str-lixo/None/ausente → cost_unmeasured com motivo, nunca estimativa."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="gpu-cost-trail-")
        self.audit = os.path.join(self.tmp, "none")

    def _rec(self, **state_over):
        return nf.mission_cost_record(_ledger(), gpu_state_path=_state(self.tmp, **state_over),
                                      audit_path=self.audit, now=TEND + 10)

    def test_ledger_entry_garbage(self):
        rec = self._rec(cost_ledger=[{"cost_usd": "0.1"}, {"cost_usd": "lixo"}])
        self.assertNotIn("cost_usd", rec)
        self.assertIn("cost_ledger_entry_unparseable", rec["cost_unmeasured"])

    def test_ledger_entry_none_and_missing(self):
        for bad in ({"cost_usd": None}, {}, "não-dict"):
            rec = self._rec(cost_ledger=[bad])
            self.assertIn("cost_ledger_entry_unparseable", rec["cost_unmeasured"], bad)
            self.assertNotIn("cost_usd", rec)

    def test_running_dph_none(self):
        rec = self._rec(status="up", destroyedAt=None, billed_to=None, cost_ledger=[],
                        dph_usd=None)
        self.assertIn("dph_usd_unparseable", rec["cost_unmeasured"])

    def test_running_no_start(self):
        rec = self._rec(status="up", destroyedAt=None, billed_to=None, cost_ledger=[],
                        startedAt=None, readyAt="lixo")
        self.assertIn("running_segment_no_start", rec["cost_unmeasured"])

    def test_state_missing(self):
        rec = nf.mission_cost_record(_ledger(), gpu_state_path=os.path.join(self.tmp, "x"),
                                     audit_path=self.audit, now=TEND)
        self.assertIn("gpu_state_unreadable", rec["cost_unmeasured"])

    def test_down_without_destroyed_at(self):
        rec = self._rec(destroyedAt=None)
        self.assertIn("instance_down_without_destroyedAt", rec["cost_unmeasured"])

    def test_budget_probe_str_cost_no_typeerror(self):
        self.assertIsNone(nf.probe_budget_alert("m", mission_cost_usd="lixo"))
        alert = nf.probe_budget_alert("m", mission_cost_usd="9.5", limit_mission=5.0)
        self.assertEqual(alert["kind"], "budget_alert")


class TestMeasured(unittest.TestCase):
    """(c) numéricos (e str numérica de API) → custo correto + tokens do proxy na janela."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="gpu-cost-trail-")

    def test_final_cost_and_tokens_in_window(self):
        audit = _audit(self.tmp, [
            {"ts": _iso(MSTART - 30), "event": "proxy_call", "tokens_in": 999, "tokens_out": 9},
            {"ts": _iso(MSTART + 10)[:-1] + ".500Z", "event": "proxy_call", "tokens_in": 100, "tokens_out": "20"},
            {"ts": _iso(MSTART + 20), "event": "proxy_call_classifier", "tokens_in": 7},
            {"ts": _iso(MSTART + 30), "event": "proxy_call", "tokens_in": 50, "tokens_out": 5},
        ])
        p = _state(self.tmp, cost_ledger=[
            {"from": int(T0), "to": int(T0 + 1800), "cost_usd": "0.225", "kind": "populate_interim"},
            {"from": int(T0 + 1800), "to": int(TEND), "cost_usd": 0.225, "kind": "final"}])
        rec = nf.mission_cost_record(_ledger(), gpu_state_path=p, audit_path=audit,
                                     now=TEND + 5)
        self.assertAlmostEqual(rec["cost_usd"], 0.45, places=6)
        self.assertTrue(rec["final"])
        self.assertEqual(rec["missionId"], "gpu-m1")
        self.assertEqual(rec["instance_id"], "53163485")
        self.assertEqual(rec["created_at"], T0)
        self.assertEqual(rec["destroyed_at"], TEND)
        self.assertEqual(rec["tokens_proxy"], 175)      # só proxy_call dentro da janela
        self.assertEqual(rec["tokens_proxy_calls"], 2)

    def test_running_segment_from_billed_to(self):
        p = _state(self.tmp, status="up", destroyedAt=None, billed_to=int(T0 + 1800),
                   cost_ledger=[{"from": int(T0), "to": int(T0 + 1800), "cost_usd": 0.225}])
        rec = nf.mission_cost_record(_ledger(), gpu_state_path=p,
                                     audit_path=os.path.join(self.tmp, "none"), now=TEND)
        self.assertAlmostEqual(rec["cost_usd"], 0.45, places=6)
        self.assertFalse(rec["final"])
        self.assertIsNone(rec["tokens_proxy"])           # audit ilegível → não inventa 0
        self.assertIn("tokens_unmeasured", rec)


class TestNoOpHonest(unittest.TestCase):
    """(d) instância destruída ANTES da missão / gpu-up falho → sem custo alheio."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="gpu-cost-trail-")

    def test_destroyed_before_mission(self):
        p = _state(self.tmp)  # 53163485 destruída em TEND
        led = _ledger(dispatchedAt=_iso(TEND + 3600), createdAt=_iso(TEND + 3590))
        rec = nf.mission_cost_record(led, gpu_state_path=p,
                                     audit_path=os.path.join(self.tmp, "none"),
                                     now=TEND + 7200)
        self.assertNotIn("cost_usd", rec)
        self.assertIn("instance_destroyed_before_mission", rec["cost_unmeasured"])
        self.assertIn("53163485", rec["cost_unmeasured"])

    def test_gpu_up_failed(self):
        p = _state(self.tmp)
        rec = nf.mission_cost_record(_ledger(gpuUpOk=False), gpu_state_path=p,
                                     audit_path=os.path.join(self.tmp, "none"), now=TEND)
        self.assertNotIn("cost_usd", rec)
        self.assertIn("gpu_up_failed", rec["cost_unmeasured"])
        self.assertIsNone(rec["instance_id"])


class TestSpoolTrail(unittest.TestCase):
    """Trilha no spool: um registro por missão, dedupe por assinatura."""

    def test_record_dedupe(self):
        tmp = tempfile.mkdtemp(prefix="gpu-cost-trail-")
        spool, sigs = os.path.join(tmp, "spool.jsonl"), os.path.join(tmp, "sigs.json")
        rec = {"missionId": "m", "instance_id": "1", "created_at": T0, "destroyed_at": TEND,
               "tokens_proxy": 3, "cost_usd": 0.45, "final": True}
        r1 = nf.record_mission_cost(rec, spool=spool, signatures_path=sigs)
        r2 = nf.record_mission_cost(dict(rec), spool=spool, signatures_path=sigs)
        self.assertTrue(r1["emitted"])
        self.assertFalse(r2["emitted"])
        rows = [json.loads(l) for l in Path(spool).read_text().splitlines()]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["kind"], "mission_cost")
        self.assertEqual(rows[0]["cost_usd"], 0.45)
        un = nf.record_mission_cost({"missionId": "m2", "cost_unmeasured": "gpu_up_failed: x"},
                                    spool=spool, signatures_path=sigs)
        self.assertTrue(un["emitted"])
        last = json.loads(Path(spool).read_text().splitlines()[-1])
        self.assertEqual(last["kind"], "cost_unmeasured")
        self.assertNotIn("cost_usd", last)
        self.assertEqual(nf.mission_cost_lookup("m", spool=spool)["cost_usd"], 0.45)
        self.assertIsNone(nf.mission_cost_lookup("nada", spool=spool))


class TestCloseTrail(unittest.TestCase):
    """mission_close: registro no ledger + spool + mission_completed com o MESMO número."""

    def _close(self, ts, state_path, ledger_over):
        cwd = Path(ts.tmp) / "gpu-cwd"
        cwd.mkdir(exist_ok=True)
        led = {"missionId": "gpu-close-1", "paneId": "w1:pG", "tabId": "t1",
               "status": "dispatched", "cwd": str(cwd), "engine": "gpu",
               "consequence": False, "consequenceSource": "dispatch"}
        led.update(ledger_over)
        mc.save_ledger(led)
        fake_proc = mock.Mock(returncode=0, stdout=b"[gpu-down] no-op\n", stderr=b"")
        _calls, track = track_calls()
        with mock.patch.object(mc, "run_herdr", track), \
             mock.patch.object(mc.time, "sleep"), \
             mock.patch.object(mc, "pane_exists", return_value=False), \
             mock.patch.object(nf, "GPU_STATE", state_path), \
             mock.patch.object(nf, "GPU_AUDIT", os.path.join(ts.tmp, "no-audit")), \
             mock.patch.object(PKG.vg, "emit_bus_event"), \
             mock.patch.object(PKG, "_spool_gpu_event"), \
             mock.patch.object(PKG.subprocess, "run", return_value=fake_proc):
            out = json.loads(PKG.handle_mission_close({"missionId": "gpu-close-1"}))
        rows = [json.loads(l) for l in Path(nf.SPOOL).read_text().splitlines()]
        return out, rows, mc.load_ledger("gpu-close-1")

    def test_close_noop_destroyed_before_mission(self):
        with TempState() as ts:
            p = _state(ts.tmp)
            out, rows, led = self._close(ts, p, {"dispatchedAt": _iso(TEND + 3600)})
            steps = {s["step"]: s for s in out["steps"]}
            self.assertTrue(steps["gpu_down"]["ok"])
            self.assertIn("instance_destroyed_before_mission", steps["mission_cost"]["cost_unmeasured"])
            self.assertIn("instance_destroyed_before_mission", led["cost"]["cost_unmeasured"])
            kinds = [r["kind"] for r in rows]
            self.assertIn("cost_unmeasured", kinds)
            self.assertNotIn("mission_cost", kinds)
            done = [r for r in rows if r["kind"] == "mission_completed"][0]
            self.assertNotIn("custo_gpu=US$", done["detail"])
            self.assertIn("custo_gpu=unmeasured", done["detail"])

    def test_close_measured_same_number_everywhere(self):
        with TempState() as ts:
            p = _state(ts.tmp)
            out, rows, led = self._close(ts, p, {"dispatchedAt": _iso(MSTART), "gpuUpOk": True})
            self.assertAlmostEqual(led["cost"]["cost_usd"], 0.45, places=6)
            cost_row = [r for r in rows if r["kind"] == "mission_cost"][0]
            self.assertEqual(cost_row["cost_usd"], led["cost"]["cost_usd"])
            self.assertEqual(cost_row["missionId"], "gpu-close-1")
            done = [r for r in rows if r["kind"] == "mission_completed"][0]
            self.assertIn("custo_gpu=US$0.4500", done["detail"])

    def test_close_non_gpu_has_cost_step_transcript(self):
        """ORCH-SPEND-LEDGER-01 (revê o pin antigo "sem mission_cost" para não-gpu):
        missão engine!=gpu agora grava ledger["cost"] via transcript_cost_record —
        na suíte o transporte engineering está desligado (TempState), então o passo
        existe com cost_unmeasured honesto (fail-open, sem HTTP)."""
        with TempState() as ts:
            mc.save_ledger({"missionId": "plain-1", "paneId": "w1:pZ", "tabId": "t1",
                            "status": "dispatched"})
            _calls, track = track_calls()
            with mock.patch.object(mc, "run_herdr", track), mock.patch.object(mc.time, "sleep"):
                out = json.loads(PKG.handle_mission_close({"missionId": "plain-1"}))
            step = [s for s in out["steps"] if s["step"] == "mission_cost"][0]
            self.assertTrue(step["ok"])  # fail-open: nunca derruba o close
            self.assertNotIn("cost_usd", step)  # nunca inventa custo
            self.assertIn("cost_unmeasured", step)
            led = mc.load_ledger("plain-1")
            self.assertIn("cost_unmeasured", led["cost"])
            self.assertNotIn("cost_usd", led["cost"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
