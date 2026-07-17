/**
 * ReferenceResolver.ts — Sprint C-02.2
 * Interface contrato que cada adapter deve implementar.
 *
 * SRP: definir o contrato de resolucao sem nenhuma implementacao.
 * Dependency Inversion: o Service depende desta interface, nao de adapters concretos.
 */

import type { Reference }       from "./Reference";
import type { ResolutionResult } from "./ResolutionResult";

export interface ReferenceResolver {
  /** Identificador do connector que este resolver suporta (ex: "google-drive") */
  readonly connectorId: string;

  /**
   * Transforma uma referencia humana em um identificador tecnico.
   * Nunca lanca excecao — retorna ResolutionResult com success=false em caso de erro.
   */
  resolve(reference: Reference, context?: ResolverContext): Promise<ResolutionResult>;
}

/**
 * Contexto opcional passado ao resolver.
 * Permite injetar dados pre-buscados (ex: lista de arquivos ja carregada)
 * sem acoplar o resolver ao connector runtime.
 */
export interface ResolverContext {
  /** Dados pre-carregados pelo conector (formato livre por adapter) */
  readonly preloaded?: unknown;
  /** Numero maximo de candidatos a retornar */
  readonly maxCandidates?: number;
}