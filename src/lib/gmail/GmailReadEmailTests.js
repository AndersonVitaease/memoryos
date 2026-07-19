/**
 * GmailReadEmailTests.js
 *
 * Unit tests for GmailMimeParser.ts — pure function, no network calls.
 *
 * All tests run against parseGmailMessage() directly, using synthetic
 * Gmail API payloads that mirror the real API format=full structure.
 *
 * Coverage:
 *   T01 — text/plain only
 *   T02 — text/html only (fallback to stripped plain)
 *   T03 — multipart/alternative (plain + html)
 *   T04 — multipart/mixed with attachment
 *   T05 — attachment metadata extraction
 *   T06 — email without subject
 *   T07 — email without sender
 *   T08 — multiple recipients (To, Cc, Bcc)
 *   T09 — HTML + PlainText present (plain preferred)
 *   T10 — nested multipart/related inside multipart/mixed
 */

import { parseGmailMessage } from "@/lib/gmail/GmailMimeParser";

// ── Base64URL encoder helper (for building test fixtures) ─────────────────────

function encodeBase64Url(text) {
  const base64 = btoa(unescape(encodeURIComponent(text)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// ── Test runner ───────────────────────────────────────────────────────────────

const results = [];

function test(name, fn) {
  try {
    fn();
    results.push({ name, passed: true, error: null });
  } catch (e) {
    results.push({ name, passed: false, error: e.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function assertEqual(actual, expected, field) {
  if (actual !== expected) {
    throw new Error(`${field}: expected "${expected}", got "${actual}"`);
  }
}

// ── Fixture builders ──────────────────────────────────────────────────────────

function headers(map) {
  return Object.entries(map).map(([name, value]) => ({ name, value }));
}

function body(text) {
  return { size: text.length, data: encodeBase64Url(text) };
}

function emptyBody() {
  return { size: 0 };
}

// ── T01 — text/plain only ─────────────────────────────────────────────────────

test("T01 — text/plain only", () => {
  const msg = {
    id: "msg-001",
    threadId: "thr-001",
    payload: {
      mimeType: "text/plain",
      headers: headers({
        Subject: "Hello World",
        From: "alice@example.com",
        To: "bob@example.com",
        Date: "Mon, 1 Jan 2024 10:00:00 +0000",
      }),
      body: body("This is plain text content."),
    },
  };

  const result = parseGmailMessage(msg);
  assertEqual(result.id, "msg-001", "id");
  assertEqual(result.subject, "Hello World", "subject");
  assertEqual(result.from, "alice@example.com", "from");
  assertEqual(result.to, "bob@example.com", "to");
  assert(result.plainText.includes("This is plain text content."), "plainText content");
  assertEqual(result.html, "", "html should be empty");
  assertEqual(result.attachments.length, 0, "no attachments");
  assertEqual(result.mimeStructure.mimeType, "text/plain", "mimeStructure.mimeType");
});

// ── T02 — text/html only (fallback conversion) ────────────────────────────────

test("T02 — text/html only (plain fallback from HTML)", () => {
  const htmlContent = "<html><body><p>Hello from HTML</p><br/>Line 2</body></html>";
  const msg = {
    id: "msg-002",
    threadId: "thr-002",
    payload: {
      mimeType: "text/html",
      headers: headers({
        Subject: "HTML Only Email",
        From: "sender@example.com",
        To: "recipient@example.com",
      }),
      body: body(htmlContent),
    },
  };

  const result = parseGmailMessage(msg);
  assertEqual(result.html, htmlContent, "html field should contain raw HTML");
  assert(result.plainText.length > 0, "plainText should be derived from HTML");
  assert(result.plainText.includes("Hello from HTML"), "plainText should contain visible text");
  assert(!result.plainText.includes("<p>"), "plainText should not contain HTML tags");
});

// ── T03 — multipart/alternative (plain preferred) ─────────────────────────────

test("T03 — multipart/alternative with plain and html", () => {
  const msg = {
    id: "msg-003",
    threadId: "thr-003",
    payload: {
      mimeType: "multipart/alternative",
      headers: headers({ Subject: "Alt Email", From: "a@b.com", To: "c@d.com" }),
      body: emptyBody(),
      parts: [
        {
          partId: "0",
          mimeType: "text/plain",
          headers: [],
          body: body("Plain text version."),
        },
        {
          partId: "1",
          mimeType: "text/html",
          headers: [],
          body: body("<p>HTML version.</p>"),
        },
      ],
    },
  };

  const result = parseGmailMessage(msg);
  assert(result.plainText.includes("Plain text version."), "plainText from text/plain part");
  assert(result.html.includes("<p>HTML version.</p>"), "html from text/html part");
  assertEqual(result.mimeStructure.mimeType, "multipart/alternative", "root mimeType");
  assertEqual(result.mimeStructure.children.length, 2, "two children");
});

// ── T04 — multipart/mixed with text body ──────────────────────────────────────

test("T04 — multipart/mixed with text and no attachment body data", () => {
  const msg = {
    id: "msg-004",
    threadId: "thr-004",
    payload: {
      mimeType: "multipart/mixed",
      headers: headers({ Subject: "Mixed Email", From: "a@b.com", To: "c@d.com" }),
      body: emptyBody(),
      parts: [
        {
          partId: "0",
          mimeType: "text/plain",
          headers: [],
          body: body("Body of mixed email."),
        },
      ],
    },
  };

  const result = parseGmailMessage(msg);
  assert(result.plainText.includes("Body of mixed email."), "plainText extracted from mixed");
  assertEqual(result.mimeStructure.mimeType, "multipart/mixed", "root mimeType");
});

// ── T05 — attachment metadata extraction ─────────────────────────────────────

test("T05 — attachment metadata extracted correctly", () => {
  const msg = {
    id: "msg-005",
    threadId: "thr-005",
    payload: {
      mimeType: "multipart/mixed",
      headers: headers({ Subject: "Email with Attachment", From: "a@b.com", To: "c@d.com" }),
      body: emptyBody(),
      parts: [
        {
          partId: "0",
          mimeType: "text/plain",
          headers: [],
          body: body("See attached file."),
        },
        {
          partId: "1",
          mimeType: "application/pdf",
          filename: "report.pdf",
          headers: [{ name: "Content-Disposition", value: "attachment; filename=\"report.pdf\"" }],
          body: {
            attachmentId: "attach-abc123",
            size: 204800,
          },
        },
      ],
    },
  };

  const result = parseGmailMessage(msg);
  assertEqual(result.attachments.length, 1, "one attachment");
  assertEqual(result.attachments[0].filename, "report.pdf", "attachment filename");
  assertEqual(result.attachments[0].mimeType, "application/pdf", "attachment mimeType");
  assertEqual(result.attachments[0].attachmentId, "attach-abc123", "attachment id");
  assertEqual(result.attachments[0].size, 204800, "attachment size");
  assert(result.plainText.includes("See attached file."), "plainText still extracted");
});

// ── T06 — email without subject ───────────────────────────────────────────────

test("T06 — email without subject header returns empty string", () => {
  const msg = {
    id: "msg-006",
    threadId: "thr-006",
    payload: {
      mimeType: "text/plain",
      headers: headers({ From: "a@b.com", To: "c@d.com" }),
      body: body("No subject here."),
    },
  };

  const result = parseGmailMessage(msg);
  assertEqual(result.subject, "", "subject should be empty string when absent");
  assertEqual(result.id, "msg-006", "id preserved");
});

// ── T07 — email without sender ────────────────────────────────────────────────

test("T07 — email without From header returns empty string", () => {
  const msg = {
    id: "msg-007",
    threadId: "thr-007",
    payload: {
      mimeType: "text/plain",
      headers: headers({ Subject: "No Sender", To: "c@d.com" }),
      body: body("Sent without from."),
    },
  };

  const result = parseGmailMessage(msg);
  assertEqual(result.from, "", "from should be empty string when absent");
  assertEqual(result.subject, "No Sender", "subject preserved");
});

// ── T08 — multiple recipients ─────────────────────────────────────────────────

test("T08 — To, Cc, Bcc all extracted", () => {
  const msg = {
    id: "msg-008",
    threadId: "thr-008",
    payload: {
      mimeType: "text/plain",
      headers: headers({
        Subject: "Multi Recipient",
        From: "boss@corp.com",
        To: "employee1@corp.com, employee2@corp.com",
        Cc: "manager@corp.com",
        Bcc: "archive@corp.com",
        "Reply-To": "noreply@corp.com",
      }),
      body: body("Multi-recipient email."),
    },
  };

  const result = parseGmailMessage(msg);
  assert(result.to.includes("employee1@corp.com"), "to field contains first recipient");
  assert(result.to.includes("employee2@corp.com"), "to field contains second recipient");
  assertEqual(result.cc, "manager@corp.com", "cc extracted");
  assertEqual(result.bcc, "archive@corp.com", "bcc extracted");
  assertEqual(result.replyTo, "noreply@corp.com", "replyTo extracted");
});

// ── T09 — both HTML and PlainText present: plain preferred ────────────────────

test("T09 — plainText preferred over HTML when both present", () => {
  const msg = {
    id: "msg-009",
    threadId: "thr-009",
    payload: {
      mimeType: "multipart/alternative",
      headers: headers({ Subject: "Both", From: "a@b.com", To: "c@d.com" }),
      body: emptyBody(),
      parts: [
        {
          partId: "0",
          mimeType: "text/plain",
          headers: [],
          body: body("EXPLICIT PLAIN TEXT"),
        },
        {
          partId: "1",
          mimeType: "text/html",
          headers: [],
          body: body("<p>HTML version which should NOT be the plainText source.</p>"),
        },
      ],
    },
  };

  const result = parseGmailMessage(msg);
  // plainText must come from the text/plain part, not from HTML conversion
  assertEqual(result.plainText, "EXPLICIT PLAIN TEXT", "plainText comes from text/plain part");
  assert(result.html.includes("<p>HTML version"), "html is preserved separately");
});

// ── T10 — nested multipart/related inside multipart/mixed ────────────────────

test("T10 — nested multipart/related inside multipart/mixed", () => {
  const msg = {
    id: "msg-010",
    threadId: "thr-010",
    payload: {
      mimeType: "multipart/mixed",
      headers: headers({ Subject: "Nested", From: "a@b.com", To: "c@d.com" }),
      body: emptyBody(),
      parts: [
        {
          partId: "0",
          mimeType: "multipart/alternative",
          headers: [],
          body: emptyBody(),
          parts: [
            {
              partId: "0.0",
              mimeType: "text/plain",
              headers: [],
              body: body("Nested plain text."),
            },
            {
              partId: "0.1",
              mimeType: "multipart/related",
              headers: [],
              body: emptyBody(),
              parts: [
                {
                  partId: "0.1.0",
                  mimeType: "text/html",
                  headers: [],
                  body: body("<p>Nested HTML.</p>"),
                },
                {
                  partId: "0.1.1",
                  mimeType: "image/png",
                  filename: "logo.png",
                  headers: [{ name: "Content-Disposition", value: "inline; filename=\"logo.png\"" }],
                  body: { attachmentId: "attach-img-001", size: 1024 },
                },
              ],
            },
          ],
        },
        {
          partId: "1",
          mimeType: "application/zip",
          filename: "archive.zip",
          headers: [{ name: "Content-Disposition", value: "attachment; filename=\"archive.zip\"" }],
          body: { attachmentId: "attach-zip-002", size: 51200 },
        },
      ],
    },
  };

  const result = parseGmailMessage(msg);
  assert(result.plainText.includes("Nested plain text."), "deeply nested plain text extracted");
  assert(result.html.includes("<p>Nested HTML.</p>"), "deeply nested HTML extracted");
  assertEqual(result.attachments.length, 2, "two attachments: logo.png and archive.zip");
  const filenames = result.attachments.map(a => a.filename);
  assert(filenames.includes("logo.png"), "inline image treated as attachment");
  assert(filenames.includes("archive.zip"), "zip attachment identified");
});

// ── Runner ────────────────────────────────────────────────────────────────────

export function runGmailReadEmailTests() {
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  return {
    total:   results.length,
    passed,
    failed,
    results: results.map(r => ({
      name:   r.name,
      passed: r.passed,
      error:  r.error,
    })),
    coverage: {
      "text/plain":              results[0]?.passed ?? false,
      "text/html fallback":      results[1]?.passed ?? false,
      "multipart/alternative":   results[2]?.passed ?? false,
      "multipart/mixed":         results[3]?.passed ?? false,
      "attachments":             results[4]?.passed ?? false,
      "no subject":              results[5]?.passed ?? false,
      "no sender":               results[6]?.passed ?? false,
      "multiple recipients":     results[7]?.passed ?? false,
      "plain preferred over html": results[8]?.passed ?? false,
      "nested multipart":        results[9]?.passed ?? false,
    },
  };
}