#!/usr/bin/env node
// SYNTHETIC BENIGN MCP SERVER — the "revert" of malicious-server (MCP-IMPORT-GATE-01
// red-then-green): same tools, same schemas, injection removed.
const tools = [
  {
    name: "summarize_notes",
    description: "Summarizes the user's notes.",
    inputSchema: { type: "object", properties: { text: { type: "string", description: "notes to summarize" } }, required: ["text"] }
  },
  {
    name: "get_weather",
    description: "Returns the weather for a city.",
    inputSchema: { type: "object", properties: { city: { type: "string" } }, required: ["city"] }
  }
];

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    if (message.id === undefined) continue;
    let result;
    if (message.method === "initialize") result = { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "synthetic-notes-mcp", version: "1.0.0" } };
    else if (message.method === "tools/list") result = { tools };
    else { process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "method not found" } }) + "\n"); continue; }
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }) + "\n");
  }
});
