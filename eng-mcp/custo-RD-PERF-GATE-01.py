#!/usr/bin/env python3
"""RD-PERF-GATE-01 — custo da missão: soma usage dos transcripts jsonl DESTE worker
(projetos -opt-memoryos-eng-mcp e -opt-memoryos que contêm o marcador da missão
"missao-rd-perf-gate-01.md"), evitando dupla contagem (um arquivo = uma sessão).
Custo pela fórmula RD-OPS-03-SPEND-01 com a tabela orchestrator-price-table.json
(z-ai/glm-5.3-flash: in 0.15 / out 0.5 / cache_read 0.03 por 1M)."""
import glob
import json
import os

MARKER = "missao-rd-perf-gate-01.md"
PROJ = "/opt/memoryos/eng-mcp/.claude-config/projects/-opt-memoryos-eng-mcp"
PROJ2 = "/opt/memoryos/eng-mcp/.claude-config/projects/-opt-memoryos"
files = []
for proj in (PROJ, PROJ2):
    for arq in glob.glob(os.path.join(proj, "*.jsonl")):
        try:
            head = open(arq, encoding="utf-8", errors="replace").read(2_000_000)
        except OSError:
            continue
        if MARKER in head or "RD-PERF-GATE-01" in head:
            files.append(arq)
tot = {"in": 0, "out": 0, "cache_read": 0, "cache_write": 0}
n_ev = 0
per_file = {}
for arq in files:
    f_tot = {"in": 0, "out": 0, "cache_read": 0, "cache_write": 0}
    with open(arq, encoding="utf-8", errors="replace") as f:
        for line in f:
            try:
                ev = json.loads(line)
            except Exception:
                continue
            msg = ev.get("message") or {}
            usage = msg.get("usage") if ev.get("type") == "assistant" else None
            if not usage:
                continue
            n_ev += 1
            f_tot["in"] += usage.get("input_tokens", 0) or 0
            f_tot["out"] += usage.get("output_tokens", 0) or 0
            f_tot["cache_read"] += usage.get("cache_read_input_tokens", 0) or 0
            f_tot["cache_write"] += usage.get("cache_creation_input_tokens", 0) or 0
    per_file[os.path.basename(arq)] = f_tot
    for k in tot:
        tot[k] += f_tot[k]
custo = (tot["in"] * 0.15 + tot["out"] * 0.5 + (tot["cache_read"] + tot["cache_write"]) * 0.03) / 1e6
res = {
    "ts": os.popen("date -u +%Y-%m-%dT%H:%M:%SZ").read().strip(),
    "transcripts": sorted(per_file),
    "eventos_assistant_com_usage": n_ev,
    "input": tot["in"],
    "output": tot["out"],
    "cache_read": tot["cache_read"],
    "cache_write": tot["cache_write"],
    "modelo": "z-ai/glm-5.3-flash (tabela orchestrator-price-table.json 2026-10-01)",
    "custo_formula": "(in*0.15 + out*0.5 + (cache_read+cache_write)*0.03)/1e6",
    "custo_usd": round(custo, 4),
}
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "custo-RD-PERF-GATE-01.json"), "w", encoding="utf-8") as f:
    json.dump(res, f, indent=2, ensure_ascii=False)
print(json.dumps(res, ensure_ascii=False))
