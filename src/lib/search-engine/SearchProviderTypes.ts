/**
 * SearchProviderTypes.ts — Search Engine (Passo 1: Interface Comum)
 *
 * Contrato único que todo provider do Search Engine deve implementar.
 * Objetivo: responder perguntas SEM chamar LLM sempre que possível,
 * interceptando a mensagem antes da chamada principal de InvokeLLM
 * dentro do memoryReasoningPlanner.js — esse é o gargalo real de
 * custo/latência (não o OpenRouter, que é usado numa fatia bem menor
 * do fluxo real).
 *
 * Design SOLID:
 *   - Single Responsibility: cada provider sabe pesquisar em UMA fonte.
 *   - Open/Closed: novos providers se registram no SearchEngine sem
 *     precisar alterar o motor de decisão.
 *   - Liskov Substitution: qualquer provider pode ser trocado por outro
 *     que implemente a mesma interface, sem quebrar o SearchEngine.
 *   - Interface Segregation: a interface é mínima (canHandle + search).
 *   - Dependency Inversion: o SearchEngine depende da interface
 *     SearchProvider, nunca de uma implementação concreta.
 */

export interface SearchOptions {
  maxResults?: number;
  /** Janela maxima (ms) que o SearchEngine aguarda providers antes de desistir. */
  timeoutMs?: number;
  context?: Record<string, unknown>;
}

export interface SearchResultItem {
  title: string;
  snippet: string;
  url?: string;
  source: string;
  raw?: unknown;
}

export interface SearchResult {
  success: boolean;
  confidence: number;
  items: SearchResultItem[];
  provider: string;
  durationMs: number;
  error?: string;
}

export interface SearchProvider {
  readonly id: string;
  readonly name: string;
  canHandle(query: string): number;
  search(query: string, options?: SearchOptions): Promise<SearchResult>;
}