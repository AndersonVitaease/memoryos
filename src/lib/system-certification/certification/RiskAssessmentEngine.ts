/**
 * RiskAssessmentEngine.ts — Sprint EF-55.1 Architectural Certification
 *
 * FASE 7: Identificar e classificar riscos arquiteturais.
 */

import type { RiskItem } from "./OfficialCertificationReport";

let _riskSeq = 0;
function risk(
  level: RiskItem["level"], impact: RiskItem["impact"], prob: RiskItem["probability"],
  title: string, description: string, mitigation: string,
): RiskItem {
  return Object.freeze({ id: `RISK-${String(++_riskSeq).padStart(2, "0")}`, level, impact, probability: prob, title, description, mitigation });
}

export class RiskAssessmentEngine {
  assess(): RiskItem[] {
    return [
      risk("high", "high", "high",
        "EF-43 a EF-50 não integrados ao pipeline de certificação",
        "O RuntimeTraceCollector chama apenas EF-51→EF-54. Os engines EF-43 (Cognitive Orchestrator), EF-45 (Dynamic Planning), EF-46 (Strategy Selection), EF-47 (Strategy Generation), EF-48 (Capability Reasoning), EF-49 (Authority Engine) e EF-50 (Episodic Memory real) não são invocados. plannerId, strategyId, capabilityId e episodeId são sintéticos. A certificação não cobre 7 dos 12 engines do escopo declarado.",
        "Integrar EF-43→EF-50 ao RuntimeTraceCollector. Prioridade crítica para EF-56."),

      risk("high", "high", "medium",
        "ConnectorSnapshot simula execução de conector",
        "wasExecuted = input.success — o conector não é realmente invocado. A ConnectorValidation certifica uma simulação, não uma execução real. Risco de falsa aprovação em cenários de conector.",
        "Implementar invocação real de connectores via UniversalConnectorRouter ou GitHubConnector. EF-56 deve incluir este requisito."),

      risk("medium", "medium", "high",
        "Threshold de certificação em 80, prompt exige 95%",
        "CertificationMetrics usa CERTIFICATION_THRESHOLD = 80. O prompt especifica 'Confidence ≥ 95%'. Diferença de 15pp que pode aprovar implementações que não atingem o critério oficial.",
        "Ajustar threshold para 95 após integração completa de EF-43→EF-50. Não alterar agora para não falsear resultado."),

      risk("medium", "medium", "medium",
        "reflectionId usa getLastReport() — frágil em ambiente concorrente",
        "RuntimeEvidenceCollector obtém reflectionId via MetaCognitiveEngine.getLastReport(). Em execuções concorrentes ou reuso de instância, pode retornar reflexão de execução anterior.",
        "Capturar meta.reflection.id diretamente durante a execução e propagá-lo para ExecutionEvidence."),

      risk("medium", "medium", "low",
        "knowledge_store.artifactId é sintético",
        "KnowledgeStore não produz IDs de operação. O artifactId 'ks_...' é gerado por makeSCId(). Não compromete a execução mas cria inconsistência no modelo de evidência.",
        "Adicionar KnowledgeStore.lastWriteId ou similar em EF-51 para rastreabilidade."),

      risk("low", "low", "high",
        "Typo: deterministmScore (falta 'i')",
        "Campo nomeado deterministmScore em SCTypes.ts, CertificationMetrics.ts e SprintEF555Page.jsx. Não afeta funcionalidade mas quebra contrato de nomenclatura.",
        "Renomear para deterministicScore em refactor posterior. Corrigir junto com next sprint de manutenção."),

      risk("low", "low", "medium",
        "ScenarioValidator: filtro de 'warning' em issues não funciona como esperado",
        "A condição !i.includes('warning') nunca filtra issues pois nenhuma mensagem contém a string 'warning'. O filtro é inerte — equivale a issues.length === 0.",
        "Remover o filtro ou implementá-lo corretamente com tags explícitas de severidade em issues."),

      risk("low", "low", "low",
        "GoldenScenarioRunner executa cenários sequencialmente",
        "8 cenários em loop sequencial. Para o volume atual é aceitável (<10s total), mas crescimento futuro pode degradar UX.",
        "Considerar Promise.all() com limite de concorrência em sprints futuras de performance."),
    ];
  }
}