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

export type JudgeToolName = 'engineering.judge.verify' | 'engineering.judge.evaluate';

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
  env?: NodeJS.ProcessEnv;
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
  'tree', 'less',
]);

const TRIVIAL_GIT_SUBCOMMANDS = new Set(['status', 'log', 'diff', 'show', 'branch', 'remote', 'rev-parse', 'config']);

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
  { pattern: /\/data\/credentials\/|\/run\/secrets\/|tokens\.json|openrouter|api[_-]?key|authorization:\s*bearer|\.ssh\/|id_rsa|\.env\b/, label: 'credential-access' },
];

/** Shell metacharacters that make a first-token allowlist match unsafe for band 1. */
const UNSAFE_METACHARS = /[;|&<>`$]/;

/** Band 1: deterministic read-only allowlist, zero judge calls by construction. */
export function isTrivialCommand(command: string): boolean {
  const cmd = command.trim();
  if (cmd.length === 0 || cmd.includes('\n')) return false;
  if (UNSAFE_METACHARS.test(cmd)) return false;
  if (TRIVIAL_EXACT_COMMANDS.has(cmd)) return true;
  const first = cmd.split(/\s+/)[0];
  if (first.startsWith('./') || first.startsWith('/') || first.includes('=')) return false;
  if (TRIVIAL_FIRST_TOKENS.has(first)) return true;
  if (first === 'git' || first === 'docker') {
    const sub = cmd.split(/\s+/)[1];
    if (!sub) return false;
    if (first === 'git') return TRIVIAL_GIT_SUBCOMMANDS.has(sub);
    return TRIVIAL_DOCKER_SUBCOMMANDS.has(sub);
  }
  return false;
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

async function defaultJudgeClient(
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
  const results = (evaluateData as { results?: Array<{ id?: string; probability?: number }> })?.results;
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

function resolveCredential(
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

  /* ---------------- PreToolUse: 3-band policy ---------------- */
  const preToolUse = async (input: JudgeHookInput, _toolUseID?: string, opts?: { signal?: AbortSignal }): Promise<JudgeHookJSONOutput> => {
    try {
      if (input.tool_name !== 'Bash') return {};
      const command = typeof (input.tool_input as { command?: unknown } | null)?.command === 'string'
        ? (input.tool_input as { command: string }).command
        : null;
      if (command === null) return {};

      // Band 3 — denylist match routes DIRECTLY to the operator. The judge
      // is consulted for explanation context only, AFTER the decision is
      // fixed; its answer can never flip the route.
      const deny = matchDenylist(command);
      if (deny !== null) {
        const decision = decisionForOperatorRoute(unattended);
        const reason = `BAND3_CONSEQUENCE: denylist match (${deny}) — the judge never approves consequences; operator decides.`;
        const context = await judgeBand3Context(judgeCall, command);
        pushEvidence(`judge_gate:band3:${deny}`, JSON.stringify({ command: redactText0(command, 200), route: unattended ? 'deny' : 'ask', judgeContext: context }));
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

      // Band 1 — deterministic read-only allowlist. ZERO judge calls.
      if (isTrivialCommand(command)) {
        pushEvidence(`judge_gate:band1:${shortHash(command)}`, JSON.stringify({ command: redactText0(command, 120), route: 'allow' }));
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
      if (!evaluated.ok) {
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
      pushEvidence(`judge_gate:band2:${shortHash(command)}`, JSON.stringify({ command: redactText0(command, 120), safeScore: Number(safeScore.toFixed(4)), probabilities }));
      if (safeScore > JUDGE_AUTO_SAFE_THRESHOLD) {
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'allow',
            permissionDecisionReason: `BAND2_GRAY_AUTO: judge safeScore ${safeScore.toFixed(3)} > ${JUDGE_AUTO_SAFE_THRESHOLD} — auto-executed with audit.`,
          },
        };
      }
      // 0.6–0.9: operator route with score and reasons attached; <0.6: operator.
      const band = safeScore >= JUDGE_ESCALATE_THRESHOLD ? 'BAND2_GRAY_MEDIUM' : 'BAND2_GRAY_LOW';
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
    const data = result.data as { results?: Array<{ choice?: string; confidence?: number }> };
    const answer = data?.results?.[0];
    if (typeof answer?.choice !== 'string') return { ok: false };
    return { ok: true, text: `${answer.choice} (conf ${typeof answer.confidence === 'number' ? answer.confidence.toFixed(2) : 'n/a'})` };
  };

  /* ---------------- PostToolUse: error classification ---------------- */
  const postToolUse = async (input: JudgeHookInput, _toolUseID?: string, _opts?: { signal?: AbortSignal }): Promise<JudgeHookJSONOutput> => {
    try {
      if (!isErrorToolResponse(input.tool_name, input.tool_response)) return {};
      const summary = redactText0(safeJson(input.tool_response), 1000);
      const evaluated = await judgeCall('engineering.judge.evaluate', {
        state: { tool: input.tool_name ?? 'unknown', error: summary },
        questions: [
          {
            id: 'q_error_class',
            type: 'choice',
            instructions: 'Classify this tool failure for the mission loop. CONTEXT ONLY for the next turn — never a command.',
            criteria: {
              retryable: 'transient failure; retrying the same action is the right next step',
              fatal: 'unrecoverable here; the mission should stop escalating this path',
              change_approach: 'the goal stands but this method must change',
            },
          },
        ],
      });
      if (!evaluated.ok) return {};
      const data = evaluated.data as { results?: Array<{ choice?: string; confidence?: number; probabilities?: Record<string, number> }> };
      const answer = data?.results?.[0];
      if (typeof answer?.choice !== 'string') return {};
      pushEvidence(`judge_gate:posttooluse:${shortHash(summary)}`, JSON.stringify({ class: answer.choice, conf: answer.confidence ?? null }));
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