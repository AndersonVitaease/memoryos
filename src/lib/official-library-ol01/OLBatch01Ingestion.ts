/**
 * OLBatch01Ingestion.ts — Official Library Batch 01
 *
 * Ingestion registry for Batch 01 — Core Foundation documents.
 * Documents are registered as-read: no summarization, no reinterpretation.
 *
 * Authority: OFFICIAL | Status: FROZEN
 */

export interface OLIngestedDocument {
  readonly id:            string;
  readonly name:          string;
  readonly version:       string;
  readonly authority:     "OFFICIAL";
  readonly status:        "FROZEN";
  readonly category:      string;
  readonly path:          string;
  readonly ingestedAt:    number;
  readonly integrity:     "VALID";
  readonly lineCount:     number;
  readonly sections:      readonly string[];
  readonly components:    readonly string[];
  readonly crossRefs:     readonly string[];
  readonly adrs:          readonly string[];
  readonly rfcs:          readonly string[];
  readonly dependencies:  readonly string[];
  readonly knowledgeGraphUpdated: true;
  readonly masterIndexUpdated:    true;
}

export const BATCH_01: readonly OLIngestedDocument[] = Object.freeze([
  {
    id:          "MV-001",
    name:        "MV — MemoryOS Vision",
    version:     "1.0",
    authority:   "OFFICIAL",
    status:      "FROZEN",
    category:    "VISION",
    path:        "src/docs/00-official-library/MV-MemoryOS-Vision.md",
    ingestedAt:  Date.now(),
    integrity:   "VALID",
    lineCount:   198,
    sections: [
      "1. Introducao", "2. Visao", "3. Missao", "4. O Problema", "5. A Nova Proposta",
      "6. Definicao Oficial", "7. Principios Fundamentais", "8. Filosofia", "9. Confianca",
      "10. Evolucao Natural", "11. Aprendizado", "12. Independencia", "13. Continuidade",
      "14. Objetivo de Longo Prazo", "15. Valores", "16. Declaracao Oficial", "17. Missao Final",
    ],
    components:  ["MemoryOS Core", "Memory Layer", "Connectors", "Specialists", "Official Library"],
    crossRefs:   ["MPS-001", "MAS-001", "MDS-001", "MES-001"],
    adrs:        [],
    rfcs:        ["RFC-000", "RFC-001"],
    dependencies: [],
    knowledgeGraphUpdated: true,
    masterIndexUpdated:    true,
  },
  {
    id:          "MPS-001",
    name:        "MPS — MemoryOS Product Specification",
    version:     "1.0",
    authority:   "OFFICIAL",
    status:      "FROZEN",
    category:    "VISION",
    path:        "src/docs/00-official-library/MPS-MemoryOS-Product-Specification.md",
    ingestedAt:  Date.now(),
    integrity:   "VALID",
    lineCount:   341,
    sections: [
      "Declaracao", "1. Visao do Produto", "2. Missao", "3. Visao de Longo Prazo",
      "4. Publico-Alvo", "5. Proposta de Valor", "6. Filosofia do Produto",
      "7. Jornada do Usuario", "8. Comunicacao", "9. Transparencia",
      "10. Papel da IA", "11. Escalabilidade", "12. Mercados Estrategicos",
      "13. Principios Permanentes", "14. Nao Objetivos", "15. Criterios de Sucesso",
      "Checklist de Conformidade", "Declaracao Final",
    ],
    components:  ["MemoryOS Core", "Journey Engine", "Policy Engine", "Connectors", "Specialists"],
    crossRefs:   ["MV-001", "MAS-001", "MDS-001"],
    adrs:        ["ADR-001"],
    rfcs:        ["RFC-001"],
    dependencies: ["MV-001"],
    knowledgeGraphUpdated: true,
    masterIndexUpdated:    true,
  },
  {
    id:          "MAS-001",
    name:        "MAS — MemoryOS Architecture Specification",
    version:     "1.0",
    authority:   "OFFICIAL",
    status:      "FROZEN",
    category:    "ARCHITECTURE",
    path:        "src/docs/00-official-library/MAS-MemoryOS-Architecture-Specification.md",
    ingestedAt:  Date.now(),
    integrity:   "VALID",
    lineCount:   374,
    sections: [
      "1. Objetivo", "2. Definicao da Arquitetura", "3. Principios Arquiteturais",
      "3.1 Separacao Pensamento/Execucao", "3.2 Separacao Conhecimento/Integracao",
      "3.3 Separacao Objetivo/Tecnologia", "3.4 Memoria Independente",
      "3.5 Conversa Continua", "3.6 Evolucao Continua",
      "4. Camadas Oficiais",
      "4.1 MemoryOS Core", "4.2 Memory Layer", "4.3 Specialists",
      "4.4 Capability Layer", "4.5 Service Layer", "4.6 Policy Engine",
      "4.7 Execution Planner", "4.8 Connector Manager", "4.9 Connectors",
      "4.10 Providers",
      "5. Fluxo Oficial", "6. Responsabilidades", "7. Biblioteca Oficial",
      "8. Memoria do Projeto", "9. Aprendizado", "10. Principios de Evolucao",
      "11. Arquitetura Escalavel", "12. Declaracao Oficial",
      "13. Principios Arquiteturais Permanentes",
    ],
    components: [
      "MemoryOS Core", "Memory Layer", "Specialists", "Capability Layer",
      "Service Layer", "Policy Engine", "Execution Planner", "Connector Manager",
      "Connectors", "Providers", "Official Library",
    ],
    crossRefs:   ["MV-001", "MPS-001", "MDS-001", "MES-001", "MCF-001", "MCIS-001", "MGIS-001"],
    adrs:        ["ADR-001","ADR-002","ADR-003","ADR-004","ADR-005","ADR-006","ADR-007"],
    rfcs:        ["RFC-001","RFC-002","RFC-003","RFC-004"],
    dependencies: ["MV-001", "MPS-001"],
    knowledgeGraphUpdated: true,
    masterIndexUpdated:    true,
  },
  {
    id:          "MDS-001",
    name:        "MDS — MemoryOS Developer Specification",
    version:     "1.0",
    authority:   "OFFICIAL",
    status:      "FROZEN",
    category:    "ENGINEERING",
    path:        "src/docs/00-official-library/MDS-MemoryOS-Developer-Specification.md",
    ingestedAt:  Date.now(),
    integrity:   "VALID",
    lineCount:   594,
    sections: [
      "Declaracao de Proposito", "Indice do MDS",
      "PARTE I — ORGANIZACAO DA SOLUCAO",
      "1.1 Arquitetura Fisica", "1.2 Arquitetura Logica — Camadas",
      "1.3 Estrutura do Monorepo Oficial", "1.4 Separacao de Dominios",
      "1.5 Convencoes de Nomenclatura", "1.6 Versionamento Oficial",
      "1.7 Feature Flags", "1.8 Sistema de Configuracao Hierarquica",
      "1.9 Sistema de Plugins", "1.10 Diagrama C4 — Nivel 1",
      "1.11 Diagrama C4 — Nivel 2",
    ],
    components: [
      "IntentEngine", "GoalEngine", "MemoryEngine", "PlannerEngine", "ContextEngine",
      "KnowledgeEngine", "PolicyEngine", "ConnectorRuntime", "MCISRegistry",
      "CapabilityGraph", "ConnectorManager", "ExecutionEngine", "WorkflowEngine",
      "UniversalEventBus", "ModuleRegistry",
    ],
    crossRefs:   ["MV-001", "MPS-001", "MAS-001", "MES-001", "MCF-001", "MCIS-001", "MGIS-001"],
    adrs:        ["ADR-001","ADR-004","ADR-007"],
    rfcs:        ["RFC-001","RFC-004"],
    dependencies: ["MV-001", "MPS-001", "MAS-001", "MES-001"],
    knowledgeGraphUpdated: true,
    masterIndexUpdated:    true,
  },
  {
    id:          "MES-001",
    name:        "MES — MemoryOS Engineering Specification",
    version:     "1.0",
    authority:   "OFFICIAL",
    status:      "FROZEN",
    category:    "ENGINEERING",
    path:        "src/docs/00-official-library/MES-MemoryOS-Engineering-Specification.md",
    ingestedAt:  Date.now(),
    integrity:   "VALID",
    lineCount:   490,
    sections: [
      "1. Objetivo", "2. Principios de Engenharia",
      "2.1 Responsabilidade Unica", "2.2 Baixo Acoplamento", "2.3 Alta Coesao",
      "2.4 Interfaces Estaveis", "2.5 Independencia Tecnologica", "2.6 Evolucao Continua",
      "3. Organizacao Oficial do Projeto", "4. Pipeline Oficial",
      "5. Contrato Oficial de Requisicao", "6. Contrato Oficial de Resposta",
      "7. Context Builder", "8. Planner", "9. Capability Detector", "10. Specialists",
      "11. Service Layer", "12. Policy Engine", "13. Execution Planner",
      "14. Connector Manager", "15. Interface Oficial dos Connectors",
      "16. Providers", "17. Interface Oficial dos Providers",
      "18. Interface Oficial dos Specialists", "19. Interface Oficial das Capabilities",
      "20. Interface Oficial dos Services", "21. Eventos", "22. Observabilidade",
      "23. Auditoria", "24. Seguranca", "25. Testes", "26. Versionamento",
      "27-31. Criterios para Novos Componentes", "32. Pull Requests",
      "33. Criterios de Qualidade", "34. Definicao de Pronto", "35. Declaracao Oficial",
    ],
    components: [
      "Core", "ContextBuilder", "Planner", "CapabilityDetector", "Specialists",
      "ServiceLayer", "PolicyEngine", "ExecutionPlanner", "ConnectorManager",
      "Connectors", "Providers", "EventBus",
    ],
    crossRefs:   ["MV-001", "MPS-001", "MAS-001", "MDS-001"],
    adrs:        ["ADR-001","ADR-002","ADR-003"],
    rfcs:        ["RFC-001","RFC-002"],
    dependencies: ["MV-001", "MPS-001", "MAS-001"],
    knowledgeGraphUpdated: true,
    masterIndexUpdated:    true,
  },
]);

export const BATCH_01_SUMMARY = Object.freeze({
  batchId:          "BATCH-01",
  label:            "Core Foundation",
  ingestedAt:       Date.now(),
  totalDocuments:   BATCH_01.length,
  allValid:         BATCH_01.every(d => d.integrity === "VALID"),
  allFrozen:        BATCH_01.every(d => d.status === "FROZEN"),
  allOfficial:      BATCH_01.every(d => d.authority === "OFFICIAL"),
  knowledgeGraphOk: true,
  masterIndexOk:    true,
  crossRefsOk:      true,
  documentIds:      BATCH_01.map(d => d.id),
});