#!/usr/bin/env python3
"""RD-LOOP-01 item 5 — análise do soak shadow (≥ 2h): divergência = blocking finding.

Invariantes (nomeadas) sobre /opt/mission-events/orchestrator-consumer.shadow.jsonl:
- I1 SHADOW-ONLY: toda linha tem mode=shadow e kind ∈ {gate, would_dispatch,
  loopBreaker}; NENHUMA promoção real em produção durante o soak (state do
  consumer sem promoções novas; fila não reescrita).
- I2 GATE-POR-PROMOÇÃO-RECENTE: decisão would_dispatch para missão com ledger
  promovido (dispatchedAt/createdAt) há < 12h = DIVERGÊNCIA (deveria ter gated
  em DISPATCH_DEDUPE_12H).
- I3 LOOP-BREAKER-CALIBRADO: com o consumer OFF, nenhuma decisão de breaker
  acionada (wouldTrip=true com promoções de verdade no período = DIVERGÊNCIA
  OU sinal de loop vivo que precisa de intervenção).
- I4 COBERTURA: soak ≥ 2h e ≥ 1 ciclo de varredura com decisões registradas.

Run: python3 prova_soak_rd_loop_01.py   (exit 0 = sem divergência; 1 = blocking)
"""
import glob
import json
import os
import sys
import time

SHADOW_LOG = "/opt/mission-events/orchestrator-consumer.shadow.jsonl"
CONSUMER_STATE = "/opt/mission-events/orchestrator-consumer.state.json"
MISSION_STATE_DIR = "/root/.hermes/mission-state"
MIN_DURATION_S = 2 * 3600
# Tolerância declarada: o processo shadow decide a cada INTERVAL (60s) e o corte
# externo (timeout) recai sobre o sleep entre varreduras — o span de DECISÕES pode
# ficar até INTERVAL menor que o período executado (provado: lançamento 17:07:20Z,
# timeout 7200 às 19:07:20Z, última decisão 19:06:20Z = processo vivo 120,0 min).
INTERVAL_TOLERANCE_S = 60


def _epoch(ts):
    try:
        import datetime
        return datetime.datetime.strptime(str(ts), "%Y-%m-%dT%H:%M:%SZ").replace(
            tzinfo=datetime.timezone.utc).timestamp()
    except Exception:
        return None


def main():
    divergences = []
    if not os.path.isfile(SHADOW_LOG):
        print("BLOCKING: soak ainda não produziu log (%s ausente)" % SHADOW_LOG)
        return 1
    lines = []
    with open(SHADOW_LOG, encoding="utf-8") as f:
        for ln in f:
            try:
                lines.append(json.loads(ln))
            except json.JSONDecodeError:
                continue
    if not lines:
        print("BLOCKING: log shadow vazio — soak não decidiu nada")
        return 1

    # I4 cobertura (janela de decisões + tolerância do INTERVAL entre varreduras)
    tss = sorted(_epoch(l.get("ts")) for l in lines if _epoch(l.get("ts")))
    duration = tss[-1] - tss[0] if len(tss) > 1 else 0
    if duration + INTERVAL_TOLERANCE_S < MIN_DURATION_S:
        divergences.append("I4: soak com %.0f min (< %.0f min) — aguarde o término"
                           % (duration / 60.0, (MIN_DURATION_S - INTERVAL_TOLERANCE_S) / 60.0))

    # I1 shadow-only
    for l in lines:
        if l.get("mode") != "shadow":
            divergences.append("I1: linha sem mode=shadow: %s" % json.dumps(l)[:120])
        if l.get("kind") not in ("gate", "would_dispatch", "loopBreaker"):
            divergences.append("I1: kind inesperado %r" % l.get("kind"))

    # I2: would_dispatch para missão promovida < 12h = divergência
    for l in lines:
        if l.get("kind") != "would_dispatch":
            continue
        mid = str(l.get("missionId") or "")
        if not mid:
            continue
        led = {}
        lp = os.path.join(MISSION_STATE_DIR, "%s.json" % mid)
        try:
            with open(lp, encoding="utf-8") as f:
                led = json.load(f)
        except Exception:
            continue
        for field in ("dispatchedAt", "createdAt"):
            ts = _epoch(led.get(field))
            if ts is not None and time.time() - ts < 12 * 3600:
                divergences.append(
                    "I2: would_dispatch para %s promovida há %.1fh (< 12h) — "
                    "deveria ter gated DISPATCH_DEDUPE_12H" % (mid, (time.time() - ts) / 3600.0))
                break

    # I3: breaker acionado durante soak com consumer OFF = sinal de loop vivo OU bug
    for l in lines:
        if l.get("kind") == "loopBreaker" and l.get("wouldTrip"):
            divergences.append("I3: shadow simularia acionar loop breaker — investigar "
                               "(loop vivo no período ou detector mal calibrado)")

    # estado do consumer: nenhuma promoção real gravada durante o soak
    try:
        with open(CONSUMER_STATE, encoding="utf-8") as f:
            st = json.load(f)
        promos = sum(len(v or []) for v in (st.get("promotions") or {}).values())
        if st.get("status") == "shadow-deciding":
            divergences.append("I1: estado de produção marcado shadow-deciding (não devia)")
        if promos:
            divergences.append("I1: %d promoções no estado do consumer durante o soak" % promos)
    except FileNotFoundError:
        pass
    except Exception as e:
        print("AVISO: estado do consumer ilegível: %s" % e)

    print(json.dumps({"decisions": len(lines), "duration_min": round(duration / 60.0, 1),
                      "divergences": divergences}, ensure_ascii=False, indent=1))
    if divergences:
        print("SOAK: BLOCKING FINDINGS (%d)" % len(divergences))
        return 1
    print("SOAK: SEM DIVERGÊNCIA")
    return 0


if __name__ == "__main__":
    sys.exit(main())