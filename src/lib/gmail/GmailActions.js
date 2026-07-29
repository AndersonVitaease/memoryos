/**
 * GmailActions — Implementation 010 + Multi-Account (Fase 3)
 * Capacidades de escrita do Gmail: createDraft, sendDraft, sendEmail.
 *
 * Responsabilidade unica: operacoes de composicao e envio.
 *
 * NAO gerencia autenticacao.
 * NAO abre popups.
 * NAO armazena tokens.
 * NAO implementa Reply, Forward, Attachments, Archive, Delete.
 * Separado do GmailConnector (leitura) por SRP.
 */

import { getAccessToken, ensureValidToken } from "@/lib/google-auth/GoogleAuthSession";
import { buildMime } from "@/lib/gmail/MimeBuilder";
import { getActiveWorkspaceId } from "@/lib/workspace/WorkspaceContext";

const LOG_PREFIX = "[GmailActions]";
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const WORKSPACE_ID = getActiveWorkspaceId();
const REQUEST_TIMEOUT_MS = 15000;

function log(msg) {
  if (import.meta.env.DEV) console.log(`${LOG_PREFIX} ${msg}`);
}

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

async function requireSession(workspaceId = WORKSPACE_ID) {
  const conn = await ensureValidToken(workspaceId);
  if (!conn) return null;
  const token = getAccessToken(workspaceId);
  if (!token) return null;
  return token;
}

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

export async function createDraft(req, workspaceId = WORKSPACE_ID) {
  log("createDraft()");
  const validErr = validateRequest(req);
  if (validErr) return validationError(validErr);
  const token = await requireSession(workspaceId);
  if (!token) return disconnected();
  const raw = buildMime(req);
  const res = await gmailPost("/drafts", { message: { raw } }, token);
  const err = handleHttpError(res, "createDraft");
  if (err) return err;
  const body = await res.json();
  log(`Rascunho criado: ${body.id}`);
  return ok({ id: body.id, threadId: body.message?.threadId ?? null, status: "draft" });
}

export async function sendDraft(draftId, workspaceId = WORKSPACE_ID) {
  log(`sendDraft("${draftId}")`);
  if (!draftId || !draftId.trim()) {
    return validationError("draftId e obrigatorio.");
  }
  const token = await requireSession(workspaceId);
  if (!token) return disconnected();
  const res = await gmailPost("/drafts/send", { id: draftId }, token);
  const err = handleHttpError(res, `sendDraft(${draftId})`);
  if (err) return err;
  const body = await res.json();
  log(`Rascunho enviado: ${body.id}`);
  return ok({ id: body.id, threadId: body.threadId ?? null, status: "sent" });
}

export async function sendEmail(req, workspaceId = WORKSPACE_ID) {
  log("sendEmail()");
  const validErr = validateRequest(req);
  if (validErr) return validationError(validErr);
  const token = await requireSession(workspaceId);
  if (!token) return disconnected();
  const raw = buildMime(req);
  const res = await gmailPost("/messages/send", { raw }, token);
  const err = handleHttpError(res, "sendEmail");
  if (err) return err;
  const body = await res.json();
  log(`E-mail enviado: ${body.id}`);
  return ok({ id: body.id, threadId: body.threadId ?? null, status: "sent" });
}