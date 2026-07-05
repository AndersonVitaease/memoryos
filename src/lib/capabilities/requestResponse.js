/**
 * Contrato Oficial — Request / Response (MES §5, §6)
 *
 * Conforme MES §5 (Contrato de Requisição) e MES §6 (Contrato de Resposta):
 * - Nenhuma Capability pode receber parâmetros livres.
 * - Todas utilizam este contrato padronizado.
 *
 * Request:
 *   { requestId, conversationId, userId, goal, context, memory, metadata }
 *
 * Response:
 *   { status, result, events, logs, memoryUpdates }
 *
 * O Specialist constrói o Request; as Capabilities retornam o Response.
 */

let _counter = 0;

/**
 * Cria um Request oficial.
 */
export function createRequest({ goal = "", context = {}, memory = {}, metadata = {}, conversationId = "", userId = "" } = {}) {
  _counter += 1;
  return {
    requestId: metadata.requestId || `req-${Date.now()}-${_counter}`,
    conversationId,
    userId,
    goal,
    context,
    memory,
    metadata,
  };
}

/**
 * Cria um Response de sucesso.
 */
export function successResponse(result, { events = [], logs = [], memoryUpdates = [] } = {}) {
  return { status: "success", result, events, logs, memoryUpdates };
}

/**
 * Cria um Response de erro.
 */
export function errorResponse(error, { events = [], logs = [] } = {}) {
  return {
    status: "error",
    result: null,
    events,
    logs: [...logs, `error: ${error?.message || error}`],
    memoryUpdates: [],
  };
}