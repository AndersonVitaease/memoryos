// Learning Engine v1.0 -- Types
// Foundation v1.0 · Engineering First · Sprint 22

import type { KnowledgeType, KnowledgeImportance, KnowledgeConfidence } from "@/lib/knowledge-engine/KnowledgeEngineTypes";

export type LearningType       = KnowledgeType;
export type LearningImportance = KnowledgeImportance;
export type LearningConfidence = KnowledgeConfidence;
export type LearningStatus     = "ACTIVE" | "ARCHIVED" | "REJECTED";

export interface LearningMetadata {
  version:             string;
  author:              string;
  language:            string;
  sourceEngine:        string;
  knowledgeVersion:    string;
  foundationVersion:   string;
  architectureVersion: string;
  createdBy:           string;
}

export interface Learning {
  learningId:   string;
  knowledgeId:  string;
  goalId:       string;
  executionId:  string;
  reflectionId: string;
  evaluationId: string;
  status:       LearningStatus;

  learningType:  LearningType;
  confidence:    LearningConfidence;
  importance:    LearningImportance;
  learningScore: number;

  title:           string;
  summary:         string;
  insights:        ReadonlyArray<string>;
  patterns:        ReadonlyArray<string>;
  recommendations: ReadonlyArray<string>;

  metadata:  Readonly<LearningMetadata>;
  createdAt: number;

  // Forward-compatibility (empty in v1.0)
  learningFingerprint:    string;
  learningEmbedding:      ReadonlyArray<number>;
  learningVector:         ReadonlyArray<number>;
  learningCluster:        string;
  learningRelations:      ReadonlyArray<string>;
  learningDependencies:   ReadonlyArray<string>;
  learningConflicts:      ReadonlyArray<string>;
  learningOpportunities:  ReadonlyArray<string>;
  futureCapabilities:     ReadonlyArray<string>;
  futureConnectors:       ReadonlyArray<string>;
}

export interface LearningRejected {
  knowledgeId:     string;
  goalId:          string;
  reason:          string;
  knowledgeScore:  number;
  knowledgeStatus: string;
  timestamp:       number;
}

export interface LearningLog {
  learningId:  string;
  knowledgeId: string;
  goalId:      string;
  operation:   string;
  status:      "SUCCESS" | "FAILED";
  timestamp:   number;
  duration:    number;
  error?:      string;
}

export interface LearningStatistics {
  totalLearning:        number;
  totalRejected:        number;
  totalArchived:        number;
  averageLearningScore: number;
  learningByType:       Readonly<Record<LearningType, number>>;
  learningByImportance: Readonly<Record<LearningImportance, number>>;
  readyForMemory:       number;
}

export interface LearningMetrics {
  createTotal:   number;
  rejectTotal:   number;
  archiveTotal:  number;
  avgDurationMs: number;
}

export interface LearningHealth {
  status: "SUCCESS" | "FAILED";
  checks: {
    learningIntegrity:    boolean;
    immutabilityCheck:    boolean;
    scoreIntegrity:       boolean;
    pipelineIntegrity:    boolean;
    forwardCompatibility: boolean;
  };
  details: string;
}

export const LEARNING_QUALITY_THRESHOLD = 60;