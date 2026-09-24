import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { access, appendFile, mkdir, readFile, readdir, rm, stat, symlink, writeFile, rename } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runUnitCredential } from "./eng-mcp-unit-credential.mjs";
// CONTRACT-01: smoke-side judge envelope contract validator + the stable live
// judge.verify arguments used by smokeAction step 7. Pinned to the zod contract
// (src/judgeContracts.ts) by test/contract-judge-envelope.test.ts.
import { validateJudgeVerifyEnvelope, SMOKE_JUDGE_ARGS } from "./eng-mcp-smoke-judge-contract.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG = path.join(SCRIPT_DIR, "release-config.json");
export const ACTIONS = Object.freeze(["test", "build", "candidate", "deploy", "smoke", "rollback", "status", "inspect", "container_probe", "unit_credential"]);
const OUTPUT_LIMIT = 256 * 1024;
// STORE-MIG-01: o TAP completo da suíte (~1500 testes + diagnósticos) passa de 256 KB e o
// sumário mora no FIM — cap fixo descartava exatamente as linhas que o parse precisa.
const TEST_OUTPUT_LIMIT = 8 * OUTPUT_LIMIT;
// Rabo do TAP embutido no TESTS_FAILED (o runner relay só 128 KB de stdout+stderr).
const RELEASE_TEST_EVIDENCE_TAIL = 100_000;
const COMMAND_TIMEOUT = 180_000;
const WORKTREE_ROOT = "/opt/eng-mcp-release-data/worktrees";

// Determina o repository root de forma determinística
async function resolveRepositoryRoot(config) {
  const canonicalSource = path.resolve(config.canonicalSource);

  // Verifica se o diretório existe
  await access(canonicalSource);

  // Garante que canonicalSource está dentro do repositório ENG-MCP
  const gitRootResult = await runProcess("git", ["-C", canonicalSource, "rev-parse", "--show-toplevel"], { cwd: canonicalSource }).catch(() => ({ exitCode: 1, stdout: "", stderr: "" }));
  if (gitRootResult.exitCode !== 0) {
    throw new Error(`REPOSITORY_ROOT_INVALID: ${canonicalSource} não é um repositório Git`);
  }

  const gitRoot = path.resolve(gitRootResult.stdout.trim());

  // Garante que não estamos escapando do repositório
  if (!canonicalSource.startsWith(gitRoot + path.sep) && canonicalSource !== gitRoot) {
    throw new Error(`REPOSITORY_ROOT_ESCAPE: ${canonicalSource} fora do repositório Git ${gitRoot}`);
  }

  return gitRoot;
}

// Enumerar arquivos usando git ls-files para garantir limites do repositório
async function gitTrackedFiles(repositoryRoot) {
  const topLevel = (await mustRun(
    "git",
    ["-C", repositoryRoot, "rev-parse", "--show-toplevel"],
    { cwd: repositoryRoot }
  )).stdout.trim();

  const projectPrefix = path.relative(topLevel, repositoryRoot).replaceAll(path.sep, "/");
  const result = await mustRun(
    "git",
    ["-C", topLevel, "ls-files", "--cached", "--", projectPrefix],
    { cwd: topLevel }
  );

  const files = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  const validFiles = [];

  for (const repositoryRelative of files) {
    const absolute = path.join(topLevel, repositoryRelative);
    try {
      const stats = await stat(absolute);
      if (!stats.isFile()) continue;
      validFiles.push({
        relative: path.relative(repositoryRoot, absolute).replaceAll(path.sep, "/"),
        absolute
      });
    } catch {
      continue;
    }
  }

  return validFiles;
}

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
  // Procura pela definição de CANONICAL_TOOL_CATALOG
  const catalogMatch = source.match(/export const CANONICAL_TOOL_CATALOG: readonly ToolCatalogEntry\[\] = (\[[\s\S]*?\])/);
  if (!catalogMatch) {
    // Fallback para regex de register (mantido para compatibilidade)
    const registerMatches = [...source.matchAll(/register\("([^"]+)"/g)];
    let tools = [...new Set(registerMatches.map(m => m[1]))];
    tools.sort();
    const count = tools.length;
    if (count === 0) throw new Error("EXPECTED_TOOL_CATALOG_NOT_FOUND");
    return { count, tools };
  }

  // Tenta parsear o array JSON-like
  let catalogArray;
  try {
    const arrayText = catalogMatch[1].replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":');
    catalogArray = JSON.parse(arrayText);
  } catch {
    throw new Error("EXPECTED_TOOL_CATALOG_INVALID");
  }

  const tools = catalogArray.map(entry => entry.name).sort();
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
  for (const key of ["sourceHash", "imageTag", "imageId", "buildStatus", "builtAt", "candidateStatus", "candidateImageId", "candidateToolCount", "candidateCatalogHash", "candidateValidatedAt", "candidateFailureCode", "candidateFailureMessage", "smokeStatus", "productionCatalogHash", "rollbackRequired", "deployStatus", "currentRelease", "deployedAt", "failures"]) delete next[key];
  return next;
}

function boundedAppend(current, chunk, limit = OUTPUT_LIMIT) {
  const next = current + chunk.toString("utf8");
  return next.length > limit ? next.slice(0, limit) : next;
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const outputLimit = options.outputLimit ?? OUTPUT_LIMIT;
    let stdout = ""; let stderr = ""; let truncated = false; let timedOut = false;
    child.stdout.on("data", (chunk) => { const before = stdout.length; stdout = boundedAppend(stdout, chunk, outputLimit); truncated ||= stdout.length === outputLimit && before < outputLimit; });
    child.stderr.on("data", (chunk) => { const before = stderr.length; stderr = boundedAppend(stderr, chunk, outputLimit); truncated ||= stderr.length === outputLimit && before < outputLimit; });
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
  // Usar git ls-files para enumerar arquivos trackeados (mais seguro)
  const tracked = await gitTrackedFiles(root);

  // Filtrar para manter apenas arquivos no diretório especificado (se directory !== root)
  if (directory !== root) {
    const prefix = path.relative(root, directory).replaceAll(path.sep, "/") + "/";
    return tracked.filter(file => file.relative.startsWith(prefix));
  }

  return tracked;
}

async function calculateSourceHash(root) {
  const hash = createHash("sha256");
  for (const file of await sourceFiles(root)) { hash.update(file.relative).update("\0").update(await readFile(file.absolute)).update("\0"); }
  return hash.digest("hex");
}

// SUITE-SKIP-01: timeout do stage test configurável via env, clampado a [300s, 900s]; default 600s (baseline da suíte ≈ 239s).
function testTimeoutMs() {
  const requested = Number(process.env.ENG_MCP_RELEASE_TEST_TIMEOUT_MS);
  if (!Number.isFinite(requested) || requested <= 0) return 600_000;
  return Math.min(900_000, Math.max(300_000, Math.trunc(requested)));
}

// SUITE-SKIP-01: hash dos insumos reais da suíte direto do FS — cobre untracked
// (calculateSourceHash é tracked-only, via git ls-files). Qualquer mudança em
// test/, src/, scripts/ ou nos manifests raiz invalida o skip da suíte.
async function calculateSuiteInputsHash(root) {
  const hash = createHash("sha256");
  for (const directory of ["scripts", "src", "test"]) await hashTree(root, directory, hash);
  hash.update(await readFile(path.join(root, "package.json")));
  hash.update(await readFile(path.join(root, "package-lock.json")));
  return hash.digest("hex");
}

async function hashTree(root, directory, hash) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name === "node_modules") continue;
    if (entry.isDirectory()) {
      await hashTree(root, `${directory}/${entry.name}`, hash);
      continue;
    }
    if (!entry.isFile()) continue;
    hash.update(`${directory}/${entry.name}`).update("\0").update(await readFile(path.join(root, directory, entry.name))).update("\0");
  }
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
  // Usar canonicalSource diretamente para localizar tools.ts
  // repositoryRoot pode ser pai de canonicalSource (ex: /opt/memoryos vs /opt/memoryos/eng-mcp)
  const canonicalSource = path.resolve(config.canonicalSource);
  const toolsPath = path.join(canonicalSource, "src/tools.ts");
  const toolsSource = await readFile(toolsPath, "utf8");

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
    const suite = await runProcess("docker", ["run", "--rm", "-v", `${path.join(worktreePath, "scripts")}:/app/scripts:ro`, testImageId, "node", "--test", "--test-force-exit", "test/*.test.ts"], { timeoutMs: testTimeoutMs() });
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

async function getRepositoryRoot(config) {
  return resolveRepositoryRoot(config);
}

// RELEASE-TEST-DIAGNOSTICS-04: extração de failures reais do TAP para o
// release-state.json — mesma forma/limites do contrato oficial (src/tools.ts:
// failures[{test,file?,message?}], máximo de 20, mensagem <=300) e a MESMA porta
// de sanitização já existente neste script (assertStateSafe): nada é inventado,
// campo sensível vira "[REDACTED]" (nome) ou é omitido (file/message).
const RELEASE_TEST_FAILURES_LIMIT = 20;
const RELEASE_TEST_FAILURE_MESSAGE_LIMIT = 300;

function releaseTestSafeField(value) {
  try { assertStateSafe({ field: value }); return value; } catch { return undefined; }
}

function extractReleaseTestFailures(evidence) {
  return evidence.split(/^[ \t]*not ok \d+ - /m).slice(1).slice(0, RELEASE_TEST_FAILURES_LIMIT).map((block) => {
    const failure = { test: releaseTestSafeField(block.split("\n")[0].trim()) ?? "[REDACTED]" };
    const file = /(?:file|location):\s*'([^']+)'/m.exec(block) ?? /([A-Za-z0-9_./-]+\.test\.ts)/.exec(block);
    const safeFile = file === null ? undefined : releaseTestSafeField(file[1].replace(/:\d+(?::\d+)?$/, ""));
    if (safeFile !== undefined) failure.file = safeFile;
    // STORE-MIG-01: o TAP emite `error: |-` (bloco multilinha) quando a mensagem
    // tem quebra de linha — a captura single-quoted perdia a mensagem inteira.
    // Fallback: quando assertStateSafe recusa a mensagem crua (conteúdo sensível),
    // aplica o sanitizador de smoke (redação por padrão + hash hex longo) em vez
    // de descartar — o gate segue sem valor cru, mas o diagnóstico sobrevive.
    const message = /error:\s*'([^'\n]+)/.exec(block) ?? /error:\s*\|[+-]?\s*\n\s+([^\n]+)/.exec(block);
    let safeMessage = message === null ? undefined : releaseTestSafeField(message[1].trim().slice(0, RELEASE_TEST_FAILURE_MESSAGE_LIMIT));
    if (safeMessage === undefined && message !== null) {
      const redacted = sanitizeSmokeFailureMessage(message[1].trim().slice(0, RELEASE_TEST_FAILURE_MESSAGE_LIMIT));
      const hardened = redacted === null ? null : redacted.replace(/[A-Fa-f0-9]{32,}/g, "[REDACTED]");
      safeMessage = hardened === null ? undefined : releaseTestSafeField(hardened);
    }
    if (safeMessage !== undefined) failure.message = safeMessage;
    return failure;
  });
}

// Modificar testAction para usar canonicalSource como build context
async function testAction(config) {
  const canonicalSource = path.resolve(config.canonicalSource);
  await access(canonicalSource);
  const sourceHash = await calculateSourceHash(canonicalSource);
  // SUITE-SKIP-01: a suíte completa custa ~4min — skipa quando o MESMO conjunto
  // de insumos (tracked + untracked + manifests) já tem PASS registrado e a
  // árvore TRACKED dos insumos está limpa (--untracked-files=no — os untracked permanentes
  // de backup/credencial já entram no suiteInputsHash). State intocado (testedAt original mantido).
  const suiteInputsHash = await calculateSuiteInputsHash(canonicalSource);
  const previous = await loadState(config);
  const dirtyInputs = (await runProcess("git", ["-C", canonicalSource, "status", "--porcelain", "--untracked-files=no", "--", "test", "src", "scripts"])).stdout.trim();
  if (previous.testStatus === "PASS" && previous.testSourceHash === sourceHash && previous.testSuiteInputsHash === suiteInputsHash && dirtyInputs === "") {
    console.error("[release] TEST SKIPPED: PASS already recorded for identical suite inputs (sourceHash=%s suiteInputsHash=%s)", sourceHash.slice(0, 12), suiteInputsHash.slice(0, 12));
    return previous;
  }
  const catalog = await expectedCatalog(config);
  const diff = await runProcess("git", ["-C", canonicalSource, "diff", "--check"]);
  if (diff.exitCode !== 0) throw new Error(`DIFF_CHECK_FAILED:${diff.stderr || diff.stdout}`);
  await whitespaceCheck(canonicalSource);
  const built = await mustRun("docker", ["build", "-q", canonicalSource], { timeoutMs: 600_000 });
  const testImageId = built.stdout.trim().split(/\s+/).at(-1);
  if (!/^sha256:[a-f0-9]{64}$/.test(testImageId)) throw new Error("TEST_IMAGE_ID_INVALID");
  // STORE-MIG-01: capture o TAP INTEIRO (cap antigo de 256 KB truncava o fim, onde
  // moram o sumário e as falhas tardias — o gate ficava FAIL com counters 0/0/-1).
  const suite = await runProcess("docker", ["run", "--rm", "-v", `${path.join(canonicalSource, "scripts")}:/app/scripts:ro`, testImageId, "npm", "test"], { timeoutMs: testTimeoutMs(), outputLimit: TEST_OUTPUT_LIMIT });
  const tests = Number(/^.*\btests (\d+)\s*$/m.exec(suite.stdout)?.[1] ?? 0);
  const passed = Number(/^.*\bpass (\d+)\s*$/m.exec(suite.stdout)?.[1] ?? 0);
  const failed = Number(/^.*\bfail (\d+)\s*$/m.exec(suite.stdout)?.[1] ?? -1);
  const state = { ...invalidateDownstreamState(await loadState(config)), testStatus: suite.exitCode === 0 && failed === 0 ? "PASS" : "FAIL", testSourceHash: sourceHash, testSuiteInputsHash: suiteInputsHash, testImageId, tests, passed, failed, expectedToolCount: catalog.count, expectedTools: catalog.tools, testedAt: new Date().toISOString() };
  await saveState(config, state);
  if (state.testStatus !== "PASS") {
    // RELEASE-TEST-DIAGNOSTICS-04: extrai os failures reais do TAP, aplica a
    // sanitização existente e persiste failures no release-state.json pelo
    // saveState já existente, com conteúdo limitado, antes de propagar o erro
    // oficial TESTS_FAILED intacto para o runner.
    const marker = "TESTS_FAILED:";
    const tapPresent = /^[ \t]*not ok \d+ - /m;
    const rawEvidence = tapPresent.test(suite.stdout) ? suite.stdout : tapPresent.test(suite.stderr) ? suite.stderr : (suite.stderr || suite.stdout || "");
    const evidence = rawEvidence.includes(marker) ? rawEvidence.slice(rawEvidence.indexOf(marker) + marker.length) : rawEvidence;
    const failures = extractReleaseTestFailures(evidence);
    await saveState(config, { ...state, failures });
    // STORE-MIG-01: embuta o RABO do TAP (sumário + falhas tardias) — stderr-first
    // escondia o stdout inteiro e o cap de 128 KB do runner só consegue relayar o rabo.
    const tailEvidence = evidence.length > RELEASE_TEST_EVIDENCE_TAIL ? evidence.slice(-RELEASE_TEST_EVIDENCE_TAIL) : evidence;
    throw new Error(`TESTS_FAILED:${tailEvidence}`);
  }
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

// SFFF-02 CANDIDATE FAILURE FORENSICS: persist a sanitized failure code + message (cause chain
// walked like isTransientSmokeError) to the official release-state so a candidate failure is
// diagnosable without runner-shell access. Gates and control flow untouched; values are
// redacted by sanitizeSmokeFailureMessage and assertStateSafe still guards every save.
function candidateFailureTelemetry(error) {
  if (!error) return { candidateFailureCode: null, candidateFailureMessage: null };
  const parts = [];
  let current = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (typeof current === "string") { parts.push(current); break; }
    if (typeof current.code === "string" && current.code) parts.push(current.code);
    if (typeof current.message === "string" && current.message) parts.push(current.message);
    current = current.cause ?? null;
  }
  const text = parts.join(" | ");
  const rawMessage = typeof error.message === "string" ? error.message : String(error);
  let code = (error && typeof error.code === "string" && error.code) ? error.code : null;
  if (!code) code = (rawMessage.match(/^[A-Z][A-Z0-9_]{4,}/) ?? [null])[0];
  if (!code) code = parts.find((part) => /^[A-Z][A-Z0-9_]{4,}$/.test(part)) ?? null;
  return { candidateFailureCode: code ?? "CANDIDATE_FAILURE_UNKNOWN", candidateFailureMessage: sanitizeSmokeFailureMessage(text) ?? null };
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
  await writeFile(path.join(fixture, "app.test.ts"), "import { test } from \"node:test\";\nimport { strict as assert } from \"node:assert\";\nimport { candidate } from \"./app.ts\";\n\ntest(\"candidate fixture app contract\", () => {\n  assert.equal(typeof candidate, \"string\");\n  assert.equal(candidate, \"before\");\n});\n"); await mustRun("git", ["add", "app.test.ts"], { cwd: fixture }); await mustRun("git", ["commit", "-m", "candidate fixture test"], { cwd: fixture });
  await symlink("/app/node_modules", path.join(fixture, "node_modules"));
  const statusBefore = (await mustRun("git", ["status", "--porcelain=v2", "--untracked-files=all"], { cwd: fixture })).stdout;
  const refsBefore = (await mustRun("git", ["show-ref"], { cwd: fixture })).stdout;
  const registryBefore = createHash("sha256").update(await readFile(path.join(data, "tokens.json"))).digest("hex");
  try {
    await mustRun("docker", ["run", "-d", "--name", name, "--network", "host", "--restart", "no", "-v", `${fixture}:/fixture`, "-v", `${data}:/candidate-data`, "-e", "ENG_MCP_REPOSITORY_ROOT=/fixture", "-e", "ENG_MCP_REPOSITORY_ID=candidate", "-e", "ENG_MCP_TOKEN_REGISTRY_FILE=/candidate-data/tokens.json", "-e", "ENG_MCP_HOST=127.0.0.1", "-e", `ENG_MCP_PORT=${config.candidate.port}`, ...(process.env.ENG_MCP_RUNTIME_OBSERVABILITY_CREDENTIAL_FILE ? ["-v", `${process.env.ENG_MCP_RUNTIME_OBSERVABILITY_CREDENTIAL_FILE}:/run/secrets/runtime-observability-secret:ro`, "-e", "ENG_MCP_RUNTIME_OBSERVABILITY_CREDENTIAL_FILE=/run/secrets/runtime-observability-secret"] : []), ...(process.env.MCP_BATCH_EXECUTE_CREDENTIAL_FILE ? ["-v", `${process.env.MCP_BATCH_EXECUTE_CREDENTIAL_FILE}:/run/secrets/mcp-batch-execute-secret:ro`, "-e", "MCP_BATCH_EXECUTE_CREDENTIAL_FILE=/run/secrets/mcp-batch-execute-secret", "-e", "ENG_MCP_SUPERVISED_MISSION_CREDENTIAL_FILE=/run/secrets/mcp-batch-execute-secret"] : []), ...(process.env.ENG_MCP_AGENT_MEMORY_CREDENTIAL_FILE ? ["-v", `${process.env.ENG_MCP_AGENT_MEMORY_CREDENTIAL_FILE}:/run/secrets/agent-memory-secret:ro`, "-e", "ENG_MCP_AGENT_MEMORY_CREDENTIAL_FILE=/run/secrets/agent-memory-secret"] : []), state.imageTag]);
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
      { mode: "file", path: "app.test.ts" }
    ];
    for (const [index, argumentsValue] of testProfiles.entries()) {
      const executed = await mcp(endpoint, bearer, 30 + index, "tools/call", { name: "engineering.test.run", arguments: argumentsValue });
      if (executed.result.isError) {
        const errorText = executed.result.content[0]?.text || "NO_ERROR_CONTENT";
        console.error("CANDIDATE_TEST_RUN_CALL_FAILED_DETAIL:", errorText);
        throw new Error(`CANDIDATE_TEST_RUN_CALL_FAILED: ${errorText}`);
      }
      const outcome = JSON.parse(executed.result.content[0].text);
      if (outcome.status !== "PASS" || outcome.exitCode !== 0) throw new Error(`CANDIDATE_TEST_RUN_FAILED: ${JSON.stringify(outcome).slice(0, 500)}`);
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
    await saveState(config, { ...state, candidateStatus: "FAIL", candidateValidatedAt: new Date().toISOString(), ...candidateFailureTelemetry(error) }); throw error;
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

// ERF-01 RELEASE SMOKE GRACE WINDOW: short deterministic retry for TRANSIENT transport failures
// right after the production container swap (HTTP 502/503/504, connection refused/reset,
// temporary network unavailability). It exists ONLY to wait for gateway propagation.
// Functional failures (auth, catalog, schema, tool count, health) must keep failing fast - never retried.
export const SMOKE_TRANSIENT_RETRY_MAX_ATTEMPTS = 8;
export const SMOKE_TRANSIENT_RETRY_BACKOFF_MS = Object.freeze([1000, 2000, 3000, 4000, 5000, 6000, 7000]);
export const SMOKE_TRANSIENT_RETRY_DEADLINE_MS = 30000;
const SMOKE_TRANSIENT_STATUS_PATTERN = /(?:MCP_HTTP|SMOKE_UNAUTH_HTTP)_5(?:02|03|04)\b/;
const SMOKE_TRANSIENT_NETWORK_PATTERN = /ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|ENETDOWN|ETIMEDOUT|EAI_AGAIN|UND_ERR_CONNECT_TIMEOUT|temporary failure/i;
const smokeSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let smokeTelemetrySink = null;

export function isTransientSmokeError(error) {
  if (!error) return false;
  const parts = [];
  let current = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (typeof current === "string") { parts.push(current); break; }
    if (typeof current.message === "string") parts.push(current.message);
    if (typeof current.code === "string") parts.push(current.code);
    current = current.cause ?? null;
  }
  const text = parts.join(" | ");
  return SMOKE_TRANSIENT_STATUS_PATTERN.test(text) || SMOKE_TRANSIENT_NETWORK_PATTERN.test(text);
}

// SFFF-01 SMOKE FUNCTIONAL FAILURE FORENSICS: minimal failure telemetry persisted to the official release-state.
// Captures the failing smoke step, a stable failure code and a SANITIZED message (no secrets, no stack, no payload).
// Rollback semantics untouched: deployAction keeps saveState(failed) + rollbackAction exactly as before.
export const SMOKE_FAILURE_STEP_BY_CODE = Object.freeze([
  [/^PRODUCTION_NOT_RUNNING/, "production"],
  [/^SMOKE_RELEASE_RUNNER_/, "runner-service"],
  [/^SMOKE_UNAUTH_/, "unauth-probe"],
  [/^SMOKE_BEARER_/, "unauth-probe"],
  [/^TOOL_CATALOG_MISMATCH/, "tools-list"],
  [/^REQUIRED_TOOL_MISSING/, "tools-list"],
  [/^SMOKE_CATALOG_/, "catalog-validation"],
  [/^SMOKE_TEST_RUN_/, "test-run"],
  [/^SMOKE_READ_FAILED/, "read"],
  // CONTRACT-01: the live judge contract probe (smokeAction step 7) fails with
  // SMOKE_JUDGE_* codes; forensics must name the step, like every other smoke gate.
  [/^SMOKE_JUDGE_/, "judge-contract"],
]);

export function sanitizeSmokeFailureMessage(value) {
  if (value === null || value === undefined) return null;
  let text = typeof value === "string" ? value : String(value);
  text = text.replace(/\s+/g, " ").trim();
  text = text.replace(/(Bearer\s+|Authorization\s*[:=]\s*|api[_-]?key\s*[:=]\s*|token\s*[:=]\s*|secret\s*[:=]\s*|credential\s*[:=]\s*|password\s*[:=]\s*)\S+/gi, "$1[REDACTED]");
  return text.length > 200 ? text.slice(0, 197) + "..." : text;
}

export function deriveSmokeFailure(error) {
  if (!error) return { step: null, code: null, message: null };
  const rawMessage = typeof error.message === "string" ? error.message : String(error);
  const code = (error && typeof error.code === "string" && error.code)
    ? error.code
    : ((rawMessage.match(/^SMOKE_[A-Z0-9_]+/) ?? rawMessage.match(/^[A-Z][A-Z0-9_]{4,}/) ?? [null])[0] ?? "SMOKE_FAILURE_UNKNOWN");
  const match = SMOKE_FAILURE_STEP_BY_CODE.find(([pattern]) => pattern.test(code));
  return { step: match ? match[1] : null, code, message: sanitizeSmokeFailureMessage(rawMessage) };
}

export function markSmokeFailure(state, step, error) {
  const derived = deriveSmokeFailure(error);
  state.smokeFailedStep = step ?? derived.step ?? null;
  state.smokeFailureCode = derived.code ?? null;
  state.smokeFailureMessage = derived.message ?? null;
  return state;
}

export async function smokeTransientRetry(label, operation, options = {}) {
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? SMOKE_TRANSIENT_RETRY_MAX_ATTEMPTS));
  const backoffMs = Array.isArray(options.backoffMs) && options.backoffMs.length > 0 ? options.backoffMs : SMOKE_TRANSIENT_RETRY_BACKOFF_MS;
  const graceDeadlineMs = Math.max(0, Math.floor(options.graceDeadlineMs ?? SMOKE_TRANSIENT_RETRY_DEADLINE_MS));
  const delayFn = options.delayFn ?? smokeSleep;
  const log = options.log ?? ((line) => console.error(line));
  const now = options.nowFn ?? (() => Date.now());
  const telemetry = options.telemetry ?? smokeTelemetrySink;
  const startedAt = now();
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt > 1) {
      const waitMs = backoffMs[Math.min(attempt - 2, backoffMs.length - 1)] ?? 0;
      if (now() - startedAt + waitMs > graceDeadlineMs) break;
      log(`smokeTransientRetry: label=${label} attempt=${attempt} waitMs=${waitMs}`);
      await delayFn(waitMs);
    }
    try {
      const result = await operation();
      if (telemetry && attempt > 1 && telemetry.smokeRecoveredOnAttempt === null) telemetry.smokeRecoveredOnAttempt = attempt;
      return result;
    } catch (error) {
      lastError = error;
      if (!isTransientSmokeError(error)) {
        if (telemetry && !telemetry.smokeFailedStep) markSmokeFailure(telemetry, label, error);
        throw error;
      }
      if (telemetry) {
        telemetry.smokeTransientRetries = (telemetry.smokeTransientRetries ?? 0) + 1;
        const code = (error && typeof error.code === "string" && error.code) ? error.code : ((error && typeof error.message === "string") ? error.message : String(error));
        if (Array.isArray(telemetry.smokeTransientCodes) && !telemetry.smokeTransientCodes.includes(code)) telemetry.smokeTransientCodes.push(code);
      }
      log(`smokeTransientRetry: label=${label} attempt=${attempt} transient=${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw lastError;
}

async function smokeAction(config) {
  const state = await loadState(config); const production = await productionInspect(config);
  state.smokeTransientRetries = 0;
  state.smokeTransientCodes = [];
  state.smokeRecoveredOnAttempt = null;
  state.smokeFailedStep = null;
  state.smokeFailureCode = null;
  state.smokeFailureMessage = null;
  smokeTelemetrySink = state;
  if (!production.running) throw new Error("PRODUCTION_NOT_RUNNING");

  // 1. Validate runner mount presence
  validateRunnerMount(production.mounts, config.production.runnerMount);

  const unauth = await smokeTransientRetry("unauth-probe", async () => {
    const response = await fetch(config.production.endpoint, { method: "POST" });
    if (response.status === 401) return response;
    throw new Error(`SMOKE_UNAUTH_HTTP_${response.status}`);
  });
  if (unauth.status !== 401) throw new Error("SMOKE_UNAUTH_INVALID");
  const bearer = process.env.ENG_MCP_RELEASE_BEARER;
  if (!bearer) throw new Error("SMOKE_BEARER_REQUIRED");
  await smokeTransientRetry("initialize", () => mcp(config.production.endpoint, bearer, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "release-smoke", version: "1" } }));

  // 2. Validate tool catalog convergence (already includes catalog version, tool count, required tools)
  const listed = await smokeTransientRetry("tools-list", () => mcp(config.production.endpoint, bearer, 2, "tools/list", {}));
  const names = listed.result.tools.map((tool) => tool.name);
  validateToolCatalog(names, state.expectedTools, config.requiredTools);

  // 3. Validate catalog operational integrity
  const catalogCall = await smokeTransientRetry("catalog-call", () => mcp(config.production.endpoint, bearer, 20, "tools/call", { name: "engineering.mcp.catalog", arguments: {} })); if (catalogCall.result.isError) throw new Error("SMOKE_CATALOG_CALL_FAILED");
  const repeatedCatalogCall = await smokeTransientRetry("catalog-call-repeat", () => mcp(config.production.endpoint, bearer, 21, "tools/call", { name: "engineering.mcp.catalog", arguments: {} })); if (repeatedCatalogCall.result.isError) throw new Error("SMOKE_CATALOG_CALL_FAILED");
  const operationalCatalog = JSON.parse(catalogCall.result.content[0].text); const repeatedCatalog = JSON.parse(repeatedCatalogCall.result.content[0].text);
  const productionCatalogHash = validateOperationalCatalog(operationalCatalog, names); if (repeatedCatalog.catalogHash !== productionCatalogHash) throw new Error("SMOKE_CATALOG_NONDETERMINISTIC");

  // 4. Validate the actual host release runner service.
  // engineering.server.release.inspect is not part of the current 42-tool catalog.
  const runnerService = await mustRun("systemctl", [
    "show",
    "eng-mcp-release-runner.service",
    "--property=ActiveState",
    "--property=SubState",
    "--property=NoNewPrivileges",
    "--property=ProtectSystem"
  ]);
  const runnerProperties = Object.fromEntries(
    runnerService.stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    })
  );
  if (
    runnerProperties.ActiveState !== "active" ||
    runnerProperties.SubState !== "running" ||
    runnerProperties.NoNewPrivileges !== "yes" ||
    runnerProperties.ProtectSystem !== "full"
  ) throw new Error("SMOKE_RELEASE_RUNNER_INVALID");

  // 6. Validate basic read capability
  const read = await smokeTransientRetry("read-call", () => mcp(config.production.endpoint, bearer, 3, "tools/call", { name: "engineering.repo.structure", arguments: { path: ".", maxDepth: 1, maxEntries: 20 } })); if (read.result.isError) throw new Error("SMOKE_READ_FAILED");

  // 7. CONTRACT-01 judge contract probe: one READ-ONLY live judge.verify call
  // against the REAL provider. The contract suite (test/contract-*.test.ts) runs
  // pre-deploy against golden envelopes recorded live (2026-09-21); this step
  // proves the DEPLOYED server still emits that exact shape — divergence fails
  // the deploy instead of surfacing as a runtime surprise. Functional failures
  // (isError, envelope violations) are never retried as transient; only the
  // transport grace window applies.
  const judgeCall = await smokeTransientRetry("judge-contract", () => mcp(config.production.endpoint, bearer, 7, "tools/call", { name: "engineering.judge.verify", arguments: SMOKE_JUDGE_ARGS }));
  if (judgeCall.result.isError) {
    const judgeErrorText = judgeCall.result.content[0]?.text || "NO_ERROR_CONTENT";
    throw new Error(`SMOKE_JUDGE_CALL_FAILED: ${sanitizeSmokeFailureMessage(judgeErrorText) ?? "REDACTED"}`);
  }
  const judgeEnvelope = JSON.parse(judgeCall.result.content[0].text);
  const judgeContract = validateJudgeVerifyEnvelope(judgeEnvelope);
  if (!judgeContract.ok) throw new Error(`SMOKE_JUDGE_ENVELOPE_INVALID: ${judgeContract.violations.join("; ").slice(0, 300)}`);

  // 8. Return convergence evidence
  const next = {
    ...state,
    smokeStatus: "PASS",
    rollbackRequired: false,
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
    releaseRunnerPartialFailures: 0,
    smokeJudgeStatus: judgeEnvelope.status,
    smokeJudgeModel: judgeEnvelope.provider.model,
    smokeJudgeLatencyMs: judgeEnvelope.provider.latencyMs,
    smokeJudgeCostUsd: judgeEnvelope.provider.cost
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

// SHIP-LOCK-01 camada 2 (runner-side, intencionalmente independente de
// src/shipLock.ts): o deploy recusa enquanto existir ship-phase lock no caminho
// de produção. SOMENTE o marker armed do próprio gate (lock escrito pela tool
// engineering.release.pipeline via gate) passa. Qualquer outra presença — ativa
// sem marker, expirada, ilegível — recusa nomeando holder + revoke path.
// Presença NUNCA permite: expiração nunca auto-libera. Audit metadata-only
// JSONL, fail-soft.
export const SHIP_LOCK_FILE_DEFAULT = "/opt/eng-mcp-release-data/production/ship.lock";

function shipLockSha16(text) {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

async function shipLockAudit(entry) {
  try {
    await appendFile(process.env.ENG_MCP_SHIP_LOCK_AUDIT_FILE ?? "/data/audit/ship-lock.jsonl", `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, "utf8");
  } catch {
    // fail-soft: problemas de audit nunca gateiam ou desgateiam um ship
  }
}

export async function classifyShipLock(lockPath, nowMs = Date.now()) {
  let raw;
  try {
    raw = await readFile(lockPath, "utf8");
  } catch {
    return { present: false, status: "absent", record: null, rawSha16: null };
  }
  const rawSha16 = shipLockSha16(raw);
  let record = null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) record = parsed;
  } catch {
    record = null;
  }
  if (!record) return { present: true, status: "unreadable", record: null, rawSha16 };
  const expiresAt = Date.parse(String(record.expiresAt ?? ""));
  if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) return { present: true, status: "expired", record, rawSha16 };
  return { present: true, status: "active", record, rawSha16 };
}

export async function assertNoShipLock({ lockPath = process.env.ENG_MCP_SHIP_LOCK_FILE ?? SHIP_LOCK_FILE_DEFAULT } = {}) {
  const view = await classifyShipLock(lockPath);
  if (!view.present) return { present: false, status: "absent", record: null, rawSha16: null };
  if (view.status === "active" && view.record?.pipelineArmed === true) return view;
  const revoke = `operator revoke path: rm ${lockPath}`;
  const holder = String(view.record?.holder ?? "unknown");
  if (view.status === "expired") {
    await shipLockAudit({ event: "refuse", tool: "deploy", reason: "SHIP_LOCK_EXPIRED", holderHash16: shipLockSha16(String(view.record?.holder ?? "unknown")) });
    throw new Error(`SHIP_LOCK_EXPIRED: ship lock at ${lockPath} held by holder=${holder} is expired; presence never grants and expiry never auto-releases; ${revoke}`);
  }
  if (view.status === "unreadable") {
    await shipLockAudit({ event: "refuse", tool: "deploy", reason: "SHIP_LOCK_UNREADABLE", holderHash16: null });
    throw new Error(`SHIP_LOCK_UNREADABLE: ship lock at ${lockPath} is not a valid lock record; presence never grants; ${revoke}`);
  }
  await shipLockAudit({ event: "refuse", tool: "deploy", reason: "SHIP_LOCK_ACTIVE", holderHash16: shipLockSha16(String(view.record?.holder ?? "unknown")) });
  const acquiredAt = Date.parse(String(view.record?.acquiredAt ?? ""));
  const ageMs = Number.isFinite(acquiredAt) ? Math.max(0, Date.now() - acquiredAt) : 0;
  throw new Error(`SHIP_LOCK_ACTIVE: ship lock at ${lockPath} held by holder=${holder} mission=${view.record?.mission ?? null} ageMs=${ageMs}; one ship at a time; ${revoke}`);
}

export async function deployAction(config) {
  await assertNoShipLock(); // SHIP-LOCK-01 camada 2: PRIMEIRA ação — recusa enquanto existir ship lock
  smokeTelemetrySink = null;
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
    await mustRun("docker", ["run", "-d", "--name", p.containerName, "--network", p.network, "--restart", p.restart, "-v", p.repositoryMount, "-v", p.dataMount, "-v", p.runnerMount, ...(p.credentialsMount ? ["-v", p.credentialsMount] : []), "-e", `ENG_MCP_REPOSITORY_ROOT=${p.repositoryRoot}`, "-e", `ENG_MCP_REPOSITORY_ID=${p.repositoryId}`, "-e", `ENG_MCP_TOKEN_REGISTRY_FILE=${p.tokenRegistryFile}`, "-e", `ENG_MCP_HOST=${p.host}`, "-e", `ENG_MCP_PORT=${p.port}`, "-e", `ENG_MCP_DEPLOY_ENVIRONMENT_ID=${p.deployEnvironmentId}`, "-e", `ENG_MCP_DEPLOY_SERVER_ID=${p.deployServerId}`, ...(process.env.ENG_MCP_RUNTIME_OBSERVABILITY_CREDENTIAL_FILE ? ["-v", `${process.env.ENG_MCP_RUNTIME_OBSERVABILITY_CREDENTIAL_FILE}:/run/secrets/runtime-observability-secret:ro`, "-e", "ENG_MCP_RUNTIME_OBSERVABILITY_CREDENTIAL_FILE=/run/secrets/runtime-observability-secret"] : []), ...(process.env.MCP_BATCH_EXECUTE_CREDENTIAL_FILE ? ["-v", `${process.env.MCP_BATCH_EXECUTE_CREDENTIAL_FILE}:/run/secrets/mcp-batch-execute-secret:ro`, "-e", "MCP_BATCH_EXECUTE_CREDENTIAL_FILE=/run/secrets/mcp-batch-execute-secret", "-e", "ENG_MCP_SUPERVISED_MISSION_CREDENTIAL_FILE=/run/secrets/mcp-batch-execute-secret"] : []), ...(process.env.ENG_MCP_AGENT_MEMORY_CREDENTIAL_FILE ? ["-v", `${process.env.ENG_MCP_AGENT_MEMORY_CREDENTIAL_FILE}:/run/secrets/agent-memory-secret:ro`, "-e", "ENG_MCP_AGENT_MEMORY_CREDENTIAL_FILE=/run/secrets/agent-memory-secret"] : []), ...(process.env.ENG_MCP_RUNTIME_TOKEN_CREDENTIAL_FILE ? ["-v", `${process.env.ENG_MCP_RUNTIME_TOKEN_CREDENTIAL_FILE}:/run/secrets/runtime-token:ro`, "-e", "ENG_MCP_RUNTIME_TOKEN_CREDENTIAL_FILE=/run/secrets/runtime-token"] : []), ...(process.env.E2B_API_KEY_FILE ? ["-v", `${process.env.E2B_API_KEY_FILE}:/run/secrets/e2b-api-key:ro`, "-e", "E2B_API_KEY_FILE=/run/secrets/e2b-api-key"] : []), ...(process.env.GITHUB_TOKEN_FILE ? ["-v", `${process.env.GITHUB_TOKEN_FILE}:/run/secrets/github-pat:ro`, "-e", "GITHUB_TOKEN_FILE=/run/secrets/github-pat"] : []), ...(process.env.GIT_CREDENTIALS_FILE ? ["-v", `${process.env.GIT_CREDENTIALS_FILE}:/run/secrets/git-credentials:ro`, "-e", "GIT_CREDENTIALS_FILE=/run/secrets/git-credentials"] : []), ...(process.env.ENG_MCP_HERMES_NOTIFY_CREDENTIAL_FILE ? ["-v", `${process.env.ENG_MCP_HERMES_NOTIFY_CREDENTIAL_FILE}:/run/secrets/hermes-notify-api-key:ro`, "-e", "ENG_MCP_HERMES_NOTIFY_CREDENTIAL_FILE=/run/secrets/hermes-notify-api-key"] : []), ...(process.env.ENG_MCP_HERMES_SESSION_ID ? ["-e", `ENG_MCP_HERMES_SESSION_ID=${process.env.ENG_MCP_HERMES_SESSION_ID}`] : []), state.imageTag]);
    await waitForPort(p.port);
    state = { ...state, deployStatus: "PASS", currentRelease: state.imageTag, deployedAt: new Date().toISOString() }; await saveState(config, state);
    return await smokeAction(config);
  } catch (error) {
    const failed = smokeFailureTransition(state);
    if (smokeTelemetrySink) {
      failed.smokeTransientRetries = smokeTelemetrySink.smokeTransientRetries ?? 0;
      failed.smokeTransientCodes = smokeTelemetrySink.smokeTransientCodes ?? [];
      failed.smokeRecoveredOnAttempt = smokeTelemetrySink.smokeRecoveredOnAttempt ?? null;
      if (!smokeTelemetrySink.smokeFailedStep) markSmokeFailure(smokeTelemetrySink, null, error);
      failed.smokeFailedStep = smokeTelemetrySink.smokeFailedStep ?? null;
      failed.smokeFailureCode = smokeTelemetrySink.smokeFailureCode ?? null;
      failed.smokeFailureMessage = smokeTelemetrySink.smokeFailureMessage ?? null;
    } else {
      const fallback = deriveSmokeFailure(error);
      failed.smokeFailedStep = fallback.step ?? null;
      failed.smokeFailureCode = fallback.code ?? null;
      failed.smokeFailureMessage = fallback.message ?? null;
    }
    await saveState(config, failed); await rollbackAction(config); throw error;
  }
}

export function sanitizeSecrets(value) {
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
export function parseSystemctlShow(stdout) {
  // Pure parser for `systemctl show --property=...` output: "Key=Value" lines,
  // the first "=" separates key from value (later "="s belong to the value);
  // lines without "=" or with an empty key are skipped; a repeated key keeps
  // its LAST value. Returns {} for empty/absent input instead of throwing.
  return String(stdout ?? "").trim().split("\n").reduce((obj, line) => {
    const eq = line.indexOf("=");
    if (eq > 0) {
      const key = line.slice(0, eq);
      const value = line.slice(eq + 1);
      obj[key] = value;
    }
    return obj;
  }, {});
}

async function inspectAction(config) {
  const SERVICE_NAME = "eng-mcp-release-runner.service";
  const response = {
    service: { name: SERVICE_NAME },
    process: null,
    directives: null,
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
      "--property=ActiveState,SubState,MainPID,ExecStart,WorkingDirectory,User,Group,FragmentPath,EnvironmentFiles,LoadCredential,Restart,SuccessExitStatus,RestartForceExitStatus,NoNewPrivileges,ProtectSystem"
    ]);

    const serviceProps = parseSystemctlShow(serviceResult.stdout);

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

    // ITEM-3: effective unit directives (systemctl show merges the operator
    // drop-in; this is the ground truth the restart prechecks rely on).
    response.directives = {
      restart: serviceProps.Restart || null,
      successExitStatus: String(serviceProps.SuccessExitStatus ?? "").split(/\s+/).filter(Boolean),
      restartForceExitStatus: String(serviceProps.RestartForceExitStatus ?? "").split(/\s+/).filter(Boolean),
      noNewPrivileges: serviceProps.NoNewPrivileges || null,
      protectSystem: serviceProps.ProtectSystem || null
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

    // ITEM-3: real docker inventory (docker ps -a, fixed columns). Every field
    // passes sanitizeSecrets before it leaves the host; docker being absent or
    // failing is a partial failure, never a fake empty inventory.
    try {
      const dockerResult = await mustRun("docker", ["ps", "-a", "--format", "{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}"]);
      response.docker = String(dockerResult.stdout ?? "").trim().split("\n").filter(Boolean).map((line) => {
        const parts = line.split("|");
        return {
          names: sanitizeSecrets(parts[0]),
          image: sanitizeSecrets(parts[1]),
          status: sanitizeSecrets(parts[2]),
          ports: sanitizeSecrets(parts.slice(3).join("|"))
        };
      });
      response.dockerInspection = "inventory";
    } catch (error) {
      response.docker = [];
      response.dockerInspection = "unavailable";
      response.partialFailures.push({ section: "docker", error: sanitizeSecrets(error.message) });
    }

    // Recent logs
    try {
      const logsResult = await mustRun("journalctl", [
        "-u", SERVICE_NAME,
        "--no-pager",
        "--since", "1 day ago",
        "-n", "200"
      ]);
      response.recentLogs = logsResult.stdout.split("\n").slice(0, 200).map(line => sanitizeSecrets(line));
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

// ---------------------------------------------------------------------------
// ITEM-2: one-off container probe (eng-mcp-candidate images, LOCAL ONLY).
//
// Structural command allowlist — the "command that cannot be expressed" principle:
// no caller ever supplies a command, entrypoint, argv or shell string. The caller
// supplies ONLY {image, probe, path, maxBytes}; the docker argv below is fully
// determined by the frozen PROBE_SPECS table plus the structural PROBE_ISOLATION
// flags. The image must be a LOCAL eng-mcp-candidate:* tag (docker image inspect
// pre-flight; docker run never pulls). The path is a restricted absolute-path
// grammar with a sensitive-path denylist. Every output field passes
// sanitizeSecrets; the audit trail (probes.jsonl, last 50 entries) lives next to
// the release state file. Zero mutation outside the disposable container.
// ---------------------------------------------------------------------------

export const PROBE_IMAGE_PREFIXES = Object.freeze(["eng-mcp-candidate:"]);
const PROBE_IMAGE_REST = /^[A-Za-z0-9._:-]{1,200}$/;
const PROBE_PATH_GRAMMAR = /^\/[A-Za-z0-9._/@+-]{1,256}$/;
const PROBE_PATH_DENYLIST_SEGMENTS = Object.freeze([".env", ".npmrc", ".ssh", ".aws", ".gnupg", ".netrc", ".git-credentials", "id_rsa", "id_ed25519", "id_ecdsa", "credentials"]);
const PROBE_PATH_DENYLIST_SUBSTRING = /token|secret|password|credential/i;
const PROBE_TIMEOUT_MS = 30_000;
const PROBE_SUBCOMMAND_TIMEOUT_MS = 10_000;
const PROBES_LOG_KEEP = 50;
// Structural isolation (fixed order, never caller-supplied): auto-remove, no
// network, read-only rootfs, non-root nobody, no capabilities, no privilege
// escalation, hard memory/pids ceilings.
export const PROBE_ISOLATION = Object.freeze([
  "--rm", "--network", "none", "--read-only", "--user", "65534:65534",
  "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
  "--memory", "256m", "--pids-limit", "64"
]);
// probe -> { entrypoint, argsFor }. Full argv = ["run", ...PROBE_ISOLATION,
// "--name", mcp-probe-<8hex>, "--entrypoint", entrypoint, image, ...argsFor] —
// nothing caller-controlled reaches docker beyond the validated image/path/maxBytes.
export const PROBE_SPECS = Object.freeze({
  file_stat: { entrypoint: "ls", argsFor: (target) => ["-ld", "--", target.path] },
  read_text: { entrypoint: "head", argsFor: (target) => ["-c", String(target.maxBytes), "--", target.path] },
  list_dir: { entrypoint: "ls", argsFor: (target) => ["-la", "--", target.path] }
});

export function validateContainerProbeParams(requested) {
  const probe = requested?.probe;
  if (typeof probe !== "string" || !Object.hasOwn(PROBE_SPECS, probe)) throw new Error(`PROBE_NOT_ALLOWLISTED:${String(probe ?? "").slice(0, 40)}`);
  const image = requested?.image;
  if (typeof image !== "string" || image.length === 0 || image.length > 220) throw new Error("PROBE_PARAM_INVALID:image");
  const prefix = PROBE_IMAGE_PREFIXES.find((candidate) => image.startsWith(candidate));
  if (prefix === undefined) throw new Error(`PROBE_TARGET_NOT_ALLOWLISTED:${sanitizeSecrets(image.slice(0, 80))}`);
  if (!PROBE_IMAGE_REST.test(image.slice(prefix.length))) throw new Error("PROBE_PARAM_INVALID:image");
  const targetPath = requested?.path;
  if (typeof targetPath !== "string" || !PROBE_PATH_GRAMMAR.test(targetPath) || targetPath.includes("..")) throw new Error("PROBE_PARAM_INVALID:path");
  if (targetPath.split("/").some((segment) => PROBE_PATH_DENYLIST_SEGMENTS.includes(segment)) || PROBE_PATH_DENYLIST_SUBSTRING.test(targetPath)) throw new Error(`PROBE_SENSITIVE_PATH_DENIED:${targetPath.slice(0, 80)}`);
  let maxBytes;
  if (probe === "read_text") {
    maxBytes = requested?.maxBytes === undefined ? 4_096 : Number(requested?.maxBytes);
    if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 4_096) throw new Error("PROBE_PARAM_INVALID:maxBytes");
  } else if (requested?.maxBytes !== undefined) {
    throw new Error("PROBE_PARAM_INVALID:maxBytes");
  }
  return { image, probe, path: targetPath, maxBytes };
}

async function probeContainerRemoved(name) {
  try {
    const listing = await runProcess("docker", ["ps", "-a", "--filter", `name=^${name}$`, "--format", "{{.Names}}"], { timeoutMs: PROBE_SUBCOMMAND_TIMEOUT_MS });
    return !listing.timedOut && listing.stdout.trim().length === 0;
  } catch { return false; }
}

async function cleanupProbeContainer(name) {
  try { await mustRun("docker", ["rm", "-f", name], { timeoutMs: PROBE_SUBCOMMAND_TIMEOUT_MS }); } catch { /* fall through to the independent ps verification */ }
  return probeContainerRemoved(name);
}

async function appendProbeLog(config, record) {
  try {
    const logPath = path.join(path.dirname(config.stateFile), "probes.jsonl");
    let lines = [];
    try { lines = (await readFile(logPath, "utf8")).split("\n").filter(Boolean); } catch { /* fresh log */ }
    lines.push(JSON.stringify(record));
    const kept = lines.slice(-PROBES_LOG_KEEP);
    const temporary = `${logPath}.${process.pid}.tmp`;
    await writeFile(temporary, kept.length > 0 ? `${kept.join("\n")}\n` : "", { mode: 0o600 });
    await rename(temporary, logPath);
    return { file: "probes.jsonl", retained: kept.length };
  } catch { return { file: "probes.jsonl", retained: null }; }
}

async function containerProbeAction(config) {
  const requested = {
    image: process.env.ENG_MCP_PROBE_IMAGE,
    probe: process.env.ENG_MCP_PROBE_PROBE,
    path: process.env.ENG_MCP_PROBE_PATH,
    maxBytes: process.env.ENG_MCP_PROBE_MAXBYTES === undefined ? undefined : Number(process.env.ENG_MCP_PROBE_MAXBYTES)
  };
  const params = validateContainerProbeParams(requested);
  const started = Date.now();
  // LOCAL-ONLY pre-flight: the image must already exist on the host. The docker
  // run below can never pull — a missing image is PROBE_TARGET_NOT_LOCAL, not a
  // download. Only {{.Id}} is requested — {{join .RepoDigests ","}} breaks on docker
  // versions that type RepoDigests as []interface{} (template execution error).
  let imageEvidence = null;
  try {
    const inspected = await mustRun("docker", ["image", "inspect", "--format", "{{.Id}}", params.image], { timeoutMs: PROBE_SUBCOMMAND_TIMEOUT_MS });
    imageEvidence = { imageId: sanitizeSecrets((inspected.stdout ?? "").trim().split("\n")[0] ?? ""), repoDigests: "" };
  } catch (error) {
    if (String(error.message).startsWith("RELEASE_COMMAND_FAILED:")) throw new Error(`PROBE_TARGET_NOT_LOCAL:${sanitizeSecrets(params.image)}:${sanitizeSecrets(String(error.message).replace(/^RELEASE_COMMAND_FAILED:docker:/, "").trim().slice(0, 200)) || "(docker stderr vazio)"}`);
    throw error;
  }
  const spec = PROBE_SPECS[params.probe];
  const containerName = `mcp-probe-${randomBytes(4).toString("hex")}`;
  const argv = ["run", ...PROBE_ISOLATION, "--name", containerName, "--entrypoint", spec.entrypoint, params.image, ...spec.argsFor(params)];
  const outcome = await runProcess("docker", argv, { timeoutMs: PROBE_TIMEOUT_MS });
  let cleanupVerified = true;
  if (outcome.timedOut) cleanupVerified = await cleanupProbeContainer(containerName);
  const stdout = sanitizeSecrets(outcome.stdout ?? "");
  const stderr = sanitizeSecrets(outcome.stderr ?? "");
  // Binary content is refused, not surfaced: U+FFFD in the decoded stdout means
  // the target is not decodable text (read_text only). The run's other evidence
  // (exit code, cleanup, timing) is still reported honestly.
  const binaryRefused = params.probe === "read_text" && stdout.includes("�");
  const exists = outcome.timedOut ? null : outcome.exitCode === 0;
  const probesLog = await appendProbeLog(config, {
    at: new Date().toISOString(),
    probe: params.probe,
    image: params.image,
    path: params.path,
    maxBytes: params.maxBytes,
    exitCode: outcome.timedOut ? null : outcome.exitCode,
    timedOut: outcome.timedOut,
    truncated: outcome.truncated,
    cleanupVerified,
    binaryRefused
  });
  return {
    probe: params.probe,
    image: params.image,
    path: params.path,
    ...(params.probe === "read_text" ? { maxBytes: params.maxBytes } : {}),
    imageId: imageEvidence.imageId,
    repoDigests: imageEvidence.repoDigests,
    containerName,
    exitCode: outcome.timedOut ? null : outcome.exitCode,
    ...(params.probe === "file_stat" ? { exists: exists === true } : {}),
    timedOut: outcome.timedOut,
    truncated: outcome.truncated,
    cleanupVerified,
    binaryRefused,
    redacted: true,
    ...(binaryRefused ? {} : { stdout: stdout.length > 0 ? stdout : null }),
    stderr: stderr.length > 0 ? stderr : null,
    durationMs: Date.now() - started,
    probesLog
  };
}

// UNIT-CREDENTIAL-01: host-side systemd LoadCredential drop-in registrar. Reads
// ENG_MCP_UC_* env vars threaded by the runner, never restarts a service and
// never returns credential values; a FAILED status exits nonzero so the runner
// answers 502 while still parsing this honest envelope from stdout.
async function unitCredentialAction() {
  const result = await runUnitCredential(process.env);
  if (result.status === "FAILED") process.exitCode = 1;
  return result;
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
  if (action === "container_probe") return containerProbeAction(config);
  if (action === "unit_credential") return unitCredentialAction();
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
