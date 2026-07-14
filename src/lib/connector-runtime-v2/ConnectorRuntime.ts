/**
 * ConnectorRuntime.ts
 * Sprint 6.4.1 — Universal Connector Runtime
 *
 * PRIMARY ORCHESTRATOR of the Universal Connector Runtime.
 * Coordinates: registration, initialization, execution, routing, audit.
 * No connector implements its own runtime — ALL execution goes through here.
 *
 * SRP: runtime orchestration — delegates to sub-systems, no business logic.
 */

import type {
  ConnectorContext, ExecuteRequest, ExecuteResult,
  RouteQuery, ConnectorCapability, ConnectorManifest,
} from './UCRTypes';
import type { IConnectorSDK } from './IConnectorSDK';
import { ConnectorRegistry } from './ConnectorRegistry';
import { ConnectionRegistry } from './ConnectionRegistry';
import { ConnectorLifecycle } from './ConnectorLifecycle';
import { ConnectorSessionManager } from './ConnectorSessionManager';
import { ConnectorRouter } from './ConnectorRouter';
import { CapabilityEngine } from './CapabilityEngine';
import { ConnectorAudit } from './ConnectorAudit';
import { ConnectorMetrics } from './ConnectorMetrics';
import { ConnectorHealth } from './ConnectorHealth';
import { ConnectorEventBus } from './ConnectorEventBus';

export interface RuntimeHealth {
  status:      'ok' | 'degraded';
  registry:    ReturnType<typeof ConnectorRegistry.health>;
  connections: ReturnType<typeof ConnectionRegistry.health>;
  sessions:    ReturnType<typeof ConnectorSessionManager.health>;
  router:      ReturnType<typeof ConnectorRouter.health>;
  capabilities:ReturnType<typeof CapabilityEngine.health>;
  audit:       ReturnType<typeof ConnectorAudit.health>;
  metrics:     ReturnType<typeof ConnectorMetrics.health>;
  health:      ReturnType<typeof ConnectorHealth.health>;
  eventBus:    ReturnType<typeof ConnectorEventBus.health>;
}

const RUNTIME_KEY = '__UCR_RUNTIME__';

function getSystem(): ConnectorRuntime {
  if (!(globalThis as any)[RUNTIME_KEY]) {
    (globalThis as any)[RUNTIME_KEY] = new ConnectorRuntime();
  }
  return (globalThis as any)[RUNTIME_KEY];
}

export class ConnectorRuntime {
  /**
   * Registers a connector and initialises it with the given context.
   */
  async register(connector: IConnectorSDK, context: ConnectorContext): Promise<void> {
    ConnectorRegistry.register(connector);
    await ConnectorLifecycle.initialize(connector.connectorId, context);
  }

  /**
   * Executes an operation on a specific connection.
   * Manages lifecycle state (BUSY/READY), session, audit, and metrics.
   */
  async execute(request: ExecuteRequest): Promise<ExecuteResult> {
    const { context } = request;
    const { connectorId, connectionId } = context;

    if (!ConnectorLifecycle.isReady(connectorId)) {
      throw new Error(`[ConnectorRuntime] Connector "${connectorId}" is not ready.`);
    }

    const conn = ConnectionRegistry.get(connectionId);
    if (!conn) throw new Error(`[ConnectorRuntime] Connection not found: ${connectionId}`);

    // Ensure session is alive.
    const session = ConnectorSessionManager.start(context);

    const restore = ConnectorLifecycle.markBusy(connectorId);
    const t0 = Date.now();

    ConnectorEventBus.emit({
      eventType:     'REQUEST_STARTED',
      connectorId,
      connectionId,
      organizationId: context.organizationId,
      actor:         context.userId,
      requestId:     context.requestId,
      correlationId: context.correlationId,
      payload:       { operationId: request.operationId },
      status:        'PENDING',
    });

    let result: ExecuteResult;
    try {
      const sdk = ConnectorRegistry.lookup(connectorId);
      result    = await sdk.execute(request);
    } catch (err) {
      const durationMs = Date.now() - t0;
      restore();

      ConnectorEventBus.emit({
        eventType:     'REQUEST_FAILED',
        connectorId,
        connectionId,
        organizationId: context.organizationId,
        actor:         context.userId,
        requestId:     context.requestId,
        correlationId: context.correlationId,
        payload:       { operationId: request.operationId, error: String(err), durationMs },
        status:        'FAILURE',
      });

      ConnectorAudit.record({
        connectorId, connectionId, userId: context.userId, organizationId: context.organizationId,
        operationId: request.operationId, outcome: 'failure', durationMs, error: String(err), metadata: {},
      });

      throw err;
    }

    const durationMs = Date.now() - t0;
    restore();

    ConnectorEventBus.emit({
      eventType:     'REQUEST_COMPLETED',
      connectorId,
      connectionId,
      organizationId: context.organizationId,
      actor:         context.userId,
      requestId:     context.requestId,
      correlationId: context.correlationId,
      payload:       { operationId: request.operationId, success: result.success, durationMs },
      status:        result.success ? 'SUCCESS' : 'FAILURE',
    });

    ConnectorAudit.record({
      connectorId, connectionId, userId: context.userId, organizationId: context.organizationId,
      operationId: request.operationId,
      outcome:     result.success ? 'success' : 'failure',
      durationMs,
      error:       result.error,
      metadata:    result.metadata ?? {},
    });

    return result;
  }

  /**
   * Fan-out: executes the same operation across ALL matching connections in parallel.
   * Results are aggregated — errors per connection are returned, never thrown.
   */
  async executeAll(
    query: RouteQuery,
    buildRequest: (connectionId: string, context: ConnectorContext) => ExecuteRequest,
    baseContext: ConnectorContext
  ): Promise<Array<{ connectionId: string; result?: ExecuteResult; error?: string }>> {
    return ConnectorRouter.fanOut(query, async (connectionId) => {
      const ctx = { ...baseContext, connectionId };
      return this.execute(buildRequest(connectionId, ctx));
    });
  }

  route(query: RouteQuery) { return ConnectorRouter.route(query); }
  resolve(capability: ConnectorCapability) { return CapabilityEngine.resolve(capability); }

  health(): RuntimeHealth {
    return {
      status:      'ok',
      registry:    ConnectorRegistry.health(),
      connections: ConnectionRegistry.health(),
      sessions:    ConnectorSessionManager.health(),
      router:      ConnectorRouter.health(),
      capabilities:CapabilityEngine.health(),
      audit:       ConnectorAudit.health(),
      metrics:     ConnectorMetrics.health(),
      health:      ConnectorHealth.health(),
      eventBus:    ConnectorEventBus.health(),
    };
  }

  static instance(): ConnectorRuntime { return getSystem(); }
}