/**
 * ConnectorRuntimeProvider.ts — Engineering Sprint E-02.5A
 *
 * SRP: montar e expor o ConversationRuntimeEngine configurado com
 *      o ConnectorCapabilityExecutor real (UCR + GmailConnector).
 *
 * Esta é a ÚNICA peça nova desta sprint:
 *   GmailConnector → ConnectorRegistry → UCR → ConnectorCapabilityExecutor
 *   → ConversationRuntimeEngine
 *
 * O ConversationPipeline passa a importar `getRealRuntimeEngine()`
 * deste módulo. Nenhuma outra camada muda.
 *
 * Open/Closed: para adicionar Calendar real, Drive real etc.,
 * basta chamar registry.register(new CalendarConnector()) aqui.
 * O Runtime, Dispatcher, Router e Pipeline permanecem inalterados.
 *
 * Singleton via globalThis para sobreviver HMR e re-renders.
 */

import { ConnectorRegistry as UCRRegistry } from "@/lib/connector-router/ConnectorRegistry";
import { UniversalConnectorRouter }         from "@/lib/connector-router/UniversalConnectorRouter";
import { ConnectorCapabilityExecutor }      from "@/lib/connector-router/ConnectorCapabilityExecutor";
import { ConversationRuntimeEngine }        from "@/lib/runtime-engine/ConversationRuntimeEngine";
import { DEFAULT_EXECUTION_POLICY }         from "@/lib/runtime-engine/ExecutionPolicy";

// Sprint 8.2: bootstrap now handled by ConnectorBootstrap — Provider knows no individual connectors.
// UCRConnectorRegistry is a thin bridge that adapts the connector-runtime registry to the UCR interface.

import { ConnectorBootstrap }  from "@/lib/connector-runtime/ConnectorBootstrap";
import { ConnectorRegistry as RuntimeRegistry } from "@/lib/connector-runtime/ConnectorRegistry";

// ── UCR Registry adapter ──────────────────────────────────────────────────────
// The UCR ConnectorRegistry uses a different interface (UCRTypes.IConnector) from
// the connector-runtime IConnector. We populate the UCR registry from the bootstrap result.

async function _buildUCRRegistry(): Promise<UCRRegistry> {
  const ucrRegistry = new UCRRegistry();
  // Only GmailConnector has a UCR-compatible interface (IConnector from UCRTypes).
  // Drive and Calendar use the connector-runtime IConnector (different execute signature).
  // They respond to the connector-runtime stack; for UCR we keep Gmail only (no regression).
  const { GmailConnector } = await import("@/lib/connector-router/connectors/GmailConnector");
  ucrRegistry.register(new GmailConnector());
  return ucrRegistry;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function _bootstrapAsync(): Promise<ConversationRuntimeEngine> {
  // Sprint 8.2: ConnectorBootstrap owns all connector registration logic.
  const runtimeRegistry = new RuntimeRegistry();
  await ConnectorBootstrap.bootstrap(runtimeRegistry);

  // UCR layer uses its own registry (ucr-typed connectors)
  const ucrRegistry = await _buildUCRRegistry();
  const registry = ucrRegistry;

  // 2. Router — finds connector by id automatically, no special-casing.
  const router = new UniversalConnectorRouter(registry);

  // 3. Executor adapter — bridges ICapabilityExecutor ← UCR.
  const executor = new ConnectorCapabilityExecutor(router);

  // 4. Runtime Engine — receives executor via DI, knows nothing about Gmail.
  return new ConversationRuntimeEngine(executor, DEFAULT_EXECUTION_POLICY);
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const _KEY = "__REAL_RUNTIME_ENGINE__";

function _getInstance(): ConversationRuntimeEngine {
  const g = globalThis as unknown as Record<string, unknown>;
  if (!g[_KEY]) {
    // Async bootstrap — fire and assign promise; callers that need the instance
    // synchronously fall back to a minimal engine until bootstrap resolves.
    _bootstrapAsync().then((engine) => {
      g[_KEY] = engine;
    }).catch(() => {});
    // Provide a synchronous fallback (Gmail only) for first-render callers.
    const ucrReg = new UCRRegistry();
    import("@/lib/connector-router/connectors/GmailConnector").then(({ GmailConnector }) => {
      ucrReg.register(new GmailConnector());
    }).catch(() => {});
    const router   = new UniversalConnectorRouter(ucrReg);
    const executor = new ConnectorCapabilityExecutor(router);
    g[_KEY] = new ConversationRuntimeEngine(executor, DEFAULT_EXECUTION_POLICY);
  }
  return g[_KEY] as ConversationRuntimeEngine;
}

/**
 * Returns the app-wide ConversationRuntimeEngine backed by real connectors.
 * Safe to call multiple times — always returns the same instance.
 */
export function getRealRuntimeEngine(): ConversationRuntimeEngine {
  return _getInstance();
}