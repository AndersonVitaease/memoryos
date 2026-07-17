/**
 * OperationalContext.ts — Sprint C-03.0
 * Estado operacional imutavel de uma conversa.
 *
 * Nao persistente — existe apenas durante a sessao.
 * Nenhuma dependencia de Connector, storage externo ou IA.
 */

import type { OperationalEntity } from "./OperationalEntity";

export interface OperationalContext {
  /** id -> entity */
  readonly entities: ReadonlyMap<string, Readonly<OperationalEntity>>;
}

export function emptyContext(): OperationalContext {
  return Object.freeze({ entities: new Map() });
}

/** Retorna novo contexto com a entidade inserida/substituida. */
export function contextWith(
  ctx:    OperationalContext,
  entity: Readonly<OperationalEntity>,
): OperationalContext {
  const next = new Map(ctx.entities);
  next.set(entity.id, entity);
  return Object.freeze({ entities: next });
}

/** Retorna novo contexto sem a entidade. */
export function contextWithout(
  ctx: OperationalContext,
  id:  string,
): OperationalContext {
  const next = new Map(ctx.entities);
  next.delete(id);
  return Object.freeze({ entities: next });
}

/** Retorna novo contexto vazio. */
export function clearedContext(): OperationalContext {
  return emptyContext();
}