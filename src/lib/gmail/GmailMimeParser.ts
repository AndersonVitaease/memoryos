/**
 * GmailMimeParser.ts
 *
 * SRP: parse a Gmail API message payload (format=full) into a structured
 *      ReadEmailResult without performing any network calls.
 *
 * Responsibilities:
 *   - Decode Base64URL body parts
 *   - Walk the full MIME tree recursively
 *   - Extract text/plain, text/html, and attachment metadata
 *   - Normalize all standard headers into typed fields
 *
 * NOT responsible for:
 *   - HTTP requests
 *   - Authentication
 *   - Gmail API calls
 *   - HTML-to-text conversion (stripped to plain whitespace only when no
 *     text/plain is available — avoids external dependency)
 */

// ── Public types ──────────────────────────────────────────────────────────────

export interface AttachmentInfo {
  readonly filename:     string;
  readonly mimeType:     string;
  readonly size:         number;
  readonly attachmentId: string;
}

export interface MimeNode {
  readonly mimeType:  string;
  readonly children:  readonly MimeNode[];
  readonly hasBody:   boolean;
  readonly bodySize:  number;
}

export interface ReadEmailResult {
  readonly id:           string;
  readonly threadId:     string;
  readonly subject:      string;
  readonly from:         string;
  readonly to:           string;
  readonly cc:           string;
  readonly bcc:          string;
  readonly replyTo:      string;
  readonly date:         string;
  readonly plainText:    string;
  readonly html:         string;
  readonly attachments:  readonly AttachmentInfo[];
  readonly headers:      Readonly<Record<string, string>>;
  readonly mimeStructure: MimeNode;
}

// ── Internal types (Gmail API shapes) ─────────────────────────────────────────

interface GmailHeader {
  name:  string;
  value: string;
}

interface GmailBody {
  attachmentId?: string;
  size:          number;
  data?:         string;
}

interface GmailPart {
  partId:   string;
  mimeType: string;
  filename?: string;
  headers?: GmailHeader[];
  body:     GmailBody;
  parts?:   GmailPart[];
}

interface GmailMessage {
  id:          string;
  threadId:    string;
  payload:     GmailPart;
  snippet?:    string;
  internalDate?: string;
}

// ── Base64URL decoder ─────────────────────────────────────────────────────────

/**
 * Decodes a Base64URL-encoded string (Gmail uses URL-safe Base64 with no padding).
 * Works in both browser (atob) and test environments.
 */
function decodeBase64Url(encoded: string): string {
  if (!encoded) return "";

  // Convert Base64URL → standard Base64
  const base64 = encoded
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(encoded.length + (4 - (encoded.length % 4)) % 4, "=");

  try {
    // Browser environment
    if (typeof atob !== "undefined") {
      const binary = atob(base64);
      // Decode UTF-8 bytes from the binary string
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new TextDecoder("utf-8").decode(bytes);
    }
    // Node / test environment
    return Buffer.from(base64, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

// ── Header extraction ─────────────────────────────────────────────────────────

function extractHeader(headers: GmailHeader[], name: string): string {
  return headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function buildHeaderMap(headers: GmailHeader[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const h of (headers ?? [])) {
    map[h.name] = h.value;
  }
  return map;
}

// ── MIME tree walker ──────────────────────────────────────────────────────────

interface WalkAccumulator {
  plainParts: string[];
  htmlParts:  string[];
  attachments: AttachmentInfo[];
}

function walkPart(part: GmailPart, acc: WalkAccumulator): MimeNode {
  const mimeType = (part.mimeType ?? "").toLowerCase();
  const children: MimeNode[] = [];

  // Multipart containers — recurse into sub-parts
  if (mimeType.startsWith("multipart/") && Array.isArray(part.parts)) {
    for (const child of part.parts) {
      children.push(walkPart(child, acc));
    }
    return {
      mimeType,
      children,
      hasBody:  false,
      bodySize: 0,
    };
  }

  // Attachment — identified by filename or Content-Disposition: attachment
  const filename    = part.filename ?? "";
  const disposition = extractHeader(part.headers ?? [], "Content-Disposition");
  const isAttachment =
    !!filename ||
    disposition.toLowerCase().includes("attachment") ||
    !!part.body?.attachmentId;

  if (isAttachment) {
    acc.attachments.push({
      filename:     filename || "(sem nome)",
      mimeType:     part.mimeType,
      size:         part.body?.size ?? 0,
      attachmentId: part.body?.attachmentId ?? "",
    });
    return {
      mimeType,
      children: [],
      hasBody:  false,
      bodySize: part.body?.size ?? 0,
    };
  }

  // Text bodies
  const rawData = part.body?.data ?? "";
  const bodySize = part.body?.size ?? 0;

  if (mimeType === "text/plain") {
    const decoded = decodeBase64Url(rawData);
    if (decoded) acc.plainParts.push(decoded);
    return { mimeType, children: [], hasBody: !!rawData, bodySize };
  }

  if (mimeType === "text/html") {
    const decoded = decodeBase64Url(rawData);
    if (decoded) acc.htmlParts.push(decoded);
    return { mimeType, children: [], hasBody: !!rawData, bodySize };
  }

  // Any other leaf (e.g. application/*, image/inline without filename)
  return { mimeType, children: [], hasBody: !!rawData, bodySize };
}

// ── HTML → plain text (minimal, no dependency) ────────────────────────────────

function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Public parser ─────────────────────────────────────────────────────────────

/**
 * Parses a raw Gmail API message (format=full) into a structured ReadEmailResult.
 * Pure function — no side effects, no I/O.
 *
 * @param rawMessage — The raw JSON object returned by Gmail API messages.get
 * @returns ReadEmailResult
 */
export function parseGmailMessage(rawMessage: GmailMessage): ReadEmailResult {
  const payload  = rawMessage.payload ?? {} as GmailPart;
  const headers  = payload.headers ?? [];
  const acc: WalkAccumulator = { plainParts: [], htmlParts: [], attachments: [] };

  // Walk the complete MIME tree
  const mimeStructure = walkPart(payload, acc);

  // If the root payload itself has body data (single-part message)
  // walkPart handles text/plain and text/html at the root level above,
  // but if the root has no mimeType set at all, check body.data directly
  if (!payload.mimeType && payload.body?.data && acc.plainParts.length === 0) {
    acc.plainParts.push(decodeBase64Url(payload.body.data));
  }

  // Determine plainText: prefer explicit text/plain; fallback to HTML→text
  let plainText = acc.plainParts.join("\n\n").trim();
  const html    = acc.htmlParts.join("\n").trim();

  if (!plainText && html) {
    plainText = htmlToPlainText(html);
  }

  return Object.freeze({
    id:            rawMessage.id ?? "",
    threadId:      rawMessage.threadId ?? "",
    subject:       extractHeader(headers, "Subject") || "",
    from:          extractHeader(headers, "From"),
    to:            extractHeader(headers, "To"),
    cc:            extractHeader(headers, "Cc"),
    bcc:           extractHeader(headers, "Bcc"),
    replyTo:       extractHeader(headers, "Reply-To"),
    date:          extractHeader(headers, "Date"),
    plainText,
    html,
    attachments:   Object.freeze(acc.attachments),
    headers:       Object.freeze(buildHeaderMap(headers)),
    mimeStructure: Object.freeze(mimeStructure),
  });
}