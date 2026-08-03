/**
 * MicrosoftCapabilityTypes.ts — contrato compartilhado por todos os Capability
 * Executors do conector Microsoft Graph (ADR-013 / RFC-006).
 *
 * Cada servico do Microsoft 365 implementa `MicrosoftCapability`. O shell
 * (MicrosoftGraphConnector) resolve a operation -> executor via
 * MicrosoftCapabilityRegistry e delega. O shell mantem apenas token, health,
 * metadata e roteamento.
 */
import type { ConnectorLog, ConnectorResult } from "../../ConnectorTypes";

export interface MicrosoftCapabilityContext {
  start: number;
  eid: string;
  logs: ConnectorLog[];
}

export interface MicrosoftCapability {
  /** Identificador legivel do servico (ex: "outlook-mail"). */
  readonly id: string;
  /** Lista de operations que este executor trata. */
  readonly operations: readonly string[];
  /** Executa a operation e retorna um ConnectorResult. */
  execute(
    operation: string,
    payload: Record<string, unknown>,
    accessToken: string,
    ctx: MicrosoftCapabilityContext,
  ): Promise<ConnectorResult>;
}