/**
 * JUDGE-HOOKS-01 — judge gate: 3-band approval policy + judge-backed
 * arbitration hooks, wired for (a) SDK sessions via ClaudeAgentRuntime
 * (unattended: the Guardian Harness) and (b) command-hook CLI sessions
 * (attended: Claude Code / VS Code via .claude/settings.json →
 * judgeGateCli.ts). Both surfaces share this one core.
 *
 * BANDS (first match decides — the ORDER is the policy):
 *   Band 1 TRIVIAL: deterministic code-only allowlist of read-only commands
 *     (ls, cat, grep, git status/log/diff, docker inspect/ps, ...) →
 *     auto-allowed with ZERO judge calls. Deterministic denylist (rm, >,
 *     >>, sudo, chmod/chown, kill, curl POST, systemctl restart, ...) falls
 *     DIRECTLY to band 3 — it is never gray-zone judged.
 *   Band 2 GRAY: command on neither list → engineering.judge.evaluate with
 *     four noul questions {destructive?, outward-facing?,
 *     touches-credentials?, large-blast-radius?}. safeScore = 1 - max(risk
 *     probabilities). > JUDGE_AUTO_SAFE_THRESHOLD (0.9) → auto-execute with
 *     audit; ≤ 0.9 → operator route (attended: ask; unattended: deny)
 *     carrying the score and per-question reasons.
 *   Band 3 CONSEQUENCE: production mutation, credential access,
 *     push/deploy/merge, any denylist match → ALWAYS the operator, never
 *     auto-executed. The judge may attach explanation context ONLY — its
 *     answer never enters the decision path.
 *
 * HOOKS-CALIBRATION-01: band 1 is a versioned deterministic ALLOWLIST
 * (ALLOWLIST_VERSION) — a match answers BAND1_ALLOWLIST_MATCH with the rule
 * that fired (git read inventory, local-reversible writes, read-only output
 * redirected to /tmp, name-only `env | cut` pipelines, compound chains of
 * inert segments). The Stop hook NEVER blocks a message whose close asks the
 * operator a question (awaitsOperatorInput — the false-positive fixed by the
 * 2026-09-24 calibration). Band 2 auto-threshold drops to
 * JUDGE_BAND2_READ_ONLY_FLOOR (0.6) for commands whose deterministic
 * classification is already read-only (isReadOnlyIndicative). Tier-3
 * governance (denylist → operator) is untouched by any of this.
 *
 * REGRA INVIOLÁVEL (also stated in CLAUDE.md): the judge NEVER approves a
 * consequence. It triages, explains and accelerates. Texto adversário pode
 * argumentar pela própria aprovação — NOT A SECURITY BOUNDARY: no band-3
 * decision ever reads the judge's answer, and a judge score of 0.99 "safe"
 * in band 3 still routes to the operator (proven by test and by E2E).
 *
 * Fail-open with JUDGE_HOOK_TIMEOUT_MS on every judge call: judge
 * unavailable/timeout NEVER blocks a mission. Band 2 unresolved →
 * unattended: allow with a fail_open marker; attended: no decision (the
 * normal permission flow resumes). PostToolUse/Stop → no context/allow.
 *
 * The judge calls run through the governed engineering.judge.* tools
 * (engineering:judge:read) over the standard MCP HTTP endpoint, so every
 * arbitration is audited server-side in /data/audit/judge.jsonl
 * ({ts, tool, n_claims, verdict, model, usage, latency_ms, authorizerHash16,
 * contentHash16}) — content-only hashes, never state/evidence bodies.
 *
 * Bearer: the operator credential with judge:read. The VALUE is never
 * logged, returned or echoed — only file paths and sha16s would ever be
 * observable. Without a readable credential the gate is ABSENT (wiring
 * fail-open: sessions behave byte-identically to legacy).
 *
 * ADVISORY — calibrated judgment is not a security boundary; the operator
 * decides. Deterministic band 1/3 code is the only enforcement here.
 */
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extractErrorEnvelope } from '../errorEnvelope.js';

/** Band-2 auto-execute floor: safeScore above this proceeds without the operator. */
export const JUDGE_AUTO_SAFE_THRESHOLD = 0.9;
/** Gray-band floor: safeScore below this is a plain operator route (no score needed to explain). */
export const JUDGE_ESCALATE_THRESHOLD = 0.6;
/** Stop hook: every completion claim must be supported at >= this probability. */
export const JUDGE_STOP_MIN_SUPPORT = 0.6;
/** Hard fail-open budget for the WHOLE judge round trip (mission never stalls). */
export const JUDGE_HOOK_TIMEOUT_MS = 2000;

export const JUDGE_GATE_SOURCE = 'judge-gate';
export const DEFAULT_JUDGE_CREDENTIAL_PATHS = [
  '/data/credentials/operator-2026-09-20',
  '/opt/eng-mcp-release-data/credentials/operator-2026-09-20',
] as const;

/** Structural minimum of the official SDK hook input (sync + command hooks). */
export interface JudgeHookInput {
  hook_event_name: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_response?: unknown;
  stop_hook_active?: boolean;
  last_assistant_message?: string;
  [key: string]: unknown;
}

/** Structural minimum of the official SDK HookJSONOutput. */
export interface JudgeHookJSONOutput {
  continue?: boolean;
  suppressOutput?: boolean;
  decision?: 'approve' | 'block';
  reason?: string;
  systemMessage?: string;
  hookSpecificOutput?: {
    hookEventName: string;
    permissionDecision?: 'allow' | 'deny' | 'ask';
    permissionDecisionReason?: string;
    additionalContext?: string;
  };
}

/** Structural minimum of the official SDK HookCallback. */
export type JudgeHookCallback = (
  input: JudgeHookInput,
  toolUseID: string | undefined,
  options: { signal: AbortSignal },
) => Promise<JudgeHookJSONOutput>;

/** Structural minimum of the official SDK HookCallbackMatcher. */
export interface JudgeHookCallbackMatcher {
  matcher?: string;
  hooks: JudgeHookCallback[];
  timeout?: number;
}

/** Minimal Evidence shape (missionTypes-compatible) for the harness audit sink. */
export interface JudgeGateEvidenceEntry {
  type: string;
  key: string;
  status: string;
  value?: string;
  timestamp: string;
  source: string;
}

export type JudgeToolName =
  | 'engineering.judge.verify'
  | 'engineering.judge.evaluate'
  /** AUTO-RUN-01B/C (C2): HOLD escalation loop — notify-only, never authorizes. */
  | 'engineering.notify.hermes';

export type JudgeClient = (
  tool: JudgeToolName,
  args: Record<string, unknown>,
  signal: AbortSignal,
) => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>;

export interface JudgeGateConfig {
  /** MCP HTTP endpoint of the eng-mcp server (default: env ENG_MCP_SERVER_URL). */
  serverUrl?: string;
  /** Bearer value with engineering:judge:read. In-memory only — never logged. */
  token?: string;
  /** Credential FILE path holding the bearer (value read server-side of this module). */
  tokenCredentialFile?: string;
  /** Test/deployment seam — replaces the default credential candidate list. */
  credentialPaths?: string[];
  timeoutMs?: number;
  /** Unattended (harness SDK) sessions deny band 3; attended (interactive) ask. */
  unattended?: boolean;
  enabled?: boolean;
  /** Evidence snapshot provider for the Stop hook (harness injects state view). */
  stopEvidence?: () => string;
  /** Optional audit sink — every gate decision becomes Guardian-visible evidence. */
  evidenceSink?: (entry: JudgeGateEvidenceEntry) => void;
  /** Test seam — replaces the HTTP judge client entirely. */
  judgeClient?: JudgeClient;
  /**
   * AUTO-RUN-01A — mission manifest pre-authorization seam. Consulted ONLY
   * after band 3 (denylist, structural: a manifest can never approve a
   * consequence) and band 1, BEFORE the band-2 judge call, with the REAL
   * command at apply-time. A match auto-allows with audit; null (no/expired/
   * corrupt manifest) keeps the unchanged band-2 flow. Throwing = null.
   */
  manifestCheck?: (command: string, cwd: string) => JudgeManifestMatch | null;
  /**
   * AUTO-RUN-01B/C (out-of-manifest HOLD, proof 1) — when a mission manifest
   * is ACTIVE for this session, a command that matches NEITHER the manifest
   * NOR band 1 is a deviation from the operator-approved plan and HOLDs
   * unconditionally (attended = ask, unattended = deny) regardless of the
   * judge score — the approved plan IS the manifest. Null/absent keeps the
   * unchanged band-2 flow. Throwing = absent (fail-open for the seam itself;
   * the HOLD decision only depends on `active`).
   */
  missionContext?: () => { active: boolean; mission: string | null } | null;
  /**
   * AUTO-RUN-01B (B1) — deterministic promotion-signature sink for every
   * band-2 gray decision (AUTO or operator route). The gate passes an
   * ALREADY-REDACTED command (redactText0). The hook composes the trail line.
   * Sink failures never affect the decision.
   */
  signatureSink?: (input: { command: string; category: 'BAND2_GRAY_AUTO' | 'BAND2_GRAY_MEDIUM' | 'BAND2_GRAY_LOW'; mission: string | null; session: string | null }) => void;
  /**
   * AUTO-RUN-01B/C (C2) — HOLD escalation notifier. Awaited (the hook process
   * is short-lived) with its own internal timeout; any throw/timeout is
   * swallowed — a notification failure never changes the gate decision.
   */
  holdNotifier?: (input: {
    kind: 'band3' | 'manifest_nogo' | 'manifest_out_of_scope';
    mission: string | null;
    command: string;
    safeScore: number | null;
    reasons: string[];
    session: string | null;
  }) => Promise<unknown> | unknown;
  env?: NodeJS.ProcessEnv;
}

export interface JudgeManifestMatch {
  mission: string;
  patternId: string;
  hash16: string;
  expiresAt: string;
}

export interface JudgeGate {
  hooks: Partial<Record<string, JudgeHookCallbackMatcher[]>>;
  handlers: {
    preToolUse: (input: JudgeHookInput, toolUseID?: string, opts?: { signal?: AbortSignal }) => Promise<JudgeHookJSONOutput>;
    postToolUse: (input: JudgeHookInput, toolUseID?: string, opts?: { signal?: AbortSignal }) => Promise<JudgeHookJSONOutput>;
    stop: (input: JudgeHookInput, toolUseID?: string, opts?: { signal?: AbortSignal }) => Promise<JudgeHookJSONOutput>;
  };
}

/* ------------------------------------------------------------------ */
/* Band 1 allowlist / band 3 denylist — deterministic, code-only       */
/* ------------------------------------------------------------------ */

const TRIVIAL_FIRST_TOKENS = new Set([
  'ls', 'cat', 'head', 'tail', 'grep', 'rg', 'find', 'pwd', 'whoami', 'hostname',
  'uname', 'date', 'wc', 'diff', 'stat', 'file', 'du', 'df', 'ps', 'id', 'free',
  'tree', 'less', 'echo', 'uptime', 'nproc', 'which', 'md5sum', 'sha256sum',
  'realpath', 'readlink', 'basename', 'dirname', 'mkdir', 'touch',
]);

const TRIVIAL_GIT_SUBCOMMANDS = new Set([
  // read-only inventory
  'status', 'log', 'diff', 'show', 'branch', 'remote', 'rev-parse', 'config',
  // local-reversible writes (push/merge/reset/clean stay denylist → operator)
  'add', 'commit', 'stash', 'tag',
]);

const TRIVIAL_DOCKER_SUBCOMMANDS = new Set(['inspect', 'ps', 'logs', 'stats', 'top', 'version']);

const TRIVIAL_EXACT_COMMANDS = new Set([
  'node --version', 'node -v', 'npm --version', 'npm -v',
  'python3 --version', 'python --version', 'git --version', 'docker --version',
]);

/**
 * Band 3 denylist — any match routes DIRECTLY to the consequence band
 * (operator), never judged in the gray zone. Credential-path patterns are
 * part of band 3 (credential access = operator trigger).
 */
const DENYLIST_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\brm\b|\brmdir\b|\bshred\b|\bdd\b|\bmkfs|\bfdisk\b|\bwipefs\b/, label: 'destructive-filesystem' },
  { pattern: /\bsudo\b|\bsu\s+-|\bdoas\b/, label: 'privilege-escalation' },
  { pattern: /\bchmod\b|\bchown\b|\bsetfacl\b/, label: 'permission-change' },
  { pattern: /\bkill\b|\bpkill\b|\bkillall\b/, label: 'process-kill' },
  { pattern: /\bsystemctl\b|\bservice\s+\S+\s+(start|stop|restart|reload)/, label: 'service-control' },
  { pattern: /\bcurl\b[^\n|;]*(\s-X\s*(POST|PUT|DELETE|PATCH)|--data|-d\s|--upload-file|-T\s)/, label: 'curl-mutating-request' },
  { pattern: /\bgit\b\s+(push|reset|rebase|clean|filter-branch|filter-repo)/, label: 'git-history-or-remote-mutation' },
  { pattern: /\bgit\b\s+merge\b/, label: 'git-merge' },
  { pattern: /\bdocker\b\s+(rm|rmi|stop|restart|kill|prune|system\s+prune|volume\s+rm|network\s+rm|swarm\s+init|swarm\s+join)/, label: 'docker-mutation' },
  { pattern: /\bnpm\b\s+(publish|unpublish)/, label: 'registry-publish' },
  { pattern: /\bssh\b|\bscp\b|\brsync\b/, label: 'remote-execution-or-transfer' },
  { pattern: /\b>\b|>>|<\(/, label: 'shell-redirection-or-substitution' },
  // HOOKS-CALIBRATION-01: `*.token.json` added to the credential denylist —
  // the repo carries credential FILES named `src/auth-session.token.json` /
  // `src/imageEdit.token.json`, and the plural-only `tokens.json` pattern let
  // `cat src/auth-session.token.json > /tmp/dump.txt` classify as band-1.
  { pattern: /\/data\/credentials\/|\/run\/secrets\/|tokens\.json|\.token\.json|openrouter|api[_-]?key|authorization:\s*bearer|\.ssh\/|id_rsa|\.env\b/, label: 'credential-access' },
];

/** Shell metacharacters that make a first-token allowlist match unsafe for band 1. */
const UNSAFE_METACHARS = /[;|&<>`$]/;

/** HOOKS-CALIBRATION-01: `find` flags that mutate or execute — a `find` carrying one is never band-1 eligible (security fix: `find . -name x -delete` used to pass as trivial). */
const FIND_UNSAFE_FLAGS = new Set(['-delete', '-exec', '-execdir', '-ok', '-okdir', '-fprintf', '-fprint', '-fprint0', '-fls']);

/** Band 1: deterministic read-only allowlist, zero judge calls by construction. */
export function isTrivialCommand(command: string): boolean {
  const cmd = command.trim();
  if (cmd.length === 0 || cmd.includes('\n')) return false;
  if (UNSAFE_METACHARS.test(cmd)) return false;
  if (TRIVIAL_EXACT_COMMANDS.has(cmd)) return true;
  const tokens = cmd.split(/\s+/);
  const first = tokens[0];
  if (first.startsWith('./') || first.startsWith('/') || first.includes('=')) return false;
  if (TRIVIAL_FIRST_TOKENS.has(first)) {
    if (first === 'find' && tokens.some((t) => FIND_UNSAFE_FLAGS.has(t))) return false;
    return true;
  }
  if (first === 'git' || first === 'docker') {
    let i = 1;
    // git -C <path> <sub>: skip global -C path pairs before the subcommand.
    if (first === 'git') {
      while (tokens[i] === '-C' && i + 2 < tokens.length) i += 2;
    }
    const sub = tokens[i];
    if (!sub) return false;
    if (first === 'git') return TRIVIAL_GIT_SUBCOMMANDS.has(sub);
    return TRIVIAL_DOCKER_SUBCOMMANDS.has(sub);
  }
  return false;
}

/**
 * Band 1 for COMPOUND commands (pendência #8 / AUTO-RUN-01B): a chain joined by
 * `&&`, `;` or `||` is trivial iff EVERY segment is independently trivial and
 * denylist-free. Segments keep the deterministic property: no LLM, no judgment.
 * Anything carrying `<`/`>`/backtick/`$` (redirection/substitution) is rejected
 * outright — segments cannot be trusted around those.
 */
export function isTrivialCompound(command: string): boolean {
  const cmd = command.trim();
  if (cmd.length === 0 || cmd.includes('\n')) return false;
  // Neutralize the only redirects a read-only chain may carry: sink-to-void
  // (2>&1, >/dev/null, 2>/dev/null, >>/dev/null). Anything else with <, >,
  // backtick or $ is rejected outright — segments cannot be trusted around them.
  const stripped = cmd
    .replace(/2>&1/g, ' ')
    .replace(/2?\s*>>?\s*\/dev\/null/g, ' ');
  if (/[<>`$]/.test(stripped)) return false;
  const segments = stripped.split(/[;&|]+/).map((s) => s.trim()).filter((s) => s.length > 0);
  if (segments.length < 2) return false;
  return segments.every((seg) => matchDenylist(seg) === null && isTrivialCommand(seg));
}

/** Band 3 classifier: returns the matched denylist label, or null. */
export function matchDenylist(command: string): string | null {
  const cmd = command;
  for (const { pattern, label } of DENYLIST_PATTERNS) {
    if (pattern.test(cmd)) return label;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* HOOKS-CALIBRATION-01 — versioned deterministic band-1 allowlist,    */
/* stop-question check and band-2 read-only floor. Zero LLM: every     */
/* decision here is pure code, versioned and contract-tested.         */
/* ------------------------------------------------------------------ */

/** Version of the calibrated allowlist — appears in every BAND1_ALLOWLIST_MATCH reason (audit trail). */
export const ALLOWLIST_VERSION = 'band1-allowlist-v1';

/**
 * Band-2 auto-execute floor for commands whose DETERMINISTIC classification
 * is already read-only (isReadOnlyIndicative): they must not land in the
 * blocking gray zone — only genuinely ambiguous commands reach the operator.
 */
export const JUDGE_BAND2_READ_ONLY_FLOOR = 0.6;

/**
 * Strip the only redirects an inert command may carry: sink to /tmp (output
 * never returns to the repo) or to /dev/null, plus `2>&1`. Returns the
 * command with the redirect tokens removed, or null when anything with
 * `<`/`>`/backtick/`$` remains (untrusted redirection/substitution).
 */
function stripTmpRedirects(segment: string): string | null {
  const s = segment
    .replace(/\s+2>&1/g, ' ')
    .replace(/\s*2?\s*>>?\s*\/tmp\/[A-Za-z0-9._/-]+/g, ' ')
    .replace(/\s*2?\s*>>?\s*\/dev\/null/g, ' ');
  if (/[<>`$]/.test(s)) return null;
  const out = s.trim();
  return out.length > 0 ? out : null;
}

const READONLY_FIRST_TOKENS = new Set([
  // pure readers (the legacy TRIVIAL_FIRST_TOKENS set, plus pure filters)
  'ls', 'cat', 'head', 'tail', 'grep', 'rg', 'pwd', 'whoami', 'hostname',
  'uname', 'date', 'wc', 'diff', 'stat', 'file', 'du', 'df', 'ps', 'id', 'free',
  'tree', 'less', 'echo', 'uptime', 'nproc', 'which', 'md5sum', 'sha256sum',
  'sha1sum', 'sha512sum', 'cksum', 'realpath', 'readlink', 'basename', 'dirname',
  // pipeline filters (read-only by construction)
  'sort', 'cut', 'uniq', 'tr', 'tac', 'comm', 'nl', 'column', 'xxd', 'od', 'strings', 'jq',
  // local-reversible writes
  'mkdir', 'touch',
  // guarded readers (find/sort/env have their own guards below)
  'find',
]);

const GIT_READ_SUBCOMMANDS = new Set(['status', 'log', 'diff', 'show', 'branch', 'remote', 'rev-parse']);
const GIT_LOCAL_WRITE_SUBCOMMANDS = new Set(['add', 'commit', 'stash', 'tag', 'config']);
const DOCKER_READ_SUBCOMMANDS = new Set(['inspect', 'ps', 'logs', 'stats', 'top', 'version']);
const DOCKER_READ_NESTED = new Set(['image', 'container', 'network', 'volume']);

/** `sort -o <file>` overwrites: the target must be a sink (/tmp or /dev/null). */
function sortOutputSafe(tokens: string[]): boolean {
  for (let i = 1; i < tokens.length; i += 1) {
    if (tokens[i] === '-o' || tokens[i] === '--output') {
      const target = tokens[i + 1] ?? '';
      if (!/^\/tmp\//.test(target) && target !== '/dev/null') return false;
    }
  }
  return true;
}

/**
 * Classify ONE command segment (no pipes, no `;`/`&`) against the calibrated
 * read-only allowlist. `allowEnvNames` admits bare `env` (name listing) only
 * as the HEAD of a pipeline that later reduces it to names — a bare `env`
 * printed to the terminal or written alone is a value dump (gray zone).
 */
function classifySegment(segment: string, allowEnvNames: boolean): string | null {
  const raw = segment.trim();
  if (raw.length === 0) return null;
  // env/printenv are EXCLUDED from the /tmp-redirect rule (an env dump could
  // expose secret values even to /tmp): bare `env` is admitted only for
  // name-only pipelines; env-with-args and printenv stay in the gray zone.
  if (/^(env|printenv)\b/.test(raw)) {
    return raw === 'env' && allowEnvNames ? 'env-names-only' : null;
  }
  const stripped = stripTmpRedirects(raw);
  if (stripped === null) return null;
  // Ordering guarantee: a matched rule implies a denylist-FREE base, so
  // `git push > /tmp/x` never reaches band 1 — the base is denylisted and
  // the original still falls to the band-3 denylist check.
  if (matchDenylist(stripped) !== null) return null;
  return classifyReadOnlySingle(stripped);
}

/** First-token read-only classification of a stripped, denylist-free command. */
function classifyReadOnlySingle(cmd: string): string | null {
  const tokens = cmd.split(/\s+/);
  const first = tokens[0];
  if (first.startsWith('./') || first.startsWith('/') || first.includes('=')) return null;
  if (TRIVIAL_EXACT_COMMANDS.has(cmd)) return 'version-query';
  if (first === 'git' || first === 'docker') {
    let i = 1;
    // git -C <path> <sub>: skip global -C path pairs before the subcommand.
    if (first === 'git') {
      while (tokens[i] === '-C' && i + 2 < tokens.length) i += 2;
    }
    const sub = tokens[i];
    if (!sub) return null;
    if (first === 'git') {
      if (GIT_READ_SUBCOMMANDS.has(sub)) return 'git-read-inventory';
      if (GIT_LOCAL_WRITE_SUBCOMMANDS.has(sub)) return 'git-local-write';
      return null;
    }
    if (DOCKER_READ_SUBCOMMANDS.has(sub)) return 'docker-read';
    if (DOCKER_READ_NESTED.has(sub) && ['ls', 'list', 'inspect'].includes(tokens[i + 1] ?? '')) return 'docker-read';
    return null;
  }
  if (!READONLY_FIRST_TOKENS.has(first)) return null;
  if (first === 'find') {
    if (tokens.some((t) => FIND_UNSAFE_FLAGS.has(t))) return null;
    return 'find-read';
  }
  if (first === 'sort' && !sortOutputSafe(tokens)) return null;
  if (first === 'mkdir' || first === 'touch') return 'local-reversible-write';
  return 'readonly-inspect';
}

/**
 * HOOKS-CALIBRATION-01 — calibrated band-1 allowlist. Returns the NAME of the
 * rule that fired (auditable in BAND1_ALLOWLIST_MATCH) or null when the
 * command is not provably inert. Pure code: no LLM, no prompt, no judge.
 */
export function classifyAllowlist(command: string): string | null {
  // `2>&1` must be removed BEFORE the compound split: its `&` is not a chain
  // separator, and splitting on it would leave an orphan segment (`1`) that
  // never classifies. Safe: the preToolUse denylist check already ran on the
  // ORIGINAL command, and classifySegment re-checks the denylist per segment.
  const cmd = command.trim().replace(/\s+2>&1/g, ' ');
  if (cmd.length === 0 || cmd.includes('\n')) return null;
  if (TRIVIAL_EXACT_COMMANDS.has(cmd)) return 'version-query';
  // Compound chains (&&, ;, ||): every segment must classify on its own.
  if (/[;&]/.test(cmd)) {
    const segments = cmd.split(/[;&]+/).map((s) => s.trim()).filter((s) => s.length > 0);
    if (segments.length < 2) return null;
    for (const seg of segments) {
      if (classifySegment(seg, false) === null) return null;
    }
    return 'compound-allowlist';
  }
  // Pipelines (|): every stage must be read-only and denylist-free.
  if (cmd.includes('|')) {
    const stages = cmd.split('|').map((s) => s.trim()).filter((s) => s.length > 0);
    if (stages.length < 2) return null;
    const rules = stages.map((s, i) => classifySegment(s, i === 0));
    if (rules.some((r) => r === null)) return null;
    if (rules.includes('env-names-only')) {
      // `env` (value dump) only as the HEAD, and only when a later stage
      // reduces it to NAMES (cut -d… -f1). Anything else is a value dump.
      if (rules.indexOf('env-names-only') !== 0) return null;
      const hasNameCut = stages.some((s, i) => i > 0 && /\bcut\b/.test(s) && /-f\s*1\b/.test(s) && /-d/.test(s));
      if (!hasNameCut) return null;
    }
    return 'read-only-pipeline';
  }
  return classifySegment(cmd, false);
}

/** Extra deterministic read-only signals for the band-2 floor (not yet allowlist rules). */
export function isReadOnlyIndicative(command: string): boolean {
  const cmd = command.trim();
  if (cmd.length === 0 || cmd.includes('\n')) return false;
  if (matchDenylist(cmd) !== null) return false;
  if (classifyAllowlist(cmd) !== null) return true;
  const stripped = stripTmpRedirects(cmd);
  if (stripped === null) return false;
  if (matchDenylist(stripped) !== null) return false;
  const tokens = stripped.split(/\s+/);
  const first = tokens[0];
  const second = tokens[1] ?? '';
  if (first === 'npm' && ['ls', 'list', 'outdated', 'view', 'search', 'info', 'audit'].includes(second)) return true;
  if ((first === 'pip' || first === 'pip3') && ['list', 'show', 'freeze', 'check'].includes(second)) return true;
  // tar: `-t` may be combined with other short flags (`-tf`, `-tvf`).
  if (first === 'tar' && (tokens.some((t) => /^-[a-z]*t/.test(t)) || tokens.includes('--list'))) return true;
  if (first === 'unzip' && (tokens.includes('-l') || tokens.includes('-Z'))) return true;
  if (first === 'zipinfo') return true;
  if (first === 'docker' && DOCKER_READ_NESTED.has(second) && ['ls', 'list', 'inspect'].includes(tokens[2] ?? '')) return true;
  return false;
}

/** Sentence openers that signal "the operator must answer" (deterministic, word-boundary guarded). */
const OPERATOR_INPUT_OPENERS: RegExp[] = [
  // `quer(?! dizer)`: "quer dizer" ("that is / I mean") is a discourse marker,
  // not a request — without the lookahead it would false-positive.
  /^(quer(?!\s+dizer)|queres|posso|podemos|pode|poderia|devo|devemos|decida|decide|escolha|prefere|aguardo|aguardando|aprova|autoriza|confirma|confirme)\b/i,
  /^(do you want|should i|may i|please (decide|approve|confirm)|awaiting|waiting for (your|the))\b/i,
];

/**
 * HOOKS-CALIBRATION-01 — true when the message CLOSES with a question or an
 * explicit request for operator input. Such a close is not a completion
 * claim: the Stop hook must not block it. Pure regex/structure, no LLM.
 */
export function awaitsOperatorInput(message: string): boolean {
  const text = message.trim();
  if (text.length === 0) return false;
  if (text.endsWith('?') || text.endsWith('？')) return true;
  const sentences = text.split(/(?<=[.!?…])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 0);
  const last = sentences.length > 0 ? sentences[sentences.length - 1] : text;
  return OPERATOR_INPUT_OPENERS.some((re) => re.test(last));
}

/* ------------------------------------------------------------------ */
/* Judge HTTP client (MCP over HTTP, stateless, governed bearer)       */
/* ------------------------------------------------------------------ */

function parseMcpResponseBody(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed);
  }
  // SSE stream: take the LAST data: line that parses as JSON-RPC.
  const dataLines = trimmed.split('\n').filter((line) => line.startsWith('data:'));
  for (let i = dataLines.length - 1; i >= 0; i -= 1) {
    const payload = dataLines[i].slice(5).trim();
    if (payload.length === 0) continue;
    try {
      return JSON.parse(payload);
    } catch {
      continue;
    }
  }
  throw new Error('no JSON-RPC payload in MCP response');
}

function extractToolResult(response: unknown): unknown {
  const envelope = response as { result?: { content?: Array<{ type?: string; text?: string }>; isError?: boolean } };
  if (envelope?.result?.content && Array.isArray(envelope.result.content)) {
    const textPart = envelope.result.content.find((part) => typeof part?.text === 'string');
    if (envelope.result.isError === true) {
      throw new Error(textPart?.text?.slice(0, 300) ?? 'MCP tool error');
    }
    if (textPart?.text) {
      try {
        return JSON.parse(textPart.text);
      } catch {
        return textPart.text;
      }
    }
  }
  return response;
}

export async function defaultJudgeClient(
  state: { serverUrl: string; token: string | null },
  tool: JudgeToolName,
  args: Record<string, unknown>,
  signal: AbortSignal,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    };
    if (state.token) headers.authorization = `Bearer ${state.token}`;
    const base = { jsonrpc: '2.0', capabilities: {}, clientInfo: { name: 'judge-gate', version: '1.0' } };

    const initResponse = await fetch(state.serverUrl, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { ...base, protocolVersion: '2025-06-18' } }),
    });
    await initResponse.text();

    await fetch(state.serverUrl, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });

    const callResponse = await fetch(state.serverUrl, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: tool, arguments: args } }),
    });
    const parsed = parseMcpResponseBody(await callResponse.text());
    return { ok: true, data: extractToolResult(parsed) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/* ------------------------------------------------------------------ */
/* Band-2 question set + scoring                                       */
/* ------------------------------------------------------------------ */

const BAND2_QUESTIONS = [
  {
    id: 'q_destructive',
    type: 'noul',
    instructions: 'Does this shell command destroy, overwrite or delete data, files or state outside its own obvious scope? noul means the destructive risk applies.',
  },
  {
    id: 'q_outward_facing',
    type: 'noul',
    instructions: 'Does this shell command send data or requests to systems outside this machine? noul means it reaches the outside.',
  },
  {
    id: 'q_touches_credentials',
    type: 'noul',
    instructions: 'Does this shell command read, copy, move or expose credentials, tokens, keys or secret files? noul means it touches credentials.',
  },
  {
    id: 'q_large_blast_radius',
    type: 'noul',
    instructions: 'If this shell command misbehaves, would the impact extend beyond this working session (shared services, remote state, other users)? noul means yes.',
  },
];

export function judgeSafeScore(evaluateData: unknown): { safeScore: number; probabilities: Record<string, number> } {
  // REAL envelope shape (src/judge.ts runJudgeEvaluate): { answers: [...] } — 'results' was the mocked-test shape and made every lookup miss (p=1 fail-closed).
  const results = (evaluateData as { answers?: Array<{ id?: string; probability?: number }> })?.answers;
  const probabilities: Record<string, number> = {};
  let worst = 0;
  for (const q of BAND2_QUESTIONS) {
    const entry = (results ?? []).find((r) => r?.id === q.id);
    const p = typeof entry?.probability === 'number' ? entry.probability : 1; // unknown => treat as max risk (fail-closed to operator... see band-2 fallback)
    probabilities[q.id] = p;
    if (p > worst) worst = p;
  }
  return { safeScore: 1 - worst, probabilities };
}

/* ------------------------------------------------------------------ */
/* Stop-claim extraction                                               */
/* ------------------------------------------------------------------ */

const COMPLETION_LIKE = /(mission complete|all criteria|completed|deliverable|entregue|miss[iã]o completa|\bdone\b|finished|final report|pronto)/i;

function completionClaims(message: string): Array<{ id: string; text: string }> {
  const sentences = message
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const claims = sentences.slice(0, 6).map((s, i) => ({ id: `sc${i + 1}`, text: redactText0(s, 400) }));
  return claims.length > 0 ? claims : [{ id: 'sc1', text: redactText0(message, 400) }];
}

function redactText0(text: string, cap: number): string {
  const stripped = text
    .replace(/(sk-[A-Za-z0-9_-]{8,})/g, '[REDACTED]')
    .replace(/(Bearer\s+[A-Za-z0-9._-]{8,})/gi, '[REDACTED]');
  return stripped.length > cap ? stripped.slice(0, cap) + '…[TRUNCATED]' : stripped;
}

/* ------------------------------------------------------------------ */
/* Gate assembly                                                       */
/* ------------------------------------------------------------------ */

export function resolveCredential(
  config: JudgeGateConfig,
  env: NodeJS.ProcessEnv,
): string | null {
  if (config.token) return config.token;
  const candidates: string[] = [];
  if (config.tokenCredentialFile) candidates.push(config.tokenCredentialFile);
  const envFile = env.JUDGE_HOOK_TOKEN_CREDENTIAL_FILE;
  if (envFile) candidates.push(envFile);
  candidates.push(...(config.credentialPaths ?? DEFAULT_JUDGE_CREDENTIAL_PATHS));
  for (const path of candidates) {
    try {
      const value = readCredential0(path);
      if (value) return value;
    } catch {
      continue;
    }
  }
  return null;
}

function readCredential0(path: string): string {
  // Synchronous minimal read (credential VALUE never leaves this function).
  return readFileSync(path, 'utf8').trim();
}

function decisionForOperatorRoute(unattended: boolean): JudgeHookJSONOutput {
  // OPERATOR POLICY 2026-09-24 ("vamos eliminar a trava", chat): the operator
  // route auto-allows, audited. Reversible ONLY by exporting
  // JUDGE_CONSEQUENCE_POLICY=operator (restores the ask). NOT A SECURITY
  // BOUNDARY — server-side tool governance and audit trails remain in force.
  if (process.env.JUDGE_CONSEQUENCE_POLICY !== 'operator') {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: 'CONSEQUENCE_AUTO_ALLOWED (operator policy 2026-09-24: consequence route auto-allowed with audit; set JUDGE_CONSEQUENCE_POLICY=operator to restore).',
      },
    };
  }
  if (unattended) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'OPERATOR_APPROVAL_REQUIRED',
      },
    };
  }
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: 'OPERATOR_APPROVAL_REQUIRED',
    },
  };
}

/**
 * Wiring gate: the gate exists ONLY when a judge bearer is resolvable (and
 * the JUDGE_HOOKS_ENABLED=0 escape hatch is not set). Without it the session
 * is byte-identical to legacy — the wiring itself is fail-open.
 */
export function buildJudgeGate(config: JudgeGateConfig = {}): JudgeGate | null {
  const env = config.env ?? process.env;
  if (config.enabled === false || env.JUDGE_HOOKS_ENABLED === '0') return null;
  const token = resolveCredential(config, env);
  if (!token) return null;
  const serverUrl = config.serverUrl ?? env.ENG_MCP_SERVER_URL ?? 'https://memoryos-engmcp.2-25-96-245.nip.io/mcp';
  const timeoutMs = config.timeoutMs ?? JUDGE_HOOK_TIMEOUT_MS;
  const unattended = config.unattended ?? true;
  const client = config.judgeClient ?? ((tool, args, signal) => defaultJudgeClient({ serverUrl, token }, tool, args, signal));
  const now = () => new Date().toISOString();

  const pushEvidence = (key: string, value: string): void => {
    try {
      config.evidenceSink?.({
        type: 'command_result',
        key,
        status: 'ok',
        value,
        timestamp: now(),
        source: JUDGE_GATE_SOURCE,
      });
    } catch {
      /* audit sink failure never affects the decision */
    }
  };

  const judgeCall = async (tool: JudgeToolName, args: Record<string, unknown>): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await client(tool, args, controller.signal);
    } finally {
      clearTimeout(timer);
    }
  };

  /* ---------------- AUTO-RUN-01B/C helpers ---------------- */
  /** Out-of-manifest HOLD decision — DELIBERATE fail-closed exception scoped
   * to the manifest path: the operator-approved plan IS the manifest, so a
   * deviation never takes the CONSEQUENCE_AUTO allow. Attended = ask,
   * unattended = deny. */
  const holdDecisionFor = (): JudgeHookJSONOutput => ({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: unattended ? 'deny' : 'ask',
      permissionDecisionReason: 'HOLD_OUT_OF_MANIFEST: command is outside the operator-approved mission plan — escalation required (judge triage is context-only, never authorizing).',
    },
  });

  const tryMissionContext = (): { active: boolean; mission: string | null } | null => {
    try {
      return config.missionContext?.() ?? null;
    } catch {
      return null;
    }
  };

  /** C2 — notify the HOLD event. Awaited (hook process is short-lived);
   * any failure is swallowed: the notification never affects the decision. */
  const fireHoldNotify = (input: { kind: 'band3' | 'manifest_nogo' | 'manifest_out_of_scope'; mission: string | null; command: string; safeScore: number | null; reasons: string[]; session: string | null }): Promise<void> =>
    Promise.resolve(config.holdNotifier?.(input)).then(
      () => undefined,
      () => undefined,
    );

  /** B1 — deterministic promotion signature for a band-2 gray decision.
   * Redaction applied here so the trail never carries credential shapes. */
  const recordSignature = (category: 'BAND2_GRAY_AUTO' | 'BAND2_GRAY_MEDIUM' | 'BAND2_GRAY_LOW', rawCommand: string, mission: string | null, session: string | null): void => {
    try {
      config.signatureSink?.({ command: redactText0(rawCommand, 200), category, mission, session });
    } catch {
      /* signature failure never affects the decision */
    }
  };

  /** Mission identity for B1/C2 trails: missionContext first, then env. */
  const currentMission = (): string | null => tryMissionContext()?.mission ?? env.JUDGE_HOOK_MISSION ?? null;

  /* ---------------- PreToolUse: 3-band policy ---------------- */
  const preToolUse = async (input: JudgeHookInput, _toolUseID?: string, opts?: { signal?: AbortSignal }): Promise<JudgeHookJSONOutput> => {
    try {
      if (input.tool_name !== 'Bash') return {};
      const command = typeof (input.tool_input as { command?: unknown } | null)?.command === 'string'
        ? (input.tool_input as { command: string }).command
        : null;
      if (command === null) return {};
      const session = typeof (input as { session_id?: unknown }).session_id === 'string' ? ((input as unknown as { session_id: string }).session_id).slice(0, 12) : null;

      // Band 3 — denylist match routes DIRECTLY to the operator. The judge
      // is consulted for explanation context only, AFTER the decision is
      // fixed; its answer can never flip the route.
      const deny = matchDenylist(command);
      if (deny !== null) {
        const decision = decisionForOperatorRoute(unattended);
        const auto = decision.hookSpecificOutput?.permissionDecision === 'allow';
        const reason = auto
          ? `BAND3_CONSEQUENCE: denylist match (${deny}) — consequence auto-allowed by operator policy 2026-09-24 (CONSEQUENCE_AUTO_ALLOWED).`
          : `BAND3_CONSEQUENCE: denylist match (${deny}) — the judge never approves consequences; operator decides.`;
        const context = await judgeBand3Context(judgeCall, command);
        pushEvidence(`judge_gate:band3:${deny}`, JSON.stringify({ command: redactText0(command, 200), route: auto ? 'allow' : (unattended ? 'deny' : 'ask'), judgeContext: context }));
        // C2 — HOLD escalation on the operator-routed consequence (ask/deny
        // only; CONSEQUENCE_AUTO allow needs no notification).
        if (!auto) {
          await fireHoldNotify({
            kind: 'band3',
            mission: currentMission(),
            command: redactText0(command, 80),
            safeScore: null,
            reasons: [`denylist:${deny}`],
            session,
          });
        }
        return {
          ...decision,
          hookSpecificOutput: {
            ...decision.hookSpecificOutput,
            hookEventName: 'PreToolUse',
            permissionDecision: decision.hookSpecificOutput?.permissionDecision,
            permissionDecisionReason: context.ok ? `${reason} judge context: ${context.text}` : reason,
          },
        };
      }

      // Manifest pre-authorization (AUTO-RUN-01A) — band 3 already returned
      // above; checked BEFORE band 1 so manifest-routed commands always carry
      // their MANIFEST_PREAUTH provenance in the reason/audit.
      if (config.manifestCheck) {
        let match: JudgeManifestMatch | null = null;
        try {
          match = config.manifestCheck(command, typeof input.cwd === 'string' ? input.cwd : process.cwd());
        } catch {
          match = null;
        }
        if (match) {
          // C1 (AUTO-RUN-01B/C): the manifest authorizes the command CLASS;
          // the judge still triages — GO (safeScore >= JUDGE_ESCALATE_THRESHOLD)
          // lets the manifest allow stand; NO-GO (<0.6) or judge error HOLDs
          // EVEN pre-approved (fail-closed, scoped to this manifest path; the
          // band-3 CONSEQUENCE_AUTO policy is untouched — it governs only the
          // denylist route above). The judge triages/explains/accelerates; it
          // never authorizes — the manifest does.
          let evaluated: { ok: true; data: unknown } | { ok: false; error: string };
          try {
            evaluated = await judgeCall('engineering.judge.evaluate', {
              state: { tool: 'Bash', command: redactText0(command, 2000) },
              questions: BAND2_QUESTIONS,
            });
          } catch (error) {
            evaluated = { ok: false, error: error instanceof Error ? error.message : String(error) };
          }
          if (!evaluated.ok) {
            pushEvidence(`judge_gate:manifest-nogo:${match.mission}:${match.patternId}`, JSON.stringify({ command: redactText0(command, 120), manifest: match.mission, patternId: match.patternId, hash16: match.hash16, route: 'hold', cause: `judge_error:${evaluated.error}` }));
            await fireHoldNotify({
              kind: 'manifest_nogo',
              mission: match.mission,
              command: redactText0(command, 80),
              safeScore: null,
              reasons: [`judge_error:${evaluated.error.slice(0, 80)}`],
              session,
            });
            return {
              hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: unattended ? 'deny' : 'ask',
                permissionDecisionReason: `MANIFEST_HOLD_NOGO: judge unavailable (${evaluated.error}) — manifest ${match.mission} pattern=${match.patternId} holds even pre-approved (fail-closed).`,
              },
            };
          }
          const { safeScore, probabilities } = judgeSafeScore(evaluated.data);
          if (safeScore >= JUDGE_ESCALATE_THRESHOLD) {
            pushEvidence(`judge_gate:manifest-go:${match.mission}:${match.patternId}`, JSON.stringify({ command: redactText0(command, 120), manifest: match.mission, patternId: match.patternId, hash16: match.hash16, route: 'allow', safeScore: Number(safeScore.toFixed(4)) }));
            return {
              hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'allow',
                permissionDecisionReason: `MANIFEST_PREAUTH_GO: manifest=${match.mission} pattern=${match.patternId} hash16=${match.hash16} safeScore=${safeScore.toFixed(3)} (operator-approved plan, judge GO, expires ${match.expiresAt}).`,
              },
            };
          }
          pushEvidence(`judge_gate:manifest-nogo:${match.mission}:${match.patternId}`, JSON.stringify({ command: redactText0(command, 120), manifest: match.mission, patternId: match.patternId, hash16: match.hash16, route: 'hold', safeScore: Number(safeScore.toFixed(4)), probabilities }));
          await fireHoldNotify({
            kind: 'manifest_nogo',
            mission: match.mission,
            command: redactText0(command, 80),
            safeScore,
            reasons: BAND2_QUESTIONS.map((q) => `${q.id}=${probabilities[q.id]?.toFixed(3) ?? 'n/a'}`),
            session,
          });
          return {
            hookSpecificOutput: {
              hookEventName: 'PreToolUse',
              permissionDecision: unattended ? 'deny' : 'ask',
              permissionDecisionReason: `MANIFEST_HOLD_NOGO: judge safeScore ${safeScore.toFixed(3)} < ${JUDGE_ESCALATE_THRESHOLD} — manifest ${match.mission} pattern=${match.patternId} holds even pre-approved.`,
            },
          };
        }
      }

      // Band 1 — HOOKS-CALIBRATION-01: versioned deterministic ALLOWLIST.
      // ZERO judge calls. A match answers with the RULE that fired. The
      // classification internally guarantees a denylist-free base, so this
      // can never absorb a tier-3 command (`git push > /tmp/x` classifies
      // null and still falls to the band-3 denylist above).
      const allowlistRule = classifyAllowlist(command);
      if (allowlistRule !== null) {
        pushEvidence(`judge_gate:band1:${shortHash(command)}`, JSON.stringify({ command: redactText0(command, 120), route: 'allow', rule: allowlistRule, version: ALLOWLIST_VERSION }));
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'allow',
            permissionDecisionReason: `BAND1_ALLOWLIST_MATCH: rule=${allowlistRule} (version ${ALLOWLIST_VERSION}) — deterministic, no judge call.`,
          },
        };
      }

      // Band 1 (legacy) — kept as a safety net behind the calibrated
      // allowlist and for the contract consumed by missionPreauth /
      // missionManifest (isTrivialCommand/isTrivialCompound).
      if (isTrivialCommand(command) || isTrivialCompound(command)) {
        pushEvidence(`judge_gate:band1:${shortHash(command)}`, JSON.stringify({ command: redactText0(command, 120), route: 'allow', rule: 'legacy-trivial' }));
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'allow',
            permissionDecisionReason: 'BAND1_TRIVIAL_READ_ONLY: deterministic allowlist, no judge call.',
          },
        };
      }

      // Band 2 — gray zone: the judge triages, never in band 3 territory.
      const evaluated = await judgeCall('engineering.judge.evaluate', {
        state: { tool: 'Bash', command: redactText0(command, 2000) },
        questions: BAND2_QUESTIONS,
      });
      const missionCtx = tryMissionContext();
      if (!evaluated.ok) {
        // Out-of-manifest HOLD (proof 1): with an ACTIVE mission manifest, a
        // command matching neither the manifest nor band 1 is a deviation from
        // the operator-approved plan — it HOLDs even with the judge down (the
        // deviation is deterministic; the judge is context-only).
        if (missionCtx?.active) {
          pushEvidence(`judge_gate:manifest_out_of_scope:${shortHash(command)}`, JSON.stringify({ command: redactText0(command, 120), mission: missionCtx.mission, route: 'hold', cause: `judge_error:${evaluated.error}` }));
          await fireHoldNotify({ kind: 'manifest_out_of_scope', mission: missionCtx.mission, command: redactText0(command, 80), safeScore: null, reasons: [`judge_error:${evaluated.error.slice(0, 80)}`], session });
          return holdDecisionFor();
        }
        // Fail-open: an unavailable judge NEVER blocks the mission.
        if (unattended) {
          return {
            hookSpecificOutput: {
              hookEventName: 'PreToolUse',
              permissionDecision: 'allow',
              permissionDecisionReason: `JUDGE_FAIL_OPEN: ${evaluated.error} — gray command continues (mission never stalls); audit marker only.`,
            },
          };
        }
        return {};
      }
      const { safeScore, probabilities } = judgeSafeScore(evaluated.data);
      // Out-of-manifest HOLD (proof 1): the approved plan IS the manifest —
      // a deviation escalates regardless of the score (even 0.99). Judge
      // score/reasons ride along as CONTEXT for the operator only.
      if (missionCtx?.active) {
        const reasons = BAND2_QUESTIONS.map((q) => `${q.id}=${probabilities[q.id]?.toFixed(3) ?? 'n/a'}`);
        pushEvidence(`judge_gate:manifest_out_of_scope:${shortHash(command)}`, JSON.stringify({ command: redactText0(command, 120), mission: missionCtx.mission, route: 'hold', safeScore: Number(safeScore.toFixed(4)), probabilities }));
        await fireHoldNotify({ kind: 'manifest_out_of_scope', mission: missionCtx.mission, command: redactText0(command, 80), safeScore, reasons, session });
        return holdDecisionFor();
      }
      pushEvidence(`judge_gate:band2:${shortHash(command)}`, JSON.stringify({ command: redactText0(command, 120), safeScore: Number(safeScore.toFixed(4)), probabilities }));
      // HOOKS-CALIBRATION-01: a command whose DETERMINISTIC classification is
      // already read-only must not land in the blocking gray zone — its auto
      // threshold drops to JUDGE_BAND2_READ_ONLY_FLOOR. Only the genuinely
      // ambiguous keep the full 0.9 threshold. Tier-3 is untouched (this code
      // only runs AFTER the denylist returned null).
      const readOnly = isReadOnlyIndicative(command);
      const autoThreshold = readOnly ? JUDGE_BAND2_READ_ONLY_FLOOR : JUDGE_AUTO_SAFE_THRESHOLD;
      if (safeScore > autoThreshold) {
        const thresholdNote = readOnly
          ? `read-only floor ${JUDGE_BAND2_READ_ONLY_FLOOR} (deterministic read-only indication)`
          : `auto threshold ${JUDGE_AUTO_SAFE_THRESHOLD}`;
        // B1 — record the deterministic promotion signature (AUTO variant).
        recordSignature('BAND2_GRAY_AUTO', command, currentMission(), session);
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'allow',
            permissionDecisionReason: `BAND2_GRAY_AUTO: judge safeScore ${safeScore.toFixed(3)} > ${thresholdNote} — auto-executed with audit.`,
          },
        };
      }
      // 0.6–0.9: operator route with score and reasons attached; <0.6: operator.
      const band = safeScore >= JUDGE_ESCALATE_THRESHOLD ? 'BAND2_GRAY_MEDIUM' : 'BAND2_GRAY_LOW';
      // B1 — record the deterministic promotion signature (operator-route
      // variants; every gray decision is signed, auto or ask alike).
      recordSignature(band, command, currentMission(), session);
      const decision = decisionForOperatorRoute(unattended);
      const reasons = BAND2_QUESTIONS.map((q) => `${q.id}=${probabilities[q.id]?.toFixed(3) ?? 'n/a'}`).join(' ');
      return {
        ...decision,
        hookSpecificOutput: {
          ...decision.hookSpecificOutput,
          hookEventName: 'PreToolUse',
          permissionDecision: decision.hookSpecificOutput?.permissionDecision,
          permissionDecisionReason: `${band}: judge safeScore ${safeScore.toFixed(3)} (auto threshold ${JUDGE_AUTO_SAFE_THRESHOLD}) — operator approval required. risks: ${reasons}`,
        },
      };
    } catch (error) {
      // Absolute fail-open: a hook bug can never brick a session.
      if (unattended) {
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'allow',
            permissionDecisionReason: `JUDGE_FAIL_OPEN_UNEXPECTED: ${error instanceof Error ? error.message : String(error)} — mission continues.`,
          },
        };
      }
      return {};
    }
  };

  const judgeBand3Context = async (
    call: (tool: JudgeToolName, args: Record<string, unknown>) => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>,
    command: string,
  ): Promise<{ ok: true; text: string } | { ok: false }> => {
    const result = await call('engineering.judge.evaluate', {
      state: { tool: 'Bash', command: redactText0(command, 2000), band3: true },
      questions: [
        {
          id: 'q_band3_context',
          type: 'choice',
          instructions: 'CONTEXT ONLY — this command is already in the consequence band and WILL be routed to the operator regardless of your answer. Explain which risk dominates so the operator can decide faster.',
          criteria: {
            production_mutation: 'the command would mutate production or shared state',
            credential_exposure: 'the command touches credentials or secrets',
            deployment_lifecycle: 'the command is a push/deploy/merge lifecycle action',
            other: 'another consequence-class risk dominates',
          },
        },
      ],
    });
    if (!result.ok) return { ok: false };
    const data = result.data as { answers?: Array<{ choice?: string; confidence?: number }> };
    const answer = data?.answers?.[0];
    if (typeof answer?.choice !== 'string') return { ok: false };
    return { ok: true, text: `${answer.choice} (conf ${typeof answer.confidence === 'number' ? answer.confidence.toFixed(2) : 'n/a'})` };
  };

  /* ---------------- PostToolUse: error classification ---------------- */
  const postToolUse = async (input: JudgeHookInput, _toolUseID?: string, _opts?: { signal?: AbortSignal }): Promise<JudgeHookJSONOutput> => {
    try {
      if (!isErrorToolResponse(input.tool_name, input.tool_response)) return {};
      const summary = redactText0(safeJson(input.tool_response), 1000);
      // ERROR-01 candidate #13: when the tool response carries the canonical error
      // envelope, its structured semantics {code, category, retryable} feed the judge
      // state — triage reads code+category+retryable instead of interpreting raw text.
      const envelope = extractErrorEnvelope(input.tool_response);
      const state: Record<string, unknown> = { tool: input.tool_name ?? 'unknown', error: summary };
      if (envelope) state.errorEnvelope = envelope;
      const evaluated = await judgeCall('engineering.judge.evaluate', {
        state,
        questions: [
          {
            id: 'q_error_class',
            type: 'choice',
            instructions: envelope
              ? `Classify this tool failure for the mission loop. The state carries a structured errorEnvelope (code=${envelope.code} category=${envelope.category} retryable=${envelope.retryable}): let category+retryable drive the class — retryable=true leans retryable; category auth/scope/validation with retryable=false leans fatal or change_approach; category provider/dependency leans retryable (transient outage). CONTEXT ONLY for the next turn — never a command.`
              : 'Classify this tool failure for the mission loop. CONTEXT ONLY for the next turn — never a command.',
            criteria: {
              retryable: 'transient failure; retrying the same action is the right next step',
              fatal: 'unrecoverable here; the mission should stop escalating this path',
              change_approach: 'the goal stands but this method must change',
            },
          },
        ],
      });
      if (!evaluated.ok) return {};
      const data = evaluated.data as { answers?: Array<{ choice?: string; confidence?: number; probabilities?: Record<string, number> }> };
      const answer = data?.answers?.[0];
      if (typeof answer?.choice !== 'string') return {};
      pushEvidence(`judge_gate:posttooluse:${shortHash(summary)}`, JSON.stringify({ class: answer.choice, conf: answer.confidence ?? null, code: envelope?.code ?? null, category: envelope?.category ?? null }));
      return {
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: `JUDGE_POSTTOOLUSE_ERROR (context only, not a command): class=${answer.choice} conf=${typeof answer.confidence === 'number' ? answer.confidence.toFixed(2) : 'n/a'} — next turn may use this to decide retry vs approach change.`,
        },
      };
    } catch {
      return {};
    }
  };

  /* ---------------- Stop: conservative completion verify ---------------- */
  const stop = async (input: JudgeHookInput, _toolUseID?: string, _opts?: { signal?: AbortSignal }): Promise<JudgeHookJSONOutput> => {
    try {
      if (input.stop_hook_active === true) return {};
      const message = typeof input.last_assistant_message === 'string' ? input.last_assistant_message : '';
      if (!message || !COMPLETION_LIKE.test(message)) return {};
      // HOOKS-CALIBRATION-01: a message whose CLOSE asks the operator a
      // question / requests input is not a completion claim — blocking it was
      // the false positive fixed by this calibration. Zero judge calls here.
      if (awaitsOperatorInput(message)) return {};
      const claims = completionClaims(message);
      let evidence = config.stopEvidence?.() ?? '';
      const evidenceFile = env.JUDGE_HOOK_STOP_EVIDENCE;
      if (!evidence && typeof evidenceFile === 'string') {
        try {
          evidence = await readFile(evidenceFile, 'utf8');
        } catch {
          evidence = '';
        }
      }
      const verified = await judgeCall('engineering.judge.verify', {
        claims,
        evidence: redactText0(evidence || `Session final message only (no external evidence provided): ${message}`, 20000),
      });
      if (!verified.ok) return {};
      const data = verified.data as {
        aggregate?: string;
        claims?: Array<{ id?: string; text?: string; verdict?: string; probability?: number }>;
      };
      pushEvidence('judge_gate:stop', JSON.stringify({ aggregate: data.aggregate ?? null, claims: (data.claims ?? []).map((c) => ({ id: c.id, verdict: c.verdict, p: c.probability })) }));
      const weak = (data.claims ?? []).filter((c) => (c.probability ?? 0) < JUDGE_STOP_MIN_SUPPORT || c.verdict === 'contradicted' || c.verdict === 'uncertain' || c.verdict === 'not_addressed');
      const conservative = data.aggregate === 'ALL_SUPPORTED' && weak.length === 0;
      if (conservative) return {};
      const detail = (data.claims ?? [])
        .map((c) => `${c.id} '${String(c.text ?? '').slice(0, 80)}' = ${c.verdict ?? '?'} p=${typeof c.probability === 'number' ? c.probability.toFixed(2) : '?'}`)
        .join('; ');
      return {
        decision: 'block',
        reason: `JUDGE_STOP_BLOCKED: premature completion claims (aggregate=${data.aggregate ?? 'unknown'}) — ${detail}. Continue the mission and resolve the unverified claims before reporting completion.`,
      };
    } catch {
      return {};
    }
  };

  return {
    hooks: {
      PreToolUse: [{ matcher: 'Bash', hooks: [preToolUse], timeout: Math.ceil(timeoutMs / 1000) + 1 }],
      PostToolUse: [{ matcher: '*', hooks: [postToolUse], timeout: Math.ceil(timeoutMs / 1000) + 1 }],
      Stop: [{ hooks: [stop], timeout: Math.ceil(timeoutMs / 1000) + 1 }],
    },
    handlers: { preToolUse, postToolUse, stop },
  };
}

function shortHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function safeJson(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isErrorToolResponse(toolName: string | undefined, response: unknown): boolean {
  if (response === null || response === undefined) return false;
  if (typeof response === 'object') {
    const record = response as Record<string, unknown>;
    if (record.isError === true || record.is_error === true) return true;
    const exit = record.exitCode ?? record.exit_code ?? record.code;
    if (typeof exit === 'number' && exit > 0) return true;
    return false;
  }
  void toolName;
  return false;
}