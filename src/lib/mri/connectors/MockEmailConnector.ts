/**
 * MRI — MemoryOS Reference Implementation
 * MockEmailConnector — Connector de referência para e-mail (mock)
 * Demonstra: Connector SDK, rollback conceitual, auditoria completa
 */

import type { IConnector, ExecutionContext, ConnectorResult, ValidationResult, HealthResult, ConnectorMetadata } from "../core/interfaces";

export interface EmailInput {
  to:      string;
  subject: string;
  body:    string;
  from?:   string;
}

interface SentEmail extends EmailInput {
  sentAt:      string;
  messageId:   string;
}

export class MockEmailConnector implements IConnector {
  readonly connectorId  = "com.memoryos.email.mock";
  readonly capabilityId = "email.message.send";

  // Log local para rollback conceitual
  private sent: SentEmail[] = [];

  validate(input: unknown): ValidationResult {
    const i = input as EmailInput;
    if (!i?.to)      return { valid: false, error: "to is required" };
    if (!i?.subject) return { valid: false, error: "subject is required" };
    if (!i?.body)    return { valid: false, error: "body is required" };
    if (!i.to.includes("@")) return { valid: false, error: "to must be a valid email" };
    return { valid: true };
  }

  async execute(input: unknown, ctx: ExecutionContext): Promise<ConnectorResult> {
    const i = input as EmailInput;
    const validation = this.validate(i);
    if (!validation.valid) throw new Error(validation.error);

    const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const sentAt    = new Date().toISOString();

    // Mock: simula envio sem SMTP real
    const email: SentEmail = { ...i, sentAt, messageId };
    this.sent.push(email);

    return {
      connectorId:  this.connectorId,
      capabilityId: this.capabilityId,
      status:       "success",
      outputData:   { messageId, sentAt, to: i.to },
      executionRef: { messageId },
      auditData: {
        action:    "email.send",
        resource:  i.to,
        timestamp: sentAt,
        userId:    ctx.userId,
      },
    };
  }

  /** Rollback conceitual: registra "revogação" mas e-mail já enviado */
  async rollback(executionRef: unknown, ctx: ExecutionContext) {
    const ref = executionRef as { messageId: string };
    const idx = this.sent.findIndex(e => e.messageId === ref.messageId);
    if (idx >= 0) this.sent[idx] = { ...this.sent[idx], subject: "[REVOKED] " + this.sent[idx].subject };
    return { status: "rolled_back" as const, executionRef };
  }

  async healthCheck(): Promise<HealthResult> {
    return {
      status:       "healthy",
      latencyMs:    1,
      version:      "1.0.0",
      timestamp:    new Date().toISOString(),
      dependencies: [{ name: "mock-smtp", status: "ok" }],
    };
  }

  getMetadata(): ConnectorMetadata {
    return {
      connectorId:        this.connectorId,
      capabilityId:       this.capabilityId,
      supportsRollback:   true,
      estimatedLatencyMs: 50,
      version:            "1.0.0",
    };
  }

  getSentEmails(): SentEmail[] { return [...this.sent]; }
}