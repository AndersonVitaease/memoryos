// Dummy StaticScanEngine for the anti-rework contract (MCP-IMPORT-GATE-01
// contract 2): a SARIF-emitting engine added as ONE config entry — zero change
// in the gate code. It flags every file named server.js with one low finding.
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
const root = process.argv[2];
const results = [];
const walk = (dir) => { for (const entry of readdirSync(dir)) { const full = join(dir, entry); if (statSync(full).isDirectory()) walk(full); else if (entry === "server.js") results.push({ ruleId: "DUMMY-001", level: "note", message: { text: "dummy engine saw a server entry file" }, locations: [{ physicalLocation: { artifactLocation: { uri: relative(root, full) }, region: { startLine: 1 } } }] }); } };
walk(root);
process.stdout.write(JSON.stringify({ version: "2.1.0", runs: [{ tool: { driver: { name: "dummy-sarif", rules: [{ id: "DUMMY-001", name: "dummy-entry-file", properties: { category: "supply-chain", severity: "low", tags: ["MCP04"] } }] } }, properties: { lockRef: "dummy-lock-v1" }, results }] }));
