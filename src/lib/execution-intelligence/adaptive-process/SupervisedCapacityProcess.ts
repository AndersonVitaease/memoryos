/**
 * SupervisedCapacityProcess.ts — V1
 *
 * Categoria: Adaptive Process (implementa a interface AdaptiveProcess existente).
 *
 * Responsabilidade UNICA: certificar experimentalmente a capacidade de uma
 * MCP tool e produzir uma RECOMENDACAO supervisionada de maxConcurrent.
 *
 * V1 NUNCA persiste MCPServerConfig.tool_policy.
 * V1 NUNCA aplica sua propria recomendacao.
 * Resultado final = RECOMENDACAO AGUARDANDO APROVACAO (approvalRequired: true).
 *
 * Reutiliza (sem alterar):
 *   - ExecutionOrchestrator (bounded concurrency experimental por wave)
 *   - ExecutionObservation (telemetria persistente)
 *   - CapacityReportAnalyzer (analise read-only, com filtro por executionIds)
 *   - MCPServerConfig.tool_policy (alvo futuro da persistencia, NAO tocado aqui)
 *
 * Loop supervisionado (padrao SupervisedEngineeringProcess, sem reutiliza-lo):
 *   plan -> invoke -> reflect -> stop -> synthesize
 *   Single-pass: stop() = true apos reflect. Sem loop infinito.
 */
import type { AdaptiveProcess, AdaptiveProcessContext, ResearchStep, Reflection } from "./AdaptiveProcess";
import type { ExecutionOutcome } from "../ExecutionTypes";
import type { ExecutionStep } from "@/lib/planning-engine-e022/ExecutionPlanTypes";
import type { StepResult } from "@/lib/runtime-engine/RuntimeTypes";
import type { ParallelismConfig } from "@/lib/runtime-engine/ExecutionPolicy";
import { ExecutionOrchestrator } from "@/lib/runtime-engine/ExecutionOrchestrator";
import { CapacityReportAnalyzer } from "@/lib/operational-intelligence/CapacityReportAnalyzer";
import type { CapacityReport } from "@/lib/operational-intelligence/CapacityReportAnalyzer";
import { base44 } from "@/api/base44Client";

// ── Entrada ──────────────────────────────────────────────────────────────────

export interface CapacityBenchmarkParams {
  readonly server: string;
  readonly toolName: string;
  readonly testPayloads: readonly Record<string, unknown>[];
  readonly concurrencyLevels?: readonly number[];
  readonly repetitions?: number;
  /** V1 so executa benchmark se true. Sem isso -> ABORTAR. */
  readonly benchmarkAuthorized: boolean;
}

export interface LevelMetrics {
  readonly level: number;
  readonly runs: number;
  readonly steps: number;
  readonly successRate: number;
  readonly errorRate: number;
  readonly totalDurationMs: number;
  readonly throughput: number;
  readonly latencyAvg: number;
  readonly latencyP50: number;
  readonly latencyP95: number;
  readonly latencyMax: number;
  readonly waitAvg: number;
  readonly waitP95: number;
  readonly peakConcurrency: number;
  readonly errors: number;
  readonly capacityErrors: number;
}

export interface Recommendation {
  readonly maxConcurrent: number | null;
  readonly status: "RECOMMENDED" | "INDETERMINATE";
  readonly reason: string;
}

export interface CapacityReflection extends Reflection {
  readonly recommendation: Recommendation;
  readonly metricsByLevel: ReadonlyMap<number, LevelMetrics>;
  readonly analyzerReport: CapacityReport;
}

export interface CapacitySynthesis {
  readonly server: string;
  readonly toolName: string;
  readonly levelsTested: readonly number[];
  readonly executionIds: readonly string[];
  readonly resultsByLevel: Readonly<Record<number, LevelMetrics>>;
  readonly recommendation: Recommendation;
  readonly evidence: { readonly analyzer: CapacityReport; readonly observed: readonly LevelMetrics[] };
  readonly approvalRequired: true;
  readonly applied: false;
}

// ── Helpers estatisticos (deterministicos, sem libs) ─────────────────────────

function pct(sortedAsc: readonly number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const rank = Math.ceil((p / 100) * sortedAsc.length);
  const idx = Math.min(Math.max(rank - 1, 0), sortedAsc.length - 1);
  return sortedAsc[idx];
}
function avg(nums: readonly number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
function toMs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}
function peakConcurrency(intervals: ReadonlyArray<{ start: number; end: number }>): number {
  const events: Array<{ t: number; delta: number }> = [];
  for (const iv of intervals) {
    if (iv.end <= iv.start) continue;
    events.push({ t: iv.start, delta: +1 });
    events.push({ t: iv.end, delta: -1 });
  }
  if (events.length === 0) return intervals.length > 0 ? 1 : 0;
  events.sort((a, b) => a.t - b.t || b.delta - a.delta);
  let cur = 0, peak = 0;
  for (const e of events) { cur += e.delta; if (cur > peak) peak = cur; }
  return peak;
}

const SUCC = new Set(["success", "completed"]);

// ── Recomendacao deterministica (sem LLM) ─────────────────────────────────────
//
// Principio: escolher o nivel com melhor relacao throughput/latencia/estabilidade
// entre os niveis saudaveis (zero capacity-induced errors).
//
// capacityErrors(L) = max(0, errors(L) - errors(minN))
//   -> erros deterministicos presentes em todos os niveis (ex: SENSITIVE_CONTENT_BLOCKED)
//      nao contam como capacity errors (delta = 0).
//
// Passos:
//   1. dados insuficientes / ambíguos -> INDETERMINATE
//   2. healthy = niveis com capacityErrors === 0
//   3. stable = healthy com p95 <= 1.5 * min(p95 healthy)  (sem degradacao severa)
//   4. entre stable, max throughput (ganho > 5%); tie-break lower N (mais seguro)
//   5. se nao ha ganho sobre o baseline -> recomenda baseline (menor N saudavel)

export function recommendCapacity(perLevel: ReadonlyMap<number, LevelMetrics>): Recommendation {
  const levels = [...perLevel.keys()].sort((a, b) => a - b);
  if (levels.length === 0) {
    return { maxConcurrent: null, status: "INDETERMINATE", reason: "no level data" };
  }

  const tps = levels.map((n) => perLevel.get(n)!.throughput);
  const maxTp = Math.max(...tps);
  const minTp = Math.min(...tps);
  if (maxTp === 0) {
    return { maxConcurrent: null, status: "INDETERMINATE", reason: "zero throughput observed" };
  }
  if (maxTp - minTp <= 0.05 * maxTp) {
    return { maxConcurrent: null, status: "INDETERMINATE", reason: "throughput does not differentiate levels" };
  }

  const healthy = levels.filter((n) => perLevel.get(n)!.capacityErrors === 0);
  if (healthy.length === 0) {
    return { maxConcurrent: null, status: "INDETERMINATE", reason: "all levels have capacity-induced errors" };
  }

  const minP95 = Math.min(...healthy.map((n) => perLevel.get(n)!.latencyP95));
  const p95Threshold = minP95 * 1.5;
  const stable = healthy.filter((n) => perLevel.get(n)!.latencyP95 <= p95Threshold);
  if (stable.length === 0) {
    return { maxConcurrent: null, status: "INDETERMINATE", reason: "no latency-stable healthy level" };
  }

  let best = stable[0];
  for (const n of stable.slice(1)) {
    const m = perLevel.get(n)!;
    const b = perLevel.get(best)!;
    if (m.throughput > b.throughput * 1.05) best = n;
  }

  const minN = levels[0];
  const bestM = perLevel.get(best)!;
  const baseM = perLevel.get(minN)!;
  if (best !== minN && bestM.throughput <= baseM.throughput * 1.05) best = minN;

  const finalM = perLevel.get(best)!;
  return {
    maxConcurrent: best,
    status: "RECOMMENDED",
    reason: `N=${best}: throughput ${finalM.throughput.toFixed(2)} steps/s, p95 ${finalM.latencyP95}ms, zero capacity-induced errors`,
  };
}

// ── Process ──────────────────────────────────────────────────────────────────

export class SupervisedCapacityProcess implements AdaptiveProcess {
  readonly id = "supervisedCapacity";
  readonly description = "Supervised Capacity — experimental MCP tool capacity certification producing a recommendation (never applies).";

  private readonly _orchestrator = new ExecutionOrchestrator();
  private _executionIds: string[] = [];
  private _levelByExecId = new Map<string, number>();

  private _extractParams(ctx: AdaptiveProcessContext): CapacityBenchmarkParams {
    const p = (ctx.request.params ?? {}) as Record<string, unknown>;
    return {
      server: String(p.server ?? ""),
      toolName: String(p.toolName ?? ""),
      testPayloads: Array.isArray(p.testPayloads) ? (p.testPayloads as Record<string, unknown>[]) : [],
      concurrencyLevels: Array.isArray(p.concurrencyLevels) ? (p.concurrencyLevels as number[]).map(Number) : [4, 8, 12, 16],
      repetitions: typeof p.repetitions === "number" ? p.repetitions : 1,
      benchmarkAuthorized: p.benchmarkAuthorized === true,
    };
  }

  private _abort(reason: string, params?: CapacityBenchmarkParams): ExecutionOutcome {
    return Object.freeze({
      status: "failed" as const,
      connectorId: "capacityBenchmark",
      capability: "supervisedCapacity",
      output: {
        server: params?.server ?? null,
        toolName: params?.toolName ?? null,
        recommendation: { maxConcurrent: null, status: "INDETERMINATE" as const, reason },
        approvalRequired: true as const,
        applied: false as const,
      },
      message: reason,
      reversibility: "safe" as const,
      executionId: null,
      durationMs: null,
    });
  }

  async plan(ctx: AdaptiveProcessContext): Promise<readonly ResearchStep[]> {
    const params = this._extractParams(ctx);
    if (!params.benchmarkAuthorized) return [];
    if (!params.server || !params.toolName || params.testPayloads.length === 0) return [];
    const levels = params.concurrencyLevels ?? [4, 8, 12, 16];
    const reps = params.repetitions ?? 1;
    const steps: ResearchStep[] = [];
    for (const level of levels) {
      for (let r = 1; r <= reps; r++) {
        steps.push({
          id: `bench-N${level}-r${r}`,
          call: {
            connectorId: "mcp",
            capability: "capacityBenchmark",
            params: { server: params.server, toolName: params.toolName, level, rep: r, payloadCount: params.testPayloads.length },
          },
          rationale: `Benchmark ${params.server}/${params.toolName} at maxConcurrent=${level} (rep ${r}, ${params.testPayloads.length} payloads)`,
        });
      }
    }
    return steps;
  }

  async invoke(steps: readonly ResearchStep[], ctx: AdaptiveProcessContext): Promise<readonly ExecutionOutcome[]> {
    const params = this._extractParams(ctx);
    const outcomes: ExecutionOutcome[] = [];

    // Resolve MCPConnector from ConnectorRegistry (normal path) instead of
    // direct instantiation. The registry provides the initialized connector
    // with proper context/health-check. Benchmark cannot use ctx.dispatch
    // (runtime path) because processCapability applies ExecutionPolicy.retryConfig
    // (retries) and ExecutionIntelligence.prepare (investigator overhead),
    // corrupting latency/concurrency measurements.
    let mcpConnector: { execute: (op: string, params: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<{ status: string; data?: unknown; error?: string }> } | null = null;
    try {
      const { getRealConnectorRegistry } = await import("@/lib/connector-runtime-provider/ConnectorRuntimeProvider");
      const registry = await getRealConnectorRegistry();
      mcpConnector = (registry?.get("mcp") as typeof mcpConnector) ?? null;
    } catch { mcpConnector = null; }

    for (const step of steps) {
      const level = Number(step.call.params.level);
      const rep = Number(step.call.params.rep);
      const execId = `capbench-${params.server}-${params.toolName}-N${level}-r${rep}-${Date.now()}`;
      this._executionIds.push(execId);
      this._levelByExecId.set(execId, level);

      const subSteps: ExecutionStep[] = params.testPayloads.map((payload, i) => ({
        id: `${execId}-s${i}`,
        connector: "mcp",
        capability: "mcp.callTool",
        dependsOn: [],
        parameters: { serverName: params.server, toolName: params.toolName, arguments: payload },
      }));

      const parallelism: ParallelismConfig = { enabled: true, maxConcurrent: level };

      const result = await this._orchestrator.execute({
        steps: subSteps,
        parallelism,
        isCancelled: () => false,
        deadlineAt: Date.now() + 120000,
        dispatchStep: async (s, swMs = 0): Promise<StepResult> => {
          const st = Date.now();
          let status: "completed" | "failed" = "failed";
          let error: string | null = null;
          let output: unknown = null;
          try {
            if (!mcpConnector) throw new Error("mcp connector not registered in ConnectorRegistry");
            const cr = await mcpConnector.execute("mcp.callTool", s.parameters, {
              executionId: execId,
              userId: "capacity-bench",
              projectId: "capacity-bench",
              sessionId: "capacity-bench",
            });
            if (cr.status === "SUCCESS") { status = "completed"; output = cr.data; }
            else { error = cr.error || cr.status; }
          } catch (e) { error = String(e).slice(0, 200); }
          const ft = Date.now();
          await base44.entities.ExecutionObservation.create({
            execution_id: execId,
            step_id: s.id,
            session_id: "capacity-bench",
            connector: "mcp",
            capability: "mcp.callTool",
            status: status === "completed" ? "completed" : "failed",
            duration_ms: ft - st,
            started_at: new Date(st).toISOString(),
            finished_at: new Date(ft).toISOString(),
            server: params.server,
            tool_name: params.toolName,
            semaphore_wait_ms: Math.round(swMs),
            goal_type: null,
          });
          return { stepId: s.id, connector: "mcp", capability: "mcp.callTool", status, output, error, startedAt: st, finishedAt: ft, durationMs: ft - st };
        },
      });

      const succ = result.results.filter((r) => r.status === "completed").length;
      outcomes.push(Object.freeze({
        status: "success" as const,
        connectorId: "mcp",
        capability: "capacityBenchmark",
        output: { executionId: execId, level, rep, steps: result.results.length, success: succ, errors: result.results.length - succ, stoppedOnFailure: result.stoppedOnFailure },
        message: null,
        reversibility: "safe" as const,
        executionId: execId,
        durationMs: null,
      }));
    }
    return outcomes;
  }

  async reflect(steps: readonly ResearchStep[], results: readonly ExecutionOutcome[], ctx: AdaptiveProcessContext): Promise<CapacityReflection> {
    const params = this._extractParams(ctx);

    const analyzerReport = await CapacityReportAnalyzer.analyze({
      server: params.server,
      toolName: params.toolName,
      executionIds: this._executionIds,
    });

    const raw = await base44.entities.ExecutionObservation.filter(
      { server: params.server, tool_name: params.toolName },
      "-started_at",
      5000,
    );
    const idSet = new Set(this._executionIds);
    const records = raw.filter((r) => idSet.has(r.execution_id));

    const byLevel = new Map<number, typeof records>();
    for (const r of records) {
      const lvl = this._levelByExecId.get(r.execution_id) ?? 0;
      const arr = byLevel.get(lvl) ?? [];
      arr.push(r);
      byLevel.set(lvl, arr);
    }

    const levels = [...byLevel.keys()].sort((a, b) => a - b);
    const minN = levels[0];
    const minErrCount = minN !== undefined
      ? (byLevel.get(minN) ?? []).filter((r) => !SUCC.has(r.status)).length
      : 0;

    const metricsByLevel = new Map<number, LevelMetrics>();
    for (const lvl of levels) {
      metricsByLevel.set(lvl, this._computeLevelMetrics(lvl, byLevel.get(lvl) ?? [], minErrCount));
    }

    const recommendation = recommendCapacity(metricsByLevel);
    const gaps = recommendation.status === "RECOMMENDED" ? [] : [recommendation.reason];

    return {
      byStep: new Map(steps.map((s, i) => [s.id, results[i]])),
      gaps,
      sufficiency: recommendation.status === "RECOMMENDED" ? 1 : 0,
      recommendation,
      metricsByLevel,
      analyzerReport,
    };
  }

  stop(reflection: Reflection): boolean {
    // Single-pass V1: encerra apos reflect produzir recomendacao. Sem re-plan.
    return true;
  }

  async synthesize(
    _steps: readonly ResearchStep[],
    _results: readonly ExecutionOutcome[],
    reflection: Reflection,
    ctx: AdaptiveProcessContext,
  ): Promise<CapacitySynthesis> {
    const params = this._extractParams(ctx);
    const r = reflection as CapacityReflection;
    const levelsTested = [...r.metricsByLevel.keys()].sort((a, b) => a - b);
    const resultsByLevel: Record<number, LevelMetrics> = {};
    for (const [n, m] of r.metricsByLevel.entries()) resultsByLevel[n] = m;
    return {
      server: params.server,
      toolName: params.toolName,
      levelsTested,
      executionIds: [...this._executionIds],
      resultsByLevel,
      recommendation: r.recommendation,
      evidence: { analyzer: r.analyzerReport, observed: [...r.metricsByLevel.values()] },
      approvalRequired: true,
      applied: false,
    };
  }

  async run(ctx: AdaptiveProcessContext): Promise<ExecutionOutcome> {
    const params = this._extractParams(ctx);
    if (!params.benchmarkAuthorized) {
      return this._abort("Benchmark not authorized: benchmarkAuthorized must be true", params);
    }
    if (!params.server || !params.toolName || params.testPayloads.length === 0) {
      return this._abort("Invalid input: server, toolName and testPayloads are required", params);
    }

    this._executionIds = [];
    this._levelByExecId = new Map();

    const steps = await this.plan(ctx);
    if (steps.length === 0) return this._abort("No benchmark steps planned", params);

    const results = await this.invoke(steps, ctx);
    const reflection = await this.reflect(steps, results, ctx);
    const output = await this.synthesize(steps, results, reflection, ctx);

    const complete = reflection.recommendation.status === "RECOMMENDED";
    return Object.freeze({
      status: complete ? "success" as const : "failed" as const,
      connectorId: "capacityBenchmark",
      capability: "supervisedCapacity",
      output,
      message: complete ? null : reflection.recommendation.reason,
      reversibility: "safe" as const,
      executionId: null,
      durationMs: null,
    });
  }

  // ── Metricas por nivel ─────────────────────────────────────────────────────

  private _computeLevelMetrics(
    level: number,
    recs: readonly Record<string, any>[],
    minErrCount: number,
  ): LevelMetrics {
    const durations = recs.map((r) => r.duration_ms ?? 0).sort((a: number, b: number) => a - b);
    const waits = recs.map((r) => r.semaphore_wait_ms ?? 0).sort((a: number, b: number) => a - b);
    const succ = recs.filter((r) => SUCC.has(r.status)).length;
    const errors = recs.length - succ;

    const intervals = recs
      .map((r) => ({ start: toMs(r.started_at), end: toMs(r.finished_at) }))
      .filter((iv) => iv.end > iv.start);
    const peak = peakConcurrency(intervals);

    const execIds = new Set(recs.map((r) => r.execution_id));
    let totalDurationMs = 0;
    for (const eid of execIds) {
      const rs = recs.filter((r) => r.execution_id === eid);
      if (!rs.length) continue;
      const mn = Math.min(...rs.map((r) => toMs(r.started_at)));
      const mx = Math.max(...rs.map((r) => toMs(r.finished_at)));
      totalDurationMs += mx - mn;
    }
    const throughput = totalDurationMs > 0 ? succ / (totalDurationMs / 1000) : 0;

    return Object.freeze({
      level,
      runs: execIds.size,
      steps: recs.length,
      successRate: recs.length ? Number((succ / recs.length).toFixed(4)) : 0,
      errorRate: recs.length ? Number((errors / recs.length).toFixed(4)) : 0,
      totalDurationMs,
      throughput: Number(throughput.toFixed(4)),
      latencyAvg: Math.round(avg(durations)),
      latencyP50: pct(durations, 50),
      latencyP95: pct(durations, 95),
      latencyMax: durations.length ? durations[durations.length - 1] : 0,
      waitAvg: Math.round(avg(waits)),
      waitP95: pct(waits, 95),
      peakConcurrency: peak,
      errors,
      capacityErrors: Math.max(0, errors - minErrCount),
    });
  }
}

let instance: SupervisedCapacityProcess | null = null;
export function getSupervisedCapacityProcess(): SupervisedCapacityProcess {
  if (!instance) instance = new SupervisedCapacityProcess();
  return instance;
}