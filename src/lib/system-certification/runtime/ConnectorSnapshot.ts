/**
 * ConnectorSnapshot.ts — Sprint EF-55.1
 *
 * Snapshot do estado de um Connector durante a execução real.
 */

export interface ConnectorSnapshot {
  readonly connectorId:   string;
  readonly connectorName: string;
  readonly capability:    string;
  readonly wasSelected:   boolean;
  readonly wasExecuted:   boolean;
  readonly result:        string;
  readonly capturedAt:    number;
  readonly durationMs:    number;
}