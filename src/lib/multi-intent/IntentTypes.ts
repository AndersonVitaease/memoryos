/**
 * IntentTypes.ts — Motor de Múltiplas Intenções (Parte 1: Interface Comum)
 *
 * Objetivo: quando uma mensagem contém vários pedidos diferentes numa
 * frase só (ex: "verifica meus emails, agenda uma reunião amanhã, e
 * confere se tem MCP do Mercado Livre"), o sistema hoje (GoalRegistry.ts)
 * só reconhece UM goal por mensagem — os outros pedidos são ignorados,
 * não por limitação técnica de capacidade, mas porque nunca foi
 * desenhado pra reconhecer múltiplas intenções na mesma frase.
 *
 * Este motor NÃO substitui o GoalRegistry.ts — reaproveita ele. A ideia:
 *   1. Decompositor: quebra a mensagem em pedaços menores.
 *   2. Cada pedaço passa pelo GoalRegistry.ts já existente.
 *   3. Orquestrador executa cada pedido classificado.
 *   4. Agregador junta os resultados numa resposta só.
 */

export interface DecomposedIntent {
  id: string;
  text: string;
  order: number;
}

export interface ClassifiedIntent extends DecomposedIntent {
  goalType: string | null;
  confidence: number;
  parameters: Record<string, unknown>;
}

export interface IntentExecutionResult {
  intent: ClassifiedIntent;
  success: boolean;
  response: string | null;
  error: string | null;
  durationMs: number;
}

export interface MultiIntentOutcome {
  handled: boolean;
  totalIntents: number;
  results: IntentExecutionResult[];
  aggregatedResponse: string | null;
  durationMs: number;
}

export interface IntentExecutor {
  execute(intent: ClassifiedIntent): Promise<IntentExecutionResult>;
}
