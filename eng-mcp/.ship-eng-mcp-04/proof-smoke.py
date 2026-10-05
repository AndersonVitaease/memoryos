#!/usr/bin/env python3
"""SHIP-ENG-MCP-04 — provas de smoke em produção via MCP eng-mcp (:8787).

Uso: python3 proof-smoke.py <catalog|tier1|tier2|tier3>
Cada modo faz UMA chamada JSON-RPC e asserta o resultado; exit 0 = prova OK.
O token nunca é impresso (lido de /root/.claude.json, só usado no header).
"""
import json
import subprocess
import sys

URL = "http://127.0.0.1:8787/mcp"

def call(tool, args):
    token = json.load(open("/root/.claude.json"))["mcpServers"]["memoryos-engmcp"]["headers"]["Authorization"]
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                          "params": {"name": tool, "arguments": args}})
    out = subprocess.run(
        ["curl", "-s", "-m", "120", "-X", "POST", URL,
         "-H", "Content-Type: application/json",
         "-H", "Accept: application/json, text/event-stream",
         "-H", f"Authorization: {token}", "-d", payload],
        capture_output=True, text=True, timeout=150)
    data = None
    for line in out.stdout.splitlines():
        if line.startswith("data: "):
            data = json.loads(line[6:])
    if data is None:
        print(f"[FAIL] sem resposta SSE de {tool}: {out.stdout[:200]} {out.stderr[:200]}")
        sys.exit(1)
    body = data["result"]["content"][0]["text"]
    return json.loads(body)

mode = sys.argv[1] if len(sys.argv) > 1 else ""

if mode == "catalog":
    b = call("engineering.mcp.catalog", {})
    names = [t.get("name") for t in (b.get("tools") or b.get("capabilities") or [])]
    count = b.get("toolCount", len(names))
    ok = count == 150 and "engineering.shell.run" in names
    print(f"toolCount={count} catalogVersion={b.get('catalogVersion')} shellRun={'engineering.shell.run' in names}")
    sys.exit(0 if ok else 1)

if mode == "tier1":
    b = call("engineering.shell.run", {"command": "git status --short"})
    ok = b.get("tier") == 1 and b.get("status") == "executed" and b.get("rule") == "git_read_or_stage" and b.get("exitCode") == 0
    print(json.dumps({k: b.get(k) for k in ("tier", "status", "rule", "exitCode")}))
    sys.exit(0 if ok else 1)

if mode == "tier2":
    b = call("engineering.shell.run", {"command": "whoami"})
    judge = b.get("judge") or {}
    ok = b.get("tier") == 2 and b.get("status") in ("executed", "refused") and isinstance(judge.get("safeScore"), (int, float))
    print(json.dumps({"tier": b.get("tier"), "status": b.get("status"), "code": b.get("code"), "safeScore": judge.get("safeScore")}))
    sys.exit(0 if ok else 1)

if mode == "tier3":
    b = call("engineering.shell.run", {"command": "systemctl restart nginx"})
    ok = b.get("tier") == 3 and b.get("status") == "blocked" and b.get("code") == "SHELL_RUN_BLOCKED" and b.get("exitCode") is None
    print(json.dumps({k: b.get(k) for k in ("tier", "status", "code", "rule", "exitCode")}))
    sys.exit(0 if ok else 1)

print(f"[FAIL] modo desconhecido: {mode}")
sys.exit(1)
