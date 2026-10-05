"""GPU-VAST-TFA-FIX-01 — custo engine:gpu no mission_close com tipos mistos (float×str).

mission_gpu_cost_usd fazia float() do ledger inteiro dentro de um único try: UM cost_usd
lixo, ou readyAt ISO (mesmo formato que os ledgers já gravam), zerava o custo INTEIRO
para None — o TypeError/ValueError era engolido e o custo sumia do mission_completed.

NUNCA roda gpu-down.sh real: subprocess.run, _spool_gpu_event e GPU_STATE são isolados.

Run: python3 -m unittest test_gpu_cost_coerce
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

READY = 1790521642.0
NOW = READY + 3600.0  # 1h de runtime


def _write_state(tmp: str, **over) -> str:
    data = {"status": "up", "dph_usd": "0.39", "readyAt": "2026-09-27T14:00:42Z",
            "cost_ledger": [{"cost_usd": "0.0374"}, {"cost_usd": 0.1},
                            {"cost_usd": "lixo"}, {"cost_usd": None}, {}]}
    data.update(over)
    p = os.path.join(tmp, "state.json")
    Path(p).write_text(json.dumps(data), encoding="utf-8")
    return p


class TestGpuCostCoerce(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="gpu-cost-coerce-")

    def test_ledger_string_costs_summed_garbage_ignored(self):
        p = _write_state(self.tmp, status="down")
        self.assertAlmostEqual(nf.mission_gpu_cost_usd(p, now=NOW), 0.1374, places=6)

    def test_iso_readyat_and_string_dph_runtime(self):
        iso_ready = "2026-09-27T14:00:42Z"
        p = _write_state(self.tmp, readyAt=iso_ready, cost_ledger=[])
        epoch = nf.cost_coerce.epoch(iso_ready)
        self.assertIsNotNone(epoch)
        self.assertAlmostEqual(nf.mission_gpu_cost_usd(p, now=epoch + 3600.0), 0.39, places=6)

    def test_numeric_state_unchanged(self):
        p = _write_state(self.tmp, readyAt=READY, dph_usd=0.39,
                         cost_ledger=[{"cost_usd": 0.05}])
        self.assertAlmostEqual(nf.mission_gpu_cost_usd(p, now=NOW), 0.44, places=6)

    def test_missing_file_still_none(self):
        self.assertIsNone(nf.mission_gpu_cost_usd(os.path.join(self.tmp, "nope.json")))

    def test_mission_completed_accepts_string_cost(self):
        with mock.patch.object(nf, "emit_event", return_value={"ok": True}) as em:
            nf.mission_completed("m", cost_usd="0.1374")
            self.assertIn("custo_gpu=US$0.1374", em.call_args[0][2])
            nf.mission_completed("m", cost_usd="lixo")  # não levanta; omite custo
            self.assertNotIn("custo_gpu", em.call_args[0][2])


class TestMissionCloseGpuStringCost(unittest.TestCase):
    """Prova de regressão: mission_close de missão fake engine:gpu com custo string."""

    def test_close_fake_gpu_mission_no_typeerror(self):
        with TempState() as ts:
            gpu_state = _write_state(ts.tmp)
            cwd = Path(ts.tmp) / "gpu-cwd"
            cwd.mkdir()
            mc.save_ledger({"missionId": "gpu-fake-1", "paneId": "w1:pG", "tabId": "t1",
                            "status": "dispatched", "cwd": str(cwd), "engine": "gpu",
                            "cost_usd": "0.0374", "updatedAt": "2026-09-27T14:40:16Z",
                            "consequence": False, "consequenceSource": "dispatch"})
            fake_proc = mock.Mock(returncode=0, stdout=b"gpu-down: DESTRUIDA (fake)\n",
                                  stderr=b"")
            _calls, track = track_calls()
            with mock.patch.object(mc, "run_herdr", track), \
                 mock.patch.object(mc.time, "sleep"), \
                 mock.patch.object(mc, "pane_exists", return_value=False), \
                 mock.patch.object(nf, "GPU_STATE", gpu_state), \
                 mock.patch.object(nf, "emit_event", return_value={"ok": True, "emitted": True}) as em, \
                 mock.patch.object(PKG.vg, "emit_bus_event"), \
                 mock.patch.object(PKG, "_spool_gpu_event") as spool, \
                 mock.patch.object(PKG.subprocess, "run", return_value=fake_proc) as run:
                out = json.loads(PKG.handle_mission_close({"missionId": "gpu-fake-1"}))
            blob = json.dumps(out)
            self.assertNotIn("TypeError", blob)
            self.assertNotIn("ValueError", blob)
            steps = {s["step"]: s for s in out["steps"]}
            self.assertTrue(steps["notify_mission_completed"]["ok"])
            self.assertTrue(steps["gpu_down"]["ok"])
            completed = [c for c in em.call_args_list if c[0][0] == "mission_completed"]
            self.assertEqual(len(completed), 1)
            # GPU-COST-FIX-01: o state tem cost_ledger com "lixo"/None/{} — somar ignorando era
            # custo subcontado (estimativa). Contrato: omissão honesta com motivo.
            self.assertNotRegex(completed[0][0][2], r"custo_gpu=US\$")
            self.assertIn("custo_gpu=unmeasured(cost_ledger_entry_unparseable)", completed[0][0][2])
            self.assertIn("cost_ledger_entry_unparseable", steps["mission_cost"]["cost_unmeasured"])
            # gpu-down.sh nunca executado de verdade: só o mock recebeu a chamada
            self.assertTrue(run.called)
            spool.assert_not_called()


if __name__ == "__main__":
    unittest.main(verbosity=2)
