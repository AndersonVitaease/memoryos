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

      // NC-07 REMEDIADO: knowledge_store.artifactId agora usa KnowledgeStore.lastWriteId
      { module: "RuntimeTraceCollector.knowledge_store.artifactId",
        check: "[REMEDIADO NC-07] artifactId = KnowledgeStore.lastWriteId — ID real da ultima regra escrita",
        isSynthetic: false, evidence: "KnowledgeStore.lastWriteId exposto via getter. RuntimeTraceCollector usa lastWriteId quando != 'none'.", verdict: "REAL" },

      // NC-02 REMEDIADO: wasExecuted=false, resultado honesto
      { module: "RuntimeTraceCollector.ConnectorSnapshot",
        check: "[REMEDIADO NC-02] wasExecuted=false, result='not_invoked_in_certification_sandbox'",
        isSynthetic: false, evidence: "ConnectorSnapshot honesto sobre limitacao do sandbox de certificacao.", verdict: "MIXED" },

      // NC-01: IDs proxy agora marcados explicitamente com prefixo PROXY_
      { module: "RuntimeEvidenceCollector.plannerId",
        check: "[REMEDIADO NC-01] plannerId = PROXY_plan_<goalId> — EF-43 nao integrado, marcado explicitamente",
        isSynthetic: true, evidence: "Prefixo PROXY_ torna o carater sintetico explicito e auditavel.", verdict: "SYNTHETIC" },

      { module: "RuntimeEvidenceCollector.strategyId",
        check: "[REMEDIADO NC-01] strategyId = PROXY_strat_<goalId> — EF-46 nao integrado",
        isSynthetic: true, evidence: "Prefixo PROXY_ explicito.", verdict: "SYNTHETIC" },

      { module: "RuntimeEvidenceCollector.capabilityId",
        check: "[REMEDIADO NC-01] capabilityId = PROXY_cap_<goalId> — EF-48 nao integrado",
        isSynthetic: true, evidence: "Prefixo PROXY_ explicito.", verdict: "SYNTHETIC" },

      { module: "RuntimeEvidenceCollector.episodeId",
        check: "[REMEDIADO NC-01] episodeId = PROXY_ep_<goalId> — EF-50 nao integrado",
        isSynthetic: true, evidence: "Prefixo PROXY_ explicito.", verdict: "SYNTHETIC" },

      { module: "RuntimeTraceCollector.episodes",
        check: "Episodes criados inline com Array.from() — nao vem de EpisodeStore real",
        isSynthetic: true, evidence: "Limitacao arquitetural documentada. EF-50 nao integrado.", verdict: "SYNTHETIC" },

      { module: "ExecutionEvidence.decisionConf",
        check: "decisionConf vem de rr.metrics.decisionConf via KnowledgeReasoningEngine — real",
        isSynthetic: false, evidence: "rr = KnowledgeReasoningEngine.reason({...}); rr.decision.confidence → decisionConf", verdict: "REAL" },

      { module: "ExecutionEvidence.metaConf + biasCount",
        check: "metaConf e biasCount vêm de MetaCognitiveEngine.analyze() — real",
        isSynthetic: false, evidence: "mc.metrics.metaConfidence + mc.biases.length via engine EF-54", verdict: "REAL" },

      // NC-04 REMEDIADO: reflectionId agora do snapshot, não getLastReport()
      { module: "RuntimeEvidenceCollector.reflectionId",
        check: "[REMEDIADO NC-04] reflectionId capturado do outputHash do step meta_cognition via regex — não mais getLastReport()",
        isSynthetic: false, evidence: "reflectionIdFromSnapshot = mc?.outputHash.match(/reflection_id=([^\\s,]+)/)?.[1]", verdict: "REAL" },
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
      { stage: "EF-43 Planner", hasEvidence: false, note: "[NC-01] Nao integrado — plannerId = PROXY_plan_<goalId> (marcado explicitamente)" },
      { stage: "EF-45 Planning",hasEvidence: false, note: "[NC-01] Nao integrado — sem artefato real" },
      { stage: "EF-46 Strategy",hasEvidence: false, note: "[NC-01] Nao integrado — strategyId = PROXY_strat_<goalId>" },
      { stage: "EF-47 StratGen",hasEvidence: false, note: "[NC-01] Nao integrado — sem artefato real" },
      { stage: "EF-48 CapReas", hasEvidence: false, note: "[NC-01] Nao integrado — capabilityId = PROXY_cap_<goalId>" },
      { stage: "EF-49 Authority",hasEvidence: false, note: "[NC-01] Nao integrado — sem artefato real" },
      { stage: "EF-50 Episode", hasEvidence: false, note: "[NC-01] Nao integrado — episodeId = PROXY_ep_<goalId>" },
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