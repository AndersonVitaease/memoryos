// Foundation Compliance Engine — Public API
// Foundation v1.0 · Engineering First · Sprint FKM-1

export { FoundationComplianceEngine }              from "./FoundationComplianceEngine";
export { loadFoundationRules, invalidateRuleCache } from "./FoundationRuleLoader";
export { ComplianceEvaluator }                     from "./ComplianceEvaluator";
export { FoundationDocumentParser }                from "./FoundationDocumentParser";
export { FoundationKnowledgeModelBuilder }         from "./FoundationKnowledgeModel";
export { FoundationKnowledgeAPI }                  from "./FoundationKnowledgeAPI";
export { runAllConsumers }                         from "./fkmConsumers";
export { runFKMTests }                             from "./fkmTests";
export type { ParsedDocument, ParsedSection, ParsedElement, ElementType } from "./FoundationDocumentParser";
export type { FoundationKnowledgeModel, KnowledgeDocument, KnowledgeAtom } from "./FoundationKnowledgeModel";
export type { QueryResult, QueryLogEntry, KnowledgeAPIStatistics, StatisticsResult, CountResult } from "./FoundationKnowledgeAPI";
export type {
  FCEReport,
  FCEComplianceScore,
  ComplianceEvidence,
  FoundationRule,
  FCELogEntry,
  FCESeverity,
  FCEStatus,
  RuleCategory,
} from "./FCETypes";