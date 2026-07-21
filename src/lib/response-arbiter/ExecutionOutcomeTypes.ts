/**
 * ExecutionOutcomeTypes.ts — Execution Outcome Foundation
 *
 * SRP: contratos de dados puros para a camada ExecutionOutcome.
 *
 * Sem logica. Sem rede. Sem dependencias externas.
 * Sem conhecimento de ResponseCandidate, ResponseArbiter, Pipeline ou Connector.
 */

// ── ExecutionProducer ─────────────────────────────────────────────────────────
// Identifica quem produziu o outcome.
// String open-ended: novos produtores nao requerem mudancas neste arquivo.

export type ExecutionProducer =
  | "cognitive_gateway"
  | "connector_runtime"
  | "llm_reasoning"
  | "static_analysis"
  | "goal_bridge"
  | "unknown";

// ── ExecutionDomain ───────────────────────────────────────────────────────────

export type ExecutionDomain =
  | "github"
  | "gmail"
  | "google_drive"
  | "google_calendar"
  | "memory"
  | "general"
  | "unknown";

// ── ErrorType ─────────────────────────────────────────────────────────────────

export type ErrorType =
  | "none"        // sem erro
  | "auth"        // falha de autenticacao / OAuth
  | "timeout"     // operacao excedeu o limite de tempo
  | "not_found"   // recurso nao encontrado (404)
  | "validation"  // parametros invalidos ou ausentes
  | "network"     // falha de conectividade
  | "runtime"     // erro interno do executor
  | "unknown";    // erro nao classificado

// ── ExecutionCost ─────────────────────────────────────────────────────────────
// Representacao estrutural do custo de uma execucao.
// Nao utiliza numero simples — permite raciocinio multidimensional.

export interface ExecutionCost {
  /** Numero de chamadas a APIs externas realizadas. */
  readonly apiCalls: number;
  /** true = resultado veio de cache (sem custo de API). */
  readonly cacheHit: boolean;
  /**
   * Custo estimado adimensional (0 = sem custo, 1 = chamada simples,
   * N = multiplas chamadas encadeadas). Calculado pelo factory.
   */
  readonly estimatedCost: number;
  /** Latencia estimada total em ms (soma dos passos de execucao). */
  readonly estimatedLatencyMs: number;
}

// ── ExecutionConfidence ───────────────────────────────────────────────────────
// Representacao estrutural da confianca.
// Nao utiliza apenas um number — carrega raciocinio e origem.

export interface ExecutionConfidence {
  /** Score normalizado de confianca. Range: [0, 1]. */
  readonly score: number;
  /**
   * Razao textual da confianca (ex: "connector returned data",
   * "llm inference only", "auth failed").
   */
  readonly reason: string;
  /**
   * Confianca declarada pelo proprio produtor antes de normalizacao.
   * Range: [0, 1].
   */
  readonly producerConfidence: number;
}

// ── ExecutionOutcome ──────────────────────────────────────────────────────────

export interface ExecutionOutcome {
  /** Identificador unico deste outcome (gerado pelo factory). */
  readonly id: string;

  /** Quem produziu este outcome. */
  readonly producer: ExecutionProducer;

  /** Timestamp de inicio da execucao (ms epoch). */
  readonly startedAt: number;

  /** Timestamp de termino da execucao (ms epoch). */
  readonly finishedAt: number;

  /** Duracao total em ms (finishedAt - startedAt). Calculado pelo factory. */
  readonly durationMs: number;

  /** true = execucao completou sem erro. */
  readonly success: boolean;

  /** Tipo do erro, quando success=false. "none" quando success=true. */
  readonly errorType: ErrorType;

  /** Mensagem de erro legivel, quando success=false. null quando success=true. */
  readonly errorMessage: string | null;

  /** Custo estrutural da execucao. */
  readonly executionCost: ExecutionCost;

  /** Dominio ao qual este outcome pertence. */
  readonly domain: ExecutionDomain;

  /**
   * Nome da capability executada (ex: "files.get", "readInbox").
   * null quando nao aplicavel (ex: LLM puro).
   */
  readonly capability: string | null;

  /** Confianca estrutural do outcome. */
  readonly confidence: ExecutionConfidence;

  /**
   * Payload bruto retornado pela execucao.
   * null = nenhum dado retornado ou execucao falhou.
   * Tipo unknown: o outcome nao conhece a forma dos dados do conector.
   */
  readonly payload: unknown;

  /**
   * Metadados adicionais de observabilidade (execucaoId, sessionId, etc.).
   * Imutavel. Nunca contem dados sensiveis.
   */
  readonly metadata: Readonly<Record<string, unknown>>;
}

// ── ExecutionOutcomeInput ─────────────────────────────────────────────────────
// Input aceito pelo factory (sem campos calculados automaticamente).

export interface ExecutionOutcomeInput {
  readonly producer:           ExecutionProducer;
  readonly startedAt:          number;
  readonly finishedAt:         number;
  readonly success:            boolean;
  readonly errorType:          ErrorType;
  readonly errorMessage:       string | null;
  readonly domain:             ExecutionDomain;
  readonly capability:         string | null;
  readonly payload:            unknown;
  readonly metadata:           Record<string, unknown>;
  /** Input para ExecutionCost — campos opcionais com defaults seguros. */
  readonly cost: {
    readonly apiCalls?:           number;
    readonly cacheHit?:           boolean;
    readonly estimatedLatencyMs?: number;
  };
  /** Input para ExecutionConfidence. */
  readonly confidence: {
    readonly score:              number;
    readonly reason:             string;
    readonly producerConfidence: number;
  };
}

// ── ValidationError ───────────────────────────────────────────────────────────

export interface OutcomeValidationError {
  readonly field:   string;
  readonly message: string;
}