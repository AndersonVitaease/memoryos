/**
 * MicrosoftMultiAccount.js — Suporte a multiplas contas Microsoft 365.
 *
 * Espelha GoogleMultiAccount.js: o MicrosoftAuthSession.js JA e
 * "multi-workspace ready" — cada conexao e indexada por workspaceId.
 * Aqui introduzimos o conceito de "slot de conta" por cima da chave base:
 * a primeira conta fica na chave original (sem sufixo, pra nao exigir
 * reconexao de quem ja tinha uma conta conectada); contas adicionais
 * entram em chaves derivadas (`${base}__msacct2`, `__msacct3`, ...).
 *
 * ADR-014 / RFC-007 — Camada de Provider Router (workspaceId-aware).
 * O "active account" e persistido em localStorage e lido pelo shell do
 * MicrosoftGraphConnector como fallback quando identityContext nao
 * especifica um workspaceId — valida o fluxo ponta a ponta.
 */

import {
  connect, disconnect, reconnect, getConnection, listConnections,
} from "./MicrosoftAuthSession";
import { getActiveWorkspaceId } from "@/lib/workspace/WorkspaceContext";

const SLOT_PREFIX = "__msacct";
const ACTIVE_KEY = "memoryos_ms_active_workspace";

function slotWorkspaceId(baseWorkspaceId, slotIndex) {
  return slotIndex === 0 ? baseWorkspaceId : `${baseWorkspaceId}${SLOT_PREFIX}${slotIndex}`;
}

function isAccountOfWorkspace(connectionWorkspaceId, baseWorkspaceId) {
  return (
    connectionWorkspaceId === baseWorkspaceId ||
    connectionWorkspaceId.startsWith(`${baseWorkspaceId}${SLOT_PREFIX}`)
  );
}

export function listMicrosoftAccounts(baseWorkspaceId = getActiveWorkspaceId()) {
  return listConnections().filter((c) => isAccountOfWorkspace(c.workspaceId, baseWorkspaceId));
}

function nextAvailableSlot(baseWorkspaceId) {
  let i = 0;
  while (getConnection(slotWorkspaceId(baseWorkspaceId, i))) {
    i++;
  }
  return slotWorkspaceId(baseWorkspaceId, i);
}

export async function connectAdditionalMicrosoftAccount(
  baseWorkspaceId = getActiveWorkspaceId(),
  scopes,
  onStateChange,
) {
  const targetSlot = nextAvailableSlot(baseWorkspaceId);
  return connect({ workspaceId: targetSlot, scopes, onStateChange });
}

export async function disconnectMicrosoftAccount(accountWorkspaceId, onStateChange) {
  // Se a conta ativa esta sendo desconectada, volta o ativo pra base.
  if (getActiveMicrosoftWorkspaceId() === accountWorkspaceId) {
    setActiveMicrosoftWorkspaceId(getActiveWorkspaceId());
  }
  return disconnect(accountWorkspaceId, onStateChange);
}

export async function reconnectMicrosoftAccount(accountWorkspaceId, scopes, onStateChange) {
  return reconnect({ workspaceId: accountWorkspaceId, scopes, onStateChange });
}

/**
 * Detecta se a MENSAGEM do usuario menciona (parcialmente) o email de
 * alguma conta Microsoft conectada. Tolerante a mencoes truncadas.
 */
export function findAccountByMessageMention(baseWorkspaceId = getActiveWorkspaceId(), message) {
  if (!message) return null;
  const lower = message.toLowerCase();
  const tokens = lower.split(/[^a-z0-9]+/).filter((t) => t.length >= 5);
  if (tokens.length === 0) return null;

  for (const acc of listMicrosoftAccounts(baseWorkspaceId)) {
    if (!acc.email) continue;
    const localPart = acc.email.split("@")[0].toLowerCase();
    if (tokens.some((token) => localPart.includes(token))) return acc;
  }
  return null;
}

export function findAccountByEmail(baseWorkspaceId = getActiveWorkspaceId(), email) {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  return listMicrosoftAccounts(baseWorkspaceId).find(
    (c) => c.email?.toLowerCase() === normalized,
  ) ?? null;
}

// ── Active account (switcher) ────────────────────────────────────────────────

/**
 * Retorna o workspaceId da conta Microsoft ativa.
 * Default: o workspace base (= "default"). Se nenhuma conta estiver
 * conectada no ativo, cai pra base — o shell/Provider trata "nao
 * conectado" graciosamente.
 */
export function getActiveMicrosoftWorkspaceId() {
  try {
    const v = localStorage.getItem(ACTIVE_KEY);
    return v || getActiveWorkspaceId();
  } catch {
    return getActiveWorkspaceId();
  }
}

export function setActiveMicrosoftWorkspaceId(workspaceId) {
  try {
    localStorage.setItem(ACTIVE_KEY, workspaceId);
  } catch { /* storage indisponivel — nao bloqueia */ }
  // Dispara um evento custom pra componentes que quiserem reagir sem reload.
  window.dispatchEvent(new CustomEvent("memoryos:ms-active-account-changed", { detail: { workspaceId } }));
}