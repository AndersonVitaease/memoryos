/**
 * CapacityReportAnalyzer.ts — Capacity Report V1 (READ-ONLY).
 *
 * Fonte EXCLUSIVA: base44.entities.ExecutionObservation.
 * Entrada: { server, toolName }.
 *
 * NÃO escreve em ExecutionObservation, MCPServerConfig, tool_policy.
 * NÃO altera maxConcurrent. NÃO executa benchmark. NÃO chama a tool.
 * NÃO recomenda capacidade ideal — apenas evidência histórica objetiva.
 *
 * Deriva: totais, success/error rate, latência (avg/p50/p95/max),
 * wait (avg/p95), concorrência por execução (peak + média temporal),
 * backpressure (semaphore_wait_ms > 0), erro × concorrência no instante,
 * resumo por nível de peak observado.
 *
 * Percentis: implementação determinística (nearest-rank). Sem libs externas.
 */
import { base44 } from "@/api/base44Client";

// ── Percentil (nearest-rank, determinístico) ─────────────────────────────────
// Documentado: p ∈ [0,100]. Retorna o valor na posição ceil(p/100 * n) - 1
// do array ordenado asc. n=1 → retorna o único elemento. n=0 → 0.
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const rank = Math.ceil((p / 100) * sortedAsc.length);
  const idx = Math.min(Math.max(rank - 1, 0), sortedAsc.length - 1);
  return sortedAsc[idx];
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function toMs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

export interface CapacityReportInput {
  readonly server: string;
  readonly toolName: string;
  /** Limite de registros a puxar (default 1000). */
  readonly limit?: number;
  /** Filtro opcional por executionIds. Quando ausente/vazio, comporta-se como
   *  antes (todos os registros do server+tool). Usado pelo SupervisedCapacityProcess
   *  para limitar a analise aos executionIds de uma certificacao especifica. */
  readonly executionIds?: readonly string[];
}

export interface ExecutionConcurrencyEntry {
  readonly executionId: string;
  readonly steps: number;
  readonly peakConcurrency: number;
  readonly averageConcurrency: number;
  readonly backpressure: boolean;
  readonly stepsWaiting: number;
  readonly avgWaitMs: number;
  readonly maxWaitMs: number;
  readonly successRate: number;
}

export interface FailureCorrelation {
  readonly executionId: string;
  readonly stepId: string;
  readonly concurrencyAtFailure: number;
  readonly error_signature: string | null;
  readonly error_message: string | null;
}

export interface PeakLevelSummary {
  readonly peak: number;
  readonly executions: number;
  readonly steps: number;
  readonly successRate: number;
  readonly latencyP95: number;
  readonly waitP95: number;
}

export interface CapacityReport {
  readonly server: string;
  readonly toolName: string;
  readonly totalExecutions: number;
  readonly totalSteps: number;
  readonly successRate: number;
  readonly errorRate: number;
  readonly latency: { readonly avg: number; readonly p50: number; readonly p95: number; readonly max: number };
  readonly wait: { readonly avg: number; readonly p95: number };
  readonly executions: readonly ExecutionConcurrencyEntry[];
  readonly byPeakConcurrency: readonly PeakLevelSummary[];
  readonly failures: readonly FailureCorrelation[];
}

// ── Concorrência: interval overlap ───────────────────────────────────────────
// Para cada execução, ordenamos intervals por started_at. Peak = máximo de
// intervals simultaneamente ativos em qualquer instante. Média temporal =
// integral da contagem ativa / duração total da janela da execução.

interface Interval { readonly start: number; readonly end: number; }

function peakConcurrency(intervals: Interval[]): number {
  if (intervals.length === 0) return 0;
  const events: Array<{ t: number; delta: number }> = [];
  for (const iv of intervals) {
    if (iv.end <= iv.start) continue; // intervalo degenerado — ignora
    events.push({ t: iv.start, delta: +1 });
    events.push({ t: iv.end, delta: -1 });
  }
  if (events.length === 0) return intervals.length > 0 ? 1 : 0;
  events.sort((a, b) => (a.t - b.t) || (b.delta - a.delta)); // +1 antes de -1 no mesmo t
  let cur = 0, peak = 0;
  for (const e of events) { cur += e.delta; if (cur > peak) peak = cur; }
  return peak;
}

/**
 * Concorrência média temporal = integral da contagem ativa ao longo do tempo
 * dividida pela duração total da janela [minStart, maxEnd].
 * Calculada por varredura de eventos (event-sweep): entre dois eventos
 * consecutivos a contagem ativa é constante, contribui com (count * dt).
 */
function averageConcurrency(intervals: Interval[]): number {
  const valid = intervals.filter((iv) => iv.end > iv.start);
  if (valid.length === 0) return 0;
  const events: Array<{ t: number; delta: number }> = [];
  for (const iv of valid) {
    events.push({ t: iv.start, delta: +1 });
    events.push({ t: iv.end, delta: -1 });
  }
  events.sort((a, b) => (a.t - b.t) || (b.delta - a.delta));
  const minT = events[0].t;
  const maxT = events[events.length - 1].t;
  const window = maxT - minT;
  if (window <= 0) return valid.length > 0 ? 1 : 0;
  let cur = 0, integral = 0, prevT = minT;
  for (const e of events) {
    integral += cur * (e.t - prevT);
    cur += e.delta;
    prevT = e.t;
  }
  return integral / window;
}

/**
 * Contagem de intervals ativos em um instante específico (inicio do step).
 * Usado para correlacionar erros com concorrência no momento da falha.
 */
function concurrencyAtInstant(intervals: Interval[], instant: number): number {
  let count = 0;
  for (const iv of intervals) {
    if (iv.start <= instant && instant < iv.end) count++;
  }
  return count;
}

const SUCCESS_STATUS = new Set(["success", "completed"]);

// ── Analyzer ─────────────────────────────────────────────────────────────────

export const CapacityReportAnalyzer = {
  /**
   * Gera o Capacity Report V1 read-only para {server, toolName}.
   * Puxa ExecutionObservation via filter({server, tool_name}), agrega client-side.
   */
  async analyze(input: CapacityReportInput): Promise<CapacityReport> {
    const { server, toolName } = input;
    const limit = input.limit ?? 1000;

    let records = await base44.entities.ExecutionObservation.filter(
      { server, tool_name: toolName },
      "-started_at",
      limit,
    );
    // Filtro opcional por executionIds: limita a analise a uma certificacao
    // especifica sem misturar historico antigo. Ausente/vazio = sem filtro.
    if (input.executionIds && input.executionIds.length > 0) {
      const idSet = new Set(input.executionIds);
      records = records.filter((r) => idSet.has(r.execution_id));
    }

    const totalSteps = records.length;
    const durations = records.map((r) => r.duration_ms ?? 0).sort((a, b) => a - b);
    const waits = records.map((r) => r.semaphore_wait_ms ?? 0).sort((a, b) => a - b);

    const successCount = records.filter((r) => SUCCESS_STATUS.has(r.status)).length;
    const errorCount = totalSteps - successCount;

    // ── Agrupar por execution_id ─────────────────────────────────────────────
    const byExec = new Map<string, typeof records>();
    for (const r of records) {
      const key = r.execution_id ?? "_unknown_";
      const arr = byExec.get(key) ?? [];
      arr.push(r);
      byExec.set(key, arr);
    }

    const executions: ExecutionConcurrencyEntry[] = [];
    const failures: FailureCorrelation[] = [];

    for (const [executionId, steps] of byExec) {
      const intervals: Interval[] = steps
        .map((r) => ({ start: toMs(r.started_at), end: toMs(r.finished_at) }))
        .filter((iv) => iv.end > iv.start);

      const peak = peakConcurrency(intervals);
      const avgConc = averageConcurrency(intervals);

      const stepWaits = steps.map((r) => r.semaphore_wait_ms ?? 0);
      const stepsWaiting = stepWaits.filter((w) => w > 0).length;
      const backpressure = stepsWaiting > 0;
      const succ = steps.filter((r) => SUCCESS_STATUS.has(r.status)).length;

      executions.push({
        executionId,
        steps: steps.length,
        peakConcurrency: peak,
        averageConcurrency: Number(avgConc.toFixed(3)),
        backpressure,
        stepsWaiting,
        avgWaitMs: Number(avg(stepWaits).toFixed(2)),
        maxWaitMs: stepWaits.length ? Math.max(...stepWaits) : 0,
        successRate: steps.length ? Number((succ / steps.length).toFixed(4)) : 0,
      });

      // ── Falhas × concorrência no instante ──────────────────────────────────
      for (const s of steps) {
        if (!SUCCESS_STATUS.has(s.status)) {
          failures.push({
            executionId,
            stepId: s.step_id ?? null,
            concurrencyAtFailure: concurrencyAtInstant(intervals, toMs(s.started_at)),
            error_signature: s.error_signature ?? null,
            error_message: s.error_message ?? null,
          });
        }
      }
    }

    executions.sort((a, b) => b.peakConcurrency - a.peakConcurrency);

    // ── Resumo por nível de peak ─────────────────────────────────────────────
    const peakGroups = new Map<number, ExecutionConcurrencyEntry[]>();
    for (const e of executions) {
      const arr = peakGroups.get(e.peakConcurrency) ?? [];
      arr.push(e);
      peakGroups.set(e.peakConcurrency, arr);
    }
    const byPeakConcurrency: PeakLevelSummary[] = [...peakGroups.entries()]
      .map(([peak, execs]) => {
        const stepCount = execs.reduce((a, e) => a + e.steps, 0);
        // Latência p95: coletar durations dos steps dessas execuções.
        const execIds = new Set(execs.map((e) => e.executionId));
        const groupDurations = records
          .filter((r) => execIds.has(r.execution_id ?? "_unknown_"))
          .map((r) => r.duration_ms ?? 0)
          .sort((a, b) => a - b);
        const groupWaits = records
          .filter((r) => execIds.has(r.execution_id ?? "_unknown_"))
          .map((r) => r.semaphore_wait_ms ?? 0)
          .sort((a, b) => a - b);
        const succSteps = execs.reduce(
          (a, e) => a + Math.round(e.successRate * e.steps),
          0,
        );
        return {
          peak,
          executions: execs.length,
          steps: stepCount,
          successRate: stepCount ? Number((succSteps / stepCount).toFixed(4)) : 0,
          latencyP95: percentile(groupDurations, 95),
          waitP95: percentile(groupWaits, 95),
        };
      })
      .sort((a, b) => a.peak - b.peak);

    return Object.freeze({
      server,
      toolName,
      totalExecutions: byExec.size,
      totalSteps,
      successRate: totalSteps ? Number((successCount / totalSteps).toFixed(4)) : 0,
      errorRate: totalSteps ? Number((errorCount / totalSteps).toFixed(4)) : 0,
      latency: {
        avg: Number(avg(durations).toFixed(2)),
        p50: percentile(durations, 50),
        p95: percentile(durations, 95),
        max: durations.length ? durations[durations.length - 1] : 0,
      },
      wait: {
        avg: Number(avg(waits).toFixed(2)),
        p95: percentile(waits, 95),
      },
      executions: Object.freeze(executions),
      byPeakConcurrency: Object.freeze(byPeakConcurrency),
      failures: Object.freeze(failures),
    });
  },
};