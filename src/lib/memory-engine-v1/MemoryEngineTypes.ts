// Memory Engine v1.0 -- Types
// Foundation v1.0 · Engineering First · Sprint 23

import type { LearningType, LearningImportance, LearningConfidence } from "@/lib/learning-engine/LearningEngineTypes";

export type MemoryType       = LearningType;
export type MemoryImportance = LearningImportance;
export type MemoryConfidence = LearningConfidence;
export type MemoryStatus     = "ACTIVE" | "ARCHIVED" | "REJECTED";

export interface MemoryMetadata {
  version:             string;
  author:              string;
  language:            string;
  sourceEngine:        string;
  learningVersion:     string;
  knowledgeVersion:    string;
  foundationVersion:   string;
  architectureVersion: string;
  createdBy:           string;
}

export interface MemoryEvidence {
  insights:        ReadonlyArray<string>;
  patterns:        ReadonlyArray<string>;
  recommendations: ReadonlyArray<string>;
}

export interface Memory {
  memoryId:     string;
  learningId:   string;
  knowledgeId:  string;
  goalId:       string;
  executionId:  string;
  reflectionId: string;
  evaluationId: string;
  status:       MemoryStatus;

  // Mirror Principle — no recalculation
  memoryType:   MemoryType;
  memoryScore:  number;
  importance:   MemoryImportance;
  confidence:   MemoryConfidence;

  title:    string;
  summary:  string;

  evidence: Readonly<MemoryEvidence>;
  metadata: Readonly<MemoryMetadata>;

  createdAt: number;

  // Forward-compatibility (empty in v1.0)
  memoryFingerprint:    string;
  memoryEmbedding:      ReadonlyArray<number>;
  memoryVector:         ReadonlyArray<number>;
  memoryCluster:        string;
  memoryRelations:      ReadonlyArray<string>;
  memoryDependencies:   ReadonlyArray<string>;
  memoryConflicts:      ReadonlyArray<string>;
  memoryOpportunities:  ReadonlyArray<string>;
  futureCapabilities:   ReadonlyArray<string>;
  futureConnectors:     ReadonlyArray<string>;
  memoryVersion:        string;
  architectureVersion:  string;
  foundationVersion:    string;
}

export interface MemoryRejected {
  learningId:    string;
  goalId:        string;
  reason:        string;
  learningScore: number;
  learningStatus: string;
  timestamp:     number;
}

export interface MemoryLog {
  memoryId:   string;
  learningId: string;
  goalId:     string;
  operation:  string;
  status:     "SUCCESS" | "FAILED";
  timestamp:  number;
  duration:   number;
  error?:     string;
}

export interface MemoryStatistics {
  totalMemory:        number;
  totalRejected:      number;
  totalArchived:      number;
  averageMemoryScore: number;
  memoryByType:       Readonly<Record<MemoryType, number>>;
  memoryByImportance: Readonly<Record<MemoryImportance, number>>;
  readyForRetrieval:  number;
}

export interface MemoryMetrics {
  createTotal:   number;
  rejectTotal:   number;
  archiveTotal:  number;
  avgDurationMs: number;
}

export interface MemoryHealth {
  status: "SUCCESS" | "FAILED";
  checks: {
    memoryIntegrity:      boolean;
    immutabilityCheck:    boolean;
    scoreIntegrity:       boolean;
    pipelineIntegrity:    boolean;
    forwardCompatibility: boolean;
  };
  details: string;
}

// Memory Gate threshold — higher than Learning (70 vs 60)
export const MEMORY_QUALITY_THRESHOLD = 70;