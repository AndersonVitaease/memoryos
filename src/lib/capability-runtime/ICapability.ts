// Capability Runtime — ICapability Contract
// Foundation v1.0 · Engineering First
//
// Toda Capability registrada no MemoryOS DEVE implementar esta interface.
// Nenhuma Capability pode acessar APIs externas diretamente —
// toda comunicacao externa ocorre exclusivamente via Connector Runtime.

import type { ConnectorRuntime } from "../connector-runtime/ConnectorRuntime";
import type { CapabilityContext, CapabilityMetadata, CapabilityResult } from "./CapabilityTypes";

export interface ICapability {
  /** Identificador unico da Capability */
  readonly id: string;

  /** Retorna metadados declarativos */
  metadata(): CapabilityMetadata;

  /** Valida se a Capability esta corretamente configurada */
  validate(): boolean;

  /** Inicializa a Capability (chamado pelo CapabilityLoader) */
  initialize(context: CapabilityContext, connectorRuntime: ConnectorRuntime): Promise<void>;

  /** Executa uma operacao */
  execute(
    operation: string,
    payload: Record<string, unknown>,
    context: CapabilityContext,
    connectorRuntime: ConnectorRuntime,
  ): Promise<CapabilityResult>;

  /** Encerra a Capability de forma graceful */
  shutdown(): Promise<void>;
}