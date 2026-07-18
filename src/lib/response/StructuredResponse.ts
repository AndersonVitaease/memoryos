// StructuredResponse.ts — Sprint EF-36.1
// Official internal response format for MemoryOS Core

import type { KnowledgeClassification } from "@/lib/disclosure/DisclosureTypes";

export type JustificationTag =
  | "CONNECTOR_SELECTION"
  | "MEMORY_RETRIEVAL"
  | "GOAL_PLANNING"
  | "DECISION"
  | "POLICY"
  | "GOVERNANCE"
  | "AUTHORIZATION"
  | "KNOWLEDGE_SEARCH"
  | "MEMORY_UPDATE"
  | "SPECIALIST_SELECTION"
  | "CAPABILITY_SELECTION"
  | "PIPELINE_EXECUTION";

export interface ResponseFact {
  id: string;
  text: string;
  classification: KnowledgeClassification;
}

export interface ResponseReasoning {
  id: string;
  text: string;
  classification: KnowledgeClassification;
}

export interface ResponseAction {
  id: string;
  title: string;
  description: string;
  classification: KnowledgeClassification;
}

export interface ResponseComponent {
  id: string;
  name: string;
  role: string;
  classification: KnowledgeClassification;
}

export interface ResponseExample {
  id: string;
  text: string;
  classification: KnowledgeClassification;
}

export interface ResponseWarning {
  id: string;
  text: string;
  classification: KnowledgeClassification;
}

export interface ResponseMetadata {
  generatedBy: string;
  pipelineVersion: string;
  timestamp: number;
  confidence: number;
  specialist?: string;
  knowledgeSources: string[];
  justificationTags: JustificationTag[];
}

export interface StructuredResponse {
  facts: ResponseFact[];
  reasoning: ResponseReasoning[];
  actions: ResponseAction[];
  components: ResponseComponent[];
  confidence?: number;
  citations?: string[];
  examples?: ResponseExample[];
  warnings?: ResponseWarning[];
  metadata: ResponseMetadata;
}

// Disclosure result wrapping a filtered StructuredResponse
export interface StructuredDisclosureResult {
  authorized: StructuredResponse;
  removedFacts: ResponseFact[];
  removedReasoning: ResponseReasoning[];
  removedActions: ResponseAction[];
  removedComponents: ResponseComponent[];
  decision: "ALLOW" | "PARTIAL" | "DENY";
  userMaxLevel: import("@/lib/disclosure/DisclosureTypes").DisclosureLevel;
  auditId: string;
  timestamp: number;
}