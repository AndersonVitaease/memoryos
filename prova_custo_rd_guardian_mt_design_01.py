#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Prova de custo (RD-OPS-03-SPEND-01): soma tokens por categoria no transcript
da sessao e aplica a formula da tabela de precos (z-ai/glm-5.3-flash).
Zero rede; leitura read-only do transcript; imprime JSON no stdout."""
import json
import sys

TRANSCRIPT = ("/opt/operator-harness/.claude-config/projects/"
              "-opt-operator-harness/793fe410-8c83-4afc-ba33-9405b297c49e.jsonl")
# Tabela /opt/mission-events/orchestrator-price-table.json (verified_at 2026-10-01)
P_IN, P_OUT, P_CACHE = 0.15, 0.5, 0.03

totals = {"input": 0, "output": 0, "cache_read": 0, "cache_creation": 0}
n_entries = 0
with open(TRANSCRIPT, encoding="utf-8") as fh:
    for line in fh:
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        msg = entry.get("message") or {}
        usage = msg.get("usage") or {}
        if not usage:
            continue
        n_entries += 1
        totals["input"] += int(usage.get("input_tokens") or 0)
        totals["output"] += int(usage.get("output_tokens") or 0)
        totals["cache_read"] += int(usage.get("cache_read_input_tokens") or 0)
        totals["cache_creation"] += int(usage.get("cache_creation_input_tokens") or 0)

cost = (totals["input"] * P_IN + totals["output"] * P_OUT
        + totals["cache_read"] * P_CACHE) / 1e6
print(json.dumps({
    "transcript_sha256_16": __import__("hashlib").sha256(
        open(TRANSCRIPT, "rb").read()).hexdigest()[:16],
    "usage_entries": n_entries,
    "tokens": totals,
    "prices": {"in": P_IN, "out": P_OUT, "cache_read": P_CACHE},
    "formula": "custo = (in*0.15 + out*0.5 + cache_read*0.03)/1e6",
    "cost_usd": round(cost, 6),
}, ensure_ascii=False))
sys.exit(0 if n_entries > 0 else 1)