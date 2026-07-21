/**
 * MemoryRequest.ts — Memory Kernel v1.0
 * Sprint EF-40.8
 *
 * Contrato oficial de entrada da Memory Layer.
 * Nenhum campo relacionado a Prompt, LLM ou Planner interno.
 * Imutavel apos criacao.
 */

export interface MemoryRequestOptions {
  /** Maximo de resultados por provider */
  readonly maxResults?: number;
  /** Timeout por provider em ms */
  readonly timeoutMs?: number;
  /** Hint de intencao para filtrar providers */
  readonly intent?: string;
  /** Restricao a providers especificos (vazio = todos) */
  readonly providers?: readonly string[];
  /** ID de trace para observabilidade */
  readonly traceId?: string;
}

export interface MemoryRequest {
  /** Mensagem natural do usuario */
  readonly userMessage: string;
  /** ID da sessao ativa */
  readonly sessionId: string;
  /** ID do projeto (optional — para escopo de busca) */
  readonly projectId?: string | null;
  /** ID do workspace (reservado para multi-tenant) */
  readonly workspaceId?: string | null;
  /** Opcoes de busca */
  readonly options?: MemoryRequestOptions;
}