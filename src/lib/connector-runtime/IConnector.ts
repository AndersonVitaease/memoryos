// Connector Runtime — IConnector Contract
// Foundation v1.0 · Engineering First
//
// Todo Connector registrado no MemoryOS DEVE implementar esta interface.

import type { ConnectorContext, ConnectorHealthReport, ConnectorMetadata, ConnectorResult } from "./ConnectorTypes";

export interface IConnector {
  /** Identificador unico do connector */
  readonly id: string;

  /** Retorna metadados declarativos do connector */
  metadata(): ConnectorMetadata;

  /** Inicializa o connector (chamado pelo ConnectorLoader) */
  initialize(context: ConnectorContext): Promise<void>;

  /** Encerra o connector de forma graceful */
  shutdown(): Promise<void>;

  /** Retorna o estado de saude atual */
  health(): Promise<ConnectorHealthReport>;

  /** Executa uma operacao no connector */
  execute(operation: string, payload: Record<string, unknown>, context: ConnectorContext): Promise<ConnectorResult>;

  /** Valida se o connector esta corretamente configurado */
  validate(): boolean;
}