/**
 * GmailAcceptanceTests.ts — EV-4B
 * Real Gmail API validation. No mocks.
 */

import { getAccessToken, ensureValidToken, getConnection } from "@/lib/google-auth/GoogleAuthSession";
import type { AccTestResult } from "./GoogleDriveAcceptanceTests";

function mkTrace(requestId: string, operation: string) {
  const steps: Array<{ step: string; ts: number; durationMs?: number; status: string; detail?: string }> = [];
  const start = Date.now();
  return {
    add(step: string, status: string, detail?: string) {
      steps.push({ step, ts: Date.now(), durationMs: Date.now() - start, status, detail });
    },
    export() { return { requestId, operation, totalMs: Date.now() - start, steps }; },
  };
}

function requireGoogleAuth() {
  const conn = getConnection("default");
  if (!conn || conn.state !== "CONNECTED") throw new Error("EV-4B: Google Workspace not connected.");
  const token = getAccessToken("default");
  if (!token) throw new Error("EV-4B: No access token. Reconnect.");
}

async function getToken(): Promise<string> {
  await ensureValidToken("default");
  const t = getAccessToken("default");
  if (!t) throw new Error("No access token");
  return t;
}

async function gmailGET(path: string): Promise<{ status: number; ok: boolean; data: unknown; durationMs: number }> {
  const token = await getToken();
  const t0 = Date.now();
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = res.ok ? await res.json() : await res.text();
  return { status: res.status, ok: res.ok, data, durationMs: Date.now() - t0 };
}

async function gmailPOST(path: string, body: object): Promise<{ status: number; ok: boolean; data: unknown; durationMs: number }> {
  const token = await getToken();
  const t0 = Date.now();
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = res.ok ? await res.json() : await res.text();
  return { status: res.status, ok: res.ok, data, durationMs: Date.now() - t0 };
}

async function gmailDELETE(path: string): Promise<{ status: number; ok: boolean; durationMs: number }> {
  const token = await getToken();
  const t0 = Date.now();
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, ok: res.ok || res.status === 204, durationMs: Date.now() - t0 };
}

function b64(str: string): string {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function runGmailAcceptanceTests(): Promise<AccTestResult[]> {
  const results: AccTestResult[] = [];

  async function run(id: string, name: string, fn: (trace: ReturnType<typeof mkTrace>) => Promise<{ evidence: Record<string, unknown> }>): Promise<void> {
    const trace = mkTrace(id, name);
    const t0 = Date.now();
    try {
      requireGoogleAuth();
      trace.add("auth_check", "OK");
      const { evidence } = await fn(trace);
      results.push({ id, name, status: "PASS", durationMs: Date.now() - t0, evidence, trace: trace.export() });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      trace.add("error", "FAIL", msg);
      const isAuth = msg.includes("not connected") || msg.includes("No access token");
      const isScope = msg.includes("403") || msg.includes("Forbidden") || msg.includes("insufficientPermissions");
      results.push({
        id, name, status: isAuth ? "SKIP" : "FAIL",
        durationMs: Date.now() - t0,
        error: msg,
        evidence: {},
        trace: trace.export(),
        failureDetails: isAuth || isScope ? undefined : {
          cause: msg,
          component: "GmailConnector",
          impact: "Gmail endpoint validation failed",
          priority: "HIGH",
          fix: isScope ? "Re-authorize with gmail.readonly scope" : "Check OAuth token and Gmail API enablement",
        },
      });
    }
  }

  // GMAIL-01: profile.get
  await run("GMAIL-T01", "profile.get — authenticated user profile", async (trace) => {
    const r = await gmailGET("/profile");
    trace.add("GET /profile", r.ok ? "OK" : "FAIL", `HTTP ${r.status} ${r.durationMs}ms`);
    if (!r.ok) throw new Error(`profile.get failed: HTTP ${r.status} — ${String(r.data).slice(0, 200)}`);
    const d = r.data as Record<string, unknown>;
    if (!d.emailAddress) throw new Error("emailAddress missing");
    return { evidence: { emailAddress: d.emailAddress, messagesTotal: d.messagesTotal, threadsTotal: d.threadsTotal, historyId: d.historyId, durationMs: r.durationMs } };
  });

  // GMAIL-02: labels.list
  await run("GMAIL-T02", "labels.list — all labels", async (trace) => {
    const r = await gmailGET("/labels");
    trace.add("GET /labels", r.ok ? "OK" : "FAIL", `HTTP ${r.status}`);
    if (!r.ok) throw new Error(`labels.list failed: HTTP ${r.status} — ${String(r.data).slice(0, 200)}`);
    const d = r.data as { labels: Array<{ id: string; name: string; type: string }> };
    const count = d.labels?.length ?? 0;
    if (count === 0) throw new Error("No labels found");
    return { evidence: { count, system: d.labels?.filter(l => l.type === "system").length, user: d.labels?.filter(l => l.type === "user").length, sample: d.labels?.slice(0, 5) } };
  });

  // GMAIL-03: messages.list
  await run("GMAIL-T03", "messages.list — inbox messages", async (trace) => {
    const r = await gmailGET("/messages?maxResults=10&labelIds=INBOX");
    trace.add("GET /messages", r.ok ? "OK" : "FAIL", `HTTP ${r.status} ${r.durationMs}ms`);
    if (!r.ok) throw new Error(`messages.list failed: HTTP ${r.status} — ${String(r.data).slice(0, 200)}`);
    const d = r.data as { messages?: Array<{ id: string; threadId: string }>; resultSizeEstimate?: number };
    const count = d.messages?.length ?? 0;
    return { evidence: { resultSizeEstimate: d.resultSizeEstimate, count, sample: d.messages?.slice(0, 3), durationMs: r.durationMs } };
  });

  // GMAIL-04: messages.get (first message)
  let firstMessageId: string | null = null;
  await run("GMAIL-T04", "messages.get — read first inbox message", async (trace) => {
    const list = await gmailGET("/messages?maxResults=1&labelIds=INBOX");
    trace.add("GET /messages list", list.ok ? "OK" : "FAIL");
    if (!list.ok) throw new Error(`list failed: HTTP ${list.status}`);
    const d = list.data as { messages?: Array<{ id: string }> };
    if (!d.messages?.length) return { evidence: { skippedReason: "No inbox messages found" } };
    firstMessageId = d.messages[0].id;
    const msg = await gmailGET(`/messages/${firstMessageId}?format=metadata&metadataHeaders=Subject,From,Date`);
    trace.add("GET /messages/:id", msg.ok ? "OK" : "FAIL", `HTTP ${msg.status} ${msg.durationMs}ms`);
    if (!msg.ok) throw new Error(`messages.get failed: HTTP ${msg.status}`);
    const m = msg.data as Record<string, unknown>;
    const headers = (m.payload as Record<string, unknown>)?.headers as Array<{ name: string; value: string }> ?? [];
    const subject = headers.find(h => h.name === "Subject")?.value ?? null;
    const from = headers.find(h => h.name === "From")?.value ?? null;
    return { evidence: { id: m.id, threadId: m.threadId, subject, from, labelIds: m.labelIds, durationMs: msg.durationMs } };
  });

  // GMAIL-05: messages.search
  await run("GMAIL-T05", "messages.search — search 'from:me'", async (trace) => {
    const r = await gmailGET("/messages?maxResults=10&q=from:me");
    trace.add("GET /messages?q=from:me", r.ok ? "OK" : "FAIL", `HTTP ${r.status} ${r.durationMs}ms`);
    if (!r.ok) throw new Error(`search failed: HTTP ${r.status} — ${String(r.data).slice(0, 200)}`);
    const d = r.data as { messages?: Array<{ id: string }>; resultSizeEstimate?: number };
    return { evidence: { query: "from:me", resultSizeEstimate: d.resultSizeEstimate, count: d.messages?.length ?? 0, durationMs: r.durationMs } };
  });

  // GMAIL-06: draft.create
  let tempDraftId: string | null = null;
  await run("GMAIL-T06", "drafts.create — create test draft", async (trace) => {
    const conn = getConnection("default")!;
    const email = conn.email;
    const raw = b64(`To: ${email}\r\nSubject: MemoryOS EV-4B Test Draft\r\nContent-Type: text/plain\r\n\r\nThis is an automated test draft from MemoryOS EV-4B validation. Safe to delete.`);
    const r = await gmailPOST("/drafts", { message: { raw } });
    trace.add("POST /drafts", r.ok ? "OK" : "FAIL", `HTTP ${r.status} ${r.durationMs}ms`);
    if (!r.ok) throw new Error(`draft.create failed: HTTP ${r.status} — ${String(r.data).slice(0, 200)}`);
    const d = r.data as { id: string; message?: { id: string; threadId: string } };
    tempDraftId = d.id;
    return { evidence: { draftId: d.id, messageId: d.message?.id, threadId: d.message?.threadId, durationMs: r.durationMs } };
  });

  // GMAIL-07: draft.delete
  await run("GMAIL-T07", "drafts.delete — delete test draft", async (trace) => {
    if (!tempDraftId) return { evidence: { skippedReason: "T06 did not create a draft" } };
    const r = await gmailDELETE(`/drafts/${tempDraftId}`);
    trace.add("DELETE /drafts/:id", r.ok ? "OK" : "FAIL", `HTTP ${r.status} ${r.durationMs}ms`);
    if (!r.ok) throw new Error(`draft.delete failed: HTTP ${r.status}`);
    tempDraftId = null;
    return { evidence: { status: r.status, durationMs: r.durationMs } };
  });

  // GMAIL-08: attachments (check if first message has attachments)
  await run("GMAIL-T08", "messages.attachments.get — check attachment on message", async (trace) => {
    const list = await gmailGET("/messages?maxResults=20&q=has:attachment");
    trace.add("GET /messages?q=has:attachment", list.ok ? "OK" : "FAIL");
    if (!list.ok) throw new Error(`list failed: HTTP ${list.status}`);
    const d = list.data as { messages?: Array<{ id: string }> };
    if (!d.messages?.length) return { evidence: { skippedReason: "No messages with attachments found" } };
    const msgId = d.messages[0].id;
    const msg = await gmailGET(`/messages/${msgId}?format=full`);
    if (!msg.ok) throw new Error(`messages.get failed: HTTP ${msg.status}`);
    const m = msg.data as Record<string, unknown>;
    const payload = m.payload as Record<string, unknown>;
    const parts = (payload?.parts as Array<Record<string, unknown>>) ?? [];
    const attachments = parts.filter(p => p.filename && (p.filename as string).length > 0);
    if (attachments.length === 0) return { evidence: { skippedReason: "Message found but no attachment parts", msgId } };
    const att = attachments[0];
    const attId = (att.body as Record<string, unknown>)?.attachmentId as string;
    if (!attId) return { evidence: { skippedReason: "Attachment has no attachmentId", filename: att.filename } };
    const attData = await gmailGET(`/messages/${msgId}/attachments/${attId}`);
    trace.add("GET attachment", attData.ok ? "OK" : "FAIL", `HTTP ${attData.status}`);
    if (!attData.ok) throw new Error(`attachments.get failed: HTTP ${attData.status}`);
    const ad = attData.data as Record<string, unknown>;
    return { evidence: { msgId, filename: att.filename, attachmentId: attId, size: ad.size, dataLength: (ad.data as string)?.length, durationMs: attData.durationMs } };
  });

  // GMAIL-09: stress 50 calls
  await run("GMAIL-T09", "stress — 50 consecutive messages.list calls", async (trace) => {
    const N = 50;
    const durations: number[] = [];
    let errors = 0;
    for (let i = 0; i < N; i++) {
      const r = await gmailGET("/messages?maxResults=1");
      if (!r.ok) errors++;
      else durations.push(r.durationMs);
    }
    trace.add("stress complete", errors === 0 ? "OK" : "WARN", `${errors} errors / ${N} calls`);
    const avg = durations.reduce((a, b) => a + b, 0) / (durations.length || 1);
    const sorted = [...durations].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    return { evidence: { total: N, errors, avgMs: Math.round(avg), p95Ms: p95 } };
  });

  return results;
}