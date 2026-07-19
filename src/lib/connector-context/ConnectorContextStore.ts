/**
 * ConnectorContextStore.ts — Pure infrastructure. Zero connector-specific logic.
 *
 * Defines the base contract for session-scoped connector contexts.
 * All connector-specific types live in their own provider modules.
 *
 * SRP: sole responsibility is defining the structural contracts
 *      (BaseConnectorContext, ConnectorContextMap) used by the platform.
 */

/**
 * Every connector context must carry these mandatory fields.
 * Connector-specific data extends this interface in the connector's own module.
 */
export interface BaseConnectorContext {
  /** Connector identifier — must match the connectorId used in ConnectorRegistry */
  connectorId: string;
  /** ms timestamp of last write */
  updatedAt: number;
}

/**
 * Map of connectorId → opaque context blob stored in ConversationState.
 * The platform never inspects the values — only connectors read their own slot.
 */
export type ConnectorContextMap = Record<string, BaseConnectorContext>;