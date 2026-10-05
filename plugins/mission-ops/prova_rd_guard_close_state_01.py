"""PROVA E2E RD-GUARD-CLOSE-STATE-01 (04/10) — ciclo determinístico completo.

  Cenário 1: missão sintética com turn_done (relatório + verify verde) →
             watcher grava ledger.awaitingClose=true → handle_mission_close
             com canal supervisor MOCKADO (gateway) SEM token → close executa
             (ledger closed + chatDeliverable.delivered no ledger).
  Cenário 2: mesma missão SEM turn_done (sem flag) → close de supervisor SEM
             token → SUPERVISOR_ACTION_NEEDS_ORDER, ledger INTOCADO.

Exit 0 = PROVA-E2E-OK; exit 1 = falha (imprime o passo).

Run: python3 prova_rd_guard_close_state_01.py   (herdr 100% mockado; estado em tmp)
"""

from __future__ import annotations

import json
import os
import sys
import time
import unittest.mock as mock
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_mission_ops import PKG, TempState, track_calls, fake_herdr, out_result, \
    pane_entry, panes_ok, procinfo  # noqa: E402

mc = PKG.mc
sg = PKG.sg
MID1 = "gcse2e1-%d" % os.getpid()
MID2 = "gcse2e2-%d" % os.getpid()


def _footer(epoch: float) -> str:
    return "· done " + time.strftime("%I:%M %p", time.localtime(epoch)).lstrip("0")


def _setup_done_mission(mid, verify=True):
    cwd = Path(mc.STATE_DIR).parent / ("cwd-%s" % mid)
    cwd.mkdir(parents=True, exist_ok=True)
    (cwd / ("RELATORIO-%s.md" % mid)).write_text("# relatório final\n", encoding="utf-8")
    if verify:
        manifest = json.dumps({"mission": mid, "cmd": [{"run": "echo ok", "expect_exit": 0}]})
        (cwd / "verify.json").write_text(manifest, encoding="utf-8")
        (cwd / ("verify-%s.json" % mid)).write_text(manifest, encoding="utf-8")
    mc.save_ledger({"missionId": mid, "paneId": "w1:pZ", "tabId": "t1",
                    "status": "dispatched", "cwd": str(cwd),
                    "promptFile": str(cwd / "prompt.md")})
    return cwd


def _watch_turn_done(mid):
    pane = "w1:pZ"
    text = "tudo verde\n" + _footer(time.time())
    script = {
        "pane list": panes_ok([pane_entry(pane)]),
        f"pane read {pane} --source recent-unwrapped --lines 40": out_result(text),
        f"pane process-info --pane {pane}": procinfo("claude"),
    }
    with mock.patch.object(mc, "run_herdr", fake_herdr(script)):
        return json.loads(PKG.handle_mission_watch({"missionId": mid, "snapshot": "true"}))


def _real_runner():
    real_run = PKG.subprocess.run

    def runner(cmd, *a, **kw):
        if isinstance(cmd, list) and "/opt/deliver-verify/verify.py" in cmd \
                and "--ledger-dir" not in cmd:
            cmd = cmd + ["--ledger-dir", str(mc.STATE_DIR)]
        return real_run(cmd, *a, **kw)
    return runner


class _Supervisor:
    """Canal supervisor MOCKADO (gateway) — env MISSION_OPS_GUARD_CHANNEL limpo,
    subject supervisor, spool tmp. Sem token de ordem em NENHUMA chamada."""

    def __init__(self, spool: Path):
        self._patches = [
            mock.patch.object(sg, "_GATEWAY_BOOTED", True),
            mock.patch.object(sg, "_DEFAULT_SPOOL", str(spool)),
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


def _supervisor_close(mid):
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


def _fail(step, detail):
    print("PROVA-E2E-FAIL %s: %s" % (step, detail))
    sys.exit(1)


def main():
    with TempState() as ts:
        # ---- Cenário 1: turn_done → awaitingClose → close supervisor SEM token
        _setup_done_mission(MID1)
        res = _watch_turn_done(MID1)
        if res.get("verdict") != "awaiting_close":
            _fail("cenario1.watch", "verdict=%r" % res.get("verdict"))
        led = mc.load_ledger(MID1)
        if led.get("awaitingClose") is not True:
            _fail("cenario1.flag", "awaitingClose=%r" % led.get("awaitingClose"))
        with _Supervisor(Path(ts.tmp) / "spool.jsonl"):
            out = _supervisor_close(MID1)  # SEM operatorOrder/token
        if "SUPERVISOR_ACTION_NEEDS_ORDER" in str(out):
            _fail("cenario1.close", str(out)[:200])
        if not out.get("ok"):
            _fail("cenario1.close.ok", str(out)[:300])
        led = mc.load_ledger(MID1)
        if led.get("status") != "closed":
            _fail("cenario1.status", led.get("status"))
        if (led.get("chatDeliverable") or {}).get("delivered") is not True:
            _fail("cenario1.deliverable", str(led.get("chatDeliverable"))[:200])
        print("CENARIO-1-OK: turn_done → awaitingClose=true → close supervisor SEM token "
              "executou (closed + chatDeliverable.delivered no ledger)")

        # ---- Cenário 2: sem turn_done → recusa tipada, ledger INTOCADO
        cwd2 = _setup_done_mission(MID2, verify=False)  # sem verify.json = sem awaiting_close
        with _Supervisor(Path(ts.tmp) / "spool.jsonl"):
            out2 = _supervisor_close(MID2)
        if out2.get("error") != "SUPERVISOR_ACTION_NEEDS_ORDER":
            _fail("cenario2.recusa", str(out2)[:200])
        led2 = mc.load_ledger(MID2)
        if led2.get("status") != "dispatched":
            _fail("cenario2.status", led2.get("status"))
        if "awaitingClose" in led2:
            _fail("cenario2.flag", "awaitingClose vazou na recusa")
        if led2.get("cwd") != str(cwd2):
            _fail("cenario2.cwd", "ledger mutado na recusa")
        print("CENARIO-2-OK: sem turn_done → SUPERVISOR_ACTION_NEEDS_ORDER, ledger intocado")
    print("PROVA-E2E-OK RD-GUARD-CLOSE-STATE-01")


if __name__ == "__main__":
    main()