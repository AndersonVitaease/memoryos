#!/bin/bash
# Helper SHIP-CGROUPS-01: chama tool do MCP eng-mcp (:8787) via JSON-RPC.
# uso: mcp-call.sh <toolName> <jsonArgs>
TOKEN=$(python3 -c "import json;print(json.load(open('/root/.claude.json'))['mcpServers']['memoryos-engmcp']['headers']['Authorization'])")
TOOL="$1"; ARGS="${2:-{}}"
curl -s -m 60 -X POST http://127.0.0.1:8787/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: $TOKEN" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$TOOL\",\"arguments\":$ARGS}}" \
  | sed -n 's/^data: //p'
