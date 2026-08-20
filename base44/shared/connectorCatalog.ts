/**
 * connectorCatalog.ts — Catalogo server-side de ConnectorDefinitions.
 *
 * Espelho estatico do conhecimento tecnico global que o ConnectorRegistry
 * do frontend mantem em memoria. O backend connectorWorkspace usa isto para:
 *   - check D: ConnectorDefinition existe?
 *   - check G: capability esta disponivel no ConnectorDefinition?
 *   - mapear connector_id -> entidade de credencial (check E).
 *
 * NAO contem tokens nem segredos — so metadados tecnicos publicos.
 * Manter em sync com o ConnectorRegistry do frontend quando novos
 * connectors forem adicionados.
 */

export interface CatalogEntry {
  connectorId: string;
  displayName: string;
  providerKind: "oauth_google" | "oauth_github" | "oauth_microsoft" | "web" | "mcp" | "base44";
  /** Entidade de credencial associada — determina onde o check E procura. */
  credentialEntity: "google" | "github" | "microsoft" | "web";
  capabilities: string[];
  icon?: string;
}

export const CONNECTOR_CATALOG: Record<string, CatalogEntry> = {
  gmail: {
    connectorId: "gmail",
    displayName: "Gmail",
    providerKind: "oauth_google",
    credentialEntity: "google",
    capabilities: [
      "gmail.messages.list", "gmail.messages.get",
      "gmail.threads.list", "gmail.threads.get",
      "gmail.labels.list", "gmail.send",
      "auth.profile",
    ],
  },
  "google-drive": {
    connectorId: "google-drive",
    displayName: "Google Drive",
    providerKind: "oauth_google",
    credentialEntity: "google",
    capabilities: [
      "drive.files.list", "drive.files.get", "drive.files.search",
      "drive.files.create", "drive.files.update", "drive.files.delete",
      "drive.about.get", "connectivity.ping",
    ],
  },
  "google-calendar": {
    connectorId: "google-calendar",
    displayName: "Google Calendar",
    providerKind: "oauth_google",
    credentialEntity: "google",
    capabilities: [
      "calendar.calendars.list", "calendar.events.list",
      "calendar.events.get", "calendar.events.create",
      "connectivity.ping",
    ],
  },
  github: {
    connectorId: "github",
    displayName: "GitHub",
    providerKind: "oauth_github",
    credentialEntity: "github",
    capabilities: [
      "repos.list", "branches.list", "commits.list", "files.get",
      "issues.list", "pulls.list", "search.code",
    ],
  },
  "microsoft-graph": {
    connectorId: "microsoft-graph",
    displayName: "Microsoft 365",
    providerKind: "oauth_microsoft",
    credentialEntity: "microsoft",
    capabilities: [
      "outlook.mail.list", "outlook.mail.get", "outlook.mail.send",
      "outlook.calendar.list", "outlook.calendar.get",
      "onedrive.list", "onedrive.get",
    ],
  },
  "web-connector": {
    connectorId: "web-connector",
    displayName: "Web Connector",
    providerKind: "web",
    credentialEntity: "web",
    // Capabilities TECNICAS do Web Connector (verbs), alinhadas com
    // WebConnector.ts. NAO cadastrar capabilities especificas de sites
    // (ex: reservation.search, order.lookup) aqui — essas vivem no
    // CapabilityMap de cada site. O authorizeExecution usa gate bifasico
    // para web: G1 confirma o verb tecnico contra este catalogo; G2 valida
    // a capability especifica do site contra o CapabilityMap.
    capabilities: [
      "web.session.list", "web.capability.list", "web.discover",
      "web.session.use", "web.capability.execute", "connectivity.ping",
    ],
  },
};

/**
 * Connectors internos confiaveis do MemoryOS que NAO exigem WorkspaceConnector.
 *
 * Estes connectors:
 *   - nao possuem credencial por usuario (nao sao OAuth/web/MCP-server);
 *   - usam secrets do app compartilhados (OPENHANDS_API_KEY, etc.) ou
 *     sao shells compostos que apenas dispatcham sub-capabilities;
 *   - estao registrados em OFFICIAL_FACTORIES (ConnectorBootstrap.ts).
 *
 * Allowlist explicita: apenas estes IDs bypassam o check B (WorkspaceConnector).
 * Strings desconhecidas ("foo-unknown") continuam bloqueadas por check B.
 *
 * NAO inclui "mcp" — MCP executa servidores configurados por workspace
 * (MCPServerConfig) e deve continuar exigindo WorkspaceConnector.
 */
export const INTERNAL_CONNECTORS: ReadonlySet<string> = new Set([
  "adaptive-process",
  "openhands",
]);

export function isInternalConnector(connectorId: string): boolean {
  return INTERNAL_CONNECTORS.has(connectorId);
}

export function getCatalogEntry(connectorId: string): CatalogEntry | null {
  return CONNECTOR_CATALOG[connectorId] ?? null;
}

export function listCatalogConnectors(): CatalogEntry[] {
  return Object.values(CONNECTOR_CATALOG);
}

/**
 * Map escopos Google para os connector_ids habilitados por uma credencial Google.
 * Um unico GoogleOAuthToken pode habilitar gmail + google-drive + google-calendar.
 */
export function googleConnectorsForScopes(scopes: string[]): string[] {
  const ids: string[] = [];
  const joined = scopes.join(" ");
  if (joined.includes("gmail")) ids.push("gmail");
  if (joined.includes("drive")) ids.push("google-drive");
  if (joined.includes("calendar")) ids.push("google-calendar");
  return ids;
}