/**
 * OperationalResource.ts — Sprint C-03.0
 * Representa um recurso tecnico resolvido pelo Reference Resolution.
 *
 * Imutavel. Sem dependencia de Connector.
 */

export interface OperationalResource {
  readonly resourceId:   string;
  readonly connectorId:  string;
  readonly displayName:  string;
  readonly confidence:   number;
  readonly resolvedAt:   number;
}

export function createResource(
  resourceId:  string,
  connectorId: string,
  displayName: string,
  confidence:  number,
): Readonly<OperationalResource> {
  return Object.freeze({ resourceId, connectorId, displayName, confidence, resolvedAt: Date.now() });
}