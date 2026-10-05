#!/usr/bin/env python3
"""RD-LOOP-01 — custo REAL da missão (RD-OPS-03-SPEND-01): parse do usage no
transcript da sessão. Emite tokens por categoria + custo USD com a FÓRMULA da
tabela de preços do orquestrador. Nunca inventa número: só o que está nos
registros de usage do transcript.

Run: python3 prova_custo_rd_loop_01.py <transcript.jsonl>
"""
import json
import sys

PRICE_TABLE = "/opt/mission-events/orchestrator-price-table.json"


def main():
    if len(sys.argv) < 2:
        print("uso: prova_custo_rd_loop_01.py <transcript.jsonl>", file=sys.stderr)
        return 2
    cats = {"input": 0, "output": 0, "cache_read": 0, "cache_creation": 0}
    n_msgs = 0
    with open(sys.argv[1], encoding="utf-8") as f:
        for line in f:
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue
            msg = d.get("message") or {}
            usage = msg.get("usage") or {}
            if not usage:
                continue
            n_msgs += 1
            cats["input"] += int(usage.get("input_tokens") or 0)
            cats["output"] += int(usage.get("output_tokens") or 0)
            cats["cache_read"] += int(usage.get("cache_read_input_tokens")
                                      or usage.get("cacheReadInputTokens") or 0)
            cats["cache_creation"] += int(usage.get("cache_creation_input_tokens")
                                          or usage.get("cacheCreationInputTokens") or 0)
    model = sys.argv[2] if len(sys.argv) > 2 else "z-ai/glm-5.3-flash"
    prices = {}
    cost_usd = None
    try:
        with open(PRICE_TABLE, encoding="utf-8") as f:
            pt = json.load(f)
        m = (pt.get("models") or {}).get(model)
        if m:
            prices = {k: m.get(k) for k in ("in", "out", "cache_read")}
            cost_usd = round((cats["input"] * m["in"] + cats["output"] * m["out"]
                              + cats["cache_read"] * m["cache_read"]) / 1e6, 4)
    except Exception as e:
        prices["error"] = str(e)

    print(json.dumps({
        "transcript": sys.argv[1],
        "model": model,
        "assistant_msgs_com_usage": n_msgs,
        "tokens": cats,
        "price_table_usd_per_1M": prices,
        "cost_usd": cost_usd if cost_usd is not None else "não medido: preços ausentes para %s" % model,
        "formula": "custo = (in*p_in + out*p_out + cache_read*p_cache)/1e6 "
                   "(preços em orchestrator-price-table.json)",
    }, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())