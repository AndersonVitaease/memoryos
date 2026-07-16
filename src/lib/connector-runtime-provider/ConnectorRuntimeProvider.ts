/**
 * ConnectorRuntimeProvider.ts — Engineering Sprint 8.3
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
 * The Provider knows ZERO individual connectors.
 * All registration is delegated to ConnectorBootstrap.
 * The UCR layer is populated via the generic UCRBridge.
 *
 * Singleton via globalThis — survives HMR and re-renders.
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
  engine: ConversationRuntimeEngine;
  registry: ConnectorRegistry;
}> {
  // 1. Bootstrap all connectors into the single RuntimeRegistry.
  const runtimeRegistry = new ConnectorRegistry();
  await ConnectorBootstrap.bootstrap(runtimeRegistry);

  // 2. Build UCR registry via generic bridge — no connector-specific code here.
  const ucrRegistry = buildUCRRegistry(runtimeRegistry);

  // 3. Wire UCR → Executor → Engine.
  const router   = new UniversalConnectorRouter(ucrRegistry);
  const executor = new ConnectorCapabilityExecutor(router);
  const engine   = new ConversationRuntimeEngine(executor, DEFAULT_EXECUTION_POLICY);

  return { engine, registry: runtimeRegistry };
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const _ENG_KEY = "__REAL_RUNTIME_ENGINE__";
const _REG_KEY = "__REAL_RUNTIME_REGISTRY__";

type BootstrapState = {
  engine:   ConversationRuntimeEngine;
  registry: ConnectorRegistry;
} | null;

const _g = globalThis as unknown as Record<string, unknown>;

// Initialize synchronously with a minimal engine, then upgrade async.
function _ensureInitialized(): void {
  if (_g[_ENG_KEY]) return;

  // Synchronous placeholder — keeps existing callers working immediately.
  const placeholderReg = new ConnectorRegistry();
  const placeholderUCR = buildUCRRegistry(placeholderReg);
  const placeholderRouter   = new UniversalConnectorRouter(placeholderUCR);
  const placeholderExecutor = new ConnectorCapabilityExecutor(placeholderRouter);
  _g[_ENG_KEY] = new ConversationRuntimeEngine(placeholderExecutor, DEFAULT_EXECUTION_POLICY);
  _g[_REG_KEY] = placeholderReg;

  // Async upgrade — replaces the placeholder once bootstrap completes.
  _bootstrapEngine().then(({ engine, registry }) => {
    _g[_ENG_KEY] = engine;
    _g[_REG_KEY] = registry;
  }).catch((e) => {
    console.warn("[ConnectorRuntimeProvider] bootstrap failed:", e);
  });
}

/**
 * Returns the app-wide ConversationRuntimeEngine.
 * Safe to call multiple times — always returns the current singleton.
 */
export function getRealRuntimeEngine(): ConversationRuntimeEngine {
  _ensureInitialized();
  return _g[_ENG_KEY] as ConversationRuntimeEngine;
}

/**
 * Returns the RuntimeRegistry — useful for dashboard introspection.
 * The registry may be the placeholder (empty) before bootstrap completes.
 */
export function getRealConnectorRegistry(): ConnectorRegistry {
  _ensureInitialized();
  return _g[_REG_KEY] as ConnectorRegistry;
}

/**
 * Returns a fresh bootstrapped registry (always complete, async).
 * Used by the Dashboard and Certification Suite for accurate reporting.
 */
export async function getFreshBootstrappedRegistry(): Promise<ConnectorRegistry> {
  const reg = new ConnectorRegistry();
  await ConnectorBootstrap.bootstrap(reg);
  return reg;
}