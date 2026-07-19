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
  // [AUDIT-PROBE][RE-01] readEmail() CALLED — if this never appears in console, function was never invoked
  console.log("[AUDIT-PROBE][RE-01]", {
    probe:     "readEmail:called",
    ts:        Date.now(),
    messageId,
    note: "If this log is absent, the entire GmailReadEmail module was never reached.",
  });

  if (!messageId || typeof messageId !== "string" || !messageId.trim()) {
    return fail("messageId e obrigatorio e deve ser uma string nao vazia.");
  }

  const conn = await ensureValidToken(WORKSPACE_ID).catch(() => null);
  if (!conn) return fail("Google Workspace nao conectado. Conecte primeiro na secao de Conectores.");

  const res = await fetchMessageFull(messageId.trim());
  // [AUDIT-PROBE][RE-02] HTTP response received from Gmail API
  console.log("[AUDIT-PROBE][RE-02]", {
    probe:     "readEmail:httpResponse",
    ts:        Date.now(),
    messageId,
    httpError: (res && res.httpError) ? res.httpError : null,
    status:    (res && typeof res.status === "number") ? res.status : "n/a",
    ok:        (res && typeof res.ok === "boolean") ? res.ok : "n/a",
    note: "httpError present → no HTTP call reached Gmail. status=200 → API responded.",
  });
  const httpErr = handleHttpError(res, messageId);
  if (httpErr) return httpErr;

  let rawMessage;
  try {
    rawMessage = await res.json();
  } catch {
    return fail("Resposta invalida da Gmail API (JSON parse error).");
  }

  // [AUDIT-PROBE][RE-03] Raw Gmail API payload structure before parsing
  console.log("[AUDIT-PROBE][RE-03]", {
    probe:          "readEmail:rawPayload",
    ts:             Date.now(),
    messageId:      rawMessage?.id,
    snippet:        rawMessage?.snippet,
    rootMimeType:   rawMessage?.payload?.mimeType,
    hasBodyData:    !!rawMessage?.payload?.body?.data,
    bodySize:       rawMessage?.payload?.body?.size ?? 0,
    partsCount:     rawMessage?.payload?.parts?.length ?? 0,
    parts:          (rawMessage?.payload?.parts ?? []).map((p, i) => ({
      index:    i,
      partId:   p.partId,
      mimeType: p.mimeType,
      bodySize: p.body?.size ?? 0,
      hasData:  !!p.body?.data,
      hasAttachmentId: !!p.body?.attachmentId,
      filename: p.filename ?? null,
      subPartsCount: p.parts?.length ?? 0,
    })),
    note: "This is the COMPLETE MIME structure from Gmail API format=full",
  });

  const result = parseGmailMessage(rawMessage);
  // [AUDIT-PROBE][RE-04] MimeParser output
  console.log("[AUDIT-PROBE][RE-04]", {
    probe:           "readEmail:parseResult",
    ts:              Date.now(),
    plainTextLen:    result.plainText?.length ?? 0,
    htmlLen:         result.html?.length ?? 0,
    attachments:     result.attachments?.length ?? 0,
    plainTextHead:   result.plainText?.slice(0, 200),
    htmlHead:        result.html?.slice(0, 200),
    mimeStructure:   result.mimeStructure,
    note: "plainTextLen===0 AND htmlLen===0 → parser found no content.",
  });
  return ok(result);
}