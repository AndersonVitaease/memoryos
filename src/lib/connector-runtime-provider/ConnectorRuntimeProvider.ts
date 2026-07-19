/**
 * ConnectorRuntimeProvider.ts — Sprint M1.1 (Bootstrap Stabilization)
 *
 * SRP: build and expose the ConversationRuntimeEngine backed by the
 *      official Connector Runtime pipeline.
 *
 * Pipeline:
 *   ConnectorBootstrap
 *     → RuntimeRegistry (connector-runtime/ConnectorRegistry)
 *       → UCRBridge (builds UCRRegistry from RuntimeRegistry)
 *         → UniversalConnectorRouter
 *           → ConnectorCapabilityExecutor
 *             → ConversationRuntimeEngine
 *
 * Sprint M1.1 change:
 *   - Eliminated placeholder engine + race condition.
 *   - Bootstrap fires eagerly at module load (no longer lazy).
 *   - getRealRuntimeEngine() awaits bootstrap before returning — guaranteed READY.
 *   - Single bootstrap promise; all concurrent callers wait on the same promise.
 *   - Bootstrap executes exactly once per process lifetime (HMR-safe via globalThis).
 */

import { UniversalConnectorRouter }    from "@/lib/connector-router/UniversalConnectorRouter";
import { ConnectorCapabilityExecutor } from "@/lib/connector-router/ConnectorCapabilityExecutor";
import { ConversationRuntimeEngine }   from "@/lib/runtime-engine/ConversationRuntimeEngine";
import { DEFAULT_EXECUTION_POLICY }    from "@/lib/runtime-engine/ExecutionPolicy";
import { ConnectorBootstrap }          from "@/lib/connector-runtime/ConnectorBootstrap";
import { ConnectorRegistry }           from "@/lib/connector-runtime/ConnectorRegistry";
import { buildUCRRegistry }            from "@/lib/connector-runtime/UCRBridge";

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function _bootstrapEngine(): Promise<{
  engine:   ConversationRuntimeEngine;
  registry: ConnectorRegistry;
}> {
  console.log("[RUNTIME] Bootstrap iniciado");

  // 1. Create ConnectorRegistry.
  const runtimeRegistry = new ConnectorRegistry();
  console.log("[RUNTIME] ConnectorRegistry criado");

  // 2. Register all connectors (sequential, validates each).
  const result = await ConnectorBootstrap.bootstrap(runtimeRegistry);
  console.log(`[RUNTIME] ${runtimeRegistry.count()} connectors registrados:`, runtimeRegistry.list(), result.errors.length ? `(errors: ${result.errors.join(", ")})` : "");

  // 3. Build UCR layer from RuntimeRegistry via generic bridge.
  const ucrRegistry = buildUCRRegistry(runtimeRegistry);

  // 4. Wire Router.
  const router = new UniversalConnectorRouter(ucrRegistry);
  console.log("[RUNTIME] UniversalConnectorRouter criado");

  // 5. Wire Executor.
  const executor = new ConnectorCapabilityExecutor(router);
  console.log("[RUNTIME] ConnectorCapabilityExecutor criado");

  // 6. Wire Engine.
  const engine = new ConversationRuntimeEngine(executor, DEFAULT_EXECUTION_POLICY);
  console.log("[RUNTIME] ConversationRuntimeEngine criado");

  console.log("[RUNTIME] Runtime READY — registry:", runtimeRegistry.list(), `| connectors=${runtimeRegistry.count()} | bootstrapMs=${result.bootstrapTimeMs}`);

  return { engine, registry: runtimeRegistry };
}

// ── Singleton ─────────────────────────────────────────────────────────────────
// One Promise, one result. All callers await the same bootstrap.
// HMR-safe: stored on globalThis, never re-created if already running.

const _PROMISE_KEY = "__REAL_RUNTIME_PROMISE__";
const _ENG_KEY     = "__REAL_RUNTIME_ENGINE__";
const _REG_KEY     = "__REAL_RUNTIME_REGISTRY__";

const _g = globalThis as unknown as Record<string, unknown>;

// Kick off bootstrap immediately at module load — no lazy trigger.
// This means bootstrap is already running by the time the first message arrives.
if (!_g[_PROMISE_KEY]) {
  _g[_PROMISE_KEY] = _bootstrapEngine().then(({ engine, registry }) => {
    _g[_ENG_KEY] = engine;
    _g[_REG_KEY] = registry;
    return { engine, registry };
  }).catch((e) => {
    console.error("[RUNTIME] Bootstrap FAILED:", e);
    // Re-throw so awaiting callers get the error instead of silently returning undefined.
    throw e;
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the fully-bootstrapped ConversationRuntimeEngine.
 * Awaits bootstrap completion — guaranteed READY when resolved.
 * All concurrent callers share the same Promise (no duplicate bootstrap).
 */
export async function getRealRuntimeEngine(): Promise<ConversationRuntimeEngine> {
  await (_g[_PROMISE_KEY] as Promise<unknown>);
  return _g[_ENG_KEY] as ConversationRuntimeEngine;
}

/**
 * Returns the fully-bootstrapped ConnectorRegistry.
 * Awaits bootstrap completion — guaranteed populated when resolved.
 */
export async function getRealConnectorRegistry(): Promise<ConnectorRegistry> {
  await (_g[_PROMISE_KEY] as Promise<unknown>);
  return _g[_REG_KEY] as ConnectorRegistry;
}

/**
 * Returns a fresh bootstrapped registry (always complete, async).
 * Used by Dashboard and Certification Suite for accurate reporting.
 */
export async function getFreshBootstrappedRegistry(): Promise<ConnectorRegistry> {
  const reg = new ConnectorRegistry();
  await ConnectorBootstrap.bootstrap(reg);
  return reg;
}