/**
 * ConnectorRegistry.ts — Engineering Sprint E-02.4
 * Registry for IConnector instances.
 *
 * SRP: registrar, localizar, listar e remover connectors.
 * Nenhuma lógica de execução. Nenhuma rede. Nenhum OAuth.
 *
 * Open/Closed: qualquer connector que implemente IConnector pode ser
 * registrado sem alterar este arquivo.
 */

import type { IConnector } from "./UCRTypes";

// ── ConnectorRegistry ─────────────────────────────────────────────────────────

export class ConnectorRegistry {
  private readonly _store = new Map<string, IConnector>();

  /** Registers a connector. Overwrites if the same connectorId already exists. */
  register(connector: IConnector): void {
    this._store.set(connector.connectorId(), connector);
  }

  /** Removes a connector by id. Returns true if it existed. */
  remove(connectorId: string): boolean {
    return this._store.delete(connectorId);
  }

  /** Returns the connector for the given id, or null if not found. */
  lookup(connectorId: string): IConnector | null {
    return this._store.get(connectorId) ?? null;
  }

  /** Returns true if a connector with the given id is registered. */
  exists(connectorId: string): boolean {
    return this._store.has(connectorId);
  }

  /** Returns all registered connector ids. */
  list(): string[] {
    return [...this._store.keys()];
  }

  /** Returns count of registered connectors. */
  size(): number {
    return this._store.size;
  }

  /** Removes all connectors. Useful for testing. */
  clear(): void {
    this._store.clear();
  }
}