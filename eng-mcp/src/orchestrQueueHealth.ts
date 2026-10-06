// RD-ORCH-ENV-01 (item 4): falha honesta da fila do orquestrador — MÍNIMO VIÁVEL.
// Incidente (RD-QUEUE-MOUNT-01 pós-ship): o daemon host-side apontava para
// /data/orchestrator-queue.jsonl (inexistente no host) e o fail-open do readText
// engolia o FileNotFoundError → "consumed=0" silencioso em TODOS os ciclos, com o
// state dizendo "alive" (mentira por omissão). Regras daqui:
//   - arquivo AUSENTE = fila vazia (saudável — nunca degrada);
//   - arquivo PRESENTE mas ilegível (EACCES/EIO/EISDIR, path errado p/ dir) =
//     DEGRADED: log CRITICAL (stderr → journal) + status "degraded" no state file
//     (preservando contagens) + evento orch_degraded no bus spool;
//   - leitura bem-sucedida após DEGRADED → volta a "stopped" (idle honesto; o
//     "alive" continua sendo escrito apenas pelo execute que promove).
// Zero-LLM, fail-open total: qualquer falha aqui NUNCA trava o ciclo do consume.
import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

export interface QueueReadFailure {
  queuePath: string;
  reason: string;
  at: string;
}

export interface ProbeQueueReadFailureOpts {
  queuePath: string;
  /** Injetável para provas herméticas (default: fs real). */
  exists?(path: string): boolean;
  readText?(path: string): string | null;
  now?(): number;
}

/** Sonda pura: null = fila saudável (ausente ou legível); QueueReadFailure = degrada. */
export function probeQueueReadFailure(opts: ProbeQueueReadFailureOpts): QueueReadFailure | null {
  const exists = opts.exists ?? existsSync;
  let readable: string | null | undefined;
  try {
    readable = opts.readText
      ? opts.readText(opts.queuePath)
      : (() => { try { if (!existsSync(opts.queuePath)) return null; return readFileSync(opts.queuePath, "utf8"); } catch { return null; } })();
  } catch {
    readable = null;  // readText injetado lançou = ilegível
  }
  if (exists(opts.queuePath) && readable == null) {
    return { queuePath: opts.queuePath, reason: `fila presente mas ilegível (readText null): ${opts.queuePath}`, at: new Date((opts.now ?? Date.now)()).toISOString() };
  }
  return null;
}

/** Read real fail-open (null quando inexistente/ilegível) — default quando o caller
 * não injeta (o daemon chama mark/clear SEM deps de teste). */
function realReadText(path: string): string | null {
  try { if (!existsSync(path)) return null; return readFileSync(path, "utf8"); } catch { return null; }
}

export interface MarkQueueDegradedOpts {
  consumerStatePath: string;
  spoolPath?: string;
  reason: string;
  now?(): number;
  /** I/O injetável para provas herméticas (default: fs real, escrita tmp+rename). */
  readText?(path: string): string | null;
  writeText?(path: string, data: string): void;
  rename?(from: string, to: string): void;
  appendFile?(path: string, data: string): void;
}

export interface MarkQueueDegradedResult {
  ok: boolean;
  stateWritten: boolean;
  spooled: boolean;
  error?: string;
}

/** Escreve estado DEGRADED no state file (read-modify-write: PRESERVA todas as
 * outras chaves — promotedCount, promotedIds, trilhas do consumer F1). */
export function markQueueDegraded(opts: MarkQueueDegradedOpts): MarkQueueDegradedResult {
  const now = new Date((opts.now ?? Date.now)()).toISOString();
  let state: Record<string, unknown> = {};
  const readState = opts.readText ?? realReadText;
  try { state = JSON.parse(readState(opts.consumerStatePath) ?? "{}") as Record<string, unknown>; } catch { state = {}; }
  if (typeof state !== "object" || state === null || Array.isArray(state)) state = {};
  state.status = "degraded";
  state.degradedAt = now;
  state.degradedReason = String(opts.reason).slice(0, 200);
  state.updatedAt = now;
  const out: MarkQueueDegradedResult = { ok: true, stateWritten: false, spooled: false };
  try {
    if (opts.writeText) {
      opts.writeText(opts.consumerStatePath, JSON.stringify(state, null, 2));
    } else {
      const tmp = opts.consumerStatePath + ".tmp";
      writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
      (opts.rename ?? renameSync)(tmp, opts.consumerStatePath);
    }
    out.stateWritten = true;
  } catch (error) {
    out.ok = false;
    out.error = error instanceof Error ? error.message : String(error);
  }
  try {
    const spool = opts.spoolPath ?? (process.env.ENG_MCP_SPOOL_PATH || "/opt/mission-events/spool.jsonl");
    const line = JSON.stringify({ ts: now, event: "orch_degraded", kind: "orch_degraded", missionId: "queue", msg: String(opts.reason).slice(0, 200), source: "orchestrator-daemon" });
    if (opts.appendFile) opts.appendFile(spool, line + "\n");
    else appendFileSync(spool, line + "\n", "utf8");
    out.spooled = true;
  } catch (error) {
    out.spooled = false;
    out.error = out.error ?? (error instanceof Error ? error.message : String(error));
  }
  return out;
}

export interface ClearQueueDegradedOpts {
  consumerStatePath: string;
  now?(): number;
  readText?(path: string): string | null;
  writeText?(path: string, data: string): void;
  rename?(from: string, to: string): void;
}

/** Recuperação honesta: SÓ escreve se o estado anterior era "degraded" (nunca
 * toca "alive" de outro writer). Retorna {cleared:false} sem I/O quando saudável. */
export function clearQueueDegraded(opts: ClearQueueDegradedOpts): { cleared: boolean; error?: string } {
  try {
    let state: Record<string, unknown> = {};
    const readState = opts.readText ?? realReadText;
    try { state = JSON.parse(readState(opts.consumerStatePath) ?? "{}") as Record<string, unknown>; } catch { return { cleared: false }; }
    if (typeof state !== "object" || state === null || Array.isArray(state) || state.status !== "degraded") return { cleared: false };
    const now = new Date((opts.now ?? Date.now)()).toISOString();
    state.status = "stopped";
    state.degradedClearedAt = now;
    state.updatedAt = now;
    if (opts.writeText) {
      opts.writeText(opts.consumerStatePath, JSON.stringify(state, null, 2));
    } else {
      const tmp = opts.consumerStatePath + ".tmp";
      writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
      (opts.rename ?? renameSync)(tmp, opts.consumerStatePath);
    }
    return { cleared: true };
  } catch (error) {
    return { cleared: false, error: error instanceof Error ? error.message : String(error) };
  }
}
