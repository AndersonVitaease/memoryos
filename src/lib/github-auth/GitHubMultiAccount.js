/**
 * GitHubMultiAccount.js — Suporte a multiplas contas GitHub.
 *
 * Espelha GoogleMultiAccount.js: GitHubAuthSession.js ja e multi-workspace
 * ready (cada conexao indexada por workspaceId). Aqui introduzimos o conceito
 * de "slot de conta" por cima da chave base: a primeira conta fica na chave
 * original (sem sufixo, pra nao exigir reconexao); contas adicionais entram em
 * chaves derivadas (`${base}__ghacct2`, `__ghacct3`, ...).
 */

import {
  connect, disconnect, reconnect, getConnection, listConnections,
} from "./GitHubAuthSession";

const SLOT_PREFIX = "__ghacct";

function slotWorkspaceId(baseWorkspaceId, slotIndex) {
  return slotIndex === 0 ? baseWorkspaceId : `${baseWorkspaceId}${SLOT_PREFIX}${slotIndex}`;
}

function isAccountOfWorkspace(connectionWorkspaceId, baseWorkspaceId) {
  return (
    connectionWorkspaceId === baseWorkspaceId ||
    connectionWorkspaceId.startsWith(`${baseWorkspaceId}${SLOT_PREFIX}`)
  );
}

export function listGitHubAccounts(baseWorkspaceId) {
  return listConnections().filter((c) => isAccountOfWorkspace(c.workspaceId, baseWorkspaceId));
}

function nextAvailableSlot(baseWorkspaceId) {
  let i = 0;
  while (getConnection(slotWorkspaceId(baseWorkspaceId, i))) i++;
  return slotWorkspaceId(baseWorkspaceId, i);
}

export async function connectAdditionalGitHubAccount(baseWorkspaceId, scopes, onStateChange) {
  const targetSlot = nextAvailableSlot(baseWorkspaceId);
  return connect({ workspaceId: targetSlot, scopes, onStateChange });
}

/**
 * Detecta se a MENSAGEM do usuario menciona (parcialmente) o login de
 * alguma conta GitHub conectada. Tolerante a mencoes truncadas.
 */
export function findAccountByMessageMention(baseWorkspaceId, message) {
  if (!message) return null;
  const lower = message.toLowerCase();
  const tokens = lower.split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
  if (tokens.length === 0) return null;

  for (const acc of listGitHubAccounts(baseWorkspaceId)) {
    if (!acc.accountLogin) continue;
    const login = acc.accountLogin.toLowerCase();
    if (tokens.some((token) => login.includes(token))) return acc;
  }
  return null;
}

export function findAccountByLogin(baseWorkspaceId, login) {
  if (!login) return null;
  const normalized = login.trim().toLowerCase();
  return listGitHubAccounts(baseWorkspaceId).find(
    (c) => c.accountLogin?.toLowerCase() === normalized,
  ) ?? null;
}

export async function disconnectGitHubAccount(accountWorkspaceId, onStateChange) {
  return disconnect(accountWorkspaceId, onStateChange);
}

export async function reconnectGitHubAccount(accountWorkspaceId, scopes, onStateChange) {
  return reconnect({ workspaceId: accountWorkspaceId, scopes, onStateChange });
}