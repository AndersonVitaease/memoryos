/**
 * MimeBuilder — Engineering Sprint E-01
 * Modulo centralizado para construcao de mensagens MIME para a Gmail API.
 *
 * Responsabilidade unica: construir strings MIME base64url.
 * Reutilizado por GmailActions e GmailAdvanced.
 * Sem dependencias externas.
 */

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
    `Subject: ${subject ?? ""}`,
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