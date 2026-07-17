/**
 * OperationalContextService.ts — Sprint C-03.0
 * Servico de lookup e binding — logica pura sem efeitos colaterais de store.
 *
 * SRP: encontra entidades por alias, nao conhece Store nem Telemetria.
 */

import type { OperationalContext }              from "./OperationalContext";
import type { OperationalEntity }              from "./OperationalEntity";

// ── LookupResult ──────────────────────────────────────────────────────────────

export interface LookupResult {
  readonly found:          boolean;
  readonly entity:         Readonly<OperationalEntity> | null;
  readonly matchedAlias:   string | null;
  /** Explainability: por que este recurso foi retornado */
  readonly explanation:    string;
}

// ── OperationalContextService ─────────────────────────────────────────────────

export class OperationalContextService {
  /**
   * Procura uma entidade que tenha o alias fornecido.
   * Busca case-insensitive + trim.
   * Retorna LookupResult com explicacao.
   */
  lookup(ctx: OperationalContext, alias: string): LookupResult {
    const q = alias.toLowerCase().trim();
    if (!q) {
      return { found: false, entity: null, matchedAlias: null, explanation: "Empty alias provided." };
    }

    for (const entity of ctx.entities.values()) {
      const matched = entity.aliases.find(a => a === q);
      if (matched) {
        return {
          found:        true,
          entity,
          matchedAlias: matched,
          explanation:
            `The alias "${alias}" was previously bound to "${entity.resource.displayName}" ` +
            `(resourceId: ${entity.resource.resourceId}) via connector "${entity.resource.connectorId}" ` +
            `during this conversation session.`,
        };
      }
    }

    return {
      found:        false,
      entity:       null,
      matchedAlias: null,
      explanation:  `No binding found for alias "${alias}". Reference Resolution should be executed.`,
    };
  }

  /**
   * Verifica se um resourceId ja esta no contexto.
   */
  lookupById(ctx: OperationalContext, resourceId: string): LookupResult {
    for (const entity of ctx.entities.values()) {
      if (entity.resource.resourceId === resourceId) {
        return {
          found:        true,
          entity,
          matchedAlias: entity.canonicalName,
          explanation:  `ResourceId "${resourceId}" is already bound to "${entity.canonicalName}".`,
        };
      }
    }
    return {
      found:        false,
      entity:       null,
      matchedAlias: null,
      explanation:  `ResourceId "${resourceId}" not found in operational context.`,
    };
  }
}