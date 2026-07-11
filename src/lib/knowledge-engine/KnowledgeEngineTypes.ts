// Knowledge Engine v1.0 — Types
// Foundation v1.0 · Engineering First · Sprint 21

export type KnowledgeStatus    = "ACTIVE" | "ARCHIVED" | "REJECTED";
export type KnowledgeType      = "LESSON" | "BEST_PRACTICE" | "WARNING" | "RULE" | "PATTERN" | "ANTI_PATTERN" | "OBSERVATION";
export type KnowledgeImportance = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type KnowledgeConfidence = "LOW" | "MEDIUM" | "HIGH";

export interface KnowledgeEvidence {
  strengths:           ReadonlyArray<string>;
  weaknesses:          ReadonlyArray<string>;
  recommendations:     ReadonlyArray<string>;
  lessonsLearned:      ReadonlyArray<string>;
  bestPractices:       ReadonlyArray<string>;
  antiPatterns:        ReadonlyArray<string>;
  improvementPatterns: ReadonlyArray<string>;
}

export interface KnowledgeMetadata {
  domain:   string;
  category: string;
  tags:     ReadonlyArray<string>;
  keywords: ReadonlyArray<string>;
  version:  string;
  author:   string;
  language: string;
}

export interface Knowledge {
  // Core identity
  knowledgeId:   string;
  goalId:        string;
  executionId:   string;
  reflectionId:  string;
  evaluationId:  string;
  status:        KnowledgeStatus;

  // Content
  title:         string;
  summary:       string;
  knowledgeType: KnowledgeType;

  // Scores & classification
  confidence:    KnowledgeConfidence;
  importance:    KnowledgeImportance;
  qualityScore:  number; // 0..100 (from SelfEvaluation)
  knowledgeScore: number; // 0..100 (computed by KnowledgeEngine)

  // Source
  source:        string; // evaluationId + classification

  // Evidence
  evidence:      Readonly<KnowledgeEvidence>;

  // Metadata
  metadata:      Readonly<KnowledgeMetadata>;

  // Timing
  createdAt:     number;

  // Forward-compatibility (empty in v1.0)
  knowledgeFingerprint:    string;
  knowledgeEmbedding:      ReadonlyArray<number>;
  knowledgeVector:         ReadonlyArray<number>;
  knowledgeCluster:        string;
  knowledgeRelations:      ReadonlyArray<string>;
  knowledgeDependencies:   ReadonlyArray<string>;
  knowledgeConflicts:      ReadonlyArray<string>;
  knowledgeOpportunities:  ReadonlyArray<string>;
  futureCapabilities:      ReadonlyArray<string>;
  futureConnectors:        ReadonlyArray<string>;
  knowledgeVersion:        string;
  architectureVersion:     string;
  foundationVersion:       string;
}

export interface KnowledgeRejected {
  goalId:      string;
  executionId: string;
  reason:      string;
  overallScore: number;
  readyForLearning: boolean;
  timestamp:   number;
}

export interface KnowledgeLog {
  executionId:  string;
  knowledgeId:  string;
  goalId:       string;
  operation:    string;
  status:       "SUCCESS" | "FAILED";
  timestamp:    number;
  duration:     number;
  error?:       string;
}

export interface KnowledgeStatistics {
  totalKnowledge:       number;
  totalRejected:        number;
  totalArchived:        number;
  averageKnowledgeScore: number;
  knowledgeByType:      Readonly<Record<KnowledgeType, number>>;
  knowledgeByImportance: Readonly<Record<KnowledgeImportance, number>>;
  knowledgeReadyForMemory: number;
}

export interface KnowledgeMetrics {
  createTotal:  number;
  rejectTotal:  number;
  archiveTotal: number;
  avgDurationMs: number;
}

export interface KnowledgeHealth {
  status: "SUCCESS" | "FAILED";
  checks: {
    knowledgeIntegrity:  boolean;
    immutabilityCheck:   boolean;
    scoreIntegrity:      boolean;
    pipelineIntegrity:   boolean;
    forwardCompatibility: boolean;
  };
  details: string;
}

// Quality gate threshold
export const KNOWLEDGE_QUALITY_THRESHOLD = 55;