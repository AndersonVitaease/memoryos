import http from "node:http";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, rm, writeFile, chmod, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const OPERATIONS = Object.freeze(["status", "test", "build", "candidate", "deploy", "smoke", "rollback", "inspect", "restart", "container_probe", "unit_credential", "security_probe"]);
const ASYNC = new Set(["deploy", "rollback"]);
const TIMEOUTS = Object.freeze({ status: 30_000, test: 1_200_000, build: 120_000, candidate: 600_000, deploy: 180_000, smoke: 300_000, rollback: 120_000, inspect: 30_000, restart: 30_000, container_probe: 90_000, unit_credential: 90_000, security_probe: 60_000 });
const MAX_BODY = 4_096;
const MAX_OUTPUT = 131_072;
const DEFAULTS = Object.freeze({ socketPath: "/opt/eng-mcp-release-data/run/release-runner.sock", jobsDir: "/opt/eng-mcp-release-data/jobs", lockPath: "/opt/eng-mcp-release-data/release-runner.lock", pipeline: "/opt/memoryos/eng-mcp/scripts/eng-mcp-release.mjs" });

// ITEM-1 CONTROLLED RESTART: the runner restarts ITSELF - no shell, no SSH, no new
// child_process use. The mutation is process.exit(42); the supervisor (systemd,
// Restart=on-failure with drop-in SuccessExitStatus=42 + RestartForceExitStatus=42,
// verified fail-closed by the precheck below) performs the actual recycle. Exit 42 is
// a PROTOCOL constant: SuccessExitStatus records a CLEAN exit (no failure noise in
// journald) and RestartForceExitStatus forces the restart despite the clean exit.
export const CONTROLLED_RESTART_EXIT_CODE = 42;
const RESTART_COOLDOWN_MS = 300_000;
const UNIT_FILE = "/etc/systemd/system/eng-mcp-release-runner.service";
const UNIT_DROPIN_DIR = "/etc/systemd/system/eng-mcp-release-runner.service.d";
const BOOT_ID_PATH = "/proc/sys/kernel/random/boot_id";
const intentPathFor = (config) => path.join(path.dirname(config.jobsDir), "restart-intent.json");

function redact(value) {
  // (?!\/) — values that start with a slash are PATHS, not secret values (e.g. the
  // systemd directive LoadCredential=<id>:/opt/... reported by unit_credential);
  // real secrets never begin with "/", so the key=value scrub skips them instead of
  // mangling structural JSON around them (see redactChildStdout).
  return String(value).replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gi, "[REDACTED]").replace(/\b(?:gh[pousr]_|github_pat_|sk_(?:live|test)_|pk_(?:live|test)_)[A-Za-z0-9_]{16,}\b/g, "[REDACTED]").replace(/\b(authorization|bearer|client_secret|access_token|refresh_token|password|private_key)\s*[:=]\s*(?!\/)[^\s]+/gi, "$1=[REDACTED]");
}

// UNIT-CREDENTIAL-01 regression guard: a child's structured stdout is serialized JSON,
// and a text-level scrub over it can eat structural quotes/commas when a match (e.g.
// \bbearer:) consumes until whitespace across a string terminator — leaving a raw
// newline inside an unterminated string (invalid JSON -> UC_RESULT_UNPARSEABLE).
// Structured stdout is therefore scrubbed at OBJECT level, per string value, which is
// structure-preserving by construction, and re-serialized. Anything that is not valid
// JSON falls back to the plain text scrub.
function redactStrings(value) {
  if (typeof value === "string") return redact(value);
  if (Array.isArray(value)) return value.map(redactStrings);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = redactStrings(item);
    return out;
  }
  return value;
}

export function redactChildStdout(text) {
  try { return JSON.stringify(redactStrings(JSON.parse(text))); } catch { return redact(text); }
}

function safeError(error) { return redact(error instanceof Error ? error.message : "RELEASE_RUNNER_FAILED").slice(0, 2_048); }
function publicJob(job) { return { jobId: job.jobId, operation: job.operation, status: job.status, createdAt: job.createdAt, ...(job.startedAt ? { startedAt: job.startedAt } : {}), ...(job.finishedAt ? { finishedAt: job.finishedAt } : {}), ...(job.releaseId ? { releaseId: job.releaseId } : {}), ...(job.imageId ? { imageId: job.imageId } : {}), ...(job.commit ? { commit: job.commit } : {}), ...(job.exitCode !== undefined ? { exitCode: job.exitCode } : {}), ...(job.error ? { error: job.error } : {}), ...(job.params ? { params: job.params } : {}) }; }

export function runPipeline(job, options = {}) {
  const pipeline = options.pipeline ?? DEFAULTS.pipeline; const timeoutMs = TIMEOUTS[job.operation];
  return new Promise((resolve) => {
    const started = Date.now(); let stdout = Buffer.alloc(0); let stderr = Buffer.alloc(0); let truncated = false; let timedOut = false;
    const credential = process.env.CREDENTIALS_DIRECTORY ? path.join(process.env.CREDENTIALS_DIRECTORY, "release-bearer") : null;
    const runtimeObservabilityCredential = process.env.CREDENTIALS_DIRECTORY ? path.join(process.env.CREDENTIALS_DIRECTORY, "runtime-observability-secret") : null;
    const mcpBatchExecuteCredential = process.env.CREDENTIALS_DIRECTORY ? path.join(process.env.CREDENTIALS_DIRECTORY, "mcp-batch-execute-secret") : null;
    const agentMemoryCredential = process.env.CREDENTIALS_DIRECTORY ? path.join(process.env.CREDENTIALS_DIRECTORY, "agent-memory-secret") : null;
    const runtimeTokenCredential = process.env.CREDENTIALS_DIRECTORY ? path.join(process.env.CREDENTIALS_DIRECTORY, "claude-agent-runtime-token") : null;
    const e2bApiKeyCredential = process.env.CREDENTIALS_DIRECTORY ? path.join(process.env.CREDENTIALS_DIRECTORY, "e2b-api-key") : null;
    const githubPatCredential = process.env.CREDENTIALS_DIRECTORY ? path.join(process.env.CREDENTIALS_DIRECTORY, "github-pat") : null;
    const gitCredentialsCredential = process.env.CREDENTIALS_DIRECTORY ? path.join(process.env.CREDENTIALS_DIRECTORY, "git-credentials") : null;
    const hermesNotifyCredential = process.env.CREDENTIALS_DIRECTORY ? path.join(process.env.CREDENTIALS_DIRECTORY, "hermes-notify-api-key") : null;
    const start = async () => {
      const environment = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: process.env.LANG };
      if (credential) { try { environment.ENG_MCP_RELEASE_BEARER = (await readFile(credential, "utf8")).trim(); } catch { /* status/test/build/candidate do not require it */ } }
      if (runtimeObservabilityCredential) { environment.ENG_MCP_RUNTIME_OBSERVABILITY_CREDENTIAL_FILE = runtimeObservabilityCredential; }
      if (mcpBatchExecuteCredential) { environment.MCP_BATCH_EXECUTE_CREDENTIAL_FILE = mcpBatchExecuteCredential; }
      if (agentMemoryCredential) { environment.ENG_MCP_AGENT_MEMORY_CREDENTIAL_FILE = agentMemoryCredential; }
      if (runtimeTokenCredential) { environment.ENG_MCP_RUNTIME_TOKEN_CREDENTIAL_FILE = runtimeTokenCredential; }
      if (e2bApiKeyCredential) { environment.E2B_API_KEY_FILE = e2bApiKeyCredential; }
      if (githubPatCredential) { environment.GITHUB_TOKEN_FILE = githubPatCredential; }
      if (gitCredentialsCredential) { environment.GIT_CREDENTIALS_FILE = gitCredentialsCredential; }
      if (hermesNotifyCredential) { environment.ENG_MCP_HERMES_NOTIFY_CREDENTIAL_FILE = hermesNotifyCredential; }
      // Experimento A (main-session notifications): forward the fixed session id from
      // the runner env (systemd drop-in) into the sanitized child env; absent = no-op.
      if (process.env.ENG_MCP_HERMES_SESSION_ID) environment.ENG_MCP_HERMES_SESSION_ID = process.env.ENG_MCP_HERMES_SESSION_ID;
      // Pass commit as environment variable if present
      if (job.commit) environment.ENG_MCP_COMMIT = job.commit;
      // ITEM-2: thread probe params as flat ENG_MCP_PROBE_* environment variables
      // (bounded primitives only; the release action re-validates authoritatively).
      if (job.operation === "container_probe" && job.params && typeof job.params === "object") {
        for (const [key, value] of Object.entries(job.params)) {
          if (value === undefined || value === null) continue;
          environment[`ENG_MCP_PROBE_${String(key).toUpperCase()}`] = String(value);
        }
      }
      // UNIT-CREDENTIAL-01: thread unit_credential params as flat ENG_MCP_UC_*
      // environment variables. Explicit mapping (not key.toUpperCase()) so the
      // child env names keep their underscores: credentialId -> CREDENTIAL_ID,
      // unitPath -> UNIT_PATH. The execute boolean here is the runner-side
      // approval gate, re-validated authoritatively by the child.
      if (job.operation === "unit_credential" && job.params && typeof job.params === "object") {
        if (typeof job.params.unit === "string") environment.ENG_MCP_UC_UNIT = job.params.unit;
        if (typeof job.params.credentialId === "string") environment.ENG_MCP_UC_CREDENTIAL_ID = job.params.credentialId;
        if (typeof job.params.unitPath === "string") environment.ENG_MCP_UC_UNIT_PATH = job.params.unitPath;
        environment.ENG_MCP_UC_EXECUTE = String(job.params.execute === true);
      }
      const child = spawn(process.execPath, [pipeline, job.operation], { cwd: path.dirname(pipeline), shell: false, stdio: ["ignore", "pipe", "pipe"], env: environment });
      const append = (current, chunk) => { const remaining = MAX_OUTPUT - stdout.length - stderr.length; if (remaining <= 0) { truncated = true; return current; } if (chunk.length > remaining) truncated = true; return Buffer.concat([current, chunk.subarray(0, remaining)]); };
      child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); }); child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
      const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
      child.once("error", (error) => { clearTimeout(timer); resolve({ success: false, exitCode: null, durationMs: Date.now() - started, stdout: "", stderr: safeError(error), truncated, timedOut }); });
      child.once("close", (code) => { clearTimeout(timer); resolve({ success: !timedOut && code === 0, exitCode: timedOut ? null : code, durationMs: Date.now() - started, stdout: redactChildStdout(stdout.toString("utf8")), stderr: redact(stderr.toString("utf8")), truncated, timedOut }); });
    }; void start();
  });
}

// Parse Restart=/SuccessExitStatus=/RestartForceExitStatus= from the unit file and its
// drop-ins (last occurrence wins, matching systemd merge semantics). Returns null when
// the main unit is unreadable - the precheck MUST fail closed on null.
export async function readUnitDirectives(unitFile = UNIT_FILE, dropinDir = UNIT_DROPIN_DIR) {
  const texts = [];
  try { texts.push(await readFile(unitFile, "utf8")); } catch { return null; }
  try {
    for (const name of (await readdir(dropinDir)).filter((entry) => entry.endsWith(".conf")).sort()) {
      try { texts.push(await readFile(path.join(dropinDir, name), "utf8")); } catch { /* one unreadable drop-in: skip */ }
    }
  } catch { /* missing drop-in dir is acceptable */ }
  const directives = { restart: null, successExitStatus: [], restartForceExitStatus: [] };
  const codes = (value) => value.trim().split(/\s+/).map((token) => (/^\d+$/.test(token) ? String(Number(token)) : token));
  for (const text of texts) {
    for (const rawLine of text.split(/\r?\n/)) {
      const match = /^\s*(Restart|SuccessExitStatus|RestartForceExitStatus)\s*=\s*(.+?)\s*$/.exec(rawLine);
      if (!match) continue;
      if (match[1] === "Restart") directives.restart = match[2];
      else if (match[1] === "SuccessExitStatus") directives.successExitStatus = codes(match[2]);
      else directives.restartForceExitStatus = codes(match[2]);
    }
  }
  return directives;
}

// Fail-closed restart precheck: the three-signal "zero jobs in flight" rule (in-memory
// active flag, lock file absence, job store scan) must ALL agree, the supervisor
// directives must be present and compatible with the self-exit mechanism, the previous
// intent must be completed and the cooldown must be clear. Empty list = allowed.
export function evaluateRestartPrecheck({ active, lockExists, inFlightJobs, directives, lastIntent, nowMs = Date.now(), cooldownMs = RESTART_COOLDOWN_MS }) {
  const blockers = [];
  if (active) blockers.push("RUNNER_BUSY");
  if (lockExists) blockers.push("LOCK_PRESENT");
  if (inFlightJobs.length > 0) blockers.push(`JOBS_IN_FLIGHT:${inFlightJobs.map((job) => `${job.jobId}:${job.operation}`).join(",")}`);
  if (!directives) blockers.push("UNIT_DIRECTIVES_UNVERIFIABLE");
  else {
    if (directives.restart !== "on-failure" && directives.restart !== "always") blockers.push(`UNIT_RESTART_UNSUPPORTED:${directives.restart ?? "absent"}`);
    if (!directives.successExitStatus.includes(String(CONTROLLED_RESTART_EXIT_CODE))) blockers.push("UNIT_SUCCESS_EXIT_STATUS_MISSING:42");
    if (!directives.restartForceExitStatus.includes(String(CONTROLLED_RESTART_EXIT_CODE))) blockers.push("UNIT_RESTART_FORCE_EXIT_STATUS_MISSING:42");
  }
  if (lastIntent && lastIntent.status !== "completed") blockers.push("INTENT_UNCOMPLETED_PRESENT");
  if (lastIntent && lastIntent.status === "completed" && lastIntent.completedAt && nowMs - Date.parse(lastIntent.completedAt) < cooldownMs) blockers.push("RESTART_COOLDOWN");
  return blockers;
}

export function createReleaseRunner(options = {}) {
  const config = { ...DEFAULTS, ...options }; const execute = options.execute ?? ((job) => runPipeline(job, config)); let active = false; let draining = false; let probeInFlight = false; let unitCredentialInFlight = false; let securityProbeInFlight = false; let recoveryMarked = 0; let lastRestartId = null; let lastRestartOutcome = null; const startedAt = new Date().toISOString();
  const exitNow = options.exitNow ?? ((code) => process.exit(code)); const scheduleExit = options.scheduleExit ?? ((fn) => setTimeout(fn, 500)); const unitReader = options.unitReader ?? readUnitDirectives; const restartClock = options.restartClock ?? (() => Date.now());
  const persist = async (job) => { await mkdir(config.jobsDir, { recursive: true, mode: 0o750 }); const target = path.join(config.jobsDir, `${job.jobId}.json`); const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`; await writeFile(temporary, `${JSON.stringify(publicJob(job), null, 2)}\n`, { mode: 0o600 }); await rename(temporary, target); };
  const load = async (jobId) => { if (!/^[a-f0-9-]{16,64}$/i.test(jobId)) throw new Error("RELEASE_JOB_ID_INVALID"); return JSON.parse(await readFile(path.join(config.jobsDir, `${jobId}.json`), "utf8")); };
  const acquire = async () => { if (active) throw new Error("RELEASE_CONFLICT"); try { const handle = await open(config.lockPath, "wx", 0o600); await handle.writeFile(String(process.pid)); await handle.close(); active = true; } catch { throw new Error("RELEASE_CONFLICT"); } };
  const release = async () => { active = false; await rm(config.lockPath, { force: true }); };
  const executeJob = async (job) => { let acquired = false; try { await acquire(); acquired = true; job.status = "running"; job.startedAt = new Date().toISOString(); await persist(job); const result = await execute(job); job.exitCode = result.exitCode; job.finishedAt = new Date().toISOString(); job.status = result.success ? (job.operation === "rollback" ? "rolled_back" : "success") : "failed"; if (!result.success) { job.error = safeError(result.stderr || (result.timedOut ? "RELEASE_TIMEOUT" : "RELEASE_FAILED")); console.error("[release-runner] %s stderr: %s", job.operation, (result.stderr || "").slice(0, 2048)); } await persist(job); return { ...result, job: publicJob(job) }; } catch (error) { job.status = "failed"; job.finishedAt = new Date().toISOString(); job.error = safeError(error); await persist(job); return { success: false, exitCode: null, durationMs: 0, stdout: "", stderr: job.error, truncated: false, job: publicJob(job) }; } finally { if (acquired) await release(); } };
  const createJob = async (operation, commit, params) => { const job = { jobId: randomUUID(), operation, status: "queued", createdAt: new Date().toISOString() }; if (commit !== undefined) job.commit = commit; if (params !== undefined) job.params = params; await persist(job); return job; };
  const recover = async () => {
    await mkdir(config.jobsDir, { recursive: true, mode: 0o750 }); await mkdir(path.dirname(config.socketPath), { recursive: true, mode: 0o750 }); await rm(config.lockPath, { force: true });
    for (const name of await readdir(config.jobsDir)) { if (!name.endsWith(".json")) continue; try { const job = JSON.parse(await readFile(path.join(config.jobsDir, name), "utf8")); if (job.status === "queued" || job.status === "running") { job.status = "failed"; job.finishedAt = new Date().toISOString(); job.error = "RELEASE_RUNNER_RESTARTED"; await persist(job); recoveryMarked += 1; } } catch { /* invalid files are not exposed */ } }
    // ITEM-1: complete a pending restart intent left by the PREVIOUS generation (its
    // oldPid cannot be this boot's pid) and expose the outcome via status/runnerMeta.
    const intentPath = intentPathFor(config); let intent = null;
    try { intent = JSON.parse(await readFile(intentPath, "utf8")); } catch { intent = null; }
    if (intent && intent.status === "pending" && intent.oldPid !== process.pid) {
      intent.status = "completed"; intent.completedAt = new Date().toISOString(); intent.newPid = process.pid;
      const temporary = `${intentPath}.${process.pid}.${randomUUID()}.tmp`; await writeFile(temporary, `${JSON.stringify(intent, null, 2)}\n`, { mode: 0o600 }); await rename(temporary, intentPath);
    }
    if (intent) { lastRestartId = typeof intent.restartId === "string" ? intent.restartId : null; lastRestartOutcome = typeof intent.status === "string" ? intent.status : null; }
  };
  const inFlightJobs = async () => {
    const result = [];
    try {
      for (const name of await readdir(config.jobsDir)) { if (!name.endsWith(".json")) continue; try { const job = JSON.parse(await readFile(path.join(config.jobsDir, name), "utf8")); if (job.status === "queued" || job.status === "running") result.push({ jobId: job.jobId ?? name, operation: job.operation ?? "unknown" }); } catch { result.push({ jobId: name, operation: "unreadable" }); } }
    } catch (error) { result.push({ jobId: "JOBS_DIR_UNREADABLE", operation: safeError(error) }); }
    return result;
  };
  // ITEM-1: the restart mutation itself. Synchronously raises `draining` (blocks new
  // pipeline jobs), runs the fail-closed precheck, persists the snapshot intent, then
  // schedules the self-exit with the protocol code - the supervisor recycles us.
  const handleRestart = async () => {
    draining = true;
    try {
      const intentPath = intentPathFor(config);
      let lastIntent = null; try { lastIntent = JSON.parse(await readFile(intentPath, "utf8")); } catch { lastIntent = null; }
      if (lastIntent && lastIntent.status === "pending" && lastIntent.oldPid === process.pid) return { accepted: true, restartId: lastIntent.restartId, status: "pending", idempotent: true };
      let directives = null; try { directives = await unitReader(); } catch { directives = null; }
      let lockExists = false; try { await open(config.lockPath, "r"); lockExists = true; } catch { lockExists = false; }
      const blockers = evaluateRestartPrecheck({ active, lockExists, inFlightJobs: await inFlightJobs(), directives, lastIntent, nowMs: restartClock() });
      if (blockers.length > 0) { draining = false; return { accepted: false, refused: true, blockers, error: `RUNNER_RESTART_REFUSED:${blockers[0]}` }; }
      const bootId = await readFile(BOOT_ID_PATH, "utf8").then((value) => value.trim()).catch(() => null);
      const jobCounts = { queued: 0, running: 0, failed: 0, success: 0, other: 0 };
      try { for (const name of await readdir(config.jobsDir)) { if (!name.endsWith(".json")) continue; try { const job = JSON.parse(await readFile(path.join(config.jobsDir, name), "utf8")); jobCounts[job.status] = (jobCounts[job.status] ?? 0) + 1; } catch { jobCounts.other += 1; } } } catch { /* jobs dir vanished mid-snapshot: the precheck already scanned it */ }
      const restartId = randomUUID();
      const intent = { restartId, status: "pending", requestedAt: new Date().toISOString(), mechanism: "self-exit+systemd", exitCode: CONTROLLED_RESTART_EXIT_CODE, oldPid: process.pid, oldUptime: process.uptime(), oldBootId: bootId, nodeVersion: process.version, socketPath: config.socketPath, timeouts: TIMEOUTS, directives, jobCounts };
      const temporary = `${intentPath}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(temporary, `${JSON.stringify(intent, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, intentPath);
      console.error("[release-runner] controlled restart restartId=%s oldPid=%d exitCode=%d (SuccessExitStatus+RestartForceExitStatus=42 force the supervisor recycle)", restartId, process.pid, CONTROLLED_RESTART_EXIT_CODE);
      scheduleExit(() => { try { server.close(); } catch { /* already closed */ } exitNow(CONTROLLED_RESTART_EXIT_CODE); });
      return { accepted: true, restartId, status: "pending" };
    } catch (error) { draining = false; throw error; }
  };
  // SECURITY-SCAN-01: read-only host probe helpers. Every value-bearing match is
  // hashed sha256-16 INSIDE this process - raw secret values never leave the
  // runner or cross the socket. All sections are bounded and report honest
  // readErrors instead of failing the whole probe.
  const SEC_HASH16 = (value) => createHash("sha256").update(value).digest("hex").slice(0, 16);
  const SEC_ENV_LIST = (name, fallback) => { const raw = process.env[name]; if (typeof raw !== "string" || raw.trim() === "") return fallback; return raw.split(",").map((item) => item.trim()).filter((item) => item !== ""); };
  const SEC_PATTERNS = [
    { kind: "github-finegrained-token", regex: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g },
    { kind: "github-classic-token", regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
    { kind: "openai-style-key", regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
    { kind: "openai-secret-key", regex: /\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b/g },
    { kind: "base44-key", regex: /\bb44k_[A-Za-z0-9_-]{16,}\b/g },
    { kind: "slack-token", regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
    { kind: "aws-access-key", regex: /\bAKIA[0-9A-Z]{16}\b/g },
    { kind: "google-api-key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
    { kind: "jwt", regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
    { kind: "bearer-token", regex: /\bBearer\s+([A-Za-z0-9._-]{20,})\b/g, group: 1 },
    { kind: "assigned-secret", regex: /\b(?:password|passwd|secret|api[_-]?key|apikey|access[_-]?token|auth[_-]?token|token)\s*[:=]\s*["']?([^\s"']{8,})/gi, group: 1 }
  ];
  const SEC_HIGH_ENTROPY = /\b[A-Za-z0-9+/=_-]{32,}\b/g;
  const SEC_ENTROPY_CONTEXT = /(key|token|secret|password|bearer|credential|auth|authorization)/i;
  const SEC_CADDY_AUTH = /(?:^|\s)(?:basic_auth|forward_auth|authorize|auth_backend|jwt)\b/i;
  const SEC_SHANNON = (value) => { const counts = new Map(); for (const ch of value) counts.set(ch, (counts.get(ch) ?? 0) + 1); let bits = 0; for (const count of counts.values()) { const p = count / value.length; bits -= p * Math.log2(p); } return bits; };
  const secClassify = (text) => {
    const hits = []; const seen = new Set(); const hashed = new Set();
    const lines = String(text).split("\n");
    for (let index = 0; index < lines.length && hits.length < 20; index += 1) {
      const line = lines[index];
      if (line.length === 0 || line.length > 8192) continue;
      const context = (SEC_ENTROPY_CONTEXT.exec(line) ?? [])[1]?.toLowerCase() ?? null;
      const push = (kind, value) => { const hash16 = SEC_HASH16(value); const key = `${hash16}|${kind}`; if (seen.has(key)) return; seen.add(key); hashed.add(hash16); hits.push({ line: index + 1, kind, hash16, entropy: Math.round(SEC_SHANNON(value) * 100) / 100, context }); };
      for (const pattern of SEC_PATTERNS) { pattern.regex.lastIndex = 0; let match; while ((match = pattern.regex.exec(line)) !== null) { const value = match[pattern.group ?? 0]; if (typeof value === "string" && value.length > 0) push(pattern.kind, value); if (match.index === pattern.regex.lastIndex) pattern.regex.lastIndex += 1; } }
      if (/-----BEGIN [^-]*PRIVATE KEY-----/.test(line)) push("pem-private-key", `pem-line:${index + 1}`);
      if (context === null) continue;
      for (const match of line.matchAll(SEC_HIGH_ENTROPY)) { const value = match[0]; if (hashed.has(SEC_HASH16(value))) continue; if (SEC_SHANNON(value) < 4.5) continue; push("high-entropy-string", value); }
    }
    return hits;
  };
  const secScanCaddyfile = (text) => {
    const findings = secClassify(text);
    const lines = String(text).split("\n");
    const sites = []; let site = null; let depth = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (site === null) { if (trimmed === "" || trimmed.startsWith("#") || !trimmed.endsWith("{")) continue; site = { address: trimmed.slice(0, trimmed.length - 1).trim(), body: [] }; depth = 1; continue; }
      depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
      site.body.push(trimmed);
      if (depth <= 0) { sites.push(site); site = null; }
    }
    let routesTotal = 0; let routesWithAuth = 0; let hasTlsDirective = false; let hasHstsHeader = false; const samples = [];
    for (const entry of sites) {
      if (entry.address === "") continue;
      routesTotal += 1;
      const body = entry.body.join("\n");
      if (SEC_CADDY_AUTH.test(body)) routesWithAuth += 1; else if (samples.length < 3) samples.push(entry.address);
      if (/(?:^|\s)tls\b/.test(body)) hasTlsDirective = true;
      if (/Strict-Transport-Security/i.test(body)) hasHstsHeader = true;
    }
    // auth-block values (bcrypt hashes etc.) sit on bare lines with no context
    // word - classify them with the auth directive as context; header_up/down
    // lines carry name-space-separated values the generic patterns cannot see.
    let block = null; let blockDepth = 0; const extra = [];
    for (let index = 0; index < lines.length && extra.length < 10; index += 1) {
      const raw = lines[index]; const trimmed = raw.trim();
      if (block !== null) { blockDepth += (raw.match(/\{/g) ?? []).length - (raw.match(/\}/g) ?? []).length; if (blockDepth <= 0) { block = null; continue; } }
      else if (trimmed.endsWith("{")) { const head = trimmed.slice(0, trimmed.length - 1).trim(); block = SEC_CADDY_AUTH.test(head) ? head : null; blockDepth = 1; continue; }
      else block = null;
      const named = /(?:^|\s)(?:header_up|header_down|header)\s+[^\s]*(?:secret|token|key|authorization)[^\s]*\s+"?([^\s"]{8,})"?/i.exec(raw);
      if (named !== null) extra.push({ line: index + 1, kind: "assigned-secret", hash16: SEC_HASH16(named[1]), entropy: Math.round(SEC_SHANNON(named[1]) * 100) / 100, context: "caddy-header" });
      if (block === null) continue;
      for (const match of raw.matchAll(SEC_HIGH_ENTROPY)) { const value = match[0]; if (SEC_SHANNON(value) < 4.5) continue; if (findings.some((item) => item.hash16 === SEC_HASH16(value))) continue; extra.push({ line: index + 1, kind: "high-entropy-string", hash16: SEC_HASH16(value), entropy: Math.round(SEC_SHANNON(value) * 100) / 100, context: block }); }
    }
    for (const hit of extra) { if (findings.some((item) => item.hash16 === hit.hash16) || findings.length >= 20) continue; findings.push(hit); }
    return { findings, routeAuthStats: { routesTotal, routesWithAuth, routesWithoutAuth: routesTotal - routesWithAuth, samples }, tls: { hasTlsDirective, hasHstsHeader } };
  };
  const secScanProcs = async (secError) => {
    const out = [];
    let pids = [];
    try { pids = (await readdir("/proc", { withFileTypes: true })).filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name)).slice(0, 200); } catch (error) { secError("procs", "/proc", error); return out; }
    for (const entry of pids) {
      const cmdline = await readFile(`/proc/${entry.name}/cmdline`, "utf8").then((value) => value.replaceAll("\0", " ").trim()).catch(() => "");
      if (cmdline === "") continue;
      const hits = secClassify(cmdline);
      if (hits.length > 0) out.push({ pid: Number(entry.name), argv0: cmdline.slice(0, 160), hits });
    }
    return out;
  };
  const secScanUnits = async (secError) => {
    const out = [];
    const unitsDir = "/etc/systemd/system";
    let names = [];
    try { names = (await readdir(unitsDir, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith(".service")).slice(0, 40); } catch (error) { secError("units", unitsDir, error); return out; }
    for (const entry of names) {
      const text = await readFile(`${unitsDir}/${entry.name}`, "utf8").catch((error) => { secError("units", `${unitsDir}/${entry.name}`, error); return null; });
      if (text === null) continue;
      const noNew = /NoNewPrivileges=(\S+)/.exec(text); const protect = /ProtectSystem=(\S+)/.exec(text);
      const hardening = { ...(noNew !== null ? { noNewPrivileges: noNew[1] } : {}), ...(protect !== null ? { protectSystem: protect[1] } : {}) };
      const envHits = [];
      for (const line of text.split("\n")) { if (!/^Environment(File)?=/.test(line.trim())) continue; for (const hit of secClassify(line)) if (envHits.length < 10) envHits.push(hit); }
      out.push({ unit: entry.name, hardening, envHits });
    }
    return out;
  };
  const secScanSecretDirs = async () => {
    const out = [];
    for (const dirPath of SEC_ENV_LIST("ENG_MCP_SEC_SECRET_DIRS", ["/opt/eng-mcp-secrets", "/data/credentials"]).slice(0, 8)) {
      const entry = { path: dirPath, entries: [] };
      try {
        const dirents = await readdir(dirPath, { withFileTypes: true });
        for (const item of dirents.slice(0, 50)) {
          let type = item.isDirectory() ? "dir" : "file"; let mode = null;
          try { const stats = await stat(`${dirPath}/${item.name}`); type = stats.isDirectory() ? "dir" : "file"; mode = stats.mode & 0o777; } catch { /* stat failed: keep dirent type, mode unknown */ }
          const nameHits = secClassify(item.name).map((hit) => ({ ...hit, line: 1, context: "filename" }));
          entry.entries.push({ name: item.name, type, mode, ...(nameHits.length > 0 ? { hits: nameHits } : {}) });
        }
      } catch (error) { entry.error = String(error instanceof Error ? error.message : error).slice(0, 200); }
      out.push(entry);
    }
    return out;
  };
  const secScanDataFiles = async () => {
    const out = [];
    for (const filePath of SEC_ENV_LIST("ENG_MCP_SEC_DATA_FILES", ["/data/tokens.json"]).slice(0, 8)) {
      const outcome = await readFile(filePath, "utf8").then((text) => ({ text })).catch((error) => ({ error }));
      if (outcome.text !== undefined) out.push({ path: filePath, kind: "tokens-json", hash16: SEC_HASH16(outcome.text) });
      else out.push({ path: filePath, error: String(outcome.error instanceof Error ? outcome.error.message : outcome.error).slice(0, 200) });
    }
    return out;
  };
  const secScanUfw = async () => {
    let ufwConfEnabled = null;
    try { const text = await readFile("/etc/ufw/ufw.conf", "utf8"); const match = /^ENABLED=(\S+)/m.exec(text); if (match !== null) ufwConfEnabled = match[1]; } catch { ufwConfEnabled = null; }
    let ufwUnitWants = false;
    try { await stat("/etc/systemd/system/multi-user.target.wants/ufw.service"); ufwUnitWants = true; } catch { ufwUnitWants = false; }
    return { ufwConfEnabled, ufwUnitWants };
  };
  const secScanListeners = async (secError) => {
    const out = [];
    for (const [proto, file] of [["tcp", "/proc/net/tcp"], ["tcp6", "/proc/net/tcp6"]]) {
      const text = await readFile(file, "utf8").catch((error) => { secError("listeners", file, error); return null; });
      if (text === null) continue;
      for (const line of text.split("\n")) {
        if (out.length >= 50) break;
        const columns = line.trim().split(/\s+/);
        if (columns.length < 4 || columns[3] !== "0A") continue;
        const parts = (columns[1] ?? "").split(":");
        const port = Number.parseInt(parts[parts.length - 1] ?? "", 16);
        if (!Number.isFinite(port) || port === 0) continue;
        const addrHex = parts.slice(0, -1).join(":");
        const bind = /^0+$/.test(addrHex) ? (proto === "tcp6" ? "::" : "0.0.0.0") : addrHex;
        out.push({ proto, port, bind });
      }
    }
    return out;
  };
  const secScanTranscripts = async (secError) => {
    const out = [];
    for (const rootDir of SEC_ENV_LIST("ENG_MCP_SEC_TRANSCRIPT_DIRS", ["/root/.claude/projects"]).slice(0, 4)) {
      const entry = { dir: rootDir, hits: [] };
      try {
        const projects = (await readdir(rootDir, { withFileTypes: true })).filter((item) => item.isDirectory()).slice(0, 20);
        for (const project of projects) {
          const files = (await readdir(`${rootDir}/${project.name}`, { withFileTypes: true })).filter((item) => item.isFile() && item.name.endsWith(".jsonl")).slice(0, 10);
          for (const file of files) {
            if (entry.hits.length >= 60) break;
            const text = await readFile(`${rootDir}/${project.name}/${file.name}`, "utf8").then((value) => value.slice(0, 262144)).catch((error) => { secError("transcripts", `${rootDir}/${project.name}/${file.name}`, error); return null; });
            if (text === null) continue;
            for (const hit of secClassify(text)) { if (entry.hits.length >= 60) break; entry.hits.push({ file: `${project.name}/${file.name}`, line: hit.line, kind: hit.kind, hash16: hit.hash16, entropy: hit.entropy, context: hit.context }); }
          }
          if (entry.hits.length >= 60) break;
        }
      } catch (error) { entry.error = String(error instanceof Error ? error.message : error).slice(0, 200); }
      out.push(entry);
    }
    return out;
  };
  // SECURITY-SCAN-01: assemble the read-only host probe. No child processes, no
  // writes; every secret-shaped value is hashed sha256-16 in-process before it
  // is returned. A section that fails is reported via readErrors, never thrown.
  const handleSecurityProbe = async () => {
    const readErrors = [];
    const secError = (source, path, error) => { if (readErrors.length < 50) readErrors.push({ source, path: String(path).slice(0, 200), error: String(error instanceof Error ? error.message : error).slice(0, 200) }); };
    const caddy = { files: [] };
    for (const filePath of SEC_ENV_LIST("ENG_MCP_SEC_CADDYFILES", ["/etc/caddy/Caddyfile"])) {
      const text = await readFile(filePath, "utf8").catch((error) => { secError("caddy", filePath, error); return null; });
      if (text === null) continue;
      const parsed = secScanCaddyfile(text);
      caddy.files.push({ path: filePath, findings: parsed.findings, routeAuthStats: parsed.routeAuthStats, tls: parsed.tls });
    }
    const procs = await secScanProcs(secError);
    const units = await secScanUnits(secError);
    const secretDirs = await secScanSecretDirs();
    const dataHostFiles = await secScanDataFiles();
    const ufw = await secScanUfw();
    const listeners = await secScanListeners(secError);
    const transcripts = { dirs: await secScanTranscripts(secError) };
    return { success: true, caddy, procs, units, secretDirs, dataHostFiles, ufw, listeners, transcripts, readErrors, note: "SECURITY-SCAN-01 host probe; every secret value is hashed sha256-16 in-process; read-only" };
  };
  const respond = (response, status, value) => { response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(value)); };
  const server = http.createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/release") return respond(response, 404, { error: "NOT_FOUND" });
    let body = Buffer.alloc(0); let overflow = false;
    request.on("data", (chunk) => { if (body.length + chunk.length > MAX_BODY) { overflow = true; return; } body = Buffer.concat([body, chunk]); });
    request.on("end", () => { void (async () => { try {
      if (overflow) throw new Error("REQUEST_TOO_LARGE"); let input; try { input = JSON.parse(body.toString("utf8")); } catch { throw new Error("INPUT_INVALID"); }
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("INPUT_INVALID"); const keys = Object.keys(input);
      // ITEM-2: container_probe carries flat, bounded primitives instead of jobId/commit.
      const allowedKeys = input.operation === "container_probe" ? ["operation", "image", "probe", "path", "maxBytes"] : input.operation === "unit_credential" ? ["operation", "unit", "credentialId", "unitPath", "execute", "approval"] : input.operation === "security_probe" ? ["operation"] : ["operation", "jobId", "commit"];
      if (keys.some((key) => !allowedKeys.includes(key))) throw new Error("INPUT_INVALID");
      if (!OPERATIONS.includes(input.operation)) throw new Error("RELEASE_ACTION_INVALID"); if (input.jobId !== undefined && input.operation !== "status") throw new Error("RELEASE_JOB_ID_NOT_ALLOWED");
      // Validate commit parameter
      if (input.commit !== undefined) {
        // Commit is only valid for test operation
        if (input.operation !== "test") throw new Error("COMMIT_ONLY_ALLOWED_FOR_TEST");
        // Validate SHA format
        if (!/^[a-f0-9]{40}$/.test(input.commit)) throw new Error("COMMIT_SHA_INVALID");
      }
      // ITEM-2: shape-only validation for container_probe (bounded primitives). The
      // semantic allowlist (image prefix, path grammar, sensitive denylist) lives
      // authoritatively in the release action; the runner only enforces types so
      // unbounded or non-scalar input can never reach the child environment.
      if (input.operation === "container_probe") {
        if (typeof input.image !== "string" || input.image.length === 0 || input.image.length > 220) throw new Error("INPUT_INVALID");
        if (typeof input.probe !== "string" || input.probe.length === 0 || input.probe.length > 40) throw new Error("INPUT_INVALID");
        if (typeof input.path !== "string" || input.path.length === 0 || input.path.length > 256) throw new Error("INPUT_INVALID");
        if (input.maxBytes !== undefined && (!Number.isInteger(input.maxBytes) || input.maxBytes < 1 || input.maxBytes > 4_096)) throw new Error("INPUT_INVALID");
      }
      // UNIT-CREDENTIAL-01: unit_credential params are bounded primitives; the
      // execute boolean is the runner-side approval gate (the child re-derives it
      // from its own env and re-validates authoritatively).
      if (input.operation === "unit_credential") {
        if (typeof input.unit !== "string" || input.unit.length === 0 || input.unit.length > 128) throw new Error("INPUT_INVALID");
        if (typeof input.credentialId !== "string" || input.credentialId.length === 0 || input.credentialId.length > 64) throw new Error("INPUT_INVALID");
        if (input.unitPath !== undefined && (typeof input.unitPath !== "string" || input.unitPath.length === 0 || input.unitPath.length > 64)) throw new Error("INPUT_INVALID");
        if (input.execute !== undefined && typeof input.execute !== "boolean") throw new Error("INPUT_INVALID");
        if (input.approval !== undefined && (typeof input.approval !== "object" || Array.isArray(input.approval) || input.approval === null || typeof input.approval.approved !== "boolean")) throw new Error("INPUT_INVALID");
      }
      if (draining && input.operation !== "status" && input.operation !== "restart") throw new Error("RELEASE_DRAINING");
      if (input.operation === "status" && input.jobId) return respond(response, 200, { operation: "status", success: true, job: await load(input.jobId) });
      if (input.operation === "status") { const result = await execute({ operation: "status" }); let unitMeta = null; try { unitMeta = await unitReader(); } catch { unitMeta = null; } return respond(response, result.success ? 200 : 502, { operation: "status", ...result, runnerMeta: { pid: process.pid, uptime: process.uptime(), startedAt, draining, lastRestartId, lastRestartOutcome, lastRecoveryMarked: recoveryMarked, unit: unitMeta } }); }
      if (input.operation === "inspect") { const result = await execute({ operation: "inspect" }); return respond(response, result.success ? 200 : 502, { operation: "inspect", ...result }); }
      // ITEM-2: one-off container probe — synchronous, lock-free (never contends
      // with the release pipeline's global acquire()), never persisted as a job
      // record (the release action writes its own probes.jsonl audit on the host).
      // Single-flight via probeInFlight; a concurrent probe is refused with 409.
      if (input.operation === "container_probe") {
        if (probeInFlight) return respond(response, 409, { operation: "container_probe", success: false, error: "PROBE_BUSY" });
        probeInFlight = true;
        try {
          const params = { image: input.image, probe: input.probe, path: input.path, ...(input.maxBytes !== undefined ? { maxBytes: input.maxBytes } : {}) };
          const result = await execute({ operation: "container_probe", params });
          return respond(response, result.success ? 200 : 502, { operation: "container_probe", ...result });
        } catch (error) {
          return respond(response, 502, { operation: "container_probe", success: false, error: safeError(error) });
        } finally { probeInFlight = false; }
      }
      // UNIT-CREDENTIAL-01: one-off systemd LoadCredential drop-in write —
      // synchronous, lock-free (never contends with the release pipeline's global
      // acquire()), never persisted as a job record. Single-flight via
      // unitCredentialInFlight; a concurrent request is refused with 409.
      if (input.operation === "unit_credential") {
        if (unitCredentialInFlight) return respond(response, 409, { operation: "unit_credential", success: false, error: "UNIT_CREDENTIAL_BUSY" });
        unitCredentialInFlight = true;
        try {
          const params = { unit: input.unit, credentialId: input.credentialId, ...(input.unitPath !== undefined ? { unitPath: input.unitPath } : {}), execute: input.execute === true && input.approval !== undefined && input.approval.approved === true };
          const result = await execute({ operation: "unit_credential", params });
          return respond(response, result.success ? 200 : 502, { operation: "unit_credential", ...result });
        } catch (error) {
          return respond(response, 502, { operation: "unit_credential", success: false, error: safeError(error) });
        } finally { unitCredentialInFlight = false; }
      }
      if (input.operation === "restart") { const outcome = await handleRestart(); return respond(response, outcome.accepted ? 202 : 409, { operation: "restart", ...outcome }); }
      // SECURITY-SCAN-01: one-off read-only host probe — synchronous, lock-free
      // (never contends with the release pipeline's global acquire()), never
      // persisted as a job record. Single-flight via securityProbeInFlight; a
      // concurrent request is refused with 409. handleSecurityProbe hashes every
      // secret-shaped value sha256-16 in-process before anything is returned.
      if (input.operation === "security_probe") {
        if (securityProbeInFlight) return respond(response, 409, { operation: "security_probe", success: false, error: "SECURITY_PROBE_BUSY" });
        securityProbeInFlight = true;
        try {
          const result = await handleSecurityProbe();
          return respond(response, 200, { operation: "security_probe", ...result });
        } catch (error) {
          return respond(response, 502, { operation: "security_probe", success: false, error: safeError(error) });
        } finally { securityProbeInFlight = false; }
      }
      const job = await createJob(input.operation, input.commit);
      if (ASYNC.has(input.operation)) { respond(response, 202, { operation: input.operation, accepted: true, jobId: job.jobId, status: "queued" }); setTimeout(() => { void executeJob(job); }, 100); return; }
      const result = await executeJob(job); return respond(response, result.success ? 200 : 502, { operation: input.operation, ...result });
    } catch (error) { respond(response, 400, { error: safeError(error) }); } })(); });
  });
  return { server, recover, publicJob, config, maintenance: { get lastRestartId() { return lastRestartId; }, get lastRestartOutcome() { return lastRestartOutcome; }, get draining() { return draining; } } };
}

export async function startReleaseRunner(options = {}) { const runner = createReleaseRunner(options); await runner.recover(); await rm(runner.config.socketPath, { force: true }); await new Promise((resolve, reject) => { runner.server.once("error", reject); runner.server.listen(runner.config.socketPath, resolve); }); await chmod(runner.config.socketPath, 0o660); return runner; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void startReleaseRunner().then(() => console.log("ENG-MCP release runner ready socket=/opt/eng-mcp-release-data/run/release-runner.sock")).catch((error) => { console.error(safeError(error)); process.exitCode = 1; });
