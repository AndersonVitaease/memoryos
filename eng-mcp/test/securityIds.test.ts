// IDS-01: tests for engineering.security.ids (src/securityIds.ts). The judge
// provider is always injected (JudgeDeps) — no test reaches the network, the
// real credential file or the real /data/audit trails: every scan reads a
// per-test tmpdir wired through the ENG_MCP_IDS_* env (resolved at call time).
// Synthetic token hashes are runtime-built sha256 digests, never literals.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  IDS_ADVISORY,
  IDS_FAIL_SAFE_PHASE_2,
  IDS_TRAILS,
  runSecurityIds,
  securityIdsInputSchema,
  type SecurityIdsDeps,
  type SecurityIdsResult
} from "../src/securityIds.ts";
import { JUDGE_MODEL, type JudgeDeps, type JudgeHttpResponse } from "../src/judge.ts";
import { EngineeringError } from "../src/policy.ts";

// Judge audit lines from the injected provider still land in a temp file — the
// real /data/audit/judge.jsonl is never touched from tests.
process.env.ENG_MCP_JUDGE_AUDIT_FILE = join(tmpdir(), "judge-audit-ids-test-" + process.pid + ".jsonl");

const NOW = new Date("2026-09-21T12:00:00.000Z");
const NOW_MS = NOW.getTime();
const HOUR = 3_600_000;
const IN_WINDOW = new Date(NOW_MS - 2 * HOUR).toISOString(); // inside a 24h window
const BEFORE_WINDOW = new Date(NOW_MS - 48 * HOUR).toISOString(); // outside it
const EXPIRES = "2027-01-01T00:00:00.000Z";

const sha256hex = (text: string): string => createHash("sha256").update(text).digest("hex");
const hash16 = (text: string): string => sha256hex(text).slice(0, 16);

function token(subject: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    subject,
    tokenHash: sha256hex("bearer-" + subject),
    scopes: ["engineering:judge:read"],
    allowedRepositoryIds: ["memoryos"],
    expiresAt: EXPIRES,
    ...extra
  };
}

function testEnv(): string {
  const dir = mkdtempSync(join(tmpdir(), "ids-01-"));
  process.env.ENG_MCP_IDS_AUDIT_DIR = dir;
  process.env.ENG_MCP_IDS_REGISTRY_FILE = join(dir, "tokens.json");
  process.env.ENG_MCP_IDS_AUDIT_FILE = join(dir, "ids.jsonl");
  return dir;
}

function writeRegistry(dir: string, tokens: unknown[]): void {
  writeFileSync(join(dir, "tokens.json"), JSON.stringify({ tokens }), "utf8");
}

function writeTrail(dir: string, trail: string, lines: unknown[]): void {
  writeFileSync(
    join(dir, trail + ".jsonl"),
    lines.map((line) => (typeof line === "string" ? line : JSON.stringify(line))).join("\n") + (lines.length > 0 ? "\n" : ""),
    "utf8"
  );
}

type CapturedInit = { method: string; headers: Record<string, string>; body: string; signal: AbortSignal; redirect: "error" };
type CapturedCall = { url: string; init: CapturedInit };

function judgeResponse(payload: unknown, status = 200): JudgeHttpResponse {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(payload) };
}

function noulAnswer(p: number): Record<string, unknown> {
  return { type: "noul", noul: p };
}

function severityAnswer(choice: string): Record<string, unknown> {
  return { type: "choice", choice, probabilities: { info: 0.8, warn: 0.15, critical: 0.05 }, confidence: 0.9 };
}

function idsPayload(overrides: { pNormal?: number; pGrowth?: number; pStale?: number; severity?: string } = {}): Record<string, unknown> {
  return {
    model: JUDGE_MODEL + "-ids-test",
    id: "gen-ids-test",
    provider: "TypeSafe",
    usage: { input_tokens: 400, output_tokens: 80, cost: 0.00001 },
    answers: {
      q_normal: noulAnswer(overrides.pNormal ?? 1),
      q_growth: noulAnswer(overrides.pGrowth ?? 1),
      q_stale: noulAnswer(overrides.pStale ?? 0),
      q_severity: severityAnswer(overrides.severity ?? "info")
    }
  };
}

// Runtime-built synthetic credential (same shape contract proven in test/judge.test.ts).
const RAW_KEY = "sk-or-v1-" + "b".repeat(64);
const VALID_CREDENTIAL = "sk-or-" + JSON.stringify(RAW_KEY);

function makeJudge(options: { payloads?: Record<string, unknown>[]; fail?: boolean } = {}): { deps: JudgeDeps; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  const payloads = options.payloads && options.payloads.length > 0 ? options.payloads : [idsPayload()];
  const fetchImpl = async (url: string, init: CapturedInit): Promise<JudgeHttpResponse> => {
    calls.push({ url, init });
    if (options.fail) throw new Error("provider down");
    const payload = payloads[Math.min(calls.length - 1, payloads.length - 1)];
    return judgeResponse(payload);
  };
  const readCredential = (path: string): string => {
    if (path.length === 0) throw new Error("ENOENT: " + path);
    return VALID_CREDENTIAL;
  };
  const deps: JudgeDeps = { fetchImpl, readCredential };
  return { deps, calls };
}

function idsDeps(nowMs: number, judge: JudgeDeps): SecurityIdsDeps {
  return { now: () => new Date(nowMs), judgeDeps: judge };
}

function trailReport(result: SecurityIdsResult, name: string) {
  return result.trails.find((trail) => trail.name === name)!;
}

function signalOf(result: SecurityIdsResult, subject: string, prefix: string): string | undefined {
  return result.findings.find((finding) => finding.subject === subject)?.signals.find((signal) => signal.startsWith(prefix));
}

test("input schema: strict bounds on windowHours/trails/extra keys", () => {
  assert.equal(securityIdsInputSchema.safeParse({}).success, true);
  assert.equal(securityIdsInputSchema.safeParse({ windowHours: 24, trails: ["judge"] }).success, true);
  assert.equal(securityIdsInputSchema.safeParse({ windowHours: 720, trails: [...IDS_TRAILS] }).success, true);
  assert.equal(securityIdsInputSchema.safeParse({ windowHours: 0 }).success, false);
  assert.equal(securityIdsInputSchema.safeParse({ windowHours: 721 }).success, false);
  assert.equal(securityIdsInputSchema.safeParse({ windowHours: 24.5 }).success, false);
  assert.equal(securityIdsInputSchema.safeParse({ trails: ["not-a-trail"] }).success, false);
  assert.equal(securityIdsInputSchema.safeParse({ extra: true }).success, false);
});

test("legacy detector: bare release-runner + dated substitute + legacy hash16 used in window (the 97e485f7 scenario)", async () => {
  const dir = testEnv();
  const legacyHash = hash16("legacy-bearer");
  writeRegistry(dir, [
    token("release-runner", { tokenHash: sha256hex("legacy-bearer") }),
    token("release-runner-2026-09-19"),
    token("operator-2026-09-17"),
    token("operator-2026-09-17b")
  ]);
  writeTrail(dir, "judge", [
    { ts: IN_WINDOW, tool: "engineering.judge.verify", n_claims: 2, verdict: "ALL_SUPPORTED", model: JUDGE_MODEL + "-x", latency_ms: 100, authorizerHash16: legacyHash, contentHash16: "0".repeat(16), usage: null }
  ]);
  const result = await runSecurityIds({ windowHours: 24 }, idsDeps(NOW_MS, makeJudge().deps));

  assert.equal(result.status, "SCANNED");
  assert.equal(result.tool, "engineering.security.ids");
  assert.equal(result.registry.entries, 4);
  assert.equal(result.registry.activeEntries, 4);
  assert.equal(result.registry.error, null);
  assert.equal(result.subjectsFlagged, 2);
  assert.equal(result.judgeCalls, 2);
  assert.equal(result.judgeCostUsd, 0.00002);
  assert.equal(result.failOpen, false);

  // the operator pair keeps distinct bases (the trailing b defeats the date strip) and stays quiet
  assert.ok(result.quiet.includes("operator-2026-09-17"));
  assert.ok(result.quiet.includes("operator-2026-09-17b"));

  const legacy = result.findings.find((finding) => finding.subject === "release-runner");
  assert.ok(legacy, "the legacy subject must be flagged");
  assert.equal(legacy.hash16, legacyHash);
  const coexisting = legacy.signals.find((signal) => signal.startsWith("legacy_entries_coexisting:"));
  assert.ok(coexisting, "coexistence signal must fire");
  assert.ok(coexisting.includes('base "release-runner" has 2 entries'));
  assert.ok(coexisting.includes('legacy candidate "release-runner" (ACTIVE) coexists with 1 substitute(s)'));
  assert.ok(coexisting.includes("the 97e485f7 detector"));
  assert.equal(
    signalOf(result, "release-runner", "legacy_identity_in_use:"),
    "legacy_identity_in_use: 1 in-window event(s) attributed to the legacy hash16"
  );
  assert.equal(legacy.features.legacyActiveUse, 1);
  assert.ok(legacy.features.legacyCluster.some((member) => member.subject === "release-runner" && member.role === "legacy"));
  assert.ok(legacy.features.legacyCluster.some((member) => member.subject === "release-runner-2026-09-19" && member.role === "substitute"));

  const substitute = result.findings.find((finding) => finding.subject === "release-runner-2026-09-19");
  assert.ok(substitute, "the substitute subject also sees the cluster");
  assert.ok(substitute.signals.some((signal) => signal.startsWith("legacy_entries_coexisting:")));
  assert.equal(substitute.features.legacyActiveUse, 0, "the substitute identity itself was not used");
});

test("window filter: out-of-window lines count as linesRead but never become events; malformed lines are skipped", async () => {
  const dir = testEnv();
  writeRegistry(dir, [token("fetcher")]);
  writeTrail(dir, "git-fetch", [
    { ts: IN_WINDOW, subject: "fetcher", result: "fetched" },
    { ts: BEFORE_WINDOW, subject: "fetcher", result: "fetched" },
    "not-json", // parses as a JSON string, not an object -> skipped
    { noTs: true } // object without a parseable ts -> never an event
  ]);
  writeTrail(dir, "git-push", [{ ts: BEFORE_WINDOW, subject: "fetcher", result: "pushed" }]);
  const result = await runSecurityIds({ windowHours: 24 }, idsDeps(NOW_MS, makeJudge().deps));

  const fetch = trailReport(result, "git-fetch");
  assert.equal(fetch.requested, true);
  assert.equal(fetch.linesRead, 3);
  assert.equal(fetch.skipped, 1);
  assert.equal(fetch.eventsInWindow, 1);
  assert.equal(fetch.fileFound, true);
  assert.equal(trailReport(result, "git-push").eventsInWindow, 0);
  assert.equal(trailReport(result, "git-push").fileFound, true);
  assert.equal(result.eventsScanned, 1);
  assert.equal(result.registry.entries, 1);
  assert.equal(result.subjectsFlagged, 0, "an all-quiet window never reaches the judge");
  assert.equal(result.judgeCalls, 0);
  assert.deepEqual(result.findings, []);
  assert.ok(result.quiet.includes("fetcher"));
});

test("trails subset: unrequested trails report zeros even with files on disk", async () => {
  const dir = testEnv();
  writeRegistry(dir, [token("judge-caller")]);
  writeTrail(dir, "git-fetch", [{ ts: IN_WINDOW, subject: "judge-caller", result: "failed", code: "FETCH_REMOTE_MISSING" }]);
  writeTrail(dir, "judge", [{ ts: IN_WINDOW, tool: "engineering.judge.evaluate", verdict: "ERROR:JUDGE_TIMEOUT", authorizerHash16: hash16("bearer-judge-caller") }]);
  const result = await runSecurityIds({ windowHours: 24, trails: ["judge"] }, idsDeps(NOW_MS, makeJudge().deps));

  assert.equal(result.trails.length, 6);
  assert.equal(result.trails.filter((trail) => trail.requested).length, 1);
  const fetch = trailReport(result, "git-fetch");
  assert.deepEqual(
    { requested: fetch.requested, linesRead: fetch.linesRead, eventsInWindow: fetch.eventsInWindow, skipped: fetch.skipped, fileFound: fetch.fileFound },
    { requested: false, linesRead: 0, eventsInWindow: 0, skipped: 0, fileFound: false }
  );
  assert.equal(trailReport(result, "judge").eventsInWindow, 1);
  const finding = result.findings.find((entry) => entry.subject === "judge-caller");
  assert.ok(finding, "the judge trail alone drives the flag");
  assert.equal(signalOf(result, "judge-caller", "failures_in_window:"), "failures_in_window: 1 [judge:ERROR:JUDGE_TIMEOUT]");
});

test("first-time use: fires with history depth 5; the cold-start guard skips below it", async () => {
  const dir = testEnv();
  writeRegistry(dir, [token("bob"), token("carol")]);
  const baseline: Record<string, unknown>[] = [];
  // bob's baseline: UTC hours 12, 11, 10, 9, 8 on 2026-09-19 — hour 10 matches the in-window merge hour
  for (const backHours of [72, 73, 74, 75, 76]) baseline.push({ ts: new Date(NOW_MS - backHours * HOUR).toISOString(), subject: "bob", result: "fetched" });
  baseline.push({ ts: BEFORE_WINDOW, subject: "carol", result: "fetched" });
  baseline.push({ ts: new Date(NOW_MS - 47 * HOUR).toISOString(), subject: "carol", result: "fetched" });
  writeTrail(dir, "git-fetch", baseline);
  writeTrail(dir, "git-merge", [{ ts: IN_WINDOW, subject: "bob", layer: "auto", status: "NOTHING_TO_MERGE" }]);
  writeTrail(dir, "git-push", [{ ts: IN_WINDOW, subject: "carol", result: "failed", code: "PUSH_NON_FAST_FORWARD_BLOCKED" }]);
  const result = await runSecurityIds({ windowHours: 24 }, idsDeps(NOW_MS, makeJudge().deps));

  const bob = result.findings.find((finding) => finding.subject === "bob");
  assert.ok(bob, "bob must be flagged by the first-time signal");
  assert.equal(signalOf(result, "bob", "first_time_use:"), "first_time_use: git-merge:merge:auto");
  assert.equal(bob.features.historyDepth, 5);
  assert.equal(bob.features.firstTimeGuardSkipped, false);
  assert.equal(bob.features.offHoursGuardSkipped, false, "the merge hour is part of the baseline hours");
  assert.equal(signalOf(result, "bob", "off_hours_use:"), undefined);

  const carol = result.findings.find((finding) => finding.subject === "carol");
  assert.ok(carol, "carol is flagged by the failed push, not by first-time use");
  assert.equal(signalOf(result, "carol", "first_time_use:"), undefined, "cold-start guard suppresses the first-time signal");
  assert.equal(carol.features.firstTimeGuardSkipped, true);
  assert.deepEqual(carol.features.firstTimeActions, []);
  assert.equal(carol.features.offHoursGuardSkipped, true);
  assert.equal(signalOf(result, "carol", "failures_in_window:"), "failures_in_window: 1 [git-push:failed:PUSH_NON_FAST_FORWARD_BLOCKED]");
});

test("off-hours: an in-window UTC hour never seen in the baseline fires the signal (guard satisfied)", async () => {
  const dir = testEnv();
  writeRegistry(dir, [token("dora")]);
  writeTrail(dir, "git-fetch", [
    { ts: new Date(Date.UTC(2026, 8, 19, 12)).toISOString(), subject: "dora", result: "fetched" },
    { ts: new Date(Date.UTC(2026, 8, 19, 11)).toISOString(), subject: "dora", result: "fetched" },
    { ts: new Date(Date.UTC(2026, 8, 19, 10)).toISOString(), subject: "dora", result: "fetched" },
    { ts: new Date(Date.UTC(2026, 8, 19, 9)).toISOString(), subject: "dora", result: "fetched" },
    { ts: new Date(Date.UTC(2026, 8, 19, 8)).toISOString(), subject: "dora", result: "fetched" },
    { ts: new Date(Date.UTC(2026, 8, 21, 3)).toISOString(), subject: "dora", result: "fetched" }
  ]);
  const result = await runSecurityIds({ windowHours: 24 }, idsDeps(NOW_MS, makeJudge().deps));

  const dora = result.findings.find((finding) => finding.subject === "dora");
  assert.ok(dora, "dora must be flagged by the off-hours signal");
  assert.equal(
    signalOf(result, "dora", "off_hours_use:"),
    "off_hours_use: 1 event(s) at previously unused UTC hour(s) [2026-09-21T03:00:00.000Z|utc-hour-3]"
  );
  assert.equal(dora.features.offHoursEvents, 1);
  assert.equal(dora.features.offHoursGuardSkipped, false);
  assert.equal(signalOf(result, "dora", "first_time_use:"), undefined, "the action itself is historical");
});

test("grants: in-window grants counted with scopes and results; mutual ring detected; no self-loop for grant authorizers", async () => {
  const dir = testEnv();
  writeRegistry(dir, [token("worker-a"), token("operator-x")]);
  writeTrail(dir, "registry-grant", [
    { ts: IN_WINDOW, result: "granted", targetSubject: "worker-a", authorizerSubject: "operator-x", authorizerHash16: hash16("bearer-operator-x"), scopes: ["engineering:git:fetch"] },
    { ts: IN_WINDOW, result: "granted", targetSubject: "operator-x", authorizerSubject: "worker-a", authorizerHash16: hash16("bearer-worker-a"), scopes: ["engineering:git:push"] },
    { ts: BEFORE_WINDOW, result: "granted", targetSubject: "worker-a", authorizerSubject: "operator-x", scopes: ["engineering:git:fetch"] }
  ]);
  const result = await runSecurityIds({ windowHours: 24 }, idsDeps(NOW_MS, makeJudge().deps));

  const worker = result.findings.find((finding) => finding.subject === "worker-a");
  assert.ok(worker, "worker-a must be flagged by grants + mutual");
  assert.equal(
    signalOf(result, "worker-a", "scope_grant_in_window:"),
    'scope_grant_in_window: 2 grant line(s) [engineering:git:fetch, engineering:git:push], results {"granted":2}'
  );
  assert.equal(signalOf(result, "worker-a", "mutual_grants:"), "mutual_grants: worker-a<->operator-x");
  assert.equal(worker.features.grantsInWindow, 2);
  assert.equal(worker.features.grantsEverBeforeWindow, 1);
  assert.deepEqual(worker.features.scopesGrantedInWindow, ["engineering:git:fetch", "engineering:git:push"]);

  const operator = result.findings.find((finding) => finding.subject === "operator-x");
  assert.ok(operator);
  assert.equal(operator.features.grantsInWindow, 2);
  assert.equal(operator.features.grantsEverBeforeWindow, 1, "operator-x authorized the before-window grant to worker-a");
  assert.equal(signalOf(result, "operator-x", "mutual_grants:"), "mutual_grants: operator-x<->worker-a");
  assert.ok(!operator.features.mutualGrants.includes("operator-x<->operator-x"), "authorizing a grant must never self-loop as mutual");
  assert.ok(!worker.features.mutualGrants.includes("worker-a<->worker-a"));
  assert.equal(result.judgeCalls, 2);
});

test("bands: the severityScore formula drives info/warn/critical deterministically in code", async () => {
  const base = (): void => {
    const dir = testEnv();
    writeRegistry(dir, [token("band-subject")]);
    writeTrail(dir, "git-fetch", [{ ts: IN_WINDOW, subject: "band-subject", result: "failed", code: "PUSH_HEAD_MISMATCH" }]);
  };

  // info: 0.4*(1-1) + 0.3*(1-1) + 0.3*0 = 0
  base();
  const infoJudge = makeJudge({ payloads: [idsPayload({ severity: "info" })] });
  const info = await runSecurityIds({ windowHours: 24 }, idsDeps(NOW_MS, infoJudge.deps));
  const infoFinding = info.findings[0];
  assert.equal(infoFinding.severity, "info");
  assert.equal(infoFinding.severityScore, 0);
  assert.equal(infoFinding.judgeSeverity, "info");
  assert.deepEqual(infoFinding.probabilities, { q_normal: 1, q_growth: 1, q_stale: 0 });
  assert.ok(infoFinding.reasons.includes("severity_score_0.000_band_info"));
  assert.equal(infoFinding.reasons[0], "failures_in_window: 1 [git-fetch:failed:PUSH_HEAD_MISMATCH]");
  // closed-state contract on the wire: 3 noul questions without criteria + the severity choice
  assert.equal(infoJudge.calls.length, 1);
  const body = JSON.parse(infoJudge.calls[0].init.body) as { model: string; questions: Record<string, { type: string; criteria?: Record<string, string> }> };
  assert.equal(body.model, JUDGE_MODEL);
  assert.equal(Object.keys(body.questions).length, 4);
  assert.equal(body.questions.q_normal.type, "noul");
  assert.equal(body.questions.q_normal.criteria, undefined);
  assert.equal(body.questions.q_growth.type, "noul");
  assert.equal(body.questions.q_stale.type, "noul");
  assert.equal(body.questions.q_severity.type, "choice");
  assert.deepEqual(Object.keys(body.questions.q_severity.criteria!), ["info", "warn", "critical"]);

  // warn: 0.4*0.6 + 0.3*0.6 + 0.3*0.6 = 0.6 -> exactly at the warn band edge
  base();
  const warn = await runSecurityIds({ windowHours: 24 }, idsDeps(NOW_MS, makeJudge({ payloads: [idsPayload({ pNormal: 0.4, pGrowth: 0.4, pStale: 0.6, severity: "warn" })] }).deps));
  assert.equal(warn.findings[0].severity, "warn");
  assert.equal(warn.findings[0].severityScore, 0.6);
  assert.equal(warn.findings[0].judgeSeverity, "warn");
  assert.ok(warn.findings[0].reasons.includes("severity_score_0.600_band_warn"));

  // critical: 0.4 + 0.3 + 0.3 = 1
  base();
  const critical = await runSecurityIds({ windowHours: 24 }, idsDeps(NOW_MS, makeJudge({ payloads: [idsPayload({ pNormal: 0, pGrowth: 0, pStale: 1, severity: "critical" })] }).deps));
  assert.equal(critical.findings[0].severity, "critical");
  assert.equal(critical.findings[0].severityScore, 1);
  assert.equal(critical.findings[0].judgeSeverity, "critical");
  assert.ok(critical.findings[0].reasons.includes("severity_score_1.000_band_critical"));
});

test("fail-open: a dead judge degrades to verdict unavailable with raw features, zero crash, audit still written", async () => {
  const dir = testEnv();
  writeRegistry(dir, [token("solo")]);
  writeTrail(dir, "git-fetch", [{ ts: IN_WINDOW, subject: "solo", result: "failed", code: "PUSH_HEAD_MISMATCH" }]);
  const result = await runSecurityIds({ windowHours: 24 }, idsDeps(NOW_MS, makeJudge({ fail: true }).deps));

  assert.equal(result.status, "SCANNED");
  assert.equal(result.failOpen, true);
  assert.equal(result.judgeCalls, 0);
  assert.equal(result.audit, "written");
  const finding = result.findings[0];
  assert.equal(finding.verdict, "unavailable");
  assert.equal(finding.severity, "unavailable");
  assert.equal(finding.severityScore, null);
  assert.equal(finding.judgeSeverity, null);
  assert.equal(finding.probabilities, null);
  assert.equal(finding.reasons[0], "failures_in_window: 1 [git-fetch:failed:PUSH_HEAD_MISMATCH]");
  assert.ok(finding.reasons[1].startsWith("judge_unavailable: JudgeError: JUDGE_UNREACHABLE:provider down"));
  assert.equal(finding.features.subject, "solo");
  assert.equal(finding.features.failuresInWindow, 1, "raw features stay attached");
});

test("cost cap: judged subjects capped at 8/scan; the overflow keeps verdict unjudged_cost_cap", async () => {
  const dir = testEnv();
  const subjects = Array.from({ length: 9 }, (_, index) => `subject-${index}`);
  writeRegistry(dir, subjects.map((subject) => token(subject)));
  writeTrail(dir, "git-fetch", subjects.map((subject) => ({ ts: IN_WINDOW, subject, result: "failed", code: "PUSH_HEAD_MISMATCH" })));
  const result = await runSecurityIds({ windowHours: 24 }, idsDeps(NOW_MS, makeJudge({ payloads: subjects.map(() => idsPayload()) }).deps));

  assert.equal(result.subjectsFlagged, 9);
  assert.equal(result.judgeCalls, 8);
  const overflow = result.findings.find((finding) => finding.subject === "subject-8");
  assert.ok(overflow);
  assert.equal(overflow.verdict, "unjudged_cost_cap");
  assert.equal(overflow.severity, "unjudged_cost_cap");
  assert.ok(overflow.reasons.includes("unjudged_cost_cap: judged-subject cap reached; features attached for the operator"));
  assert.equal(overflow.features.failuresInWindow, 1);
  assert.ok(result.capNote.includes("capped at 8/scan"));
  assert.ok(result.capNote.includes("one scan per hour"));
});

test("periodic gates: one scan per hour and $0.01/day of judge spend; on-demand scans are never gated", async () => {
  const dir = testEnv();
  writeRegistry(dir, [token("solo")]);
  writeTrail(dir, "git-fetch", [{ ts: IN_WINDOW, subject: "solo", result: "fetched" }]);

  const onDemand = await runSecurityIds({ windowHours: 24 }, idsDeps(NOW_MS, makeJudge().deps));
  assert.equal(onDemand.periodic, false);

  await runSecurityIds({ windowHours: 24, periodic: true }, idsDeps(NOW_MS, makeJudge().deps));
  await assert.rejects(
    () => runSecurityIds({ windowHours: 24, periodic: true }, idsDeps(NOW_MS, makeJudge().deps)),
    (error: unknown) => {
      assert.ok(error instanceof EngineeringError);
      assert.equal((error as EngineeringError).code, "IDS_PERIODIC_RATE_LIMITED");
      return true;
    }
  );

  // a fresh scan site whose prior periodic line already spent above the daily cap
  const dir2 = testEnv();
  writeRegistry(dir2, [token("solo")]);
  writeTrail(dir2, "git-fetch", [{ ts: IN_WINDOW, subject: "solo", result: "fetched" }]);
  writeFileSync(
    join(dir2, "ids.jsonl"),
    JSON.stringify({ ts: new Date(NOW_MS - 2 * HOUR).toISOString(), engine: "ids-01", tool: "engineering.security.ids", windowHours: 24, findings: [], costUsd: 0.02, periodic: true }) + "\n",
    "utf8"
  );
  await assert.rejects(
    () => runSecurityIds({ windowHours: 24, periodic: true }, idsDeps(NOW_MS, makeJudge().deps)),
    (error: unknown) => {
      assert.ok(error instanceof EngineeringError);
      assert.equal((error as EngineeringError).code, "IDS_PERIODIC_COST_CAP_REACHED");
      return true;
    }
  );
});

test("own audit + calibration: first scan is firstSeen, the re-scan is reFlagged", async () => {
  const dir = testEnv();
  writeRegistry(dir, [token("solo"), token("silent")]);
  writeTrail(dir, "git-fetch", [{ ts: IN_WINDOW, subject: "solo", result: "failed", code: "PUSH_HEAD_MISMATCH" }]);

  const result1 = await runSecurityIds({ windowHours: 24 }, idsDeps(NOW_MS, makeJudge().deps));
  assert.equal(result1.audit, "written");
  assert.deepEqual(result1.window, { hours: 24, startIso: "2026-09-20T12:00:00.000Z", endIso: "2026-09-21T12:00:00.000Z" });
  const lines1 = readFileSync(join(dir, "ids.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
  assert.equal(lines1.length, 1);
  const line1 = lines1[0];
  assert.equal(line1.engine, "ids-01");
  assert.equal(line1.tool, "engineering.security.ids");
  assert.equal(line1.windowHours, 24);
  assert.equal(line1.eventsScanned, 1);
  assert.equal(line1.registryEntries, 2);
  assert.equal(line1.flagged, 1);
  assert.equal(line1.quiet, 1);
  assert.equal(line1.judgeCalls, 1);
  assert.equal(line1.failOpen, false);
  assert.equal(line1.periodic, false);
  assert.equal(line1.callerSubject, null);
  assert.equal(line1.callerHash16, null);
  assert.deepEqual(line1.trails, [...IDS_TRAILS]);
  assert.deepEqual(line1.calibration, { reFlagged: 0, resolved: 0, firstSeen: 1, reFlaggedDetail: [] });
  const finding1 = (line1.findings as Record<string, unknown>[])[0];
  assert.equal(finding1.subject, "solo");
  assert.equal(finding1.verdict, "judged");
  assert.equal(finding1.severity, "info");
  assert.match(String(finding1.findingId), /^[a-f0-9]{16}$/);
  assert.equal(result1.findings[0].hash16, hash16("bearer-solo"), "hash16 join against the registry");

  // re-scan one second later: same subject re-flagged; window shifted so the findingId changes
  const result2 = await runSecurityIds({ windowHours: 24 }, idsDeps(NOW_MS + 1000, makeJudge().deps));
  assert.equal(result2.audit, "written");
  assert.deepEqual(result2.calibration, { reFlagged: 1, resolved: 0, firstSeen: 0, reFlaggedDetail: ["solo:info->info"] });
  assert.notEqual(result2.findings[0].findingId, String(finding1.findingId));
});

test("audit failure is fail-open: the scan still returns SCANNED with the full result", async () => {
  const dir = testEnv();
  writeRegistry(dir, [token("solo")]);
  writeTrail(dir, "git-fetch", [{ ts: IN_WINDOW, subject: "solo", result: "failed", code: "PUSH_HEAD_MISMATCH" }]);
  process.env.ENG_MCP_IDS_AUDIT_FILE = dir; // a DIRECTORY — the append must fail
  const result = await runSecurityIds({ windowHours: 24 }, idsDeps(NOW_MS, makeJudge().deps));
  assert.equal(result.status, "SCANNED");
  assert.ok(result.audit.startsWith("failed:"));
  assert.equal(result.findings[0].verdict, "judged");
  assert.equal(result.findings[0].severity, "info");
});

test("hash join: judge lines resolve subjects through the registry; unknown hashes become unmatched:* findings", async () => {
  const dir = testEnv();
  writeRegistry(dir, [token("known")]);
  writeTrail(dir, "judge", [
    { ts: IN_WINDOW, tool: "engineering.judge.verify", verdict: "ALL_SUPPORTED", authorizerHash16: hash16("bearer-known") },
    { ts: IN_WINDOW, tool: "engineering.judge.verify", verdict: "ERROR:JUDGE_TIMEOUT", authorizerHash16: "deadbeef00000000" }
  ]);
  const result = await runSecurityIds({ windowHours: 24 }, idsDeps(NOW_MS, makeJudge().deps));

  assert.ok(result.quiet.includes("known"), "a healthy judged call from a known subject stays quiet");
  const unmatched = result.findings.find((finding) => finding.subject === "unmatched:deadbeef00000000");
  assert.ok(unmatched, "an unknown hash16 becomes an unmatched:* finding");
  assert.equal(signalOf(result, "unmatched:deadbeef00000000", "failures_in_window:"), "failures_in_window: 1 [judge:ERROR:JUDGE_TIMEOUT]");
  assert.equal(unmatched.hash16, null);
  assert.equal(result.judgeCalls, 1);
});

test("advisory contract: advice-only constants attached to every scan; quiet scans never call the judge", async () => {
  const dir = testEnv();
  writeRegistry(dir, [token("solo")]);
  writeTrail(dir, "git-fetch", [{ ts: IN_WINDOW, subject: "solo", result: "fetched" }]);
  const result = await runSecurityIds({ windowHours: 24 }, idsDeps(NOW_MS, makeJudge().deps));

  assert.equal(result.advisory, IDS_ADVISORY);
  assert.ok(IDS_ADVISORY.includes("never revokes"));
  assert.deepEqual(result.failSafe, IDS_FAIL_SAFE_PHASE_2);
  assert.equal(IDS_FAIL_SAFE_PHASE_2.status, "DESIGN_ONLY_NOT_IMPLEMENTED");
  assert.deepEqual([...IDS_FAIL_SAFE_PHASE_2.actions], ["registry-entry-pendingReview", "pipeline-hold-before-deploy", "session-freeze"]);
  assert.ok(IDS_FAIL_SAFE_PHASE_2.note.includes("definitive cancellation is operator-only"));
  assert.equal(result.findings.length, 0);
  assert.equal(result.judgeCalls, 0);
  assert.equal(result.subjectsQuiet, 1);
});
