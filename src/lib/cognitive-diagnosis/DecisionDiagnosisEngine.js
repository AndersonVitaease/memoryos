/**
 * DecisionDiagnosisEngine.js — Cognitive Diagnosis Platform (CDP)
 * Sprint 7.1.2 — FASE 3
 *
 * Diagnostica problemas nas decisões cognitivas.
 * Produz um relatório estruturado com severity, categoria e recomendações.
 *
 * Read-only. Apenas observa e diagnostica.
 */

// ─── Severity ──────────────────────────────────────────────────────────────────

const SEVERITY = { CRITICAL: "CRITICAL", HIGH: "HIGH", MEDIUM: "MEDIUM", LOW: "LOW", INFO: "INFO" };

function finding(severity, category, issue, recommendation, evidence = []) {
  return { severity, category, issue, recommendation, evidence, ts: Date.now() };
}

// ─── Individual diagnostic checks ─────────────────────────────────────────────

function diagnoseLowConfidence(trace) {
  const findings = [];
  if (trace.confidence < 0.3) {
    findings.push(finding(
      SEVERITY.CRITICAL, "CONFIDENCE",
      `Confiança muito baixa: ${(trace.confidence * 100).toFixed(0)}%`,
      "Aumentar contexto de memória ou acionar mais especialistas",
      [`Confidence: ${trace.confidence}`]
    ));
  } else if (trace.confidence < 0.5) {
    findings.push(finding(
      SEVERITY.HIGH, "CONFIDENCE",
      `Confiança abaixo do ideal: ${(trace.confidence * 100).toFixed(0)}%`,
      "Revisar qualidade das memórias utilizadas",
      [`Confidence: ${trace.confidence}`]
    ));
  }
  return findings;
}

function diagnoseMemoryQuality(trace) {
  const findings = [];
  const memories = trace.memories ?? [];

  if (memories.length === 0) {
    findings.push(finding(
      SEVERITY.HIGH, "MEMORY",
      "Nenhuma memória utilizada na resposta",
      "Verificar se há memória relevante no banco para esta query",
      ["0 memórias recuperadas"]
    ));
    return findings;
  }

  const highCount = memories.filter((m) => m.priority === "HIGH").length;
  if (highCount === 0) {
    findings.push(finding(
      SEVERITY.MEDIUM, "MEMORY",
      "Nenhuma memória de alta prioridade disponível",
      "Considerar enriquecer o Knowledge Graph com mais contexto",
      [`${memories.length} memórias recuperadas, 0 com prioridade HIGH`]
    ));
  }

  const avgScore = memories.length
    ? memories.reduce((s, m) => s + (m.score ?? 0), 0) / memories.length
    : 0;
  if (avgScore < 0.35) {
    findings.push(finding(
      SEVERITY.MEDIUM, "MEMORY",
      `Score médio de memória muito baixo: ${avgScore.toFixed(2)}`,
      "Memória insuficiente ou irrelevante para esta query",
      [`Avg score: ${avgScore.toFixed(3)}`]
    ));
  }

  return findings;
}

function diagnoseContextSufficiency(trace) {
  const findings = [];
  const ctx = trace.context ?? {};

  if (!ctx.sessionSummary && (ctx.entitiesCount ?? 0) === 0 && (ctx.decisionsCount ?? 0) === 0) {
    findings.push(finding(
      SEVERITY.HIGH, "CONTEXT",
      "Contexto vazio: sem resumo, entidades ou decisões",
      "Esta sessão ainda não possui histórico suficiente. Continuar conversando.",
      ["sessionSummary: null", "entitiesCount: 0", "decisionsCount: 0"]
    ));
  }

  if ((ctx.builtAtMs ?? 0) > 5000) {
    findings.push(finding(
      SEVERITY.LOW, "PERFORMANCE",
      `Construção de contexto lenta: ${ctx.builtAtMs}ms`,
      "Avaliar otimização das queries paralelas de contexto",
      [`Context build time: ${ctx.builtAtMs}ms`]
    ));
  }

  return findings;
}

function diagnoseSpecialists(trace) {
  const findings = [];
  const specialists = trace.specialists ?? [];
  const activated = specialists.filter((s) => s.activated);

  if (activated.length === 0) {
    findings.push(finding(
      SEVERITY.MEDIUM, "SPECIALIST",
      "Nenhum especialista ativado",
      "O roteamento não identificou domínio específico. Avaliar enrichment do Specialist Router.",
      ["0 especialistas ativados"]
    ));
  }

  const failed = activated.filter((s) => s.error);
  if (failed.length > 0) {
    findings.push(finding(
      SEVERITY.HIGH, "SPECIALIST",
      `${failed.length} especialista(s) com erro`,
      "Verificar disponibilidade dos especialistas indicados",
      failed.map((s) => `${s.name}: ${s.error}`)
    ));
  }

  return findings;
}

function diagnoseConnectors(trace) {
  const findings = [];
  const connectors = trace.connectors ?? [];

  const failures = connectors.filter((c) => c.status === "error");
  const retries = connectors.filter((c) => (c.retryCount ?? 0) > 0);

  if (failures.length > 0) {
    findings.push(finding(
      SEVERITY.HIGH, "CONNECTOR",
      `${failures.length} conector(es) com falha`,
      "Verificar conectividade e autenticação dos conectores",
      failures.map((c) => `${c.name}: ${c.status}`)
    ));
  }

  if (retries.length > 0) {
    findings.push(finding(
      SEVERITY.LOW, "CONNECTOR",
      `${retries.length} conector(es) com retries`,
      "Monitorar latência dos conectores externos",
      retries.map((c) => `${c.name}: ${c.retryCount} retry(ies)`)
    ));
  }

  return findings;
}

function diagnoseGoals(trace) {
  const findings = [];
  const goals = trace.goals ?? [];

  if (goals.length === 0) {
    findings.push(finding(
      SEVERITY.INFO, "GOAL",
      "Nenhum objetivo indexado para esta conversa",
      "Criar um Goal explícito para melhorar o contexto orientado por objetivos",
      ["0 goals no Goal Memory Index"]
    ));
  }

  return findings;
}

function diagnoseLatency(trace) {
  const findings = [];

  if ((trace.durationMs ?? 0) > 10000) {
    findings.push(finding(
      SEVERITY.HIGH, "PERFORMANCE",
      `Latência total elevada: ${trace.durationMs}ms`,
      "Avaliar gargalos no pipeline (especialistas, conectores, memória)",
      [`Total duration: ${trace.durationMs}ms`]
    ));
  } else if ((trace.durationMs ?? 0) > 5000) {
    findings.push(finding(
      SEVERITY.MEDIUM, "PERFORMANCE",
      `Latência acima do ideal: ${trace.durationMs}ms`,
      "Monitorar performance dos passos mais lentos do pipeline",
      [`Total duration: ${trace.durationMs}ms`]
    ));
  }

  const slowPipeline = (trace.pipeline ?? []).filter((s) => (s.durationMs ?? 0) > 3000);
  if (slowPipeline.length > 0) {
    findings.push(finding(
      SEVERITY.MEDIUM, "PERFORMANCE",
      `Etapas lentas: ${slowPipeline.map((s) => s.name).join(", ")}`,
      "Otimizar as etapas indicadas do pipeline",
      slowPipeline.map((s) => `${s.name}: ${s.durationMs}ms`)
    ));
  }

  return findings;
}

function diagnoseOutcome(trace) {
  const findings = [];
  const outcome = trace.outcome;
  if (!outcome) return findings;

  if (outcome.resolved === false) {
    findings.push(finding(
      SEVERITY.HIGH, "OUTCOME",
      "Resposta não resolveu o problema do usuário",
      "Analisar memórias utilizadas e considerar contexto adicional",
      ["outcome.resolved: false"]
    ));
  }

  if (outcome.corrected) {
    findings.push(finding(
      SEVERITY.MEDIUM, "OUTCOME",
      "Resposta precisou de correção pelo usuário",
      "Revisar qualidade do raciocínio e memórias utilizadas",
      ["outcome.corrected: true"]
    ));
  }

  if (outcome.repeated) {
    findings.push(finding(
      SEVERITY.MEDIUM, "OUTCOME",
      "Usuário precisou repetir a pergunta",
      "Verificar se a resposta foi suficientemente clara e completa",
      ["outcome.repeated: true"]
    ));
  }

  return findings;
}

// ─── Main diagnosis function ──────────────────────────────────────────────────

/**
 * Gera diagnóstico completo de um trace.
 * @param {Object} trace - CognitiveTrace
 * @returns {Object} DiagnosisReport
 */
export function diagnoseTrace(trace) {
  if (!trace) return null;

  const allFindings = [
    ...diagnoseLowConfidence(trace),
    ...diagnoseMemoryQuality(trace),
    ...diagnoseContextSufficiency(trace),
    ...diagnoseSpecialists(trace),
    ...diagnoseConnectors(trace),
    ...diagnoseGoals(trace),
    ...diagnoseLatency(trace),
    ...diagnoseOutcome(trace),
  ];

  const bySeverity = {};
  for (const s of Object.values(SEVERITY)) {
    bySeverity[s] = allFindings.filter((f) => f.severity === s).length;
  }

  const overallHealth = allFindings.some((f) => f.severity === "CRITICAL") ? "CRITICAL"
    : allFindings.some((f) => f.severity === "HIGH") ? "DEGRADED"
    : allFindings.some((f) => f.severity === "MEDIUM") ? "WARNING"
    : allFindings.length === 0 ? "HEALTHY" : "INFO";

  return {
    traceId: trace.traceId,
    diagnosedAt: Date.now(),
    overallHealth,
    totalFindings: allFindings.length,
    bySeverity,
    findings: allFindings,
    recommendations: allFindings
      .filter((f) => ["CRITICAL", "HIGH"].includes(f.severity))
      .map((f) => f.recommendation),
  };
}

/**
 * Diagnóstico rápido sem trace completo — apenas dados básicos.
 */
export function quickDiagnose({ confidence, memoryCount, specialistCount, durationMs }) {
  const issues = [];
  if (confidence < 0.4) issues.push("Baixa confiança");
  if (memoryCount === 0) issues.push("Memória insuficiente");
  if (specialistCount === 0) issues.push("Nenhum especialista ativado");
  if (durationMs > 8000) issues.push("Latência elevada");
  return { issues, healthy: issues.length === 0 };
}