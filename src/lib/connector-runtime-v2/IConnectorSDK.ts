/**
 * IConnectorSDK.ts
 * Sprint 6.4.1 — Universal Connector Runtime
 *
 * THE single contract every connector must implement.
 * No connector may implement its own runtime logic — all execution
 * goes through this interface and the ConnectorRuntime.
 *
 * Principles: Interface Segregation · SRP · Least Privilege · Zero Trust
 */

import type {
  ConnectorManifest,
  ConnectorCapability,
  ConnectorOperation,
  ConnectorContext,
  ExecuteRequest,
  ExecuteResult,
  ConnectorHealthReport,
  ConnectorLifecycleState,
} from './UCRTypes';

export interface AuthenticateRequest {
  context:      ConnectorContext;
  flow:         string;
  scopes:       string[];
  redirectUri?: string;
  metadata?:    Record<string, unknown>;
}

export interface AuthenticateResult {
  success:      boolean;
  connectionId: string;
  error?:       string;
}

export interface DisconnectResult {
  success:      boolean;
  connectionId: string;
  disconnectedAt: string;
}

/**
 * IConnectorSDK — The universal connector contract.
 * All current and future connectors MUST implement this interface.
 */
export interface IConnectorSDK {
  /** Stable, globally unique connector identifier. */
  readonly connectorId: string;

  /**
   * Returns the connector manifest — metadata, capabilities, operations.
   * Must be pure and synchronous.
   */
  manifest(): ConnectorManifest;

  /**
   * Initialises the connector. Called once after registration.
   * Must be idempotent.
   */
  initialize(context: ConnectorContext): Promise<void>;

  /**
   * Gracefully shuts down the connector, releasing all resources.
   */
  shutdown(): Promise<void>;

  /**
   * Returns the current health of this connector's external dependencies.
   */
  health(): Promise<ConnectorHealthReport>;

  /**
   * Returns the list of capabilities this connector currently supports.
   * May change dynamically (e.g., if scopes are revoked).
   */
  capabilities(): ConnectorCapability[];

  /**
   * Returns the list of operations this connector can execute.
   */
  operations(): ConnectorOperation[];

  /**
   * Executes a single operation.
   * All side effects must be confined to the given context.
   */
  execute(request: ExecuteRequest): Promise<ExecuteResult>;

  /**
   * Initiates authentication for a connection.
   * Delegates token storage to the Identity Platform — never stores tokens.
   */
  authenticate(request: AuthenticateRequest): Promise<AuthenticateResult>;

  /**
   * Disconnects and revokes credentials for a connection.
   */
  disconnect(connectionId: string, context: ConnectorContext): Promise<DisconnectResult>;

  /**
   * Returns runtime metadata — version, uptime, config (no secrets).
   */
  metadata(): Record<string, unknown>;
}