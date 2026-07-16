/**
 * MissionDefinition.ts — Engineering Sprint 8.1
 * Core types for the Mission Planner.
 *
 * A Mission represents a USER OBJECTIVE — not a connector, not an API.
 * Missions are connector-agnostic: they express WHAT, never HOW.
 */

// ── Capability reference (connector-agnostic) ─────────────────────────────────

export interface CapabilityRef {
  capabilityId: string;           // e.g. "calendar.nextMeeting"
  connectorId:  string;           // resolved by MissionCapabilityResolver
  priority:     number;           // 1 = highest
  dependsOn:    string[];         // other capabilityIds in this mission
  mode:         "parallel" | "sequential";
  timeoutMs:    number;
  label:        string;
}

// ── Mission definition ────────────────────────────────────────────────────────

export type MissionId =
  | "PrepareMeeting"
  | "FindCustomerInformation"
  | "SummarizeProject"
  | "ReviewPendingTasks"
  | "PrepareTrip"
  | "ReviewInvoices"
  | string;   // extensible

export interface MissionDefinition {
  id:                    MissionId;
  name:                  string;
  description:           string;
  requiredEntities:      string[];   // e.g. ["meeting", "date"]
  optionalEntities:      string[];   // e.g. ["participant", "location"]
  priority:              number;     // global priority (1=highest)
  successCriteria:       string[];   // human-readable
  recommendedCapabilities: CapabilityRef[];
  fallbackCapabilities:  CapabilityRef[];
  aggregationStrategy:   "template" | "llm";
  estimatedDurationMs:   number;
}

// ── Mission context (runtime state) ──────────────────────────────────────────

export interface MissionEntity {
  type:  string;
  value: string;
}

export interface MissionContext {
  id:              string;
  missionId:       MissionId;
  rawQuery:        string;
  entities:        MissionEntity[];
  resolvedCapabilities: CapabilityRef[];
  executionPlanId: string | null;
  unifiedContext:  unknown | null;
  finalResponse:   string | null;
  status:          "pending" | "running" | "success" | "partial" | "failed";
  startedAt:       number;
  finishedAt:      number | null;
  durationMs:      number | null;
  connectorsUsed:  string[];
  successScore:    number;   // 0–100
}

// ── Resolution result ─────────────────────────────────────────────────────────

export interface MissionResolutionResult {
  missionId:    MissionId;
  confidence:   number;   // 0–1
  matchedTerms: string[];
}