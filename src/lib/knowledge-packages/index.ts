/**
 * index.ts — Knowledge Package Runtime
 * Exports oficiais do modulo Knowledge Package Runtime.
 * MDS v2.0 · Chapter 2 — Engineering Conventions
 */

export { FinancialPackage }           from "./FinancialPackage";
export { LegalPackage }               from "./LegalPackage";
export { BrazilianGovernmentPackage } from "./BrazilianGovernmentPackage";
export { runKnowledgePackageTests }   from "./knowledgePackageTests";
export type {
  KnowledgeNodeType,
  KnowledgeEdgeRelation,
  SourceType,
  KnowledgeNode,
  KnowledgeEdge,
  KnowledgeSource,
  KnowledgePackageManifest,
  KnowledgePackageContent,
  KnowledgeQueryResult,
  KnowledgePackageHealthResult,
  KnowledgePackageMetrics,
  KnowledgePackageTestReport,
  KnowledgePackageTestResult,
} from "./KnowledgePackageTypes";