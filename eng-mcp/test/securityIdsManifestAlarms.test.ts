// AUTO-RUN-01B/C (C3): tests for the manifest-path gate alarms in
// engineering.security.ids (computeManifestAlarms). Deterministic, judge-free,
// ALARM-only: every scan reads a per-test tmpdir wired through
// ENG_MCP_IDS_AUDIT_DIR; the real /data/audit trails are never touched.
import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  IDS_ALARM_SAMPLE_CAP,
  IDS_ALARMS_ADVISORY,
  computeManifestAlarms,
  runSecurityIds,
  type IdsAlarm,
  type SecurityIdsResult
} from "../src/securityIds.ts";
import type { JudgeDeps } from "../src/judge.ts";

const NOW_MS = Date.parse("2026-09-25T12:00:00.000Z");
const HOUR = 3_600_000;
const IN_WINDOW = new Date(NOW_MS - 2 * HOUR).toISOString();
const BEFORE_WINDOW = new Date(NOW_MS - 48 * HOUR).toISOString();

// Judge stub: alarms never call the judge, and the synthetic trails below hold
// no flagged subjects — the injected provider exists only to keep the scan
// off the network if a subject were ever flagged.
const unusedJudgeDeps: JudgeDeps = {
  fetchImpl: async () => {
    throw new Error("judge must not be called from alarm paths");
  },
  readCredential: () => "sk-or-v1-test"
};

function alarmDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ids-alarm-"));
  process.env.ENG_MCP_IDS_AUDIT_DIR = dir;
  process.env.ENG_MCP_IDS_AUDIT_FILE = join(dir, "ids.jsonl");
  return dir;
}

function auditFile(name: string): string {
  return join(process.env.ENG_MCP_IDS_AUDIT_DIR!, name);
}

function writeLine(file: string, line: unknown): void {
  appendFileSync(file, JSON.stringify(line) + "\n", "utf8");
}

function gateRoute(at: string, route: "allow" | "hold", pattern = "p1"): string {
  writeLine(join(process.env.ENG_MCP_IDS_AUDIT_DIR!, "gate-routes.jsonl"), {
    at,
    type: "command_result",
    key: `judge_gate:band2:${pattern}`,
    status: "ok",
    value: JSON.stringify({ route, safeScore: 0.95 }),
    source: "JUDGE_GATE"
  });
  return at;
}

const GATE_VERDICT = "q_destructive:0.03|q_outward_facing:0.03|q_touches_credentials:0.09|q_large_blast_radius:0.08";

function judgeEvaluate(at: string, verdict: string): void {
  writeLine(join(process.env.ENG_MCP_IDS_AUDIT_DIR!, "judge.jsonl"), {
    ts: at,
    tool: "engineering.judge.evaluate",
    n_claims: 4,
    verdict,
    authorizerHash16: "a".repeat(16),
    contentHash16: "b".repeat(16)
  });
}

function manifestMatch(at: string, mission: string, patternId: string, expiresAt: string, useTs = false): void {
  const line: Record<string, unknown> = {
    tool: "judge-hook",
    event: "match",
    manifest: mission,
    patternId,
    hash16: "c".repeat(16),
    expiresAt,
    commandSha16: "d".repeat(16),
    session: "sess-123"
  };
  if (useTs) line.ts = at;
  else line.at = at;
  writeLine(join(process.env.ENG_MCP_IDS_AUDIT_DIR!, "manifests.jsonl"), line);
}

function manifestCreate(at: string, mission: string, operationIds: string[]): void {
  writeLine(join(process.env.ENG_MCP_IDS_AUDIT_DIR!, "manifests.jsonl"), {
    ts: at,
    tool: "engineering.mission.preauth",
    event: "create",
    mission,
    hash16: "e".repeat(16),
    operationIds,
    expiresAt: new Date(NOW_MS + 24 * HOUR).toISOString()
  });
}

function scan(): { alarms: IdsAlarm[]; total: number; note: string | null } {
  return computeManifestAlarms(NOW_MS - 24 * HOUR, NOW_MS);
}

test("advisory: alarms are declared sensor-only (report, never block)", () => {
  assert.match(IDS_ALARMS_ADVISORY, /ALARM ONLY/);
  assert.match(IDS_ALARMS_ADVISORY, /never block/);
});

test("R1 zero gate-shaped evaluates + band2 allow route -> GATE_ROUTE_WITHOUT_JUDGE_AUDIT", () => {
  alarmDir();
  const at = gateRoute(IN_WINDOW, "allow");
  const out = scan();
  assert.equal(out.total, 1);
  assert.equal(out.alarms[0].code, "GATE_ROUTE_WITHOUT_JUDGE_AUDIT");
  assert.equal(out.alarms[0].at, at);
  assert.match(out.alarms[0].detail, /1 band-2 route/);
  assert.match(out.alarms[0].detail, /0 gate-shaped evaluate/);
  assert.equal(out.note, null);
});

test("R1 band2 route=hold (out-of-scope triage) with zero evaluates -> NO alarm", () => {
  alarmDir();
  gateRoute(IN_WINDOW, "hold");
  const out = scan();
  assert.equal(out.total, 0);
  assert.deepEqual(out.alarms, []);
});

test("R1 allow count exceeding gate-shaped evaluates (partial audit) -> alarm", () => {
  alarmDir();
  gateRoute(IN_WINDOW, "allow", "p1");
  gateRoute(IN_WINDOW, "allow", "p2");
  gateRoute(IN_WINDOW, "allow", "p3");
  judgeEvaluate(IN_WINDOW, GATE_VERDICT);
  const out = scan();
  assert.equal(out.total, 1);
  assert.match(out.alarms[0].detail, /3 band-2 route/);
  assert.match(out.alarms[0].detail, /1 gate-shaped evaluate/);
});

test("R1 one allow route + one gate-shaped evaluate -> NO alarm (paridade)", () => {
  alarmDir();
  gateRoute(IN_WINDOW, "allow");
  judgeEvaluate(IN_WINDOW, GATE_VERDICT);
  const out = scan();
  assert.equal(out.total, 0);
});

test("R1 ERROR-shaped judge lines (no q_destructive) do NOT count as gate triage", () => {
  alarmDir();
  gateRoute(IN_WINDOW, "allow");
  judgeEvaluate(IN_WINDOW, "ERROR:JUDGE_INPUT_INVALID");
  const out = scan();
  assert.equal(out.total, 1);
});

test("R1 band2 allow outside the window -> NO alarm", () => {
  alarmDir();
  gateRoute(BEFORE_WINDOW, "allow");
  const out = scan();
  assert.equal(out.total, 0);
});

test("R2 match with expired TTL -> MANIFEST_WINDOW_EXPIRED", () => {
  alarmDir();
  manifestMatch(IN_WINDOW, "m-exp", "op-1", new Date(NOW_MS - 3 * HOUR).toISOString());
  const out = scan();
  assert.equal(out.total, 1);
  assert.equal(out.alarms[0].code, "MANIFEST_WINDOW_EXPIRED");
  assert.match(out.alarms[0].detail, /already expired/);
  assert.match(out.alarms[0].detail, /m-exp/);
});

test("R2 match with live TTL -> NO alarm", () => {
  alarmDir();
  manifestMatch(IN_WINDOW, "m-live", "op-1", new Date(NOW_MS + HOUR).toISOString());
  const out = scan();
  assert.equal(out.total, 0);
});

test("R2 exact-boundary match (expiresAt == at) is an alarm (fail-closed)", () => {
  alarmDir();
  manifestMatch(IN_WINDOW, "m-boundary", "op-1", IN_WINDOW);
  const out = scan();
  assert.equal(out.total, 1);
  assert.equal(out.alarms[0].code, "MANIFEST_WINDOW_EXPIRED");
});

test("R3 patternId outside the approved operationIds -> MANIFEST_OPERATION_DIVERGENT", () => {
  alarmDir();
  manifestCreate(BEFORE_WINDOW, "m-div", ["op1", "op2"]);
  manifestMatch(IN_WINDOW, "m-div", "rogue-op", new Date(NOW_MS + HOUR).toISOString());
  const out = scan();
  assert.equal(out.total, 1);
  assert.equal(out.alarms[0].code, "MANIFEST_OPERATION_DIVERGENT");
  assert.match(out.alarms[0].detail, /rogue-op/);
  assert.match(out.alarms[0].detail, /op1, op2/);
});

test("R3 match line carries mission under `manifest` (hook shape), create under `mission` (server shape)", () => {
  alarmDir();
  manifestCreate(IN_WINDOW, "m-shape", ["approved-1"]);
  manifestMatch(IN_WINDOW, "m-shape", "rogue-op", new Date(NOW_MS + HOUR).toISOString(), true); // ts field
  const out = scan();
  assert.equal(out.total, 1);
  assert.equal(out.alarms[0].code, "MANIFEST_OPERATION_DIVERGENT");
});

test("R3 approved patternId -> NO alarm; mission without create line -> NO alarm", () => {
  alarmDir();
  manifestCreate(IN_WINDOW, "m-ok", ["op1"]);
  manifestMatch(IN_WINDOW, "m-ok", "op1", new Date(NOW_MS + HOUR).toISOString());
  manifestMatch(IN_WINDOW, "m-no-create", "opZ", new Date(NOW_MS + HOUR).toISOString());
  const out = scan();
  assert.equal(out.total, 0);
});

test("corrupt lines and missing trail files are tolerated (fail-open)", () => {
  const dir = alarmDir();
  appendFileSync(join(dir, "gate-routes.jsonl"), "not-json\n", "utf8");
  const out = scan();
  assert.deepEqual(out.alarms, []);
  assert.equal(out.total, 0);
  assert.equal(out.note, null);
});

test("sample cap: 60 alarms -> alarmCount 60 with IDS_ALARM_SAMPLE_CAP items", () => {
  alarmDir();
  for (let i = 0; i < 60; i += 1) {
    manifestMatch(IN_WINDOW, `m-cap-${i}`, "op-x", new Date(NOW_MS - 3 * HOUR).toISOString());
  }
  const out = scan();
  assert.equal(out.total, 60);
  assert.equal(out.alarms.length, IDS_ALARM_SAMPLE_CAP);
});

test("alarmId is deterministic for identical inputs", () => {
  alarmDir();
  manifestMatch(IN_WINDOW, "m-det", "op-y", new Date(NOW_MS - 3 * HOUR).toISOString());
  const a = scan();
  const b = scan();
  assert.equal(a.alarms[0].alarmId, b.alarms[0].alarmId);
  assert.match(a.alarms[0].alarmId, /^[0-9a-f]{16}$/);
});

test("runSecurityIds wires alarms end-to-end (result + out-audit line)", async () => {
  const dir = alarmDir();
  writeFileSync(join(dir, "tokens.json"), JSON.stringify({ tokens: [] }), "utf8");
  manifestMatch(IN_WINDOW, "m-e2e", "op-e2e", new Date(NOW_MS - 3 * HOUR).toISOString());
  const result: SecurityIdsResult = await runSecurityIds({ windowHours: 24 }, { now: () => new Date(NOW_MS), judgeDeps: unusedJudgeDeps });
  assert.equal(result.alarms.length, 1);
  assert.equal(result.alarmCount, 1);
  assert.equal(result.alarms[0].code, "MANIFEST_WINDOW_EXPIRED");
  const outAudit = readFileSync(join(dir, "ids.jsonl"), "utf8").trim().split("\n").at(-1)!;
  const parsed = JSON.parse(outAudit) as Record<string, unknown>;
  assert.equal(parsed.alarmCount, 1);
  assert.equal((parsed.alarms as Record<string, unknown>[])[0].code, "MANIFEST_WINDOW_EXPIRED");
});