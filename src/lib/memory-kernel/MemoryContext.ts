/**
 * MemoryContext.ts — Memory Kernel v1.0
 * Sprint EF-40.8
 *
 * Contrato oficial de saida da Memory Layer.
 *
 * IMPORTANTE:
 * MemoryContext representa CONHECIMENTO — nao Prompt, nao texto LLM, nao Planner.
 * Cada campo representa um tipo de dado de memoria do usuario.
 * O Planner e responsavel por transformar MemoryContext em Prompt.
 */

export interface MemoryContextDiagnostics {
  /** Provider que gerou este contexto */
  readonly provider: "legacy" | "ucme" | "shadow";
  /** Duracao total da recuperacao em ms */
  readonly durationMs: number;
  /** Total de registros de memoria recuperados */
  readonly memoryCount: number;
  /** Total de documentos da biblioteca oficial */
  readonly documentCount: number;
  /** Fontes utilizadas na recuperacao */
  readonly sources: readonly string[];
  /** Tokens estimados do contexto consolidado */
  readonly estimatedTokens: number;
  /** Authority score (UCME) ou null (Legacy) */
  readonly authorityScore: number | null;
  /** Confidence score (UCME) ou null (Legacy) */
  readonly confidenceScore: number | null;
  /** Cobertura de topicos (0-1) */
  readonly coverage: number | null;
  /** Lacunas detectadas */
  readonly gaps: readonly string[];
  /** Duplicacoes detectadas */
  readonly duplications: readonly string[];
  /** Erro interno (se houve) */
  readonly error: string | null;
  /** Timestamp da execucao */
  readonly timestamp: string;
}

export interface MemoryContext {
  /**
   * Memorias conversacionais consolidadas como texto estruturado.
   * Produzido por: runMemoryPipeline (Legacy) ou MemoryFusionEngine (UCME).
   * O Planner injeta isso no campo MEMORIA ESTRUTURADA RECUPERADA do prompt.
   */
  readonly memories: string;

  /**
   * Resumo da sessao atual.
   * Produzido por: ChatSession.filter({id:sessionId}).summary.
   * O Planner injeta isso no campo RESUMO DA CONVERSA do prompt.
   */
  readonly sessionSummary: string;

  /**
   * Fontes recuperadas como array para contagem e display.
   * Cada item: { type: string; id?: string; name?: string }
   */
  readonly sources: ReadonlyArray<{ type: string; id?: string; name?: string }>;

  /**
   * Entidades estruturadas recuperadas (pessoas, empresas, produtos, etc).
   * Vazio nesta sprint — sera preenchido por UCMEMemoryService nas proximas sprints.
   */
  readonly entities: string;

  /**
   * Projetos do usuario relevantes para a query.
   * Vazio nesta sprint — sera preenchido por UCMEMemoryService nas proximas sprints.
   */
  readonly projects: string;

  /**
   * Sessoes de conversa historicas relevantes.
   * Vazio nesta sprint.
   */
  readonly conversations: string;

  /**
   * Decisoes relevantes para a query.
   * Vazio nesta sprint (ja incluso em memories via Legacy).
   */
  readonly decisions: string;

  /**
   * Conteudo da Biblioteca Oficial selecionado para a query.
   * Vazio nesta sprint — officialLibrary e responsabilidade do CapabilityOrchestrator na Memory Layer Legacy.
   */
  readonly officialLibrary: string;

  /**
   * Citations estruturadas (documentId, chapter, section, version).
   * Vazio nesta sprint para Legacy. UCME ja produz citations.
   */
  readonly citations: readonly string[];

  /**
   * Diagnosticos internos — nunca expostos ao usuario.
   */
  readonly diagnostics: MemoryContextDiagnostics;
}