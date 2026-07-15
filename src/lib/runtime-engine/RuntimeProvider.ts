/**
 * RuntimeProvider.ts — Engineering Sprint E-02.3A
 * Provides the correct Runtime instance for each execution environment.
 *
 * SRP: fornecer o Runtime correto por ambiente/tipo.
 * Substitui o singleton global conversationRuntimeEngine.
 *
 * Open/Closed: novos ambientes (Desktop, Cloud, Mobile, Browser Agent)
 * são adicionados registrando um novo RuntimeType — sem alterar este Provider.
 *
 * Nenhum connector, nenhuma rede, nenhum OAuth.
 */

import type { ExecutionPlan }          from "@/lib/planning-engine-e022/ExecutionPlanTypes";
import type { ExecutionResult, RuntimeExecutionContext } from "./RuntimeTypes";
import { ConversationRuntimeEngine }   from "./ConversationRuntimeEngine";
import { MockCapabilityExecutor }      from "./MockCapabilityExecutor";
import { DEFAULT_EXECUTION_POLICY, buildPolicy } from "./ExecutionPolicy";

// ── Runtime types ─────────────────────────────────────────────────────────────

export type RuntimeType =
  | "conversation"   // default — in-browser chat
  | "desktop"        // Desktop Agent (Sprint E-02.5+)
  | "cloud"          // Cloud batch execution (Sprint E-02.6+)
  | "mobile"         // Mobile Agent (Sprint E-02.7+)
  | "browser_agent"; // Browser automation (Sprint E-02.8+)

// ── IRuntimeEngine (abstraction over concrete engines) ───────────────────────

export interface IRuntimeEngine {
  execute(plan: ExecutionPlan): Promise<ExecutionResult>;
  cancel(executionId: string): boolean;
  getExecution(executionId: string): RuntimeExecutionContext | null;
  getRunningExecutions(): RuntimeExecutionContext[];
  getMetrics(): Record<string, unknown>;
}

// ── RuntimeProvider ───────────────────────────────────────────────────────────

class RuntimeProviderClass {
  private readonly _instances = new Map<RuntimeType, IRuntimeEngine>();

  /**
   * Returns the Runtime instance for the given type.
   * Creates it on first access (lazy initialization).
   */
  get(type: RuntimeType = "conversation"): IRuntimeEngine {
    if (this._instances.has(type)) return this._instances.get(type)!;
    const instance = this._create(type);
    this._instances.set(type, instance);
    return instance;
  }

  /**
   * Registers a custom Runtime for a given type.
   * Used in testing and for future environment-specific Runtimes.
   */
  register(type: RuntimeType, runtime: IRuntimeEngine): void {
    this._instances.set(type, runtime);
  }

  /** Returns all registered runtime types. */
  registeredTypes(): RuntimeType[] {
    return [...this._instances.keys()];
  }

  private _create(type: RuntimeType): IRuntimeEngine {
    switch (type) {
      case "conversation":
        return new ConversationRuntimeEngine(
          new MockCapabilityExecutor(),
          DEFAULT_EXECUTION_POLICY,
        );
      case "desktop":
      case "cloud":
      case "mobile":
      case "browser_agent":
        // Fall back to conversation runtime until dedicated engines exist
        return new ConversationRuntimeEngine(
          new MockCapabilityExecutor(),
          buildPolicy({ timeoutMs: 60_000, stepTimeoutMs: 20_000 }),
        );
      default:
        return new ConversationRuntimeEngine(new MockCapabilityExecutor());
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const _KEY = "__RUNTIME_PROVIDER__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new RuntimeProviderClass();
}

export const RuntimeProvider: RuntimeProviderClass = (
  globalThis as unknown as Record<string, RuntimeProviderClass>
)[_KEY];