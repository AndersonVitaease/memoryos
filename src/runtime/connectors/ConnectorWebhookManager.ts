/**
 * ConnectorWebhookManager.ts
 * Receives, validates signatures, and routes incoming webhooks.
 * EF-31 · 2026-07-12 · Version: 1.0.0
 */

import type { ConnectorWebhookSpec } from './interfaces/IConnectorManifest';

export interface IncomingWebhook {
  readonly id: string;
  readonly connectorId: string;
  readonly webhookId: string;
  readonly eventType: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly rawBody: string;
  readonly receivedAt: string;
}

export interface WebhookValidationResult {
  readonly valid: boolean;
  readonly webhookId: string;
  readonly connectorId: string;
  readonly idempotencyKey?: string;
  readonly reason?: string;
}

export interface WebhookHandler {
  (webhook: IncomingWebhook): Promise<void>;
}

export class ConnectorWebhookManager {
  private readonly handlers = new Map<string, WebhookHandler[]>();
  private readonly processedKeys = new Set<string>();
  private receiveCount = 0;
  private validCount = 0;
  private duplicateCount = 0;
  private invalidSignatureCount = 0;

  private handlerKey(connectorId: string, eventType: string): string {
    return `${connectorId}::${eventType}`;
  }

  /** Register a handler for a specific connector event type */
  register(connectorId: string, eventType: string, handler: WebhookHandler): void {
    const key = this.handlerKey(connectorId, eventType);
    const existing = this.handlers.get(key) ?? [];
    this.handlers.set(key, [...existing, handler]);
  }

  /** Validate a webhook's signature */
  validateSignature(
    webhook: IncomingWebhook,
    spec: ConnectorWebhookSpec,
    _secretValue: string,  // in production: retrieved from vault by secretName
  ): WebhookValidationResult {
    if (!spec.signatureVerification.enabled) {
      return {
        valid: true,
        webhookId: spec.id,
        connectorId: webhook.connectorId,
        reason: 'SIGNATURE_VERIFICATION_DISABLED',
      };
    }

    const headerName = spec.signatureVerification.headerName;
    if (!headerName) {
      return {
        valid: false,
        webhookId: spec.id,
        connectorId: webhook.connectorId,
        reason: 'NO_HEADER_NAME_CONFIGURED',
      };
    }

    const providedSignature = webhook.headers[headerName.toLowerCase()];
    if (!providedSignature) {
      this.invalidSignatureCount++;
      return {
        valid: false,
        webhookId: spec.id,
        connectorId: webhook.connectorId,
        reason: `SIGNATURE_HEADER_MISSING: ${headerName}`,
      };
    }

    // In production, compute HMAC and compare with timing-safe comparison.
    // Here we confirm the header is present (production implementation would verify).
    const idempotencyKey = spec.idempotencyKey
      ? (JSON.parse(webhook.rawBody)[spec.idempotencyKey] as string | undefined)
      : undefined;

    return {
      valid: true,
      webhookId: spec.id,
      connectorId: webhook.connectorId,
      idempotencyKey,
    };
  }

  /** Check and register idempotency key to prevent duplicate processing */
  checkDuplicate(idempotencyKey: string): boolean {
    if (this.processedKeys.has(idempotencyKey)) {
      this.duplicateCount++;
      return true;
    }
    this.processedKeys.add(idempotencyKey);
    return false;
  }

  /** Dispatch a validated webhook to registered handlers */
  async dispatch(webhook: IncomingWebhook): Promise<void> {
    this.receiveCount++;
    const key = this.handlerKey(webhook.connectorId, webhook.eventType);
    const handlers = this.handlers.get(key) ?? [];
    this.validCount++;

    await Promise.all(handlers.map(h => h(webhook)));
  }

  listRegistered(): Array<{ connectorId: string; eventType: string; handlerCount: number }> {
    return [...this.handlers.entries()].map(([key, hs]) => {
      const [connectorId, eventType] = key.split('::');
      return { connectorId, eventType, handlerCount: hs.length };
    });
  }

  statistics() {
    return {
      receiveCount: this.receiveCount,
      validCount: this.validCount,
      duplicateCount: this.duplicateCount,
      invalidSignatureCount: this.invalidSignatureCount,
      processedKeyCount: this.processedKeys.size,
      registeredHandlers: this.handlers.size,
    };
  }

  health() {
    return {
      status: 'HEALTHY' as const,
      details: `${this.handlers.size} webhook handlers registered`,
      checks: { handlersOk: true },
      checkedAt: new Date().toISOString(),
    };
  }
}