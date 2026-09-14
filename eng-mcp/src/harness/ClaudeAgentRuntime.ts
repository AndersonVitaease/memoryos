/**
 * GH-02 - ClaudeAgentRuntime: the minimal real adapter between the Guardian
 * Harness (GH-01, certified PASS) and the official Claude Agent SDK
 * (@anthropic-ai/claude-agent-sdk).
 *
 * AGENTS EXECUTE. GUARDIAN VERIFIES.
 *
 * Non-negotiable authority split (mirrors GH-01):
 * - The runtime NEVER decides mission completion: AgentCycleResult.claimsComplete
 *   is never set, not even when the SDK reports subtype 'success'. Only the
 *   Guardian's CompletionGuard may conclude PASS/FAIL/BLOCKED.
 * - The runtime NEVER enforces budgets: maxCycles/maxDurationMs/maxCostUsd stay
 *   Guardian-owned. The runtime only reports the observed total_cost_usd.
 * - The runtime NEVER duplicates guards: no no-progress logic lives here.
 *
 * Production dependency policy: the official SDK is resolved through a dynamic
 * import at call time (provisioned at server boot by main.ts via npm --no-save,
 * the same proven pattern as provisionSandboxSdk). package.json is HIGH_IMPACT
 * and has no authorized write channel, so the dependency is never added to the
 * manifest. When no queryFactory is injected and the SDK is absent, the runtime
 * fails closed with CLAUDE_AGENT_SDK_UNAVAILABLE. Tests inject a deterministic
 * fake query factory; production code paths only ever use the real SDK.
 *
 * Secrets: the ENG-MCP bearer token is read from a named env var at call time,
 * mounted ONLY in the in-memory MCP headers object passed to the SDK, and is
 * never persisted, logged, serialized or returned by any method of this module.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type {
  AgentCycleResult,
  AgentRuntime,
  Evidence,
  MissionContract,
  MissionState,
} from './missionTypes.js';
import type { AgentRole, RoleModels } from './roleModels.js';
import type { WorkerSpecialization } from './workerSpecialization.js';
import type { WorkerSpecializationProfile } from './workerProfiles.js';
import {
  resolveWorkerSpecializationProfile,
  workerSpecializationPromptBlock,
} from './workerProfiles.js';
import {
  accumulateProviderUsage,
  emptyProviderUsage,
  estimateModelUsageCostUsd,
  estimateProviderCostUsd,
  readAssistantUsage,
  readResultModelUsage,
  type ProviderModelUsage,
} from './providerUsage.js';

/** Structural minimum of the official Claude Agent SDK MCP-over-HTTP server config. */
export interface ClaudeMcpServerConfig {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
  timeout?: number;
}

/**
 * HARDENING-01 — structural minimum of the official SDK canUseTool permission
 * hook: the runtime-level enforcement layer consulted by the SDK before any
 * tool executes. Decisions are explicit; a deny never executes the tool.
 */
export type CanUseToolFn = (
  toolName: string,
  input: unknown,
  permissionRequest?: { signal?: AbortSignal; suggestions?: unknown },
) => Promise<{ behavior: 'allow'; updatedInput?: unknown } | { behavior: 'deny'; message: string }>;

/** Structural minimum of the official Options fields used by this runtime. */
export interface ClaudeQueryOptions {
  mcpServers?: Record<string, ClaudeMcpServerConfig>;
  /** Official SDK resume option: session_id whose conversation is continued. */
  resume?: string;
  abortController?: AbortController;
  systemPrompt?: string;
  cwd?: string;
  /** Official SDK allowedTools; populated only from the mission contract. */
  allowedTools?: string[];
  /**
   * HARDENING-01 — official SDK disallowedTools: evaluated BEFORE allow rules
   * and removes the tool definitions entirely. Set ONLY as the deterministic
   * complement of the known built-in tools against the contract's allowedTools,
   * so an unauthorized built-in cannot even be offered to the model.
   */
  disallowedTools?: string[];
  /**
   * HARDENING-01 — official SDK canUseTool hook: second enforcement layer for
   * anything the deterministic complement cannot cover (unknown built-ins,
   * MCP tools outside the contract). Every denial becomes audit evidence.
   */
  canUseTool?: CanUseToolFn;
  /**
   * PRÉ-GH-07 — official SDK model option. Set ONLY from the Guardian's role
   * model configuration (roleModels): a role never picks its own model, and
   * the runtime never swaps it for a different (e.g. costlier) one. Absent
   * when no role config is provided (certified env-driven behavior unchanged).
   */
  model?: string;
}

/** Structural minimum of the official query() entry point. */
export type QueryFn = (params: {
  prompt: string;
  options?: ClaudeQueryOptions;
}) => AsyncIterable<unknown> & { interrupt(): Promise<unknown> };

export interface ClaudeAgentRuntimeConfig {
  /** Execution channels this runtime may use. Default: ['eng-mcp']. */
  authorizedExecutionChannels?: readonly string[];
  /** ENG-MCP MCP-over-HTTP endpoint. Default: ENG_MCP_SERVER_URL env, else the production URL. */
  engMcpServerUrl?: string;
  /** Name (never the value) of the env var holding the ENG-MCP bearer token. */
  engMcpTokenEnvVar?: string;
  /** Injectable query factory (tests only). Production resolves the official SDK. */
  queryFactory?: QueryFn;
  /** Injectable env (tests). Default: process.env. */
  env?: NodeJS.ProcessEnv;
  /** Injectable clock for evidence timestamps. Default: Date.now. */
  now?: () => number;
  /**
   * PRÉ-GH-07 — role model configuration (Guardian/config is the authority).
   * When both this and runtimeRole are set, every SDK query of this runtime
   * carries roleModels[runtimeRole] as the official model option — one-way
   * from config to SDK, never re-chosen or upgraded by the runtime/role.
   */
  roleModels?: RoleModels;
  /** Which role this runtime instance plays (advisor | supervisor | worker). */
  runtimeRole?: AgentRole;
  /**
   * SP-02 — optional worker specialization profile selector: selects the
   * delimited execution-guidance complement appended to the worker prompt.
   * Guidance only (SPECIALIZATION MAY RESTRICT OR GUIDE; SPECIALIZATION MUST
   * NEVER EXPAND AUTHORITY): it changes NO model, NO SDK option, NO tool
   * authority, NO channel, NO budget and NO contract semantics. An invalid
   * value is treated as ABSENT — the prompt stays byte-identical to legacy.
   */
  workerSpecialization?: WorkerSpecialization;
}

export const DEFAULT_AUTHORIZED_EXECUTION_CHANNELS: readonly string[] = ['eng-mcp'];
export const DEFAULT_ENG_MCP_SERVER_URL = 'https://memoryos-engmcp.2-25-96-245.nip.io/mcp';
export const DEFAULT_ENG_MCP_TOKEN_ENV_VAR = 'ENG_MCP_RUNTIME_TOKEN';

/**
 * BATCH-30/SBW-02 — the SDK server key used at options.mcpServers (see
 * buildQueryOptions). The SDK registers every tool of this server under
 * mcp__<server>__<tool>, so the CALL-facing surfaces (guidance, prompt line)
 * must use the FULL registered spelling; the ALLOWED/enforcement surfaces
 * keep the short underscore form (CERT-02 duality: isToolAllowed matches the
 * mcp__-prefixed call only through the underscore entry — a dotted entry
 * never matches). Derived everywhere, never retyped, so guidance cannot
 * drift from the registry key.
 */
export const ENG_MCP_SERVER_NAME = 'eng-mcp';

export class ClaudeAgentRuntimeError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'ClaudeAgentRuntimeError';
    this.code = code;
  }
}

const GUARDIAN_SYSTEM_PROMPT =
  'AGENTS EXECUTE. GUARDIAN VERIFIES. You execute the mission contract and ' +
  'produce evidence. The Guardian Harness alone decides completion, budgets ' +
  'and blocking. Never claim completion yourself; never redefine the criteria.';

/**
 * BATCH-30 — read-only aggregation tool, runtime-authorized for every
 * worker (operator decision 2026-09-14). Its server-side schema whitelists
 * exactly the six read tools, so it can only fan out reads the worker could
 * already issue individually; it grants no write path. TWO spellings, both
 * proven: ALLOWED/enforcement uses the SDK-facing short underscore form
 * (isToolAllowed matches the mcp__-prefixed call only through the underscore
 * entry — a dotted entry never matches; T4 E2E probe rejects the dotted form
 * with "No such tool available"), while CALL-facing surfaces (guidance,
 * prompt line) use the FULL registered spelling
 * mcp__eng-mcp__engineering_orchestrate_batch — SBW-02 elicitation proved a
 * worker taught only the short name burns turns discovering the real one.
 */
const ORCHESTRATE_BATCH_TOOL = 'engineering_orchestrate_batch';

/**
 * BATCH-30/SBW-02 — the exact spelling the SDK registers and workers must
 * CALL, derived from the server key so it cannot drift from the registry.
 * Enforcement stays on the SHORT form above (CERT-02 duality).
 */
const ORCHESTRATE_BATCH_TOOL_FULL = `mcp__${ENG_MCP_SERVER_NAME}__${ORCHESTRATE_BATCH_TOOL}`;

/**
 * SBW-02 — batched-write tool, runtime-authorized for every worker (operator
 * decision 2026-09-14). NOT a raw write grant: the server-side flow is the
 * SBW-01-certified governed cycle (materialize → write → validate → sync) —
 * validate runs tsc inside a disposable sandbox whose failure destroys it,
 * and sync is ONE acknowledgeWrite approval guarded by a per-file drift
 * check plus baseHash revalidation through repository.patch. Every file it
 * can write is a file the worker could already patch individually, under
 * STRONGER integrity guarantees, so this widens convenience, not authority.
 * Two spellings (same CERT-02/LGPD-05 duality as ORCHESTRATE_BATCH_TOOL):
 * enforcement keeps the short underscore form; CALL-facing surfaces use the
 * FULL registered spelling mcp__eng-mcp__engineering_sandbox_batchWrite.
 */
const SBW_BATCH_TOOL = 'engineering_sandbox_batchWrite';

/** BATCH-30/SBW-02 — full SDK-registered CALL spelling (see above). */
const SBW_BATCH_TOOL_FULL = `mcp__${ENG_MCP_SERVER_NAME}__${SBW_BATCH_TOOL}`;

/**
 * BATCH-30 — independent reads go through the aggregation MCP tool the
 * eng-mcp server registers as engineering.orchestrate.batch. The SDK normalizes
 * MCP names to the short underscore spelling (CERT-02/LGPD-05-proven duality:
 * engineering_compliance_assess), so ALLOWED/enforcement surfaces here use the
 * short name engineering_orchestrate_batch while CALL-facing surfaces —
 * guidance and prompt line — use the FULL registered spelling
 * ORCHESTRATE_BATCH_TOOL_FULL (SBW-02 elicitation: a worker taught only the
 * short name burned 2 turns discovering
 * mcp__eng-mcp__engineering_orchestrate_batch); the server-side dotted name
 * appears only inside operations[].tool values, where the server schema
 * expects it.
 * PERF-00/AUDIT-ORCHESTRATE evidence: workers average ~9 sequential tool
 * calls per mission (64.4% independent reads) and a single-read mission
 * costs 12-35s wall — so the structural fix is
 * FEWER inference turns, not faster turns: one orchestrate.batch call
 * aggregates up to 30 independent reads into a single turn (executed
 * concurrently server-side). The tool itself is authorized at the runtime
 * layer for every worker (see buildQueryOptions); this guidance changes no
 * other permission surface. Dependent reads stay sequential — the
 * instruction says so explicitly.
 */
const PARALLEL_READS_GUIDANCE =
  'BATCHED READS (IMPORTANT): independent reads are NEVER issued one per ' +
  'turn. When several independent reads remain — engineering.file.read, ' +
  'engineering.repo.structure, engineering.code.search, ' +
  'engineering.code.references, engineering.git.status, ' +
  `engineering.git.diff — aggregate them into ONE call of ` +
  `${ORCHESTRATE_BATCH_TOOL_FULL} (operations[], up to 30 operations, ` +
  'executed concurrently server-side) instead of one tool call per read: ' +
  '30 independent file reads = one orchestrate.batch with 30 operations, ' +
  'never 30 turns. Use EXACTLY that full registered name — the SDK exposes ' +
  'no shorter alias. A read that depends on an earlier result (a path only ' +
  'a previous read revealed, an ordered write-then-read) stays sequential ' +
  'until that dependency resolves.';

/**
 * SBW-02 — batched writes guidance (worker-facing, mirrors BATCHED READS):
 * several independent writes to DIFFERENT files are ONE governed cycle of
 * SBW_BATCH_TOOL_FULL — the full SDK-registered spelling
 * mcp__eng-mcp__engineering_sandbox_batchWrite (materialize → write →
 * validate → sync, up
 * to 10 operations, one acknowledgeWrite approval, mandatory in-sandbox tsc
 * validation, per-file drift check) instead of one file.patch per file.
 * Dependent writes (a write that needs another write's result) and a second
 * write to the SAME file stay sequential, one per item. Guidance only —
 * authorization is built by buildQueryOptions (AUTHORIZATION = source of
 * truth).
 */
const BATCHED_WRITES_GUIDANCE =
  'BATCHED WRITES (IMPORTANT): when several independent file writes remain ' +
  '(different files, no shared resource), do NOT issue one file.patch per ' +
  `file. Run ONE governed cycle of ${SBW_BATCH_TOOL_FULL}: ` +
  'materialize the target files, write up to 10 {path, content} operations, ' +
  'validate (mandatory in-sandbox tsc check — a failed check destroys the ' +
  'sandbox before anything reaches the repository) and sync with the single ' +
  'acknowledgeWrite approval. 8 independent file edits = one batchWrite ' +
  'cycle with 8 operations, never 8 separate patch approvals. Use EXACTLY ' +
  'that full registered name — the SDK exposes no shorter alias. A write ' +
  "that depends on another write's result, or a second write to the SAME " +
  'file, stays sequential and outside the batch.';

const CHANNEL_PREFIX = 'channel:';
const RUNTIME_SOURCE = 'claude-agent-sdk';
const TOOL_ENFORCEMENT_SOURCE = 'tool-enforcement';

/**
 * HARDENING-01 — every tool name the official SDK can expose natively (no MCP
 * prefix). The runtime's deterministic enforcement removes the DEFINITIONS of
 * every built-in the mission contract does not authorize: the complement,
 * not prompt obedience, is what keeps unauthorized built-ins from executing
 * (CERT-01 finding: Bash/Glob/Grep ran under an MCP-only allowedTools).
 */
export const KNOWN_BUILTIN_TOOLS: readonly string[] = [
  'Task', 'Bash', 'Glob', 'Grep', 'Read', 'Edit', 'Write', 'NotebookEdit',
  'WebFetch', 'WebSearch', 'TodoWrite', 'BashOutput', 'KillShell',
  'AskUserQuestion', 'SlashCommand', 'ExitPlanMode',
];

/**
 * HARDENING-01 — deterministic allow match. Exact name first; then the
 * CERT-02-proven short/full MCP duality (the SDK normalizes a short MCP name
 * like engineering_file_read to mcp__eng-mcp__engineering_file_read, so the
 * hook may see either spelling). The double-underscore suffix guard keeps
 * single-underscore collisions apart (engineering_file_read vs file_read).
 */
export function isToolAllowed(toolName: string, allowedTools: readonly string[]): boolean {
  if (allowedTools.includes(toolName)) return true;
  for (const entry of allowedTools) {
    if (toolName.endsWith(`__${entry}`)) return true;
    if (entry.endsWith(`__${toolName}`)) return true;
  }
  return false;
}

/**
 * HARDENING-01 — deterministic built-in complement: fail-closed by
 * construction (an empty authorization removes every built-in definition).
 */
export function disallowedBuiltinComplement(allowedTools: readonly string[]): string[] {
  return KNOWN_BUILTIN_TOOLS.filter((tool) => !allowedTools.includes(tool));
}

/** Deterministic JSON with sorted keys, for stable evidence keys. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

interface ToolUseRecord {
  name: string;
  inputJson: string;
}

export class ClaudeAgentRuntime implements AgentRuntime {
  private readonly authorizedChannels: readonly string[];
  private readonly engMcpServerUrl: string;
  private readonly engMcpTokenEnvVar: string;
  private readonly injectedQueryFactory?: QueryFn;
  private readonly env: NodeJS.ProcessEnv;
  private readonly now: () => number;
  private readonly roleModels?: RoleModels;
  private readonly runtimeRole?: AgentRole;
  private readonly workerSpecializationProfile?: WorkerSpecializationProfile;
  private readonly sessionByMission = new Map<string, string>();
  private readonly activeQueryByMission = new Map<string, AsyncIterable<unknown> & { interrupt(): Promise<unknown> }>();
  private readonly activeAbortByMission = new Map<string, AbortController>();

  constructor(config: ClaudeAgentRuntimeConfig = {}) {
    this.authorizedChannels = config.authorizedExecutionChannels ?? DEFAULT_AUTHORIZED_EXECUTION_CHANNELS;
    this.engMcpServerUrl = config.engMcpServerUrl ?? config.env?.ENG_MCP_SERVER_URL ?? DEFAULT_ENG_MCP_SERVER_URL;
    this.engMcpTokenEnvVar = config.engMcpTokenEnvVar ?? DEFAULT_ENG_MCP_TOKEN_ENV_VAR;
    this.injectedQueryFactory = config.queryFactory;
    this.env = config.env ?? process.env;
    this.now = config.now ?? (() => Date.now());
    this.roleModels = config.roleModels;
    this.runtimeRole = config.runtimeRole;
    // SP-02 — deterministic profile resolution at construction time: an
    // invalid/absent specialization resolves to undefined (legacy behavior).
    this.workerSpecializationProfile = resolveWorkerSpecializationProfile(config.workerSpecialization);
  }

  async runMission(contract: MissionContract, state: MissionState): Promise<AgentCycleResult> {
    this.assertChannelsAuthorized(contract);
    return await this.runCycle(contract, state, { resume: false });
  }

  async continueMission(contract: MissionContract, state: MissionState): Promise<AgentCycleResult> {
    this.assertChannelsAuthorized(contract);
    return await this.runCycle(contract, state, { resume: true });
  }

  /** Interrupts the active official SDK session for this mission, if any. Idempotent. */
  async cancelMission(contract: MissionContract, _state: MissionState): Promise<void> {
    this.assertChannelsAuthorized(contract);
    const active = this.activeQueryByMission.get(contract.missionId);
    if (!active) return;
    try {
      await active.interrupt();
    } finally {
      this.activeAbortByMission.get(contract.missionId)?.abort();
    }
  }

  /** Guardian-format evidence: mission evidence plus the observed SDK session. */
  async getEvidence(contract: MissionContract, state: MissionState): Promise<Evidence[]> {
    this.assertChannelsAuthorized(contract);
    const evidence: Evidence[] = [...state.evidence];
    const sessionId = this.sessionByMission.get(contract.missionId);
    if (sessionId) {
      evidence.push({
        type: 'command_result',
        key: `${RUNTIME_SOURCE}:session`,
        status: 'ok',
        value: sessionId,
        timestamp: this.now(),
        source: RUNTIME_SOURCE,
      });
    }
    return evidence;
  }

  private assertChannelsAuthorized(contract: MissionContract): void {
    for (const action of contract.allowedActions ?? []) {
      if (!action.startsWith(CHANNEL_PREFIX)) continue;
      const channel = action.slice(CHANNEL_PREFIX.length);
      if (!this.authorizedChannels.includes(channel)) {
        throw new ClaudeAgentRuntimeError(
          'UNAUTHORIZED_EXECUTION_CHANNEL',
          `channel not authorized: ${channel}`,
        );
      }
    }
  }

  private async resolveQuery(): Promise<QueryFn> {
    if (this.injectedQueryFactory) return this.injectedQueryFactory;
    // The official SDK is provisioned at boot (main.ts, npm --no-save) because
    // package.json is HIGH_IMPACT. The specifier is indirect so environments
    // without the dependency fail closed at call time instead of failing to
    // load this module. No mock/stand-in exists anywhere in production paths.
    const specifier = '@anthropic-ai/claude-agent-sdk';
    try {
      const mod = (await import(specifier)) as unknown as { query?: QueryFn };
      if (typeof mod?.query !== 'function') throw new Error('query() export missing');
      return mod.query;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new ClaudeAgentRuntimeError(
        'CLAUDE_AGENT_SDK_UNAVAILABLE',
        `official SDK ${specifier} could not be loaded: ${detail}`,
      );
    }
  }

  private async buildQueryOptions(
    contract: MissionContract,
    opts: { resume: boolean },
    abortController: AbortController,
    auditSink?: Evidence[],
  ): Promise<ClaudeQueryOptions> {
    const options: ClaudeQueryOptions = { abortController, systemPrompt: GUARDIAN_SYSTEM_PROMPT };
    if (this.authorizedChannels.includes('eng-mcp')) {
      const server: ClaudeMcpServerConfig = { type: 'http', url: this.engMcpServerUrl };
      const token = this.env[this.engMcpTokenEnvVar] ?? (await this.readEngMcpTokenCredentialFile());
      // Secret handling: the bearer value lives only in this in-memory header
      // object for the duration of the call. It is never persisted, logged or
      // returned by any method of this runtime.
      if (token) server.headers = { Authorization: `Bearer ${token}` };
      options.mcpServers = { [ENG_MCP_SERVER_NAME]: server };
    }
    if (contract.allowedTools && contract.allowedTools.length > 0) {
      // Contract-declared authorization passes through verbatim: tools absent
      // from the contract keep the SDK denial path, so unauthorized tools stay
      // denied — with ONE deliberate runtime-layer exception below.
      const allowed = [...contract.allowedTools];
      // BATCH-30 (operator decision 2026-09-14): engineering.orchestrate.batch
      // is authorized at the runtime layer for EVERY worker, contract or no
      // contract mention. It is a read-only aggregation tool whose server-side
      // schema whitelists exactly the six read tools (repo.structure,
      // file.read, code.search, code.references, git.status, git.diff), so it
      // can only fan out reads the worker could already issue individually;
      // it grants no write path. canUseTool below judges the SAME list, so
      // this remains enforcement, not prompt obedience.
      if (!allowed.includes(ORCHESTRATE_BATCH_TOOL)) allowed.push(ORCHESTRATE_BATCH_TOOL);
      // SBW-02 (operator decision 2026-09-14): engineering.sandbox.batchWrite
      // is runtime-authorized for EVERY worker, contract or no contract
      // mention. It is the SBW-01-certified governed write batch (materialize
      // → write → validate → sync): the mandatory in-sandbox tsc validation
      // destroys the sandbox on failure, and the single sync approval is
      // guarded by a per-file drift check + baseHash revalidation through
      // repository.patch, so it can only write files the worker could already
      // patch individually — with stronger integrity guarantees, not weaker.
      // canUseTool below judges the SAME list, so this remains enforcement,
      // not prompt obedience.
      if (!allowed.includes(SBW_BATCH_TOOL)) allowed.push(SBW_BATCH_TOOL);
      options.allowedTools = allowed;
      // HARDENING-01 — runtime enforcement, NOT prompt obedience. Layer 1:
      // the deterministic built-in complement removes the tool DEFINITIONS
      // the contract does not authorize (the SDK evaluates disallowedTools
      // before allow rules), so the model cannot even call them. Layer 2:
      // canUseTool denies anything else that slips through and turns every
      // denial into audit evidence — WORKER_UNAUTHORIZED_TOOL_EXECUTED=0 by
      // construction, provable without trusting the model.
      const complement = disallowedBuiltinComplement(allowed);
      if (complement.length > 0) options.disallowedTools = complement;
      options.canUseTool = async (toolName) => {
        if (isToolAllowed(toolName, allowed)) return { behavior: 'allow' };
        auditSink?.push({
          type: 'command_result',
          key: `tool_enforcement:${toolName}:${shortHash(contract.missionId)}`,
          status: 'ok',
          value: JSON.stringify({
            missionId: contract.missionId,
            decision: 'deny',
            toolRequested: toolName,
            toolAllowed: false,
            toolExecuted: false,
            allowedTools: [...allowed],
            reason: 'tool_not_in_contract_allowedTools',
            timestamp: this.now(),
          }),
          timestamp: this.now(),
          source: TOOL_ENFORCEMENT_SOURCE,
        });
        // The literal HARD marker ('unauthorized') keeps the certified GH-04A
        // classification fail-closed: any fail evidence carrying this denial
        // classifies hard and the Guardian blocks — it is never retried into
        // progress. The audit event above is the positive proof of the block.
        return {
          behavior: 'deny',
          message: `UNAUTHORIZED_TOOL_DENIED_BY_CONTRACT: tool ${toolName} is not in mission allowedTools`,
        };
      };
    }
    if (this.roleModels && this.runtimeRole) {
      // PRÉ-GH-07: model selection is Guardian-config one-way flow — the
      // configured identifier for this role goes verbatim into the official
      // model option. No swap, no costly fallback, no role-side choice.
      options.model = this.roleModels[this.runtimeRole];
    }
    if (opts.resume) {
      const sessionId = this.sessionByMission.get(contract.missionId);
      if (sessionId) options.resume = sessionId; // official SDK: continue that session
    }
    return options;
  }

  /**
   * GH-03A.2 governed credential channel: the official deploy mounts the
   * runtime token as a read-only credential file and points
   * ENG_MCP_RUNTIME_TOKEN_CREDENTIAL_FILE at it (same credential-file pattern
   * as vpsTransport). The explicit env var wins when present; an absent or
   * unreadable file yields undefined, leaving the runtime without a token —
   * the MCP server then rejects unauthenticated calls (fail closed). The
   * value is never logged, persisted or returned.
   */
  private async readEngMcpTokenCredentialFile(): Promise<string | undefined> {
    const credentialFile = this.env.ENG_MCP_RUNTIME_TOKEN_CREDENTIAL_FILE;
    if (!credentialFile) return undefined;
    try {
      const token = (await readFile(credentialFile, 'utf8')).trim();
      return token ? token : undefined;
    } catch {
      return undefined;
    }
  }

  private buildPrompt(contract: MissionContract, state: MissionState, opts: { resume: boolean }): string {
    const lines: string[] = [];
    lines.push(`MISSION ${contract.missionId}`);
    lines.push(`OBJECTIVE: ${contract.objective}`);
    lines.push('COMPLETION CRITERIA (the Guardian verifies; each needs ok evidence):');
    for (const criterion of contract.completionCriteria) lines.push(`- ${criterion}`);
    if (this.authorizedChannels.length > 0) {
      lines.push(`EXECUTION CHANNELS: ${this.authorizedChannels.join(', ')}`);
    }
    if (contract.allowedFiles && contract.allowedFiles.length > 0) {
      lines.push('ALLOWED FILES:');
      for (const file of contract.allowedFiles) lines.push(`- ${file}`);
    }
    if (contract.allowedTools && contract.allowedTools.length > 0) {
      lines.push('ALLOWED TOOLS:');
      for (const tool of contract.allowedTools) lines.push(`- ${tool}`);
      // BATCH-30 — surface the runtime-authorized aggregation tool so the
      // worker knows it exists even when the contract omits it. The prompt
      // line teaches the FULL registered CALL spelling (SBW-02 elicitation);
      // the membership check stays on the SHORT form the contract lists.
      if (!contract.allowedTools.includes(ORCHESTRATE_BATCH_TOOL)) {
        lines.push(`- ${ORCHESTRATE_BATCH_TOOL_FULL} (runtime-authorized: aggregate independent reads, up to 30 ops)`);
      }
      // SBW-02 — surface the runtime-authorized batched-write tool so the
      // worker knows it exists even when the contract omits it (full CALL
      // spelling; membership check stays on the SHORT form).
      if (!contract.allowedTools.includes(SBW_BATCH_TOOL)) {
        lines.push(`- ${SBW_BATCH_TOOL_FULL} (runtime-authorized: batch independent file writes, up to 10 ops, one governed cycle)`);
      }
    }
    if (contract.forbiddenActions && contract.forbiddenActions.length > 0) {
      lines.push('FORBIDDEN ACTIONS:');
      for (const action of contract.forbiddenActions) lines.push(`- ${action}`);
    }
    if (state.completedSteps.length > 0) {
      lines.push('ALREADY DONE (do not redo):');
      for (const step of state.completedSteps) lines.push(`- ${step}`);
    }
    if (state.remainingSteps.length > 0) {
      lines.push('REMAINING:');
      for (const step of state.remainingSteps) lines.push(`- ${step}`);
    }
    if (state.lastDecision?.decision === 'RECOVER') {
      // GH-04A: the Guardian classified an intermediate failure and authorized
      // a bounded recovery. Same mission, same budget, same permissions —
      // the runtime only surfaces it, it never widens the contract.
      lines.push('RECOVERY CONTEXT (same mission, same budget, same permissions):');
      if (state.lastError) lines.push(`- last error: ${state.lastError}`);
      lines.push(`- classification: ${state.lastClassification ?? 'unknown'}`);
      lines.push(`- next action: ${state.lastDecision.nextAction ?? 'authoritative_source_query'}`);
      lines.push(`- reason: ${state.lastDecision.reason}`);
    }
    lines.push(
      opts.resume
        ? 'MODE: resume - the SDK continues the recorded session; report only new evidence.'
        : 'MODE: start - execute the mission contract and report evidence.',
    );
    lines.push('Do not claim completion. The Guardian verifies evidence and budgets.');
    // PERF-00 — turn-level parallel reads guidance, AFTER the authority line
    // and BEFORE any specialization complement: the worker batches genuinely
    // independent reads into one turn instead of serializing them one per
    // turn. Prompt-only — it changes no authorization surface.
    lines.push(PARALLEL_READS_GUIDANCE);
    // SBW-02 — batched writes guidance, immediately after the reads guidance
    // and still BEFORE any specialization complement. Prompt-only — it
    // changes no authorization surface.
    lines.push(BATCHED_WRITES_GUIDANCE);
    // SP-02 — delimited specialization complement, appended AFTER the base
    // prompt: with no profile selected the block is empty and the prompt is
    // BYTE-IDENTICAL to legacy. The complement is guidance only — it grants
    // no permission, channel, budget or tool and never touches the SDK
    // options built by buildQueryOptions (AUTHORIZATION = source of truth).
    const specializationBlock = workerSpecializationPromptBlock(this.workerSpecializationProfile);
    if (specializationBlock.length > 0) {
      lines.push(specializationBlock);
    }
    return lines.join('\n');
  }

  private async runCycle(
    contract: MissionContract,
    state: MissionState,
    opts: { resume: boolean },
  ): Promise<AgentCycleResult> {
    const steps = new Set<string>();
    const evidence: Evidence[] = [];
    const toolUses = new Map<string, ToolUseRecord>();
    let costUsd: number | undefined;
    // GUARDIAN-COST-ROUTE-01 — provider-side usage, accumulated from the
    // Anthropic-compatible usage block each SDK assistant message carries.
    // Purely observational: never consulted by any decision path.
    const providerUsage = emptyProviderUsage();
    let providerModel: string | undefined;
    let providerModelUsage: ProviderModelUsage | undefined;
    // HARDENING-01 — audit evidence produced by the canUseTool hook while the
    // SDK stream runs; drained into the cycle evidence in finally so a denial
    // is recorded even when the stream then errors out.
    const enforcementAudit: Evidence[] = [];

    try {
      const queryFn = await this.resolveQuery();
      const abortController = new AbortController();
      const options = await this.buildQueryOptions(contract, opts, abortController, enforcementAudit);
      const prompt = this.buildPrompt(contract, state, opts);
      const query = queryFn({ prompt, options });
      this.activeQueryByMission.set(contract.missionId, query);
      this.activeAbortByMission.set(contract.missionId, abortController);

      for await (const raw of query) {
        const message = raw as Record<string, unknown>;
        const sessionId = typeof message.session_id === 'string' ? message.session_id : undefined;
        if (sessionId) this.sessionByMission.set(contract.missionId, sessionId);
        if (message.type === 'assistant') {
          this.ingestAssistant(message, steps, toolUses);
          const read = readAssistantUsage(message);
          if (read.usage) {
            accumulateProviderUsage(providerUsage, read.usage);
            if (read.model) providerModel = read.model;
          }
        } else if (message.type === 'user') {
          this.ingestUser(message, toolUses, evidence);
        } else if (message.type === 'result') {
          this.ingestResult(message, steps, evidence);
          // Provider-returned per-model totals live on the result message —
          // on OpenRouter routes the per-assistant usage blocks arrive zeroed
          // (observed live), so this is the reliable real-usage capture.
          const modelUsage = readResultModelUsage(message);
          if (modelUsage) providerModelUsage = modelUsage;
        }
        const messageCost = typeof message.total_cost_usd === 'number' ? message.total_cost_usd : undefined;
        if (messageCost !== undefined) costUsd = messageCost;
      }
    } catch (error) {
      // Runtime/transport failure is evidence for the Guardian to judge
      // (GH-04A intermediate-failure path), not a runtime crash: the Guardian
      // owns blocking decisions. Only the error code/message is persisted —
      // never the MCP bearer token or any other secret.
      const detail =
        error instanceof ClaudeAgentRuntimeError
          ? error.code
          : error instanceof Error
            ? error.message.slice(0, 160)
            : String(error).slice(0, 160);
      evidence.push({
        type: 'command_result',
        key: `${RUNTIME_SOURCE}:stream_error`,
        status: 'fail',
        value: detail,
        timestamp: this.now(),
        source: RUNTIME_SOURCE,
      });
    } finally {
      this.activeQueryByMission.delete(contract.missionId);
      this.activeAbortByMission.delete(contract.missionId);
      // HARDENING-01 — drain the enforcement audit in every exit path.
      evidence.push(...enforcementAudit.splice(0));
    }

    // GUARDIAN-COST-ROUTE-01 — provider accounting, kept SEPARATE from
    // costUsd: the tokens are what the PROVIDER returned (per-message usage
    // blocks + the result's per-model modelUsage totals), and providerCostUsd
    // is priced from the OpenRouter catalog of the ACTUAL model keys
    // (costUsd is priced from Anthropic's table by the SDK and is known to
    // overstate real provider cost by orders of magnitude). The estimate
    // excludes cache-read tokens (the catalog exposes no cache-read price) —
    // it can only understate, never inflate. Data only: no decision reads it.
    const configuredRoleModel =
      this.roleModels && this.runtimeRole ? this.roleModels[this.runtimeRole] : undefined;
    const providerRoute = providerModel ?? configuredRoleModel;
    const hasModelUsage = providerModelUsage !== undefined && Object.keys(providerModelUsage).length > 0;
    let providerCostUsd: number | undefined;
    let providerCostSource: string;
    if (hasModelUsage && providerModelUsage) {
      providerCostUsd = estimateModelUsageCostUsd(providerModelUsage);
      providerCostSource = providerCostUsd === undefined ? 'catalog_miss' : 'catalog_estimate';
    } else if (providerRoute) {
      providerCostUsd = estimateProviderCostUsd(providerRoute, providerUsage);
      providerCostSource = providerCostUsd === undefined ? 'catalog_miss' : 'catalog_estimate';
    } else {
      providerCostSource = 'route_unknown';
    }
    evidence.push({
      type: 'command_result',
      key: `${RUNTIME_SOURCE}:provider_usage`,
      // 'unknown', never 'ok': this is accounting telemetry, not proof of work.
      // status 'ok' would be counted by the Guardian's classification (okCount
      // at guards.ts), the no-progress fingerprint (filters status==='ok' — an
      // 'ok' entry here would flip transient failures into
      // expectation_mismatch) and CompletionGuard semantics. 'unknown' keeps
      // it visible in evidence yet behavior-inert, so cost capture changes NO
      // Guardian decision path.
      status: 'unknown',
      value: JSON.stringify({
        model: providerRoute ?? null,
        modelObserved: providerModel ?? null,
        requests: providerUsage.requests,
        perMessageUsage: {
          inputTokens: providerUsage.inputTokens,
          outputTokens: providerUsage.outputTokens,
          cacheReadInputTokens: providerUsage.cacheReadInputTokens,
          cacheCreationInputTokens: providerUsage.cacheCreationInputTokens,
        },
        providerModelUsage: providerModelUsage ?? null,
        providerCostUsd: providerCostUsd ?? null,
        providerCostSource,
        sdkCostUsd: costUsd ?? null,
        sdkCostSource: 'sdk_anthropic_pricing',
      }),
      timestamp: this.now(),
      source: RUNTIME_SOURCE,
    });

    // The runtime NEVER sets claimsComplete - completion is Guardian-owned.
    return {
      strategy: RUNTIME_SOURCE,
      steps: [...steps],
      evidence,
      costUsd,
      providerUsage,
      providerModelUsage,
      providerCostUsd,
    };
  }

  private ingestAssistant(
    message: Record<string, unknown>,
    steps: Set<string>,
    toolUses: Map<string, ToolUseRecord>,
  ): void {
    const envelope = message.message as { content?: unknown } | undefined;
    const content = envelope && Array.isArray(envelope.content) ? envelope.content : undefined;
    if (!content) return;
    for (const raw of content) {
      const block = raw as Record<string, unknown>;
      if (block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string') {
        const inputJson = stableStringify(block.input);
        toolUses.set(block.id, { name: block.name, inputJson });
        steps.add(`tool_use:${block.name}`);
      }
    }
  }

  private ingestUser(
    message: Record<string, unknown>,
    toolUses: Map<string, ToolUseRecord>,
    evidence: Evidence[],
  ): void {
    const envelope = message.message as { content?: unknown } | undefined;
    const content = envelope && Array.isArray(envelope.content) ? envelope.content : undefined;
    if (!content) return;
    for (const raw of content) {
      const block = raw as Record<string, unknown>;
      if (block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
        const used = toolUses.get(block.tool_use_id);
        const isError = block.is_error === true;
        // Evidence key derives from the deterministic tool use content, never
        // from transport ids, so repeated identical calls cannot fake progress
        // and the Guardian's no-progress guard stays authoritative. The first
        // text block is kept as value: GH-04A classification reads these
        // deterministic error markers (timeout/unauthorized/alias/...).
        const key = used
          ? `tool:${used.name}:${shortHash(used.inputJson)}`
          : `tool_result:${shortHash(block.tool_use_id)}`;
        evidence.push({
          type: 'tool_result',
          key,
          status: isError ? 'fail' : 'ok',
          value: this.extractToolResultText(block),
          timestamp: this.now(),
          source: RUNTIME_SOURCE,
        });
      }
    }
  }

  /** First text block of a tool_result, truncated — the GH-04A error marker. */
  private extractToolResultText(block: Record<string, unknown>): string | undefined {
    const content = block.content;
    if (!Array.isArray(content)) return undefined;
    for (const raw of content) {
      const part = raw as Record<string, unknown>;
      if (part.type === 'text' && typeof part.text === 'string' && part.text.length > 0) {
        return part.text.slice(0, 160);
      }
    }
    return undefined;
  }

  private ingestResult(
    message: Record<string, unknown>,
    steps: Set<string>,
    evidence: Evidence[],
  ): void {
    const subtype = typeof message.subtype === 'string' ? message.subtype : 'unknown';
    const isError = message.is_error === true || subtype.startsWith('error');
    steps.add(`result:${subtype}`);
    evidence.push({
      type: 'command_result',
      key: `${RUNTIME_SOURCE}:result:${subtype}`,
      status: isError ? 'fail' : 'ok',
      timestamp: this.now(),
      source: RUNTIME_SOURCE,
    });
  }
}
