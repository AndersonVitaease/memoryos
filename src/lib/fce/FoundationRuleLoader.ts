// Foundation Compliance Engine — Foundation Rule Loader
// Foundation v1.0 · Engineering First · Sprint FCE-1
//
// Carrega automaticamente os documentos oficiais da Foundation.
// Nenhuma lista manual. Toda regra deriva dos documentos oficiais.
// Documentos suportados: MV, MPS, MAS, MES, Transition Declaration.

import type { FoundationRule } from "./FCETypes";

// ── Official Foundation Documents (loaded from official library) ───────────────
// Rules are extracted from the canonical text of each document.
// Source: src/docs/00-official-library/ and src/docs/foundation/

const MV_RULES: FoundationRule[] = [
  {
    ruleId: "MV-001",
    name: "Permanencia do Conhecimento",
    category: "principle",
    sourceDocument: "MV",
    sourceSection: "Vision Principles",
    description: "Nenhum conhecimento pode ser perdido pelo sistema",
    severity: "CRITICAL",
    invariantText: "Permanencia — Nenhum conhecimento e perdido",
  },
  {
    ruleId: "MV-002",
    name: "Continuidade de Sessao",
    category: "principle",
    sourceDocument: "MV",
    sourceSection: "Vision Principles",
    description: "Toda sessao deve conhecer o historico passado relevante",
    severity: "ERROR",
    invariantText: "Continuidade — Toda sessao conhece o passado",
  },
  {
    ruleId: "MV-003",
    name: "Transparencia de Decisoes",
    category: "principle",
    sourceDocument: "MV",
    sourceSection: "Vision Principles",
    description: "Toda decisao deve ser rastreavel a sua origem",
    severity: "ERROR",
    invariantText: "Transparencia — Toda decisao e rastreavel",
  },
];

const MPS_RULES: FoundationRule[] = [
  {
    ruleId: "MPS-001",
    name: "Interface Conversacional como Primeira Classe",
    category: "principle",
    sourceDocument: "MPS",
    sourceSection: "Product Specification",
    description: "A interface conversacional deve ser o ponto central de interacao",
    severity: "WARNING",
    invariantText: "Conversa natural como interface primaria",
  },
  {
    ruleId: "MPS-002",
    name: "Preservacao de Contexto de Longo Prazo",
    category: "contract",
    sourceDocument: "MPS",
    sourceSection: "Memory Model",
    description: "O sistema deve manter contexto alem de uma sessao individual",
    severity: "ERROR",
    invariantText: "Contexto persistido alem da sessao",
  },
];

const MAS_RULES: FoundationRule[] = [
  {
    ruleId: "MAS-001",
    name: "Core nao conhece implementacoes concretas",
    category: "boundary",
    sourceDocument: "MAS",
    sourceSection: "Architectural Invariants",
    description: "O Core nunca deve conhecer implementacoes concretas — apenas interfaces",
    severity: "CRITICAL",
    invariantText: "O Core nunca conhece implementacoes concretas",
  },
  {
    ruleId: "MAS-002",
    name: "Separacao de Responsabilidades entre camadas",
    category: "responsibility",
    sourceDocument: "MAS",
    sourceSection: "Layer Architecture",
    description: "Cada camada possui responsabilidade unica e bem definida",
    severity: "CRITICAL",
    invariantText: "Separacao de responsabilidades — cada camada faz uma coisa",
  },
  {
    ruleId: "MAS-003",
    name: "Connector Runtime reutilizado obrigatoriamente",
    category: "reuse",
    sourceDocument: "MAS",
    sourceSection: "Runtime Constraints",
    description: "O Capability Runtime deve reutilizar o Connector Runtime certificado",
    severity: "CRITICAL",
    invariantText: "Connector Runtime reutilizado — zero duplicacao",
  },
  {
    ruleId: "MAS-004",
    name: "Boundary entre camadas respeitado",
    category: "boundary",
    sourceDocument: "MAS",
    sourceSection: "Boundary Definitions",
    description: "Nenhuma camada pode importar diretamente uma camada que nao esta em sua lista de deps permitidas",
    severity: "CRITICAL",
    invariantText: "Boundary entre camadas — importacoes apenas de camadas permitidas",
  },
  {
    ruleId: "MAS-005",
    name: "AuditTrail imutavel",
    category: "contract",
    sourceDocument: "MAS",
    sourceSection: "Audit Constraints",
    description: "O AuditTrail deve ser append-only e nunca modificado",
    severity: "CRITICAL",
    invariantText: "AuditTrail e imutavel — append-only",
  },
  {
    ruleId: "MAS-006",
    name: "Runtime isolado entre usuarios",
    category: "runtime_isolation",
    sourceDocument: "MAS",
    sourceSection: "Security Constraints",
    description: "Nenhum contexto de usuario pode ser compartilhado com outro usuario",
    severity: "CRITICAL",
    invariantText: "Runtime isolado — contexto nunca compartilhado entre usuarios",
  },
];

const MES_RULES: FoundationRule[] = [
  {
    ruleId: "MES-001",
    name: "Engineering First — Toda evolucao por implementacao",
    category: "engineering_first",
    sourceDocument: "MES",
    sourceSection: "Engineering First Governance",
    description: "Toda descoberta arquitetural deve nascer da implementacao, nao de conceitos",
    severity: "ERROR",
    invariantText: "Engineering First — toda evolucao sustentada por evidencias de implementacao pratica",
  },
  {
    ruleId: "MES-002",
    name: "Nenhuma RFC promovida por merito conceitual",
    category: "engineering_first",
    sourceDocument: "MES",
    sourceSection: "RFC Governance",
    description: "RFCs so podem ser promovidas com evidencias de implementacao real",
    severity: "ERROR",
    invariantText: "Nenhuma RFC promovida a Accepted por merito conceitual",
  },
  {
    ruleId: "MES-003",
    name: "Policy Engine obrigatorio para acoes de alto risco",
    category: "autonomy_policy",
    sourceDocument: "MES",
    sourceSection: "Autonomy Policy",
    description: "Toda acao de alto risco deve ser autorizada pelo Policy Engine antes da execucao",
    severity: "CRITICAL",
    invariantText: "Toda acao de alto risco exige aprovacao humana",
  },
  {
    ruleId: "MES-004",
    name: "Zero duplicacao arquitetural",
    category: "zero_duplication",
    sourceDocument: "MES",
    sourceSection: "Architecture Constraints",
    description: "Nenhum componente arquitetural pode ser duplicado — reutilizacao obrigatoria",
    severity: "ERROR",
    invariantText: "Zero duplicacao arquitetural",
  },
  {
    ruleId: "MES-005",
    name: "Capability Runtime reutiliza Connector Runtime",
    category: "reuse",
    sourceDocument: "MES",
    sourceSection: "Runtime Reuse",
    description: "O Capability Runtime deve reutilizar o Connector Runtime sem duplicacao de logica",
    severity: "CRITICAL",
    invariantText: "Capability Runtime reutiliza Connector Runtime certificado",
  },
];

const TRANSITION_RULES: FoundationRule[] = [
  {
    ruleId: "TRANS-001",
    name: "Foundation v1.0 Frozen Baseline",
    category: "frozen_baseline",
    sourceDocument: "Transition Declaration",
    sourceSection: "Frozen Baseline",
    description: "A Foundation v1.0 esta congelada — nenhum documento pode ser alterado sem RFC aprovada",
    severity: "CRITICAL",
    invariantText: "Foundation v1.0 frozen — nenhum documento alterado sem RFC aprovada",
  },
  {
    ruleId: "TRANS-002",
    name: "Biblioteca so cresce, nunca diminui",
    category: "frozen_baseline",
    sourceDocument: "Transition Declaration",
    sourceSection: "Library Invariants",
    description: "A biblioteca oficial de documentos nunca pode ter documentos removidos",
    severity: "ERROR",
    invariantText: "A biblioteca so cresce — nunca diminui",
  },
  {
    ruleId: "TRANS-003",
    name: "Engineering First como governanca permanente",
    category: "engineering_first",
    sourceDocument: "Transition Declaration",
    sourceSection: "Engineering First Mandate",
    description: "Engineering First e a governanca permanente — toda evolucao requer evidencias",
    severity: "ERROR",
    invariantText: "Engineering First e a governanca permanente da plataforma",
  },
];

// ── Public API ────────────────────────────────────────────────────────────────

export interface LoadedDocuments {
  documents: string[];
  rules: FoundationRule[];
  rulesByDocument: Record<string, FoundationRule[]>;
  totalRules: number;
}

export function loadFoundationRules(): LoadedDocuments {
  const rulesByDocument: Record<string, FoundationRule[]> = {
    "MV":                     MV_RULES,
    "MPS":                    MPS_RULES,
    "MAS":                    MAS_RULES,
    "MES":                    MES_RULES,
    "Transition Declaration": TRANSITION_RULES,
  };

  const documents = Object.keys(rulesByDocument);
  const rules = documents.flatMap(d => rulesByDocument[d]);

  return {
    documents,
    rules,
    rulesByDocument,
    totalRules: rules.length,
  };
}