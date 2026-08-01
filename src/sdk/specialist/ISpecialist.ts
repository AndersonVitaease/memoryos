/**
 * ISpecialist.ts — Specialist SDK
 * Official interface every MemoryOS Specialist MUST implement.
 * MDPS-compliant — Specialists provide domain knowledge, never make decisions.
 */

export type SpecialistDomain =
  | "legal"
  | "financial"
  | "medical"
  | "technical"
  | "government"
  | "education"
  | "marketing"
  | "hr"
  | "general";

export interface ExpertiseDeclaration {
  readonly topic: string;
  readonly confidence: number;       // 0.0–1.0
  readonly sources: readonly string[];
  readonly limitations: readonly string[];
  readonly language: string;         // e.g. "pt-BR"
}

export interface SpecialistManifest {
  readonly specialistId: string;     // e.g. "com.memoryos.legal-specialist"
  readonly name: string;
  readonly domain: SpecialistDomain;
  readonly subdomain?: string;
  readonly version: string;          // semver
  readonly author: string;
  readonly expertise: readonly ExpertiseDeclaration[];
  readonly languages: readonly string[];
}

export interface SpecialistRequest {
  readonly query: string;
  readonly sessionId: string;
  readonly executionId: string;
  readonly context?: Record<string, unknown>;
}

export interface KnowledgeFact {
  readonly claim: string;
  readonly confidence: number;
  readonly source: string;
  readonly validUntil?: string;
}

export interface SpecialistResponse {
  readonly specialistId: string;
  readonly facts: readonly KnowledgeFact[];
  readonly reasoning: readonly string[];
  readonly recommendations: readonly string[];
  readonly confidence: number;
  readonly sources: readonly string[];
  readonly limitations: readonly string[];
  readonly durationMs: number;
}

export interface ISpecialist {
  readonly manifest: SpecialistManifest;
  readonly id: string;
  readonly domain: SpecialistDomain;

  /** Execute domain analysis and return structured knowledge. */
  execute(request: SpecialistRequest): Promise<SpecialistResponse>;

  /** Lightweight check — returns true if this specialist can handle the query. */
  canHandle(query: string): boolean;

  /** Returns current operational health. */
  health(): { status: "healthy" | "degraded" | "unavailable"; details: string };
}