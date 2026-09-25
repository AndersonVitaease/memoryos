/**
 * AUTO-RUN-01B/C — HOLD notification loop closer (C2).
 *
 * A HOLD (band-3 operator route, manifest judge NO-GO, out-of-manifest
 * deviation) fires ONE `engineering.notify.hermes` message with minimal
 * context: redacted command, judge score, top-3 risk reasons, mission, how
 * to approve. Idempotent per HOLD event: the same holdKey re-notifies at
 * most every HOLD_NOTIFY_MIN_INTERVAL_MS (default 10 min). The idempotency
 * state IS the trail (hold-notifications.jsonl): append-only audit lines are
 * read back for the interval check, so dedupe survives process restarts.
 *
 * Fail-open for the NOTIFICATION (a notify failure never changes the gate
 * decision — the HOLD stands with or without the message) and fail-closed
 * for the DECISION (the caller already routed to the operator before this
 * runs). The credential scope gap is honest: without engineering:notify:hermes
 * the call returns AUTHORIZATION_SCOPE_REQUIRED, recorded as delivered:false.
 *
 * REGRA INVIOLÁVEL holds here: the notification explains and accelerates the
 * human approval loop — it never approves anything.
 */
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Re-notify the same HOLD event at most every N minutes (mission C2). */
export const HOLD_NOTIFY_MIN_INTERVAL_MS = 10 * 60 * 1000;
/** Trail file name (resolved under the audit dir by the hook wiring). */
export const HOLD_TRAIL_FILE = 'hold-notifications.jsonl';
/** Hard cap so the hook watchdog (4s) survives judge (2s) + notify. */
export const HOLD_NOTIFY_TIMEOUT_MS = 1200;

export type HoldKind = 'band3' | 'manifest_nogo' | 'manifest_out_of_scope';

export interface HoldNotificationInput {
  kind: HoldKind;
  mission: string | null;
  /** Redacted, truncated command (caller applies gate redaction). */
  command: string;
  /** Judge safeScore when available (out-of-manifest / manifest NO-GO); null for band-3. */
  safeScore?: number | null;
  /** Top risk reasons, already formatted (e.g. `q_destructive=0.01`). */
  reasons?: string[];
  session?: string | null;
  /** Wall clock (tests may pin). */
  at?: string;
}

export interface HoldNotifyResult {
  /** true only when the hermes gateway accepted the message. */
  delivered: boolean;
  /** 'sent' | 'idempotent' | 'error:<code>' — honest outcome, never fabricated. */
  outcome: string;
  /** Stable event key (sha16 of kind|mission|commandSha16). */
  holdKey: string;
}

export interface HoldNotifyDeps {
  /** MCP client able to call engineering.notify.hermes (gate judgeClient). */
  notifyClient: (tool: string, args: Record<string, unknown>, signal: AbortSignal) => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>;
  /** Absolute path of the hold-notifications.jsonl trail. */
  trailFile: string;
  commandSha16: string;
  intervalMs?: number;
  timeoutMs?: number;
}

/** Stable idempotency key for one HOLD event. */
export function holdKey(kind: HoldKind, mission: string | null, commandSha16: string): string {
  const raw = `${kind}|${mission ?? 'nomission'}|${commandSha16}`;
  return createHash16(raw);
}

/** sha256 hex16 — same shape as missionManifest.sha16. */
function createHash16(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

/** Compose the ≤500-char summary (assertNoSensitiveContent-safe: no secrets). */
export function composeHoldSummary(input: HoldNotificationInput): string {
  const mission = input.mission ?? 'sessao-sem-manifesto';
  const cmd = input.command.length > 80 ? input.command.slice(0, 80) + '…' : input.command;
  const score = input.safeScore !== undefined && input.safeScore !== null ? `score=${input.safeScore.toFixed(3)}` : 'score=n/a';
  const reasons = (input.reasons ?? []).slice(0, 3).join(' ');
  const how = 'aprovar: responder no chat/sessão';
  const parts = [`HOLD ${input.kind}`, `missão=${mission}`, `cmd=${cmd}`, score, reasons ? `risco: ${reasons}` : '', how].filter((p) => p.length > 0);
  let summary = parts.join(' | ');
  if (summary.length > 500) summary = summary.slice(0, 497) + '…';
  return summary;
}

interface TrailLine {
  at: string;
  event: 'hold_notify';
  holdKey: string;
  kind: HoldKind;
  mission: string | null;
  commandSha16: string;
  delivered: boolean;
  outcome: string;
  session: string | null;
}

function appendTrail(trailFile: string, line: TrailLine): void {
  try {
    mkdirSync(dirname(trailFile), { recursive: true });
    appendFileSync(trailFile, JSON.stringify(line) + '\n');
  } catch {
    /* trail failure never affects the decision */
  }
}

/** Latest trail entry for a holdKey (missing/corrupt trail = null, never throws). */
function latestFor(holdKeyValue: string, trailFile: string): TrailLine | null {
  try {
    if (!existsSync(trailFile)) return null;
    const raw = readFileSync(trailFile, 'utf8');
    const lines = raw.split('\n').filter((l) => l.trim().length > 0);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      try {
        const parsed = JSON.parse(lines[i]) as TrailLine;
        if (parsed && parsed.event === 'hold_notify' && parsed.holdKey === holdKeyValue) return parsed;
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fire-and-audit ONE hold notification. Idempotent per holdKey: if the last
 * trail entry for this key is younger than intervalMs, skip (outcome
 * 'idempotent', no budget spent, nothing sent).
 */
export async function notifyHold(deps: HoldNotifyDeps, input: HoldNotificationInput): Promise<HoldNotifyResult> {
  const keyValue = holdKey(input.kind, input.mission, deps_commandSha16(deps));
  const intervalMs = deps.intervalMs ?? HOLD_NOTIFY_MIN_INTERVAL_MS;
  const nowIso = input.at ?? new Date().toISOString();
  const trailFile = deps.trailFile;
  const last = latestFor(keyValue, trailFile);
  if (last) {
    const lastMs = Date.parse(last.at);
    const nowMs = Date.parse(nowIso);
    if (Number.isFinite(lastMs) && Number.isFinite(nowMs) && nowMs - lastMs < intervalMs) {
      appendTrail(trailFile, {
        at: nowIso, event: 'hold_notify', holdKey: keyValue, kind: input.kind,
        mission: input.mission ?? null, commandSha16: deps.commandSha16,
        delivered: false, outcome: 'idempotent', session: input.session?.slice(0, 12) ?? null,
      });
      return { delivered: false, outcome: 'idempotent', holdKey: keyValue };
    }
  }
  const summary = composeHoldSummary(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? HOLD_NOTIFY_TIMEOUT_MS);
  let delivered = false;
  let outcome: string;
  try {
    const result = await deps.notifyClient('engineering.notify.hermes', { summary, status: 'blocked' }, controller.signal);
    if (result.ok) {
      delivered = true;
      outcome = 'sent';
    } else {
      outcome = `error:${result.error.slice(0, 60)}`;
    }
  } catch (error) {
    outcome = `error:${error instanceof Error ? error.message.slice(0, 60) : String(error).slice(0, 60)}`;
  } finally {
    clearTimeout(timer);
  }
  appendTrail(trailFile, {
    at: nowIso, event: 'hold_notify', holdKey: keyValue, kind: input.kind,
    mission: input.mission ?? null, commandSha16: deps.commandSha16,
    delivered, outcome, session: input.session?.slice(0, 12) ?? null,
  });
  return { delivered, outcome, holdKey: keyValue };
}

function deps_commandSha16(deps: HoldNotifyDeps): string {
  return deps.commandSha16;
}

export { appendTrail as appendHoldTrail };