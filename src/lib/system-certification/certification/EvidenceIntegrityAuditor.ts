/**
 * EvidenceIntegrityAuditor.ts — Sprint EF-55.1 Architectural Certification
 *
 * FASE 5+6: Evidence Validation + Pipeline Validation.
 * Verifica quais evidências são reais vs sintéticas/mistas.
 * Baseado em leitura direta do código auditado.
 */

import type { EvidenceIntegrityCheck } from "./OfficialCertificationReport";

export class EvidenceIntegrityAuditor {
  auditEvidence(): { checks: EvidenceIntegrityCheck[]; score: number } {
    const checks: EvidenceIntegrityCheck[] = [

      { module: "RuntimeTraceCollector.learning.artifactId",
        check: "learning.id vem de LearningEngine.learn() — engine real EF-51",
        isSynthetic: false, evidence: "const learning = LearningEngine.learn(eps); learning.id → artifactId", verdict: "REAL" },

      { module: "RuntimeTraceCollector.reasoning.artifactId",
        check: "reasoning.id vem de KnowledgeReasoningEngine.reason() — engine real EF-52",
        isSynthetic: false, evidence: "const reasoning = KnowledgeReasoningEngine.reason({...}); reasoning.id → artifactId", verdict: "REAL" },

      { module: "RuntimeTraceCollector.optimization.artifactId",
        check: "optReport.id vem de SelfOptimizationEngine.analyze() — engine real EF-53",
        isSynthetic: false, evidence: "const optReport = SelfOptimizationEngine.analyze(snap); optReport.id → artifactId", verdict: "REAL" },

      { module: "RuntimeTraceCollector.meta_cognition.artifactId",
        check: "meta.id vem de MetaCognitiveEngine.analyze() — engine real EF-54",
        isSynthetic: false, evidence: "const meta = MetaCognitiveEngine.analyze({...}); meta.id → artifactId", verdict: "REAL" },

      { module: "RuntimeTraceCollector.knowledge_store.artifactId",
        check: "knowledge_store.artifactId = makeSCId('ks') — KnowledgeStore não produz IDs",
        isSynthetic: true, evidence: "KnowledgeStore é um store estático sem ID de operação — limitação da engine", verdict: "SYNTHETIC" },

      { module: "RuntimeTraceCollector.ConnectorSnapshot.connectorId",
        check: "connectorId = makeSCId('conn') — não é ID de conector real",
        isSynthetic: true, evidence: "ConnectorSnapshot criado internamente com makeSCId('conn'). Conector não foi executado de fato — é simulado via input.success.", verdict: "SYNTHETIC" },

      { module: "RuntimeEvidenceCollector.plannerId",
        check: "plannerId = makeSCId('plan') — EF-43 não integrado",
        isSynthetic: true, evidence: "EF-43 CognitiveOrchestrator não é chamado no pipeline real. ID é sintético.", verdict: "SYNTHETIC" },

      { module: "RuntimeEvidenceCollector.strategyId",
        check: "strategyId = makeSCId('strat') — EF-46 não integrado",
        isSynthetic: true, evidence: "EF-46 StrategySelectionEngine não é chamado. ID é sintético.", verdict: "SYNTHETIC" },

      { module: "RuntimeEvidenceCollector.capabilityId",
        check: "capabilityId = makeSCId('cap') — EF-48 não integrado",
        isSynthetic: true, evidence: "EF-48 CapabilityReasoningEngine não é chamado. ID é sintético.", verdict: "SYNTHETIC" },

      { module: "RuntimeEvidenceCollector.episodeId",
        check: "episodeId = 'ep_' + goalId — não é ID de episódio do EpisodeStore (EF-50)",
        isSynthetic: true, evidence: "EF-50 não integrado. episodeId construído como string concatenada.", verdict: "SYNTHETIC" },

      { module: "RuntimeTraceCollector.episodes",
        check: "Episódios criados inline com Array.from() — não vêm de EpisodeStore real",
        isSynthetic: true, evidence: "eps = Array.from({ length: input.episodeCount }, ...) — dados de entrada são parâmetros, não episódios reais capturados durante uso.", verdict: "SYNTHETIC" },

      { module: "ExecutionEvidence.decisionConf",
        check: "decisionConf vem de rr.metrics.decisionConf via KnowledgeReasoningEngine — real",
        isSynthetic: false, evidence: "rr = KnowledgeReasoningEngine.reason({...}); rr.decision.confidence → decisionConf", verdict: "REAL" },

      { module: "ExecutionEvidence.metaConf + biasCount",
        check: "metaConf e biasCount vêm de MetaCognitiveEngine.analyze() — real",
        isSynthetic: false, evidence: "mc.metrics.metaConfidence + mc.biases.length via engine EF-54", verdict: "REAL" },

      { module: "ExecutionEvidence.reflectionId",
        check: "reflectionId = MetaCognitiveEngine.getLastReport()?.reflection.id — real mas frágil",
        isSynthetic: false, evidence: "Usa getLastReport() do singleton — pode retornar reflexão de execução anterior em ambiente concorrente.", verdict: "MIXED" },
    ];

    const real      = checks.filter(c => c.verdict === "REAL").length;
    const synthetic = checks.filter(c => c.verdict === "SYNTHETIC").length;
    const mixed     = checks.filter(c => c.verdict === "MIXED").length;
    const total     = checks.length;
    const score     = Math.round((real * 1.0 + mixed * 0.5) / total * 100);

    return { checks, score };
  }

  auditPipeline(): { stages: { stage: string; hasEvidence: boolean; note: string }[]; score: number } {
    const stages = [
      { stage: "Goal",          hasEvidence: true,  note: "GoalSnapshot com goalId real capturado pelo RuntimeTraceCollector" },
      { stage: "EF-43 Planner", hasEvidence: false, note: "NÃO integrado — plannerId é sintético (makeSCId)" },
      { stage: "EF-45 Planning",hasEvidence: false, note: "NÃO integrado — sem artefato real" },
      { stage: "EF-46 Strategy",hasEvidence: false, note: "NÃO integrado — strategyId é sintético" },
      { stage: "EF-47 StratGen",hasEvidence: false, note: "NÃO integrado — sem artefato real" },
      { stage: "EF-48 CapReas", hasEvidence: false, note: "NÃO integrado — capabilityId é sintético" },
      { stage: "EF-49 Authority",hasEvidence: false, note: "NÃO integrado — sem artefato real" },
      { stage: "EF-50 Episode", hasEvidence: false, note: "Episodes criados inline — não vêm do EpisodeStore real" },
      { stage: "EF-51 Learning",hasEvidence: true,  note: "LearningEngine.learn() real — ID e métricas reais" },
      { stage: "EF-52 Reasoning",hasEvidence: true, note: "KnowledgeReasoningEngine.reason() real — ID e métricas reais" },
      { stage: "EF-53 Optimization",hasEvidence: true, note: "SelfOptimizationEngine.analyze() real — ID e métricas reais" },
      { stage: "EF-54 Meta",    hasEvidence: true,  note: "MetaCognitiveEngine.analyze() real — ID, biases, reflection reais" },
    ];

    const covered = stages.filter(s => s.hasEvidence).length;
    const score   = Math.round(covered / stages.length * 100);
    return { stages, score };
  }
}