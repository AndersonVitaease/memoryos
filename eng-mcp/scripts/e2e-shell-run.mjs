// WORKER-SHELL-PROPRIA-01 — E2E over the REAL router (no dep injection):
// (1) tier-1 allowlist runs a real node --test suite; (2) tier-3 systemctl is
// typed blocked; (3) the audit log carries both events. Run with:
//   node --import tsx scripts/e2e-shell-run.mjs
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { runShellRun, SHELL_RUN_AUDIT_FILE_DEFAULT } from "../src/shellRun.ts";

// E2E 1 — tier 1: real suite, zero LLM (executes directly).
const suite = await runShellRun({ command: "node --import tsx --test test/shellRun.test.ts", timeoutMs: 120_000 });
console.log(`E2E1 tier=${suite.tier} status=${suite.status} exit=${suite.exitCode} rule=${suite.rule} duration=${suite.durationMs}ms`);
assert.equal(suite.status, "executed");
assert.equal(suite.tier, 1);
assert.equal(suite.exitCode, 0);
assert.match(suite.stdout, /pass 17/);

// E2E 2 — tier 3: operator consequence, typed blocked, never executed.
const blocked = await runShellRun({ command: "systemctl restart nginx" });
console.log(`E2E2 tier=${blocked.tier} status=${blocked.status} code=${blocked.code} rule=${blocked.rule}`);
assert.equal(blocked.status, "blocked");
assert.equal(blocked.tier, 3);
assert.equal(blocked.code, "SHELL_RUN_BLOCKED");
assert.equal(blocked.exitCode, null);

// E2E 3 — audit log carries both events (with the real default audit file).
const before = statSync(SHELL_RUN_AUDIT_FILE_DEFAULT).size;
const lines = readFileSync(SHELL_RUN_AUDIT_FILE_DEFAULT, "utf8").trim().split("\n").map((line) => JSON.parse(line));
const suiteEvent = lines.find((e) => e.command === "node --import tsx --test test/shellRun.test.ts" && e.status === "executed" && e.tier === 1);
const blockedEvent = lines.find((e) => e.command === "systemctl restart nginx" && e.status === "blocked" && e.tier === 3);
console.log(`E2E3 audit=${SHELL_RUN_AUDIT_FILE_DEFAULT} bytes=${before} lines=${lines.length}`);
assert.ok(suiteEvent, "audit must carry the tier-1 executed event");
assert.ok(blockedEvent, "audit must carry the tier-3 blocked event");
console.log("E2E OK");