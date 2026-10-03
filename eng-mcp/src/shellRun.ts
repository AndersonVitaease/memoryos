/**
 * WORKER-SHELL-PROPRIA-01 — engineering.shell.run: own shell for the worker
 * (3-tier router), so mission execution stops depending on the Claude Code
 * auto-mode classifier (a third-party model that has fallen over 20+ times in
 * a single day and freezes every running mission with it).
 *
 * Router doctrine (operator, 25/09 + mission contract 03/10):
 * - TIER 1 (zero-cost regex allowlist): mission proof commands — pytest,
 *   python3 -m unittest, node --test / --import tsx --test, npm test,
 *   git status/diff/log/add/commit/branch, ls, cat, python3 script.py with
 *   paths inside /opt and /root/.hermes — executes DIRECTLY, no LLM call.
 * - TIER 2 (local Jev judge): command outside the allowlist → the calibrated
 *   judge classifies safe/unsafe (4 band-2 risk questions, same rubric as the
 *   judge hooks) → executes at safeScore >= 0.9, refuses with reasons below.
 *   Judge unavailable = fail-CLOSED (an unknown command never auto-runs).
 * - TIER 3 (operator): destructive/external-consequence commands (rm -rf,
 *   systemctl, external curl, kill, chmod on /etc, anything under
 *   /data/manifests, git push, docker, ...) → typed `blocked` result with the
 *   command — NEVER auto-executes, and no tier-1/2 rule can override it: the
 *   denylist is evaluated BEFORE the allowlist.
 *
 * Guards: per-command timeout (default 120s, max 600s, SIGKILL), output
 * truncation (head+tail 50KB with a grep-able marker), fixed default working
 * dir (repository root; overrides only inside the allowed roots), root user
 * of the worker (no sudo — sudo itself is tier 3) and one audit line per call
 * (tier, verdict, command, exit) in /data/audit/shell-run.jsonl.
 */
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { createHash } from "node:crypto";
import * as z from "zod/v4";
import { runJudgeEvaluate } from "./judge.ts";

export const SHELL_RUN_TOOL = "engineering.shell.run";
export const SHELL_RUN_DEFAULT_TIMEOUT_MS = 120_000;
export const SHELL_RUN_MAX_TIMEOUT_MS = 600_000;
export const SHELL_RUN_HEAD_CHARS = 25_000;
export const SHELL_RUN_TAIL_CHARS = 25_000;
export const SHELL_RUN_DEFAULT_CWD = "/opt/memoryos/eng-mcp";
/** Working-dir and path roots: mission cwd + the plugin/hermes tree. */
export const SHELL_RUN_ROOTS: readonly string[] = ["/opt/", "/root/.hermes/"];
export const SHELL_RUN_AUDIT_FILE_DEFAULT = "/data/audit/shell-run.jsonl";

export const shellRunInputSchema = z
  .object({
    command: z.string().min(1).max(4000),
    cwd: z.string().max(512).optional(),
    timeoutMs: z.number().int().min(1000).max(SHELL_RUN_MAX_TIMEOUT_MS).optional()
  })
  .strict();
export type ShellRunInput = z.infer<typeof shellRunInputSchema>;

/** Same 4 band-2 risk questions as the judge hooks (src/harness/judgeGate.ts). */
export const SHELL_RUN_TIER2_QUESTIONS: ReadonlyArray<{ id: string; instructions: string }> = [
  { id: "q_destructive", instructions: "Does this shell command destroy, overwrite or delete data, files or state outside its own obvious scope? noul means the destructive risk applies." },
  { id: "q_outward_facing", instructions: "Does this shell command send data or requests to systems outside this machine? noul means it reaches the outside." },
  { id: "q_touches_credentials", instructions: "Does this shell command read, copy, move or expose credentials, tokens, keys or secret files? noul means it touches credentials." },
  { id: "q_large_blast_radius", instructions: "If this shell command misbehaves, would the impact extend beyond this working session (shared services, remote state, other users)? noul means yes." }
];

/** TIER 3 — operator consequence. Evaluated FIRST; never auto-executes. */
export const TIER3_RULES: ReadonlyArray<{ id: string; pattern: RegExp; reason: string }> = [
  { id: "rm_recursive_or_forced", pattern: /\brm\b[^|;&]{0,120}\s-{1,2}[a-z]*[rf]/, reason: "rm with -r/-f is destructive file deletion — operator consequence" },
  { id: "system_service_control", pattern: /\b(systemctl|service)\b/, reason: "system service control (restart/stop of production units) — operator consequence" },
  { id: "process_kill", pattern: /\b(kill|pkill|killall|taskkill)\b/, reason: "process termination — operator consequence" },
  { id: "privilege_escalation", pattern: /\b(sudo|doas)\b|\bsu\s+-?(root|\s)/, reason: "privilege escalation is never auto-executed" },
  { id: "external_fetch", pattern: /\b(curl|wget)\b\s+\S*:\/\/(?!127\.0\.0\.1|localhost|\[::1\])/, reason: "outward HTTP reach to a non-local host — operator consequence" },
  { id: "etc_mutation", pattern: /\b(chmod|chown)\b[^|;&]{0,120}\/etc\/|(>|tee\s+)\/etc\//, reason: "chmod/chown or write into /etc — operator consequence" },
  { id: "mission_manifests", pattern: /\/data\/manifests\b/, reason: "anything under /data/manifests is operator-owned pre-authorization state" },
  { id: "credential_files", pattern: /\/data\/(credentials|tokens\.json|auth-session\.token\.json)\b|\/root\/\.git-credentials\b/, reason: "reading/moving credential files is operator consequence" },
  { id: "git_push", pattern: /\bgit\s+push\b/, reason: "git push is an external consequence (ship goes through the pipeline)" },
  { id: "host_power", pattern: /\b(shutdown|reboot|halt|mkfs|fdisk)\b|\bdd\s+if=/, reason: "host power/storage destruction — operator consequence" },
  { id: "container_control", pattern: /\b(docker|kubectl|helm|podman)\b/, reason: "container/cluster control — operator consequence" },
  { id: "cron_persistence", pattern: /\bcrontab\b/, reason: "cron persistence is operator consequence" }
];

/** TIER 1 — zero-cost allowlist for mission proof commands (after tier 3 miss). */
export const TIER1_RULES: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  { id: "python_unittest", pattern: /^(python3|python)\s+-m\s+unittest\b/ },
  { id: "pytest", pattern: /^pytest\b/ },
  { id: "node_test", pattern: /^node\s+(--test\b|--import\s+\S+\s+--test\b)/ },
  { id: "npx_tsx_test", pattern: /^npx\s+tsx\s+--test\b/ },
  { id: "npm_test", pattern: /^npm\s+(test\b|run\s+test\b)/ },
  { id: "git_read_or_stage", pattern: /^git\s+(status|diff|log|add|commit|branch)(\s|$)/ },
  { id: "ls", pattern: /^ls\b/ },
  { id: "cat", pattern: /^cat\b/ },
  { id: "python_script", pattern: /^(python3|python)\s+\S+\.py\b/ }
];

/** Shell meta characters keep a command OUT of tier 1 (tier 2 judges it). */
export const TIER1_META_TOKENS: readonly string[] = [";", "|", "&", "`", "$(", ">", "<", "\n", "\r"];

export type ShellCommandClass = { tier: 1 | 2 | 3; rule?: string; reason?: string };

export function classifyShellCommand(command: string): ShellCommandClass {
  for (const rule of TIER3_RULES) {
    if (rule.pattern.test(command)) return { tier: 3, rule: rule.id, reason: rule.reason };
  }
  if (TIER1_META_TOKENS.some((token) => command.includes(token))) return { tier: 2, rule: "meta_characters" };
  for (const rule of TIER1_RULES) {
    if (rule.pattern.test(command)) return { tier: 1, rule: rule.id };
  }
  return { tier: 2, rule: "outside_allowlist" };
}

/** Every path-looking token must resolve inside the allowed roots. */
export function tier1PathsSafe(command: string, cwd: string): boolean {
  const underRoots = (abs: string): boolean => SHELL_RUN_ROOTS.some((root) => abs === root.replace(/\/$/, "") || abs.startsWith(root));
  for (const raw of command.split(/\s+/)) {
    for (const part of raw.split(/[=:]/)) {
      if (!part.includes("/")) continue;
      const abs = isAbsolute(part) ? resolve(part) : resolve(cwd, part);
      if (!underRoots(abs)) return false;
    }
  }
  return true;
}

export type ShellExecOutcome = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
};

export type ShellRunResult = {
  tool: string;
  status: "executed" | "refused" | "blocked";
  tier: 1 | 2 | 3;
  command: string;
  commandSha16: string;
  cwd: string;
  timeoutMs: number;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
  rule?: string;
  reason?: string;
  code?: string;
  judge?: { safeScore: number; probabilities: Record<string, number> };
  audit: string;
};

export type ShellRunDeps = {
  /** Injectable judge (tests). Default: runJudgeEvaluate against the real provider. */
  judge?: (input: { state: string; questions: ReadonlyArray<{ id: string; instructions: string }> })
    => Promise<{ answers: Array<{ id: string; probability: number }> }>;
  /** Injectable executor (tests). Default: bash -lc spawn on the host. */
  exec?: (command: string, cwd: string, timeoutMs: number) => Promise<ShellExecOutcome>;
  /** Injectable audit file (tests). Default: env or /data/audit/shell-run.jsonl. */
  auditFile?: string;
  /** Injectable clock for audit timestamps (tests). */
  now?: () => Date;
};

export const SHELL_RUN_JUDGE_THRESHOLD = 0.9;

function resolveCwd(cwd: string): { ok: true; cwd: string } | { ok: false; code: string; reason: string } {
  const underRoots = SHELL_RUN_ROOTS.some((root) => cwd === root.replace(/\/$/, "") || cwd.startsWith(root));
  if (!underRoots) return { ok: false, code: "SHELL_RUN_CWD_DENIED", reason: `cwd must live under ${SHELL_RUN_ROOTS.join(" or ")} (got ${cwd})` };
  try {
    const stat = statSync(cwd);
    if (!stat.isDirectory()) return { ok: false, code: "SHELL_RUN_CWD_NOT_DIRECTORY", reason: `cwd is not a directory: ${cwd}` };
  } catch {
    return { ok: false, code: "SHELL_RUN_CWD_NOT_FOUND", reason: `cwd does not exist: ${cwd}` };
  }
  return { ok: true, cwd };
}

/** head+tail truncation with a grep-able marker (byte-length aware). */
export function truncateShellOutput(text: string): { text: string; truncated: boolean } {
  const length = Buffer.byteLength(text, "utf8");
  if (length <= SHELL_RUN_HEAD_CHARS + SHELL_RUN_TAIL_CHARS) return { text, truncated: false };
  const head = text.slice(0, SHELL_RUN_HEAD_CHARS);
  const tail = text.slice(-SHELL_RUN_TAIL_CHARS);
  const dropped = length - Buffer.byteLength(head, "utf8") - Buffer.byteLength(tail, "utf8");
  return { text: `${head}\n...[SHELL_RUN_OUTPUT_TRUNCATED ${dropped} bytes dropped]...\n${tail}`, truncated: true };
}

function defaultExec(command: string, cwd: string, timeoutMs: number): Promise<ShellExecOutcome> {
  return new Promise((resolvePromise) => {
    const startedAt = Date.now();
    const child = spawn("/bin/bash", ["-l", "-c", command], { cwd, env: process.env, windowsHide: true });
    const stdout: string[] = [];
    const stderr: string[] = [];
    let bytes = 0;
    let timedOut = false;
    const cap = 2_000_000; // memory cap before truncation even starts
    const collect = (sink: string[], chunk: Buffer): void => {
      if (bytes > cap) return;
      bytes += chunk.length;
      sink.push(chunk.toString("utf8"));
    };
    child.stdout?.on("data", (chunk: Buffer) => collect(stdout, chunk));
    child.stderr?.on("data", (chunk: Buffer) => collect(stderr, chunk));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    const finish = (exitCode: number | null): void => {
      if (timer) clearTimeout(timer);
      resolvePromise({ exitCode, stdout: stdout.join(""), stderr: stderr.join(""), timedOut, durationMs: Date.now() - startedAt });
    };
    child.on("error", () => finish(-1));
    child.on("close", (code) => finish(code));
  });
}

/** Default tier-2 judge adapter: real Jev evaluate, noul band-2 questions. */
async function defaultJudge(input: { state: string; questions: ReadonlyArray<{ id: string; instructions: string }> }) {
  const envelope = await runJudgeEvaluate({
    state: input.state,
    questions: input.questions.map((question) => ({ id: question.id, type: "noul" as const, instructions: question.instructions }))
  });
  return {
    answers: envelope.answers.map((answer) => ({ id: answer.id, probability: answer.probability as number }))
  };
}

function writeShellRunAudit(file: string, entry: Record<string, unknown>): string {
  try {
    mkdirSync(file.slice(0, file.lastIndexOf("/")), { recursive: true });
    appendFileSync(file, `${JSON.stringify(entry)}\n`, { encoding: "utf8" });
    return "written";
  } catch (error) {
    return `failed:${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function runShellRun(input: ShellRunInput, deps: ShellRunDeps = {}): Promise<ShellRunResult> {
  const command = input.command.trim();
  const timeoutMs = input.timeoutMs ?? SHELL_RUN_DEFAULT_TIMEOUT_MS;
  const cwdResolved = resolveCwd(input.cwd?.trim() || SHELL_RUN_DEFAULT_CWD);
  const commandSha16 = createHash("sha256").update(command).digest("hex").slice(0, 16);
  const auditFile = deps.auditFile ?? process.env.ENG_MCP_SHELL_RUN_AUDIT_FILE ?? SHELL_RUN_AUDIT_FILE_DEFAULT;
  const now = deps.now ?? (() => new Date());
  const classified = classifyShellCommand(command);
  const base = {
    tool: SHELL_RUN_TOOL,
    command,
    commandSha16,
    timeoutMs,
    ts: now().toISOString()
  };

  if (!cwdResolved.ok) {
    const result: ShellRunResult = {
      status: "refused", tier: classified.tier, ...base,
      cwd: input.cwd?.trim() || SHELL_RUN_DEFAULT_CWD,
      exitCode: null, timedOut: false, durationMs: 0, stdout: "", stderr: "", truncated: false,
      code: cwdResolved.code, reason: cwdResolved.reason,
      audit: writeShellRunAudit(auditFile, { ...base, tier: classified.tier, status: "refused", code: cwdResolved.code })
    };
    return result;
  }
  const cwd = cwdResolved.cwd;

  // TIER 3 — typed blocked, never executed, never overridable.
  if (classified.tier === 3) {
    const result: ShellRunResult = {
      status: "blocked", tier: 3, ...base, cwd,
      exitCode: null, timedOut: false, durationMs: 0, stdout: "", stderr: "", truncated: false,
      rule: classified.rule, reason: classified.reason, code: "SHELL_RUN_BLOCKED",
      audit: writeShellRunAudit(auditFile, { ...base, tier: 3, status: "blocked", rule: classified.rule, code: "SHELL_RUN_BLOCKED" })
    };
    return result;
  }

  // TIER 1 — zero-cost allowlist, no LLM in the path.
  if (classified.tier === 1 && tier1PathsSafe(command, cwd)) {
    const outcome = await (deps.exec ?? defaultExec)(command, cwd, timeoutMs);
    const stdout = truncateShellOutput(outcome.stdout);
    const stderr = truncateShellOutput(outcome.stderr);
    const result: ShellRunResult = {
      status: "executed", tier: 1, ...base, cwd,
      exitCode: outcome.exitCode, timedOut: outcome.timedOut, durationMs: outcome.durationMs,
      stdout: stdout.text, stderr: stderr.text, truncated: stdout.truncated || stderr.truncated,
      rule: classified.rule,
      audit: writeShellRunAudit(auditFile, { ...base, tier: 1, status: outcome.timedOut ? "timeout" : "executed", rule: classified.rule, exitCode: outcome.exitCode, timedOut: outcome.timedOut, durationMs: outcome.durationMs, truncated: stdout.truncated || stderr.truncated })
    };
    return result;
  }

  // TIER 2 — Jev judge classifies safe/unsafe (~250ms, centavos).
  const tier2Reason = classified.rule === "meta_characters" ? "command uses shell meta characters" : "command outside the tier-1 allowlist";
  let judgeAnswers: Array<{ id: string; probability: number }>;
  try {
    const judgeEnvelope = await (deps.judge ?? defaultJudge)({
      state: JSON.stringify({ command, cwd, timeoutMs, context: "engineering.shell.run tier-2 evaluation of a worker shell command" }),
      questions: SHELL_RUN_TIER2_QUESTIONS
    });
    // Malformed envelope = fail-closed: empty answers => every question unknown => max risk => refused.
    judgeAnswers = Array.isArray(judgeEnvelope?.answers) ? judgeEnvelope.answers : [];
  } catch (error) {
    const result: ShellRunResult = {
      status: "refused", tier: 2, ...base, cwd,
      exitCode: null, timedOut: false, durationMs: 0, stdout: "", stderr: "", truncated: false,
      reason: `${tier2Reason}; judge unavailable — fail-closed: ${error instanceof Error ? error.message : String(error)}`, code: "SHELL_RUN_JUDGE_UNAVAILABLE",
      audit: writeShellRunAudit(auditFile, { ...base, tier: 2, status: "refused", rule: classified.rule, code: "SHELL_RUN_JUDGE_UNAVAILABLE" })
    };
    return result;
  }
  const probabilities: Record<string, number> = {};
  let worst = 0;
  for (const question of SHELL_RUN_TIER2_QUESTIONS) {
    const answer = judgeAnswers.find((entry) => entry.id === question.id);
    const probability = typeof answer?.probability === "number" ? answer.probability : 1; // unknown => max risk
    probabilities[question.id] = probability;
    if (probability > worst) worst = probability;
  }
  const safeScore = 1 - worst;
  if (safeScore < SHELL_RUN_JUDGE_THRESHOLD) {
    const reasons = SHELL_RUN_TIER2_QUESTIONS.map((question) => `${question.id}=${probabilities[question.id].toFixed(3)}`).join(" ");
    const result: ShellRunResult = {
      status: "refused", tier: 2, ...base, cwd,
      exitCode: null, timedOut: false, durationMs: 0, stdout: "", stderr: "", truncated: false,
      reason: `${tier2Reason}; judge refused (safeScore ${safeScore.toFixed(3)} < ${SHELL_RUN_JUDGE_THRESHOLD}): ${reasons}`,
      code: "SHELL_RUN_JUDGE_REFUSED",
      judge: { safeScore, probabilities },
      audit: writeShellRunAudit(auditFile, { ...base, tier: 2, status: "refused", rule: classified.rule, code: "SHELL_RUN_JUDGE_REFUSED", judge: { safeScore } })
    };
    return result;
  }
  const outcome = await (deps.exec ?? defaultExec)(command, cwd, timeoutMs);
  const stdout = truncateShellOutput(outcome.stdout);
  const stderr = truncateShellOutput(outcome.stderr);
  const result: ShellRunResult = {
    status: "executed", tier: 2, ...base, cwd,
    exitCode: outcome.exitCode, timedOut: outcome.timedOut, durationMs: outcome.durationMs,
    stdout: stdout.text, stderr: stderr.text, truncated: stdout.truncated || stderr.truncated,
    judge: { safeScore, probabilities },
    audit: writeShellRunAudit(auditFile, { ...base, tier: 2, status: outcome.timedOut ? "timeout" : "executed", exitCode: outcome.exitCode, timedOut: outcome.timedOut, durationMs: outcome.durationMs, judge: { safeScore } })
  };
  return result;
}