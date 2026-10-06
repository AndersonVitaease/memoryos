#!/usr/bin/env python3
"""RD-OPS-03-B — cross-check independente (prova do contrato: "soma dos eventos de
usage do transcript = campo do ledger", 2 missões de custo conhecido).

Para cada missão: re-soma os eventos de usage do transcript (cost-state + assistant,
fórmula idêntica a readTranscriptUsage do eng-mcp), recalcula o USD com a price table
do turno e CONFERE com os campos inputTokens/outputTokens/cacheReadTokens/costUsd do
ledger["cost"]. Também confere o sha256-16 citado na fonte.

Alvos: RD-MOPS-01 (medido no retro da 1ª execução) e GUARDIAN-MOBILE-02 (medido no
retro desta execução — RD-OPS-03-B).

Run: python3 prova-cross-check-RD-OPS-03-B.py
"""
import hashlib
import json
import os
import sys

STATE_DIR = "/root/.hermes/mission-state"
PRICE_TABLE = "/opt/mission-events/orchestrator-price-table.json"
TARGETS = ["RD-MOPS-01", "GUARDIAN-MOBILE-02"]
FAILS = []


def read_usage(path):
    tin = tout = tcr = 0
    model = None
    for line in open(path, encoding="utf-8", errors="replace"):
        line = line.strip()
        if not line:
            continue
        try:
            o = json.loads(line)
        except ValueError:
            continue
        if o.get("type") == "cost-state" and o.get("modelUsage"):
            for _m, u in o["modelUsage"].items():
                tin += u.get("inputTokens") or 0
                tout += u.get("outputTokens") or 0
                tcr += u.get("cacheReadInputTokens") or 0
        if o.get("type") in ("assistant", "message") and isinstance(o.get("message"), dict):
            if o["message"].get("model"):
                model = o["message"]["model"]
            u = o["message"].get("usage") or {}
            tin += u.get("input_tokens") or 0
            tout += u.get("output_tokens") or 0
            tcr += u.get("cache_read_input_tokens") or 0
    return model, {"inputTokens": tin, "outputTokens": tout, "cacheReadTokens": tcr}


def main():
    table = json.load(open(PRICE_TABLE, encoding="utf-8")).get("models") or {}
    for mid in TARGETS:
        led = json.load(open(os.path.join(STATE_DIR, mid + ".json"), encoding="utf-8"))
        cost = led.get("cost") or {}
        src = str(cost.get("source") or "")
        path = src.split("transcript=")[1].split(" sha256-16=")[0] if "transcript=" in src else None
        sha16 = src.split("sha256-16=")[1].split()[0] if "sha256-16=" in src else None
        if not path or not os.path.exists(path):
            print("%-22s FAIL — transcript não achado na fonte citada: %s" % (mid, src[:80]))
            FAILS.append(mid)
            continue
        sha_now = hashlib.sha256(open(path, "rb").read()).hexdigest()[:16]
        model, tok = read_usage(path)
        pr = table.get(model) or {}
        recount = round((tok["inputTokens"] * pr.get("in", 0)
                         + tok["outputTokens"] * pr.get("out", 0)
                         + tok["cacheReadTokens"] * pr.get("cache_read", 0)) / 1e6, 6)
        ledger_cost = cost.get("costUsd") if cost.get("costUsd") is not None else cost.get("costUsdEstimate")
        ok_tok = (tok["inputTokens"] == cost.get("inputTokens")
                  and tok["outputTokens"] == cost.get("outputTokens")
                  and tok["cacheReadTokens"] == cost.get("cacheReadTokens"))
        ok_cost = abs((recount or 0) - (ledger_cost or 0)) < 1e-6
        ok_sha = (sha_now == sha16)
        ok_model = (not model) or (cost.get("model") == model) or (model in src)
        verdict = "match=True" if (ok_tok and ok_cost and ok_sha and ok_model) else "match=False"
        print("%-22s %s recount=%s ledger=%s model=%s sha16=%s"
              % (mid, verdict, recount, ledger_cost, model, sha_now))
        if verdict != "match=True":
            FAILS.append(mid)
    print("CROSS-CHECK %s: soma dos eventos de usage = campo do ledger (%d missões)"
          % ("OK" if not FAILS else "FAIL", len(TARGETS)))
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
