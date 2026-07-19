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
  if (_g[_ENG_KEY]) {
    // [RUNTIME-PROBE][CRP-02] _ensureInitialized early-return — singleton already exists
    console.log("[RUNTIME-PROBE][CRP-02]", {
      probe:       "ensureInitialized:earlyReturn",
      t:           performance.now(),
      ts:          Date.now(),
      engineKey:   _ENG_KEY,
      engineExists: true,
      regSize:     (_g[_REG_KEY] as ConnectorRegistry | undefined)?.count?.() ?? "unknown",
      regContents: (_g[_REG_KEY] as ConnectorRegistry | undefined)?.list?.() ?? [],
    });
    return;
  }

  // [RUNTIME-PROBE][CRP-03] First call — placeholder about to be created, race window opens NOW
  console.log("[RUNTIME-PROBE][CRP-03]", {
    probe:                "ensureInitialized:firstCall:placeholderAboutToBeCreated",
    t:                    performance.now(),
    ts:                   Date.now(),
    note:                 "Placeholder engine will be stored synchronously. _bootstrapEngine() fires async (NOT awaited). Race window OPENS here.",
  });

  // Synchronous placeholder — keeps existing callers working immediately.
  const placeholderReg = new ConnectorRegistry();
  const placeholderUCR = buildUCRRegistry(placeholderReg);
  const placeholderRouter   = new UniversalConnectorRouter(placeholderUCR);
  const placeholderExecutor = new ConnectorCapabilityExecutor(placeholderRouter);
  _g[_ENG_KEY] = new ConversationRuntimeEngine(placeholderExecutor, DEFAULT_EXECUTION_POLICY);
  _g[_REG_KEY] = placeholderReg;

  // [RUNTIME-PROBE][CRP-04] Placeholder stored — bootstrap about to fire (not awaited)
  console.log("[RUNTIME-PROBE][CRP-04]", {
    probe:            "ensureInitialized:placeholderStored:bootstrapFiring",
    t:                performance.now(),
    ts:               Date.now(),
    placeholderRegSize: placeholderReg.count(),
    placeholderRegContents: placeholderReg.list(),
    note:             "_bootstrapEngine().then() fires NOW — not awaited. Any getRealRuntimeEngine() call before .then() resolves returns the placeholder.",
  });

  // Async upgrade — replaces the placeholder once bootstrap completes.
  _bootstrapEngine().then(({ engine, registry }) => {
    // [RUNTIME-PROBE][CRP-06] Real engine stored — bootstrap complete, race window CLOSES
    console.log("[RUNTIME-PROBE][CRP-06]", {
      probe:          "bootstrapEngine:thenResolved:realEngineStored",
      t:              performance.now(),
      ts:             Date.now(),
      realRegSize:    registry.count(),
      realRegContents: registry.list(),
      note:           "Real engine now active. Any request BEFORE this log used the placeholder.",
    });
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
  // [RUNTIME-PROBE][CRP-05] getRealRuntimeEngine returning — is it placeholder or real?
  const reg = _g[_REG_KEY] as ConnectorRegistry | undefined;
  console.log("[RUNTIME-PROBE][CRP-05]", {
    probe:          "getRealRuntimeEngine:returning",
    t:              performance.now(),
    ts:             Date.now(),
    regSize:        reg?.count?.() ?? "unknown",
    regContents:    reg?.list?.() ?? [],
    isPlaceholder:  (reg?.count?.() ?? 0) === 0,
    note:           "regSize===0 means placeholder is being returned. Race condition active if Drive request follows.",
  });
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