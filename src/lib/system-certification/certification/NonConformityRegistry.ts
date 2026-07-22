/**
 * NonConformityRegistry.ts — Sprint EF-55.2 Remediation
 *
 * FASE 8: Registrar não conformidades por classe.
 * Atualizado após remediação EF-55.2 — NCs resolvidas marcadas como RESOLVED.
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

      // ── Major (remediados) ────────────────────────────────────────────────────

      // NC-01 REMEDIATION: IDs proxy agora explicitamente marcados com prefixo PROXY_
      // eliminando a ilusão de rastreabilidade. EF-43→EF-50 ainda não integrados
      // (limitação arquitetural documentada), mas o sistema agora é honesto sobre isso.
      nc("observation", "RuntimeEvidenceCollector",
        "[REMEDIADO NC-01] plannerId/strategyId/capabilityId/episodeId agora prefixados com PROXY_ — sem mais ilusão de rastreabilidade.",
        "RuntimeEvidenceCollector: PROXY_PREFIX = 'PROXY' aplicado a todos os IDs de engines não integrados.",
        "Integrar EF-43/46/48/50 como singletons chamáveis para eliminar o PROXY completamente."),

      // NC-02 REMEDIATION: wasExecuted agora false com nota explicativa
      nc("observation", "RuntimeTraceCollector → ConnectorSnapshot",
        "[REMEDIADO NC-02] wasExecuted=false com resultado 'not_invoked_in_certification_sandbox' — sem mais simulação de execução.",
        "ConnectorSnapshot: wasExecuted=false, result='not_invoked_in_certification_sandbox'",
        "Implementar invocação real de connectores em EF-56 com OAuth tokens disponíveis."),

      // ── Minor (remediados) ────────────────────────────────────────────────────

      // NC-03 REMEDIATION: threshold ajustado de 80 para 95
      nc("observation", "CertificationMetrics",
        "[REMEDIADO NC-03] CERTIFICATION_THRESHOLD ajustado de 80 para 95 — conforme prompt.",
        "CertificationMetrics.ts: const CERTIFICATION_THRESHOLD = 95",
        "Nenhuma ação adicional necessária."),

      // NC-04 REMEDIATION: reflectionId agora capturado do snapshot, não getLastReport()
      nc("observation", "RuntimeEvidenceCollector",
        "[REMEDIADO NC-04] reflectionId capturado do outputHash do snapshot meta_cognition — não mais getLastReport().",
        "reflectionIdFromSnapshot = mc?.outputHash.match(/reflection_id=([^\\s,]+)/)?.[1] ?? 'missing'",
        "Nenhuma ação adicional necessária."),

      // NC-05: Abas do dashboard — conteúdo existe distribuído, sem perda funcional
      nc("minor", "SprintEF555Page.jsx",
        "Dashboard não possui abas separadas 'Runtime Evidence', 'Connector Validation' e 'Certification Confidence' como especificado no prompt.",
        "Implementado como 8 abas diferentes. Conteúdo existe distribuído.",
        "Adicionar abas dedicadas em versão futura. Baixo impacto funcional."),

      // ── Observation (remediados) ──────────────────────────────────────────────

      // NC-05 typo REMEDIATION: deterministicScore adicionado como campo correto
      nc("observation", "SCTypes.ts",
        "[REMEDIADO NC-05] deterministicScore adicionado como campo correto. deterministmScore mantido por compatibilidade.",
        "SCTypes.ts: 'readonly deterministicScore: number' adicionado ao CertificationMetrics.",
        "Remover deterministmScore em próximo ciclo de manutenção após atualização dos consumidores."),

      // NC-06 REMEDIATION: filtro inerte removido
      nc("observation", "ScenarioValidator",
        "[REMEDIADO NC-06] Filtro inerte !i.includes('warning') removido. status agora baseado diretamente em issues.length.",
        "ScenarioValidator: 'const status = issues.length === 0 ? pass : score >= 70 ? warn : fail'",
        "Nenhuma ação adicional necessária."),

      // NC-07 REMEDIATION: lastWriteId adicionado ao KnowledgeStore
      nc("observation", "KnowledgeStore + RuntimeTraceCollector",
        "[REMEDIADO NC-07] KnowledgeStore.lastWriteId adicionado. knowledge_store.artifactId agora usa lastWriteId quando disponível.",
        "KnowledgeStore: 'get lastWriteId(): string'. RuntimeTraceCollector usa lastWriteId como artifactId.",
        "Nenhuma ação adicional necessária."),
    ];
  }
}