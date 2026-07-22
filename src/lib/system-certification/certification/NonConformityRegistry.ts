/**
 * NonConformityRegistry.ts — Sprint EF-55.1 Architectural Certification
 *
 * FASE 8: Registrar não conformidades por classe (critical/major/minor/observation).
 */

import type { NonConformity, NCClass } from "./OfficialCertificationReport";

let _ncSeq = 0;
function nc(
  cls: NCClass, module: string, description: string, evidence: string, recommendation: string,
): NonConformity {
  return Object.freeze({ id: `NC-${String(++_ncSeq).padStart(2, "0")}`, class: cls, module, description, evidence, recommendation });
}

export class NonConformityRegistry {
  build(): NonConformity[] {
    return [

      // ── Major ────────────────────────────────────────────────────────────────

      nc("major", "RuntimeTraceCollector + IntegrationAuditor",
        "Pipeline de evidência cobre apenas EF-51→EF-54. EF-43, EF-45, EF-46, EF-47, EF-48, EF-49, EF-50 não integrados.",
        "Prompt especifica pipeline completo: 'Goal → EF-43 → EF-45 → ... → EF-54'. RuntimeTraceCollector inicia em LearningEngine.learn(). EF-43 a EF-50 ausentes.",
        "Integrar engines EF-43→EF-50 ao RuntimeTraceCollector. plannerId, strategyId, capabilityId, episodeId devem ser IDs reais."),

      nc("major", "RuntimeTraceCollector → ConnectorSnapshot",
        "ConnectorSnapshot simula execução de conector (wasExecuted = input.success) sem invocar o conector real.",
        "Código: 'wasExecuted: input.success' — valor vem do parâmetro de entrada, não de execução real.",
        "Invocar conector real via UniversalConnectorRouter ou connector registry ao construir o snapshot."),

      // ── Minor ────────────────────────────────────────────────────────────────

      nc("minor", "CertificationMetrics",
        "Threshold de certificação definido em 80, mas prompt especifica confidence ≥ 95%.",
        "const CERTIFICATION_THRESHOLD = 80 em CertificationMetrics.ts",
        "Após integração completa dos engines, ajustar threshold para 95."),

      nc("minor", "SprintEF555Page.jsx",
        "Dashboard não possui abas separadas 'Runtime Evidence', 'Connector Validation' e 'Certification Confidence' como especificado no prompt.",
        "Prompt: 'Adicionar: Golden Scenarios / Pipeline Integrity / Runtime Evidence / Connector Validation / Certification Confidence'. Implementado como 8 abas diferentes.",
        "Adicionar abas dedicadas em versão futura. Conteúdo existe distribuído — sem perda funcional."),

      nc("minor", "RuntimeEvidenceCollector",
        "reflectionId obtido via getLastReport() — pode capturar reflexão de execução anterior.",
        "Linha: 'reflectionId: lastMeta?.reflection.id ?? \"missing\"'. getLastReport() retorna o último da sessão.",
        "Capturar meta.reflection.id diretamente durante a execução e passá-lo via closure."),

      // ── Observation ───────────────────────────────────────────────────────────

      nc("observation", "SCTypes.ts",
        "Typo em deterministmScore — deveria ser deterministicScore.",
        "Campo declarado como 'readonly deterministmScore: number' em CertificationMetrics interface.",
        "Renomear em próximo ciclo de manutenção."),

      nc("observation", "ScenarioValidator",
        "Filtro issues.filter(i => !i.includes('warning')) é sempre verdadeiro — lógica inerte.",
        "Nenhuma issue gerada contém a string 'warning'. O filtro não remove nada.",
        "Remover filtro ou usar tags de severidade explícitas em IssueItem."),

      nc("observation", "RuntimeTraceCollector",
        "knowledge_store.artifactId usa makeSCId('ks') pois KnowledgeStore não emite IDs.",
        "KnowledgeStore é um Map estático sem operações rastreáveis por ID.",
        "Adicionar campo lastWriteId ao KnowledgeStore em sprint de observabilidade."),
    ];
  }
}