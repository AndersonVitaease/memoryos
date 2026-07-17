/**
 * OperationalEntity.ts — Sprint C-03.0
 * Representa uma entidade utilizada na conversa, com aliases e resource binding.
 *
 * Imutavel. Toda atualizacao cria nova instancia.
 */

import type { OperationalResource } from "./OperationalResource";

export interface OperationalEntity {
  readonly id:            string;
  readonly canonicalName: string;
  readonly aliases:       readonly string[];
  readonly resource:      Readonly<OperationalResource>;
  readonly createdAt:     number;
  readonly lastAccessed:  number;
}

export function createEntity(
  id:            string,
  canonicalName: string,
  aliases:       readonly string[],
  resource:      Readonly<OperationalResource>,
): Readonly<OperationalEntity> {
  const now = Date.now();
  return Object.freeze({
    id, canonicalName,
    aliases:      Object.freeze([...new Set([canonicalName.toLowerCase(), ...aliases.map(a => a.toLowerCase())])]),
    resource,
    createdAt:    now,
    lastAccessed: now,
  });
}

export function touchEntity(entity: Readonly<OperationalEntity>): Readonly<OperationalEntity> {
  return Object.freeze({ ...entity, lastAccessed: Date.now() });
}

export function updateEntityResource(
  entity:   Readonly<OperationalEntity>,
  resource: Readonly<OperationalResource>,
  newAliases?: readonly string[],
): Readonly<OperationalEntity> {
  const combined = [
    ...entity.aliases,
    ...(newAliases ?? []).map(a => a.toLowerCase()),
  ];
  return Object.freeze({
    ...entity,
    resource,
    aliases:      Object.freeze([...new Set(combined)]),
    lastAccessed: Date.now(),
  });
}