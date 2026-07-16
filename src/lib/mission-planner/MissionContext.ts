/**
 * MissionContext.ts — Engineering Sprint 8.1
 * Runtime state for a mission execution.
 * Persists history to localStorage.
 */

import type { MissionContext } from "./MissionDefinition";

const STORAGE_KEY = "mission_context_history_v1";
const MAX_HISTORY = 30;

function _load(): MissionContext[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); }
  catch { return []; }
}
function _save(items: MissionContext[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_HISTORY))); }
  catch { /* non-blocking */ }
}

let _seq = 1;
export function createMissionContext(
  missionId: string,
  rawQuery:  string,
): MissionContext {
  return {
    id:                   `mctx-${Date.now()}-${(_seq++).toString().padStart(4,"0")}`,
    missionId,
    rawQuery,
    entities:             [],
    resolvedCapabilities: [],
    executionPlanId:      null,
    unifiedContext:       null,
    finalResponse:        null,
    status:               "pending",
    startedAt:            Date.now(),
    finishedAt:           null,
    durationMs:           null,
    connectorsUsed:       [],
    successScore:         0,
  };
}

export function saveContext(ctx: MissionContext): void {
  const all = _load();
  const idx = all.findIndex((c) => c.id === ctx.id);
  if (idx >= 0) all[idx] = ctx;
  else all.unshift(ctx);
  _save(all);
}

export function loadContextHistory(): MissionContext[] { return _load(); }
export function clearContextHistory(): void { _save([]); }

/** Compute success score 0–100 based on context state */
export function computeSuccessScore(ctx: MissionContext): number {
  let score = 0;
  if (ctx.status === "success")  score += 40;
  if (ctx.status === "partial")  score += 20;
  if (ctx.connectorsUsed.length > 0)  score += 20;
  if (ctx.connectorsUsed.length >= 2) score += 20;
  if (ctx.finalResponse && ctx.finalResponse.length > 50) score += 20;
  return Math.min(100, score);
}