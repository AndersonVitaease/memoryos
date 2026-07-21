/**
 * PlannerContextTypes.ts — EF-40.6
 * Contrato unico que o Planner consome.
 * Nenhum componente conhece COMO esse contexto foi produzido.
 */

export type MemoryContextMode = "LEGACY" | "UCME" | "SHADOW";

export interface PlannerContext {
  /** Historico da conversa formatado como texto */
  conversation: string;
  /** Conteudo da biblioteca oficial (documentos selecionados) */
  officialLibrary: string;
  /** Memorias estruturadas (entidades, decisoes, tarefas, topicos) */
  memories: string;
  /** Objetivo detectado */
  goals: string;
  /** Preferencias do usuario detectadas */
  preferences: string;
  /** Entidades identificadas */
  entities: string;
  /** Hints para o raciocinio */
  reasoningHints: string;
  /** Citacoes com origem */
  citations: string[];
  /** Diagnosticos internos (nunca expostos ao usuario) */
  diagnostics: PlannerContextDiagnostics;
}

export interface PlannerContextDiagnostics {
  /** Qual provider gerou este contexto */
  provider: "legacy" | "ucme";
  /** Tempo de execucao em ms */
  durationMs: number;
  /** Quantas memorias foram encontradas */
  memoryCount: number;
  /** Quantos documentos da biblioteca foram carregados */
  documentCount: number;
  /** Fontes usadas */
  sources: string[];
  /** Tokens estimados do contexto */
  estimatedTokens: number;
  /** Authority score (UCME) ou null (Legacy) */
  authorityScore: number | null;
  /** Confidence score (UCME) ou null (Legacy) */
  confidenceScore: number | null;
  /** Coverage (0-1) — cobertura de topicos */
  coverage: number | null;
  /** Lacunas identificadas */
  gaps: string[];
  /** Duplicacoes detectadas */
  duplications: string[];
  /** Erro (se houve) */
  error: string | null;
  /** Timestamp */
  timestamp: string;
}

export interface ShadowDiagnosticsReport {
  /** Timestamp da execucao */
  timestamp: string;
  /** ID da mensagem */
  messageId: string;
  /** Contexto do Legacy */
  legacy: PlannerContextDiagnostics & { contextLength: number };
  /** Contexto do UCME */
  ucme: PlannerContextDiagnostics & { contextLength: number };
  /** Diferencas identificadas */
  diff: {
    memoryCountDelta: number;
    documentCountDelta: number;
    durationDelta: number;
    sourceDiff: string[];
    /** true se UCME retornou mais dados */
    ucmeWider: boolean;
    /** true se UCME foi mais rapido */
    ucmeFaster: boolean;
  };
}