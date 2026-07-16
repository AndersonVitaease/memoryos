/**
 * GoogleWorkspaceScopes.ts — Engineering Sprint 7.0
 * Canonical scope registry for all Google Workspace services.
 * Single source of truth — no service defines its own scopes elsewhere.
 */

import type { GWSServiceId } from "./GoogleWorkspaceTypes";

// ── Scope constants ───────────────────────────────────────────────────────────

export const SCOPES = Object.freeze({
  // Gmail
  GMAIL_READONLY:  "https://www.googleapis.com/auth/gmail.readonly",
  GMAIL_SEND:      "https://www.googleapis.com/auth/gmail.send",
  GMAIL_MODIFY:    "https://www.googleapis.com/auth/gmail.modify",
  GMAIL_COMPOSE:   "https://www.googleapis.com/auth/gmail.compose",
  GMAIL_LABELS:    "https://www.googleapis.com/auth/gmail.labels",
  GMAIL_FULL:      "https://mail.google.com/",

  // Drive
  DRIVE_READONLY:  "https://www.googleapis.com/auth/drive.readonly",
  DRIVE_FILE:      "https://www.googleapis.com/auth/drive.file",
  DRIVE_FULL:      "https://www.googleapis.com/auth/drive",
  DRIVE_METADATA:  "https://www.googleapis.com/auth/drive.metadata.readonly",

  // Calendar
  CALENDAR_READONLY: "https://www.googleapis.com/auth/calendar.readonly",
  CALENDAR_EVENTS:   "https://www.googleapis.com/auth/calendar.events",
  CALENDAR_FULL:     "https://www.googleapis.com/auth/calendar",

  // Contacts
  CONTACTS_READONLY: "https://www.googleapis.com/auth/contacts.readonly",
  CONTACTS_FULL:     "https://www.googleapis.com/auth/contacts",

  // Docs
  DOCS_READONLY: "https://www.googleapis.com/auth/documents.readonly",
  DOCS_FULL:     "https://www.googleapis.com/auth/documents",

  // Sheets
  SHEETS_READONLY: "https://www.googleapis.com/auth/spreadsheets.readonly",
  SHEETS_FULL:     "https://www.googleapis.com/auth/spreadsheets",

  // Tasks
  TASKS_READONLY: "https://www.googleapis.com/auth/tasks.readonly",
  TASKS_FULL:     "https://www.googleapis.com/auth/tasks",

  // Profile (always required)
  PROFILE:   "https://www.googleapis.com/auth/userinfo.profile",
  EMAIL:     "https://www.googleapis.com/auth/userinfo.email",
  OPENID:    "openid",
});

// ── Per-service minimal scopes ────────────────────────────────────────────────

export const MINIMAL_SCOPES: Record<GWSServiceId, string[]> = {
  gmail:    [SCOPES.GMAIL_READONLY, SCOPES.EMAIL, SCOPES.PROFILE],
  drive:    [SCOPES.DRIVE_READONLY, SCOPES.EMAIL, SCOPES.PROFILE],
  calendar: [SCOPES.CALENDAR_READONLY, SCOPES.EMAIL, SCOPES.PROFILE],
  contacts: [SCOPES.CONTACTS_READONLY, SCOPES.EMAIL, SCOPES.PROFILE],
  docs:     [SCOPES.DOCS_READONLY, SCOPES.EMAIL, SCOPES.PROFILE],
  sheets:   [SCOPES.SHEETS_READONLY, SCOPES.EMAIL, SCOPES.PROFILE],
  tasks:    [SCOPES.TASKS_READONLY, SCOPES.EMAIL, SCOPES.PROFILE],
  keep:     [SCOPES.EMAIL, SCOPES.PROFILE],  // Keep has no public scope yet
};

// ── Scope utilities ───────────────────────────────────────────────────────────

export function hasScope(grantedScopes: string[], required: string): boolean {
  return grantedScopes.includes(required);
}

export function missingScopes(grantedScopes: string[], required: string[]): string[] {
  return required.filter((s) => !grantedScopes.includes(s));
}

export function scopesForService(serviceId: GWSServiceId, mode: "read" | "write" = "read"): string[] {
  const minimal = MINIMAL_SCOPES[serviceId];
  if (mode === "read") return minimal;

  // Write scopes
  const writeMap: Partial<Record<GWSServiceId, string[]>> = {
    gmail:    [SCOPES.GMAIL_MODIFY, SCOPES.GMAIL_SEND, SCOPES.EMAIL, SCOPES.PROFILE],
    drive:    [SCOPES.DRIVE_FILE, SCOPES.EMAIL, SCOPES.PROFILE],
    calendar: [SCOPES.CALENDAR_EVENTS, SCOPES.EMAIL, SCOPES.PROFILE],
    contacts: [SCOPES.CONTACTS_FULL, SCOPES.EMAIL, SCOPES.PROFILE],
    docs:     [SCOPES.DOCS_FULL, SCOPES.EMAIL, SCOPES.PROFILE],
    sheets:   [SCOPES.SHEETS_FULL, SCOPES.EMAIL, SCOPES.PROFILE],
    tasks:    [SCOPES.TASKS_FULL, SCOPES.EMAIL, SCOPES.PROFILE],
  };
  return writeMap[serviceId] ?? minimal;
}