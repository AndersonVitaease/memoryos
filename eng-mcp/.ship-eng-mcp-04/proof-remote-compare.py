#!/usr/bin/env python3
"""SHIP-ENG-MCP-04 — prova de sincronia main local vs origin (remote_compare)."""
import json
import sys

HEAD = "9ad21732ae2ea51d78d9f7c6963d6ddf3133f7bb"

raw = sys.stdin.read()
data = None
for line in raw.splitlines():
    if line.startswith("data: "):
        data = json.loads(line[6:])
if data is None:
    # o servidor responde JSON puro (sem SSE) quando a chamada é rápida
    try:
        data = json.loads(raw)
    except Exception:
        print("[FAIL] sem resposta parseável:", raw[:200])
        sys.exit(1)
b = json.loads(data["result"]["content"][0]["text"])
local, remote = b.get("localHead"), b.get("remoteHead")
print(f"localHead={local} remoteHead={remote} {'MATCH' if local == remote == HEAD else 'MISMATCH'}")
sys.exit(0 if local == remote == HEAD else 1)
