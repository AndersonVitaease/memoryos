/**
 * GoogleAuthSession.js — Implementation 001
 * Google Workspace OAuth 2.0 — Session Manager
 *
 * Responsabilidade única: manter o estado de autenticação Google
 * na sessão do browser (localStorage), sem expor tokens em logs.
 *
 * Arquitetura:
 *   - Tokens NUNCA aparecem em console.log
 *   - Apenas referências opacas (tokenRef) são expostas externamente
 *   - Refresh automático quando o access token está próximo de expirar
 *   - Multi-workspace ready: cada entrada é indexada por workspaceId
 *
 * Limitação documentada:
 *   A produção requer Google OAuth Client ID/Secret configurados via
 *   set_secrets e um backend function para o exchange do code.
 *   Esta implementação utiliza a arquitetura completa com simulação
 *   do OAuth round-trip no frontend — adequado para validação da arquitetura.
 */

const STORAGE_KEY = "memoryos_gauth_v1";
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // renova 5 min antes de expirar

// ─── Scopes mínimos para autenticação base ─────────────────────────────────────

export const BASE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];

export const WORKSPACE_SCOPES = [
  ...BASE_SCOPES,
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive",
];

// ─── Storage (tokens nunca em log) ────────────────────────────────────────────

function _load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function _save(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* storage full — non-blocking */ }
}

function _clear(workspaceId) {
  const all = _load();
  delete all[workspaceId];
  _save(all);
}

// ─── Connection record ─────────────────────────────────────────────────────────

/**
 * @typedef {Object} GoogleConnection
 * @property {string}   workspaceId
 * @property {string}   connectionId    - ID opaco da conexão
 * @property {string}   tokenRef        - Referência opaca (nunca o token real)
 * @property {string}   refreshTokenRef - Referência opaca do refresh token
 * @property {string}   email
 * @property {string}   displayName
 * @property {string}   avatarUrl
 * @property {string[]} scopes
 * @property {number}   expiresAt       - ms epoch
 * @property {number}   connectedAt     - ms epoch
 * @property {string}   state           - ConnectionState
 */

function _makeConnectionId() {
  return `gw-conn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Retorna a conexão atual para um workspace, ou null se não conectado.
 * @param {string} workspaceId
 * @returns {GoogleConnection | null}
 */
export function getConnection(workspaceId = "default") {
  const all = _load();
  return all[workspaceId] ?? null;
}

/**
 * Lista todos os workspaces conectados (suporte multi-tenant).
 * @returns {GoogleConnection[]}
 */
export function listConnections() {
  const all = _load();
  return Object.values(all);
}

/**
 * Verifica se um workspace está conectado e com token válido.
 */
export function isConnected(workspaceId = "default") {
  const conn = getConnection(workspaceId);
  if (!conn) return false;
  if (conn.state !== "CONNECTED") return false;
  return Date.now() < conn.expiresAt;
}

/**
 * Simula o fluxo OAuth 2.0 Authorization Code + PKCE.
 *
 * Em produção: abre popup/redirect para accounts.google.com,
 * troca o code por tokens via backend function.
 *
 * Aqui: simula o round-trip completo preservando a estrutura de dados.
 *
 * @param {Object}   opts
 * @param {string}   opts.workspaceId
 * @param {string[]} opts.scopes
 * @param {Function} opts.onStateChange  - callback(state: string)
 * @returns {Promise<GoogleConnection>}
 */
export async function connect({ workspaceId = "default", scopes = BASE_SCOPES, onStateChange } = {}) {
  onStateChange?.("AUTHENTICATING");

  // Simulate OAuth round-trip latency
  await _delay(800);

  const connectionId   = _makeConnectionId();
  const expiresAt      = Date.now() + 3_600_000; // 1h
  const connectedAt    = Date.now();

  // LIMITAÇÃO DOCUMENTADA:
  // Em produção, este bloco executa:
  //   1. Gera code_verifier + code_challenge (PKCE)
  //   2. Abre accounts.google.com?response_type=code&client_id=...
  //   3. Recebe code via redirect/postMessage
  //   4. POST /api/google/token para trocar code por access_token + refresh_token
  //   5. Armazena refresh_token no backend (nunca no localStorage)
  //   6. Armazena apenas tokenRef (opaco) localmente
  //
  // Simulação preserva a estrutura completa:
  const tokenRef        = `gw-tok-${connectionId}`; // referência opaca
  const refreshTokenRef = `gw-ref-${connectionId}`; // nunca o valor real

  /** @type {GoogleConnection} */
  const connection = {
    workspaceId,
    connectionId,
    tokenRef,
    refreshTokenRef,
    email:       `workspace@gmail.com`,
    displayName: "Google Workspace",
    avatarUrl:   "",
    scopes,
    expiresAt,
    connectedAt,
    state: "CONNECTED",
  };

  const all = _load();
  all[workspaceId] = connection;
  _save(all);

  onStateChange?.("CONNECTED");
  return connection;
}

/**
 * Renova o access token usando o refresh token.
 * Chamado automaticamente quando expiresAt - buffer < Date.now().
 *
 * @param {string} workspaceId
 * @param {Function} [onStateChange]
 * @returns {Promise<GoogleConnection>}
 */
export async function refresh(workspaceId = "default", onStateChange) {
  const conn = getConnection(workspaceId);
  if (!conn) throw new Error("No connection to refresh");

  onStateChange?.("REFRESHING");

  // LIMITAÇÃO DOCUMENTADA:
  // Em produção: POST https://oauth2.googleapis.com/token com grant_type=refresh_token
  // O refresh_token é recuperado do backend via refreshTokenRef.
  await _delay(400);

  const newExpiresAt = Date.now() + 3_600_000;
  const newTokenRef  = `gw-tok-refreshed-${Date.now()}`;

  const updated = {
    ...conn,
    tokenRef:   newTokenRef,
    expiresAt:  newExpiresAt,
    state:      "CONNECTED",
  };

  const all = _load();
  all[workspaceId] = updated;
  _save(all);

  onStateChange?.("CONNECTED");
  return updated;
}

/**
 * Desconecta o workspace — revoga tokens e limpa storage.
 *
 * @param {string} workspaceId
 * @param {Function} [onStateChange]
 */
export async function disconnect(workspaceId = "default", onStateChange) {
  const conn = getConnection(workspaceId);
  if (!conn) return;

  onStateChange?.("DISCONNECTED");

  // LIMITAÇÃO DOCUMENTADA:
  // Em produção: POST https://oauth2.googleapis.com/revoke?token=...
  await _delay(300);

  _clear(workspaceId);
  onStateChange?.("NOT_CONNECTED");
}

/**
 * Reconecta um workspace previamente desconectado.
 * Equivalente a connect() — mantido como API explícita por semântica.
 */
export async function reconnect({ workspaceId = "default", scopes = BASE_SCOPES, onStateChange } = {}) {
  return connect({ workspaceId, scopes, onStateChange });
}

/**
 * Verifica se o token precisa ser renovado e faz refresh automático.
 * Deve ser chamado antes de usar o token.
 *
 * @param {string} workspaceId
 * @returns {Promise<GoogleConnection | null>}
 */
export async function ensureValidToken(workspaceId = "default") {
  const conn = getConnection(workspaceId);
  if (!conn) return null;
  if (conn.state !== "CONNECTED") return null;

  const needsRefresh = Date.now() > conn.expiresAt - TOKEN_EXPIRY_BUFFER_MS;
  if (needsRefresh) {
    try {
      return await refresh(workspaceId);
    } catch {
      return null;
    }
  }
  return conn;
}

/**
 * Retorna métricas de todas as conexões — sem expor tokens.
 */
export function getMetrics() {
  const conns = listConnections();
  return {
    totalWorkspaces: conns.length,
    connected:       conns.filter((c) => c.state === "CONNECTED").length,
    expired:         conns.filter((c) => c.state === "CONNECTED" && Date.now() > c.expiresAt).length,
    byState:         conns.reduce((acc, c) => { acc[c.state] = (acc[c.state] ?? 0) + 1; return acc; }, {}),
  };
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function _delay(ms) { return new Promise((r) => setTimeout(r, ms)); }