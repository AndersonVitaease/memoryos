/**
 * GmailConnector — Implementation 009
 * Conector de leitura do Gmail.
 *
 * Responsabilidade unica: consumir a Gmail API usando o token
 * gerenciado pelo GoogleAuthSession (Implementation 007).
 *
 * NAO gerencia autenticacao.
 * NAO abre popups.
 * NAO armazena tokens.
 * NAO envia, exclui, arquiva ou responde e-mails.
 * Apenas leitura.
 */

import { getAccessToken, ensureValidToken } from "@/lib/google-auth/GoogleAuthSession";

const LOG_PREFIX = "[GmailConnector]";
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const WORKSPACE_ID = "default";
const DEFAULT_MAX_RESULTS = 20;
const REQUEST_TIMEOUT_MS = 10000;

function log(msg) {
  if (import.meta.env.DEV) console.log(`${LOG_PREFIX} ${msg}`);
}

// ── Result builders ───────────────────────────────────────────────────────────

function ok(data) {
  return { ok: true, data, error: null, status: "connected" };
}

function disconnected(msg = "Google Workspace nao conectado. Conecte primeiro na secao de Conectores.") {
  return { ok: false, data: null, error: msg, status: "disconnected" };
}

function expired(msg = "Token invalido ou expirado. Reconecte o Google Workspace.") {
  return { ok: false, data: null, error: msg, status: "expired" };
}

function apiError(msg) {
  return { ok: false, data: null, error: msg, status: "error" };
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function gmailGet(path, params = {}) {
  const token = getAccessToken(WORKSPACE_ID);
  if (!token) return { httpError: "no_token" };

  const url = new URL(`${GMAIL_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    return { status: res.status, ok: res.ok, json: () => res.json() };
  } catch (e) {
    clearTimeout(timer);
    if (e.name === "AbortError") return { httpError: "timeout" };
    return { httpError: "network", message: e.message };
  }
}

// ── Session guard ─────────────────────────────────────────────────────────────

async function requireSession() {
  const conn = await ensureValidToken(WORKSPACE_ID);
  if (!conn) return null;
  const token = getAccessToken(WORKSPACE_ID);
  if (!token) return null;
  return conn;
}

// ── Response decoder ──────────────────────────────────────────────────────────

function handleHttpError(res, context) {
  if (!res || res.httpError === "no_token") return expired();
  if (res.httpError === "timeout") return apiError(`Timeout ao acessar Gmail (${context}).`);
  if (res.httpError === "network") return apiError(`Erro de rede ao acessar Gmail: ${res.message}`);
  if (res.status === 401) return expired();
  if (res.status === 403) return apiError("Acesso negado ao Gmail. Verifique os escopos autorizados.");
  if (res.status === 404) return apiError(`Recurso nao encontrado (${context}).`);
  if (!res.ok) return apiError(`Erro da API Gmail (${res.status}) em ${context}.`);
  return null; // sem erro
}

// ── Message header extractor ──────────────────────────────────────────────────

function extractHeader(headers, name) {
  return headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function normalizeSummary(msg) {
  const headers = msg.payload?.headers ?? [];
  return {
    id:           msg.id,
    threadId:     msg.threadId,
    subject:      extractHeader(headers, "Subject") || "(sem assunto)",
    from:         extractHeader(headers, "From"),
    to:           extractHeader(headers, "To"),
    snippet:      msg.snippet ?? "",
    internalDate: msg.internalDate ?? "",
    labelIds:     msg.labelIds ?? [],
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Lista as ultimas mensagens da caixa de entrada.
 * @param {Object} opts
 * @param {number} [opts.maxResults=20]
 * @param {string} [opts.labelIds]       — Ex: "INBOX", "IMPORTANT"
 * @param {string} [opts.pageToken]
 * @returns {Promise<ConnectorResult>}
 */
export async function listMessages({ maxResults = DEFAULT_MAX_RESULTS, labelIds, pageToken } = {}) {
  log("listMessages()");

  const conn = await requireSession();
  if (!conn) return disconnected();

  const params = { maxResults };
  if (labelIds) params.labelIds = labelIds;
  if (pageToken) params.pageToken = pageToken;

  const listRes = await gmailGet("/messages", params);
  const err = handleHttpError(listRes, "listMessages");
  if (err) return err;

  const body = await listRes.json();
  const messageRefs = body.messages ?? [];

  if (messageRefs.length === 0) {
    return ok({ messages: [], nextPageToken: null, resultSizeEstimate: 0 });
  }

  // Fetch summaries in parallel (capped at maxResults)
  const summaries = await Promise.all(
    messageRefs.slice(0, maxResults).map(async ({ id }) => {
      const msgRes = await gmailGet(`/messages/${id}`, { format: "metadata", metadataHeaders: "Subject,From,To" });
      if (msgRes.httpError || !msgRes.ok) return null;
      const msg = await msgRes.json();
      return normalizeSummary(msg);
    })
  );

  return ok({
    messages: summaries.filter(Boolean),
    nextPageToken: body.nextPageToken ?? null,
    resultSizeEstimate: body.resultSizeEstimate ?? messageRefs.length,
  });
}

/**
 * Pesquisa mensagens usando a sintaxe de busca do Gmail.
 * @param {string} query — Ex: "from:amazon", "subject:ANVISA", "is:important"
 * @param {number} [maxResults=20]
 * @returns {Promise<ConnectorResult>}
 */
export async function searchMessages(query, maxResults = DEFAULT_MAX_RESULTS) {
  log(`searchMessages("${query}")`);

  if (!query || !query.trim()) {
    return apiError("Query de pesquisa nao pode estar vazia.");
  }

  const conn = await requireSession();
  if (!conn) return disconnected();

  const listRes = await gmailGet("/messages", { q: query.trim(), maxResults });
  const err = handleHttpError(listRes, "searchMessages");
  if (err) return err;

  const body = await listRes.json();
  const messageRefs = body.messages ?? [];

  if (messageRefs.length === 0) {
    return ok({ messages: [], query, resultSizeEstimate: 0 });
  }

  const summaries = await Promise.all(
    messageRefs.slice(0, maxResults).map(async ({ id }) => {
      const msgRes = await gmailGet(`/messages/${id}`, { format: "metadata", metadataHeaders: "Subject,From,To" });
      if (msgRes.httpError || !msgRes.ok) return null;
      const msg = await msgRes.json();
      return normalizeSummary(msg);
    })
  );

  return ok({
    messages: summaries.filter(Boolean),
    query,
    resultSizeEstimate: body.resultSizeEstimate ?? messageRefs.length,
  });
}

/**
 * Recupera uma mensagem especifica pelo ID.
 * @param {string} messageId
 * @returns {Promise<ConnectorResult>}
 */
export async function getMessage(messageId) {
  log(`getMessage("${messageId}")`);

  if (!messageId) return apiError("messageId e obrigatorio.");

  const conn = await requireSession();
  if (!conn) return disconnected();

  const res = await gmailGet(`/messages/${messageId}`, { format: "full" });
  const err = handleHttpError(res, `getMessage(${messageId})`);
  if (err) return err;

  const msg = await res.json();
  const headers = msg.payload?.headers ?? [];

  const detail = {
    id:           msg.id,
    threadId:     msg.threadId,
    subject:      extractHeader(headers, "Subject") || "(sem assunto)",
    from:         extractHeader(headers, "From"),
    to:           extractHeader(headers, "To"),
    date:         extractHeader(headers, "Date"),
    snippet:      msg.snippet ?? "",
    internalDate: msg.internalDate ?? "",
    labelIds:     msg.labelIds ?? [],
    sizeEstimate: msg.sizeEstimate ?? 0,
  };

  return ok(detail);
}

/**
 * Lista todas as labels do usuario.
 * @returns {Promise<ConnectorResult>}
 */
export async function listLabels() {
  log("listLabels()");

  const conn = await requireSession();
  if (!conn) return disconnected();

  const res = await gmailGet("/labels");
  const err = handleHttpError(res, "listLabels");
  if (err) return err;

  const body = await res.json();
  const labels = (body.labels ?? []).map(l => ({
    id:                  l.id,
    name:                l.name,
    type:                l.type,
    messagesTotal:       l.messagesTotal ?? 0,
    messagesUnread:      l.messagesUnread ?? 0,
    threadsTotal:        l.threadsTotal ?? 0,
    threadsUnread:       l.threadsUnread ?? 0,
  }));

  return ok({ labels });
}