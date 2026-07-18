// KipTypes.ts — Sprint EF-37 — Knowledge Ingestion Pipeline

export type SourceType =
  | "conversation" | "document" | "email" | "file" | "connector"
  | "github" | "google_drive" | "gmail" | "base44" | "markdown"
  | "json" | "txt" | "pdf" | "chatgpt_export";

export type EntityType =
  | "Person" | "Company" | "Project" | "Product" | "Document"
  | "Connector" | "Specialist" | "Location" | "Event" | "Date"
  | "Technology" | "API" | "Library" | "Framework";

export type DecisionType =
  | "IMPLEMENT" | "ABANDON" | "CHANGE" | "REVERT" | "ACCEPT"
  | "REJECT" | "HYPOTHESIS" | "ROADMAP" | "DEFER" | "DEPRECATE";

export type MemoryType =
  | "Temporary" | "Working" | "LongTerm" | "Permanent"
  | "Procedural" | "Semantic" | "Project" | "Engineering"
  | "Business" | "Personal";

export type DuplicateType = "semantic" | "textual" | "partial" | "temporal";
export type ConflictType  = "decision" | "incompatible" | "strategy" | "architectural";

export interface KipMessage {
  id: string;
  author: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  attachments?: string[];
  metadata?: Record<string, unknown>;
}

export interface KipConversation {
  id: string;
  sourceType: SourceType;
  title?: string;
  messages: KipMessage[];
  metadata?: Record<string, unknown>;
  importedAt: number;
}

export interface ExtractedFact {
  id: string;
  text: string;
  confidence: number;
  messageId: string;
}

export interface ExtractedAction {
  id: string;
  text: string;
  confidence: number;
  messageId: string;
}

export interface SemanticBundle {
  facts:     ExtractedFact[];
  actions:   ExtractedAction[];
  goals:     string[];
  ideas:     string[];
  questions: string[];
  answers:   string[];
  context:   string;
}

export interface ExtractedEntity {
  id: string;
  type: EntityType;
  value: string;
  context: string;
  messageId: string;
  confidence: number;
}

export interface ExtractedDecision {
  id: string;
  type: DecisionType;
  subject: string;
  description: string;
  messageId: string;
  timestamp: number;
  confidence: number;
  evidence: string;
}

export interface ClassifiedMemory {
  id: string;
  type: MemoryType;
  content: string;
  confidence: number;
  sourceMessageId: string;
  tags: string[];
}

export interface DuplicateMatch {
  memoryId: string;
  existingId: string;
  duplicateType: DuplicateType;
  similarity: number;
  action: "skip" | "merge" | "keep_both";
}

export interface ConflictRecord {
  id: string;
  type: ConflictType;
  description: string;
  itemA: string;
  itemB: string;
  resolution: "archive_older" | "merge" | "flag" | "pending";
  resolvedAt?: number;
}

export interface ConsolidatedMemory {
  id: string;
  type: MemoryType;
  content: string;
  version: number;
  history: string[];
  archivedVersions: string[];
  summary: string;
  tags: string[];
  evidence: import("./KnowledgeEvidence").KnowledgeEvidence;
}

export interface KnowledgeGraphNode {
  id: string;
  type: "Project" | "Component" | "Decision" | "Specialist" | "File" | "Conversation" | "Connector" | "User";
  label: string;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeGraphEdge {
  from: string;
  to: string;
  relation: string;
  weight: number;
}

export interface KipResult {
  conversationId: string;
  sourceType: SourceType;
  stats: {
    messages: number;
    facts: number;
    actions: number;
    entities: number;
    decisions: number;
    memories: number;
    duplicatesSkipped: number;
    conflictsDetected: number;
    graphNodes: number;
    graphEdges: number;
    durationMs: number;
  };
  memories: ConsolidatedMemory[];
  entities: ExtractedEntity[];
  decisions: ExtractedDecision[];
  conflicts: ConflictRecord[];
  auditId: string;
}