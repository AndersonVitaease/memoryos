import http from "node:http";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, rm, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const OPERATIONS = Object.freeze(["status", "test", "build", "candidate", "deploy", "smoke", "rollback", "inspect"]);
const ASYNC = new Set(["deploy", "rollback"]);
const TIMEOUTS = Object.freeze({ status: 30_000, test: 900_000, build: 120_000, candidate: 600_000, deploy: 180_000, smoke: 300_000, rollback: 120_000, inspect: 30_000 });
const MAX_BODY = 4_096;
const MAX_OUTPUT = 131_072;
const DEFAULTS = Object.freeze({ socketPath: "/opt/eng-mcp-release-data/run/release-runner.sock", jobsDir: "/opt/eng-mcp-release-data/jobs", lockPath: "/opt/eng-mcp-release-data/release-runner.lock", pipeline: "/opt/memoryos/eng-mcp/scripts/eng-mcp-release.mjs" });

function redact(value) {
  return String(value).replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gi, "[REDACTED]").replace(/\b(?:gh[pousr]_|github_pat_|sk_(?:live|test)_|pk_(?:live|test)_)[A-Za-z0-9_]{16,}\b/g, "[REDACTED]").replace(/\b(authorization|bearer|client_secret|access_token|refresh_token|password|private_key)\s*[:=]\s*[^\s]+/gi, "$1=[REDACTED]");
}

function safeError(error) { return redact(error instanceof Error ? error.message : "RELEASE_RUNNER_FAILED").slice(0, 2_048); }
function publicJob(job) { return { jobId: job.jobId, operation: job.operation, status: job.status, createdAt: job.createdAt, ...(job.startedAt ? { startedAt: job.startedAt } : {}), ...(job.finishedAt ? { finishedAt: job.finishedAt } : {}), ...(job.releaseId ? { releaseId: job.releaseId } : {}), ...(job.imageId ? { imageId: job.imageId } : {}), ...(job.commit ? { commit: job.commit } : {}), ...(job.exitCode !== undefined ? { exitCode: job.exitCode } : {}), ...(job.error ? { error: job.error } : {}) }; }

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
    const start = async () => {
      const environment = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: process.env.LANG };
      if (credential) { try { environment.ENG_MCP_RELEASE_BEARER = (await readFile(credential, "utf8")).trim(); } catch { /* status/test/build/candidate do not require it */ } }
      if (runtimeObservabilityCredential) { environment.ENG_MCP_RUNTIME_OBSERVABILITY_CREDENTIAL_FILE = runtimeObservabilityCredential; }
      if (mcpBatchExecuteCredential) { environment.MCP_BATCH_EXECUTE_CREDENTIAL_FILE = mcpBatchExecuteCredential; }
      if (agentMemoryCredential) { environment.ENG_MCP_AGENT_MEMORY_CREDENTIAL_FILE = agentMemoryCredential; }
      if (runtimeTokenCredential) { environment.ENG_MCP_RUNTIME_TOKEN_CREDENTIAL_FILE = runtimeTokenCredential; }
      if (e2bApiKeyCredential) { environment.E2B_API_KEY_FILE = e2bApiKeyCredential; }
      // Pass commit as environment variable if present
      if (job.commit) environment.ENG_MCP_COMMIT = job.commit;
      const child = spawn(process.execPath, [pipeline, job.operation], { cwd: path.dirname(pipeline), shell: false, stdio: ["ignore", "pipe", "pipe"], env: environment });
      const append = (current, chunk) => { const remaining = MAX_OUTPUT - stdout.length - stderr.length; if (remaining <= 0) { truncated = true; return current; } if (chunk.length > remaining) truncated = true; return Buffer.concat([current, chunk.subarray(0, remaining)]); };
      child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); }); child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
      const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
      child.once("error", (error) => { clearTimeout(timer); resolve({ success: false, exitCode: null, durationMs: Date.now() - started, stdout: "", stderr: safeError(error), truncated, timedOut }); });
      child.once("close", (code) => { clearTimeout(timer); resolve({ success: !timedOut && code === 0, exitCode: timedOut ? null : code, durationMs: Date.now() - started, stdout: redact(stdout.toString("utf8")), stderr: redact(stderr.toString("utf8")), truncated, timedOut }); });
    }; void start();
  });
}

export function createReleaseRunner(options = {}) {
  const config = { ...DEFAULTS, ...options }; const execute = options.execute ?? ((job) => runPipeline(job, config)); let active = false;
  const persist = async (job) => { await mkdir(config.jobsDir, { recursive: true, mode: 0o750 }); const target = path.join(config.jobsDir, `${job.jobId}.json`); const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`; await writeFile(temporary, `${JSON.stringify(publicJob(job), null, 2)}\n`, { mode: 0o600 }); await rename(temporary, target); };
  const load = async (jobId) => { if (!/^[a-f0-9-]{16,64}$/i.test(jobId)) throw new Error("RELEASE_JOB_ID_INVALID"); return JSON.parse(await readFile(path.join(config.jobsDir, `${jobId}.json`), "utf8")); };
  const acquire = async () => { if (active) throw new Error("RELEASE_CONFLICT"); try { const handle = await open(config.lockPath, "wx", 0o600); await handle.writeFile(String(process.pid)); await handle.close(); active = true; } catch { throw new Error("RELEASE_CONFLICT"); } };
  const release = async () => { active = false; await rm(config.lockPath, { force: true }); };
  const executeJob = async (job) => { let acquired = false; try { await acquire(); acquired = true; job.status = "running"; job.startedAt = new Date().toISOString(); await persist(job); const result = await execute(job); job.exitCode = result.exitCode; job.finishedAt = new Date().toISOString(); job.status = result.success ? (job.operation === "rollback" ? "rolled_back" : "success") : "failed"; if (!result.success) { job.error = safeError(result.stderr || (result.timedOut ? "RELEASE_TIMEOUT" : "RELEASE_FAILED")); console.error("[release-runner] %s stderr: %s", job.operation, (result.stderr || "").slice(0, 2048)); } await persist(job); return { ...result, job: publicJob(job) }; } catch (error) { job.status = "failed"; job.finishedAt = new Date().toISOString(); job.error = safeError(error); await persist(job); return { success: false, exitCode: null, durationMs: 0, stdout: "", stderr: job.error, truncated: false, job: publicJob(job) }; } finally { if (acquired) await release(); } };
  const createJob = async (operation, commit) => { const job = { jobId: randomUUID(), operation, status: "queued", createdAt: new Date().toISOString() }; if (commit !== undefined) job.commit = commit; await persist(job); return job; };
  const recover = async () => { await mkdir(config.jobsDir, { recursive: true, mode: 0o750 }); await mkdir(path.dirname(config.socketPath), { recursive: true, mode: 0o750 }); await rm(config.lockPath, { force: true }); for (const name of await readdir(config.jobsDir)) { if (!name.endsWith(".json")) continue; try { const job = JSON.parse(await readFile(path.join(config.jobsDir, name), "utf8")); if (job.status === "queued" || job.status === "running") { job.status = "failed"; job.finishedAt = new Date().toISOString(); job.error = "RELEASE_RUNNER_RESTARTED"; await persist(job); } } catch { /* invalid files are not exposed */ } } };
  const respond = (response, status, value) => { response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(value)); };
  const server = http.createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/release") return respond(response, 404, { error: "NOT_FOUND" });
    let body = Buffer.alloc(0); let overflow = false;
    request.on("data", (chunk) => { if (body.length + chunk.length > MAX_BODY) { overflow = true; return; } body = Buffer.concat([body, chunk]); });
    request.on("end", () => { void (async () => { try {
      if (overflow) throw new Error("REQUEST_TOO_LARGE"); let input; try { input = JSON.parse(body.toString("utf8")); } catch { throw new Error("INPUT_INVALID"); }
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("INPUT_INVALID"); const keys = Object.keys(input); if (keys.some((key) => !["operation", "jobId", "commit"].includes(key))) throw new Error("INPUT_INVALID");
      if (!OPERATIONS.includes(input.operation)) throw new Error("RELEASE_ACTION_INVALID"); if (input.jobId !== undefined && input.operation !== "status") throw new Error("RELEASE_JOB_ID_NOT_ALLOWED");
      // Validate commit parameter
      if (input.commit !== undefined) {
        // Commit is only valid for test operation
        if (input.operation !== "test") throw new Error("COMMIT_ONLY_ALLOWED_FOR_TEST");
        // Validate SHA format
        if (!/^[a-f0-9]{40}$/.test(input.commit)) throw new Error("COMMIT_SHA_INVALID");
      }
      if (input.operation === "status" && input.jobId) return respond(response, 200, { operation: "status", success: true, job: await load(input.jobId) });
      if (input.operation === "status") { const result = await execute({ operation: "status" }); return respond(response, result.success ? 200 : 502, { operation: "status", ...result }); }
      if (input.operation === "inspect") { const result = await execute({ operation: "inspect" }); return respond(response, result.success ? 200 : 502, { operation: "inspect", ...result }); }
      const job = await createJob(input.operation, input.commit);
      if (ASYNC.has(input.operation)) { respond(response, 202, { operation: input.operation, accepted: true, jobId: job.jobId, status: "queued" }); setTimeout(() => { void executeJob(job); }, 100); return; }
      const result = await executeJob(job); return respond(response, result.success ? 200 : 502, { operation: input.operation, ...result });
    } catch (error) { respond(response, 400, { error: safeError(error) }); } })(); });
  });
  return { server, recover, publicJob, config };
}

export async function startReleaseRunner(options = {}) { const runner = createReleaseRunner(options); await runner.recover(); await rm(runner.config.socketPath, { force: true }); await new Promise((resolve, reject) => { runner.server.once("error", reject); runner.server.listen(runner.config.socketPath, resolve); }); await chmod(runner.config.socketPath, 0o660); return runner; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void startReleaseRunner().then(() => console.log("ENG-MCP release runner ready socket=/opt/eng-mcp-release-data/run/release-runner.sock")).catch((error) => { console.error(safeError(error)); process.exitCode = 1; });
