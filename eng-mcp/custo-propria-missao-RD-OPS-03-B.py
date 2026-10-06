#!/usr/bin/env python3
"""RD-OPS-03-B — custo da própria missão (seção ## Custo do relatório).

Soma os eventos de usage do transcript desta sessão (fórmula idêntica a
readTranscriptUsage do eng-mcp), aplica a price table do turno e imprime o
bloco pronto para o relatório. Snapshot no fim do turno (a sessão segue viva
até o close do supervisor — nota de liveness declarada).

Run: python3 custo-propria-missao-RD-OPS-03-B.py
"""
import hashlib
import json
import sys

PRICE_TABLE = "/opt/mission-events/orchestrator-price-table.json"
SESSION_ID = "25bb389d-ae57-40dc-a7ce-780f7f4aca23"   # ledger RD-OPS-03-B
ROOTS = [
    "/opt/mission-events/.claude-config/projects",     # root herdr (panes)
    "/opt/memoryos/eng-mcp/.claude-config/projects",   # root eng-mcp
]


def find_transcript(sid):
    for root in ROOTS:
        try:
            projects = os.listdir(root)
        except Exception:
            continue
        for proj in projects:
            cand = os.path.join(root, proj, "%s.jsonl" % sid)
            if os.path.exists(cand):
                return cand
    return None


def read_usage(path):
    tin = tout = tcr = tcc = 0
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
            tcc += u.get("cache_creation_input_tokens") or 0
    return model, {"inputTokens": tin, "outputTokens": tout,
                   "cacheReadTokens": tcr, "cacheCreationTokens": tcc}


import os
path = find_transcript(SESSION_ID)
if not path:
    print("transcript não achado", file=sys.stderr)
    sys.exit(1)
sha16 = hashlib.sha256(open(path, "rb").read()).hexdigest()[:16]
model, tok = read_usage(path)
table = json.load(open(PRICE_TABLE, encoding="utf-8")).get("models") or {}
pr = table.get(model) or {}
cost = (tok["inputTokens"] * pr.get("in", 0) + tok["outputTokens"] * pr.get("out", 0)
        + tok["cacheReadTokens"] * pr.get("cache_read", 0)) / 1e6
print(json.dumps({
    "transcriptPath": path, "transcriptSha16": sha16, "model": model,
    "tokens": tok, "costUsdEstimate": round(cost, 6),
    "formula": "custo = (in×%s + out×%s + cache_read×%s)/1e6"
               % (pr.get("in"), pr.get("out"), pr.get("cache_read")),
}, ensure_ascii=False, indent=1))
