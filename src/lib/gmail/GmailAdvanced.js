/**
 * GmailAdvanced — Implementation 011
 * Capacidades avancadas de comunicacao do Gmail.
 *
 * Responsabilidade unica: reply, replyAll, forward e rascunhos derivados.
 *
 * NAO gerencia autenticacao.
 * NAO armazena tokens.
 * NAO implementa Delete, Trash, Archive, Labels, Attachments.
 * Separado de GmailActions (composicao simples) por SRP.
 *
 * SEGURANCA: replyEmail, replyAll e forwardEmail NUNCA devem ser
 * chamados sem confirmacao via RuntimeConfirmationEngine.
 * createReplyDraft e createForwardDraft nao exigem confirmacao.
 */

import { getAccessToken, ensureValidToken } from "@/lib/google-auth/GoogleAuthSession";
import { buildMime } from "@/lib/gmail/MimeBuilder";
import { getActiveWorkspaceId } from "@/lib/workspace/WorkspaceContext";

const LOG_PREFIX = "[GmailAdvanced]";
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const WORKSPACE_ID = getActiveWorkspaceId();
const REQUEST_TIMEOUT_MS = 15000;

function log(msg) {
  if (import.meta.env.DEV) console.log(`${LOG_PREFIX} ${msg}`);
}

// ── Result builders ───────────────────────────────────────────────────────────

function ok(data) {
  return { ok: true, data, error: null, status: "success" };
}

function disconnected(msg = "Google Workspace nao conectado.") {
  return { ok: false, data: null, error: msg, status: "disconnected" };
}

function expired(msg = "Token invalido ou expirado. Reconecte o Google Workspace.") {
  return { ok: false, data: null, error: msg, status: "expired" };
}

function validationError(msg) {
  return { ok: false, data: null, error: msg, status: "validation_error" };
}

function notFound(msg) {
  return { ok: false, data: null, error: msg, status: "not_found" };
}

function apiError(msg) {
  return { ok: false, data: null, error: msg, status: "error" };
}

// ── Session guard ─────────────────────────────────────────────────────────────

async function requireSession() {
  const conn = await ensureValidToken(WORKSPACE_ID);
  if (!conn) return null;
  const token = getAccessToken(WORKSPACE_ID);
  if (!token) return null;
  return token;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function gmailGet(path, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${GMAIL_BASE}${path}`, {
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

async function gmailPost(path, bodyObj, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${GMAIL_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bodyObj),
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

function decodeHttpError(res, context) {
  if (!res || res.httpError === "timeout") return apiError(`Timeout ao acessar Gmail (${context}).`);
  if (res.httpError === "network") return apiError(`Erro de rede: ${res.message}`);
  if (res.status === 401) return expired();
  if (res.status === 403) return apiError("Acesso negado ao Gmail. Verifique os escopos.");
  if (res.status === 404) return notFound(`Mensagem ou thread nao encontrada (${context}).`);
  if (!res.ok) return apiError(`Erro da API Gmail (${res.status}) em ${context}.`);
  return null;
}

// ── Message metadata fetcher ──────────────────────────────────────────────────

async function fetchMessageMeta(messageId, token) {
  const fields = ["From", "To", "Cc", "Subject", "Message-ID", "References"]
    .map(h => `metadataHeaders=${h}`)
    .join("&");
  const res = await gmailGet(`/messages/${messageId}?format=metadata&${fields}`, token);
  const err = decodeHttpError(res, `fetchMessageMeta(${messageId})`);
  if (err) return { error: err };

  const body = await res.json();
  const headers = body.payload?.headers ?? [];
  const h = (name) => headers.find(x => x.name.toLowerCase() === name.toLowerCase())?.value ?? "";

  return {
    threadId:   body.threadId,
    from:       h("From"),
    to:         h("To"),
    cc:         h("Cc"),
    subject:    h("Subject"),
    messageId:  h("Message-ID"),
    references: h("References"),
  };
}

// ── Address parser ────────────────────────────────────────────────────────────

function parseAddresses(raw) {
  if (!raw) return [];
  return raw.split(",").map(s => {
    const m = s.match(/<([^>]+)>/);
    return (m ? m[1] : s).trim();
  }).filter(Boolean);
}

// ── Validation helpers ────────────────────────────────────────────────────────

function validateMessageId(messageId) {
  if (!messageId || !String(messageId).trim()) return "messageId e obrigatorio.";
  return null;
}

function validateRecipients(recipients) {
  if (!Array.isArray(recipients) || recipients.length === 0)
    return "recipients deve conter pelo menos um destinatario.";
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const addr of recipients) {
    if (!re.test(addr.trim())) return `Endereco invalido: "${addr}"`;
  }
  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Responde uma mensagem.
 * ATENCAO: exigir confirmacao via RuntimeConfirmationEngine antes de chamar.
 */
export async function replyEmail({ messageId, body, replyAll = false } = {}) {
  log(`replyEmail("${messageId}", replyAll=${replyAll})`);

  const v = validateMessageId(messageId);
  if (v) return validationError(v);
  if (!body?.trim()) return validationError("body e obrigatorio.");

  const token = await requireSession();
  if (!token) return disconnected();

  const meta = await fetchMessageMeta(messageId, token);
  if (meta.error) return meta.error;

  const replyTo = parseAddresses(meta.from);
  const ccList  = replyAll
    ? parseAddresses(meta.to + "," + meta.cc).filter(a => !replyTo.includes(a))
    : [];
  const subject = meta.subject.startsWith("Re:") ? meta.subject : `Re: ${meta.subject}`;
  const refs    = [meta.references, meta.messageId].filter(Boolean).join(" ");

  const raw = buildMime({ to: replyTo, cc: ccList, subject, body, inReplyTo: meta.messageId, references: refs });
  const res = await gmailPost("/messages/send", { raw, threadId: meta.threadId }, token);

  const err = decodeHttpError(res, "replyEmail");
  if (err) return err;

  const sent = await res.json();
  log(`Reply enviado: ${sent.id}`);
  return ok({ id: sent.id, threadId: sent.threadId ?? meta.threadId, status: "sent" });
}

/**
 * Responde para todos.
 * ATENCAO: exigir confirmacao via RuntimeConfirmationEngine antes de chamar.
 */
export async function replyAll({ messageId, body } = {}) {
  return replyEmail({ messageId, body, replyAll: true });
}

/**
 * Encaminha uma mensagem para novos destinatarios.
 * ATENCAO: exigir confirmacao via RuntimeConfirmationEngine antes de chamar.
 */
export async function forwardEmail({ messageId, recipients, body = "" } = {}) {
  log(`forwardEmail("${messageId}")`);

  const vm = validateMessageId(messageId);
  if (vm) return validationError(vm);
  const vr = validateRecipients(recipients);
  if (vr) return validationError(vr);

  const token = await requireSession();
  if (!token) return disconnected();

  const meta = await fetchMessageMeta(messageId, token);
  if (meta.error) return meta.error;

  const subject  = meta.subject.startsWith("Fwd:") ? meta.subject : `Fwd: ${meta.subject}`;
  const fwdBody  = [
    body,
    "---------- Mensagem encaminhada ----------",
    `De: ${meta.from}`,
    `Assunto: ${meta.subject}`,
  ].filter(Boolean).join("\n\n");

  const raw = buildMime({ to: recipients, subject, body: fwdBody });
  const res = await gmailPost("/messages/send", { raw }, token);

  const err = decodeHttpError(res, "forwardEmail");
  if (err) return err;

  const sent = await res.json();
  log(`Forward enviado: ${sent.id}`);
  return ok({ id: sent.id, threadId: sent.threadId ?? null, status: "sent" });
}

/**
 * Cria rascunho de resposta (sem confirmacao obrigatoria).
 */
export async function createReplyDraft({ messageId, body, replyAll: all = false } = {}) {
  log(`createReplyDraft("${messageId}")`);

  const v = validateMessageId(messageId);
  if (v) return validationError(v);
  if (!body?.trim()) return validationError("body e obrigatorio.");

  const token = await requireSession();
  if (!token) return disconnected();

  const meta = await fetchMessageMeta(messageId, token);
  if (meta.error) return meta.error;

  const replyTo = parseAddresses(meta.from);
  const ccList  = all
    ? parseAddresses(meta.to + "," + meta.cc).filter(a => !replyTo.includes(a))
    : [];
  const subject = meta.subject.startsWith("Re:") ? meta.subject : `Re: ${meta.subject}`;
  const refs    = [meta.references, meta.messageId].filter(Boolean).join(" ");

  const raw = buildMime({ to: replyTo, cc: ccList, subject, body, inReplyTo: meta.messageId, references: refs });
  const res = await gmailPost("/drafts", { message: { raw, threadId: meta.threadId } }, token);

  const err = decodeHttpError(res, "createReplyDraft");
  if (err) return err;

  const draft = await res.json();
  log(`Reply draft criado: ${draft.id}`);
  return ok({ id: draft.id, threadId: meta.threadId, status: "draft" });
}

/**
 * Cria rascunho de encaminhamento (sem confirmacao obrigatoria).
 */
export async function createForwardDraft({ messageId, recipients, body = "" } = {}) {
  log(`createForwardDraft("${messageId}")`);

  const vm = validateMessageId(messageId);
  if (vm) return validationError(vm);
  const vr = validateRecipients(recipients);
  if (vr) return validationError(vr);

  const token = await requireSession();
  if (!token) return disconnected();

  const meta = await fetchMessageMeta(messageId, token);
  if (meta.error) return meta.error;

  const subject = meta.subject.startsWith("Fwd:") ? meta.subject : `Fwd: ${meta.subject}`;
  const fwdBody = [
    body,
    "---------- Mensagem encaminhada ----------",
    `De: ${meta.from}`,
    `Assunto: ${meta.subject}`,
  ].filter(Boolean).join("\n\n");

  const raw = buildMime({ to: recipients, subject, body: fwdBody });
  const res = await gmailPost("/drafts", { message: { raw } }, token);

  const err = decodeHttpError(res, "createForwardDraft");
  if (err) return err;

  const draft = await res.json();
  log(`Forward draft criado: ${draft.id}`);
  return ok({ id: draft.id, threadId: null, status: "draft" });
}