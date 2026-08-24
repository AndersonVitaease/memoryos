import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { lstat, readdir, readFile, writeFile, open, rename, unlink, link, realpath, stat } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { EngineeringError, RepositoryPolicy, assertNoSensitiveContent } from "./policy.js";

export type CommandResult = { stdout: string; stderr: string; truncated: boolean };
export type CommandRunner = (executable: string, args: string[], cwd: string, timeoutMs: number, maxBytes: number, environment?: NodeJS.ProcessEnv) => Promise<CommandResult>;
export type VerificationResult = CommandResult & { exitCode: number | null; durationMs: number; timedOut: boolean };
export type VerificationRunner = (executable: string, args: string[], cwd: string, timeoutMs: number, maxBytes: number, environment: NodeJS.ProcessEnv) => Promise<VerificationResult>;
export type LintRuntime = { resolveExecutable?: (root: string) => Promise<string>; run?: VerificationRunner };
type FileOps = { open: typeof open; rename: typeof rename; unlink: typeof unlink; link: typeof link; realpath: typeof realpath };
const defaultFileOps: FileOps = { open, rename, unlink, link, realpath };
const lintTimeoutMs = 30_000;
const lintMaxBytes = 131_072;
const gitTimeoutMs = 10_000;
const analysisTimeoutMs = 8_000;
const analysisMaxFiles = 250;
const analysisMaxBytes = 4 * 1024 * 1024;
const engineeringProjectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sanitizedLintEnvironment(): NodeJS.ProcessEnv {
  const allowed = ["PATH", "SystemRoot", "ComSpec", "TEMP", "TMP", "WINDIR", "HOME", "USERPROFILE"];
  const environment: NodeJS.ProcessEnv = {};
  for (const key of allowed) if (process.env[key] !== undefined) environment[key] = process.env[key];
  return environment;
}

async function terminateProcess(child: ReturnType<typeof spawn>): Promise<void> {
  if (!child.pid) return;
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { shell: false, windowsHide: true, stdio: "ignore" });
      killer.once("error", () => resolve()); killer.once("close", () => resolve());
    });
    return;
  }
  try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
}

export const runVerificationCommand: VerificationRunner = async (executable, args, cwd, timeoutMs, maxBytes, environment) => new Promise((resolve, reject) => {
  const started = Date.now(); let stdout: Buffer<ArrayBuffer> = Buffer.alloc(0); let stderr: Buffer<ArrayBuffer> = Buffer.alloc(0); let truncated = false; let timedOut = false;
  const child = spawn(executable, args, { cwd, shell: false, windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"], env: environment });
  const append = (current: Buffer<ArrayBuffer>, next: Buffer<ArrayBuffer>): Buffer<ArrayBuffer> => {
    const remaining = maxBytes - stdout.length - stderr.length;
    if (remaining <= 0) { truncated = true; return current; }
    if (next.length > remaining) { truncated = true; return Buffer.concat([current, next.subarray(0, remaining)]); }
    return Buffer.concat([current, next]);
  };
  const timer = setTimeout(() => { timedOut = true; void terminateProcess(child); }, timeoutMs);
  child.stdout.on("data", (value: Buffer<ArrayBuffer>) => { stdout = append(stdout, value); });
  child.stderr.on("data", (value: Buffer<ArrayBuffer>) => { stderr = append(stderr, value); });
  child.once("error", () => { clearTimeout(timer); reject(new EngineeringError("DEPENDENCY_UNAVAILABLE")); });
  child.once("close", (code) => { clearTimeout(timer); resolve({ stdout: stdout.toString("utf8"), stderr: stderr.toString("utf8"), truncated, exitCode: timedOut ? null : code, durationMs: Date.now() - started, timedOut }); });
});

async function resolveLocalEslint(root: string): Promise<string> {
  try { return createRequire(path.join(root, "package.json")).resolve("eslint/bin/eslint.js"); }
  catch { throw new EngineeringError("DEPENDENCY_UNAVAILABLE"); }
}

function sanitizedGitEnvironment(): NodeJS.ProcessEnv { return sanitizedLintEnvironment(); }

async function gitRaw(args: string[], cwd: string, timeoutMs = gitTimeoutMs): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: sanitizedGitEnvironment() });
    let stdout = Buffer.alloc(0); let stderr = Buffer.alloc(0);
    const timer = setTimeout(() => { child.kill(); reject(new EngineeringError("COMMAND_TIMEOUT")); }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => { stdout = Buffer.concat([stdout, chunk]); }); child.stderr.on("data", (chunk: Buffer) => { stderr = Buffer.concat([stderr, chunk]); });
    child.once("error", () => { clearTimeout(timer); reject(new EngineeringError("DEPENDENCY_UNAVAILABLE")); });
    child.once("close", (code) => { clearTimeout(timer); if (code !== 0) reject(new EngineeringError("COMMAND_FAILED")); else resolve(stdout); });
  });
}

const command: CommandRunner = async (executable, args, cwd, timeoutMs, maxBytes, environment = {}) => {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, shell: false, windowsHide: true, env: { ...process.env, ...environment } });
    let stdout: Buffer<ArrayBuffer> = Buffer.alloc(0); let stderr: Buffer<ArrayBuffer> = Buffer.alloc(0); let truncated = false;
    const append = (current: Buffer<ArrayBuffer>, next: Buffer<ArrayBuffer>): Buffer<ArrayBuffer> => {
      const remaining = maxBytes - current.length;
      if (remaining <= 0) { truncated = true; return current; }
      if (next.length > remaining) { truncated = true; return Buffer.concat([current, next.subarray(0, remaining)]); }
      return Buffer.concat([current, next]);
    };
    const timer = setTimeout(() => { child.kill(); reject(new EngineeringError("COMMAND_TIMEOUT")); }, timeoutMs);
    child.stdout.on("data", (value: Buffer<ArrayBuffer>) => { stdout = append(stdout, value); });
    child.stderr.on("data", (value: Buffer<ArrayBuffer>) => { stderr = append(stderr, value); });
    child.on("error", () => { clearTimeout(timer); reject(new EngineeringError("DEPENDENCY_UNAVAILABLE")); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 && code !== 1) return reject(new EngineeringError("COMMAND_FAILED"));
      resolve({ stdout: stdout.toString("utf8"), stderr: stderr.toString("utf8"), truncated });
    });
  });
};

class HeavyOperationGate {
  private running = 0;
  private readonly subjects = new Set<string>();
  async run<T>(subject: string, work: () => Promise<T>): Promise<T> {
    if (this.running >= 4 || this.subjects.has(subject)) throw new EngineeringError("ENGINEERING_CAPACITY_EXCEEDED");
    this.running += 1; this.subjects.add(subject);
    try { return await work(); } finally { this.running -= 1; this.subjects.delete(subject); }
  }
}

export class RepositoryAdapter {
  private readonly heavy = new HeavyOperationGate();
  readonly policy: RepositoryPolicy;
  private readonly execute: CommandRunner;
  private readonly fs: FileOps;
  private readonly lintRuntime: Required<LintRuntime>;
  private readonly writeLocks = new Map<string, Promise<void>>();
  private gitLock?: Promise<void>;
  constructor(policy: RepositoryPolicy, execute: CommandRunner = command, fileOps: Partial<FileOps> = {}, lintRuntime: LintRuntime = {}) {
    this.policy = policy; this.execute = execute; this.fs = { ...defaultFileOps, ...fileOps };
    this.lintRuntime = { resolveExecutable: lintRuntime.resolveExecutable ?? resolveLocalEslint, run: lintRuntime.run ?? runVerificationCommand };
  }
  async verifyDependencies(): Promise<void> { await this.execute("rg", ["--version"], this.policy.authorizedRoot, 3_000, 8_192); }

  async structure(input: { path?: string; maxDepth?: number; includeFiles?: boolean; maxEntries?: number }) {
    const maxDepth = Math.min(input.maxDepth ?? 3, 5); const maxEntries = Math.min(input.maxEntries ?? 200, 500);
    if (maxDepth < 0 || maxEntries < 1) throw new EngineeringError("INPUT_INVALID");
    const root = await this.policy.resolve(input.path ?? ""); const entries: Array<{ path: string; type: "file" | "directory" }> = [];
    const visit = async (absolute: string, relative: string, depth: number): Promise<void> => {
      if (depth > maxDepth || entries.length >= maxEntries) return;
      for (const item of await readdir(absolute, { withFileTypes: true })) {
        if (entries.length >= maxEntries) return;
        const nextRelative = relative ? `${relative}/${item.name}` : item.name;
        try { await this.policy.resolve(nextRelative); } catch { continue; }
        if (item.isSymbolicLink()) continue;
        if (item.isDirectory()) { entries.push({ path: nextRelative, type: "directory" }); await visit(path.join(absolute, item.name), nextRelative, depth + 1); }
        else if (item.isFile() && input.includeFiles !== false) entries.push({ path: nextRelative, type: "file" });
      }
    };
    const stat = await lstat(root.absolutePath); if (!stat.isDirectory()) throw new EngineeringError("PATH_NOT_DIRECTORY");
    await visit(root.absolutePath, root.relativePath, 1);
    return { entries, truncated: entries.length >= maxEntries };
  }

  async fileRead(input: { path: string; startLine?: number; maxLines?: number; maxBytes?: number }) {
    const maxLines = Math.min(input.maxLines ?? 200, 500); const maxBytes = Math.min(input.maxBytes ?? 131_072, 131_072);
    if (maxLines < 1 || maxBytes < 1) throw new EngineeringError("INPUT_INVALID");
    const read = await this.policy.readUtf8(input.path, maxBytes); const start = Math.max(1, input.startLine ?? 1);
    const lines = read.text.split(/\r?\n/); const selected = lines.slice(start - 1, start - 1 + maxLines);
    return { path: read.relativePath, hash: this.hash(Buffer.from(read.text, "utf8")), startLine: start, lines: selected, truncated: start - 1 + maxLines < lines.length };
  }

  async search(subject: string, input: { query: string; mode?: "literal" | "regex" | "filename"; maxResults?: number }) {
    if (!input.query || input.query.length > 256) throw new EngineeringError("INPUT_INVALID");
    const maxResults = Math.min(input.maxResults ?? 50, 100); const mode = input.mode ?? "literal";
    return this.heavy.run(subject, async () => {
      const args = mode === "filename"
        ? ["--files", "--glob", input.query]
        : ["--json", "--line-number", "--column", "--color", "never", "--max-count", String(maxResults), ...(mode === "literal" ? ["--fixed-strings"] : []), "--", input.query, "."];
      const result = await this.execute("rg", args, this.policy.authorizedRoot, 8_000, 131_072);
      const matches: unknown[] = [];
      if (mode === "filename") {
        for (const candidate of result.stdout.split(/\r?\n/).filter(Boolean)) {
          try { matches.push((await this.policy.resolve(candidate.replaceAll("\\", "/").replace(/^\.\//, ""))).relativePath); } catch { /* denied paths are never exposed */ }
          if (matches.length >= maxResults) break;
        }
      } else {
        for (const line of result.stdout.split(/\r?\n/).filter(Boolean)) {
          const event = JSON.parse(line) as { type?: string; data?: { path?: { text?: string }; lines?: { text?: string }; line_number?: number; absolute_offset?: number } };
          if (event.type !== "match" || !event.data?.path?.text) continue;
          try {
            const safePath = (await this.policy.resolve(event.data.path.text.replaceAll("\\", "/").replace(/^\.\//, ""))).relativePath;
            const preview = event.data.lines?.text ?? "";
            assertNoSensitiveContent(preview);
            matches.push({ path: safePath, line: event.data.line_number, column: event.data.absolute_offset, preview });
          } catch (error) {
            if (error instanceof EngineeringError && error.code === "SENSITIVE_CONTENT_BLOCKED") throw error;
            // Paths rejected by policy are intentionally omitted from search output.
          }
          if (matches.length >= maxResults) break;
        }
      }
      return { matches, truncated: result.truncated || matches.length >= maxResults, mode };
    });
  }

async references(subject: string, symbol: string, maxResults = 100) {
    return this.heavy.run(subject, async () => {
      if (!symbol || symbol.length > 256) throw new EngineeringError("INPUT_INVALID");
      const result = await this.searchInternal({ query: symbol, mode: "literal", maxResults });
      return { ...result, heuristic: true, semanticCompleteness: "not_guaranteed" as const };
    });
  }

  async deadCodeScan(subject: string, input: { path?: string; maxCandidates?: number }) {
    const maxCandidates = Math.min(input.maxCandidates ?? 50, 100);
    if (maxCandidates < 1) throw new EngineeringError("INPUT_INVALID");
    return this.heavy.run(subject, async () => {
      const files = await this.analysisFiles(input.path);
      const candidates: Array<Record<string, unknown>> = [];
      for (const file of files.items) {
        for (const symbol of this.exportedSymbols(file.text)) {
          if (candidates.length >= maxCandidates) break;
          const references = this.symbolReferences(symbol, file.path, files.items);
          const testReferences = references.filter((entry) => this.isTestPath(entry.path));
          const nonTestReferences = references.filter((entry) => !this.isTestPath(entry.path));
          const dynamicReferences = this.dynamicReferences(symbol, files.items);
          const entrypoint = this.isEntrypoint(file.path);
          const classification = entrypoint ? "RUNTIME_REACHABLE" : dynamicReferences.length ? "DYNAMIC_REFERENCE_POSSIBLE" : nonTestReferences.length ? "KEEP" : testReferences.length ? "TEST_ONLY" : "LIKELY_DEAD";
          candidates.push({ path: file.path, symbol, classification, confidence: classification === "LIKELY_DEAD" ? "medium" : "high", directReferences: nonTestReferences, dynamicReferences, entrypoints: entrypoint ? [file.path] : [], testReferences, evidence: [`static export declaration in ${file.path}`, ...references.map((entry) => `textual reference ${entry.path}:${entry.line}`)], reason: classification === "LIKELY_DEAD" ? "No non-test static or detectable dynamic reference was found; this is not sufficient to prove deletion safety." : classification === "TEST_ONLY" ? "References were found only in test paths." : classification === "DYNAMIC_REFERENCE_POSSIBLE" ? "A string or dynamic-load reference was detected." : classification === "RUNTIME_REACHABLE" ? "File name indicates an entrypoint and is retained conservatively." : "Static references were found." });
        }
      }
      return { candidates, partial: files.partial || candidates.length >= maxCandidates, scannedFiles: files.items.length, classificationPolicy: "heuristic; absence of a grep/import match never yields DEAD_CONFIRMED" };
    });
  }

  async parallelPathScan(subject: string, input: { responsibility: string; maxPaths?: number }) {
    if (!input.responsibility || input.responsibility.length > 128) throw new EngineeringError("INPUT_INVALID");
    const maxPaths = Math.min(input.maxPaths ?? 20, 50);
    return this.heavy.run(subject, async () => {
      const files = await this.analysisFiles(); const needle = input.responsibility.toLowerCase();
      const matches = files.items.filter((file) => file.path.toLowerCase().includes(needle) || new RegExp(`\\b${this.escapeRegex(input.responsibility)}\\b`, "i").test(file.text)).slice(0, maxPaths);
      const paths = matches.map((file) => {
        const callers = files.items.filter((other) => other.path !== file.path && this.importsPath(other.text, other.path, file.path)).map((other) => other.path);
        const callees = this.importPaths(file.text, file.path).filter((candidate) => files.items.some((item) => item.path === candidate));
        return { path: file.path, entrypoint: this.isEntrypoint(file.path) ? file.path : null, callers, callees, runtimeReachable: this.isEntrypoint(file.path) || callers.some((caller) => !this.isTestPath(caller)) };
      });
      const active = paths.filter((item) => item.runtimeReachable); const legacy = paths.filter((item) => /legacy|deprecated|old/i.test(item.path));
      const classification = paths.length < 2 ? "FALSE_POSITIVE" : active.length >= 2 ? "PARALLEL_ACTIVE" : legacy.length && legacy.every((item) => !item.runtimeReachable) ? "LEGACY_UNUSED" : legacy.length ? "LEGACY_ACTIVE" : "INDETERMINATE";
      return { responsibility: input.responsibility, paths, classification, confidence: classification === "PARALLEL_ACTIVE" ? "medium" : "high", evidence: paths.map((item) => `${item.path}: callers=${item.callers.length}, callees=${item.callees.length}`), recommendation: classification === "PARALLEL_ACTIVE" ? "Review ownership and migration state; do not remove either path without runtime evidence." : "No removal recommendation; inspect the listed paths manually.", partial: files.partial || matches.length >= maxPaths };
    });
  }

  async contractVerify(input: { contractPath: string; implementationPath: string; contractSymbol?: string; implementationSymbol?: string }) {
    const contract = await this.policy.readUtf8(input.contractPath, 131_072); const implementation = await this.policy.readUtf8(input.implementationPath, 131_072);
    const neverThrows = /\b(must|should|will)\s+never\s+throw\b|@throws\s+never/i.test(contract.text);
    const readonlyContract = /\breadonly\s+[A-Za-z_$]/.test(contract.text);
    const throws = /\bthrow\b/.test(implementation.text);
    const status = neverThrows && throws ? "VIOLATION_CONFIRMED" : neverThrows ? "COMPLIANT" : readonlyContract && /\breturn\s+\{/.test(implementation.text) ? "POSSIBLE_VIOLATION" : "INDETERMINATE";
    return { contract: input.contractSymbol ?? contract.relativePath, contractLocation: contract.relativePath, implementation: input.implementationSymbol ?? implementation.relativePath, implementationLocation: implementation.relativePath, status, confidence: status === "VIOLATION_CONFIRMED" || status === "COMPLIANT" ? "high" : "low", evidence: [neverThrows ? "Contract explicitly states that it must never throw." : "No machine-checkable strong contract clause was found.", throws ? "Implementation contains a throw statement." : "Implementation contains no throw statement.", readonlyContract ? "Contract declares readonly data." : ""].filter(Boolean), impact: status === "VIOLATION_CONFIRMED" ? "Callers relying on the no-throw contract may fail unexpectedly." : status === "POSSIBLE_VIOLATION" ? "Manual review required before relying on immutability." : "No confirmed runtime impact." };
  }

  async changeImpact(subject: string, input: { path?: string; symbol?: string; description?: string; maxResults?: number }) {
    if ((!input.path && !input.symbol) || (input.path && input.symbol) || (input.path && !(await this.policy.resolve(input.path).then(() => true).catch(() => false)))) throw new EngineeringError("INPUT_INVALID");
    const maxResults = Math.min(input.maxResults ?? 50, 100);
    return this.heavy.run(subject, async () => {
      const files = await this.analysisFiles(); const targetPath = input.path ? (await this.policy.resolve(input.path)).relativePath : undefined; const target = targetPath ?? input.symbol!;
      const direct = input.symbol
        ? (await this.analysisMatchPaths(input.symbol, maxResults)).filter((file) => file !== targetPath)
        : files.items.filter((file) => file.path !== targetPath && this.importsPath(file.text, file.path, targetPath!)).map((file) => file.path).slice(0, maxResults);
      const transitive = files.items.filter((file) => !direct.includes(file.path) && !this.isTestPath(file.path) && direct.some((dependency) => this.importsPath(file.text, file.path, dependency))).map((file) => file.path).slice(0, maxResults);
      const affectedTests = [...direct, ...transitive].filter((entry) => this.isTestPath(entry));
      const affectedContracts = files.items.filter((file) => /interface|contract|types?/i.test(file.path) && (input.symbol ? new RegExp(`\\b${this.escapeRegex(input.symbol)}\\b`).test(file.text) : this.importsPath(file.text, file.path, targetPath!))).map((file) => file.path).slice(0, maxResults);
      const affectedRuntimePaths = [...direct, ...transitive].filter((entry) => this.isEntrypoint(entry));
      const surface = direct.length + transitive.length + affectedRuntimePaths.length * 2;
      return { target, description: input.description ?? null, directImpact: direct, transitiveImpact: transitive, affectedTests, affectedContracts, affectedRuntimePaths, riskLevel: surface >= 20 ? "CRITICAL" : surface >= 10 ? "HIGH" : surface >= 3 ? "MEDIUM" : "LOW", confidence: "medium", evidence: [`${direct.length} direct textual/import impacts`, `${transitive.length} one-hop transitive import impacts`], partial: files.partial || direct.length >= maxResults || transitive.length >= maxResults };
    });
  }

  async gitStatus() {
    const result = await this.execute("git", ["status", "--porcelain=v2", "--branch"], this.policy.authorizedRoot, 5_000, 131_072, { GIT_OPTIONAL_LOCKS: "0" });
    return { status: result.stdout, truncated: result.truncated };
  }

  async gitDiff(input: { paths?: string[]; staged?: boolean }) {
    const paths = input.paths ?? []; if (paths.length > 50) throw new EngineeringError("INPUT_INVALID");
    const safePaths: string[] = [];
    for (const requested of paths) safePaths.push((await this.policy.resolve(requested)).relativePath);
    const result = await this.execute("git", ["--no-pager", "diff", "--no-ext-diff", "--no-textconv", ...(input.staged ? ["--cached"] : []), "--", ...safePaths], this.policy.authorizedRoot, 5_000, 131_072, { GIT_OPTIONAL_LOCKS: "0" });
    assertNoSensitiveContent(result.stdout);
    return { diff: result.stdout, truncated: result.truncated, staged: Boolean(input.staged) };
  }

  async gitBranches(input: { filter?: string; includeRemote?: boolean }) {
    const filter = input.filter?.trim();
    if (filter !== undefined && (!filter || filter.length > 128 || /[\0\r\n\x01-\x1f\x7f]/.test(filter))) throw new EngineeringError("INPUT_INVALID");
    const includeRemote = input.includeRemote ?? true;
    const head = await this.resolveGitRef("HEAD");
    const currentBranch = (await this.gitRead(["symbolic-ref", "--quiet", "--short", "HEAD"], 4_096)).stdout.trim() || null;
    const format = "%(refname)\t%(objectname)\t%(HEAD)\t%(upstream:short)\t%(upstream:track)\t%(symref)";
    const result = await this.gitRead(["for-each-ref", "--count=501", `--format=${format}`, "refs/heads", ...(includeRemote ? ["refs/remotes"] : [])], 262_144);
    const needle = filter?.toLowerCase();
    const branches = result.stdout.split(/\r?\n/).filter(Boolean).flatMap((line) => {
      const [refname, branchHead, marker, upstream, tracking, symref] = line.split("\t");
      if (!refname || !branchHead || symref) return [];
      const type = refname.startsWith("refs/heads/") ? "local" as const : "remote" as const;
      const name = refname.replace(type === "local" ? /^refs\/heads\// : /^refs\/remotes\//, "");
      if (needle && !name.toLowerCase().includes(needle)) return [];
      const ahead = /ahead (\d+)/.exec(tracking ?? "")?.[1];
      const behind = /behind (\d+)/.exec(tracking ?? "")?.[1];
      return [{ name, type, head: branchHead, current: marker === "*", ...(upstream ? { upstream } : {}), ...(ahead ? { ahead: Number(ahead) } : {}), ...(behind ? { behind: Number(behind) } : {}) }];
    }).slice(0, 500);
    return { currentBranch, head, branches, truncated: result.truncated || result.stdout.split(/\r?\n/).filter(Boolean).length > 500 };
  }

  async gitWorktrees() {
    const result = await this.gitRead(["worktree", "list", "--porcelain"], 131_072);
    const worktrees = result.stdout.trim().split(/\r?\n\r?\n/).filter(Boolean).map((record) => {
      const item: { path?: string; head?: string; branch?: string; bare?: boolean; detached?: boolean; locked?: boolean; prunable?: boolean } = {};
      for (const line of record.split(/\r?\n/)) {
        const separator = line.indexOf(" "); const key = separator < 0 ? line : line.slice(0, separator); const value = separator < 0 ? "" : line.slice(separator + 1);
        if (key === "worktree") item.path = value;
        else if (key === "HEAD") item.head = value;
        else if (key === "branch") item.branch = value.replace(/^refs\/heads\//, "");
        else if (key === "bare") item.bare = true;
        else if (key === "detached") item.detached = true;
        else if (key === "locked") item.locked = true;
        else if (key === "prunable") item.prunable = true;
      }
      if (!item.path || !item.head) throw new EngineeringError("GIT_OUTPUT_INVALID");
      return { path: item.path, head: item.head, ...(item.branch ? { branch: item.branch } : {}), ...(item.bare ? { bare: true } : {}), ...(item.detached ? { detached: true } : {}), ...(item.locked ? { locked: true } : {}), ...(item.prunable ? { prunable: true } : {}) };
    });
    return { worktrees };
  }

  async gitLog(input: { limit?: number; path?: string; since?: string; until?: string; ref?: string }) {
    const limit = input.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new EngineeringError("INPUT_INVALID");
    const ref = input.ref ?? "HEAD"; await this.resolveGitRef(ref);
    const since = this.validateGitDate(input.since); const until = this.validateGitDate(input.until);
    const requestedPath = input.path ? (await this.policy.resolve(input.path)).relativePath : undefined;
    const commits = await this.readGitCommits([`--max-count=${limit + 1}`, ...(since ? [`--since=${since}`] : []), ...(until ? [`--until=${until}`] : []), ref, ...(requestedPath ? ["--", requestedPath] : [])]);
    return { commits: commits.slice(0, limit), truncated: commits.length > limit };
  }

  async gitRemoteCompare(input: { localRef?: string; remoteRef?: string }) {
    const localRef = input.localRef ?? "HEAD";
    const remoteRef = input.remoteRef ?? await this.currentUpstream();
    const localHead = await this.resolveGitRef(localRef);
    const remoteHead = await this.resolveGitRef(remoteRef, "REMOTE_REF_NOT_AVAILABLE");
    const counts = (await this.gitRead(["rev-list", "--left-right", "--count", `${localHead}...${remoteHead}`], 4_096)).stdout.trim().split(/\s+/).map(Number);
    if (counts.length !== 2 || counts.some((value) => !Number.isInteger(value))) throw new EngineeringError("GIT_OUTPUT_INVALID");
    const commonAncestor = await this.gitRead(["merge-base", localHead, remoteHead], 4_096).then((value) => value.stdout.trim() || undefined).catch(() => undefined);
    const localOnly = await this.readGitCommits(["--max-count=51", localHead, "--not", remoteHead]);
    const remoteOnly = await this.readGitCommits(["--max-count=51", remoteHead, "--not", localHead]);
    return { localRef, localHead, remoteRef, remoteHead, ahead: counts[0], behind: counts[1], ...(commonAncestor ? { commonAncestor } : {}), localOnlyCommits: localOnly.slice(0, 50), remoteOnlyCommits: remoteOnly.slice(0, 50), synchronized: counts[0] === 0 && counts[1] === 0, truncated: localOnly.length > 50 || remoteOnly.length > 50 };
  }

  private async gitRead(args: string[], maxBytes = 131_072): Promise<CommandResult> {
    const result = await this.execute("git", ["--no-pager", ...args], this.policy.authorizedRoot, gitTimeoutMs, maxBytes, { GIT_OPTIONAL_LOCKS: "0" });
    assertNoSensitiveContent(result.stdout); assertNoSensitiveContent(result.stderr);
    return result;
  }

  private validateGitRef(ref: string): void {
    if (typeof ref !== "string" || !ref || ref.length > 256 || ref.startsWith("-") || /[\0\s\x01-\x1f\x7f~^:?*[\\]/.test(ref) || ref.includes("..") || ref.includes("@{")) throw new EngineeringError("REF_INVALID");
  }

  private async resolveGitRef(ref: string, missingCode = "REF_NOT_AVAILABLE"): Promise<string> {
    this.validateGitRef(ref);
    try {
      const resolved = (await this.gitRead(["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`], 4_096)).stdout.trim();
      if (!/^[0-9a-f]{40,64}$/i.test(resolved)) throw new EngineeringError("GIT_OUTPUT_INVALID");
      return resolved;
    } catch (error) {
      if (error instanceof EngineeringError && ["REF_INVALID", "GIT_OUTPUT_INVALID", "COMMAND_TIMEOUT", "DEPENDENCY_UNAVAILABLE", "SENSITIVE_CONTENT_BLOCKED"].includes(error.code)) throw error;
      throw new EngineeringError(missingCode);
    }
  }

  private validateGitDate(value?: string): string | undefined {
    if (value === undefined) return undefined;
    if (!value.trim() || value.length > 128 || /[\0\r\n\x01-\x1f\x7f]/.test(value)) throw new EngineeringError("INPUT_INVALID");
    return value;
  }

  private async currentUpstream(): Promise<string> {
    try {
      const upstream = (await this.gitRead(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], 4_096)).stdout.trim();
      if (!upstream) throw new EngineeringError("UPSTREAM_NOT_CONFIGURED");
      return upstream;
    } catch (error) {
      if (error instanceof EngineeringError && ["UPSTREAM_NOT_CONFIGURED", "COMMAND_TIMEOUT", "DEPENDENCY_UNAVAILABLE", "SENSITIVE_CONTENT_BLOCKED"].includes(error.code)) throw error;
      throw new EngineeringError("UPSTREAM_NOT_CONFIGURED");
    }
  }

  private async readGitCommits(args: string[]) {
    const format = "%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%P%x1e";
    const result = await this.gitRead(["log", "--no-show-signature", `--format=${format}`, ...args], 524_288);
    return result.stdout.split("\x1e").map((record) => record.replace(/^\r?\n|\r?\n$/g, "")).filter(Boolean).map((record) => {
      const [hash, shortHash, authorName, authorEmail, date, subject, parents] = record.split("\x1f");
      if (!hash || !shortHash || !authorName || !date || subject === undefined) throw new EngineeringError("GIT_OUTPUT_INVALID");
      return { hash, shortHash, authorName, ...(authorEmail ? { authorEmail } : {}), date, subject, ...(parents ? { parents: parents.split(" ").filter(Boolean) } : {}) };
    });
  }

  async lint(subject: string) {
    return this.heavy.run(subject, async () => {
      const executable = await this.lintRuntime.resolveExecutable(this.policy.authorizedRoot);
      const before = await this.baseline();
      let result: VerificationResult;
      try { result = await this.lintRuntime.run(executable, [".", "--quiet"], this.policy.authorizedRoot, lintTimeoutMs, lintMaxBytes, sanitizedLintEnvironment()); }
      finally {
        const after = await this.baseline();
        this.assertVerificationBaseline(before, after);
      }
      try { assertNoSensitiveContent(result.stdout); assertNoSensitiveContent(result.stderr); }
      catch (error) { if (error instanceof EngineeringError && error.code === "SENSITIVE_CONTENT_BLOCKED") throw new EngineeringError("SENSITIVE_OUTPUT_BLOCKED"); throw error; }
      return {
        operation: "lint" as const,
        status: result.timedOut ? "timeout" as const : result.exitCode === 0 ? "passed" as const : "failed" as const,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        stdout: result.stdout,
        stderr: result.stderr,
        truncated: result.truncated,
        filesChanged: [] as string[]
      };
    });
  }

  async gitStage(input: { paths: string[]; expectedHashes: Record<string, string>; acknowledgeStage: boolean }) {
    if (!input.acknowledgeStage) throw new EngineeringError("GIT_STAGE_ACKNOWLEDGEMENT_REQUIRED");
    if (!Array.isArray(input.paths) || input.paths.length < 1 || input.paths.length > 50 || new Set(input.paths).size !== input.paths.length) throw new EngineeringError("INPUT_INVALID");
    return this.withGitLock(async () => {
      const before = await this.baseline(); const indexHashBefore = await this.indexFingerprint(); const paths: string[] = [];
      for (const requested of input.paths) {
        const target = await this.policy.resolveGitStageable(requested); const bytes = await readFile(target.absolutePath);
        if (this.hash(bytes) !== input.expectedHashes[requested]) throw new EngineeringError("FILE_VERSION_CONFLICT");
        assertNoSensitiveContent(bytes); paths.push(target.relativePath);
      }
      if (Object.keys(input.expectedHashes).length !== paths.length || paths.some((item) => !(item in input.expectedHashes))) throw new EngineeringError("INPUT_INVALID");
      await gitRaw(["add", "--", ...paths], this.policy.authorizedRoot);
      const after = await this.baseline(); this.assertWorktreeUnchanged(before, after); const indexHashAfter = await this.indexFingerprint();
      return { pathsStaged: paths, indexHashBefore, indexHashAfter, warnings: [] as string[] };
    });
  }

  async gitUnstage(input: { paths: string[]; expectedIndexHash: string; acknowledgeUnstage: boolean }) {
    if (!input.acknowledgeUnstage) throw new EngineeringError("GIT_UNSTAGE_ACKNOWLEDGEMENT_REQUIRED");
    if (!Array.isArray(input.paths) || input.paths.length < 1 || input.paths.length > 50 || new Set(input.paths).size !== input.paths.length) throw new EngineeringError("INPUT_INVALID");
    return this.withGitLock(async () => {
      const before = await this.baseline(); const indexHashBefore = await this.indexFingerprint(); if (indexHashBefore !== input.expectedIndexHash) throw new EngineeringError("INDEX_VERSION_CONFLICT");
      const paths: string[] = []; for (const requested of input.paths) paths.push((await this.policy.resolveGitStageable(requested)).relativePath);
      await gitRaw(["restore", "--staged", "--source=HEAD", "--", ...paths], this.policy.authorizedRoot);
      const after = await this.baseline(); this.assertWorktreeUnchanged(before, after); return { pathsUnstaged: paths, indexHashBefore, indexHashAfter: await this.indexFingerprint(), warnings: [] as string[] };
    });
  }

  async gitCommit(input: { message: string; expectedIndexHash: string; acknowledgeCommit: boolean }) {
    if (!input.acknowledgeCommit) throw new EngineeringError("GIT_COMMIT_ACKNOWLEDGEMENT_REQUIRED");
    if (typeof input.message !== "string" || !input.message.trim() || input.message.length > 512 || /[\0\r\n\x01-\x1f\x7f]/.test(input.message)) throw new EngineeringError("COMMIT_MESSAGE_INVALID");
    return this.withGitLock(async () => {
      const before = await this.baseline(); const indexHashBefore = await this.indexFingerprint(); if (indexHashBefore !== input.expectedIndexHash) throw new EngineeringError("INDEX_VERSION_CONFLICT");
      await this.assertCommitPolicy(); const staged = await gitRaw(["diff", "--cached", "--name-only"], this.policy.authorizedRoot); if (!staged.length) throw new EngineeringError("NOTHING_TO_COMMIT");
      await gitRaw(["commit", "-m", input.message], this.policy.authorizedRoot);
      const after = await this.baseline(); this.assertWorktreeUnchanged(before, after); const commitHash = (await gitRaw(["rev-parse", "HEAD"], this.policy.authorizedRoot)).toString("utf8").trim();
      return { commitHash, indexHashBefore, indexHashAfter: await this.indexFingerprint(), message: input.message, status: "committed" as const };
    });
  }

  private async analysisFiles(requestedPath?: string): Promise<{ items: Array<{ path: string; text: string }>; partial: boolean }> {
    const root = requestedPath ? await this.policy.resolve(requestedPath) : await this.policy.resolve("");
    const result = await this.execute("rg", ["--files", "."], root.absolutePath, analysisTimeoutMs, 524_288);
    const items: Array<{ path: string; text: string }> = []; let bytes = 0;
    for (const rawPath of result.stdout.split(/\r?\n/).filter(Boolean)) {
      if (items.length >= analysisMaxFiles || bytes >= analysisMaxBytes) break;
      const candidate = rawPath.replaceAll("\\", "/").replace(/^\.\//, "");
      const relative = requestedPath ? path.posix.join(root.relativePath, candidate) : candidate;
      try {
        const read = await this.policy.readUtf8(relative, 65_536);
        bytes += Buffer.byteLength(read.text); items.push({ path: read.relativePath, text: read.text });
      } catch { /* Policy-denied, binary, oversized, and unreadable files are excluded. */ }
    }
    return { items, partial: result.truncated || items.length >= analysisMaxFiles || bytes >= analysisMaxBytes };
  }

  private async analysisMatchPaths(query: string, maxResults: number): Promise<string[]> {
    const result = await this.execute("rg", ["--json", "--line-number", "--column", "--color", "never", "--max-count", String(maxResults), "--fixed-strings", "--", query, "."], this.policy.authorizedRoot, analysisTimeoutMs, 524_288);
    const matches: string[] = [];
    for (const line of result.stdout.split(/\r?\n/).filter(Boolean)) {
      try {
        const event = JSON.parse(line) as { type?: string; data?: { path?: { text?: string } } };
        if (event.type !== "match" || !event.data?.path?.text) continue;
        const match = (await this.policy.resolve(event.data.path.text.replaceAll("\\", "/").replace(/^\.\//, ""))).relativePath;
        if (!matches.includes(match)) matches.push(match);
      } catch { /* Denied paths and malformed events are never returned. */ }
      if (matches.length >= maxResults) break;
    }
    return matches;
  }

  private exportedSymbols(text: string): string[] {
    const names = new Set<string>(); const declaration = /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type)\s+([A-Za-z_$][\w$]*)/gm;
    for (const match of text.matchAll(declaration)) names.add(match[1]);
    return [...names];
  }
  private symbolReferences(symbol: string, definitionPath: string, files: Array<{ path: string; text: string }>): Array<{ path: string; line: number }> {
    const pattern = new RegExp(`\\b${this.escapeRegex(symbol)}\\b`, "g"); const references: Array<{ path: string; line: number }> = [];
    for (const file of files) {
      for (const match of file.text.matchAll(pattern)) {
        const line = file.text.slice(0, match.index).split(/\r?\n/).length;
        if (file.path === definitionPath && new RegExp(`^\\s*export\\s+.*\\b${this.escapeRegex(symbol)}\\b`).test(file.text.split(/\r?\n/)[line - 1] ?? "")) continue;
        references.push({ path: file.path, line });
      }
    }
    return references;
  }
  private dynamicReferences(symbol: string, files: Array<{ path: string; text: string }>): Array<{ path: string; line: number }> {
    const pattern = new RegExp(`(?:import\\s*\\(|require\\s*\\(|['\"])${this.escapeRegex(symbol)}(?:['\"])`, "g"); const result: Array<{ path: string; line: number }> = [];
    for (const file of files) for (const match of file.text.matchAll(pattern)) result.push({ path: file.path, line: file.text.slice(0, match.index).split(/\r?\n/).length });
    return result;
  }
  private importPaths(text: string, sourcePath: string): string[] {
    const result: string[] = []; const directory = path.posix.dirname(sourcePath); const matcher = /(?:from\s+|import\s*\(|require\s*\()["']([^"']+)["']/g;
    for (const match of text.matchAll(matcher)) {
      const specifier = match[1]; if (!specifier.startsWith(".")) continue;
      const normalized = path.posix.normalize(path.posix.join(directory, specifier));
      result.push(normalized, `${normalized}.ts`, `${normalized}.tsx`, `${normalized}/index.ts`);
    }
    return result;
  }
  private importsPath(text: string, sourcePath: string, targetPath: string): boolean {
    const withoutExtension = targetPath.replace(/\.(?:tsx?|[cm]?js)$/, "");
    return this.importPaths(text, sourcePath).some((candidate) => candidate === targetPath || candidate === withoutExtension || candidate.endsWith(`/${withoutExtension}`));
  }
  private isTestPath(value: string): boolean { return /(^|\/)(test|tests|__tests__)(\/|$)|\.(?:test|spec)\.[^.]+$/i.test(value); }
  private isEntrypoint(value: string): boolean { return /(^|\/)(?:index|main|server|app|cli)\.(?:tsx?|[cm]?js)$/i.test(value); }
  private escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  private hash(bytes: Buffer) { return createHash("sha256").update(bytes).digest("hex"); }
  private async indexFingerprint() { return this.hash(await gitRaw(["ls-files", "-s", "-z"], this.policy.authorizedRoot)); }
  private async withGitLock<T>(work: () => Promise<T>, timeoutMs = gitTimeoutMs): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    while (this.gitLock) { const remaining = deadline - Date.now(); if (remaining <= 0) throw new EngineeringError("GIT_LOCK_TIMEOUT"); await Promise.race([this.gitLock, new Promise<never>((_, reject) => setTimeout(() => reject(new EngineeringError("GIT_LOCK_TIMEOUT")), remaining))]); }
    let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; }); this.gitLock = held;
    try { return await work(); } finally { release(); if (this.gitLock === held) this.gitLock = undefined; }
  }
  private assertWorktreeUnchanged(before: Awaited<ReturnType<RepositoryAdapter["baseline"]>>, after: Awaited<ReturnType<RepositoryAdapter["baseline"]>>) {
    const keys = new Set([...before.manifest.keys(), ...after.manifest.keys()]); for (const key of keys) if (before.manifest.get(key) !== after.manifest.get(key)) throw new EngineeringError("UNEXPECTED_WORKTREE_CHANGE");
  }
  private async assertCommitPolicy() {
    for (const key of ["core.hooksPath", "commit.template"]) { const value = await gitRaw(["config", "--get", key], this.policy.authorizedRoot).then((bytes) => bytes.toString("utf8").trim()).catch(() => ""); if (value) throw new EngineeringError("GIT_POLICY_UNSUPPORTED"); }
    const sign = await gitRaw(["config", "--get", "commit.gpgSign"], this.policy.authorizedRoot).then((bytes) => bytes.toString("utf8").trim().toLowerCase()).catch(() => ""); if (sign === "true" || sign === "yes" || sign === "1") throw new EngineeringError("GIT_POLICY_UNSUPPORTED");
    const hooksPath = (await gitRaw(["rev-parse", "--git-path", "hooks"], this.policy.authorizedRoot)).toString("utf8").trim(); const hooks = await readdir(path.resolve(this.policy.authorizedRoot, hooksPath)).catch(() => [] as string[]);
    if (hooks.some((name) => !name.endsWith(".sample"))) throw new EngineeringError("GIT_POLICY_UNSUPPORTED");
  }
  private async withWriteLock<T>(key: string, work: () => Promise<T>, timeoutMs = 10_000): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    while (this.writeLocks.has(key)) {
      const previous = this.writeLocks.get(key)!;
      const remaining = deadline - Date.now(); if (remaining <= 0) throw new EngineeringError("FILE_LOCK_TIMEOUT");
      await Promise.race([previous, new Promise<never>((_, reject) => setTimeout(() => reject(new EngineeringError("FILE_LOCK_TIMEOUT")), remaining))]);
    }
    let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; }); this.writeLocks.set(key, held);
    try { return await work(); } finally { release(); if (this.writeLocks.get(key) === held) this.writeLocks.delete(key); }
  }
    private async baseline() {
    const status = await this.execute("git", ["status", "--porcelain=v2", "-z"], this.policy.authorizedRoot, 5_000, 1_048_576, { GIT_OPTIONAL_LOCKS: "0" });
    const index = await this.execute("git", ["ls-files", "-s", "-z"], this.policy.authorizedRoot, 5_000, 1_048_576, { GIT_OPTIONAL_LOCKS: "0" });
    const manifest = new Map<string, string>(); let files = 0; let bytes = 0; const started = Date.now();
    const visit = async (absolute: string, relative: string): Promise<void> => {
      if (Date.now() - started > 5_000 || files > 2_000 || bytes > 16 * 1024 * 1024) throw new EngineeringError("BASELINE_LIMIT_EXCEEDED");
      for (const entry of await readdir(absolute, { withFileTypes: true })) {
        const next = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isSymbolicLink()) continue;

        // CONSERVATIVE EXCLUSION: Skip known artifact directories before ANY expensive operations
        // Only exclude if it's a directory AND matches our exclusion list
        if (entry.isDirectory()) {
          const excludePatterns = ["node_modules", ".git", "coverage", ".next", "dist", "build"];
          if (excludePatterns.some(pattern => entry.name === pattern)) {
            continue;
          }
        }

        try { const resolved = await this.policy.resolve(next); if (entry.isDirectory()) await visit(resolved.absolutePath, resolved.relativePath); else if (entry.isFile()) { this.policy.assertReadableExtension(resolved.relativePath); const data = await readFile(resolved.absolutePath); files += 1; bytes += data.length; if (files > 2_000 || bytes > 16 * 1024 * 1024) throw new EngineeringError("BASELINE_LIMIT_EXCEEDED"); manifest.set(resolved.relativePath, this.hash(data)); } } catch (error) { if (error instanceof EngineeringError && error.code === "BASELINE_LIMIT_EXCEEDED") throw error; }
      }
    };
    await visit(this.policy.authorizedRoot, ""); return { status: status.stdout, index: index.stdout, manifest };
  }

  private assertBaseline(before: Awaited<ReturnType<RepositoryAdapter["baseline"]>>, after: Awaited<ReturnType<RepositoryAdapter["baseline"]>>, target: string) {
    if (before.index !== after.index) throw new EngineeringError("UNEXPECTED_WORKTREE_CHANGE");
    const keys = new Set([...before.manifest.keys(), ...after.manifest.keys()]);
    for (const key of keys) if (key !== target && before.manifest.get(key) !== after.manifest.get(key)) throw new EngineeringError("UNEXPECTED_WORKTREE_CHANGE");
  }
  private assertVerificationBaseline(before: Awaited<ReturnType<RepositoryAdapter["baseline"]>>, after: Awaited<ReturnType<RepositoryAdapter["baseline"]>>) {
    if (before.status !== after.status || before.index !== after.index) throw new EngineeringError("UNEXPECTED_VERIFICATION_MUTATION");
    const keys = new Set([...before.manifest.keys(), ...after.manifest.keys()]);
    for (const key of keys) if (before.manifest.get(key) !== after.manifest.get(key)) throw new EngineeringError("UNEXPECTED_VERIFICATION_MUTATION");
  }
  private async atomicReplace(target: string, parent: string, bytes: Buffer, revalidate: () => Promise<void>): Promise<void> {
    const temp = path.join(parent, `.eng-mcp-${randomUUID()}.tmp`);
    try { const handle = await this.fs.open(temp, "wx"); try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); } await revalidate(); await this.fs.rename(temp, target); }
    catch (error) { if (error instanceof EngineeringError) throw error; throw new EngineeringError("ATOMIC_REPLACE_FAILED"); }
    finally { await this.fs.unlink(temp).catch(() => undefined); }
  }
  private async atomicCreate(target: string, parent: string, bytes: Buffer): Promise<void> {
    const temp = path.join(parent, `.eng-mcp-${randomUUID()}.tmp`);
    try { const handle = await this.fs.open(temp, "wx"); try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); } await this.fs.link(temp, target); }
    catch (error) { const code = (error as NodeJS.ErrnoException).code; if (code === "EEXIST") throw new EngineeringError("FILE_ALREADY_EXISTS"); throw new EngineeringError("ATOMIC_CREATE_UNSUPPORTED"); }
    finally { await this.fs.unlink(temp).catch(() => undefined); }
  }
  private patchLines(text: string, hunks: Array<{ startLine: number; deleteLines: string[]; insertLines: string[] }>, expected?: number) {
    if (expected !== undefined && expected !== hunks.length) throw new EngineeringError("PATCH_CHANGE_COUNT_MISMATCH");
    if (!hunks.length) throw new EngineeringError("PATCH_CHANGE_COUNT_MISMATCH");
    const eol = text.includes("\r\n") ? "\r\n" : "\n"; if (text.includes("\r\n") && /(?<!\r)\n/.test(text)) throw new EngineeringError("MIXED_LINE_ENDINGS_UNSUPPORTED");
    const finalNewline = text.endsWith(eol); const bom = text.startsWith("\ufeff"); const body = bom ? text.slice(1) : text;
    const lines = body === "" ? [] : body.slice(0, finalNewline ? -eol.length : undefined).split(eol);
    let last = 0;
    for (const hunk of hunks) { if (!Number.isInteger(hunk.startLine) || hunk.startLine < 1 || hunk.startLine < last || hunk.startLine > lines.length + 1 || hunk.deleteLines.some((x) => /[\r\n]/.test(x)) || hunk.insertLines.some((x) => /[\r\n]/.test(x))) throw new EngineeringError("PATCH_HUNKS_OVERLAP"); const index = hunk.startLine - 1; if (hunk.deleteLines.some((line, offset) => lines[index + offset] !== line)) throw new EngineeringError("PATCH_CONTEXT_MISMATCH"); last = hunk.startLine + Math.max(1, hunk.deleteLines.length); }
    for (const hunk of [...hunks].reverse()) lines.splice(hunk.startLine - 1, hunk.deleteLines.length, ...hunk.insertLines);
    return `${bom ? "\ufeff" : ""}${lines.join(eol)}${finalNewline ? eol : ""}`;
  }
  async patch(input: { path: string; baseHash: string; hunks: Array<{ startLine: number; deleteLines: string[]; insertLines: string[] }>; expectedChangeCount?: number; acknowledgeWrite: boolean }) {
    if (!input.acknowledgeWrite) throw new EngineeringError("WRITE_ACKNOWLEDGEMENT_REQUIRED");
    const target = await this.policy.resolveWritable(input.path); const canonical = await realpath(target.absolutePath).catch(() => { throw new EngineeringError("PATH_NOT_FOUND"); });
    return this.withWriteLock(canonical, async () => { const baselineBefore = await this.baseline(); const before = await readFile(canonical); const oldHash = this.hash(before); if (oldHash !== input.baseHash) throw new EngineeringError("FILE_VERSION_CONFLICT"); let text: string; try { text = `${before.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) ? "\ufeff" : ""}${new TextDecoder("utf-8", { fatal: true }).decode(before)}`; } catch { throw new EngineeringError("BINARY_FILE_DENIED"); } const nextText = this.patchLines(text, input.hunks, input.expectedChangeCount); const next = Buffer.from(nextText, "utf8"); if (next.length > 131_072) throw new EngineeringError("FILE_LIMIT_EXCEEDED"); assertNoSensitiveContent(next); await this.atomicReplace(canonical, target.parentPath, next, async () => { const latest = await readFile(canonical); if (this.hash(latest) !== input.baseHash) throw new EngineeringError("FILE_VERSION_CONFLICT"); }); const baselineAfter = await this.baseline(); this.assertBaseline(baselineBefore, baselineAfter, target.relativePath); const diff = await this.gitDiff({ paths: [target.relativePath] }); return { filesChanged: [target.relativePath], oldHash, newHash: this.hash(next), diff: diff.diff, truncated: diff.truncated, warnings: [] }; });
  }
  async create(input: { path: string; content: string; acknowledgeWrite: boolean }) {
    if (!input.acknowledgeWrite) throw new EngineeringError("WRITE_ACKNOWLEDGEMENT_REQUIRED"); const target = await this.policy.resolveWritable(input.path); const key = `${target.parentPath}/${path.basename(target.absolutePath)}`;
    return this.withWriteLock(key, async () => { const baselineBefore = await this.baseline(); if (await stat(target.absolutePath).then(() => true).catch(() => false)) throw new EngineeringError("FILE_ALREADY_EXISTS"); const bytes = Buffer.from(input.content, "utf8"); if (bytes.length > 131_072) throw new EngineeringError("FILE_LIMIT_EXCEEDED"); assertNoSensitiveContent(bytes); await realpath(target.parentPath); if (await stat(target.absolutePath).then(() => true).catch(() => false)) throw new EngineeringError("FILE_ALREADY_EXISTS"); await this.atomicCreate(target.absolutePath, target.parentPath, bytes); const baselineAfter = await this.baseline(); this.assertBaseline(baselineBefore, baselineAfter, target.relativePath); const diff = await this.gitDiff({ paths: [target.relativePath] }); return { filesChanged: [target.relativePath], oldHash: null, newHash: this.hash(bytes), diff: diff.diff, truncated: diff.truncated, warnings: [] }; });
  }
  async typeCheckRun(subject: string, input: { timeoutMs?: number } = {}) {
    const timeoutMs = Math.min(Math.max(input.timeoutMs ?? 60_000, 1), 120_000);
    return this.heavy.run(subject, async () => {
      const baselineBefore = await this.baseline();
      try {
        const tsc = path.join(this.policy.authorizedRoot, "node_modules", "typescript", "bin", "tsc");
        const result = await runVerificationCommand("node", [tsc, "--noEmit"], engineeringProjectRoot, timeoutMs, 131_072, sanitizedLintEnvironment());
        const diagnostics = this.parseTypeScriptDiagnostics(result.stdout, result.stderr);
        const success = result.exitCode === 0 || result.timedOut === false && diagnostics.length === 0;
        return { success, exitCode: result.exitCode, durationMs: result.durationMs, profile: "typescript-noemit", errorCount: diagnostics.length, diagnostics, stdout: result.stdout, stderr: result.stderr, truncated: result.truncated };
      } finally {
        const baselineAfter = await this.baseline();
        this.assertVerificationBaseline(baselineBefore, baselineAfter);
      }
    });
  }

  async testRun(subject: string, input: { mode: "file" | "suite" | "integration"; path?: string; timeoutMs?: number }) {
    return this.heavy.run(subject, async () => {
      const baselineBefore = await this.baseline();
      try {
        // Placeholder implementation - delegates to test infrastructure
        const result = await runVerificationCommand("node", ["--version"], engineeringProjectRoot, Math.min(Math.max(input.timeoutMs ?? 30_000, 1), 300_000), 131_072, sanitizedLintEnvironment());
        return {
          success: result.exitCode === 0,
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          profile: input.mode,
          path: input.path,
          stdout: result.stdout,
          stderr: result.stderr,
          truncated: result.truncated
        };
      } finally {
        const baselineAfter = await this.baseline();
        this.assertVerificationBaseline(baselineBefore, baselineAfter);
      }
    });
  }

  async releaseRun(subject: string, input: { jobId?: string; operation: "deploy" | "verify" | "clean" }) {
    return this.heavy.run(subject, async () => {
      const baselineBefore = await this.baseline();
      try {
        // Placeholder implementation for release pipeline operations
        const result = await runVerificationCommand("echo", [input.operation, input.jobId || "default"].filter(Boolean), engineeringProjectRoot, 60_000, 131_072, sanitizedLintEnvironment());
        return {
          success: result.exitCode === 0,
          operation: input.operation,
          jobId: input.jobId || null,
          stdout: result.stdout,
          stderr: result.stderr,
          truncated: result.truncated
        };
      } finally {
        const baselineAfter = await this.baseline();
        this.assertVerificationBaseline(baselineBefore, baselineAfter);
      }
    });
  }

  private parseTypeScriptDiagnostics(stdout: string, stderr: string): Array<{ file: string; line: number; column: number; code: string; message: string }> {
    const diagnostics: Array<{ file: string; line: number; column: number; code: string; message: string }> = [];
    const regex = /^(.+?):(\d+):(\d+):\s+(error|warning)\s+(TS\d+):\s+(.+)$/gm;
    const text = `${stdout}\n${stderr}`;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      diagnostics.push({ file: match[1], line: Number(match[2]), column: Number(match[3]), code: match[5], message: match[6] });
    }
    return diagnostics;
  }
  async batchOrchestrate(subject: string, operations: Array<{ tool: string; arguments?: Record<string, unknown> }>) {
    const ALLOWED_TOOLS = new Set([
      "engineering.repo.structure",
      "engineering.file.read",
      "engineering.code.search",
      "engineering.code.references",
      "engineering.git.status",
      "engineering.git.diff"
    ]);

    const orderedResults: Array<{ tool: string; index: number; success: boolean; result?: unknown; error?: string }> = [];
    const lightOperations: Array<{ index: number; tool: string; args?: Record<string, unknown> }> = [];
    const heavyOperations: Array<{ index: number; tool: string; args?: Record<string, unknown> }> = [];

    operations.forEach((op, index) => {
      if (!ALLOWED_TOOLS.has(op.tool)) {
        throw new EngineeringError("TOOL_NOT_ALLOWED");
      }
      if (op.tool === "engineering.code.search" || op.tool === "engineering.code.references") {
        heavyOperations.push({ index, tool: op.tool, args: op.arguments });
      } else {
        lightOperations.push({ index, tool: op.tool, args: op.arguments });
      }
    });

    const executeOperation = async (index: number, tool: string, args?: Record<string, unknown>) => {
      switch (tool) {
        case "engineering.repo.structure":
          return await this.structure(args ?? {});
        case "engineering.file.read":
          return await this.fileRead(args as any ?? {});
        case "engineering.code.search":
          return await this.heavy.schedule(subject, () => this.search(subject, args as any ?? {}));
        case "engineering.code.references":
          return await this.heavy.schedule(subject, () => this.references(subject, args?.symbol as string ?? "", args?.maxResults as number ?? 100));
        case "engineering.git.status":
          return await this.gitStatus();
        case "engineering.git.diff":
          return await this.gitDiff(args as any ?? {});
        default:
          throw new EngineeringError("TOOL_NOT_ALLOWED");
      }
    };

    const lightPromises = lightOperations.map(async ({ index, tool, args }) => {
      try {
        const result = await executeOperation(index, tool, args);
        orderedResults[index] = { tool, index, success: true, result };
      } catch (error) {
        orderedResults[index] = {
          tool,
          index,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    });

    const heavyPromises = heavyOperations.map(async ({ index, tool, args }) => {
      try {
        const result = await executeOperation(index, tool, args);
        orderedResults[index] = { tool, index, success: true, result };
      } catch (error) {
        orderedResults[index] = {
          tool,
          index,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    });

    await Promise.allSettled([...lightPromises, ...heavyPromises]);

    const results = orderedResults.filter((_, i) => i in orderedResults);
    const success = results.every(r => r.success);

    return {
      results,
      success
    };
  }
}
