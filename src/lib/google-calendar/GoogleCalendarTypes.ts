/**
 * GoogleCalendarTypes.ts — Engineering Sprint 7.2
 * Shared types for the Google Calendar Connector.
 * Zero dependencies on Core layers.
 */

// ── Event types ───────────────────────────────────────────────────────────────

export type EventStatus  = "confirmed" | "tentative" | "cancelled";
export type EventVisibility = "default" | "public" | "private" | "confidential";
export type AttendeeStatus  = "accepted" | "declined" | "tentative" | "needsAction";

export interface CalendarAttendee {
  email:          string;
  displayName:    string | null;
  responseStatus: AttendeeStatus;
  organizer:      boolean;
  self:           boolean;
}

export interface CalendarDateTime {
  dateTime: string | null;   // ISO 8601 with timezone
  date:     string | null;   // YYYY-MM-DD for all-day events
  timeZone: string | null;
}

export interface CalendarEvent {
  id:           string;
  calendarId:   string;
  summary:      string;
  description:  string | null;
  location:     string | null;
  status:       EventStatus;
  visibility:   EventVisibility;
  start:        CalendarDateTime;
  end:          CalendarDateTime;
  allDay:       boolean;
  recurring:    boolean;
  recurringId:  string | null;
  attendees:    CalendarAttendee[];
  organizer:    CalendarAttendee | null;
  creator:      { email: string; displayName: string | null } | null;
  htmlLink:     string | null;
  meetLink:     string | null;      // Google Meet
  created:      string | null;
  updated:      string | null;
}

export interface CalendarInfo {
  id:          string;
  summary:     string;
  description: string | null;
  primary:     boolean;
  selected:    boolean;
  timeZone:    string | null;
  colorId:     string | null;
  backgroundColor: string | null;
}

export interface FreeBusySlot {
  start: string;
  end:   string;
}

export interface FreeBusyResult {
  calendarId: string;
  busy:       FreeBusySlot[];
  timeMin:    string;
  timeMax:    string;
  durationMs: number;
}

export interface EventListResult {
  events:        CalendarEvent[];
  nextPageToken: string | null;
  nextSyncToken: string | null;
  searchQuery:   string;
  timeMin:       string | null;
  timeMax:       string | null;
  durationMs:    number;
}

// ── NL intent ────────────────────────────────────────────────────────────────

export interface CalendarQueryIntent {
  rawQuery:   string;
  timeRange:  "today" | "tomorrow" | "week" | "next_week" | "custom" | null;
  targetHour: number | null;          // e.g. 14 for "14h"
  nameHint:   string | null;          // person name
  freeBusy:   boolean;                // "estou livre"
  nextMeeting:boolean;                // "próxima reunião"
  recurring:  boolean;                // "recorrente"
  weekday:    string | null;          // "sexta-feira"
}

// ── Timezone helpers ──────────────────────────────────────────────────────────

export function nowInTZ(tz = "America/Sao_Paulo"): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfWeek(date: Date): Date {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function formatEventTime(evt: CalendarEvent, tz = "America/Sao_Paulo"): string {
  if (evt.allDay) return "Dia inteiro";
  const dt = evt.start.dateTime;
  if (!dt) return "—";
  return new Date(dt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: tz });
}

export function isEventToday(evt: CalendarEvent): boolean {
  const now  = new Date();
  const date = evt.start.date ?? evt.start.dateTime?.split("T")[0];
  if (!date) return false;
  const today = now.toISOString().split("T")[0];
  return date === today;
}