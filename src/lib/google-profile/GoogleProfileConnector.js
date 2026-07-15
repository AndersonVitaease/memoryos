/**
 * GoogleProfileConnector — Implementation 008
 * Primeiro conector funcional do MemoryOS.
 *
 * Responsabilidade única: consumir o endpoint userinfo do Google
 * utilizando exclusivamente o token OAuth gerenciado pelo GoogleAuthSession.
 *
 * NÃO gerencia autenticação.
 * NÃO abre popups.
 * NÃO armazena tokens.
 * Apenas consome a sessão existente.
 */

import { getAccessToken, ensureValidToken } from "@/lib/google-auth/GoogleAuthSession";

const LOG_PREFIX = "[GoogleProfileConnector]";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";
const WORKSPACE_ID = "default";

function log(msg) {
  if (import.meta.env.DEV) console.log(`${LOG_PREFIX} ${msg}`);
}

/**
 * @typedef {Object} GoogleProfile
 * @property {string} sub           — Google ID
 * @property {string} name          — Nome completo
 * @property {string} given_name    — Nome
 * @property {string} family_name   — Sobrenome
 * @property {string} email         — Email
 * @property {boolean} email_verified
 * @property {string} picture       — URL da foto
 * @property {string} locale        — Idioma
 */

/**
 * @typedef {Object} ProfileResult
 * @property {boolean} ok
 * @property {GoogleProfile|null} profile
 * @property {string|null} error     — Mensagem amigável, nunca stack trace
 * @property {string} status         — "connected"|"disconnected"|"expired"|"error"
 */

/**
 * Obtém o perfil do usuário Google autenticado.
 * Realiza refresh automático se o token estiver próximo de expirar.
 *
 * @returns {Promise<ProfileResult>}
 */
export async function fetchGoogleProfile() {
  log("Verificando sessao ativa...");

  // Passo 1 — verifica sessao
  const conn = await ensureValidToken(WORKSPACE_ID);
  if (!conn) {
    log("Sessao inexistente ou expirada — abortando.");
    return {
      ok: false,
      profile: null,
      error: "Google Workspace nao conectado. Conecte primeiro na secao acima.",
      status: "disconnected",
    };
  }

  // Passo 2 — obtem access token em memoria
  const accessToken = getAccessToken(WORKSPACE_ID);
  if (!accessToken) {
    log("Access token ausente mesmo apos ensureValidToken.");
    return {
      ok: false,
      profile: null,
      error: "Token de acesso indisponivel. Reconecte o Google Workspace.",
      status: "expired",
    };
  }

  log("Obtendo UserInfo...");

  // Passo 3 — chama API Google
  let res;
  try {
    res = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (networkErr) {
    log(`Erro de rede: ${networkErr.message}`);
    return {
      ok: false,
      profile: null,
      error: "Erro de rede ao acessar a API do Google. Verifique sua conexao.",
      status: "error",
    };
  }

  if (res.status === 401) {
    log("Token rejeitado pelo Google (401).");
    return {
      ok: false,
      profile: null,
      error: "Token invalido ou revogado. Reconecte o Google Workspace.",
      status: "expired",
    };
  }

  if (res.status === 403) {
    log("Acesso negado pelo Google (403).");
    return {
      ok: false,
      profile: null,
      error: "Acesso negado. Verifique os escopos autorizados.",
      status: "error",
    };
  }

  if (!res.ok) {
    log(`Erro inesperado da API Google: ${res.status}`);
    return {
      ok: false,
      profile: null,
      error: `Erro da API Google (${res.status}). Tente novamente.`,
      status: "error",
    };
  }

  const profile = await res.json();
  log("UserInfo recebido com sucesso.");

  return {
    ok: true,
    profile,
    error: null,
    status: "connected",
  };
}