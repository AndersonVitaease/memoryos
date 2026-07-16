/**
 * GoogleCalendarCapabilityExecutor.ts — Engineering Sprint 7.2
 *
 * Two responsibilities (SRP):
 *   1. parseCalendarIntent() — NL → CalendarQueryIntent
 *   2. executeCalendarCapability() — capability dispatcher
 */

import type { CalendarQueryIntent } from "./GoogleCalendarTypes";
import { startOfDay, endOfDay, startOfWeek, endOfWeek } from "./GoogleCalendarTypes";

// ── Weekday map (pt-BR) ───────────────────────────────────────────────────────

const WEEKDAY_MAP: Record<string, number> = {
  domingo: 0, segunda: 1, "segunda-feira": 1,
  terca: 2, "terça": 2, "terça-feira": 2,
  quarta: 3, "quarta-feira": 3,
  quinta: 4, "quinta-feira": 4,
  sexta: 5, "sexta-feira": 5,
  sabado: 6, "sábado": 6,
};

function _nextWeekday(day: number): Date {
  const now  = new Date();
  const diff = (day - now.getDay() + 7) % 7 || 7;
  const d    = new Date(now);
  d.setDate(now.getDate() + diff);
  return d;
}

// ── Natural Language → Intent ─────────────────────────────────────────────────

export function parseCalendarIntent(rawQuery: string): CalendarQueryIntent {
  const q = rawQuery.toLowerCase();

  // Time range
  let timeRange: CalendarQueryIntent["timeRange"] = null;
  if (/\bhoje|today\b/.test(q))                         timeRange = "today";
  else if (/\bamanh[aã]|tomorrow\b/.test(q))            timeRange = "tomorrow";
  else if (/\besta semana|this week\b/.test(q))         timeRange = "week";
  else if (/\bpróxima semana|next week\b/.test(q))      timeRange = "next_week";

  // Hour hint — "14h", "às 15", "14:00"
  const hourMatch = q.match(/\b(\d{1,2})[\s]?h\b|\b[àa]s\s+(\d{1,2})\b|(\d{1,2}):\d{2}/);
  const targetHour = hourMatch
    ? parseInt(hourMatch[1] ?? hourMatch[2] ?? hourMatch[3], 10)
    : null;

  // Name hint — "com Anderson", "com fulano"
  const nameMatch = rawQuery.match(/\bcom\s+([A-Z][a-záàâãéèêíïóôõöúüçÇÃ]+)/i);
  const nameHint = nameMatch ? nameMatch[1] : null;

  // Weekday
  let weekday: string | null = null;
  for (const [key] of Object.entries(WEEKDAY_MAP)) {
    if (q.includes(key)) { weekday = key; break; }
  }

  return {
    rawQuery,
    timeRange:   timeRange ?? (weekday ? "custom" : null),
    targetHour,
    nameHint,
    freeBusy:    /\blivre|disponível|free\b/.test(q),
    nextMeeting: /\bpróxima reunião|next meeting|quando é\b/.test(q),
    recurring:   /\brecorrent|recurring\b/.test(q),
    weekday,
  };
}

// ── Intent → time bounds ──────────────────────────────────────────────────────

export function intentToTimeBounds(intent: CalendarQueryIntent): { timeMin: string; timeMax: string } {
  const now = new Date();

  if (intent.timeRange === "today") {
    return { timeMin: startOfDay(now).toISOString(), timeMax: endOfDay(now).toISOString() };
  }
  if (intent.timeRange === "tomorrow") {
    const tom = new Date(now); tom.setDate(tom.getDate() + 1);
    return { timeMin: startOfDay(tom).toISOString(), timeMax: endOfDay(tom).toISOString() };
  }
  if (intent.timeRange === "week") {
    return { timeMin: startOfWeek(now).toISOString(), timeMax: endOfWeek(now).toISOString() };
  }
  if (intent.timeRange === "next_week") {
    const nw = new Date(now); nw.setDate(now.getDate() + 7);
    return { timeMin: startOfWeek(nw).toISOString(), timeMax: endOfWeek(nw).toISOString() };
  }
  if (intent.weekday && WEEKDAY_MAP[intent.weekday] !== undefined) {
    const d = _nextWeekday(WEEKDAY_MAP[intent.weekday]);
    return { timeMin: startOfDay(d).toISOString(), timeMax: endOfDay(d).toISOString() };
  }
  // default: next 7 days
  return { timeMin: now.toISOString(), timeMax: new Date(now.getTime() + 7 * 86400_000).toISOString() };
}

// ── Capability dispatcher ─────────────────────────────────────────────────────

export async function executeCalendarCapability(
  capabilityId: string,
  parameters: Record<string, unknown>,
): Promise<{ ok: boolean; data: unknown; error: string | null }> {
  const { listEvents, listToday, listThisWeek, searchEvents, readEvent, nextMeeting, freeBusy } =
    await import("./GoogleCalendarConnector");

  switch (capabilityId) {
    case "calendar.listEvents": {
      const now = new Date();
      const r = await listEvents({
        calendarId: (parameters.calendarId as string) ?? "primary",
        timeMin:    (parameters.timeMin as string) ?? now.toISOString(),
        timeMax:    (parameters.timeMax as string) ?? new Date(now.getTime() + 7 * 86400_000).toISOString(),
        maxResults: (parameters.maxResults as number) ?? 25,
      }).catch((e) => ({ events: [], error: (e as Error).message }));
      return { ok: !("error" in r && r.error), data: r, error: ("error" in r ? r.error : null) as string | null };
    }
    case "calendar.searchEvents": {
      const r = await searchEvents((parameters.query as string) ?? "", {
        calendarId: parameters.calendarId as string,
        maxResults: (parameters.maxResults as number) ?? 20,
      }).catch((e) => ({ events: [], error: (e as Error).message }));
      return { ok: !("error" in r && r.error), data: r, error: ("error" in r ? r.error : null) as string | null };
    }
    case "calendar.today": {
      const r = await listToday(parameters.calendarId as string).catch((e) => ({ events: [], error: (e as Error).message }));
      return { ok: !("error" in r && r.error), data: r, error: ("error" in r ? r.error : null) as string | null };
    }
    case "calendar.thisWeek": {
      const r = await listThisWeek(parameters.calendarId as string).catch((e) => ({ events: [], error: (e as Error).message }));
      return { ok: !("error" in r && r.error), data: r, error: ("error" in r ? r.error : null) as string | null };
    }
    case "calendar.nextMeeting":
      return nextMeeting(parameters.calendarId as string);
    case "calendar.readEvent":
      return readEvent((parameters.eventId as string) ?? "", parameters.calendarId as string);
    case "calendar.freeBusy": {
      const now = new Date();
      const r = await freeBusy({
        timeMin:    (parameters.timeMin as string) ?? now.toISOString(),
        timeMax:    (parameters.timeMax as string) ?? new Date(now.getTime() + 86400_000).toISOString(),
        calendarId: parameters.calendarId as string,
      }).catch((e) => ({ busy: [], error: (e as Error).message }));
      return { ok: !("error" in r && r.error), data: r, error: ("error" in r ? r.error : null) as string | null };
    }
    default:
      return { ok: false, data: null, error: `Unknown capability: ${capabilityId}` };
  }
}