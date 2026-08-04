/**
 * GitHubAuthSession.js — GitHub OAuth 2.0 — Session Manager (multi-conta)
 *
 * Espelha GoogleAuthSession.js, adaptado pro GitHub:
 *   - GitHub OAuth App nao usa PKCE (apenas state anti-CSRF).
 *   - Access tokens do GitHub nao expiram por padrao — armazenados no backend
 *     (entidade GitHubOAuthToken) e hidratados na memoria do frontend apos reload.
 *   - localStorage guarda apenas metadata (login, avatar, scopes) — nunca tokens.
 *   - In-memory token store (Map) indexado por workspaceId (slot de conta).
 *
 * Fluxo:
 *   1. githubOAuthInit  -> gera authUrl + state
 *   2. Popup GitHub     -> usuario autoriza
 *   3. githubOAuthExchange -> troca code por token, armazena no backend, retorna token
 *   4. GitHubAuthSession armazena token em memoria + metadata em localStorage
 *   5. githubRefreshToken (hidratacao) -> repoe token em memoria apos reload
 *   6. githubOAuthRevoke -> revoga e limpa
 */

import { base44 } from '@/api/base44Client';

const STORAGE_KEY = "memoryos_ghauth_v1";
const ACTIVE_KEY = "memoryos_gh_active_workspace";
const REPOS_KEY = "memoryos_gh_selected_repos";

const _tokenStore = new Map(); // workspaceId -> { accessToken }

async function invokeFn(name, payload) {
  const res = await base44.functions.invoke(name, payload ?? {});
  const d = res.data ?? res;
  if (d?.error) {
    const err = new Error(d.error);
    err._backendError = d.error;
    throw err;
  }
  return { data: d };
}

export const BASE_SCOPES = ['repo', 'read:org', 'read:user'];

// ── Storage (metadata only — no tokens) ───────────────────────────────────────

function _load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function _save(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}
function _clear(workspaceId) {
  const all = _load();
  delete all[workspaceId];
  _save(all);
  _tokenStore.delete(workspaceId);
}
function _makeConnectionId() {
  return `gh-conn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
function _storeToken(workspaceId, accessToken) {
  _tokenStore.set(workspaceId, { accessToken });
}
function _getStoredToken(workspaceId) {
  return _tokenStore.get(workspaceId) ?? null;
}

// ── Public token API (used by connectors) ──────────────────────────────────────

export function getAccessToken(workspaceId = "default") {
  const stored = _getStoredToken(workspaceId);
  return stored?.accessToken ?? null;
}

export function getConnection(workspaceId = "default") {
  const all = _load();
  return all[workspaceId] ?? null;
}

export function listConnections() {
  const all = _load();
  return Object.values(all);
}

export function isConnected(workspaceId = "default") {
  const conn = getConnection(workspaceId);
  if (!conn || conn.state !== "CONNECTED") return false;
  return !!_getStoredToken(workspaceId);
}

// ── OAuth connect flow ────────────────────────────────────────────────────────

export async function connect({ workspaceId = "default", scopes = BASE_SCOPES, onStateChange } = {}) {
  onStateChange?.("AUTHENTICATING");

  const initRes = await invokeFn('githubOAuthInit', {
    scopes,
    redirectUri: `${window.location.origin}/oauth/github/callback`,
  });
  const { authUrl, state } = initRes.data;

  sessionStorage.setItem('ghauth_state', state);
  sessionStorage.setItem('ghauth_workspace_id', workspaceId);

  return new Promise((resolve, reject) => {
    const popup = window.open(authUrl, 'github_oauth', 'width=600,height=700,scrollbars=yes');
    if (!popup) { reject(new Error('Popup bloqueado. Permita popups para este site.')); return; }

    const handleMessage = async (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'GITHUB_OAUTH_CALLBACK') return;

      window.removeEventListener('message', handleMessage);
      clearInterval(pollClosed);

      const { code, returnedState, error } = event.data;
      if (error) { onStateChange?.("NOT_CONNECTED"); reject(new Error(error)); return; }

      const savedState = sessionStorage.getItem('ghauth_state');
      if (returnedState !== savedState) {
        onStateChange?.("NOT_CONNECTED");
        reject(new Error('OAuth state mismatch — possivel CSRF'));
        return;
      }

      try {
        const exchangeRes = await invokeFn('githubOAuthExchange', {
          code,
          redirectUri: `${window.location.origin}/oauth/github/callback`,
          workspaceId,
        });
        const { accessToken, accountLogin, scopes: grantedScopes, avatarUrl, email, name } = exchangeRes.data;

        _storeToken(workspaceId, accessToken);

        const connectionId = _makeConnectionId();
        const connection = {
          workspaceId,
          connectionId,
          accountLogin,
          displayName: name ?? accountLogin,
          email: email ?? '',
          avatarUrl: avatarUrl ?? '',
          scopes: grantedScopes ?? scopes,
          connectedAt: Date.now(),
          state: "CONNECTED",
          isReal: true,
        };

        const all = _load();
        all[workspaceId] = connection;
        _save(all);

        sessionStorage.removeItem('ghauth_state');
        sessionStorage.removeItem('ghauth_workspace_id');

        // Primeira conta conectada vira a ativa automaticamente.
        const connectedNow = listConnections().filter((c) => c.state === "CONNECTED").length;
        if (connectedNow === 1) setActiveGitHubWorkspaceId(workspaceId);

        onStateChange?.("CONNECTED");
        resolve(connection);
      } catch (err) {
        onStateChange?.("NOT_CONNECTED");
        reject(err);
      }
    };

    window.addEventListener('message', handleMessage);

    const pollClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollClosed);
        window.removeEventListener('message', handleMessage);
        onStateChange?.("NOT_CONNECTED");
        reject(new Error('Popup OAuth fechado antes de concluir a autenticacao'));
      }
    }, 500);
  });
}

// ── Hydration (apos reload) ────────────────────────────────────────────────────

export async function hydrateToken(workspaceId = "default") {
  const conn = getConnection(workspaceId);
  if (!conn || conn.state !== "CONNECTED") return null;
  if (_getStoredToken(workspaceId)) return conn;
  try {
    const res = await invokeFn('githubRefreshToken', { workspaceId });
    _storeToken(workspaceId, res.data.accessToken);
    return conn;
  } catch { return null; }
}

export async function hydrateAll() {
  const conns = listConnections().filter((c) => c.state === "CONNECTED");
  await Promise.all(conns.map((c) => hydrateToken(c.workspaceId)));
}

export async function disconnect(workspaceId = "default", onStateChange) {
  const conn = getConnection(workspaceId);
  if (!conn) return;
  onStateChange?.("DISCONNECTED");
  await invokeFn('githubOAuthRevoke', { workspaceId }).catch(() => {});
  _clear(workspaceId);
  if (getActiveGitHubWorkspaceId() === workspaceId) {
    setActiveGitHubWorkspaceId("default");
  }
  onStateChange?.("NOT_CONNECTED");
}

export async function reconnect({ workspaceId = "default", scopes = BASE_SCOPES, onStateChange } = {}) {
  return connect({ workspaceId, scopes, onStateChange });
}

export async function ensureValidToken(workspaceId = "default") {
  const conn = getConnection(workspaceId);
  if (!conn || conn.state !== "CONNECTED") {
    throw new Error("GitHub not connected. Please connect in /connections.");
  }
  if (!_getStoredToken(workspaceId)) {
    const hydrated = await hydrateToken(workspaceId);
    if (!hydrated) throw new Error("Falha ao hidratar token GitHub.");
  }
  return conn;
}

// ── Active account (switcher) ─────────────────────────────────────────────────

export function getActiveGitHubWorkspaceId() {
  try {
    const v = localStorage.getItem(ACTIVE_KEY);
    return v || "default";
  } catch { return "default"; }
}

export function setActiveGitHubWorkspaceId(workspaceId) {
  try { localStorage.setItem(ACTIVE_KEY, workspaceId); } catch {}
  window.dispatchEvent(new CustomEvent("memoryos:gh-active-account-changed", { detail: { workspaceId } }));
}

// ── Selected repositories (multi-select) ──────────────────────────────────────

export function getSelectedRepos(workspaceId = "default") {
  try {
    const raw = localStorage.getItem(REPOS_KEY);
    const all = raw ? JSON.parse(raw) : {};
    return all[workspaceId] ?? [];
  } catch { return []; }
}

export function setSelectedRepos(workspaceId = "default", repos) {
  try {
    const raw = localStorage.getItem(REPOS_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[workspaceId] = repos;
    localStorage.setItem(REPOS_KEY, JSON.stringify(all));
  } catch {}
}