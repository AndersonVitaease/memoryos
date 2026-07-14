/**
 * ConnectorLifecycle.ts
 * Sprint 6.4.1 — Universal Connector Runtime
 *
 * Manages the explicit state machine for connector lifecycle.
 * Invalid transitions throw — no silent state corruption.
 * SRP: lifecycle transitions + init/shutdown orchestration.
 */

import { CONNECTOR_LIFECYCLE_TRANSITIONS } from './UCRTypes';
import type { ConnectorLifecycleState, ConnectorContext } from './UCRTypes';
import { ConnectorRegistry } from './ConnectorRegistry';
import { ConnectorEventBus } from './ConnectorEventBus';

export class ConnectorLifecycle {
  /**
   * Transitions a connector to the next lifecycle state.
   * Throws for invalid transitions.
   */
  static transition(connectorId: string, nextState: ConnectorLifecycleState, reason?: string): void {
    const current = ConnectorRegistry.getLifecycleState(connectorId);
    const allowed = CONNECTOR_LIFECYCLE_TRANSITIONS[current];

    if (!allowed.includes(nextState)) {
      throw new Error(
        `[ConnectorLifecycle] Invalid transition: ${current} → ${nextState} ` +
        `for connector "${connectorId}". Allowed: [${allowed.join(', ')}]`
      );
    }

    ConnectorRegistry.setLifecycleState(connectorId, nextState);

    const eventType =
      nextState === 'INITIALIZED' ? 'CONNECTOR_INITIALIZED' :
      nextState === 'STOPPED'     ? 'CONNECTOR_STOPPED' :
      nextState === 'FAILED'      ? 'CONNECTOR_FAILED' : null;

    if (eventType) {
      ConnectorEventBus.emit({
        eventType,
        connectorId,
        connectionId:  '',
        organizationId: '',
        actor:         'system',
        payload:       { from: current, to: nextState, reason },
        status:        nextState === 'FAILED' ? 'FAILURE' : 'SUCCESS',
      });
    }
  }

  static canTransition(connectorId: string, nextState: ConnectorLifecycleState): boolean {
    const current = ConnectorRegistry.getLifecycleState(connectorId);
    return CONNECTOR_LIFECYCLE_TRANSITIONS[current]?.includes(nextState) ?? false;
  }

  /**
   * Initialises a registered connector with the given context.
   * Transitions: REGISTERED → INITIALIZED → READY
   */
  static async initialize(connectorId: string, context: ConnectorContext): Promise<void> {
    const connector = ConnectorRegistry.lookup(connectorId);
    this.transition(connectorId, 'INITIALIZED', 'Initialization started');

    await connector.initialize(context);

    this.transition(connectorId, 'READY', 'Initialization complete');
  }

  /**
   * Gracefully shuts down a connector.
   * Transitions: READY/SUSPENDED → STOPPED
   */
  static async shutdown(connectorId: string): Promise<void> {
    const connector = ConnectorRegistry.lookup(connectorId);
    const state = ConnectorRegistry.getLifecycleState(connectorId);

    if (state === 'STOPPED') return; // already stopped — idempotent

    if (!this.canTransition(connectorId, 'STOPPED')) {
      throw new Error(`[ConnectorLifecycle] Cannot stop connector "${connectorId}" from state "${state}"`);
    }

    await connector.shutdown();
    this.transition(connectorId, 'STOPPED', 'Shutdown requested');
  }

  /** Marks a connector as FAILED with a reason. */
  static markFailed(connectorId: string, reason: string): void {
    if (this.canTransition(connectorId, 'FAILED')) {
      this.transition(connectorId, 'FAILED', reason);
    }
  }

  /** Marks a connector as BUSY (during execution). Returns restore function. */
  static markBusy(connectorId: string): () => void {
    this.transition(connectorId, 'BUSY', 'Execution in progress');
    return () => {
      if (this.canTransition(connectorId, 'READY')) {
        this.transition(connectorId, 'READY', 'Execution completed');
      }
    };
  }

  static getState(connectorId: string): ConnectorLifecycleState {
    return ConnectorRegistry.getLifecycleState(connectorId);
  }

  static isReady(connectorId: string): boolean {
    const s = ConnectorRegistry.getLifecycleState(connectorId);
    return s === 'READY' || s === 'BUSY';
  }
}