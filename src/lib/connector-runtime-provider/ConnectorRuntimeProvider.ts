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

import { GmailConnector }              from "@/lib/connector-router/connectors/GmailConnector";
import { ConnectorRegistry }           from "@/lib/connector-router/ConnectorRegistry";
import { UniversalConnectorRouter }    from "@/lib/connector-router/UniversalConnectorRouter";
import { ConnectorCapabilityExecutor } from "@/lib/connector-router/ConnectorCapabilityExecutor";
import { ConversationRuntimeEngine }   from "@/lib/runtime-engine/ConversationRuntimeEngine";
import { DEFAULT_EXECUTION_POLICY }    from "@/lib/runtime-engine/ExecutionPolicy";

// ── Bootstrap ─────────────────────────────────────────────────────────────────

function _bootstrap(): ConversationRuntimeEngine {
  // 1. Registry — register all real connectors here as they are built.
  const registry = new ConnectorRegistry();
  registry.register(new GmailConnector());
  // Future: registry.register(new CalendarConnector());
  // Future: registry.register(new DriveConnector());
  // Future: registry.register(new GitHubConnector());

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
    g[_KEY] = _bootstrap();
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

/**
 * Returns the ConnectorRegistry used by the real runtime.
 * Useful for observability dashboards (read-only introspection).
 */
export function getRealConnectorRegistry(): ConnectorRegistry {
  // Instantiate a fresh registry just for introspection (does not affect runtime).
  // The runtime's registry is encapsulated inside the engine.
  const reg = new ConnectorRegistry();
  reg.register(new GmailConnector());
  return reg;
}