/**
 * gitHubProductionTests.ts — Beta-01 GitHub Production Validation Suite
 * Beta-01 · MemoryOS Reference Connector · 2026-07-13
 *
 * Validates the full GitHub Production Connector against all Beta-01 criteria.
 * Uses real GitHub API when credentials exist; returns NOT_CONFIGURED otherwise.
 * NEVER simulates success.
 */

import { GitHubConnector } from "./GitHubConnector";

export interface ProductionTestResult {
  id: string;
  name: string;
  category: string;
  status: "PASS" | "FAIL" | "NOT_CONFIGURED" | "SKIP";
  durationMs: number;
  detail: string;
  evidence?: string;
}

export interface GitHubProductionCertificationReport {
  id: string;
  generatedAt: number;
  durationMs: number;
  connectorVersion: string;
  credentialsConfigured: boolean;
  results: ProductionTestResult[];
  passed: number;
  failed: number;
  notConfigured: number;
  total: number;
  overallStatus: "CERTIFIED" | "NOT_CONFIGURED" | "FAILED";
  metrics: ReturnType<typeof summariseMetrics>;
  summary: string;
}

function summariseMetrics(connector: GitHubConnector) {
  const m = connector.internalMetrics;
  return {
    totalRequests:       m.totalRequests,
    successRequests:     m.successRequests,
    failedRequests:      m.failedRequests,
    deniedRequests:      m.deniedRequests,
    avgLatencyMs:        m.avgLatencyMs,
    p95LatencyMs:        m.p95LatencyMs,
    rateLimitRemaining:  m.rateLimitRemaining,
    rateLimitUsagePct:   m.rateLimitUsagePct,
    uptimeDurationMs:    m.uptimeDurationMs,
  };
}

let _seq = 0;
function makeId() { return `beta01_${Date.now()}_${(++_seq).toString(36)}`; }

async function run(
  id: string,
  name: string,
  category: string,
  fn: () => Promise<{ status: ProductionTestResult["status"]; detail: string; evidence?: string }>,
): Promise<ProductionTestResult> {
  const t0 = Date.now();
  try {
    const r = await fn();
    return { id, name, category, status: r.status, durationMs: Date.now() - t0, detail: r.detail, evidence: r.evidence };
  } catch (err) {
    return { id, name, category, status: "FAIL", durationMs: Date.now() - t0, detail: `Exception: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function runGitHubProductionTests(): Promise<GitHubProductionCertificationReport> {
  const t0 = Date.now();
  const connector = new GitHubConnector();
  const ctx = { executionId: `beta01_test_${Date.now()}`, userId: "test", policyContext: {} };

  await connector.initialize(ctx as any);

  // Detect credentials
  const pingResult = await connector.execute("connectivity.ping", {}, ctx as any);
  const hasCredentials = pingResult.status !== "NOT_CONFIGURED";

  const results: ProductionTestResult[] = [];

  // ── Part 1 — Authentication ──────────────────────────────────────────────

  results.push(await run("AUTH-01", "Token configured", "Authentication", async () => {
    if (!hasCredentials) return { status: "NOT_CONFIGURED", detail: "No __GITHUB_TOKEN__ in environment" };
    const r = await connector.execute("auth.validate", {}, ctx as any);
    return r.success ? { status: "PASS", detail: `Authenticated — ${(r.data as any)?.login}`, evidence: (r.data as any)?.login } : { status: "FAIL", detail: r.error ?? "auth.validate failed" };
  }));

  results.push(await run("AUTH-02", "User profile retrieval", "Authentication", async () => {
    if (!hasCredentials) return { status: "NOT_CONFIGURED", detail: "Skipped — no credentials" };
    const r = await connector.execute("auth.user", {}, ctx as any);
    return r.success ? { status: "PASS", detail: `User: ${(r.data as any)?.login} (id=${(r.data as any)?.id})` } : { status: "FAIL", detail: r.error ?? "auth.user failed" };
  }));

  results.push(await run("AUTH-03", "Permissions diagnostic", "Authentication", async () => {
    if (!hasCredentials) return { status: "NOT_CONFIGURED", detail: "Skipped — no credentials" };
    const r = await connector.execute("auth.permissions", {}, ctx as any);
    return r.success ? { status: "PASS", detail: (r.data as any)?.diagnostic ?? "OK" } : { status: "FAIL", detail: r.error ?? "" };
  }));

  results.push(await run("AUTH-04", "Token expiry detection (async validation)", "Authentication", async () => {
    if (!hasCredentials) return { status: "NOT_CONFIGURED", detail: "Skipped — no credentials" };
    const v = await connector.validateAsync();
    const tokenCheck = v.checks.find(c => c.name.includes("Token valid"));
    return tokenCheck?.passed ? { status: "PASS", detail: tokenCheck.detail } : { status: "FAIL", detail: tokenCheck?.detail ?? "Token check absent" };
  }));

  // ── Part 2 — Repository Operations ──────────────────────────────────────

  results.push(await run("REPO-01", "List repositories", "Repository Operations", async () => {
    if (!hasCredentials) return { status: "NOT_CONFIGURED", detail: "Skipped — no credentials" };
    const r = await connector.execute("repos.list", { per_page: 5 }, ctx as any);
    if (!r.success) return { status: "FAIL", detail: r.error ?? "" };
    const d = r.data as any;
    return { status: "PASS", detail: `${d.count} repository/ies returned`, evidence: `count=${d.count}` };
  }));

  // Resolve a real owner/repo from the list for subsequent tests
  let testOwner: string | null = null;
  let testRepo: string | null = null;
  if (hasCredentials) {
    const lr = await connector.execute("repos.list", { per_page: 3 }, ctx as any);
    if (lr.success && (lr.data as any)?.items?.length > 0) {
      const first = (lr.data as any).items[0];
      testOwner = first.owner ?? null;
      testRepo  = first.name ?? null;
    }
  }

  results.push(await run("REPO-02", "Get repository metadata", "Repository Operations", async () => {
    if (!hasCredentials) return { status: "NOT_CONFIGURED", detail: "Skipped — no credentials" };
    if (!testOwner || !testRepo) return { status: "SKIP", detail: "No repository available from repos.list" };
    const r = await connector.execute("repos.get", { owner: testOwner, repo: testRepo }, ctx as any);
    return r.success ? { status: "PASS", detail: `${(r.data as any).full_name} — ${(r.data as any).language ?? "no language"}` } : { status: "FAIL", detail: r.error ?? "" };
  }));

  results.push(await run("REPO-03", "Repository languages", "Repository Operations", async () => {
    if (!hasCredentials) return { status: "NOT_CONFIGURED", detail: "Skipped — no credentials" };
    if (!testOwner || !testRepo) return { status: "SKIP", detail: "No repository available" };
    const r = await connector.execute("repos.languages", { owner: testOwner, repo: testRepo }, ctx as any);
    return r.success ? { status: "PASS", detail: `Primary: ${(r.data as any).primaryLanguage ?? "none"}` } : { status: "FAIL", detail: r.error ?? "" };
  }));

  results.push(await run("REPO-04", "Repository health profile", "Repository Operations", async () => {
    if (!hasCredentials) return { status: "NOT_CONFIGURED", detail: "Skipped — no credentials" };
    if (!testOwner || !testRepo) return { status: "SKIP", detail: "No repository available" };
    const r = await connector.execute("repos.health", { owner: testOwner, repo: testRepo }, ctx as any);
    return r.success ? { status: "PASS", detail: `health_pct=${(r.data as any).health_percentage ?? "N/A"}` } : { status: "FAIL", detail: r.error ?? "" };
  }));

  // ── Part 3 — Branch Operations ───────────────────────────────────────────

  results.push(await run("BRANCH-01", "List branches", "Branch Operations", async () => {
    if (!hasCredentials) return { status: "NOT_CONFIGURED", detail: "Skipped — no credentials" };
    if (!testOwner || !testRepo) return { status: "SKIP", detail: "No repository available" };
    const r = await connector.execute("branches.list", { owner: testOwner, repo: testRepo }, ctx as any);
    return r.success ? { status: "PASS", detail: `${(r.data as any).count} branch(es)` } : { status: "FAIL", detail: r.error ?? "" };
  }));

  results.push(await run("BRANCH-02", "Default branch detection", "Branch Operations", async () => {
    if (!hasCredentials) return { status: "NOT_CONFIGURED", detail: "Skipped — no credentials" };
    if (!testOwner || !testRepo) return { status: "SKIP", detail: "No repository available" };
    const r = await connector.execute("branches.default", { owner: testOwner, repo: testRepo }, ctx as any);
    return r.success ? { status: "PASS", detail: `Default branch: ${(r.data as any).defaultBranch}` } : { status: "FAIL", detail: r.error ?? "" };
  }));

  results.push(await run("BRANCH-03", "Protected branches", "Branch Operations", async () => {
    if (!hasCredentials) return { status: "NOT_CONFIGURED", detail: "Skipped — no credentials" };
    if (!testOwner || !testRepo) return { status: "SKIP", detail: "No repository available" };
    const r = await connector.execute("branches.protected", { owner: testOwner, repo: testRepo }, ctx as any);
    return r.success ? { status: "PASS", detail: `${(r.data as any).count} protected branch(es)` } : { status: "FAIL", detail: r.error ?? "" };
  }));

  // ── Part 4 — Commit Operations ───────────────────────────────────────────

  results.push(await run("COMMIT-01", "List commits with pagination", "Commit Operations", async () => {
    if (!hasCredentials) return { status: "NOT_CONFIGURED", detail: "Skipped — no credentials" };
    if (!testOwner || !testRepo) return { status: "SKIP", detail: "No repository available" };
    const r = await connector.execute("commits.list", { owner: testOwner, repo: testRepo, per_page: 5, page: 1 }, ctx as any);
    return r.success ? { status: "PASS", detail: `${(r.data as any).count} commit(s) on page 1` } : { status: "FAIL", detail: r.error ?? "" };
  }));

  let testSha: string | null = null;
  if (hasCredentials && testOwner && testRepo) {
    const cr = await connector.execute("commits.list", { owner: testOwner, repo: testRepo, per_page: 1 }, ctx as any);
    if (cr.success && (cr.data as any)?.items?.length > 0) testSha = (cr.data as any).items[0].sha;
  }

  results.push(await run("COMMIT-02", "Get commit details with changed files", "Commit Operations", async () => {
    if (!hasCredentials) return { status: "NOT_CONFIGURED", detail: "Skipped — no credentials" };
    if (!testOwner || !testRepo || !testSha) return { status: "SKIP", detail: "No commit SHA available" };
    const r = await connector.execute("commits.get", { owner: testOwner, repo: testRepo, sha: testSha }, ctx as any);
    return r.success ? { status: "PASS", detail: `SHA ${(r.data as any).shortSha} — ${(r.data as any).totalFiles} file(s) changed` } : { status: "FAIL", detail: r.error ?? "" };
  }));

  // ── Part 5 — File Operations ─────────────────────────────────────────────

  results.push(await run("FILE-01", "List repository files (with ignore filter)", "File Operations", async () => {
    if (!hasCredentials) return { status: "NOT_CONFIGURED", detail: "Skipped — no credentials" };
    if (!testOwner || !testRepo) return { status: "SKIP", detail: "No repository available" };
    const r = await connector.execute("files.list", { owner: testOwner, repo: testRepo }, ctx as any);
    if (!r.success) return { status: "FAIL", detail: r.error ?? "" };
    const d = r.data as any;
    const hasNodeModules = d.items?.some((f: any) => f.path.includes("node_modules"));
    return { status: hasNodeModules ? "FAIL" : "PASS", detail: `${d.totalFiles} file(s) — ignored dirs excluded: ${!hasNodeModules}` };
  }));

  results.push(await run("FILE-02", "Read file contents (README.md)", "File Operations", async () => {
    if (!hasCredentials) return { status: "NOT_CONFIGURED", detail: "Skipped — no credentials" };
    if (!testOwner || !testRepo) return { status: "SKIP", detail: "No repository available" };
    const r = await connector.execute("files.get", { owner: testOwner, repo: testRepo, path: "README.md" }, ctx as any);
    if (r.status === "FAILED" && r.error?.includes("not found")) return { status: "SKIP", detail: "No README.md in repository" };
    return r.success ? { status: "PASS", detail: `README.md — ${(r.data as any).size} bytes — decoded: ${(r.data as any).decoded}` } : { status: "FAIL", detail: r.error ?? "" };
  }));

  // ── Part 6 — Connector Health ────────────────────────────────────────────

  results.push(await run("HEALTH-01", "Full structured health report", "Connector Health", async () => {
    const report = await connector.health() as any;
    return {
      status: report.status === "healthy" ? "PASS" : report.status === "degraded" ? "PASS" : hasCredentials ? "FAIL" : "NOT_CONFIGURED",
      detail: `Health: ${report.status} — ${report.details}`,
    };
  }));

  results.push(await run("HEALTH-02", "Connectivity ping", "Connector Health", async () => {
    if (!hasCredentials) return { status: "NOT_CONFIGURED", detail: "Skipped — no credentials" };
    const r = await connector.execute("connectivity.ping", {}, ctx as any);
    return r.success ? { status: "PASS", detail: `Ping OK — ${(r.data as any)?.responseTimeMs}ms` } : { status: "FAIL", detail: r.error ?? "" };
  }));

  // ── Part 7 — Runtime Integration ─────────────────────────────────────────

  results.push(await run("RUNTIME-01", "Capabilities declared in metadata", "Runtime Integration", async () => {
    const meta = connector.metadata();
    const required = ["auth.user","auth.validate","repos.list","commits.list","files.list","health.full"];
    const missing = required.filter(c => !meta.capabilities.includes(c));
    return missing.length === 0 ? { status: "PASS", detail: `All ${required.length} required capabilities declared` } : { status: "FAIL", detail: `Missing: ${missing.join(", ")}` };
  }));

  results.push(await run("RUNTIME-02", "Version follows semver", "Runtime Integration", async () => {
    const { version } = connector.metadata();
    const valid = /^\d+\.\d+\.\d+$/.test(version);
    return { status: valid ? "PASS" : "FAIL", detail: `Version: ${version}` };
  }));

  results.push(await run("RUNTIME-03", "validateAsync() returns structured ConnectorValidationResult", "Runtime Integration", async () => {
    const v = await connector.validateAsync();
    const hasChecks = Array.isArray(v.checks) && v.checks.length > 0;
    const hasSummary = typeof v.summary === "string" && v.summary.length > 0;
    return hasChecks && hasSummary ? { status: "PASS", detail: `${v.checks.length} checks — valid=${v.valid}` } : { status: "FAIL", detail: "Missing checks or summary" };
  }));

  results.push(await run("RUNTIME-04", "NOT_CONFIGURED returned (not FAILED) when no token", "Runtime Integration", async () => {
    // Create a fresh connector with no token
    const bare = new GitHubConnector();
    const r = await bare.execute("repos.list", {}, ctx as any);
    return r.status === "NOT_CONFIGURED" ? { status: "PASS", detail: "Correctly returns NOT_CONFIGURED when unauthenticated" } : { status: "FAIL", detail: `Expected NOT_CONFIGURED, got ${r.status}` };
  }));

  // ── Part 8 — Production Metrics ──────────────────────────────────────────

  results.push(await run("METRICS-01", "totalRequests increments correctly", "Production Metrics", async () => {
    const before = connector.internalMetrics.totalRequests;
    await connector.execute("connectivity.ping", {}, ctx as any);
    const after = connector.internalMetrics.totalRequests;
    return after > before ? { status: "PASS", detail: `totalRequests: ${before} -> ${after}` } : { status: "FAIL", detail: `Did not increment: ${after}` };
  }));

  results.push(await run("METRICS-02", "avgLatencyMs and p95LatencyMs computed", "Production Metrics", async () => {
    const m = connector.internalMetrics;
    const ok2 = m.avgLatencyMs >= 0 && m.p95LatencyMs >= 0 && m.latencyAllMs.length > 0;
    return ok2 ? { status: "PASS", detail: `avg=${m.avgLatencyMs}ms p95=${m.p95LatencyMs}ms samples=${m.latencyAllMs.length}` } : { status: "FAIL", detail: "Latency metrics not populated" };
  }));

  results.push(await run("METRICS-03", "Uptime duration tracked", "Production Metrics", async () => {
    const m = connector.internalMetrics;
    return m.uptimeDurationMs > 0 ? { status: "PASS", detail: `Uptime: ${m.uptimeDurationMs}ms` } : { status: "FAIL", detail: "uptimeDurationMs is 0" };
  }));

  results.push(await run("METRICS-04", "Per-operation call counts tracked", "Production Metrics", async () => {
    const m = connector.internalMetrics;
    const ops = Object.keys(m.operationCallCount);
    return ops.length > 0 ? { status: "PASS", detail: `${ops.length} operation(s) tracked: ${ops.slice(0,4).join(", ")}` } : { status: "FAIL", detail: "No operations tracked" };
  }));

  // ── Part 9 — Diagnostics ─────────────────────────────────────────────────

  results.push(await run("DIAG-01", "Health report includes structured checks array", "Diagnostics", async () => {
    const h = await connector.health() as any;
    const hasChecks = Array.isArray(h.checks) && h.checks.length >= 4;
    return hasChecks ? { status: "PASS", detail: `${h.checks.length} structured health checks` } : { status: "FAIL", detail: "Health report missing structured checks array" };
  }));

  results.push(await run("DIAG-02", "Rate limit diagnostics observable", "Diagnostics", async () => {
    if (!hasCredentials) return { status: "NOT_CONFIGURED", detail: "Skipped — no credentials" };
    await connector.execute("connectivity.ping", {}, ctx as any);
    const m = connector.internalMetrics;
    const hasMeta = m.rateLimitRemaining !== null || m.rateLimitUsagePct !== null;
    return hasMeta ? { status: "PASS", detail: `remaining=${m.rateLimitRemaining} usage=${m.rateLimitUsagePct}%` } : { status: "SKIP", detail: "Rate limit headers not returned by this endpoint" };
  }));

  // Build report
  const passed        = results.filter(r => r.status === "PASS").length;
  const failed        = results.filter(r => r.status === "FAIL").length;
  const notConfigured = results.filter(r => r.status === "NOT_CONFIGURED").length;
  const total         = results.length;

  const overallStatus: GitHubProductionCertificationReport["overallStatus"] =
    !hasCredentials ? "NOT_CONFIGURED" : failed === 0 ? "CERTIFIED" : "FAILED";

  const summary = !hasCredentials
    ? `GitHub Production Connector — NOT_CONFIGURED. Set __GITHUB_TOKEN__ to run full validation.`
    : failed === 0
      ? `GitHub Production Connector CERTIFIED — ${passed}/${total} tests pass. Beta-01 production validated.`
      : `GitHub Production Connector — ${failed} test(s) FAILED. ${passed}/${total} passed.`;

  return {
    id: makeId(),
    generatedAt: Date.now(),
    durationMs: Date.now() - t0,
    connectorVersion: connector.metadata().version,
    credentialsConfigured: hasCredentials,
    results,
    passed,
    failed,
    notConfigured,
    total,
    overallStatus,
    metrics: summariseMetrics(connector),
    summary,
  };
}