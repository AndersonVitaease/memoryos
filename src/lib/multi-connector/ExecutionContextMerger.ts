/**
 * ExecutionContextMerger.ts — Engineering Sprint 8.0
 * Merges results from multiple connectors into a single UnifiedContext.
 * Pure function — no side effects.
 */

import type { ExecutionNodeResult, UnifiedContext } from "./MultiConnectorExecutionPlan";

// ── Normalizers per connector ──────────────────────────────────────────────────

function _extractCalendarEvents(output: unknown): unknown[] {
  if (!output || typeof output !== "object") return [];
  const o = output as Record<string, unknown>;
  // listEvents / today / thisWeek shape: { events: [] }
  if (Array.isArray(o.events)) return o.events;
  // readEvent shape: { ok, data }
  if (o.data && typeof o.data === "object" && "summary" in (o.data as object)) return [o.data];
  return [];
}

function _extractDriveFiles(output: unknown): unknown[] {
  if (!output || typeof output !== "object") return [];
  const o = output as Record<string, unknown>;
  if (Array.isArray(o.files)) return o.files;
  if (o.data && Array.isArray((o.data as Record<string, unknown>).files))
    return (o.data as Record<string, unknown>).files as unknown[];
  if (o.data && typeof o.data === "object") return [o.data];
  return [];
}

function _extractGmailMessages(output: unknown): unknown[] {
  if (!output || typeof output !== "object") return [];
  const o = output as Record<string, unknown>;
  if (Array.isArray(o.messages)) return o.messages;
  if (o.data && typeof o.data === "object" && (o.data as Record<string, unknown>).messages)
    return (o.data as Record<string, unknown>).messages as unknown[];
  return [];
}

// ── Merger ────────────────────────────────────────────────────────────────────

export function mergeExecutionContext(results: ExecutionNodeResult[]): UnifiedContext {
  const calendarEvents: unknown[] = [];
  const driveFiles:     unknown[] = [];
  const gmailMessages:  unknown[] = [];
  const sources:        string[]  = [];

  for (const r of results) {
    if (r.status !== "success") continue;
    // derive connectorId from nodeId prefix (e.g. "cal-today" → "calendar")
    if (r.nodeId.startsWith("cal")) {
      const evts = _extractCalendarEvents(r.output);
      calendarEvents.push(...evts);
      if (evts.length > 0 && !sources.includes("calendar")) sources.push("calendar");
    } else if (r.nodeId.startsWith("drv")) {
      const files = _extractDriveFiles(r.output);
      driveFiles.push(...files);
      if (files.length > 0 && !sources.includes("drive")) sources.push("drive");
    } else if (r.nodeId.startsWith("gml")) {
      const msgs = _extractGmailMessages(r.output);
      gmailMessages.push(...msgs);
      if (msgs.length > 0 && !sources.includes("gmail")) sources.push("gmail");
    }
  }

  const parts: string[] = [];
  if (calendarEvents.length > 0) parts.push(`${calendarEvents.length} evento(s) do calendario`);
  if (driveFiles.length > 0)     parts.push(`${driveFiles.length} arquivo(s) do Drive`);
  if (gmailMessages.length > 0)  parts.push(`${gmailMessages.length} email(s) do Gmail`);

  return {
    calendarEvents,
    driveFiles,
    gmailMessages,
    summary: parts.length > 0
      ? `Contexto unificado: ${parts.join(", ")}.`
      : "Nenhum resultado encontrado nos conectores consultados.",
    sources,
    mergedAt: Date.now(),
  };
}