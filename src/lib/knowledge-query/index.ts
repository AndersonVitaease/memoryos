/**
 * Knowledge Query Engine — public barrel
 * Sprint: INTEGRATION-02
 *
 * Consumers MUST import from this index or KnowledgeQueryFacade only.
 */
export * from "./KnowledgeQueryTypes";
export { KnowledgeQueryFacade }   from "./KnowledgeQueryFacade";
export { KnowledgeQueryEngine }   from "./KnowledgeQueryEngine";
export { KnowledgeQueryAudit }    from "./KnowledgeQueryAudit";
export { KnowledgeQueryMetricsEngine } from "./KnowledgeQueryMetrics";
export { KnowledgeQueryRegistry } from "./KnowledgeQueryRegistry";
export { KnowledgeQueryCache }    from "./KnowledgeQueryCache";
export { KnowledgeQueryPipeline } from "./KnowledgeQueryPipeline";