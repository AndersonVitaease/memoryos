// Connector Runtime — ConnectorLoader
// Foundation v1.0 · Engineering First
//
// Responsavel por carregar, inicializar e validar Connectors.

import type { IConnector } from "./IConnector";
import type { ConnectorContext } from "./ConnectorTypes";

export interface LoadResult {
  connectorId: string;
  success: boolean;
  loadTimeMs: number;
  error?: string;
}

export class ConnectorLoader {
  private readonly loaded = new Set<string>();

  async load(connector: IConnector, context: ConnectorContext): Promise<LoadResult> {
    const start = Date.now();
    try {
      if (!connector.validate()) {
        throw new Error("validate() returned false — connector configuration is invalid");
      }
      await connector.initialize(context);
      this.loaded.add(connector.id);
      return { connectorId: connector.id, success: true, loadTimeMs: Date.now() - start };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { connectorId: connector.id, success: false, loadTimeMs: Date.now() - start, error };
    }
  }

  async unload(connector: IConnector): Promise<void> {
    await connector.shutdown();
    this.loaded.delete(connector.id);
  }

  isLoaded(id: string): boolean {
    return this.loaded.has(id);
  }
}