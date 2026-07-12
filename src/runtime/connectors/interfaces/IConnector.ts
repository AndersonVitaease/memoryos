/**
 * IConnector.ts
 * Connector Runtime Foundation — EF-31
 * Engineering First · Sprint EF-31
 * Date: 2026-07-12 · Version: 1.0.0 · Status: Official
 */

import type { IConnectorManifest } from './IConnectorManifest';
import type { IConnectorAction, IConnectorActionResult } from './IConnectorAction';
import type { IConnectorContext } from './IConnectorContext';
import type { IConnectorSession } from './IConnectorSession';
import type { IConnectorHealth } from './IConnectorHealth';
import type { IConnectorResult } from './IConnectorResult';

export type ConnectorStatus =
  | 'UNREGISTERED'
  | 'REGISTERED'
  | 'INITIALIZING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'FAILED'
  | 'DEPRECATED';

export interface IConnector {
  readonly id: string;
  readonly version: string;
  readonly manifest: IConnectorManifest;
  readonly status: ConnectorStatus;

  /** Initialize the connector (validate manifest, setup internal state) */
  initialize(): Promise<void>;

  /** Authenticate using credentials from the auth manager */
  authenticate(context: IConnectorContext): Promise<boolean>;

  /** Execute a declared action */
  execute(
    action: IConnectorAction,
    context: IConnectorContext,
    session: IConnectorSession,
  ): Promise<IConnectorResult>;

  /** Gracefully disconnect and clean up session */
  disconnect(session: IConnectorSession): Promise<void>;

  /** Health check — must return in < 100ms */
  health(): Promise<IConnectorHealth>;

  /** Validate the connector manifest and configuration */
  validate(): Promise<ConnectorValidationResult>;

  /** Ping the external service */
  ping(): Promise<PingResult>;
}

export interface ConnectorValidationResult {
  valid: boolean;
  connectorId: string;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  checkedAt: string;
}

export interface ValidationError {
  field: string;
  code: string;
  message: string;
}

export interface ValidationWarning {
  field: string;
  code: string;
  message: string;
}

export interface PingResult {
  connectorId: string;
  reachable: boolean;
  latencyMs: number;
  statusCode?: number;
  checkedAt: string;
}