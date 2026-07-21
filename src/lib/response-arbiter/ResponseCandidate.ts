/**
 * ResponseCandidate.ts — Response Arbiter Foundation
 *
 * SRP: define o contrato imutavel de um candidato de resposta.
 *
 * Um ResponseCandidate representa uma resposta potencial produzida por
 * qualquer origem do pipeline (CognitiveGateway, ConnectorRuntime, LLM,
 * StaticAnalysis, etc.) antes de qualquer decisao de prioridade.
 *
 * Invariants:
 *   - Todos os campos sao readonly (imutabilidade estrutural).
 *   - confidence: 0-1 (valores fora do intervalo sao clampeados pelo factory).
 *   - answer: nunca null quando handled=true.
 *   - executionCost: numero adimensional; menor = mais barato.
 *
 * Sem logica. Sem rede. Sem dependencias externas.
 */

// ── ResponseSource ────────────────────────────────────────────────────────────
// Identifica a origem que produziu o candidato.
// Extensivel: novas origens nao requerem mudancas no Arbiter.

export type ResponseSource =
  | "cognitive_gateway"     // ConversationCognitiveGateway → LiveCognitivePipeline
  | "connector_runtime"     // ConversationRuntimeEngine → connector executor
  | "llm_reasoning"         // memoryReasoningPlanner (LLM puro)
  | "static_analysis"       // StaticAnalysisEngine
  | "goal_bridge_fallback"  // GoalBridge producao de resposta por fallback
  | "unknown";              // origem nao identificada

// ── ExplicitDomain ────────────────────────────────────────────────────────────
// Dominio explicito ao qual o candidato pertence.
// Permite ao Arbiter priorizar por dominio antes de analisar confianca.

export type ExplicitDomain =
  | "github"
  | "gmail"
  | "google_drive"
  | "google_calendar"
  | "memory"
  | "general"
  | null;  // dominio desconhecido ou nao aplicavel

// ── ResponseCandidate ─────────────────────────────────────────────────────────

export interface ResponseCandidate {
  /** Identificador unico desta candidatura (gerado pelo factory). */
  readonly id: string;

  /** Origem que produziu a resposta. */
  readonly source: ResponseSource;

  /**
   * Dominio explicito declarado pelo produtor.
   * null = o Arbiter nao pode inferir dominio por este campo.
   */
  readonly explicitDomain: ExplicitDomain;

  /**
   * Confianca do produtor na resposta. Range: [0, 1].
   * 0 = sem confianca / erro / nao tratado.
   * 1 = producao deterministica com dados reais.
   */
  readonly confidence: number;

  /**
   * true = o produtor tratou a requisicao e gerou uma resposta final.
   * false = o produtor nao tratou; answer pode ser null ou vazio.
   */
  readonly handled: boolean;

  /**
   * true = o connector ou servico externo executou com sucesso.
   * false = houve erro de execucao (auth, 404, timeout, etc.).
   * null = nao aplicavel (ex: LLM puro nao tem execucao externa).
   */
  readonly executionSucceeded: boolean | null;

  /**
   * Custo adimensional da execucao (menor = mais barato).
   * 0 = sem custo (ex: cache ou resposta local).
   * 1 = chamada simples a API.
   * N = multiplas chamadas encadeadas.
   */
  readonly executionCost: number;

  /**
   * Texto da resposta a ser exibida ao usuario.
   * Obrigatorio quando handled=true.
   * null quando handled=false.
   */
  readonly answer: string | null;

  /** Timestamp de criacao (ms epoch). */
  readonly createdAt: number;
}

// ── ID factory ────────────────────────────────────────────────────────────────

let _seq = 0;
function makeResponseCandidateId(): string {
  return `rc-${Date.now()}-${(++_seq).toString(36)}`;
}

// ── ResponseCandidateFactory ──────────────────────────────────────────────────
// Unico ponto de criacao de ResponseCandidate.
// Garante invariants (clamp de confidence, coerencia handled/answer).

export type ResponseCandidateInput = Omit<ResponseCandidate, "id" | "createdAt">;

export function createResponseCandidate(
  input: ResponseCandidateInput,
): ResponseCandidate {
  const confidence = Math.max(0, Math.min(1, input.confidence));

  // Coerencia: handled=true exige answer nao-nulo e nao-vazio
  const handled = input.handled && !!input.answer?.trim();
  const answer  = handled ? (input.answer as string) : null;

  return Object.freeze({
    id:                 makeResponseCandidateId(),
    source:             input.source,
    explicitDomain:     input.explicitDomain,
    confidence,
    handled,
    executionSucceeded: input.executionSucceeded,
    executionCost:      Math.max(0, input.executionCost),
    answer,
    createdAt:          Date.now(),
  });
}

// ── NULL_CANDIDATE ────────────────────────────────────────────────────────────
// Candidato vazio — usado como valor sentinela (nenhum produtor respondeu).

export const NULL_CANDIDATE: ResponseCandidate = Object.freeze(
  createResponseCandidate({
    source:             "unknown",
    explicitDomain:     null,
    confidence:         0,
    handled:            false,
    executionSucceeded: null,
    executionCost:      0,
    answer:             null,
  }),
);