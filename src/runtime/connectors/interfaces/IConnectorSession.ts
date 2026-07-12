/**
 * IConnectorSession.ts
 * Connector Runtime Foundation — EF-31
 * Engineering First · Sprint EF-31
 * Date: 2026-07-12 · Version: 1.0.0 · Status: Official
 */

export type SessionStatus = 'ACTIVE' | 'EXPIRED' | 'CLOSED' | 'FAILED';

export interface IConnectorSession {
  readonly id: string;
  readonly connectorId: string;
  readonly userId: string;
  readonly correlationId: string;
  readonly status: SessionStatus;
  readonly grantedScopes: ReadonlyArray<string>;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly lastActivityAt: string;
  readonly actionCount: number;
  readonly errorCount: number;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface SessionRenewalResult {
  readonly sessionId: string;
  readonly renewed: boolean;
  readonly newExpiresAt?: string;
  readonly reason?: string;
}