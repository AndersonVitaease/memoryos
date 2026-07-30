/**
 * GoogleWorkspaceMCPClient.js
 *
 * Ponte entre o token OAuth do Google que os conectores nativos ja usam
 * (GoogleAuthSession) e o cliente MCP generico (mcpClientCall). Reaproveita
 * o token existente — nao pede consentimento novo, nao guarda nada extra.
 *
 * Exposto em window.__MCP_TEST__ pra facilitar teste manual pelo console,
 * mesmo padrao ja usado pelo DebugRuntime.js (window.__MEMORY_DEBUG__).
 */
import { base44 } from "@/api/base44Client";
import { ensureValidToken } from "@/lib/google-auth/GoogleAuthSession";

/**
 * Chama um servidor MCP do Google Workspace, reaproveitando o token OAuth
 * ja obtido pelos conectores nativos.
 *
 * @param {string} serverId - id do registro MCPServerConfig
 * @param {"list"|"call"} action
 * @param {string} [toolName]
 * @param {object} [args]
 */
export async function callGoogleWorkspaceMCP(serverId, action, toolName, args) {
  const token = await ensureValidToken("default");
  const res = await base44.functions.invoke("mcpClientCall", {
    serverId,
    action,
    toolName,
    arguments: args ?? {},
    bearerToken: token,
  });
  return res?.data ?? res;
}

/**
 * Cria (ou reaproveita, se ja existir com esse nome) um registro
 * MCPServerConfig — util pra criar pelo console sem precisar do `base44`
 * global (que nao existe no escopo do DevTools).
 */
export async function createGoogleWorkspaceServer({ name, serverUrl, notes }) {
  const existing = await base44.entities.MCPServerConfig.filter({ name });
  if (existing?.length > 0) {
    console.log("[GoogleWorkspaceMCPClient] Ja existe um registro com esse nome, reaproveitando:", existing[0].id);
    return existing[0];
  }
  const record = await base44.entities.MCPServerConfig.create({
    name,
    server_url: serverUrl,
    transport: "json",
    auth_type: "oauth",
    enabled: true,
    notes: notes ?? "",
  });
  console.log("[GoogleWorkspaceMCPClient] Registro criado:", record.id);
  return record;
}

if (typeof window !== "undefined") {
  window.__MCP_TEST__ = { callGoogleWorkspaceMCP, createGoogleWorkspaceServer };
  console.log("[GoogleWorkspaceMCPClient] window.__MCP_TEST__ disponível para teste manual.");
}
