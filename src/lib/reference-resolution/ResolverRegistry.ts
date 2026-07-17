/**
 * ResolverRegistry.ts — Sprint C-02.2
 * Registry de ReferenceResolvers por connectorId.
 *
 * SRP: registrar, localizar e listar resolvers.
 * Open/Closed: novos adapters sao adicionados via register() sem alterar este arquivo.
 * Sem if/else por connector — estrategia por mapa.
 */

import type { ReferenceResolver } from "./ReferenceResolver";

export class ResolverRegistry {
  private readonly _store = new Map<string, ReferenceResolver>();

  /** Registra um resolver. Sobrescreve se o mesmo connectorId ja existir. */
  register(resolver: ReferenceResolver): void {
    this._store.set(resolver.connectorId, resolver);
  }

  /** Retorna o resolver para o connectorId ou null se nao encontrado. */
  lookup(connectorId: string): ReferenceResolver | null {
    return this._store.get(connectorId) ?? null;
  }

  /** Retorna true se um resolver esta registrado para o connectorId. */
  has(connectorId: string): boolean {
    return this._store.has(connectorId);
  }

  /** Lista todos os connectorIds registrados. */
  list(): string[] {
    return [...this._store.keys()];
  }

  /** Total de resolvers registrados. */
  size(): number {
    return this._store.size;
  }
}