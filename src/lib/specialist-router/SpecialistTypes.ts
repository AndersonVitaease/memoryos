// ─── Specialist Router — Types ─────────────────────────────────────────────────
// Foundation v1.0 · Specialist Contract · Scores · Routing Session

import type { Capability, CapabilityManifest } from "@/lib/capabilities/registry/CapabilityContract";

// ── Specialist domain taxonomy ────────────────────────────────────────────────

export type SpecialistDomain =
  | "juridico" | "contabil" | "tributario" | "financeiro"
  | "anvisa" | "comercio_exterior" | "rh" | "ti"
  | "marketing" | "operacional" | "compliance" | "geral";

export type SelectionMode =
  | "Single" | "Multi" | "Collaborative" | "Sequential" | "Parallel";

export type RoutingStatus = "Running" | "Completed" | "Failed";

// ── Specialist contract (extends Capability via metadata) ─────────────────────

export interface SpecialistContract {
  id: string;
  name: string;
  version: string;
  domain: SpecialistDomain;
  description: string;
  capabilities: string[];
  supportedGoals: string[];       // keywords that trigger this specialist
  supportedKnowledge: string[];
  supportedConnectors: string[];
  confidenceLevel: number;        // 0–1 base confidence
  permissions: string[];
  tags: string[];
  available: boolean;
  metadata: Record<string, unknown>;
}

/** A Specialist is a Capability with SpecialistContract stored in manifest.metadata.specialist */
export interface SpecialistCapability extends Capability {
  readonly manifest: CapabilityManifest & {
    metadata: { specialist: SpecialistContract };
  };
}

// ── Match scores ──────────────────────────────────────────────────────────────

export interface SpecialistScores {
  domainScore:       number; // 0–100
  capabilityScore:   number;
  knowledgeScore:    number;
  connectorScore:    number;
  contextScore:      number;
  availabilityScore: number;
  experienceScore:   number;
  overallScore:      number;
}

export interface ScoreExplanation {
  dimension: keyof SpecialistScores;
  value:     number;
  rationale: string;
}

// ── Routing result ────────────────────────────────────────────────────────────

export interface SpecialistMatch {
  specialist:   SpecialistContract;
  scores:       SpecialistScores;
  explanations: ScoreExplanation[];
  rationale:    string;
  selected:     boolean;
  rankPosition: number;
}

export interface OrchestrationStep {
  order:       number;
  specialistId: string;
  mode:        "sequential" | "parallel";
  dependsOn:   string[]; // specialistIds
}

export interface RoutingSession {
  id:             string;
  goalId:         string;
  goalTitle:      string;
  query:          string;
  selectionMode:  SelectionMode;
  matches:        SpecialistMatch[];
  selected:       SpecialistMatch[];
  rejected:       SpecialistMatch[];
  orchestration:  OrchestrationStep[];
  rationale:      string;
  auditLog:       RoutingAuditEntry[];
  status:         RoutingStatus;
  createdAt:      number;
  updatedAt:      number;
  metadata:       Record<string, unknown>;
}

// ── Audit ─────────────────────────────────────────────────────────────────────

export interface RoutingAuditEntry {
  id:        string;
  timestamp: number;
  operation: string;
  detail?:   string;
  success:   boolean;
  error?:    string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let _c = 0;
export function makeSRId(prefix = "sr"): string {
  return `${prefix}_${Date.now()}_${(++_c).toString(36)}`;
}

export function makeRoutingAudit(op: string, opts: { detail?: string; success?: boolean; error?: string } = {}): RoutingAuditEntry {
  return { id: makeSRId("sraud"), timestamp: Date.now(), operation: op, success: opts.success ?? true, detail: opts.detail, error: opts.error };
}