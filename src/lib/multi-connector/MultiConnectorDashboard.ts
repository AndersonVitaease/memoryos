/**
 * MultiConnectorDashboard.ts — Engineering Sprint 8.0
 * Dashboard data layer — mock-capable for UI without live connectors.
 */

import type { MultiConnectorExecutionResult, MultiConnectorExecutionPlan } from "./MultiConnectorExecutionPlan";

export interface MCOEDashboardData {
  lastPlan:    MultiConnectorExecutionPlan | null;
  lastResult:  MultiConnectorExecutionResult | null;
  history:     HistoryEntry[];
}

export interface HistoryEntry {
  planId:         string;
  rawQuery:       string;
  scenarioId:     string;
  totalMs:        number;
  parallelSavMs:  number;
  nodeCount:      number;
  failureCount:   number;
  sources:        string[];
  executedAt:     number;
}

const STORAGE_KEY = "mcoe_history_v1";
const MAX_HISTORY = 20;

function _loadHistory(): HistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; }
}
function _saveHistory(h: HistoryEntry[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(h)); } catch { /* non-blocking */ }
}

export function recordExecution(plan: MultiConnectorExecutionPlan, result: MultiConnectorExecutionResult): void {
  const all = _loadHistory();
  all.unshift({
    planId:        plan.id,
    rawQuery:      plan.rawQuery,
    scenarioId:    plan.scenarioId,
    totalMs:       result.totalDurationMs,
    parallelSavMs: result.parallelSavingsMs,
    nodeCount:     result.nodeResults.length,
    failureCount:  result.partialFailures.length,
    sources:       result.unifiedContext.sources,
    executedAt:    result.startedAt,
  });
  _saveHistory(all.slice(0, MAX_HISTORY));
}

export function getHistory(): HistoryEntry[] { return _loadHistory(); }
export function clearHistory(): void { _saveHistory([]); }