/**
 * MimeBuilder — Engineering Sprint E-01
 * Modulo centralizado para construcao de mensagens MIME para a Gmail API.
 *
 * Responsabilidade unica: construir strings MIME base64url.
 * Reutilizado por GmailActions e GmailAdvanced.
 * Sem dependencias externas.
 */

/**
 * Codifica um cabeçalho de e-mail (ex: Subject) conforme RFC 2047 quando
 * contém caracteres não-ASCII (acentos, ç, ã, etc.). Sem isso, um
 * assunto como "Reunião amanhã" vira um cabeçalho tecnicamente
 * malformado — alguns servidores de e-mail mais rígidos podem rejeitar
 * ou exibir errado. Texto puramente ASCII passa direto, sem alteração.
 */
function encodeHeaderIfNeeded(text) {
  if (!text) return text;
  if (/^[\x00-\x7F]*$/.test(text)) return text;
  const base64 = btoa(unescape(encodeURIComponent(text)));
  return `=?UTF-8?B?${base64}?=`;
}

/**
 * Constroi uma mensagem MIME em base64url para a Gmail API.
 *
 * @param {Object} opts
 * @param {string[]} opts.to
 * @param {string[]} [opts.cc]
 * @param {string[]} [opts.bcc]
 * @param {string} opts.subject
 * @param {string} opts.body
 * @param {boolean} [opts.isHtml]
 * @param {string} [opts.inReplyTo]   - Message-ID da mensagem original (para threading)
 * @param {string} [opts.references]  - References header (para threading)
 * @returns {string} base64url encoded MIME message
 */
export function buildMime({ to, cc, bcc, subject, body, isHtml = false, inReplyTo, references }) {
  const contentType = isHtml ? "text/html" : "text/plain";
  const lines = [
    `To: ${(to ?? []).join(", ")}`,
    cc?.length  ? `Cc: ${cc.join(", ")}`   : null,
    bcc?.length ? `Bcc: ${bcc.join(", ")}` : null,
    `Subject: ${encodeHeaderIfNeeded(subject ?? "")}`,
    inReplyTo  ? `In-Reply-To: ${inReplyTo}`  : null,
    references ? `References: ${references}` : null,
    `MIME-Version: 1.0`,
    `Content-Type: ${contentType}; charset=UTF-8`,
    ``,
    body ?? "",
  ].filter(l => l !== null);

  const raw = lines.join("\r\n");
  return btoa(unescape(encodeURIComponent(raw)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
