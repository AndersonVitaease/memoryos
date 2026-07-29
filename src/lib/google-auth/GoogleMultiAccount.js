/**
 * GoogleMultiAccount.js — Fase 1+2 do suporte a múltiplas contas Google
 *
 * Não reinventa o armazenamento: o GoogleAuthSession.js JÁ é "multi-
 * workspace ready" — cada conexão já é indexada por uma chave livre
 * (workspaceId). O problema não era a estrutura de dados, era que TODA
 * a aplicação sempre usava a mesma chave fixa (getActiveWorkspaceId()),
 * então conectar uma segunda conta Google sobrescrevia a primeira.
 *
 * Este arquivo introduz o conceito de "slot de conta" por cima da chave
 * base já existente: a primeira conta continua na chave original (sem
 * sufixo, pra não exigir reconexão de quem já tinha uma conta
 * conectada); contas adicionais entram em chaves derivadas
 * (`${baseWorkspaceId}__acct2`, `__acct3`, ...).
 */

import {
  connect, disconnect, reconnect, getConnection, listConnections,
} from "./GoogleAuthSession";

const SLOT_PREFIX = "__acct";

function slotWorkspaceId(baseWorkspaceId, slotIndex) {
  return slotIndex === 0 ? baseWorkspaceId : `${baseWorkspaceId}${SLOT_PREFIX}${slotIndex}`;
}

function isAccountOfWorkspace(connectionWorkspaceId, baseWorkspaceId) {
  return (
    connectionWorkspaceId === baseWorkspaceId ||
    connectionWorkspaceId.startsWith(`${baseWorkspaceId}${SLOT_PREFIX}`)
  );
}

export function listGoogleAccounts(baseWorkspaceId) {
  return listConnections().filter((c) => isAccountOfWorkspace(c.workspaceId, baseWorkspaceId));
}

function nextAvailableSlot(baseWorkspaceId) {
  let i = 0;
  while (getConnection(slotWorkspaceId(baseWorkspaceId, i))) {
    i++;
  }
  return slotWorkspaceId(baseWorkspaceId, i);
}

export async function connectAdditionalGoogleAccount(baseWorkspaceId, scopes, onStateChange) {
  const targetSlot = nextAvailableSlot(baseWorkspaceId);
  return connect({ workspaceId: targetSlot, scopes, onStateChange });
}

/**
 * Detecta se a MENSAGEM do usuário menciona (mesmo que parcialmente) o
 * e-mail de alguma conta conectada — ex: "ler emails amazonnoconta"
 * deve reconhecer a conta "amazonnoconta01@gmail.com". Diferente de
 * findAccountByEmail (que exige o e-mail completo e exato), esta função
 * é tolerante a menções parciais/truncadas, como as pessoas realmente
 * escrevem numa conversa.
 */
export function findAccountByMessageMention(baseWorkspaceId, message) {
  if (!message) return null;
  const lower = message.toLowerCase();
  const tokens = lower.split(/[^a-z0-9]+/).filter((t) => t.length >= 5);
  if (tokens.length === 0) return null;

  for (const acc of listGoogleAccounts(baseWorkspaceId)) {
    if (!acc.email) continue;
    const localPart = acc.email.split("@")[0].toLowerCase();
    if (tokens.some((token) => localPart.includes(token))) return acc;
  }
  return null;
}

/**
 * Encontra a conexão de uma conta específica pelo e-mail, dentro deste
 * workspace do MemoryOS. Usado pra resolver "a conta X" que o usuário
 * menciona na conversa pro workspaceId (slot) real correspondente.
 */
export function findAccountByEmail(baseWorkspaceId, email) {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  return listGoogleAccounts(baseWorkspaceId).find(
    (c) => c.email?.toLowerCase() === normalized
  ) ?? null;
}

export async function disconnectGoogleAccount(accountWorkspaceId, onStateChange) {
  return disconnect(accountWorkspaceId, onStateChange);
}

export async function reconnectGoogleAccount(accountWorkspaceId, scopes, onStateChange) {
  return reconnect({ workspaceId: accountWorkspaceId, scopes, onStateChange });
}
