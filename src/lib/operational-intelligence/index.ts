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

// Fase 1.5 (Sprint 2) — Intent Recorder
export { IntentRecorder } from "./IntentRecorder";
export type { IntentRecordInput } from "./IntentRecorder";
export { computeIntentHash, normalizeIntent, extractQuantifiers, fnv1a32 } from "./intentNormalizer";

// Fase 2 (Sprint 3) — Architecture Indexer
export { ArchitectureIndexer } from "./ArchitectureIndexer";
export type { ArchitectureMap, ExpectedCapability, ConnectorMetaProjection, DriftReport, DriftFinding } from "./ArchitectureIndexer";

// Fase 2.5 (Sprint 5) — Decision Analyzer
export { DecisionAnalyzer } from "./DecisionAnalyzer";
export type { DecisionAnalysis, IntentGroup } from "./DecisionAnalyzer";

// Fase 3 (Sprint 4) — Coverage Analyzer
export { CoverageAnalyzer } from "./CoverageAnalyzer";
export type { CoverageAnalysis, IntentProjection, ActualExecution } from "./CoverageAnalyzer";

// Fase 4 (Sprint 6) — Regression Analyzer + Health Monitor + Trend Layer
export { RegressionAnalyzer } from "./RegressionAnalyzer";
export type { SprintProfile, RegressionFinding, RegressionReport } from "./RegressionAnalyzer";
export { HealthMonitor } from "./HealthMonitor";
export type { HealthSnapshot, ConnectorHealth } from "./HealthMonitor";
export { TrendLayer } from "./TrendLayer";
export type { TrendMetric, BucketGranularity, TrendPoint, TrendProjection } from "./TrendLayer";

// Fase 4.5 (Sprint 7) — Evidence Engine
export { EvidenceEngine } from "./EvidenceEngine";
export type { EvidencePacket, EvidenceClaim } from "./EvidenceEngine";

// Fase 5 (Sprint 8) — Explainer (modulo final)
export { Explainer } from "./Explainer";
export type { Explanation, ExplanationSummary, Severity } from "./Explainer";

// Sprint 11 — AnomalyPredictor: camada preditiva deterministica (least-squares sobre buckets)
export { AnomalyPredictor } from "./AnomalyPredictor";
export type { PredictionReport, PredictionFinding, PredictionFindingType, PredictionPoint } from "./AnomalyPredictor";
// Track 1 (Sprint 9) — OIEAlertBus: promove OIE de shadow -> ativo (consultivo)
export { OIEAlertBus, extractAlerts } from "./OIEAlertBus";
export type { OIEAlert } from "./OIEAlertBus";

// Sprint 10 — OIEConfig: configuracao consultiva (master switch, modulos, limiares, bus pause)
export { OIEConfig, DEFAULT_OIE_CONFIG } from "./OIEConfig";
export type { OIEConfigShape, OIEThresholds } from "./OIEConfig";

// Orchestrator — coordena todas as fases
export { OIEOrchestrator } from "./OIEOrchestrator";
export type { OIEAnalysisResult } from "./OIEOrchestrator";

// Ponte OIE -> BugFinding (unifica observacao interna com Bug Hunter externo)
export { OIEBugFindingBridge } from "./OIEBugFindingBridge";