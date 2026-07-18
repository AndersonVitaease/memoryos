// DisclosureTypes.ts — Sprint EF-36 — Knowledge Disclosure Engine

export type DisclosureLevel =
  | "PUBLIC"
  | "BASIC"
  | "ADVANCED"
  | "DEVELOPER"
  | "INTERNAL"
  | "ARCHITECTURE"
  | "ENGINEERING"
  | "SYSTEM";

export type KnowledgeClassification =
  | "PUBLIC"
  | "PRODUCT"
  | "BUSINESS"
  | "DEVELOPER"
  | "INTERNAL"
  | "ARCHITECTURE"
  | "ENGINEERING"
  | "SYSTEM";

export type UserProfileType =
  | "Visitor"
  | "Customer"
  | "Power User"
  | "Developer"
  | "Administrator"
  | "MemoryOS Engineer";

export type DisclosureDecision = "ALLOW" | "PARTIAL" | "DENY";

export interface DisclosureContext {
  userId?: string;
  profileType: UserProfileType;
  requestedLevel?: DisclosureLevel;
  componentName: string;
  classification: KnowledgeClassification;
  responseText: string;
  knowledgeSources?: string[];
}

export interface DisclosureResult {
  decision: DisclosureDecision;
  authorizedLevel: DisclosureLevel;
  userMaxLevel: DisclosureLevel;
  responseText: string;           // final, safe response
  transformed: boolean;
  originalClassification: KnowledgeClassification;
  disclosureLevel: DisclosureLevel;
  reason: string;
  auditId: string;
  timestamp: number;
}

export interface DisclosureAuditEntry {
  readonly id: string;
  readonly timestamp: number;
  readonly userId?: string;
  readonly profileType: UserProfileType;
  readonly componentName: string;
  readonly classification: KnowledgeClassification;
  readonly userMaxLevel: DisclosureLevel;
  readonly decision: DisclosureDecision;
  readonly transformed: boolean;
  readonly reason: string;
  readonly knowledgeSources: string[];
}