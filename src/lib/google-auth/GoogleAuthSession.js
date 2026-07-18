/**
 * GoogleAuthSession.js — Implementation 007
 * Google Workspace OAuth 2.0 — Session Manager
 *
 * Responsabilidade única: manter o estado de autenticação Google
 * na sessão do browser (localStorage + memória segura), sem expor
 * refresh tokens. Access tokens são armazenados em memória (não localStorage).
 *
 * Arquitetura:
 *   - Refresh tokens: armazenados SOMENTE no backend (GoogleOAuthToken entity)
 *   - Access tokens: armazenados em memória (sessionStorage), nunca em logs
 *   - localStorage: mantém apenas metadata da conexão (sem tokens)
 *   - Refresh automático quando o access token está próximo de expirar
 *   - Multi-workspace ready: cada entrada é indexada por workspaceId
 *
 * Fluxo real (Implementation 007):
 *   1. googleOAuthInit  → gera authUrl + state + codeVerifier
 *   2. Redirect Google  → usuário autoriza
 *   3. googleOAuthExchange → troca code por tokens, armazena refresh no backend
 *   4. Retorna accessToken (curto prazo) ao frontend
 *   5. GoogleAuthSession armazena accessToken em memória
 *   6. googleOAuthRefresh → renova via backend quando necessário
 *   7. googleOAuthRevoke  → revoga e limpa
 */

import { base44 } from '@/api/base44Client';

const STORAGE_KEY = "memoryos_gauth_v1";

// ── Backend function invoker ──────────────────────────────────────────────────
// Uses the official Base44 SDK — base44.functions.invoke() — so no internal
// URLs are hardcoded here. The SDK owns all transport and routing details.

async function invokeFn(name, payload) {
  const res = await base44.functions.invoke(name, payload ?? {});
  // ── INSTRUMENTATION: throw on backend error so callers see real failures ──
  const d = res.data ?? res;
  if (d?.error) {
    const err = new Error(d.error);
    err._audit = d.audit ?? null;
    err._backendError = d.error;
    console.error(`[GoogleAuthSession][invokeFn][${name}] BACKEND ERROR:`, d);
    throw err;
  }
  // Log _audit from exchange if present
  if (d?._audit) {
    console.group(`[GoogleAuthSession][invokeFn][${name}] AUDIT`);
    console.log(JSON.stringify(d._audit, null, 2));
    console.groupEnd();
  }
  return { data: d };
}
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // renova 5 min antes de expirar

// ── In-memory token store (nunca persiste tokens em localStorage) ─────────────
const _tokenStore = new Map(); // workspaceId → { accessToken, expiresAt }

// ── Scopes ────────────────────────────────────────────────────────────────────

export const BASE_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

export const WORKSPACE_SCOPES = [
  ...BASE_SCOPES,
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive",
];

// ── Storage (somente metadata — sem tokens) ───────────────────────────────────

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
  _tokenStore.delete(workspaceId);
}

function _makeConnectionId() {
  return `gw-conn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Token memory store ────────────────────────────────────────────────────────

function _storeToken(workspaceId, accessToken, expiresAt) {
  _tokenStore.set(workspaceId, { accessToken, expiresAt });
}

function _getStoredToken(workspaceId) {
  return _tokenStore.get(workspaceId) ?? null;
}

/**
 * Retorna o access token real para um workspace.
 * Usado exclusivamente pelos conectores via ConnectorInvocationService.
 * NUNCA exposto diretamente ao UI.
 *
 * @param {string} workspaceId
 * @returns {string | null}
 */
export function getAccessToken(workspaceId = "default") {
  const stored = _getStoredToken(workspaceId);
  if (!stored) return null;
  if (Date.now() >= stored.expiresAt) return null; // expirado
  return stored.accessToken;
}

// ── Public connection API ─────────────────────────────────────────────────────

/**
 * Retorna a conexão atual (metadata) para um workspace, ou null.
 * @param {string} workspaceId
 * @returns {GoogleConnection | null}
 */
export function getConnection(workspaceId = "default") {
  const all = _load();
  return all[workspaceId] ?? null;
}

export function listConnections() {
  const all = _load();
  return Object.values(all);
}

/**
 * Verifica se um workspace está conectado e com token válido em memória.
 */
export function isConnected(workspaceId = "default") {
  const conn = getConnection(workspaceId);
  if (!conn || conn.state !== "CONNECTED") return false;
  const token = _getStoredToken(workspaceId);
  if (!token) return false;
  return Date.now() < token.expiresAt;
}

/**
 * Inicia o fluxo OAuth real via backend function googleOAuthInit.
 * Abre popup para accounts.google.com.
 *
 * @param {Object} opts
 * @param {string} opts.workspaceId
 * @param {string[]} opts.scopes
 * @param {Function} opts.onStateChange
 * @returns {Promise<GoogleConnection>}
 */
export async function connect({ workspaceId = "default", scopes = WORKSPACE_SCOPES, onStateChange } = {}) {
  onStateChange?.("AUTHENTICATING");

  // 1. Get auth URL from backend
  const initRes = await invokeFn('googleOAuthInit', {
    scopes,
    redirectUri: `${window.location.origin}/oauth/google/callback`,
  });
  const { authUrl, state, codeVerifier } = initRes.data;

  // DIAG — log redirect_uri exata usada na requisição
  const sentRedirectUri = `${window.location.origin}/oauth/google/callback`;
  const parsedAuthUrl = new URL(authUrl);
  console.group("[GoogleAuthSession][DIAG] OAuth Init");
  console.log("[DIAG] window.location.origin :", window.location.origin);
  console.log("[DIAG] redirect_uri enviada ao backend :", sentRedirectUri);
  console.log("[DIAG] redirect_uri dentro do authUrl  :", parsedAuthUrl.searchParams.get("redirect_uri"));
  console.log("[DIAG] authUrl COMPLETA:", authUrl);
  console.groupEnd();

  // 2. Store PKCE state for callback verification
  sessionStorage.setItem('gauth_state', state);
  sessionStorage.setItem('gauth_code_verifier', codeVerifier);
  sessionStorage.setItem('gauth_workspace_id', workspaceId);
  sessionStorage.setItem('gauth_scopes', JSON.stringify(scopes));

  // 3. Open OAuth popup
  return new Promise((resolve, reject) => {
    const popup = window.open(authUrl, 'google_oauth', 'width=500,height=650,scrollbars=yes');

    if (!popup) {
      reject(new Error('Popup blocked. Please allow popups for this site.'));
      return;
    }

    // 4. Listen for callback message from popup
    const handleMessage = async (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'GOOGLE_OAUTH_CALLBACK') return;

      window.removeEventListener('message', handleMessage);
      clearInterval(pollClosed);

      const { code, returnedState, error } = event.data;

      if (error) {
        onStateChange?.("NOT_CONNECTED");
        reject(new Error(error));
        return;
      }

      // Verify CSRF state
      const savedState = sessionStorage.getItem('gauth_state');
      if (returnedState !== savedState) {
        onStateChange?.("NOT_CONNECTED");
        reject(new Error('OAuth state mismatch — possible CSRF attack'));
        return;
      }

      try {
        // 5. Exchange code for tokens via backend
        const exchangeRes = await invokeFn('googleOAuthExchange', {
          code,
          codeVerifier,
          redirectUri: `${window.location.origin}/oauth/google/callback`,
          workspaceId,
        });

        const { accessToken, expiresAt, email, displayName, avatarUrl, scopes: grantedScopes } = exchangeRes.data;

        // 6. Store access token in memory (never localStorage)
        _storeToken(workspaceId, accessToken, expiresAt);

        // 7. Store connection metadata (no tokens) in localStorage
        const connectionId = _makeConnectionId();
        const connection = {
          workspaceId,
          connectionId,
          tokenRef:        `gw-tok-${connectionId}`,
          refreshTokenRef: `gw-ref-${connectionId}`,
          email:           email ?? '',
          displayName:     displayName ?? '',
          avatarUrl:       avatarUrl ?? '',
          scopes:          grantedScopes ?? scopes,
          expiresAt,
          connectedAt:     Date.now(),
          state:           "CONNECTED",
          lastRefreshedAt: Date.now(),
          isReal:          true, // marks real OAuth (not simulated)
        };

        const all = _load();
        all[workspaceId] = connection;
        _save(all);

        // 8. Cleanup session state
        sessionStorage.removeItem('gauth_state');
        sessionStorage.removeItem('gauth_code_verifier');
        sessionStorage.removeItem('gauth_workspace_id');
        sessionStorage.removeItem('gauth_scopes');

        onStateChange?.("CONNECTED");
        resolve(connection);
      } catch (err) {
        onStateChange?.("NOT_CONNECTED");
        reject(err);
      }
    };

    window.addEventListener('message', handleMessage);

    // Detect popup closed without completing flow
    const pollClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollClosed);
        window.removeEventListener('message', handleMessage);
        onStateChange?.("NOT_CONNECTED");
        reject(new Error('OAuth popup closed before completing authentication'));
      }
    }, 500);
  });
}

/**
 * Renova o access token via backend (refresh_token nunca sai do servidor).
 * @param {string} workspaceId
 * @param {Function} [onStateChange]
 * @returns {Promise<GoogleConnection>}
 */
export async function refresh(workspaceId = "default", onStateChange) {
  const conn = getConnection(workspaceId);
  if (!conn) throw new Error("No connection to refresh");

  onStateChange?.("REFRESHING");

  const refreshRes = await invokeFn('googleOAuthRefresh', { workspaceId });
  const { accessToken, expiresAt } = refreshRes.data;

  // Update token in memory
  _storeToken(workspaceId, accessToken, expiresAt);

  // Update metadata in localStorage
  const updated = {
    ...conn,
    expiresAt,
    lastRefreshedAt: Date.now(),
    state: "CONNECTED",
  };
  const all = _load();
  all[workspaceId] = updated;
  _save(all);

  onStateChange?.("CONNECTED");
  return updated;
}

/**
 * Desconecta o workspace — revoga tokens no backend e limpa storage.
 */
export async function disconnect(workspaceId = "default", onStateChange) {
  const conn = getConnection(workspaceId);
  if (!conn) return;

  onStateChange?.("DISCONNECTED");

  // Revoke on backend (best-effort)
  await invokeFn('googleOAuthRevoke', { workspaceId }).catch(() => {});

  _clear(workspaceId);
  onStateChange?.("NOT_CONNECTED");
}

/**
 * Reconecta um workspace — equivale a connect().
 */
export async function reconnect({ workspaceId = "default", scopes = WORKSPACE_SCOPES, onStateChange } = {}) {
  return connect({ workspaceId, scopes, onStateChange });
}

/**
 * Verifica e renova o token se necessário antes do uso.
 * Chamado pelos conectores via ConnectorInvocationService.
 */
export async function ensureValidToken(workspaceId = "default") {
  const conn = getConnection(workspaceId);
  if (!conn || conn.state !== "CONNECTED") return null;

  const stored = _getStoredToken(workspaceId);

  // Token ausente em memória mas conexão existe — tentar refresh (ex: após reload)
  if (!stored) {
    try {
      return await refresh(workspaceId);
    } catch {
      return null;
    }
  }

  const needsRefresh = Date.now() > stored.expiresAt - TOKEN_EXPIRY_BUFFER_MS;
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
    connected:       conns.filter(c => c.state === "CONNECTED").length,
    expired:         conns.filter(c => c.state === "CONNECTED" && Date.now() > c.expiresAt).length,
    real:            conns.filter(c => c.isReal === true).length,
    byState:         conns.reduce((acc, c) => { acc[c.state] = (acc[c.state] ?? 0) + 1; return acc; }, {}),
  };
}