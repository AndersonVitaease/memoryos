/**
 * operational-intelligence — OIE (Operational Intelligence Engine)
 *
 * Modulo raiz. Fase 1 (Sprint 1) exporta apenas o RuntimeObserver e o
 * classificador de error_signature. Modulos das fases seguintes serao
 * adicionados aqui conforme implementados:
 *
 *   Fase 1.5: IntentRecorder
 *   Fase 2:   ArchitectureIndexer
 *   Fase 2.5: DecisionAnalyzer
 *   Fase 3:   CoverageAnalyzer
 *   Fase 4:   RegressionAnalyzer + HealthMonitor + TrendLayer
 *   Fase 4.5: EvidenceEngine
 *   Fase 5:   Explainer
 *
 * Missao do OIE: explicar continuamente o comportamento do MemoryOS.
 * Diagnostico e subproduto; learning e projecao temporal; produto e
 * dominio futuro no mesmo engine. OIE e consultivo, nunca autonomo.
 */

export { RuntimeObserver } from "./RuntimeObserver";
export type { ObservationInput } from "./RuntimeObserver";
export { classifyErrorSignature } from "./errorSignatureClassifier";