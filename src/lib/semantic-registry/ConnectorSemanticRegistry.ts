/**
 * ConnectorSemanticRegistry.ts — Engineering Sprint 9.2.2
 * Semantic Provider Registry Singleton
 *
 * SRP: registrar e consultar SemanticProviders.
 *      Nunca conhece nenhum connector especifico.
 *
 * Open/Closed: aberto para extensao via register(),
 *              fechado para modificacao — nenhum connector e embutido.
 *
 * Garantias:
 * - Determinístico: listAll() sempre retorna a mesma ordem (registro + sort)
 * - Imutavel: colecoes retornadas sao Object.freeze()
 * - Idempotente: registros duplicados por connectorId sao ignorados
 * - Zero conhecimento de dominio: nenhuma referencia a Gmail/Calendar/Drive/Memory
 */

import type { SemanticProvider } from "./SemanticTypes";

class ConnectorSemanticRegistryClass {
  private readonly _providers = new Map<string, SemanticProvider>();

  /**
   * Registra um SemanticProvider.
   * Idempotente: chamadas subsequentes com o mesmo connectorId sao ignoradas.
   */
  register(provider: SemanticProvider): void {
    if (this._providers.has(provider.connectorId)) return;
    this._providers.set(provider.connectorId, provider);
  }

  /**
   * Retorna o provider para um connectorId, ou null.
   */
  get(connectorId: string): SemanticProvider | null {
    return this._providers.get(connectorId) ?? null;
  }

  /**
   * Lista todos os providers registrados.
   * Ordem: alfabetica por connectorId — determinística, independente do registro.
   */
  listAll(): readonly SemanticProvider[] {
    return Object.freeze(
      [...this._providers.values()].sort((a, b) =>
        a.connectorId.localeCompare(b.connectorId)
      )
    );
  }

  /** Verifica se um connectorId esta registrado. */
  has(connectorId: string): boolean {
    return this._providers.has(connectorId);
  }

  /** Total de providers registrados. */
  get size(): number {
    return this._providers.size;
  }

  /** IDs de todos os providers registrados (ordem alfabetica). */
  listIds(): readonly string[] {
    return Object.freeze(
      [...this._providers.keys()].sort((a, b) => a.localeCompare(b))
    );
  }
}

// ── Singleton via globalThis ───────────────────────────────────────────────────

const _KEY = "__CONNECTOR_SEMANTIC_REGISTRY__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] =
    new ConnectorSemanticRegistryClass();
}

export const ConnectorSemanticRegistry: ConnectorSemanticRegistryClass = (
  globalThis as unknown as Record<string, ConnectorSemanticRegistryClass>
)[_KEY];