#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { access, mkdir, readFile, readdir, rm, stat, writeFile, rename } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG = path.join(SCRIPT_DIR, "release-config.json");
export const ACTIONS = Object.freeze(["test", "build", "candidate", "deploy", "smoke", "rollback", "status", "inspect"]);
const OUTPUT_LIMIT = 256 * 1024;
const COMMAND_TIMEOUT = 180_000;
const WORKTREE_ROOT = "/opt/eng-mcp-release-data/worktrees";

export function parseCliWithOptions(argv) {
  const args = argv.slice(2);
  let action;
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--targetCommit" && args[i + 1]) {
      options.targetCommit = args[i + 1];
      i++;
    } else if (arg === "--jobId" && args[i + 1]) {
      options.jobId = args[i + 1];
      i++;
    } else if (!action && ACTIONS.includes(arg)) {
      action = arg;
    } else {
      throw new Error("RELEASE_ACTION_INVALID");
    }
  }
  if (!action) throw new Error("RELEASE_ACTION_INVALID");
  return { action, options };
}

export function parseCli(argv) {
  if (argv.length !== 3 || !ACTIONS.includes(argv[2])) throw new Error("RELEASE_ACTION_INVALID");
  return argv[2];
}

export function assertCandidateIsolation(config) {
  const { candidate, production } = config;
  if (candidate.port === production.port) throw new Error("CANDIDATE_PORT_NOT_ISOLATED");
  if (path.resolve(candidate.dataRoot) === path.dirname(path.resolve(production.dataMount.split(":")[0]))) throw new Error("CANDIDATE_DATA_NOT_ISOLATED");
  if (candidate.dataRoot.startsWith(production.repositoryMount.split(":")[0] + path.sep)) throw new Error("CANDIDATE_ROOT_NOT_ISOLATED");
}

export async function deriveExpectedCatalog(source) {
  // Importa o módulo tools.ts para obter catálogo canônico
  const toolsPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "tools.ts");
  const { createToolCatalog, toolMetadata } = await import(`file://${toolsPath}`);
  const catalog = createToolCatalog(toolMetadata, "memoryos");
  const tools = catalog.tools.map(t => t.name).sort();
  const count = tools.length;
  if (count === 0) throw new Error("EXPECTED_TOOL_CATALOG_NOT_FOUND");
  return { count, tools };
}

export function candidateTag(repository, timestamp, sourceHash) {
  const normalized = timestamp.replace(/[-:.TZ]/g, "");
  return `${repository}:candidate-${normalized}-${sourceHash.slice(0, 12)}`;
}

export function assertStateSafe(state) {
  const serialized = JSON.stringify(state);
  if (/bearer|authorization|tokenHash|access_token|refresh_token|private_key|password/i.test(serialized)) throw new Error("RELEASE_STATE_SENSITIVE");
  return state;
}

export function canBuild(state, sourceHash) {
  return state.testStatus === "PASS" && state.testSourceHash === sourceHash && typeof state.testImageId === "string";
}

export function canDeploy(state, sourceHash) {
  return state.candidateStatus === "PASS" && state.sourceHash === sourceHash && state.candidateImageId === state.imageId;
}

export function validateToolCatalog(actual, expected, required) {
  if (actual.length !== expected.length || new Set(actual).size !== actual.length) throw new Error("TOOL_CATALOG_MISMATCH");
  const canonicalActual = [...actual].sort(); const canonicalExpected = [...expected].sort();
  if (JSON.stringify(canonicalActual) !== JSON.stringify(canonicalExpected)) throw new Error("TOOL_CATALOG_MISMATCH");
  for (const name of required) if (!actual.includes(name)) throw new Error(`REQUIRED_TOOL_MISSING:${name}`);
  return true;
}

export function validateOperationalCatalog(catalog, toolNames) {
  if (!catalog || catalog.actualToolCount !== toolNames.length || catalog.catalogVersion !== `eng-mcp-tools-v${toolNames.length}` || !/^[a-f0-9]{64}$/.test(catalog.catalogHash ?? "")) throw new Error("OPERATIONAL_CATALOG_INVALID");
  if (typeof catalog.serverName !== "string" || typeof catalog.serverVersion !== "string" || typeof catalog.repositoryId !== "string" || !Array.isArray(catalog.tools)) throw new Error("OPERATIONAL_CATALOG_INVALID");
  const names = catalog.tools.map((tool) => tool.name);
  if (JSON.stringify(names) !== JSON.stringify([...names].sort()) || JSON.stringify([...names].sort()) !== JSON.stringify([...toolNames].sort())) throw new Error("OPERATIONAL_CATALOG_MISMATCH");
  if (new Set(names).size !== names.length || !catalog.tools.every((tool) => tool.access === "read" || tool.access === "write")) throw new Error("OPERATIONAL_CATALOG_INVALID");
  return catalog.catalogHash;
}

export function rollbackCommandPlan(containerName, previousContainer) {
  const safe = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
  if (!safe.test(containerName) || !safe.test(previousContainer) || containerName === previousContainer) throw new Error("ROLLBACK_CONTAINER_INVALID");
  return [
    ["docker", ["rm", "-f", containerName]],
    ["docker", ["rename", previousContainer, containerName]],
    ["docker", ["start", containerName]]
  ];
}

export function smokeFailureTransition(state) {
  if (!state.previousContainer || !state.previousImage) throw new Error("ROLLBACK_STATE_MISSING");
  return { ...state, smokeStatus: "FAIL", rollbackRequired: true };
}

export function invalidateDownstreamState(state) {
  const next = { ...state };
  for (const key of ["sourceHash", "imageTag", "imageId", "buildStatus", "builtAt", "candidateStatus", "candidateImageId", "candidateToolCount", "candidateCatalogHash", "candidateValidatedAt", "smokeStatus", "productionCatalogHash", "rollbackRequired", "deployStatus", "currentRelease", "deployedAt"]) delete next[key];
  return next;
}

function boundedAppend(current, chunk) {
  const next = current + chunk.toString("utf8");
  return next.length > OUTPUT_LIMIT ? next.slice(0, OUTPUT_LIMIT) : next;
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = ""; let stderr = ""; let truncated = false; let timedOut = false;
    child.stdout.on("data", (chunk) => { const before = stdout.length; stdout = boundedAppend(stdout, chunk); truncated ||= stdout.length === OUTPUT_LIMIT && before < OUTPUT_LIMIT; });
    child.stderr.on("data", (chunk) => { const before = stderr.length; stderr = boundedAppend(stderr, chunk); truncated ||= stderr.length === OUTPUT_LIMIT && before < OUTPUT_LIMIT; });
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); setTimeout(() => child.kill("SIGKILL"), 2_000).unref(); }, options.timeoutMs ?? COMMAND_TIMEOUT);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (exitCode) => { clearTimeout(timer); resolve({ exitCode: exitCode ?? -1, stdout, stderr, truncated, timedOut }); });
  });
}

async function mustRun(command, args, options = {}) {
  const result = await runProcess(command, args, options);
  if (result.timedOut) throw new Error(`RELEASE_COMMAND_TIMEOUT:${command}`);
  if (result.exitCode !== 0) throw new Error(`RELEASE_COMMAND_FAILED:${command}:${result.stderr || result.stdout}`);
  return result;
}

async function loadConfig(configFile = DEFAULT_CONFIG) {
  const config = JSON.parse(await readFile(configFile, "utf8"));
  assertCandidateIsolation(config);
  return config;
}

async function loadState(config) {
  try { return JSON.parse(await readFile(config.stateFile, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return {}; throw error; }
}

async function saveState(config, state) {
  assertStateSafe(state);
  await mkdir(path.dirname(config.stateFile), { recursive: true, mode: 0o700 });
  const temporary = `${config.stateFile}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, config.stateFile);
}

async function sourceFiles(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (["node_modules", ".git"].includes(entry.name) || entry.name.endsWith(".zip")) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(root, absolute));
    else if (entry.isFile()) files.push({ absolute, relative: path.relative(root, absolute).replaceAll(path.sep, "/") });
  }
  return files;
}

async function calculateSourceHash(root) {
  const hash = createHash("sha256");
  for (const file of await sourceFiles(root)) { hash.update(file.relative).update("\0").update(await readFile(file.absolute)).update("\0"); }
  return hash.digest("hex");
}

async function calculateCommitHash(repositoryPath, commit) {
  const hash = createHash("sha256");
  const archive = await mustRun("git", ["-C", repositoryPath, "archive", "--format=tar", commit]);
  hash.update(archive.stdout);
  return hash.digest("hex");
}

async function whitespaceCheck(root) {
  for (const file of await sourceFiles(root)) {
    const value = await readFile(file.absolute, "utf8");
    const bad = value.split(/\r?\n/).findIndex((line) => /[ \t]+$/.test(line));
    if (bad >= 0) throw new Error(`DIFF_CHECK_FAILED:${file.relative}:${bad + 1}`);
  }
}

async function expectedCatalog(config) {
  const toolsSource = await readFile(path.join(config.canonicalSource, "src/tools.ts"), "utf8");
  const catalog = await deriveExpectedCatalog(toolsSource);
  for (const required of config.requiredTools) if (!catalog.tools.includes(required)) throw new Error(`REQUIRED_TOOL_MISSING:${required}`);
  return catalog;
}

async function validateCommit(commit) {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("COMMIT_SHA_INVALID");
  return commit;
}

async function fetchCommit(repositoryPath, commit) {
  const remote = "origin";
  await mustRun("git", ["-C", repositoryPath, "fetch", remote]);
  const catFileResult = await runProcess("git", ["-C", repositoryPath, "cat-file", "-t", commit]);
  if (catFileResult.exitCode !== 0) throw new Error("TARGET_COMMIT_NOT_FOUND");
  if (catFileResult.stdout.trim() !== "commit") throw new Error("TARGET_COMMIT_NOT_A_COMMIT");
}

async function resolveCommit(repositoryPath, commit) {
  const catFileResult = await runProcess("git", ["-C", repositoryPath, "cat-file", "-t", commit]);
  if (catFileResult.exitCode !== 0) throw new Error("COMMIT_NOT_FOUND");
  if (catFileResult.stdout.trim() !== "commit") throw new Error("COMMIT_NOT_A_COMMIT");

  const revParseResult = await mustRun("git", ["-C", repositoryPath, "rev-parse", `${commit}^{commit}`]);
  const resolvedCommit = revParseResult.stdout.trim();
  if (resolvedCommit !== commit) throw new Error("COMMIT_RESOLUTION_MISMATCH");
  
  return resolvedCommit;
}

async function createWorktree(repositoryPath, resolvedCommit, jobId) {
  const worktreePath = path.join(WORKTREE_ROOT, jobId);
  await mkdir(path.dirname(worktreePath), { recursive: true, mode: 0o700 });
  
  await mustRun("git", ["-C", repositoryPath, "worktree", "add", "--detach", worktreePath, resolvedCommit]);
  
  const verifyResult = await mustRun("git", ["-C", worktreePath, "rev-parse", "HEAD"]);
  const worktreeCommit = verifyResult.stdout.trim();
  if (worktreeCommit !== resolvedCommit) throw new Error("WORKTREE_COMMIT_MISMATCH");
  
  return worktreePath;
}

async function cleanupWorktree(repositoryPath, worktreePath) {
  try {
    await runProcess("git", ["-C", repositoryPath, "worktree", "remove", "--force", worktreePath]);
  } catch {
    await rm(worktreePath, { recursive: true, force: true });
  }
  await runProcess("git", ["-X", repositoryPath, "worktree", "prune"]);
}

async function testCommitAction(config, commit, jobId) {
  await validateCommit(commit);
  const resolvedCommit = await resolveCommit(config.canonicalSource, commit);
  
  let worktreePath;
  try {
    worktreePath = await createWorktree(config.canonicalSource, resolvedCommit, jobId);
    const sourceHash = await calculateSourceHash(worktreePath);
    const catalog = await expectedCatalog(config);
    const diff = await runProcess("git", ["-C", worktreePath, "diff", "--check"]);
    if (diff.exitCode !== 0) throw new Error(`DIFF_CHECK_FAILED:${diff.stderr || diff.stdout}`);
    await whitespaceCheck(worktreePath);
    const built = await mustRun("docker", ["build", "-q", worktreePath], { timeoutMs: 600_000 });
    const testImageId = built.stdout.trim().split(/\s+/).at(-1);
    if (!/^sha256:[a-f0-9]{64}$/.test(testImageId)) throw new Error("TEST_IMAGE_ID_INVALID");
    const suite = await runProcess("docker", ["run", "--rm", "-v", `${path.join(worktreePath, "scripts")}:/app/scripts:ro`, testImageId, "node", "--test", "--test-force-exit", "test/*.test.ts"], { timeoutMs: 300_000 });
    const tests = Number(/(?:^|\n)â„¹ tests (\d+)/.exec(suite.stdout)?.[1] ?? 0);
    const passed = Number(/(?:^|\n)â„¹ pass (\d+)/.exec(suite.stdout)?.[1] ?? 0);
    const failed = Number(/(?:^|\n)â„¹ fail (\d+)/.exec(suite.stdout)?.[1] ?? -1);
    const result = {
      requestedCommit: commit,
      resolvedCommit,
      sourceHash,
      testImageId,
      tests,
      passed,
      failed,
      expectedToolCount: catalog.count,
      expectedTools: catalog.tools,
      testedAt: new Date().toISOString(),
      status: suite.exitCode === 0 && failed === 0 ? "PASS" : "FAIL"
    };
    if (result.status !== "PASS") throw new Error(`TESTS_FAILED:${suite.stderr || suite.stdout}`);
    return result;
  } finally {
    if (worktreePath) await cleanupWorktree(config.canonicalSource, worktreePath);
  }
}

async function testAction(config) {
  await access(config.canonicalSource);
  const sourceHash = await calculateSourceHash(config.canonicalSource);
  const catalog = await expectedCatalog(config);
  const diff = await runProcess("git", ["-C", config.canonicalSource, "diff", "--check"]);
  if (diff.exitCode !== 0) throw new Error(`DIFF_CHECK_FAILED:${diff.stderr || diff.stdout}`);
  await whitespaceCheck(config.canonicalSource);
  const built = await mustRun("docker", ["build", "-q", config.canonicalSource], { timeoutMs: 600_000 });
  const testImageId = built.stdout.trim().split(/\s+/).at(-1);
  if (!/^sha256:[a-f0-9]{64}$/.test(testImageId)) throw new Error("TEST_IMAGE_ID_INVALID");
  const suite = await runProcess("docker", ["run", "--rm", "-v", `${path.join(config.canonicalSource, "scripts")}:/app/scripts:ro`, testImageId, "node", "--test", "--test-force-exit", "test/*.test.ts"], { timeoutMs: 300_000 });
  const tests = Number(/(?:^|\n)â„¹ tests (\d+)/.exec(suite.stdout)?.[1] ?? 0);
  const passed = Number(/(?:^|\n)â„¹ pass (\d+)/.exec(suite.stdout)?.[1] ?? 0);
  const failed = Number(/(?:^|\n)â„¹ fail (\d+)/.exec(suite.stdout)?.[1] ?? -1);
  const state = { ...invalidateDownstreamState(await loadState(config)), testStatus: suite.exitCode === 0 && failed === 0 ? "PASS" : "FAIL", testSourceHash: sourceHash, testImageId, tests, passed, failed, expectedToolCount: catalog.count, expectedTools: catalog.tools, testedAt: new Date().toISOString() };
  await saveState(config, state);
  if (state.testStatus !== "PASS") throw new Error(`TESTS_FAILED:${suite.stderr || suite.stdout}`);
  return state;
}

async function buildAction(config) {
  const state = await loadState(config);
  let sourceHash;
  if (state.requestedCommit) {
    sourceHash = await calculateCommitHash(config.canonicalSource, state.requestedCommit);
    if (sourceHash !== state.testSourceHash) throw new Error("SOURCE_COMMIT_MISMATCH");
  } else {
    sourceHash = await calculateSourceHash(config.canonicalSource);
  }
  if (!canBuild(state, sourceHash)) throw new Error("BUILD_BLOCKED_BY_TEST_STATE");
  const tag = candidateTag(config.imageRepository, new Date().toISOString(), sourceHash);
  const existing = await runProcess("docker", ["image", "inspect", tag]);
  if (existing.exitCode === 0) throw new Error("IMMUTABLE_IMAGE_TAG_EXISTS");
  await mustRun("docker", ["tag", state.testImageId, tag]);
  const inspected = await mustRun("docker", ["image", "inspect", "--format", "{{.Id}}", tag]);
  const imageId = inspected.stdout.trim();
  if (imageId !== state.testImageId) throw new Error("BUILT_IMAGE_MISMATCH");
  const next = { ...state, sourceHash, imageTag: tag, imageId, buildStatus: "PASS", builtAt: new Date().toISOString() };
  await saveState(config, next); return next;
}

async function waitForPort(port) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const connected = await new Promise((resolve) => { const socket = net.connect(port, "127.0.0.1"); socket.once("connect", () => { socket.destroy(); resolve(true); }); socket.once("error", () => resolve(false)); socket.setTimeout(500, () => { socket.destroy(); resolve(false); }); });
    if (connected) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("CANDIDATE_START_TIMEOUT");
}

async function mcp(endpoint, bearer, id, method, params = {}) {
  const response = await fetch(endpoint, { method: "POST", headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
  const body = await response.text();
  if (response.status !== 200) throw new Error(`MCP_HTTP_${response.status}`);
  const data = body.split(/\r?\n/).find((line) => line.startsWith("data: "));
  if (!data) throw new Error("MCP_RESPONSE_INVALID");
  return JSON.parse(data.slice(6));
}

async function candidateAction(config) {
  const state = await loadState(config);
  let sourceHash;
  if (state.requestedCommit) {
    sourceHash = await calculateCommitHash(config.canonicalSource, state.requestedCommit);
    if (sourceHash !== state.sourceHash) throw new Error("SOURCE_COMMIT_MISMATCH");
  } else {
    sourceHash = await calculateSourceHash(config.canonicalSource);
  }
  if (state.buildStatus !== "PASS" || state.sourceHash !== sourceHash || !state.imageTag) throw new Error("CANDIDATE_BLOCKED_BY_BUILD_STATE");
  const id = `${Date.now()}-${randomBytes(4).toString("hex")}`; const name = `eng-mcp-candidate-${id}`;
  const candidateRoot = path.join(config.candidate.dataRoot, id); const fixture = path.join(candidateRoot, "fixture"); const data = path.join(candidateRoot, "data");
  if (!path.resolve(candidateRoot).startsWith(path.resolve(config.candidate.dataRoot) + path.sep)) throw new Error("CANDIDATE_PATH_INVALID");
  await mkdir(fixture, { recursive: true }); await mkdir(data, { recursive: true });
  const bearer = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(bearer).digest("hex");
  await writeFile(path.join(data, "tokens.json"), JSON.stringify({ tokens: [{ tokenHash, subject: "candidate", scopes: ["engineering:read", "engineering:write", "engineering:verify", "engineering:git"], allowedRepositoryIds: ["candidate"], expiresAt: new Date(Date.now() + 3_600_000).toISOString(), revokedAt: null }] }), { mode: 0o600 });
  await mustRun("git", ["init"], { cwd: fixture }); await mustRun("git", ["config", "user.email", "candidate@example.invalid"], { cwd: fixture }); await mustRun("git", ["config", "user.name", "ENG-MCP Candidate"], { cwd: fixture });
  await writeFile(path.join(fixture, "app.ts"), "export const candidate = 'before';\n"); await mustRun("git", ["add", "app.ts"], { cwd: fixture }); await mustRun("git", ["commit", "-m", "candidate fixture"], { cwd: fixture });
  const statusBefore = (await mustRun("git", ["status", "--porcelain=v2", "--untracked-files=all"], { cwd: fixture })).stdout;
  const refsBefore = (await mustRun("git", ["show-ref"], { cwd: fixture })).stdout;
  const registryBefore = createHash("sha256").update(await readFile(path.join(data, "tokens.json"))).digest("hex");
  try {
    await mustRun("docker", ["run", "-d", "--name", name, "--network", "host", "--restart", "no", "-v", `${fixture}:/fixture`, "-v", `${data}:/candidate-data`, "-e", "ENG_MCP_REPOSITORY_ROOT=/fixture", "-e", "ENG_MCP_REPOSITORY_ID=candidate", "-e", "ENG_MCP_TOKEN_REGISTRY_FILE=/candidate-data/tokens.json", "-e", "ENG_MCP_HOST=127.0.0.1", "-e", `ENG_MCP_PORT=${config.candidate.port}`, ...(process.env.ENG_MCP_RUNTIME_OBSERVABILITY_CREDENTIAL_FILE ? ["-v", `${process.env.ENG_MCP_RUNTIME_OBSERVABILITY_CREDENTIAL_FILE}:/run/secrets/runtime-observability-secret:ro`, "-e", "ENG_MCP_RUNTIME_OBSERVABILITY_CREDENTIAL_FILE=/run/secrets/runtime-observability-secret"] : []), ...(process.env.MCP_BATCH_EXECUTE_CREDENTIAL_FILE ? ["-v", `${process.env.MCP_BATCH_EXECUTE_CREDENTIAL_FILE}:/run/secrets/mcp-batch-execute-secret:ro`, "-e", "MCP_BATCH_EXECUTE_CREDENTIAL_FILE=/run/secrets/mcp-batch-execute-secret"] : []), state.imageTag]);
    await waitForPort(config.candidate.port);
    const endpoint = `http://127.0.0.1:${config.candidate.port}/mcp`;
    const unauth = await fetch(endpoint, { method: "POST" }); if (unauth.status !== 401) throw new Error("CANDIDATE_UNAUTH_INVALID");
    await mcp(endpoint, bearer, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "release-pipeline", version: "1" } });
    const listed = await mcp(endpoint, bearer, 2, "tools/list", {}); const names = listed.result.tools.map((tool) => tool.name);
    validateToolCatalog(names, state.expectedTools, config.requiredTools);
    const catalogCall = await mcp(endpoint, bearer, 20, "tools/call", { name: "engineering.mcp.catalog", arguments: {} }); if (catalogCall.result.isError) throw new Error("CANDIDATE_CATALOG_CALL_FAILED");
    const repeatedCatalogCall = await mcp(endpoint, bearer, 21, "tools/call", { name: "engineering.mcp.catalog", arguments: {} }); if (repeatedCatalogCall.result.isError) throw new Error("CANDIDATE_CATALOG_CALL_FAILED");
    const operationalCatalog = JSON.parse(catalogCall.result.content[0].text); const repeatedCatalog = JSON.parse(repeatedCatalogCall.result.content[0].text);
    const candidateCatalogHash = validateOperationalCatalog(operationalCatalog, names); if (repeatedCatalog.catalogHash !== candidateCatalogHash) throw new Error("CANDIDATE_CATALOG_NONDETERMINISTIC");
    const testProfiles = [
      { mode: "file", path: "eng-mcp/test/editing.test.ts" },
      { mode: "file", path: "eng-mcp/test/operational.test.ts" },
      { mode: "integration" },
      { mode: "suite" }
    ];
    for (const [index, argumentsValue] of testProfiles.entries()) {
      const executed = await mcp(endpoint, bearer, 30 + index, "tools/call", { name: "engineering.test.run", arguments: argumentsValue });
      if (executed.result.isError) throw new Error("CANDIDATE_TEST_RUN_CALL_FAILED");
      const outcome = JSON.parse(executed.result.content[0].text);
      if (!outcome.success || outcome.exitCode !== 0 || outcome.filesChanged?.length) throw new Error("CANDIDATE_TEST_RUN_FAILED");
    }
    const read = await mcp(endpoint, bearer, 3, "tools/call", { name: "engineering.file.read", arguments: { path: "app.ts" } }); const value = JSON.parse(read.result.content[0].text);
    const patched = await mcp(endpoint, bearer, 4, "tools/call", { name: "engineering.file.patch", arguments: { path: "app.ts", baseHash: value.hash, hunks: [{ startLine: 1, deleteLines: ["export const candidate = 'before';"], insertLines: ["export const candidate = 'after';"] }], expectedChangeCount: 1, acknowledgeWrite: true } }); if (patched.result.isError) throw new Error("CANDIDATE_PATCH_FAILED");
    const changed = JSON.parse(patched.result.content[0].text);
    const restored = await mcp(endpoint, bearer, 5, "tools/call", { name: "engineering.file.patch", arguments: { path: "app.ts", baseHash: changed.newHash, hunks: [{ startLine: 1, deleteLines: ["export const candidate = 'after';"], insertLines: ["export const candidate = 'before';"] }], expectedChangeCount: 1, acknowledgeWrite: true } }); if (restored.result.isError) throw new Error("CANDIDATE_ROLLBACK_FAILED");
    const statusAfter = (await mustRun("git", ["status", "--porcelain=v2", "--untracked-files=all"], { cwd: fixture })).stdout;
    const refsAfter = (await mustRun("git", ["show-ref"], { cwd: fixture })).stdout;
    const registryAfter = createHash("sha256").update(await readFile(path.join(data, "tokens.json"))).digest("hex");
    if (statusAfter !== statusBefore || refsAfter !== refsBefore || registryAfter !== registryBefore) throw new Error("CANDIDATE_MUTATION_DETECTED");
    const next = { ...state, candidateStatus: "PASS", candidateImageId: state.imageId, candidateToolCount: names.length, candidateCatalogHash, candidateValidatedAt: new Date().toISOString() };
    await saveState(config, next); return next;
  } catch (error) {
    await saveState(config, { ...state, candidateStatus: "FAIL", candidateValidatedAt: new Date().toISOString() }); throw error;
  } finally {
    await runProcess("docker", ["rm", "-f", name]);
    await rm(candidateRoot, { recursive: true, force: true });
  }
}

async function productionInspect(config) {
  const result = await mustRun("docker", ["inspect", "--format", "{{.Id}}|{{.Config.Image}}|{{.Image}}|{{.State.Running}}|{{json .Mounts}}", config.production.containerName]);
  const [containerId, image, imageId, running, mountsJson] = result.stdout.trim().split("|");
  const mounts = mountsJson ? JSON.parse(mountsJson) : [];
  return { containerId, image, imageId, running: running === "true", mounts };
}

export function validateRunnerMount(mounts, expectedMount) {
  const mountFound = mounts.some(mount => {
    const actualMount = `${mount.Source}:${mount.Destination}${mount.RW === false ? ':ro' : ''}`;
    return actualMount === expectedMount || actualMount === `${expectedMount}:ro`;
  });
  if (!mountFound) throw new Error("RUNNER_MOUNT_MISSING");
  return true;
}

export function validateReleaseInspectResult(inspectResult) {
  if (!inspectResult.service || inspectResult.service.activeState !== "active" || inspectResult.service.subState !== "running") {
    throw new Error("SMOKE_RELEASE_RUNNER_NOT_ACTIVE");
  }
  if (!inspectResult.security || inspectResult.security.readOnly !== true) {
    throw new Error("SMOKE_RELEASE_RUNNER_NOT_READONLY");
  }
  if (inspectResult.partialFailures && inspectResult.partialFailures.length > 0) {
    throw new Error("SMOKE_RELEASE_RUNNER_PARTIAL_FAILURES");
  }
  return true;
}

async function smokeAction(config) {
  const state = await loadState(config); const production = await productionInspect(config);
  if (!production.running) throw new Error("PRODUCTION_NOT_RUNNING");
  
  // 1. Validate runner mount presence
  validateRunnerMount(production.mounts, config.production.runnerMount);
  
  const unauth = await fetch(config.production.endpoint, { method: "POST" }); if (unauth.status !== 401) throw new Error("SMOKE_UNAUTH_INVALID");
  const bearer = process.env.ENG_MCP_RELEASE_BEARER;
  if (!bearer) throw new Error("SMOKE_BEARER_REQUIRED");
  await mcp(config.production.endpoint, bearer, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "release-smoke", version: "1" } });
  
  // 2. Validate tool catalog convergence (already includes catalog version, tool count, required tools)
  const listed = await mcp(config.production.endpoint, bearer, 2, "tools/list", {}); const names = listed.result.tools.map((tool) => tool.name);
  validateToolCatalog(names, state.expectedTools, config.requiredTools);
  
  // 3. Validate catalog operational integrity
  const catalogCall = await mcp(config.production.endpoint, bearer, 20, "tools/call", { name: "engineering.mcp.catalog", arguments: {} }); if (catalogCall.result.isError) throw new Error("SMOKE_CATALOG_CALL_FAILED");
  const repeatedCatalogCall = await mcp(config.production.endpoint, bearer, 21, "tools/call", { name: "engineering.mcp.catalog", arguments: {} }); if (repeatedCatalogCall.result.isError) throw new Error("SMOKE_CATALOG_CALL_FAILED");
  const operationalCatalog = JSON.parse(catalogCall.result.content[0].text); const repeatedCatalog = JSON.parse(repeatedCatalogCall.result.content[0].text);
  const productionCatalogHash = validateOperationalCatalog(operationalCatalog, names); if (repeatedCatalog.catalogHash !== productionCatalogHash) throw new Error("SMOKE_CATALOG_NONDETERMINISTIC");
  
  // 4. Validate release runner via engineering.server.release.inspect
  const inspectCall = await mcp(config.production.endpoint, bearer, 23, "tools/call", { name: "engineering.server.release.inspect", arguments: {} });
  if (inspectCall.result.isError) throw new Error("SMOKE_RELEASE_INSPECT_CALL_FAILED");
const inspectResult = JSON.parse(inspectCall.result.content[0].text);
    validateReleaseInspectResult(inspectResult);
  
  // 5. Validate operational tests
  const testCall = await mcp(config.production.endpoint, bearer, 22, "tools/call", { name: "engineering.test.run", arguments: { mode: "file", path: "eng-mcp/test/editing.test.ts" } }); if (testCall.result.isError) throw new Error("SMOKE_TEST_RUN_CALL_FAILED");
  const testOutcome = JSON.parse(testCall.result.content[0].text); if (!testOutcome.success || testOutcome.exitCode !== 0 || testOutcome.filesChanged?.length) throw new Error("SMOKE_TEST_RUN_FAILED");
  
  // 6. Validate basic read capability
  const read = await mcp(config.production.endpoint, bearer, 3, "tools/call", { name: "engineering.repo.structure", arguments: { path: "eng-mcp", maxDepth: 1, maxEntries: 20 } }); if (read.result.isError) throw new Error("SMOKE_READ_FAILED");
  
  // 7. Return convergence evidence
  const next = { 
    ...state, 
    smokeStatus: "PASS", 
    productionCatalogHash, 
    productionImage: production.image, 
    productionImageId: production.imageId, 
    deployedAt: state.deployedAt ?? null,
    converged: true,
    catalogVersion: operationalCatalog.catalogVersion,
    toolCount: names.length,
    expectedToolCount: state.expectedTools.length,
    mountValidated: true,
    releaseRunnerActive: true,
    releaseRunnerReadOnly: true,
    releaseRunnerPartialFailures: inspectResult.partialFailures?.length || 0
  };
  await saveState(config, next); return next;
}

async function rollbackAction(config) {
  const state = await loadState(config); if (!state.previousContainer || !state.previousImage) throw new Error("ROLLBACK_STATE_MISSING");
  const plan = rollbackCommandPlan(config.production.containerName, state.previousContainer);
  await runProcess(plan[0][0], plan[0][1]);
  await mustRun(plan[1][0], plan[1][1]);
  await mustRun(plan[2][0], plan[2][1]);
  const next = { ...state, rollbackStatus: "PASS", currentRelease: state.previousImage, rolledBackAt: new Date().toISOString() };
  await saveState(config, next); return next;
}

async function deployAction(config) {
  let state = await loadState(config);
  let sourceHash;
  if (state.requestedCommit) {
    sourceHash = await calculateCommitHash(config.canonicalSource, state.requestedCommit);
    if (sourceHash !== state.sourceHash) throw new Error("SOURCE_COMMIT_MISMATCH");
  } else {
    sourceHash = await calculateSourceHash(config.canonicalSource);
  }
  if (!canDeploy(state, sourceHash)) throw new Error("DEPLOY_BLOCKED_BY_CANDIDATE_STATE");
  const current = await productionInspect(config); const previousContainer = `${config.production.containerName}-rollback-${Date.now()}`;
  state = { ...state, previousContainer, previousImage: current.image, previousImageId: current.imageId, deployStatus: "IN_PROGRESS" }; await saveState(config, state);
  await mustRun("docker", ["rename", config.production.containerName, previousContainer]); await mustRun("docker", ["stop", previousContainer]);
  const p = config.production;
  try {
    await mustRun("docker", ["run", "-d", "--name", p.containerName, "--network", p.network, "--restart", p.restart, "-v", p.repositoryMount, "-v", p.dataMount, "-v", p.runnerMount, "-e", `ENG_MCP_REPOSITORY_ROOT=${p.repositoryRoot}`, "-e", `ENG_MCP_REPOSITORY_ID=${p.repositoryId}`, "-e", `ENG_MCP_TOKEN_REGISTRY_FILE=${p.tokenRegistryFile}`, "-e", `ENG_MCP_HOST=${p.host}`, "-e", `ENG_MCP_PORT=${p.port}`, ...(process.env.ENG_MCP_RUNTIME_OBSERVABILITY_CREDENTIAL_FILE ? ["-v", `${process.env.ENG_MCP_RUNTIME_OBSERVABILITY_CREDENTIAL_FILE}:/run/secrets/runtime-observability-secret:ro`, "-e", "ENG_MCP_RUNTIME_OBSERVABILITY_CREDENTIAL_FILE=/run/secrets/runtime-observability-secret"] : []), ...(process.env.MCP_BATCH_EXECUTE_CREDENTIAL_FILE ? ["-v", `${process.env.MCP_BATCH_EXECUTE_CREDENTIAL_FILE}:/run/secrets/mcp-batch-execute-secret:ro`, "-e", "MCP_BATCH_EXECUTE_CREDENTIAL_FILE=/run/secrets/mcp-batch-execute-secret"] : []), state.imageTag]);
    await waitForPort(p.port);
    state = { ...state, deployStatus: "PASS", currentRelease: state.imageTag, deployedAt: new Date().toISOString() }; await saveState(config, state);
    return await smokeAction(config);
  } catch (error) {
    await saveState(config, smokeFailureTransition(state)); await rollbackAction(config); throw error;
  }
}

function sanitizeSecrets(value) {
  // Sempre retornar string ou null, nunca objeto ou array
  if (value === null || value === undefined) return null;
  
  // Converter para string seguramente
  let text;
  if (typeof value === "string") {
    text = value;
  } else if (typeof value === "object") {
    // Para objetos, serializar JSON ou usar toString apropriado
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  } else {
    // Números, booleanos, etc
    text = String(value);
  }
  
  const secretPatterns = [
    /(Bearer|Authorization|api_key|apikey|private_key|password|token|secret|credential|key)[:=]\s*["']?([^"'\s,;]{10,})["']?/gi,
    /(-----BEGIN (RSA|EC|DSA|OPENSSH) PRIVATE KEY-----[\\s\\S]*?-----END (RSA|EC|DSA|OPENSSH) PRIVATE KEY-----)/gi,
    /ssh-[a-zA-Z0-9]+ [A-Za-z0-9+/]+={0,3}/g,
    /[A-Fa-f0-9]{64}/g,
  ];
  
  let sanitized = text;
  for (const pattern of secretPatterns) {
    sanitized = sanitized.replace(pattern, "[REDACTED_SECRET]");
  }
  
  return sanitized;
}

async function inspectAction(config) {
  const SERVICE_NAME = "eng-mcp-release-runner.service";
  const response = {
    service: { name: SERVICE_NAME },
    process: null,
    runner: {},
    docker: [],
    recentLogs: [],
    security: { secretsRedacted: true, environmentValuesReturned: false, readOnly: true },
    partialFailures: []
  };

  try {
    const serviceResult = await mustRun("systemctl", [
      "show", SERVICE_NAME,
      "--no-pager",
      "--property=ActiveState,SubState,MainPID,ExecStart,WorkingDirectory,User,Group,FragmentPath,EnvironmentFiles,LoadCredential"
    ]);

    const serviceProps = serviceResult.stdout.trim().split("\n").reduce((obj, line) => {
      const eq = line.indexOf("=");
      if (eq > 0) {
        const key = line.slice(0, eq);
        const value = line.slice(eq + 1);
        obj[key] = value;
      }
      return obj;
    }, {});

    // Helper para extrair caminho do runner de ExecStart de forma robusta
    function extractRunnerPath(execStartValue) {
      try {
        if (!execStartValue) return null;
        
        // Normalizar para string - com tratamento para todos os tipos
        const execStart = String(execStartValue);
        
        // Tentar extrair caminho do sistema systemd
        // Formato: { path=/usr/bin/node ; argv[]=/usr/bin/node /path/to/runner.mjs ; ... }
        const argvMatch = execStart.match(/argv\[\]=[^;]+node\s+([^;\s]+)/);
        if (argvMatch && argvMatch[1]) {
          return argvMatch[1];
        }
        
        // Fallback: padrão simples node <script>
        const simpleMatch = execStart.match(/node\s+(\S+)/);
        if (simpleMatch && simpleMatch[1]) {
          return simpleMatch[1];
        }
        
        return null;
      } catch (error) {
        // Não falhar a ação inteira por parsing de path
        return null;
      }
    }

    const execStartValue = serviceProps.ExecStart;
    const execStartSanitized = execStartValue ? sanitizeSecrets(execStartValue) : null;
    const runnerScriptPath = extractRunnerPath(execStartValue);
    const pipelinePath = runnerScriptPath ? runnerScriptPath.replace(/release-runner\.mjs$/, "eng-mcp-release.mjs") : null;
    
    // Registrar partial failure se não conseguiu extrair path mas execStart existe
    if (execStartValue && !runnerScriptPath) {
      response.partialFailures.push({ section: "runner_path_parse", error: "Could not extract runner script path from ExecStart" });
    }

    response.service = {
      name: SERVICE_NAME,
      activeState: serviceProps.ActiveState || null,
      subState: serviceProps.SubState || null,
      mainPid: serviceProps.MainPID ? parseInt(serviceProps.MainPID, 10) : null,
      execStart: execStartSanitized,
      workingDirectory: serviceProps.WorkingDirectory || null,
      user: serviceProps.User || null,
      group: serviceProps.Group || null,
      fragmentPath: serviceProps.FragmentPath || null,
      environmentFiles: serviceProps.EnvironmentFiles ? serviceProps.EnvironmentFiles.split(";") : [],
      credentialNames: serviceProps.LoadCredential ? serviceProps.LoadCredential.split(";") : []
    };

    if (response.service.mainPid && response.service.mainPid > 0) {
      try {
        const pid = response.service.mainPid.toString();
        
        // Obter comando completo de /proc/<pid>/cmdline (NUL-separated)
        const cmdlineResult = await runProcess("cat", [`/proc/${pid}/cmdline`]);
        let command = null;
        if (cmdlineResult.exitCode === 0 && cmdlineResult.stdout) {
          // Converter NUL separators para espaços
          command = cmdlineResult.stdout.replace(/\0/g, ' ').trim();
        }
        
        // Obter CWD de /proc/<pid>/cwd
        const cwdResult = await runProcess("readlink", [`-f`, `/proc/${pid}/cwd`]);
        let cwd = null;
        if (cwdResult.exitCode === 0 && cwdResult.stdout) {
          cwd = cwdResult.stdout.trim();
        }
        
        response.process = {
          pid: response.service.mainPid,
          command,
          cwd
        };
        
      } catch (error) {
        response.partialFailures.push({ section: "process", error: error.message });
      }
    }

    // Docker inspection - check only for eng-mcp labeled containers if evidence exists
    try {
      // First check if there's evidence of eng-mcp label usage
      response.docker = []; // Empty array - label filter not proven
      response.dockerInspection = "not_configured";
    } catch (error) {
      response.partialFailures.push({ section: "docker", error: error.message });
    }

    // Recent logs
    try {
      const logsResult = await mustRun("journalctl", [
        "-u", SERVICE_NAME,
        "--no-pager",
        "--since", "1 day ago",
        "-n", "50"
      ]);
      response.recentLogs = logsResult.stdout.split("\n").slice(0, 50).map(line => sanitizeSecrets(line));
    } catch (error) {
      response.partialFailures.push({ section: "logs", error: error.message });
    }

    // Runner metadata
    response.runner = {
      socketPath: "/opt/eng-mcp-release-data/run/release-runner.sock",
      pipelinePath: pipelinePath,
      configPath: null, // Cannot derive without evidence
      workingDirectory: response.service.workingDirectory
    };

    return response;
  } catch (error) {
    throw new Error(`INSPECTION_FAILED:${error.message}`);
  }
}

async function statusAction(config) {
  const state = await loadState(config);
  const production = await productionInspect(config);
  return { state, production };
}

export async function execute(action, configFile = DEFAULT_CONFIG, options = {}) {
  const config = await loadConfig(configFile);
  const targetCommit = options.targetCommit;
  if (targetCommit) {
    await fetchCommit(config.canonicalSource, targetCommit);
  }
  if (action === "test") {
    if (options.commit || targetCommit) {
      const commit = options.commit || targetCommit;
      return testCommitAction(config, commit, options.jobId || `commit-${Date.now()}`);
    }
    return testAction(config);
  }
  if (action === "build") return buildAction(config);
  if (action === "candidate") return candidateAction(config);
  if (action === "deploy") return deployAction(config);
  if (action === "smoke") return smokeAction(config);
  if (action === "rollback") return rollbackAction(config);
  if (action === "status") return statusAction(config);
  if (action === "inspect") return inspectAction(config);
  throw new Error("RELEASE_ACTION_INVALID");
}

async function main() {
  const { action, options } = parseCliWithOptions(process.argv);
  const result = await execute(action, DEFAULT_CONFIG, options);
  console.log(JSON.stringify({ action, ...result }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "RELEASE_FAILED");
    process.exitCode = 1;
  });
}