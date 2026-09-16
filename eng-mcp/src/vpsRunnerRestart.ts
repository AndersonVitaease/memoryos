// engineering.vps.runner.restart — controlled restart supertool for the OFFICIAL
// release runner service (eng-mcp-release-runner.service), the only long-lived
// service this server may recycle. Zero raw shell/SSH/systemctl: the mutation is
// the runner's OWN governed "restart" operation over the official Unix socket
// channel (callReleaseRunner, injected here as runRunner) — the runner persists a
// restart-intent snapshot, raises a draining flag (new pipeline jobs are refused),
// then self-exits with the protocol code 42; the systemd supervisor (unit must
// carry Restart=on-failure|always AND SuccessExitStatus=42 AND
// RestartForceExitStatus=42 — verified fail-closed by BOTH the runner precheck and
// this tool's precheck) performs the actual recycle and the next boot's recover()
// completes the pending intent. The caller can never choose operation, target,
// socket, command or exit code (strict { execute?, approval? } input).
//
// PLAN mode (execute defaults to false) is fully read-only: one official status
// call surfaces runnerMeta (pid/uptime/draining/lastRestart*/recovery counter and
// the parsed unit directives); blockers mirror the runner's own fail-closed
// precheck (directives missing/incompatible, already draining, unreachable).
//
// Mutation requires execute=true AND approval.approved=true SIMULTANEOUSLY. The
// runner answers 202 {accepted, restartId, status:"pending"} — ACCEPTED/pending is
// NEVER reported as RESTARTED. Bounded status polling then requires ALL five
// postcheck criteria for RESTARTED: runner reachable again, pid changed,
// lastRestartId === restartId, lastRestartOutcome === "completed" (the next
// generation completed the intent) and lastRecoveryMarked === 0 (zero orphaned
// jobs). Poll exhaustion -> UNKNOWN with POSTCHECK_INCOMPLETE and the durable
// restartId (re-invoke to re-check). Non-202 -> NOT_RESTARTED with the runner's
// own blockers. No LLM; no SSH/shell; nothing caller-controlled reaches the
// request body.
import * as z from "zod/v4";

export const VPS_RUNNER_RESTART_STATUSES = ["PLAN", "ACCEPTED", "RESTARTED", "NOT_RESTARTED", "BLOCKED", "UNKNOWN"] as const;
export type VpsRunnerRestartStatus = (typeof VPS_RUNNER_RESTART_STATUSES)[number];

export const vpsRunnerRestartInputSchema = z.object({
  execute: z.boolean().optional(),
  approval: z.object({ approved: z.boolean() }).strict().optional()
}).strict();
export type VpsRunnerRestartInput = z.infer<typeof vpsRunnerRestartInputSchema>;

export type VpsRunnerRestartRunnerOperation = "status" | "restart";
export interface VpsRunnerRestartRunnerResponse { httpStatus: number; body: unknown; }

export interface VpsRunnerRestartCatalog {
  catalogHash?: string;
  catalogVersion?: string;
  toolCount?: number;
}

export interface VpsRunnerRestartDeps {
  runRunner?: (operation: VpsRunnerRestartRunnerOperation, jobId?: string) => Promise<VpsRunnerRestartRunnerResponse>;
  readCatalog?: () => Promise<VpsRunnerRestartCatalog | null>;
  pollAttempts?: number;
  pollDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface VpsRunnerRestartFinding {
  code: string;
  severity: "critical" | "warning" | "info";
  detail?: string;
  httpStatus?: number;
}

export interface VpsRunnerRestartUnitDirectives {
  restart?: string | null;
  successExitStatus?: string[];
  restartForceExitStatus?: string[];
}

export interface VpsRunnerRestartRunnerMeta {
  pid?: number;
  uptime?: number;
  startedAt?: string;
  draining?: boolean;
  lastRestartId?: string | null;
  lastRestartOutcome?: string | null;
  lastRecoveryMarked?: number;
  unit?: VpsRunnerRestartUnitDirectives | null;
}

export interface VpsRunnerRestartPrecheck {
  runnerReachable: boolean;
  draining: boolean;
  pid: number | null;
  unit: VpsRunnerRestartUnitDirectives | null;
  unitBlockers: string[];
  blockers: string[];
}

export interface VpsRunnerRestartPostcheck {
  attempts: number;
  criteria: {
    runnerReachable: boolean;
    pidChanged: boolean;
    lastRestartIdMatches: boolean;
    lastRestartOutcomeCompleted: boolean;
    zeroOrphans: boolean;
  };
  runnerMeta: VpsRunnerRestartRunnerMeta | null;
}

export interface VpsRunnerRestartResult {
  status: VpsRunnerRestartStatus;
  mutationPerformed: boolean;
  precheck: VpsRunnerRestartPrecheck;
  plan: { action: "restart"; possible: boolean; requires: string[]; mechanism: string };
  execution?: { accepted: boolean; restartId: string; status: string; idempotent?: boolean };
  pending?: true;
  restartId?: string;
  nextAction?: string;
  postcheck?: VpsRunnerRestartPostcheck;
  findings: VpsRunnerRestartFinding[];
}

const CONTROLLED_RESTART_EXIT_CODE = 42;
const PLAN_REQUIRES = ["execute=true", "approval.approved=true"];
const MECHANISM = `self-exit+systemd (runner exits with code ${CONTROLLED_RESTART_EXIT_CODE}; unit requires Restart=on-failure|always + SuccessExitStatus=${CONTROLLED_RESTART_EXIT_CODE} + RestartForceExitStatus=${CONTROLLED_RESTART_EXIT_CODE})`;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asRunnerMeta(value: unknown): VpsRunnerRestartRunnerMeta | null {
  const record = asRecord(value);
  if (!record) return null;
  const unitRaw = asRecord(record.unit);
  return {
    pid: typeof record.pid === "number" && Number.isFinite(record.pid) ? record.pid : undefined,
    uptime: typeof record.uptime === "number" ? record.uptime : undefined,
    startedAt: typeof record.startedAt === "string" ? record.startedAt : undefined,
    draining: record.draining === true,
    lastRestartId: typeof record.lastRestartId === "string" ? record.lastRestartId : null,
    lastRestartOutcome: typeof record.lastRestartOutcome === "string" ? record.lastRestartOutcome : null,
    lastRecoveryMarked: typeof record.lastRecoveryMarked === "number" ? record.lastRecoveryMarked : undefined,
    unit: unitRaw ? {
      restart: typeof unitRaw.restart === "string" ? unitRaw.restart : null,
      successExitStatus: Array.isArray(unitRaw.successExitStatus) ? unitRaw.successExitStatus.filter((entry): entry is string => typeof entry === "string") : [],
      restartForceExitStatus: Array.isArray(unitRaw.restartForceExitStatus) ? unitRaw.restartForceExitStatus.filter((entry): entry is string => typeof entry === "string") : []
    } : null
  };
}

// Tool-side mirror of the runner's directive precheck (defense in depth: the
// runner re-checks fail-closed at mutation time; both sides must agree).
function unitBlockersFor(unit: VpsRunnerRestartUnitDirectives | null): string[] {
  if (!unit) return ["UNIT_DIRECTIVES_UNVERIFIABLE"];
  const blockers: string[] = [];
  if (unit.restart !== "on-failure" && unit.restart !== "always") blockers.push(`UNIT_RESTART_UNSUPPORTED:${unit.restart ?? "absent"}`);
  if (!unit.successExitStatus?.includes(String(CONTROLLED_RESTART_EXIT_CODE))) blockers.push("UNIT_SUCCESS_EXIT_STATUS_MISSING:42");
  if (!unit.restartForceExitStatus?.includes(String(CONTROLLED_RESTART_EXIT_CODE))) blockers.push("UNIT_RESTART_FORCE_EXIT_STATUS_MISSING:42");
  return blockers;
}

export async function runVpsRunnerRestart(rawInput: unknown, deps: VpsRunnerRestartDeps = {}): Promise<VpsRunnerRestartResult> {
  const input = vpsRunnerRestartInputSchema.parse(rawInput ?? {});
  const runRunner = deps.runRunner;
  const readCatalog = deps.readCatalog ?? (async (): Promise<VpsRunnerRestartCatalog | null> => null);
  const pollAttempts = deps.pollAttempts ?? 10;
  const pollDelayMs = deps.pollDelayMs ?? 2_000;
  const sleep = deps.sleep ?? ((ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms)));

  const findings: VpsRunnerRestartFinding[] = [];
  const blockers: string[] = [];
  const pushFinding = (code: string, severity: VpsRunnerRestartFinding["severity"], extra: { detail?: string; httpStatus?: number } = {}): void => {
    findings.push({ code, severity, ...extra });
  };
  const pushBlocker = (code: string): void => { if (!blockers.includes(code)) blockers.push(code); };

  // 1. Read-only status evidence: runnerMeta + live catalog.
  let meta: VpsRunnerRestartRunnerMeta | null = null;
  let runnerReachable = false;
  if (runRunner) {
    try {
      const status = await runRunner("status");
      meta = asRunnerMeta(asRecord(status.body)?.runnerMeta);
      runnerReachable = status.httpStatus === 200 && meta !== null;
      if (status.httpStatus !== 200) pushFinding("RUNNER_STATUS_NON_200", "warning", { httpStatus: status.httpStatus });
    } catch (error) {
      pushFinding("RUNNER_UNREACHABLE", "warning", { detail: error instanceof Error ? error.message.slice(0, 200) : "status call failed" });
    }
  } else {
    pushFinding("RUNNER_CHANNEL_UNAVAILABLE", "warning", { detail: "official release runner channel is not available" });
  }
  const catalog = await readCatalog().catch(() => null);
  if (!catalog) pushFinding("CATALOG_UNAVAILABLE", "info", { detail: "live catalog evidence unavailable; continuing with runner evidence only" });

  const unit = meta?.unit ?? null;
  const unitBlockers = unitBlockersFor(unit);
  const draining = meta?.draining === true;
  if (!runnerReachable) pushBlocker("RUNNER_UNREACHABLE");
  if (draining) pushBlocker("RUNNER_DRAINING");
  for (const blocker of unitBlockers) pushBlocker(blocker);
  if (runnerReachable && (typeof meta?.pid !== "number" || typeof meta?.lastRestartId === "undefined" || typeof meta?.lastRecoveryMarked !== "number")) pushBlocker("RUNNER_META_INCOMPLETE");

  const precheck: VpsRunnerRestartPrecheck = { runnerReachable, draining, pid: meta?.pid ?? null, unit, unitBlockers, blockers };
  const plan = { action: "restart" as const, possible: false, requires: PLAN_REQUIRES, mechanism: MECHANISM };
  const result: VpsRunnerRestartResult = { status: "UNKNOWN", mutationPerformed: false, precheck, plan, findings };

  // 2. Strict precheck — every blocker refuses the mutation (fail-closed).
  if (blockers.length > 0) {
    for (const blocker of blockers) pushFinding(blocker, blocker === "RUNNER_UNREACHABLE" || blocker.startsWith("UNIT_") ? "critical" : "warning", { detail: "restart refused: fail-closed precheck blocker present" });
    result.status = "BLOCKED";
    return result;
  }
  plan.possible = true;

  // 3. PLAN mode (execute defaults to false) — zero mutation.
  if (input.execute !== true) {
    result.status = "PLAN";
    return result;
  }

  // 4. Approval gate: execute=true AND approval.approved=true are required together.
  if (input.approval?.approved !== true) {
    pushBlocker("APPROVAL_REQUIRED");
    pushFinding("APPROVAL_REQUIRED", "critical", { detail: "mutation requires execute=true AND approval.approved=true" });
    result.status = "BLOCKED";
    return result;
  }

  // 5. Execution: the runner's own governed restart operation (fixed constant over
  // the official Unix socket channel). 202 + accepted + restartId is an
  // ACCEPTANCE, never a completed restart: the old generation is still draining.
  if (!runRunner || typeof meta?.pid !== "number") {
    pushFinding("RUNNER_UNAVAILABLE", "warning", { detail: "official release runner channel is not available" });
    return result;
  }
  const oldPid = meta.pid;
  let restartId: string | null = null;
  try {
    const accepted = await runRunner("restart");
    const body = asRecord(accepted.body);
    const candidateRestartId = typeof body?.restartId === "string" ? body.restartId : null;
    if (accepted.httpStatus !== 202 || body?.accepted !== true || !candidateRestartId) {
      const refusedBlockers = Array.isArray(body?.blockers) ? body.blockers.filter((entry): entry is string => typeof entry === "string") : [];
      const errorText = typeof body?.error === "string" ? body.error.slice(0, 256) : "no error detail";
      pushFinding("RUNNER_REFUSED", "critical", { detail: `runner refused the restart: ${errorText}${refusedBlockers.length > 0 ? ` blockers=${refusedBlockers.join(",")}` : ""}`, httpStatus: accepted.httpStatus });
      result.status = "NOT_RESTARTED";
      return result;
    }
    restartId = candidateRestartId;
    result.mutationPerformed = true;
    result.execution = { accepted: true, restartId, status: typeof body?.status === "string" ? body.status : "pending", idempotent: body?.idempotent === true };
    result.pending = true;
    result.restartId = restartId;
    result.nextAction = `the supervisor recycles the service (exit ${CONTROLLED_RESTART_EXIT_CODE}); re-invoke this tool (or observe status/runnerMeta) to re-check the postcheck criteria`;
    result.status = "ACCEPTED";
  } catch (error) {
    pushFinding("RUNNER_CHANNEL_ERROR", "warning", { detail: error instanceof Error ? error.message.slice(0, 200) : "restart call failed" });
    result.status = "UNKNOWN";
    result.nextAction = "the restart acceptance is unproven; re-invoke in PLAN mode to observe runnerMeta";
    return result;
  }

  // 6. Bounded postcheck polling. The service goes DOWN mid-restart (expected):
  // unreachable attempts are retried, not failures. RESTARTED requires ALL five
  // criteria on one observation; exhaustion stays UNKNOWN/pending with the durable
  // restartId. 202/ACCEPTED is never reported as success.
  const criteria = { runnerReachable: false, pidChanged: false, lastRestartIdMatches: false, lastRestartOutcomeCompleted: false, zeroOrphans: false };
  let attempts = 0;
  for (; attempts < pollAttempts; attempts += 1) {
    await sleep(pollDelayMs);
    try {
      const status = await runRunner("status");
      const observed = asRunnerMeta(asRecord(status.body)?.runnerMeta);
      if (status.httpStatus !== 200 || !observed) continue;
      criteria.runnerReachable = true;
      criteria.pidChanged = observed.pid !== oldPid;
      criteria.lastRestartIdMatches = observed.lastRestartId === restartId;
      criteria.lastRestartOutcomeCompleted = observed.lastRestartOutcome === "completed";
      criteria.zeroOrphans = observed.lastRecoveryMarked === 0;
      if (criteria.runnerReachable && criteria.pidChanged && criteria.lastRestartIdMatches && criteria.lastRestartOutcomeCompleted && criteria.zeroOrphans) {
        result.postcheck = { attempts: attempts + 1, criteria, runnerMeta: observed };
        result.status = "RESTARTED";
        delete result.pending;
        delete result.nextAction;
        pushFinding("RESTART_COMPLETED", "info", { detail: `runner recycled: pid ${oldPid} -> ${observed.pid ?? "unknown"}, intent completed with zero orphaned jobs` });
        return result;
      }
    } catch { /* mid-restart unreachability is expected; keep polling */ }
  }
  result.postcheck = { attempts, criteria, runnerMeta: null };
  pushFinding("POSTCHECK_INCOMPLETE", "warning", { detail: `restart accepted (restartId=${restartId}) but the five postcheck criteria were not all observed within ${pollAttempts} attempts; the recycle may still be in progress` });
  result.nextAction = `re-invoke this tool in PLAN mode to re-check runnerMeta for restartId=${restartId}`;
  return result;
}
