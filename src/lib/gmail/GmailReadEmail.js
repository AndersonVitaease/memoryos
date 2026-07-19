/**
 * GmailReadEmail.js
 *
 * SRP: fetch a single Gmail message (format=full) and parse it
 *      into a fully structured ReadEmailResult for the MemoryOS
 *      Knowledge Ingestion Pipeline.
 *
 * NOT responsible for:
 *   - Listing or searching messages (→ GmailConnector.js searchMessages / listMessages)
 *   - Authentication management (→ GoogleAuthSession.js)
 *   - MIME parsing (→ GmailMimeParser.ts)
 *
 * Separation of concerns:
 *   GmailConnector.js     → list, search, lightweight summaries
 *   GmailReadEmail.js     → full message fetch + parse (this file)
 *   GmailMimeParser.ts    → pure MIME tree parsing (no I/O)
 */

import { getAccessToken, ensureValidToken } from "@/lib/google-auth/GoogleAuthSession";
import { parseGmailMessage } from "@/lib/gmail/GmailMimeParser";

const LOG_PREFIX = "[GmailReadEmail]";
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const WORKSPACE_ID = "default";
const REQUEST_TIMEOUT_MS = 15000;

// ── Result builders ───────────────────────────────────────────────────────────

function ok(data) {
  return { ok: true, data, error: null };
}

function fail(msg) {
  return { ok: false, data: null, error: msg };
}

// ── HTTP helper (scoped to this module — no coupling to GmailConnector) ────────

async function fetchMessageFull(messageId) {
  const token = getAccessToken(WORKSPACE_ID);
  if (!token) return { httpError: "no_token" };

  const url = `${GMAIL_BASE}/messages/${encodeURIComponent(messageId)}?format=full`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    if (e.name === "AbortError") return { httpError: "timeout" };
    return { httpError: "network", message: e.message };
  }
}

function handleHttpError(res, messageId) {
  if (!res || res.httpError === "no_token") return fail("Token invalido ou expirado. Reconecte o Google Workspace.");
  if (res.httpError === "timeout")          return fail(`Timeout ao buscar mensagem ${messageId}.`);
  if (res.httpError === "network")          return fail(`Erro de rede: ${res.message}`);
  if (res.status === 401)                   return fail("Token invalido ou expirado.");
  if (res.status === 403)                   return fail("Acesso negado. Verifique os escopos do Google.");
  if (res.status === 404)                   return fail(`Mensagem nao encontrada: ${messageId}`);
  if (!res.ok)                              return fail(`Erro da Gmail API (${res.status}).`);
  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetches a single Gmail message in full MIME format and returns a
 * structured ReadEmailResult ready for Knowledge Ingestion.
 *
 * @param {string} messageId — Gmail message ID
 * @returns {Promise<{ ok: boolean, data: ReadEmailResult|null, error: string|null }>}
 */
export async function readEmail(messageId) {
  if (!messageId || typeof messageId !== "string" || !messageId.trim()) {
    return fail("messageId e obrigatorio e deve ser uma string nao vazia.");
  }

  const conn = await ensureValidToken(WORKSPACE_ID).catch(() => null);
  if (!conn) return fail("Google Workspace nao conectado. Conecte primeiro na secao de Conectores.");

  const _httpStart = Date.now();
  const res = await fetchMessageFull(messageId.trim());
  const _httpDuration = Date.now() - _httpStart;

  // ── RuntimeTrace: HTTP request step ──────────────────────────────────────
  try {
    const { runtimeTraceStore } = await import("@/lib/runtime-trace/RuntimeTraceStore");
    runtimeTraceStore.recordStep("http_request", "executed", {
      endpoint: `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      method:   "GET",
      format:   "full",
    }, _httpStart);
  } catch { /* non-blocking */ }

  const httpErr = handleHttpError(res, messageId);
  if (httpErr) return httpErr;

  let rawMessage;
  try {
    rawMessage = await res.json();
  } catch {
    return fail("Resposta invalida da Gmail API (JSON parse error).");
  }

  // ── RuntimeTrace: HTTP response + MIME payload ───────────────────────────
  try {
    const { runtimeTraceStore } = await import("@/lib/runtime-trace/RuntimeTraceStore");

    const buildMimeTree = (part, depth = 0) => {
      if (!part) return null;
      return {
        mimeType:    part.mimeType,
        partId:      part.partId,
        bodySize:    part.body?.size ?? 0,
        hasData:     !!part.body?.data,
        hasAttachmentId: !!part.body?.attachmentId,
        filename:    part.filename ?? null,
        depth,
        children:    (part.parts ?? []).map(p => buildMimeTree(p, depth + 1)),
      };
    };

    runtimeTraceStore.recordStep("http_response", "executed", {
      id:        rawMessage?.id,
      threadId:  rawMessage?.threadId,
      snippet:   rawMessage?.snippet,
      historyId: rawMessage?.historyId,
      durationMs: _httpDuration,
    });

    runtimeTraceStore.recordStep("mime_payload", "executed", {
      rootMimeType: rawMessage?.payload?.mimeType,
      hasBodyData:  !!rawMessage?.payload?.body?.data,
      bodySize:     rawMessage?.payload?.body?.size ?? 0,
      partsCount:   rawMessage?.payload?.parts?.length ?? 0,
      headers:      (rawMessage?.payload?.headers ?? []).reduce((acc, h) => {
        acc[h.name] = h.value; return acc;
      }, {}),
    });

    runtimeTraceStore.recordStep("mime_tree", "executed", {
      tree: buildMimeTree(rawMessage?.payload),
    });
  } catch { /* non-blocking */ }

  const _parseStart = Date.now();
  const result = parseGmailMessage(rawMessage);
  const _parseDuration = Date.now() - _parseStart;

  // ── RuntimeTrace: MimeParser result ──────────────────────────────────────
  try {
    const { runtimeTraceStore } = await import("@/lib/runtime-trace/RuntimeTraceStore");
    runtimeTraceStore.recordStep("mime_parser_result", result.plainText || result.html ? "executed" : "error", {
      plainTextLen:  result.plainText?.length ?? 0,
      htmlLen:       result.html?.length ?? 0,
      attachments:   result.attachments?.length ?? 0,
      plainText:     result.plainText,
      html:          result.html,
      subject:       result.subject,
      from:          result.from,
      to:            result.to,
      date:          result.date,
      mimeStructure: result.mimeStructure,
      durationMs:    _parseDuration,
    }, _parseStart, (!result.plainText && !result.html) ? "No text/plain or text/html found" : undefined);
  } catch { /* non-blocking */ }

  return ok(result);
}