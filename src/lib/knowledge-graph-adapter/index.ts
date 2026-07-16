/**
 * knowledge-graph-adapter — Sprint M-06.2A
 * Public API for the KnowledgeGraphAdapter module.
 */

export { adaptKnowledgeGraphToProviders, adaptFromKnowledgeGraphStore } from "./KnowledgeGraphAdapter";
export type { AdapterResult } from "./KnowledgeGraphAdapter";
export { certifyKGA, runKGATests } from "./kgaTests";
export type { KGACertificationReport, KGATestResult } from "./kgaTests";