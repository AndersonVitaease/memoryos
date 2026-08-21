/**
 * ExecutionOrchestrator.ts — minimal parallel execution layer.
 *
 * SRP: schedule independent ExecutionSteps concurrently while preserving
 * legacy sequential behavior for steps that do not declare dependencies.
 *
 * V1 RESOURCE-AWARE CONCURRENCY:
 *   Beyond the legacy single-semaphore (ParallelismConfig) mode, the
 *   orchestrator now supports a Map<resourceKey, maxConcurrent> so that a
 *   single wave containing resources with INDEPENDENT capacities can run
 *   them simultaneously while each resource respects its own limit.
 *
 *   - resourcePolicies non-empty  → per-resource semaphores (lazy, one
 *     Map<resourceKey, Semaphore> per execute() call, lifetime = one
 *     execution). Resources without an explicit policy stay irrestrito.
 *   - resourcePolicies absent    → legacy ParallelismConfig path (backward
 *     compatible: enabled=false = Promise.all irrestrito; enabled=true =
 *     single bounded semaphore).
 *
 *   Cross-execution (global) concurrency control is NOT implemented in V1:
 *   two concurrent execute() calls have independent semaphore maps.
 *
 * This is infrastructure, not a cognitive engine. It does not know about
 * connectors, OAuth, LLMs, or business logic; it only coordinates dispatch.
 */

import type { ExecutionStep } from "@/lib/planning-engine-e022/ExecutionPlanTypes";
import type { StepResult } from "./RuntimeTypes";
import type { ParallelismConfig } from "./ExecutionPolicy";
import { hasReferences, resolveReferences, extractReferencedStepIds } from "@/lib/planning-engine-e022/OutputReference";

// ── Resource key ──────────────────────────────────────────────────────────────
// Deterministic key derived BEFORE dispatch from data already on the step.
// MCP:     mcp:<serverName|serverId>:<toolName>   (serverName preferred)
// Não-MCP: <connector>:<capability>
export function resolveResourceKey(step: ExecutionStep): string {
  if (step.connector === "mcp" && step.capability === "mcp.callTool") {
    const p = step.parameters as Record<string, unknown>;
    const serverName = typeof p.serverName === "string" ? p.serverName.trim() : "";
    const serverId = typeof p.serverId === "string" ? p.serverId.trim() : "";
    const server = serverName || serverId;
    const toolName = typeof p.toolName === "string" ? p.toolName.trim() : "";
    return `mcp:${server}:${toolName}`;
  }
  return `${step.connector}:${step.capability}`;
}

// ── Semaphore (FIFO, real backpressure via promise chaining) ──────────────────
// One instance per resourceKey. waitMs = acquiredAt - readyAt (wave ready time).
interface Waiter { readyAt: number; resolve: (waitMs: number) => void; }

class Semaphore {
  private available: number;
  private readonly waiters: Waiter[] = [];
  constructor(maxConcurrent: number) {
    this.available = Math.max(1, Math.floor(maxConcurrent) || 1);
  }
  acquire(readyAt: number): Promise<number> {
    if (this.available > 0) {
      this.available--;
      return Promise.resolve(0);
    }
    return new Promise<number>((resolve) => {
      this.waiters.push({ readyAt, resolve });
    });
  }
  release(): void {
    const w = this.waiters.shift();
    if (w) {
      // Slot transferred from releaser to waiter without touching `available`.
      w.resolve(Date.now() - w.readyAt);
    } else {
      this.available++;
    }
  }
}

function isValidLimit(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) && v > 0;
}

export interface ExecutionOrchestratorInput {
  readonly steps: readonly ExecutionStep[];
  readonly dispatchStep: (step: ExecutionStep, semaphoreWaitMs?: number) => Promise<StepResult>;
  readonly isCancelled: () => boolean;
  readonly deadlineAt: number;
  /** Bounded concurrency / backpressure for ready steps within a wave (legacy). */
  readonly parallelism?: ParallelismConfig;
  /** Resource-aware concurrency: resourceKey → maxConcurrent. When non-empty,
   *  per-resource semaphores replace the single ParallelismConfig. Resources
   *  absent from this map stay irrestrito (never fallback=1). */
  readonly resourcePolicies?: ReadonlyMap<string, number>;
}

export interface ExecutionOrchestratorResult {
  readonly results: readonly StepResult[];
  readonly stoppedOnFailure: boolean;
}

export class ExecutionOrchestrator {
  /**
   * Executes the plan in dependency waves.
   *
   * Legacy step (dependsOn omitted): depends on the previous plan step.
   * Explicit dependsOn=[]: independent root, eligible for parallel execution.
   * Explicit dependencies: step waits until all referenced steps complete.
   */
  async execute(input: ExecutionOrchestratorInput): Promise<ExecutionOrchestratorResult> {
    const { steps, dispatchStep, isCancelled, deadlineAt } = input;
    const parallelism: ParallelismConfig = input.parallelism ?? { enabled: false, maxConcurrent: 1 };
    const resourcePolicies = input.resourcePolicies;
    const hasResourcePolicies = !!resourcePolicies && resourcePolicies.size > 0;
    // Lifetime: one map per execute() call. Shared across waves so two waves
    // within the same execution respect the same per-resource capacity.
    const semaphores = new Map<string, Semaphore>();

    const byId = new Map(steps.map((step) => [step.id, step]));
    const remaining = new Set(steps.map((_, index) => index));
    const completed = new Set<string>();
    const results: StepResult[] = [];

    for (const step of steps) {
      for (const dependency of this._dependencies(step, steps)) {
        if (!byId.has(dependency)) {
          throw new Error(`ExecutionOrchestrator: unknown dependency '${dependency}' for step '${step.id}'`);
        }
      }
    }

    while (remaining.size > 0) {
      if (isCancelled()) {
        return { results: Object.freeze(results), stoppedOnFailure: false };
      }
      if (Date.now() > deadlineAt) {
        return { results: Object.freeze(results), stoppedOnFailure: true };
      }

      const ready = [...remaining].filter((index) => {
        const step = steps[index];
        return this._dependencies(step, steps).every((dependency) => completed.has(dependency));
      });

      if (ready.length === 0) {
        throw new Error("ExecutionOrchestrator: cyclic or unresolved execution dependencies");
      }

      // V2 OUTPUT REFERENCES: resolve $ref markers in step.parameters using
      // completed predecessor outputs, right before dispatch. Produces a new
      // resolved step (original plan untouched). Fails the step deterministically
      // with OUTPUT_REFERENCE_NOT_FOUND / DEPENDENCY_FAILED — no dispatch.
      const resolveAndDispatch = async (index: number, waitMs: number): Promise<StepResult> => {
        const step = steps[index];
        if (!hasReferences(step.parameters)) {
          return dispatchStep(step, waitMs);
        }
        // Build outputs map from completed results (previous waves).
        const outputs = new Map<string, unknown>();
        for (const r of results) {
          if (r.status === "completed" && r.output !== undefined && r.output !== null) {
            outputs.set(r.stepId, r.output);
          }
        }
        // Verify referenced predecessors completed successfully.
        const refIds = extractReferencedStepIds(step.parameters);
        for (const refId of refIds) {
          const pred = results.find((r) => r.stepId === refId);
          if (!pred || pred.status !== "completed") {
            return {
              stepId: step.id, connector: step.connector, capability: step.capability,
              status: "failed", output: null, attempt: 0,
              error: `DEPENDENCY_FAILED: predecessor '${refId}' did not complete successfully`,
              startedAt: Date.now(), finishedAt: Date.now(), durationMs: 0,
            };
          }
        }
        const resolved = resolveReferences(step.parameters, outputs);
        if (!resolved.ok) {
          return {
            stepId: step.id, connector: step.connector, capability: step.capability,
            status: "failed", output: null, attempt: 0, error: resolved.error,
            startedAt: Date.now(), finishedAt: Date.now(), durationMs: 0,
          };
        }
        const resolvedStep = Object.freeze({ ...step, parameters: Object.freeze(resolved.resolved) });
        return dispatchStep(resolvedStep, waitMs);
      };

      const waveResults = hasResourcePolicies
        ? await this._runResourceAware(ready, steps, resourcePolicies!, semaphores, (index, waitMs) => resolveAndDispatch(index, waitMs))
        : parallelism.enabled && parallelism.maxConcurrent > 0
          ? await this._runBounded(ready, parallelism.maxConcurrent, (index, waitMs) => resolveAndDispatch(index, waitMs))
          : await Promise.all(ready.map((index) => resolveAndDispatch(index, 0)));

      ready.forEach((index, position) => {
        remaining.delete(index);
        const result = waveResults[position];
        results.push(result);
        if (result.status === "completed") completed.add(steps[index].id);
      });

      if (waveResults.some((result) => result.status === "failed" || result.status === "timeout")) {
        return { results: Object.freeze(this._orderedResults(results, steps)), stoppedOnFailure: true };
      }
    }

    return { results: Object.freeze(this._orderedResults(results, steps)), stoppedOnFailure: false };
  }

  private _orderedResults(results: readonly StepResult[], steps: readonly ExecutionStep[]): StepResult[] {
    const order = new Map(steps.map((step, index) => [step.id, index]));
    return [...results].sort((a, b) => (order.get(a.stepId) ?? 0) - (order.get(b.stepId) ?? 0));
  }

  private _dependencies(step: ExecutionStep, steps: readonly ExecutionStep[]): readonly string[] {
    if (step.dependsOn !== undefined) return step.dependsOn;
    const index = steps.findIndex((candidate) => candidate.id === step.id);
    return index > 0 ? [steps[index - 1].id] : [];
  }

  /**
   * Resource-aware dispatcher: one semaphore per resourceKey. Resources with
   * different keys acquire independent semaphores and therefore run in
   * parallel. Resources without a valid policy dispatch immediately
   * (irrestrito). FIFO per resource. semaphore_wait_ms preserved per step.
   */
  private async _runResourceAware(
    items: readonly number[],
    steps: readonly ExecutionStep[],
    resourcePolicies: ReadonlyMap<string, number>,
    semaphores: Map<string, Semaphore>,
    fn: (index: number, semaphoreWaitMs: number) => Promise<StepResult>,
  ): Promise<StepResult[]> {
    const readyAt = Date.now();
    return Promise.all(
      items.map(async (index) => {
        const key = resolveResourceKey(steps[index]);
        const limit = resourcePolicies.get(key);
        if (!isValidLimit(limit)) {
          // No valid policy for this resource → irrestrito.
          return fn(index, 0);
        }
        let sem = semaphores.get(key);
        if (!sem) {
          sem = new Semaphore(limit);
          semaphores.set(key, sem);
        }
        const waitMs = await sem.acquire(readyAt);
        try {
          return await fn(index, waitMs);
        } finally {
          sem.release();
        }
      }),
    );
  }

  /**
   * Bounded concurrency dispatcher (legacy single-semaphore, real backpressure).
   * At most `maxConcurrent` ready steps are in flight at once; the rest
   * await an acquired slot. Results in input order (Promise.all semantics).
   */
  private async _runBounded<T>(
    items: readonly number[],
    maxConcurrent: number,
    fn: (index: number, semaphoreWaitMs: number) => Promise<T>,
  ): Promise<T[]> {
    const limit = Math.max(1, Math.floor(maxConcurrent) || 1);
    let available = limit;
    const waiters: Array<() => void> = [];
    const readyAt = Date.now();
    const acquire = (): Promise<void> => {
      if (available > 0) { available--; return Promise.resolve(); }
      return new Promise<void>((resolve) => waiters.push(resolve));
    };
    const release = (): void => {
      const next = waiters.shift();
      if (next) next();
      else available++;
    };
    return Promise.all(
      items.map(async (index) => {
        await acquire();
        const semaphoreWaitMs = Date.now() - readyAt;
        try {
          return await fn(index, semaphoreWaitMs);
        } finally {
          release();
        }
      }),
    );
  }
}