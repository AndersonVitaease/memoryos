/**
 * MemoryService.ts — Memory Kernel v1.0
 * Sprint EF-40.8
 *
 * Contrato oficial da Memory Layer.
 *
 * O Planner conhece apenas esta interface.
 * O Planner nunca conhece:
 *   - runMemoryPipeline
 *   - UnifiedMemoryEngine
 *   - MemoryContextBuilder
 *   - LegacyContextProvider
 *   - UCMEContextProvider
 *   - Providers
 *   - base44
 *
 * Cada implementacao (Legacy, UCME) adapta sua fonte ao contrato MemoryContext.
 * A escolha de implementacao e responsabilidade exclusiva de MemoryServiceFactory.
 */

import type { MemoryRequest } from "./MemoryRequest";
import type { MemoryContext } from "./MemoryContext";

export interface MemoryService {
  /**
   * Recupera o contexto de memoria relevante para a requisicao.
   *
   * @param request - Dados da requisicao (userMessage, sessionId, projectId, options)
   * @returns MemoryContext com todos os campos de conhecimento recuperados
   */
  retrieve(request: MemoryRequest): Promise<MemoryContext>;
}