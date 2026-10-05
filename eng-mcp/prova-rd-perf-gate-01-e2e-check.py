#!/usr/bin/env python3
"""RD-PERF-GATE-01 — checagem tipada dos alvos da prova E2E (prova-rd-perf-gate-01-e2e.json).

Contrato da missão: queda ≥ 40% no p50 do gate (fresh vs cacheado, harness idêntico),
p50 cacheado < 1.5s, decisão idêntica para o MESMO input, recusa idêntica para o MESMO
repeat, dedupe_cached=true nos hits do cache. Exit 0 = todos os alvos cumpridos.
"""
import json
import sys

PATH = "prova-rd-perf-gate-01-e2e.json"

with open(PATH, encoding="utf-8") as f:
    d = json.load(f)

fails = []


def check(name, ok, detail=""):
    print(("OK  " if ok else "FAIL") + " " + name + (" | " + detail if detail else ""))
    if not ok:
        fails.append(name)


cached_ms = d.get("p50_cached_ms")
fresh_ms = d.get("p50_fresh_ms")
check("p50 cacheada < 1500ms", cached_ms is not None and cached_ms < 1500,
      "p50_cached_ms=%s" % cached_ms)
drop = None
if fresh_ms and cached_ms is not None and fresh_ms > 0:
    drop = round((fresh_ms - cached_ms) / fresh_ms * 100, 1)
check("queda p50 >= 40%", drop is not None and drop >= 40.0,
      "queda=%s%% (fresh=%sms cached=%sms)" % (drop, fresh_ms, cached_ms))
check("decisão idêntica (MESMO input fresh vs cacheado)", d.get("decisao_idêntica") is True, "")
check("recusa idêntica (MESMO repeat fresh vs cacheado)", d.get("recusa_idêntica") is True, "")
hits = [c for c in d.get("cached", []) if c.get("dedupeCached")]
check("hits do cache presentes (dedupe_cached=true)", len(hits) >= 3,
      "hits=%d de %d" % (len(hits), len(d.get("cached", []))))
check("todas as capturas ok", all(c.get("ok") for c in d.get("cached", []) + d.get("fresh", [])), "")

sys.exit(1 if fails else 0)
