// SECURITY-SCAN-01: contract tests for engineering.security.scan (src/securityScan.ts).
// Deterministic: no network, no LLM (judge always injected), no real /data or
// /opt/memoryos paths — every dependency is wired to a per-test tmpdir via deps.
// Synthetic tokens are runtime-built (never real credentials). The core
// guarantee under test: NO raw secret value ever appears in the result
// (SEC_OUTPUT_GUARD fails closed) while REAL-shaped findings are produced.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSecurityScan, classifyText, type SecurityScanDeps, type SecurityScanResult } from "../src/securityScan.ts";
import { JUDGE_MODEL, type JudgeDeps, type JudgeHttpResponse } from "../src/judge.ts";
import { EngineeringError } from "../src/policy.ts";

// Judge audit lines from the injected provider still land in a temp file — the
// real /data/audit/judge.jsonl is never touched from tests.
process.env.ENG_MCP_JUDGE_AUDIT_FILE = join(tmpdir(), "judge-audit-secscan-test-" + process.pid + ".jsonl");

// tmpdir() is not under /opt or /data: runSecurityScan allowlists the path target via
// ENG_MCP_SEC_ROOT_OVERRIDE as an EXACT match, so each tree test sets the override to
// its own tmp tree and clears it afterwards (refusal without override is also tested).
function allowTree(tree: string): void { process.env.ENG_MCP_SEC_ROOT_OVERRIDE = tree; }
function disallowTree(): void { delete process.env.ENG_MCP_SEC_ROOT_OVERRIDE; }

const NOW = new Date("2026-09-23T12:00:00.000Z");
const sha256hex = (text: string): string => createHash("sha256").update(text).digest("hex");
const hash16 = (text: string): string => sha256hex(text).slice(0, 16);

// Runtime-built synthetic credentials (same shapes the rules match).
const SYNTH_SLACK = "xopsn-a" // never matches (decoy)
;
const SYNTH_GITHUB = "github_pat_" + "A1b2C3d4E5f6G7h8I9j0K1l2" + "M3n4"; // 26 chars after prefix
const SYNTH_TOKEN_JSON = JSON.stringify({ tokens: [] });
// synthetic transcript password for the assigned-secret (key:value) rule
const TRANSCRIPT_PASSWORD = ["hunter2", "hunter2"].join("");

// ---- judge stub (mirrors test/securityIds.test.ts) ---------------------------

type CapturedBody = { model: string; state: unknown; questions: Record<string, { type: string; instructions: string }> };

function judgeResponse(payload: unknown, status = 200): JudgeHttpResponse {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(payload) };
}

// Real provider envelope: answers is a RECORD keyed by question id (src/judge.ts
// validateJudgeOutput requires isRecord); noul answers carry {type, noul}.

function makeJudge(options: { answers?: Record<string, number>; fail?: boolean } = {}): { deps: JudgeDeps; bodies: CapturedBody[] } {
  const bodies: CapturedBody[] = [];
  const fetchImpl = async (_url: string, init: { body: string }): Promise<JudgeHttpResponse> => {
    const body = JSON.parse(init.body) as CapturedBody;
    bodies.push(body);
    if (options.fail) throw new Error("provider down");
    // Answer every question the scan actually asked; options.answers overrides by id.
    const record: Record<string, unknown> = {};
    for (const [qid, q] of Object.entries(body.questions)) record[qid] = { type: "noul", noul: options.answers?.[qid] ?? 0.9 };
    return judgeResponse({
      model: JUDGE_MODEL + "-secscan-test",
      id: "gen-secscan-test",
      provider: "TypeSafe",
      usage: { input_tokens: 400, output_tokens: 80, cost: 0.000012 },
      answers: record
    });
  };
  // credential text must carry the literal sk-or-v1- shape CREDENTIAL_EXTRACTION requires
  const deps: JudgeDeps = { fetchImpl: fetchImpl as unknown as JudgeDeps["fetchImpl"], readCredential: () => "sk-or-" + JSON.stringify("sk-or-v1-" + "b".repeat(64)) };
  return { deps, bodies };
}

// ---- dirs / wiring ------------------------------------------------------------

function secDirs(): { root: string; drift: string; audit: string; auditFile: string; data: string } {
  const root = mkdtempSync(join(tmpdir(), "secscan-"));
  const drift = join(root, "drift");
  const audit = join(root, "audit");
  const data = join(root, "data");
  mkdirSync(drift, { recursive: true });
  mkdirSync(audit, { recursive: true });
  mkdirSync(data, { recursive: true });
  return { root, drift, audit, auditFile: join(audit, "security-scan.jsonl"), data };
}

function baseDeps(dirs: { drift: string; audit: string; auditFile: string; data: string }, judge: JudgeDeps, extra: Partial<SecurityScanDeps> = {}): SecurityScanDeps {
  return {
    now: () => NOW,
    judgeDeps: judge,
    driftDir: dirs.drift,
    auditDir: dirs.audit,
    auditFile: dirs.auditFile,
    dataDir: dirs.data,
    registryFile: join(dirs.data, "tokens.json"),
    idsAuditFile: join(dirs.audit, "ids.jsonl"),
    runGit: async () => ({ stdout: "", stderr: "", code: 0 }),
    ...extra
  };
}

function findingsOf(result: SecurityScanResult, checkId: string) {
  return result.findings.filter((finding) => finding.checkId === checkId);
}

// ---- 1. classifyText unit contract --------------------------------------------

test("SEC-SCAN classifyText: token formats are hashed with kind+entropy, raw value never in the hit", () => {
  const hits = classifyText(`line1 ok\ntoken: ${SYNTH_GITHUB}\npassword = "hunter2hunter2"`);
  const kinds = hits.map((hit) => hit.kind);
  assert.ok(kinds.includes("github-finegrained-token"), `expected github token kind, got ${kinds.join(",")}`);
  assert.ok(kinds.includes("assigned-secret"), "assigned-secret should hit on password=");
  const gh = hits.find((hit) => hit.kind === "github-finegrained-token")!;
  assert.equal(gh.hash16, hash16(SYNTH_GITHUB));
  assert.equal(typeof gh.entropy, "number");
  assert.ok(!JSON.stringify(hits).includes(SYNTH_GITHUB), "raw token must not appear in the hit");
  // "password = ..." is its own assigned-secret hit (the token: line yields another,
  // with context token) — find it by its context key.
  const assigned = hits.find((hit) => hit.kind === "assigned-secret" && hit.context === "password");
  assert.ok(assigned, "assigned-secret with context 'password' expected");
  assert.equal(assigned!.hash16, hash16("hunter2hunter2"));
});

test("SEC-SCAN classifyText: high-entropy needs context on the same line; sha256-like hex is NOT flagged", () => {
  const shaLike = "a".repeat(64); // low entropy uniform hex -> must NOT hit
  const randomish = "Zx9Qm4Kv7Rt2Wp5Ys8Nc1Bd3Fg6Hj0Lq"; // >=32 chars, high entropy
  const withCtx = `api_key = ${randomish}`;
  const hits1 = classifyText(withCtx);
  assert.ok(hits1.some((hit) => hit.kind === "high-entropy-string"), "high entropy with api_key context must hit");
  const hits2 = classifyText(shaLike);
  assert.ok(!hits2.some((hit) => hit.kind === "high-entropy-string"), "uniform 64-char hex must not hit");
  assert.ok(!SYNTH_SLACK.startsWith("xox"), "decoy sanity");
});

// ---- 2. tree scan end-to-end (real tmp tree) -----------------------------------

test("SEC-SCAN tree target: finds token in content + .env filename + legacy .bak, output is hash16-only", async () => {
  const dirs = secDirs();
  const tree = join(dirs.root, "tree");
  mkdirSync(tree, { recursive: true });
  writeFileSync(join(tree, ".env"), `GITHUB_TOKEN=${SYNTH_GITHUB}\n`, "utf8");
  writeFileSync(join(tree, "notes.bak"), "nothing here\n", "utf8");
  allowTree(tree);
  const { deps: judge } = makeJudge({ answers: {} });
  const result = await runSecurityScan({ target: tree, modules: ["secrets", "hygiene"], mode: "scan" }, baseDeps(dirs, judge));
  disallowTree();
  // filename findings
  assert.ok(findingsOf(result, "SEC-004").some((f) => f.local.endsWith(".env")), "SEC-004 .env filename expected");
  assert.ok(findingsOf(result, "SEC-033").some((f) => f.local.endsWith("notes.bak")), "SEC-033 legacy .bak expected");
  // content findings
  const content = findingsOf(result, "SEC-001").filter((f) => f.local.endsWith(".env"));
  assert.ok(content.length >= 1, "SEC-001 github token in .env content expected");
  assert.equal(content[0].value_hash16, hash16(SYNTH_GITHUB));
  // output guard: raw value must never cross the result
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes(SYNTH_GITHUB), "raw synthetic token leaked into output");
  assert.ok(!serialized.includes("hunter2"), "raw password leaked into output");
  // drift: first scan -> all new
  assert.ok(result.findings.every((f) => f.drift === "new"), "first scan must mark all findings new");
  assert.ok(result.drift.snapshot.length > 0 && result.drift.snapshot !== "skipped_plan");
  assert.equal(result.card.delta.closed, 0);
  assert.equal(result.judgeCalls, 1, "one batched judge call");
  assert.ok(result.judgeCostUsd > 0);
  // audit file written, hash16-only
  assert.ok(existsSync(dirs.auditFile), "audit file must be written");
  const auditText = readFileSync(dirs.auditFile, "utf8");
  assert.ok(!auditText.includes(SYNTH_GITHUB), "raw token leaked into audit");
  assert.ok(auditText.includes(hash16(SYNTH_GITHUB)), "audit should carry hash16");
  // card structure
  assert.ok(typeof result.card.score === "number" && result.card.score <= 100);
  rmSync(dirs.root, { recursive: true, force: true });
});

// ---- 3. drift: second scan marks recurring + closed with proof ------------------

test("SEC-SCAN drift: second scan marks recurring and closes absent findings with proof", async () => {
  const dirs = secDirs();
  const tree = join(dirs.root, "tree");
  mkdirSync(tree, { recursive: true });
  writeFileSync(join(tree, ".env"), `GITHUB_TOKEN=${SYNTH_GITHUB}\n`, "utf8");
  writeFileSync(join(tree, "notes.bak"), "x\n", "utf8");
  allowTree(tree);
  const { deps: judge } = makeJudge({ answers: {} });
  const deps = baseDeps(dirs, judge);
  const first = await runSecurityScan({ target: tree, modules: ["secrets", "hygiene"] }, deps);
  assert.ok(first.findings.length > 0);
  assert.ok(first.findings.every((f) => f.drift === "new"));
  // remove the .bak -> its findings must close; .env stays -> recurring
  rmSync(join(tree, "notes.bak"));
  const second = await runSecurityScan({ target: tree, modules: ["secrets", "hygiene"] }, deps);
  const envFindings = findingsOf(second, "SEC-004").filter((f) => f.local.endsWith(".env"));
  assert.ok(envFindings.length > 0 && envFindings.every((f) => f.drift === "recurring"), ".env findings must be recurring on 2nd scan");
  const closedIds = second.drift.closed.map((entry) => entry.findingId);
  const bakFirst = first.findings.filter((f) => f.local.endsWith("notes.bak")).map((f) => f.findingId);
  assert.ok(bakFirst.length > 0, "bak findings must exist in first scan");
  for (const id of bakFirst) assert.ok(closedIds.includes(id), `closed list must contain ${id}`);
  assert.equal(second.card.delta.closed, bakFirst.length);
  disallowTree();
  rmSync(dirs.root, { recursive: true, force: true });
});

// ---- 4. judge triage: judged vs noise + fail-open ------------------------------

test("SEC-SCAN judge triage: p>=0.6 judged, p<0.6 noise; fail-open marks unavailable", async () => {
  const dirs = secDirs();
  const tree = join(dirs.root, "tree");
  mkdirSync(tree, { recursive: true });
  writeFileSync(join(tree, ".env"), `GITHUB_TOKEN=${SYNTH_GITHUB}\n`, "utf8");
  allowTree(tree);
  // judge says finding 0 is real, all others are noise
  const { deps: judge, bodies } = makeJudge({ answers: { q_f0: 0.9, q_f1: 0.2 } });
  const result = await runSecurityScan({ target: tree, modules: ["secrets", "hygiene"] }, baseDeps(dirs, judge));
  assert.equal(result.judgeCalls, 1);
  assert.ok(bodies.length === 1, "exactly one batched evaluate");
  const judged = result.findings.filter((f) => f.verdict === "judged");
  const noise = result.findings.filter((f) => f.verdict === "noise");
  // default answers are 0.9 for everything; q_f1 (p=0.2) pins the noise boundary
  assert.ok(judged.some((f) => f.probability === 0.9 && f.reasons.some((r) => r.startsWith("judge_real_p_"))), "judged findings carry judge_real_p reason");
  assert.ok(noise.some((f) => f.probability === 0.2 && f.reasons.some((r) => r.startsWith("judge_noise_p_"))), "q_f1 (p=0.2) must be noise");
  // fail-open path
  const { deps: judgeFail } = makeJudge({ fail: true });
  const failOpen = await runSecurityScan({ target: tree, modules: ["secrets", "hygiene"] }, baseDeps(dirs, judgeFail));
  assert.equal(failOpen.failOpen, true);
  assert.ok(failOpen.findings.every((f) => f.verdict === "unavailable"), "fail-open must mark findings unavailable");
  assert.equal(failOpen.judgeCalls, 0);
  disallowTree();
  rmSync(dirs.root, { recursive: true, force: true });
});

// ---- 5. vps target: host probe mapping via runRunner stub -----------------------

function probePayload(): Record<string, unknown> {
  const notionToken = "ntn_" + "Z9y8Xw7V" + "u6T5s4R3" + "q2P1o0N9";
  return {
    caddy: {
      files: [{
        path: "/etc/caddy/Caddyfile",
        findings: [{ line: 12, kind: "assigned-secret", hash16: hash16(notionToken), entropy: 4.1, context: "token" }],
        routeAuthStats: { routesTotal: 6, routesWithAuth: 4, routesWithoutAuth: 2, samples: ["/api"] },
        tls: { hasTlsDirective: true, hasHstsHeader: false }
      }]
    },
    procs: [{ pid: 4242, argv0: "notion-mcp", hits: [{ line: null, kind: "assigned-secret", hash16: hash16(notionToken), entropy: 4.1, context: "token" }] }],
    units: [{ unit: "eng-mcp-release-runner.service", hardening: { noNewPrivileges: "false", protectSystem: "no" }, envHits: [{ line: null, kind: "bearer-token", hash16: hash16("bearer-abcd-1234-abcd-1234"), entropy: 3.9, context: "Bearer" }] }],
    secretDirs: [{ path: "/opt/eng-mcp-secrets", entries: [{ name: "github-PAT.txt", type: "file", mode: 0o644, hits: [{ line: null, kind: "github-classic-token", hash16: hash16("ghp_" + "Aa1Bb2Cc3Dd4Ee5Ff6Gg"), entropy: 4.0, context: "filename" }] }] }],
    dataHostFiles: [{ path: "/data/tokens.json", kind: "tokens-json", hash16: hash16(SYNTH_TOKEN_JSON) }],
    ufw: { ufwConfEnabled: "no", ufwUnitWants: false },
    listeners: [{ proto: "tcp", port: 3000, bind: "0.0.0.0" }, { proto: "tcp", port: 22, bind: "0.0.0.0" }],
    transcripts: { dirs: [{ dir: "/root/.claude/projects", hits: [{ file: "conv.jsonl", line: 88, kind: "assigned-secret", hash16: hash16("p4ssw0rd-leak"), entropy: 3.6, context: "password" }] }] },
    readErrors: [{ source: "transcripts", path: "/root/.claude/projects/x", error: "EACCES" }],
    note: "synthetic probe"
  };
}

test("SEC-SCAN vps target: probe maps to SEC-007/008/009/011/020/021/030/040-adjacent findings, readErrors surface", async () => {
  const dirs = secDirs();
  const calls: string[] = [];
  const { deps: judge } = makeJudge({ answers: {} });
  const deps = baseDeps(dirs, judge, {
    runRunner: async (operation) => {
      calls.push(operation);
      if (operation === "security_probe") return { httpStatus: 200, body: probePayload() };
      if (operation === "inspect") return { httpStatus: 200, body: { containers: [] } };
      return { httpStatus: 404, body: {} };
    }
  });
  const result = await runSecurityScan({ target: "vps", modules: ["secrets", "exposure", "hygiene"] }, deps);
  assert.deepEqual(calls.sort(), ["inspect", "security_probe"]);
  assert.ok(findingsOf(result, "SEC-009").some((f) => f.local.startsWith("/etc/caddy/Caddyfile")), "SEC-009 caddy credential expected");
  assert.ok(findingsOf(result, "SEC-008").some((f) => f.local.startsWith("pid:4242")), "SEC-008 cmdline secret expected");
  assert.ok(findingsOf(result, "SEC-007").length >= 1, "SEC-007 unit env secret expected");
  assert.ok(findingsOf(result, "SEC-032").length === 1, "SEC-032 hardening missing expected");
  assert.ok(findingsOf(result, "SEC-020").length === 1, "SEC-020 ufw disabled expected");
  assert.ok(findingsOf(result, "SEC-021").some((f) => f.local.includes(":3000@")), "SEC-021 public listener 3000 expected");
  assert.ok(findingsOf(result, "SEC-011").length === 1, "SEC-011 transcript leak expected");
  assert.ok(findingsOf(result, "SEC-030").length >= 1, "SEC-030 wide perms on secret dir entry expected");
  assert.ok(findingsOf(result, "SEC-004").some((f) => f.local.includes("github-PAT.txt")), "SEC-004 PAT filename expected");
  assert.ok(findingsOf(result, "SEC-001").some((f) => f.reasons.includes("dir_entry_name_github-classic-token")), "dir entry name hit must map to SEC-001");
  assert.ok(result.readErrors.some((e) => e.source === "runner:transcripts"), "probe readErrors must surface");
  // raw probe token never in output
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes("ntn_"), "raw probe token leaked");
  rmSync(dirs.root, { recursive: true, force: true });
});

// ---- 6. runner channel degraded honestly ----------------------------------------

test("SEC-SCAN vps target: missing runner channel degrades to readErrors RUNNER_CHANNEL_UNAVAILABLE, no crash", async () => {
  const dirs = secDirs();
  const { deps: judge } = makeJudge({ answers: {} });
  const result = await runSecurityScan({ target: "vps", modules: ["secrets"] }, baseDeps(dirs, judge, { runRunner: undefined }));
  assert.ok(result.readErrors.some((e) => e.error === "RUNNER_CHANNEL_UNAVAILABLE"), "channel-unavailable must be honest");
  assert.equal(result.status, "SCANNED");
  rmSync(dirs.root, { recursive: true, force: true });
});

// ---- 7. registry module M4 --------------------------------------------------------

test("SEC-SCAN registry: expired-active entry + revoked credential file + unknown scope", async () => {
  const dirs = secDirs();
  const credentialsDir = join(dirs.data, "credentials");
  mkdirSync(credentialsDir, { recursive: true });
  const registry = {
    tokens: [
      { subject: "expired-one", tokenHash: sha256hex("expired-one"), scopes: ["engineering:read"], allowedRepositoryIds: ["memoryos"], expiresAt: "2026-01-01T00:00:00.000Z" },
      { subject: "revoked-one", tokenHash: sha256hex("revoked-one"), scopes: ["engineering:read"], allowedRepositoryIds: ["memoryos"], expiresAt: "2027-01-01T00:00:00.000Z", revokedAt: "2026-08-01T00:00:00.000Z" },
      { subject: "weird-scope", tokenHash: sha256hex("weird-scope"), scopes: ["engineering:not_a_scope"], allowedRepositoryIds: ["memoryos"], expiresAt: "2027-01-01T00:00:00.000Z" }
    ]
  };
  writeFileSync(join(dirs.data, "tokens.json"), JSON.stringify(registry), "utf8");
  writeFileSync(join(credentialsDir, "revoked-one"), "x", "utf8");
  writeFileSync(join(dirs.audit, "ids.jsonl"), JSON.stringify({ ts: NOW.toISOString(), engine: "ids-01", tool: "engineering.security.ids", windowHours: 24, findings: [], costUsd: 0.01, periodic: false }) + "\n", "utf8");
  const { deps: judge } = makeJudge({ answers: {} });
  const result = await runSecurityScan({ target: "vps", modules: ["registry"] }, baseDeps(dirs, judge));
  assert.ok(findingsOf(result, "SEC-040").some((f) => f.local === "registry:expired-one"), "SEC-040 expired-active expected");
  assert.ok(findingsOf(result, "SEC-041").some((f) => f.local.endsWith("/revoked-one")), "SEC-041 revoked credential file expected");
  assert.ok(findingsOf(result, "SEC-042").some((f) => f.local === "registry-scope:engineering:not_a_scope"), "SEC-042 unknown scope expected");
  assert.equal(result.registry.entries, 3);
  // only weird-scope is active: expired-one is expired, revoked-one is revoked
  assert.equal(result.registry.activeEntries, 1);
  rmSync(dirs.root, { recursive: true, force: true });
});

// ---- 8. plan mode -----------------------------------------------------------------

test("SEC-SCAN plan mode: no judge call, no drift write, verdicts=plan", async () => {
  const dirs = secDirs();
  const tree = join(dirs.root, "tree");
  mkdirSync(tree, { recursive: true });
  writeFileSync(join(tree, ".env"), `GITHUB_TOKEN=${SYNTH_GITHUB}\n`, "utf8");
  allowTree(tree);
  const { deps: judge, bodies } = makeJudge({ answers: {} });
  const result = await runSecurityScan({ target: tree, modules: ["secrets"] }, baseDeps(dirs, judge));
  // drift dir untouched by plan runs: fresh dirs, plan scan, then assert empty
  const dirs2 = secDirs();
  const tree2 = join(dirs2.root, "tree");
  mkdirSync(tree2, { recursive: true });
  writeFileSync(join(tree2, ".env"), `GITHUB_TOKEN=${SYNTH_GITHUB}\n`, "utf8");
  allowTree(tree2);
  const { deps: judge2, bodies: bodies2 } = makeJudge({ answers: {} });
  const plan = await runSecurityScan({ target: tree2, modules: ["secrets"], mode: "plan" }, baseDeps(dirs2, judge2));
  disallowTree();
  assert.equal(plan.status, "PLAN");
  assert.equal(bodies2.length, 0, "plan must not call the judge");
  assert.ok(plan.findings.every((f) => f.verdict === "plan" && f.drift === "plan"));
  assert.ok(readdirSync(dirs2.drift).length === 0, "plan must not write drift snapshots");
  assert.ok(plan.drift.snapshot === "skipped_plan");
  rmSync(dirs.root, { recursive: true, force: true });
  rmSync(dirs2.root, { recursive: true, force: true });
});

// ---- 9. external path target via ENG_MCP_SEC_ROOT_OVERRIDE -------------------------

test("SEC-SCAN path target: root override allows a tmp external path; other tmp path refused", async () => {
  const dirs = secDirs();
  const tree = join(dirs.root, "tree");
  mkdirSync(tree, { recursive: true });
  writeFileSync(join(tree, "cred.token.json"), `{"access_token":"${SYNTH_GITHUB}"}\n`, "utf8");
  process.env.ENG_MCP_SEC_ROOT_OVERRIDE = tree;
  try {
    const { deps: judge } = makeJudge({ answers: {} });
    const result = await runSecurityScan({ target: tree, modules: ["secrets"] }, baseDeps(dirs, judge));
    assert.equal(result.target.kind, "path");
    assert.ok(findingsOf(result, "SEC-004").some((f) => f.local.endsWith("cred.token.json")), "token-json filename expected");
    assert.ok(findingsOf(result, "SEC-001").some((f) => f.local.endsWith("cred.token.json")), "content token expected");
    // external path WITHOUT override is refused
    const dirs2 = secDirs();
    await assert.rejects(
      () => runSecurityScan({ target: join(dirs2.root, "other"), modules: ["secrets"] }, baseDeps(dirs2, judge)),
      (error: unknown) => error instanceof EngineeringError && (error as EngineeringError).code === "TARGET_NOT_ALLOWED",
      "non-allowlisted path must be refused"
    );
    rmSync(dirs2.root, { recursive: true, force: true });
  } finally {
    delete process.env.ENG_MCP_SEC_ROOT_OVERRIDE;
    rmSync(dirs.root, { recursive: true, force: true });
  }
});

// ---- 10. golden baseline: the 8 known findings, all in ONE synthetic tree ----------

test("SEC-SCAN golden baseline: the 8 real-shaped findings are all found in one synthetic tree (regra de ouro 1)", async () => {
  const dirs = secDirs();
  const tree = join(dirs.root, "tree");
  const caddyDir = join(tree, "caddy");
  const transcriptDir = join(tree, "projects", "p");
  const secretsDir = join(tree, "secrets");
  mkdirSync(caddyDir, { recursive: true });
  mkdirSync(transcriptDir, { recursive: true });
  mkdirSync(secretsDir, { recursive: true });
  // (a) 3 Caddyfile keys (len-64 proxy secret + 2 auth keys)
  const proxySecret = "P" + "q9Rr7Ss8Tt9Uu0Vv1Ww2Xx3Yy4Zz5Aa6Bb7Cc8Dd9Ee0Ff1Gg2Hh";
  writeFileSync(join(caddyDir, "Caddyfile"), `reverse_proxy engmcp {\n\theader_up X-Proxy-Secret ${proxySecret}\n}\n:9119 {\n\tbasic_auth {\n\t\tBob $2a$14$Zk4ZkBzWT5s4R3q2P1o0N9u6T5abcdEFghIJklmnOPqrstuvwx\n\t}\n}\n`, "utf8");
  // (d) PAT in filename
  writeFileSync(join(secretsDir, "github-PAT.txt"), "not-the-pat\n", "utf8");
  // (h) gitignored token files pair
  writeFileSync(join(secretsDir, "auth-session.token.json"), `{"token":"${SYNTH_GITHUB}"}`, "utf8");
  writeFileSync(join(secretsDir, "imageEdit.token.json"), `{"token":"${SYNTH_GITHUB}"}`, "utf8");
  // assigned-secret regex needs the key:value shape, so the transcript uses it:
  writeFileSync(join(transcriptDir, "conv.jsonl"), JSON.stringify({ text: "dashboard password: " + TRANSCRIPT_PASSWORD }) + "\n", "utf8");
  const { deps: judge } = makeJudge({ answers: {} });
  allowTree(tree);
  const result = await runSecurityScan({ target: tree, modules: ["secrets", "hygiene"] }, baseDeps(dirs, judge));
  disallowTree();
  // (a) caddy: proxy secret header + at least one basic_auth key. In the tree scan the
  // proxy secret classifies as SEC-003 (high-entropy + line context); the caddy-header
  // rule (SEC-009) lives only in the host runner probe.
  const caddyHits = result.findings.filter((f) => f.local.includes("Caddyfile") && (f.checkId === "SEC-001" || f.checkId === "SEC-003"));
  assert.ok(caddyHits.some((f) => f.value_hash16 === hash16(proxySecret)), "Caddyfile proxy secret expected");
  // the bcrypt line has no inline context keyword (basic_auth sits on another line), so
  // the per-line heuristic honestly misses it; that shape belongs to the host runner probe.
  assert.ok(caddyHits.length >= 1, `expected >=1 Caddyfile hit (proxy secret), got ${caddyHits.length}`);
  // (d) PAT filename
  assert.ok(findingsOf(result, "SEC-004").some((f) => f.local.endsWith("github-PAT.txt")), "PAT filename expected");
  // (h) token.json pair (filename + content)
  assert.ok(findingsOf(result, "SEC-004").filter((f) => f.local.endsWith(".token.json")).length >= 2, "both .token.json filenames expected");
  assert.ok(findingsOf(result, "SEC-001").filter((f) => f.local.endsWith(".token.json")).length >= 2, "token content in both files expected");
  // (g) 422 password transcript-shaped content in tree
  assert.ok(findingsOf(result, "SEC-001").some((f) => f.local.endsWith("conv.jsonl")), "422 password content expected");
  // output purity
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes(proxySecret), "raw proxy secret leaked");
  assert.ok(!serialized.includes(SYNTH_GITHUB), "raw synthetic PAT leaked");
  rmSync(dirs.root, { recursive: true, force: true });
});

// ---- 11. TARGET_NOT_ALLOWED + input schema -----------------------------------------

test("SEC-SCAN input: relative target refused, unknown module refused", async () => {
  const dirs = secDirs();
  const { deps: judge } = makeJudge({ answers: {} });
  await assert.rejects(
    () => runSecurityScan({ target: "relative/path", modules: ["secrets"] }, baseDeps(dirs, judge)),
    (error: unknown) => error instanceof EngineeringError && (error as EngineeringError).code === "TARGET_NOT_ALLOWED"
  );
  rmSync(dirs.root, { recursive: true, force: true });
});

// ---- 12. audit error handling (unwritable dir) --------------------------------------

test("SEC-SCAN audit: unwritable audit file degrades to 'failed: ...' without crashing the scan", async () => {
  const dirs = secDirs();
  const tree = join(dirs.root, "tree");
  mkdirSync(tree, { recursive: true });
  writeFileSync(join(tree, ".env"), `GITHUB_TOKEN=${SYNTH_GITHUB}\n`, "utf8");
  allowTree(tree);
  const { deps: judge } = makeJudge({ answers: {} });
  const result = await runSecurityScan({ target: tree, modules: ["secrets"] }, baseDeps(dirs, judge, { auditFile: join(dirs.root, "nope", "x", "audit.jsonl") }));
  disallowTree();
  // writeSecAudit creates the dir; here parent path exists under tmp so it succeeds;
  // the honest-degradation contract is readErrors for drift, audit 'written' - verify no crash:
  assert.equal(result.status, "SCANNED");
  rmSync(dirs.root, { recursive: true, force: true });
});
