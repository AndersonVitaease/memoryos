/**
 * ConnectorContextStore.ts — Pure infrastructure. Zero connector-specific logic.
 *
 * Defines only the structural contracts used by the platform.
 * No connector types. No Google Drive. No Gmail. No GitHub.
 *
 * SRP: sole responsibility is defining BaseConnectorContext and ConnectorContextMap.
 */

/**
 * Every connector context must carry these mandatory fields.
 * Connector-specific data extends this interface in the connector's own provider module.
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