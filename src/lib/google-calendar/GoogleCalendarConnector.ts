/**
 * GoogleCalendarConnector.ts — Engineering Sprint 7.2
 * Google Calendar Connector — built 100% on GWS Foundation.
 *
 * Reuses (zero duplication):
 *   GoogleWorkspaceAuditLogger  — every call logged
 *   GoogleWorkspaceRateLimiter  — quota / backoff
 *   GoogleWorkspaceScopes       — scope constants
 *   GoogleAuthSession           — OAuth tokens
 *
 * Calendar-specific code only: URL construction + response normalization + time math.
 */

import { getConnection, isConnected, getAccessToken, ensureValidToken }
  from "@/lib/google-auth/GoogleAuthSession";
import { GoogleWorkspaceAuditLogger } from "@/lib/google-workspace/GoogleWorkspaceAuditLogger";
import { GoogleWorkspaceRateLimiter  } from "@/lib/google-workspace/GoogleWorkspaceRateLimiter";

import type {
  CalendarEvent, CalendarInfo, EventListResult,
  CalendarDateTime, CalendarAttendee, FreeBusyResult,
} from "./GoogleCalendarTypes";
import {
  startOfDay, endOfDay, startOfWeek, endOfWeek,
} from "./GoogleCalendarTypes";
import { bootstrapCalendarCapabilities } from "./GoogleCalendarCapabilityRegistry";

const WS  = "default";
const SVC = "calendar" as const;

let _seq = 1;
function _rid() { return `cal-${Date.now()}-${(_seq++).toString().padStart(4, "0")}`; }

function _authHeader(): string | null {
  const t = getAccessToken(WS);
  return t ? `Bearer ${t}` : null;
}

// ── Generic Calendar API request ──────────────────────────────────────────────

async function _calRequest<T>(capability: string, url: string, opts: RequestInit = {}): Promise<T> {
  await GoogleWorkspaceRateLimiter.check(SVC);
  return GoogleWorkspaceAuditLogger.wrap(SVC, capability, "user", _rid(), async () => {
    GoogleWorkspaceRateLimiter.consume(SVC);
    const auth = _authHeader();
    if (!auth) throw Object.assign(new Error("Not authenticated"), { code: "NOT_AUTHENTICATED" });
    const res = await fetch(url, { ...opts, headers: { Authorization: auth, ...opts.headers } });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw Object.assign(new Error(`Calendar API ${res.status}: ${body}`), { code: `HTTP_${res.status}` });
    }
    return res.json() as T;
  });
}

// ── Response normalizers ──────────────────────────────────────────────────────

function _normDT(raw: Record<string, string>): CalendarDateTime {
  return { dateTime: raw?.dateTime ?? null, date: raw?.date ?? null, timeZone: raw?.timeZone ?? null };
}

function _normAttendee(raw: Record<string, unknown>): CalendarAttendee {
  return {
    email:          raw.email as string,
    displayName:    (raw.displayName as string) ?? null,
    responseStatus: (raw.responseStatus as CalendarAttendee["responseStatus"]) ?? "needsAction",
    organizer:      Boolean(raw.organizer),
    self:           Boolean(raw.self),
  };
}

function _normEvent(raw: Record<string, unknown>, calendarId = "primary"): CalendarEvent {
  const start = _normDT(raw.start as Record<string, string>);
  const attendees = ((raw.attendees as Record<string, unknown>[]) ?? []).map(_normAttendee);
  const organizer = raw.organizer ? _normAttendee(raw.organizer as Record<string, unknown>) : null;

  // Detect Google Meet link
  const epps = (raw.conferenceData as Record<string, unknown>)?.entryPoints as Array<Record<string, string>> ?? [];
  const meetEP = epps.find((ep) => ep.entryPointType === "video");

  return {
    id:          raw.id as string,
    calendarId,
    summary:     (raw.summary as string) ?? "(sem titulo)",
    description: (raw.description as string) ?? null,
    location:    (raw.location as string) ?? null,
    status:      (raw.status as CalendarEvent["status"]) ?? "confirmed",
    visibility:  (raw.visibility as CalendarEvent["visibility"]) ?? "default",
    start,
    end:         _normDT(raw.end as Record<string, string>),
    allDay:      Boolean(start.date && !start.dateTime),
    recurring:   Boolean(raw.recurringEventId),
    recurringId: (raw.recurringEventId as string) ?? null,
    attendees,
    organizer,
    creator:     raw.creator ? { email: (raw.creator as Record<string, string>).email, displayName: (raw.creator as Record<string, string>).displayName ?? null } : null,
    htmlLink:    (raw.htmlLink as string) ?? null,
    meetLink:    meetEP?.uri ?? null,
    created:     (raw.created as string) ?? null,
    updated:     (raw.updated as string) ?? null,
  };
}

// ── Health ────────────────────────────────────────────────────────────────────

export function getCalendarHealth(): { ok: boolean; reason: string } {
  const conn = getConnection(WS);
  if (!conn)            return { ok: false, reason: "Google Workspace nao conectado" };
  if (!isConnected(WS)) return { ok: false, reason: "Token expirado" };
  return { ok: true, reason: `Conectado como ${conn.email ?? "usuario"}` };
}

// ── List calendars ────────────────────────────────────────────────────────────

export async function listCalendars(): Promise<CalendarInfo[]> {
  await ensureValidToken(WS);
  const raw = await _calRequest<{ items: Record<string, unknown>[] }>(
    "calendar.listCalendars",
    "https://www.googleapis.com/calendar/v3/users/me/calendarList",
  );
  return (raw.items ?? []).map((c) => ({
    id:              c.id as string,
    summary:         (c.summary as string) ?? "",
    description:     (c.description as string) ?? null,
    primary:         Boolean(c.primary),
    selected:        Boolean(c.selected),
    timeZone:        (c.timeZone as string) ?? null,
    colorId:         (c.colorId as string) ?? null,
    backgroundColor: (c.backgroundColor as string) ?? null,
  }));
}

// ── List events (time range) ──────────────────────────────────────────────────

export async function listEvents(opts: {
  calendarId?: string;
  timeMin:     string;   // ISO
  timeMax:     string;   // ISO
  maxResults?: number;
  pageToken?:  string;
  singleEvents?: boolean;
  orderBy?:    string;
}): Promise<EventListResult> {
  await ensureValidToken(WS);
  const t0  = Date.now();
  const cid = opts.calendarId ?? "primary";
  const params = new URLSearchParams({
    timeMin:      opts.timeMin,
    timeMax:      opts.timeMax,
    maxResults:   String(opts.maxResults ?? 25),
    singleEvents: String(opts.singleEvents ?? true),
    orderBy:      opts.orderBy ?? "startTime",
    ...(opts.pageToken ? { pageToken: opts.pageToken } : {}),
  });
  const raw = await _calRequest<{ items: Record<string, unknown>[]; nextPageToken?: string; nextSyncToken?: string }>(
    "calendar.listEvents",
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cid)}/events?${params}`,
  );
  return {
    events:        (raw.items ?? []).map((e) => _normEvent(e, cid)),
    nextPageToken: raw.nextPageToken ?? null,
    nextSyncToken: raw.nextSyncToken ?? null,
    searchQuery:   `timeMin=${opts.timeMin}`,
    timeMin:       opts.timeMin,
    timeMax:       opts.timeMax,
    durationMs:    Date.now() - t0,
  };
}

// ── Today ─────────────────────────────────────────────────────────────────────

export async function listToday(calendarId = "primary"): Promise<EventListResult> {
  const now  = new Date();
  return listEvents({
    calendarId,
    timeMin: startOfDay(now).toISOString(),
    timeMax: endOfDay(now).toISOString(),
  });
}

// ── This week ─────────────────────────────────────────────────────────────────

export async function listThisWeek(calendarId = "primary"): Promise<EventListResult> {
  const now = new Date();
  return listEvents({
    calendarId,
    timeMin: startOfWeek(now).toISOString(),
    timeMax: endOfWeek(now).toISOString(),
    maxResults: 50,
  });
}

// ── Search events ─────────────────────────────────────────────────────────────

export async function searchEvents(query: string, opts: {
  calendarId?: string;
  maxResults?: number;
  timeMin?: string;
  timeMax?: string;
} = {}): Promise<EventListResult> {
  await ensureValidToken(WS);
  const t0  = Date.now();
  const cid = opts.calendarId ?? "primary";
  const now = new Date();
  const params = new URLSearchParams({
    q:          query,
    maxResults: String(opts.maxResults ?? 20),
    singleEvents: "true",
    orderBy:    "startTime",
    timeMin:    opts.timeMin ?? now.toISOString(),
    timeMax:    opts.timeMax ?? new Date(now.getTime() + 90 * 86400_000).toISOString(),
  });
  const raw = await _calRequest<{ items: Record<string, unknown>[]; nextPageToken?: string }>(
    "calendar.searchEvents",
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cid)}/events?${params}`,
  );
  return {
    events:        (raw.items ?? []).map((e) => _normEvent(e, cid)),
    nextPageToken: raw.nextPageToken ?? null,
    nextSyncToken: null,
    searchQuery:   query,
    timeMin:       opts.timeMin ?? null,
    timeMax:       opts.timeMax ?? null,
    durationMs:    Date.now() - t0,
  };
}

// ── Read single event ─────────────────────────────────────────────────────────

export async function readEvent(eventId: string, calendarId = "primary"): Promise<{ ok: boolean; data: CalendarEvent | null; error: string | null }> {
  await ensureValidToken(WS);
  try {
    const raw = await _calRequest<Record<string, unknown>>(
      "calendar.readEvent",
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    );
    return { ok: true, data: _normEvent(raw, calendarId), error: null };
  } catch (e) {
    return { ok: false, data: null, error: (e as Error).message };
  }
}

// ── Next meeting ──────────────────────────────────────────────────────────────

export async function nextMeeting(calendarId = "primary"): Promise<{ ok: boolean; data: CalendarEvent | null; error: string | null }> {
  await ensureValidToken(WS);
  try {
    const now    = new Date();
    const params = new URLSearchParams({
      timeMin:     now.toISOString(),
      maxResults:  "1",
      singleEvents:"true",
      orderBy:     "startTime",
    });
    const raw = await _calRequest<{ items: Record<string, unknown>[] }>(
      "calendar.nextMeeting",
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    );
    const event = raw.items?.[0] ? _normEvent(raw.items[0], calendarId) : null;
    return { ok: true, data: event, error: null };
  } catch (e) {
    return { ok: false, data: null, error: (e as Error).message };
  }
}

// ── Free/Busy ─────────────────────────────────────────────────────────────────

export async function freeBusy(opts: {
  timeMin:     string;
  timeMax:     string;
  calendarId?: string;
}): Promise<FreeBusyResult> {
  await ensureValidToken(WS);
  const t0  = Date.now();
  const cid = opts.calendarId ?? "primary";
  const auth = _authHeader();
  if (!auth) throw new Error("Not authenticated");
  GoogleWorkspaceRateLimiter.consume(SVC);
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method:  "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body:    JSON.stringify({ timeMin: opts.timeMin, timeMax: opts.timeMax, items: [{ id: cid }] }),
  });
  const raw = await res.json() as Record<string, unknown>;
  const busySlots = ((raw.calendars as Record<string, unknown>)?.[cid] as Record<string, unknown>)?.busy as Array<{ start: string; end: string }> ?? [];
  return { calendarId: cid, busy: busySlots, timeMin: opts.timeMin, timeMax: opts.timeMax, durationMs: Date.now() - t0 };
}

// ── Bootstrap on first import ─────────────────────────────────────────────────

bootstrapCalendarCapabilities().catch(() => {});