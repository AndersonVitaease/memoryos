/**
 * index.ts — Knowledge Fusion Engine (Sprint 8.12)
 * Public surface — exports all types and singletons.
 */

export type {
  KFEInput,
  KFEResult,
  UnifiedKnowledgeModel,
  FusedEntity,
  ConflictRecord,
  KnowledgeRelationship,
  EvidenceRecord,
  KFEStatistics,
  RawKnowledgeUnit,
  KnowledgeUnitType,
  KnowledgeSourceId,
  RelationshipType,
} from "./KFETypes";

export { knowledgeFusionEngine,         KnowledgeFusionEngine         } from "./KnowledgeFusionEngine";
export { knowledgeDeduplicator,         KnowledgeDeduplicator         } from "./KnowledgeDeduplicator";
export { knowledgeConflictResolver,     KnowledgeConflictResolver     } from "./KnowledgeConflictResolver";
export { knowledgeRelationshipBuilder,  KnowledgeRelationshipBuilder  } from "./KnowledgeRelationshipBuilder";
export { knowledgeConfidenceCalculator, KnowledgeConfidenceCalculator } from "./KnowledgeConfidenceCalculator";
export { runKFECertificationSuite                                      } from "./KnowledgeFusionCertificationSuite";
export type { KFECertReport, KFECertCase                              } from "./KnowledgeFusionCertificationSuite";