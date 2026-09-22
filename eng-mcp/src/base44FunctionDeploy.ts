// BASE44-CLI-01 — engineering.base44.function.deploy: governed single-function
// deploy of repo backend functions (/opt/memoryos/base44/functions/<name>) via
// the governed CLI spawn layer (src/base44Cli.ts).
//
// Invariants:
//   - ONE named function per call (schema takes a single string; the CLI's
//     "deploys all when omitted" is structurally unreachable) and the name is
//     allowlisted, so a typo can never deploy the wrong function. `--force`
//     (remote deletion) is never constructed.
//   - The intended source change reaches the repo copy through an optional
//     structured `patch` input (same shape as file.patch/manifest edit: baseHash
//     optimistic concurrency + hunks), applied server-side to one allowlisted
//     file under functions/<name>/ via a parent-root RepositoryPolicy. The
//     caller never writes transport-level files; the tool never takes raw exec.
//   - PLAN pulls the LIVE source into a throwaway temp dir (never the repo
//     working tree) and diffs it against the repo source — the caller sees the
//     exact per-file diff before any approval, plus previous live hashes.
//   - NO_OP refuses execution on identical sources — a Base44 round-trip with
//     zero change is the pointless thing this tool exists to prevent.
//   - External SaaS: no transactional rollback. The PLAN records previous live
//     source hashes; the reversal path is a re-deploy of the previous source
//     (recovered via functions pull), reported honestly in the result.
//   - Post-deploy probe: wired by the registry layer for the bridge function
//     (one authorized read-only context call); probe failure is reported as
//     DEPLOYED_PROBE_FAILED — never silenced, never retried automatically.
//   - Audit /data/audit/base44-function.jsonl carries hashes + result only.
import * as z from "zod/v4";
import { appendFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeSync } from "node:fs";
import { chmodSync, closeSync, lstatSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import * as pathModule from "node:path";
import { EngineeringError, RepositoryPolicy, assertNoSensitiveContent } from "./policy.js";
import { assertCliOk, classifyBase44CliFailure, isValidFunctionName, makeBase44CliRunner, type Base44CliDeps, type Base44CliOperation, type Base44CliRun } from "./base44Cli.ts";

export const BASE44_FUNCTION_DEPLOY_STATUSES = ["PLAN", "NO_OP", "BLOCKED", "DEPLOYED", "DEPLOYED_PROBE_FAILED"] as const;
export type Base44FunctionDeployStatus = (typeof BASE44_FUNCTION_DEPLOY_STATUSES)[number];

export const BASE44_FUNCTION_DEPLOY_DEFAULTS = {
  functionNames: ["agentMemoryBridge"] as readonly string[],
  auditFile: "/data/audit/base44-function.jsonl",
  diffMaxLines: 200,
} as const;

export const base44FunctionDeployInputSchema = z.object({
  function: z.string().min(1).max(64),
  appId: z.string().min(8).max(64).optional(),
  patch: z.object({
    path: z.string().min(1).max(400),
    baseHash: z.string().regex(/^[a-f0-9]{64}$/),
    hunks: z.array(z.object({
      startLine: z.number().int(),
      deleteLines: z.array(z.string()),
      insertLines: z.array(z.string()),
    })).min(1),
    expectedChangeCount: z.number().int().optional(),
  }).strict().optional(),
  execute: z.boolean().optional(),
  approval: z.object({ approved: z.boolean() }).strict().optional(),
  acknowledgeWrite: z.literal(true),
}).strict();
export type Base44FunctionDeployInput = z.infer<typeof base44FunctionDeployInputSchema>;

export interface Base44FunctionDeployDeps {
  runner?: (operation: Base44CliOperation, callDeps?: Base44CliDeps) => Promise<Base44CliRun>;
  functionNames?: readonly string[];
  auditFile?: string;
  diffMaxLines?: number;
  authorizerHash16?: string;
  env?: NodeJS.ProcessEnv;
  apiKey?: string;
  apiKeyFile?: string;
  appId?: string;
  memoryOsRoot?: string;   // parent repo root (default /opt/memoryos via ENG_MCP_MEMORYOS_SYNC_ROOT)
  probe?: () => Promise<{ ok: boolean; detail?: string }>;
  now?: () => number;
}

export interface Base44FunctionDeployFinding {
  code: string;
  severity: "critical" | "warning" | "info";
  detail?: string;
}

export interface FileDiff {
  path: string;
  same: boolean;
  added: number;
  removed: number;
  diff: string;
}

export interface Base44FunctionDeployResult {
  tool: "engineering.base44.function.deploy";
  status: Base44FunctionDeployStatus;
  mutationPerformed: boolean;
  function: string;
  appId: string;
  base44Dir: string;
  patch?: { path: string; oldHash: string; newHash: string };
  repoSourceFiles?: string[];
  liveSourceFiles?: string[];
  previousLiveSha16?: Record<string, string>;
  diffs: FileDiff[];
  wouldChange: boolean;
  diffSha16: string | null;
  plan: { action: "deploy_function"; possible: boolean; requires: string[] };
  rollback: { reversal: string };
  cliRun?: { exitCode: number | null; timedOut: boolean; durationMs: number; stdoutSha16: string | null };
  probe?: { ok: boolean; detail?: string };
  redeployWarning: boolean;
  blockers?: string[];
  findings: Base44FunctionDeployFinding[];
}

const sha256Hex = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const sha16 = (bytes: Buffer): string => sha256Hex(bytes).slice(0, 16);

function emitAudit(auditFile: string, line: Record<string, unknown>): void {
  try {
    mkdirSync(pathModule.dirname(auditFile), { recursive: true });
    appendFileSync(auditFile, `${JSON.stringify(line)}\n`);
  } catch {
    // audit is observability-only; never block the governed action on it
  }
}

// ---- module-local structured patcher (same semantics as repository.patchLines) ----

function patchLines(text: string, hunks: Array<{ startLine: number; deleteLines: string[]; insertLines: string[] }>, expected?: number): string {
  if (expected !== undefined && expected !== hunks.length) throw new EngineeringError("PATCH_CHANGE_COUNT_MISMATCH");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  if (text.includes("\r\n") && /(?<!\r)\n/.test(text)) throw new EngineeringError("MIXED_LINE_ENDINGS_UNSUPPORTED");
  const finalNewline = text.endsWith(eol);
  const bom = text.startsWith("﻿");
  const body = bom ? text.slice(1) : text;
  const lines = body === "" ? [] : body.slice(0, finalNewline ? -eol.length : undefined).split(eol);
  let last = 0;
  for (const hunk of hunks) {
    if (!Number.isInteger(hunk.startLine) || hunk.startLine < 1 || hunk.startLine < last || hunk.startLine > lines.length + 1) {
      throw new EngineeringError("PATCH_HUNKS_OVERLAP");
    }
    const index = hunk.startLine - 1;
    if (hunk.deleteLines.some((line, offset) => lines[index + offset] !== line)) {
      throw new EngineeringError("PATCH_CONTEXT_MISMATCH");
    }
    last = hunk.startLine + Math.max(1, hunk.deleteLines.length);
  }
  for (const hunk of [...hunks].reverse()) lines.splice(hunk.startLine - 1, hunk.deleteLines.length, ...hunk.insertLines);
  return `${bom ? "﻿" : ""}${lines.join(eol)}${finalNewline ? eol : ""}`;
}

function atomicWrite(target: string, bytes: Buffer): void {
  const dir = pathModule.dirname(target);
  const tmp = pathModule.join(dir, `.${pathModule.basename(target)}.deploy-tmp-${process.pid}-${Date.now().toString(36)}`);
  const fd = openSync(tmp, "wx", 0o644);
  try {
    writeSync(fd, bytes);
    closeSync(fd);
    renameSync(tmp, target);
  } catch (error) {
    try { closeSync(fd); } catch { /* already closed */ }
    try { rmSync(tmp, { force: true }); } catch { /* best-effort */ }
    throw error;
  }
}

// ---- diff engine (line-level LCS, bounded output) ----

function lineDiff(aLines: string[], bLines: string[], cap: number): { added: number; removed: number; text: string[] } {
  const n = aLines.length, m = bLines.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = aLines[i] === bLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: string[] = [];
  let added = 0, removed = 0, i = 0, j = 0;
  while (i < n && j < m) {
    if (aLines[i] === bLines[j]) { ops.push(`  ${aLines[i]}`); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { removed++; ops.push(`- ${aLines[i]}`); i++; }
    else { added++; ops.push(`+ ${bLines[j]}`); j++; }
  }
  while (i < n) { removed++; ops.push(`- ${aLines[i++]}`); }
  while (j < m) { added++; ops.push(`+ ${bLines[j++]}`); }
  const capped = ops.length > cap
    ? [...ops.slice(0, cap), `...[TRUNCATED ${ops.length - cap} more diff lines]`]
    : ops;
  return { added, removed, text: capped };
}

// ---- source discovery (repo copy + pulled live copy) ----

function readFunctionSource(dir: string): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  if (!existsSync(dir)) return out;
  const walk = (current: string, rel: string): void => {
    let info: ReturnType<typeof lstatSync>;
    try { info = lstatSync(current); } catch { return; }
    if (info.isSymbolicLink()) return;
    if (info.isDirectory()) {
      for (const entry of readdirSync(current)) walk(pathModule.join(current, entry), rel ? `${rel}/${entry}` : entry);
    } else if (info.isFile()) {
      out.set(rel, readFileSync(current));
    }
  };
  walk(dir, "");
  return out;
}

function locatePulledFunctionDir(tmp: string, name: string): string | null {
  const direct = pathModule.join(tmp, "functions", name);
  if (existsSync(direct)) return direct;
  const stack: Array<{ dir: string; depth: number }> = [{ dir: tmp, depth: 0 }];
  while (stack.length > 0) {
    const item = stack.shift();
    if (!item || item.depth > 3) continue;
    let entries: string[];
    try { entries = readdirSync(item.dir); } catch { continue; }
    for (const entry of entries) {
      const full = pathModule.join(item.dir, entry);
      let info: ReturnType<typeof statSync>;
      try { info = statSync(full); } catch { continue; }
      if (info.isDirectory()) {
        if (entry === name && existsSync(pathModule.join(full, "entry.ts"))) return full;
        stack.push({ dir: full, depth: item.depth + 1 });
      }
    }
  }
  return null;
}

function hashSourceMap(source: Map<string, Buffer>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [rel, bytes] of [...source.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    out[rel] = sha16(bytes);
  }
  return out;
}

function diffFileSets(repo: Map<string, Buffer>, live: Map<string, Buffer>, capLines: number): FileDiff[] {
  const paths = [...new Set([...repo.keys(), ...live.keys()])].sort((a, b) => a.localeCompare(b));
  return paths.map((p) => {
    const repoBytes = repo.get(p) ?? null;
    const liveBytes = live.get(p) ?? null;
    const repoText = repoBytes ? repoBytes.toString("utf8") : null;
    const liveText = liveBytes ? liveBytes.toString("utf8") : null;
    if (repoText === liveText) {
      return { path: p, same: true, added: 0, removed: 0, diff: "" };
    }
    const { added, removed, text } = lineDiff((repoText ?? "").split("\n"), (liveText ?? "").split("\n"), capLines);
    return { path: p, same: false, added, removed, diff: text.join("\n") };
  });
}

export async function runBase44FunctionDeploy(rawInput: unknown, deps: Base44FunctionDeployDeps = {}): Promise<Base44FunctionDeployResult> {
  const input = base44FunctionDeployInputSchema.parse(rawInput ?? {});
  const cfg = {
    functionNames: deps.functionNames ?? BASE44_FUNCTION_DEPLOY_DEFAULTS.functionNames,
    auditFile: deps.auditFile ?? BASE44_FUNCTION_DEPLOY_DEFAULTS.auditFile,
    diffMaxLines: deps.diffMaxLines ?? BASE44_FUNCTION_DEPLOY_DEFAULTS.diffMaxLines,
    env: deps.env ?? process.env,
  };
  if (!isValidFunctionName(input.function)) throw new EngineeringError("BASE44_FUNCTION_NAME_INVALID");
  if (!cfg.functionNames.includes(input.function)) throw new EngineeringError("BASE44_FUNCTION_NOT_ALLOWED");
  const memoryOsRoot = deps.memoryOsRoot ?? cfg.env.ENG_MCP_MEMORYOS_SYNC_ROOT ?? "/opt/memoryos";
  const base44Dir = pathModule.join(memoryOsRoot, "base44");
  const functionDir = pathModule.join(base44Dir, "functions", input.function);
  const appId = input.appId ?? deps.appId ?? cfg.env.ENG_MCP_BASE44_APP_ID ?? "";
  const runner = deps.runner ?? makeBase44CliRunner({
    apiKey: deps.apiKey,
    apiKeyFile: deps.apiKeyFile,
    appId,
    projectDir: base44Dir,
    env: cfg.env,
  });
  const findings: Base44FunctionDeployFinding[] = [];
  const blockers: string[] = [];

  // 1) Optional governed source patch: the ONLY channel the intended change
  // travels through — structured hunks, version-checked, allowlisted to
  // functions/<name>/**, applied server-side against the parent-repo copy.
  let patchEvidence: Base44FunctionDeployResult["patch"] | undefined;
  if (input.patch) {
    const patchPath = input.patch.path;
    const allowedPrefix = `functions/${input.function}/`;
    const malformed = typeof patchPath !== "string"
      || patchPath.includes("\\")
      || patchPath.includes("..")
      || patchPath.startsWith("/")
      || !patchPath.startsWith(allowedPrefix);
    if (malformed) throw new EngineeringError("BASE44_PATCH_PATH_NOT_ALLOWED");
    const parentPolicy = await RepositoryPolicy.create(base44Dir);
    const resolved = await parentPolicy.resolveWritable(patchPath);
    const before = readFileSync(resolved.absolutePath);
    const oldHash = sha256Hex(before);
    if (oldHash !== input.patch.baseHash) throw new EngineeringError("FILE_VERSION_CONFLICT");
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(before);
    } catch {
      throw new EngineeringError("BINARY_FILE_DENIED");
    }
    const nextText = patchLines(text, input.patch.hunks, input.patch.expectedChangeCount);
    assertNoSensitiveContent(nextText);
    const next = Buffer.from(nextText, "utf8");
    atomicWrite(resolved.absolutePath, next);
    patchEvidence = { path: resolved.relativePath, oldHash, newHash: sha256Hex(next) };
    findings.push({ code: "BASE44_PATCH_APPLIED", severity: "info", detail: `${resolved.relativePath} ${oldHash.slice(0, 16)} -> ${patchEvidence.newHash.slice(0, 16)}` });
  }

  // 2) PLAN evidence: pull LIVE source into a throwaway temp dir (never the
  // repo tree) and diff against the repo source.
  const tmp = pathModule.join(tmpdir(), `base44-pull-${process.pid}-${Date.now().toString(36)}`);
  let liveFiles: Map<string, Buffer>;
  let liveDir: string | null;
  let pullRun: Base44CliRun | null = null;
  let pullEvidence: { stdout: string; stderr: string } | null = null;
  try {
    mkdirSync(tmp, { recursive: true });
    try { chmodSync(tmp, 0o700); } catch { /* best-effort */ }
    try {
      pullRun = await runner({ kind: "functionPull", name: input.function }, { projectDir: tmp });
      assertCliOk(pullRun);
    } catch (error) {
      const code = error instanceof EngineeringError ? error.code : "BASE44_CLI_FAILED";
      findings.push({ code, severity: "critical", detail: "functions pull failed during PLAN" });
      blockers.push(code);
    }
    if (blockers.length === 0 && pullRun) {
      liveDir = locatePulledFunctionDir(tmp, input.function);
      liveFiles = liveDir ? readFunctionSource(liveDir) : new Map();
      if (!liveDir || liveFiles.size === 0) {
        pullEvidence = pullRun
          ? { stdout: pullRun.stdout.slice(0, 2_000), stderr: pullRun.stderr.slice(0, 2_000) }
          : null;
        findings.push({ code: "BASE44_PULL_LAYOUT_UNKNOWN", severity: "critical", detail: "pull did not produce functions/<name> sources; inspect the pull output evidence — do not improvise (SaaS boundary)" });
        blockers.push("BASE44_PULL_LAYOUT_UNKNOWN");
      }
    } else {
      liveFiles = new Map();
      liveDir = null;
    }
  } catch (error) {
    blockers.push("BASE44_PLAN_FAILED");
    findings.push({ code: "BASE44_PLAN_FAILED", severity: "critical", detail: String((error as Error)?.message ?? error).slice(0, 200) });
    liveFiles = new Map();
    liveDir = null;
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* temp dir best-effort */ }
  }

  const repoFiles = blockers.length === 0 ? readFunctionSource(functionDir) : new Map<string, Buffer>();
  if (blockers.length === 0 && repoFiles.size === 0) {
    findings.push({ code: "BASE44_REPO_SOURCE_MISSING", severity: "critical", detail: `no repo source under ${functionDir}` });
    blockers.push("BASE44_REPO_SOURCE_MISSING");
  }
  const diffs = blockers.length === 0 ? diffFileSets(repoFiles, liveFiles, cfg.diffMaxLines) : [];
  const wouldChange = diffs.some((d) => !d.same);
  const diffText = diffs.map((d) => `--- ${d.path}\n${d.diff}`).join("\n");
  const diffSha16 = blockers.length === 0 ? sha16(Buffer.from(diffText, "utf8")) : null;
  const previousLiveSha16 = blockers.length === 0 ? hashSourceMap(liveFiles) : undefined;
  const repoSourceFiles = blockers.length === 0 ? [...repoFiles.keys()].sort((a, b) => a.localeCompare(b)) : undefined;
  const liveSourceFiles = blockers.length === 0 ? [...liveFiles.keys()].sort((a, b) => a.localeCompare(b)) : undefined;

  const mutationApproved = input.execute === true && input.approval?.approved === true;
  const plan = { action: "deploy_function" as const, possible: blockers.length === 0, requires: ["execute=true", "approval.approved=true"] };
  const base: Omit<Base44FunctionDeployResult, "status" | "mutationPerformed"> = {
    tool: "engineering.base44.function.deploy",
    function: input.function,
    appId,
    base44Dir,
    ...(patchEvidence ? { patch: patchEvidence } : {}),
    repoSourceFiles,
    liveSourceFiles,
    previousLiveSha16,
    diffs,
    wouldChange,
    diffSha16,
    plan,
    rollback: { reversal: "re-deploy the previous live source — re-pull it with base44 functions pull <name> and re-run this tool; the PLAN's previousLiveSha16 records what must come back" },
    redeployWarning: true,
    findings,
  };

  const audit = (result: string, extra: Record<string, unknown> = {}): void => {
    emitAudit(cfg.auditFile, {
      ts: new Date((deps.now ?? Date.now)()).toISOString(),
      tool: "engineering.base44.function.deploy",
      function: input.function,
      app_id: appId,
      diff_hash16: diffSha16,
      result,
      authorizerHash16: deps.authorizerHash16 ?? null,
      ...extra,
    });
  };

  if (blockers.length === 0) {
    audit("PLAN");
  }
  if (!mutationApproved) {
    return {
      ...base,
      status: blockers.length > 0 ? "BLOCKED" : "PLAN",
      mutationPerformed: false,
      ...(blockers.length > 0 ? { blockers } : {}),
      ...(pullEvidence ? { findings: [...findings, { code: "BASE44_PULL_EVIDENCE", severity: "info", detail: JSON.stringify(pullEvidence).slice(0, 2_000) }] } : {}),
    };
  }
  if (blockers.length > 0) {
    return { ...base, status: "BLOCKED", mutationPerformed: false, blockers };
  }
  if (!wouldChange) {
    audit("NO_OP");
    return { ...base, status: "NO_OP", mutationPerformed: false, findings: [...findings, { code: "BASE44_SOURCES_IDENTICAL", severity: "info", detail: "repo source equals live source; deploy refused to avoid a pointless SaaS round-trip" }] };
  }

  // 3) Execute: deploy the repo source (cwd = base44 project dir). One named
  // function; --force unreachable by construction.
  const deployRun = await runner({ kind: "functionsDeploy", name: input.function });
  const cliRun = {
    exitCode: deployRun.exitCode,
    timedOut: deployRun.timedOut,
    durationMs: deployRun.durationMs,
    stdoutSha16: deployRun.stdout ? sha16(Buffer.from(deployRun.stdout, "utf8")) : null,
  };
  if (!deployRun.ok) {
    audit("DEPLOY_FAILED", { exit_code: deployRun.exitCode, timed_out: deployRun.timedOut, auth_rejected: deployRun.authRejected });
    // SaaS side may be partially affected and has no transactional rollback:
    // the honest outcome is the canonical error plus the audit line above.
    throw classifyBase44CliFailure(deployRun);
  }

  // 4) Post-deploy probe (registry-wired for the bridge). Failure is honest,
  // never silenced: DEPLOYED_PROBE_FAILED.
  let probeResult: { ok: boolean; detail?: string } | null = null;
  if (deps.probe) {
    try {
      probeResult = await deps.probe();
    } catch (error) {
      probeResult = { ok: false, detail: String((error as Error)?.message ?? error).slice(0, 200) };
    }
  }
  const status: Base44FunctionDeployStatus = deps.probe ? (probeResult && probeResult.ok ? "DEPLOYED" : "DEPLOYED_PROBE_FAILED") : "DEPLOYED";
  audit(status, { exit_code: deployRun.exitCode, probe_ok: deps.probe ? Boolean(probeResult?.ok) : null });
  return {
    ...base,
    status,
    mutationPerformed: true,
    cliRun,
    ...(probeResult ? { probe: probeResult } : {}),
    findings: [...findings, ...(status === "DEPLOYED_PROBE_FAILED" ? [{ code: "BASE44_PROBE_FAILED", severity: "warning" as const, detail: probeResult?.detail ?? "post-deploy probe reported failure" }] : [])],
  };
}