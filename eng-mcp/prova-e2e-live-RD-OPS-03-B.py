#!/usr/bin/env python3
"""RD-OPS-03-B — E2E ao vivo do caminho de spend no close (prova do contrato).

Provas (contrato RD-OPS-03-SPEND-01, seção "Provas"):
(a) lookup de transcript no layout real dos panes herdr CONTRA O SERVIDOR DE
    PRODUÇÃO (:8787, engineering.orchestrate.mission_spend):
    - GUARDIAN-MOBILE-02 → costUsd medido, fonte citada (transcript path + sha256-16);
    - DOCTRINE-SHIP-01 → costUsd null + reason "no-transcript" (causa nomeada).
(b) close de missão COM transcript → ledger["spend"] com a forma do contrato
    {inputTokens, outputTokens, cacheReadTokens, costUsdEstimate, source} +
    ledger["cost"] preenchido. Estratégia: CÓPIA do ledger REAL de
    GUARDIAN-MOBILE-02 (status dispatched) fechada em TempState — o servidor de
    produção resolve o missionId real (ledger+transcript no layout herdr) e o
    close grava cost+spend na cópia isolada. Produção intacta.
(c) close de missão SEM transcript → cost_unmeasured "spend_no-transcript" com a
    causa nomeada + spend honesto (custo null, sem tokens inventados). Cópia REAL
    de RD-HERDR-OSC-01 (sessão purgada) em TempState. NUNCA o inverso.

Run: python3 prova-e2e-live-RD-OPS-03-B.py
"""
import json
import os
import sys
from unittest import mock

# close_commit_guard: com cwd dentro do repo eng-mcp, o close de missão cujo
# RELATORIO-<id>.md está untracked no repo recusa (verdict uncommitted_delivery) —
# ortogonal ao fio de spend. A prova roda do cwd do contrato (sem git), como o
# worker real de /opt/mission-events.
os.chdir("/opt/mission-events")

sys.path.insert(0, "/root/.hermes/plugins/mission-ops")
from test_mission_ops import PKG, TempState, track_calls  # noqa: E402

mc, nf = PKG.mc, PKG.nf
REAL_STATE = "/root/.hermes/mission-state"
FAILS = []
CHECKS = [0]


def check(name, cond, detail=""):
    CHECKS[0] += 1
    print("%-62s %s%s" % (name, "OK" if cond else "FAIL", (" — " + detail) if detail else ""))
    if not cond:
        FAILS.append(name)


def _copy_real_ledger(mission_id):
    """Cópia MÍNIMA do ledger real para fechar em TempState (produção nunca é tocada;
    só os campos do caminho de custo — o close completo da missão real não é o alvo)."""
    with open(os.path.join(REAL_STATE, mission_id + ".json")) as fh:
        real = json.load(fh)
    led = {"missionId": mission_id, "status": "dispatched",
           "engine": real.get("engine") or "openrouter-fallback",
           "resumeSessionId": real.get("resumeSessionId"),
           "promptFile": real.get("promptFile"),
           "cwd": real.get("cwd")}
    return led


def _close_in_temp(mission_id):
    with TempState():
        mc.save_ledger(_copy_real_ledger(mission_id))
        calls, track = track_calls()
        with mock.patch.object(mc, "run_herdr", track), \
             mock.patch.object(mc.time, "sleep"), \
             mock.patch.object(PKG.rd, "DEFAULT_ROADMAP", "/nao-existe-roadmap-e2e.md"), \
             mock.patch.object(nf, "ENG_MCP_CALLS_OFF", False):
            out = json.loads(PKG.handle_mission_close({"missionId": mission_id}))
        with open(os.path.join(str(mc.STATE_DIR), mission_id + ".json")) as fh:
            led = json.load(fh)
    return out, led


# --- (a) servidor de produção: lookup no layout herdr (o fix desta missão)
p_gm2, err_gm2 = nf.engineering_call(
    "engineering.orchestrate.mission_spend", {"missionId": "GUARDIAN-MOBILE-02"},
    timeout_s=30.0)
check("live GUARDIAN-MOBILE-02 → medido (costUsd > 0)",
      bool(p_gm2) and isinstance(p_gm2.get("costUsd"), (int, float)) and p_gm2["costUsd"] > 0,
      ("US$%.6f" % p_gm2["costUsd"]) if p_gm2 else str(err_gm2))
check("live GUARDIAN-MOBILE-02 → fonte citada (transcriptPath + sha256-16)",
      bool(p_gm2 and p_gm2.get("transcriptPath") and p_gm2.get("transcriptSha16")),
      str((p_gm2 or {}).get("transcriptSha16")))
p_ds1, err_ds1 = nf.engineering_call(
    "engineering.orchestrate.mission_spend", {"missionId": "DOCTRINE-SHIP-01"},
    timeout_s=30.0)
check("live DOCTRINE-SHIP-01 → custo null + reason no-transcript",
      bool(p_ds1) and p_ds1.get("costUsd") is None and p_ds1.get("reason") == "no-transcript",
      str((p_ds1 or {}).get("reason") or err_ds1))

# --- (b) close de missão COM transcript (cópia real em TempState, servidor ao vivo)
out, led = _close_in_temp("GUARDIAN-MOBILE-02")
spend = led.get("spend") or {}
check("close com transcript → ok", out.get("ok") is True)
check("close com transcript → spend com a forma do contrato",
      all(k in spend for k in ("inputTokens", "outputTokens",
                               "cacheReadTokens", "costUsdEstimate", "source")))
check("close com transcript → spend custo medido (> 0)",
      isinstance(spend.get("costUsdEstimate"), (int, float)) and spend["costUsdEstimate"] > 0,
      ("US$%.6f" % spend["costUsdEstimate"]) if spend.get("costUsdEstimate") is not None else "null")
check("close com transcript → fonte citada no spend (transcript+sha256-16)",
      "transcript=" in str(spend.get("source", "")) and "sha256-16=" in str(spend.get("source", "")),
      str(spend.get("source", ""))[:120])
check("close com transcript → NUNCA o inverso (cost sem cost_unmeasured)",
      not (led.get("cost") or {}).get("cost_unmeasured"))

# --- (c) close de missão SEM transcript (cópia real em TempState, servidor ao vivo).
# RD-HERDR-OSC-01: transcript da sessão d8d4ba73 purgado (servidor → no-transcript)
# e sem entregáveis pendentes no repo do plugin (close_commit_guard não interfere).
out2, led2 = _close_in_temp("RD-HERDR-OSC-01")
spend2 = led2.get("spend") or {}
check("close sem transcript → ok (fail-open, close segue)",
      out2.get("ok") is True)
check("close sem transcript → cost_unmeasured causa nomeada",
      str((led2.get("cost") or {}).get("cost_unmeasured", "")) == "spend_no-transcript",
      str((led2.get("cost") or {}).get("cost_unmeasured")))
check("close sem transcript → spend custo null",
      spend2.get("costUsdEstimate") is None)
check("close sem transcript → NUNCA número/tokens inventados",
      "inputTokens" not in spend2 and "costUsd" not in spend2 and "source" not in spend2)

print("E2E-LIVE %s: %d checks, %d fails" % ("OK" if not FAILS else "FAIL", CHECKS[0], len(FAILS)))
sys.exit(1 if FAILS else 0)
