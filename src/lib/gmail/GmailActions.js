/**
 * GmailActions — Implementation 010
 * Capacidades de escrita do Gmail: createDraft, sendDraft, sendEmail.
 *
 * Responsabilidade unica: operacoes de composicao e envio.
 *
 * NAO gerencia autenticacao.
 * NAO abre popups.
 * NAO armazena tokens.
 * NAO implementa Reply, Forward, Attachments, Archive, Delete.
 * Separado do GmailConnector (leitura) por SRP.
 *
 * SEGURANCA: sendEmail e sendDraft NUNCA devem ser chamados sem
 * confirmacao explicita do usuario na camada de UI/Runtime.
 */

import { getAccessToken, ensureValidToken } from "@/lib/google-auth/GoogleAuthSession";

const LOG_PREFIX = "[GmailActions]";
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const WORKSPACE_ID = "default";
const REQUEST_TIMEOUT_MS = 15000;

function log(msg) {
  if (import.meta.env.DEV) console.log(`${LOG_PREFIX} ${msg}`);
}

// ── Result builders ───────────────────────────────────────────────────────────

function ok(data) {
  return { ok: true, data, error: null, status: "success" };
}

function disconnected(msg = "Google Workspace nao conectado. Conecte primeiro na secao de Conectores.") {
  return { ok: false, data: null, error: msg, status: "disconnected" };
}

function expired(msg = "Token invalido ou expirado. Reconecte o Google Workspace.") {
  return { ok: false, data: null, error: msg, status: "expired" };
}

function validationError(msg) {
  return { ok: false, data: null, error: msg, status: "validation_error" };
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

// ── MIME builder ──────────────────────────────────────────────────────────────

/**
 * Constroi uma mensagem MIME em base64url para a Gmail API.
 * @param {Object} req
 * @param {string[]} req.to
 * @param {string[]} [req.cc]
 * @param {string[]} [req.bcc]
 * @param {string} req.subject
 * @param {string} req.body
 * @param {boolean} [req.isHtml]
 * @returns {string} base64url encoded MIME message
 */
function buildMime({ to, cc, bcc, subject, body, isHtml = false }) {
  const contentType = isHtml ? "text/html" : "text/plain";
  const lines = [
    `To: ${to.join(", ")}`,
    cc?.length  ? `Cc: ${cc.join(", ")}`   : null,
    bcc?.length ? `Bcc: ${bcc.join(", ")}` : null,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: ${contentType}; charset=UTF-8`,
    ``,
    body,
  ].filter(l => l !== null);

  const raw = lines.join("\r\n");
  // btoa with unicode support
  return btoa(unescape(encodeURIComponent(raw)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateRequest(req) {
  if (!req.to || !Array.isArray(req.to) || req.to.length === 0) {
    return "Campo 'to' e obrigatorio e deve conter pelo menos um destinatario.";
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const addr of req.to) {
    if (!emailRegex.test(addr.trim())) {
      return `Endereco de e-mail invalido: "${addr}"`;
    }
  }
  if (!req.subject || !req.subject.trim()) {
    return "Assunto e obrigatorio.";
  }
  if (!req.body || !req.body.trim()) {
    return "Corpo da mensagem e obrigatorio.";
  }
  return null;
}

// ── HTTP POST helper ──────────────────────────────────────────────────────────

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

function handleHttpError(res, context) {
  if (!res || res.httpError === "no_token") return expired();
  if (res.httpError === "timeout") return apiError(`Timeout ao acessar Gmail (${context}).`);
  if (res.httpError === "network") return apiError(`Erro de rede: ${res.message}`);
  if (res.status === 401) return expired();
  if (res.status === 403) return apiError("Acesso negado ao Gmail. Verifique os escopos autorizados.");
  if (res.status === 404) return apiError(`Rascunho nao encontrado (${context}).`);
  if (!res.ok) return apiError(`Erro da API Gmail (${res.status}) em ${context}.`);
  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Cria um rascunho no Gmail.
 *
 * @param {Object} req
 * @param {string[]} req.to
 * @param {string[]} [req.cc]
 * @param {string[]} [req.bcc]
 * @param {string} req.subject
 * @param {string} req.body
 * @param {boolean} [req.isHtml]
 * @returns {Promise<ActionResult>}
 */
export async function createDraft(req) {
  log("createDraft()");

  const validErr = validateRequest(req);
  if (validErr) return validationError(validErr);

  const token = await requireSession();
  if (!token) return disconnected();

  const raw = buildMime(req);
  const res = await gmailPost("/drafts", { message: { raw } }, token);

  const err = handleHttpError(res, "createDraft");
  if (err) return err;

  const body = await res.json();
  log(`Rascunho criado: ${body.id}`);

  return ok({
    id:       body.id,
    threadId: body.message?.threadId ?? null,
    status:   "draft",
  });
}

/**
 * Envia um rascunho existente pelo ID.
 *
 * ATENCAO: Exigir confirmacao do usuario ANTES de chamar este metodo.
 *
 * @param {string} draftId
 * @returns {Promise<ActionResult>}
 */
export async function sendDraft(draftId) {
  log(`sendDraft("${draftId}")`);

  if (!draftId || !draftId.trim()) {
    return validationError("draftId e obrigatorio.");
  }

  const token = await requireSession();
  if (!token) return disconnected();

  const res = await gmailPost("/drafts/send", { id: draftId }, token);

  const err = handleHttpError(res, `sendDraft(${draftId})`);
  if (err) return err;

  const body = await res.json();
  log(`Rascunho enviado: ${body.id}`);

  return ok({
    id:       body.id,
    threadId: body.threadId ?? null,
    status:   "sent",
  });
}

/**
 * Envia um e-mail diretamente (sem criar rascunho).
 *
 * ATENCAO: Exigir confirmacao do usuario ANTES de chamar este metodo.
 * Nunca chamar automaticamente sem acao explicita do usuario.
 *
 * @param {Object} req - mesmo formato de createDraft()
 * @returns {Promise<ActionResult>}
 */
export async function sendEmail(req) {
  log("sendEmail()");

  const validErr = validateRequest(req);
  if (validErr) return validationError(validErr);

  const token = await requireSession();
  if (!token) return disconnected();

  const raw = buildMime(req);
  const res = await gmailPost("/messages/send", { raw }, token);

  const err = handleHttpError(res, "sendEmail");
  if (err) return err;

  const body = await res.json();
  log(`E-mail enviado: ${body.id}`);

  return ok({
    id:       body.id,
    threadId: body.threadId ?? null,
    status:   "sent",
  });
}