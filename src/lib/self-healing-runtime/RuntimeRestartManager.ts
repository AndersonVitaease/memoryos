/**
 * RuntimeRestartManager.ts — Sprint 6.3.1
 * Restarts only the affected modules — never the entire system unnecessarily.
 * Integrates with DependencyResolver to compute the minimal restart chain.
 */

import type { RestartPlan, WatchTrigger, RecoveryStrategy } from "./SHRTypes";
import { RuntimeDependencyResolver } from "./RuntimeDependencyResolver";
import { RuntimeEventBus } from "./RuntimeEventBus";

let _seq = 0;
function makeId(): string { return `plan_${Date.now()}_${++_seq}`; }

export interface RestartResult {
  planId: string;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  success: boolean;
  restarted: string[];
  skipped: string[];
  failed: string[];
}

type ModuleRestarter = (moduleId: string) => Promise<boolean>;

export class RuntimeRestartManager {
  private _resolver: RuntimeDependencyResolver;
  private _bus:      RuntimeEventBus;
  private _history:  RestartResult[] = [];

  constructor(resolver: RuntimeDependencyResolver, bus: RuntimeEventBus) {
    this._resolver = resolver;
    this._bus = bus;
  }

  /**
   * Creates a restart plan for the affected module + its dependents.
   */
  buildPlan(affectedModule: string, trigger: WatchTrigger): RestartPlan {
    const chain = this._resolver.resolveDependencyChain(affectedModule);
    const ordered = this._resolver.restartOrder([affectedModule, ...chain]);

    const strategy: RecoveryStrategy = chain.length === 0 ? "RESTART_MODULE" : "FULL_RECOVERY";

    return {
      id: makeId(),
      triggeredAt: Date.now(),
      trigger,
      affectedModule,
      dependencyChain: ordered,
      strategy,
      estimatedDurationMs: ordered.length * 500,
    };
  }

  /**
   * Executes a restart plan. Calls the provided restarter per module.
   * Never restarts modules outside the plan.
   */
  async execute(plan: RestartPlan, restarter: ModuleRestarter): Promise<RestartResult> {
    const startedAt = Date.now();
    const restarted: string[] = [];
    const skipped:   string[] = [];
    const failed:    string[] = [];

    this._bus.emit("RuntimeRestarting", { planId: plan.id, modules: plan.dependencyChain });

    for (const moduleId of plan.dependencyChain) {
      try {
        const ok = await restarter(moduleId);
        if (ok) {
          restarted.push(moduleId);
          this._bus.emit("ModuleRestarted", { moduleId, planId: plan.id });
        } else {
          failed.push(moduleId);
        }
      } catch (e) {
        failed.push(moduleId);
      }
    }

    const result: RestartResult = {
      planId: plan.id,
      startedAt,
      completedAt: Date.now(),
      durationMs: Date.now() - startedAt,
      success: failed.length === 0,
      restarted, skipped, failed,
    };

    this._history.unshift(result);
    if (this._history.length > 100) this._history.splice(100);
    return result;
  }

  history(): RestartResult[] { return [...this._history]; }

  lastResult(): RestartResult | null { return this._history[0] ?? null; }
}