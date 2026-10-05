#!/usr/bin/env python3
"""RD-PERF-GATE-01 — baseline: latência REAL do capture no server vivo (984a4504).

Mede, via HTTP MCP (mesmo transporte do notify.py / RD-EV-04):
  1. engineering.memory.context (leitura do dedupe, limit 20) — N amostras
  2. engineering.memory.capture completo (gate + store) — N amostras, projectId
     dedicado rd-perf-gate-01-baseline (poluição isolada do KB de produção)
Escreve prova-rd-perf-gate-01-baseline.json no cwd. Nunca imprime token.
"""
import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.request

ENG_MCP_URL = os.environ.get("ENG_MCP_SERVER_URL") or "http://127.0.0.1:8787/mcp"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "prova-rd-perf-gate-01-baseline.json")


def _token() -> str | None:
    env = os.environ.get("ENG_MCP_TOKEN")
    if env:
        return env.strip()
    try:
        with open(os.path.expanduser("~/.claude.json"), encoding="utf-8") as f:
            cfg = json.load(f)
        auth = ((cfg.get("mcpServers") or {}).get("memoryos-engmcp") or {})
        auth = (auth.get("headers") or {}).get("Authorization") or ""
        return auth.split(" ", 1)[1].strip() if " " in auth else (auth or None)
    except Exception:
        return None


_HEADERS = {"content-type": "application/json", "accept": "application/json, text/event-stream"}
_tok = _token()
if _tok:
    _HEADERS["authorization"] = "Bearer " + _tok
    _tok = None  # não guardar em variável global viva


def _post(body: dict) -> str:
    req = urllib.request.Request(ENG_MCP_URL, data=json.dumps(body).encode(),
                                 headers=_HEADERS, method="POST")
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8", "replace")


def call(tool: str, args: dict) -> tuple[dict | None, float, str | None]:
    """(payload, ms, erro) — parse do envelope SSE/JSON."""
    t0 = time.perf_counter()
    try:
        _post({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
            "jsonrpc": "2.0", "capabilities": {},
            "clientInfo": {"name": "rd-perf-gate-01", "version": "1.0"},
            "protocolVersion": "2025-06-18"}})
        _post({"jsonrpc": "2.0", "method": "notifications/initialized"})
        raw = _post({"jsonrpc": "2.0", "id": 2, "method": "tools/call",
                     "params": {"name": tool, "arguments": args}})
    except urllib.error.HTTPError as e:
        return None, (time.perf_counter() - t0) * 1000, "mcp_http_%d" % e.code
    except Exception as e:
        return None, (time.perf_counter() - t0) * 1000, "mcp_http_failed: %s" % e.__class__.__name__
    ms = (time.perf_counter() - t0) * 1000
    envelope = None
    for line in raw.splitlines():
        if line.startswith("data:"):
            try:
                envelope = json.loads(line[5:].strip())
            except ValueError:
                continue
            break
    if envelope is None:
        try:
            envelope = json.loads(raw)
        except ValueError:
            return None, ms, "mcp_response_unparseable"
    if not isinstance(envelope, dict) or envelope.get("error"):
        return None, ms, "mcp_error: %s" % str((envelope or {}).get("error"))[:200]
    result = envelope.get("result") or {}
    if result.get("isError"):
        text = next((p.get("text") for p in (result.get("content") or []) if isinstance(p, dict)), "")
        return None, ms, "tool_error: %s" % str(text)[:300]
    return result, ms, None


def p50(v):
    return round(statistics.median(v), 1)


def main():
    n_ctx = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    n_cap = int(sys.argv[2]) if len(sys.argv) > 2 else 7
    pid = "rd-perf-gate-01-baseline"
    out = {"ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
           "server": "live:984a4504", "projectId": pid, "context": [], "captures": []}

    for i in range(n_ctx):
        payload, ms, err = call("engineering.memory.context", {"projectId": pid, "limit": 20})
        out["context"].append({"ms": round(ms, 1), "ok": err is None, "err": err})
        time.sleep(0.3)

    uniq = time.strftime("prova baseline RD-PERF-GATE-01 %H:%M:%S", time.gmtime())
    for i in range(n_cap):
        uniq = uniq + " ."
        payload, ms, err = call("engineering.memory.capture", {
            "summary": "Prova de latência da missão RD-PERF-GATE-01 (baseline do server vivo). %s" % uniq,
            "projectId": pid,
            "agent": "mission-close:auto",
            "outcome": "medição p50 do capture end-to-end via HTTP MCP; conteúdo é telemetria da prova",
            "decisions": ["medir antes/depois da otimização do gate de memória"],
        })
        text = ""
        if payload:
            for p in (payload.get("content") or []):
                if isinstance(p, dict) and p.get("text"):
                    text = p["text"]
                    break
        gate = None
        try:
            parsed = json.loads(text)
            gate = parsed.get("gate")
        except Exception:
            pass
        out["captures"].append({"ms": round(ms, 1), "ok": err is None, "err": err,
                                "gate": gate, "memoryId_sha16": None})
        time.sleep(0.5)

    ok_ctx = [c["ms"] for c in out["context"] if c["ok"]]
    ok_cap = [c["ms"] for c in out["captures"] if c["ok"]]
    out["p50_context_ms"] = p50(ok_ctx) if ok_ctx else None
    out["p50_capture_ms"] = p50(ok_cap) if ok_cap else None
    out["n_ok_capture"] = len(ok_cap)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    print(json.dumps({k: out[k] for k in ("p50_context_ms", "p50_capture_ms", "n_ok_capture")}, ensure_ascii=False))
    for c in out["captures"]:
        print("capture", c["ms"], "ms", "ok" if c["ok"] else c["err"])


if __name__ == "__main__":
    main()
