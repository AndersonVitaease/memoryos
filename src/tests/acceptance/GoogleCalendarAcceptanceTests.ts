/**
 * GoogleCalendarAcceptanceTests.ts — EV-4B
 * Real Google Calendar API validation. No mocks.
 */

import { getAccessToken, ensureValidToken, getConnection } from "@/lib/google-auth/GoogleAuthSession";
import { listCalendars, listEvents, searchEvents } from "@/lib/google-calendar/GoogleCalendarConnector";
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
  if (!token) throw new Error("EV-4B: No access token.");
}

async function getToken(): Promise<string> {
  await ensureValidToken("default");
  const t = getAccessToken("default");
  if (!t) throw new Error("No access token");
  return t;
}

async function calGET(path: string): Promise<{ status: number; ok: boolean; data: unknown; durationMs: number }> {
  const token = await getToken();
  const t0 = Date.now();
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = res.ok ? await res.json() : await res.text();
  return { status: res.status, ok: res.ok, data, durationMs: Date.now() - t0 };
}

async function calPOST(path: string, body: object): Promise<{ status: number; ok: boolean; data: unknown; durationMs: number }> {
  const token = await getToken();
  const t0 = Date.now();
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = res.ok ? await res.json() : await res.text();
  return { status: res.status, ok: res.ok, data, durationMs: Date.now() - t0 };
}

async function calPUT(path: string, body: object): Promise<{ status: number; ok: boolean; data: unknown; durationMs: number }> {
  const token = await getToken();
  const t0 = Date.now();
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = res.ok ? await res.json() : await res.text();
  return { status: res.status, ok: res.ok, data, durationMs: Date.now() - t0 };
}

async function calDELETE(path: string): Promise<{ status: number; ok: boolean; durationMs: number }> {
  const token = await getToken();
  const t0 = Date.now();
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, ok: res.ok || res.status === 204, durationMs: Date.now() - t0 };
}

export async function runGoogleCalendarAcceptanceTests(): Promise<AccTestResult[]> {
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
      results.push({
        id, name, status: isAuth ? "SKIP" : "FAIL",
        durationMs: Date.now() - t0,
        error: msg,
        evidence: {},
        trace: trace.export(),
        failureDetails: isAuth ? undefined : {
          cause: msg,
          component: "GoogleCalendarConnector",
          impact: "Calendar endpoint validation failed",
          priority: "HIGH",
          fix: "Re-authorize with calendar scope. Verify Google Calendar API is enabled.",
        },
      });
    }
  }

  // CAL-01: calendarList.list
  await run("CAL-T01", "calendarList.list — list all calendars", async (trace) => {
    const calendars = await listCalendars();
    trace.add("listCalendars", "OK", `${calendars.length} calendars`);
    if (calendars.length === 0) throw new Error("No calendars returned");
    const primary = calendars.find(c => c.primary);
    return { evidence: { count: calendars.length, hasPrimary: !!primary, primaryEmail: primary?.summary, calendars: calendars.slice(0, 5).map(c => ({ id: c.id, summary: c.summary, primary: c.primary })) } };
  });

  // CAL-02: events.list (this month)
  await run("CAL-T02", "events.list — events this month", async (trace) => {
    const now = new Date();
    const timeMin = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const timeMax = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
    const result = await listEvents({ timeMin, timeMax, maxResults: 20 });
    trace.add("listEvents(month)", "OK", `${result.events.length} events in ${result.durationMs}ms`);
    return { evidence: { count: result.events.length, timeMin, timeMax, sample: result.events.slice(0, 3).map(e => ({ id: e.id, summary: e.summary, start: e.start })), durationMs: result.durationMs } };
  });

  // CAL-03: events.search
  await run("CAL-T03", "events.search — full text search", async (trace) => {
    const result = await searchEvents("meeting");
    trace.add("searchEvents(meeting)", "OK", `${result.events.length} results`);
    return { evidence: { query: "meeting", count: result.events.length, sample: result.events.slice(0, 3).map(e => ({ id: e.id, summary: e.summary })), durationMs: result.durationMs } };
  });

  // CAL-04: events.insert (create test event)
  let tempEventId: string | null = null;
  await run("CAL-T04", "events.insert — create test event", async (trace) => {
    const now = new Date();
    const start = new Date(now.getTime() + 24 * 3600_000);
    const end = new Date(start.getTime() + 3600_000);
    const r = await calPOST("/calendars/primary/events", {
      summary: `MemoryOS EV-4B Test Event ${Date.now()}`,
      description: "Automated test event created by MemoryOS EV-4B validation. Safe to delete.",
      start: { dateTime: start.toISOString() },
      end:   { dateTime: end.toISOString() },
    });
    trace.add("POST /calendars/primary/events", r.ok ? "OK" : "FAIL", `HTTP ${r.status} ${r.durationMs}ms`);
    if (!r.ok) throw new Error(`events.insert failed: HTTP ${r.status} — ${String(r.data).slice(0, 200)}`);
    const d = r.data as { id: string; summary: string; htmlLink: string };
    tempEventId = d.id;
    return { evidence: { id: d.id, summary: d.summary, htmlLink: d.htmlLink, durationMs: r.durationMs } };
  });

  // CAL-05: events.update
  await run("CAL-T05", "events.update — update test event", async (trace) => {
    if (!tempEventId) return { evidence: { skippedReason: "T04 did not create an event" } };
    const now = new Date();
    const start = new Date(now.getTime() + 25 * 3600_000);
    const end = new Date(start.getTime() + 3600_000);
    const r = await calPUT(`/calendars/primary/events/${tempEventId}`, {
      summary: `MemoryOS EV-4B Test Event UPDATED ${Date.now()}`,
      description: "Updated by MemoryOS EV-4B validation.",
      start: { dateTime: start.toISOString() },
      end:   { dateTime: end.toISOString() },
    });
    trace.add("PUT /calendars/primary/events/:id", r.ok ? "OK" : "FAIL", `HTTP ${r.status}`);
    if (!r.ok) throw new Error(`events.update failed: HTTP ${r.status} — ${String(r.data).slice(0, 200)}`);
    const d = r.data as { id: string; summary: string; updated: string };
    return { evidence: { id: d.id, summary: d.summary, updated: d.updated, durationMs: r.durationMs } };
  });

  // CAL-06: events.delete
  await run("CAL-T06", "events.delete — delete test event", async (trace) => {
    if (!tempEventId) return { evidence: { skippedReason: "No temp event to delete" } };
    const r = await calDELETE(`/calendars/primary/events/${tempEventId}`);
    trace.add("DELETE /calendars/primary/events/:id", r.ok ? "OK" : "FAIL", `HTTP ${r.status}`);
    if (!r.ok) throw new Error(`events.delete failed: HTTP ${r.status}`);
    tempEventId = null;
    return { evidence: { status: r.status, durationMs: r.durationMs } };
  });

  return results;
}