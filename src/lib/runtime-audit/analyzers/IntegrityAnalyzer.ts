/**
 * IntegrityAnalyzer.ts — EF-60B.1
 *
 * Responsabilidade unica:
 * - Calcular o score de integridade do trace
 * - Justificar o score com detalhes observaveis
 *
 * Nao detecta NCs. Apenas consome resultados ja produzidos.
 */

import type { NonConformity, ExecutionMetrics, TraceIntegrityScore } from "@/lib/runtime-audit/AuditTypes";

export class IntegrityAnalyzer {

  compute(
    metrics: ExecutionMetrics,
    ncs:     NonConformity[],
  ): TraceIntegrityScore {
    const details: string[] = [];
    let score = 100;

    if (metrics.totalTraces === 0) {
      return { score: 0, label: "UNKNOWN", details: ["Nenhum trace disponivel para auditoria."] };
    }

    const incompleteRate = metrics.incompleteTraces / metrics.totalTraces;
    if (incompleteRate > 0) {
      const deduct = Math.round(incompleteRate * 30);
      score -= deduct;
      details.push(`${metrics.incompleteTraces} trace(s) incompleto(s) (-${deduct} pontos).`);
    }

    const CRITICAL_TYPES = ["MISSING_EXECUTION_ID", "CONTEXT_BREAK", "CHRONOLOGICAL_VIOLATION"];
    const critical = ncs.filter(n => CRITICAL_TYPES.includes(n.type));
    if (critical.length > 0) {
      const deduct = Math.min(40, critical.length * 10);
      score -= deduct;
      details.push(`${critical.length} NC(s) critica(s) detectada(s) (-${deduct} pontos).`);
    }

    const minor = ncs.filter(n => !CRITICAL_TYPES.includes(n.type));
    if (minor.length > 0) {
      const deduct = Math.min(20, minor.length * 5);
      score -= deduct;
      details.push(`${minor.length} NC(s) menor(es) detectada(s) (-${deduct} pontos).`);
    }

    if (metrics.totalEvents > 0 && metrics.completeTraces > 0) {
      details.push(
        `${metrics.totalEvents} eventos observados em ${metrics.completeTraces} execucao(oes) completa(s).`
      );
    }

    score = Math.max(0, score);
    const label = score >= 80 ? "HIGH" : score >= 50 ? "MEDIUM" : "LOW";

    return { score, label, details };
  }
}