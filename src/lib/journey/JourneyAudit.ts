// ─── Journey Audit ────────────────────────────────────────────────────────────
// Foundation v1.0 · Reutiliza padrão IAuditLogger; não duplica responsabilidades

import type { JourneyAuditEntry, JourneyStatus, Journey } from "./types";
import { makeJourneyId } from "./types";

/** Append an audit entry to a Journey's auditLog (mutates in place) */
export function recordAudit(
  journey: Journey,
  operation: string,
  opts: {
    fromStatus?: JourneyStatus;
    toStatus?: JourneyStatus;
    taskId?: string;
    capabilityId?: string;
    success?: boolean;
    durationMs?: number;
    error?: string;
    detail?: string;
  } = {}
): void {
  const entry: JourneyAuditEntry = {
    id:           makeJourneyId("aud"),
    timestamp:    Date.now(),
    operation,
    success:      opts.success ?? true,
    fromStatus:   opts.fromStatus,
    toStatus:     opts.toStatus,
    taskId:       opts.taskId,
    capabilityId: opts.capabilityId,
    durationMs:   opts.durationMs,
    error:        opts.error,
    detail:       opts.detail,
  };
  journey.auditLog.push(entry);
}

/** Append a timeline entry to a Journey (mutates in place) */
export function recordTimeline(
  journey: Journey,
  event: string,
  detail: string,
  actor = "system"
): void {
  journey.timeline.push({
    id:        makeJourneyId("tl"),
    timestamp: Date.now(),
    event,
    detail,
    actor,
  });
}