/**
 * ConversationGoalBridge — Engineering Sprint E-02.1
 * Conversation → Goal Bridge
 *
 * SRP: Unica responsabilidade — transformar uma mensagem do usuario
 * e uma intencao classificada em um ConversationGoal estruturado.
 *
 * NAO chama connectors.
 * NAO chama Planning Engine.
 * NAO chama Runtime.
 * NAO faz chamadas de rede.
 * NAO altera nenhum comportamento existente.
 *
 * O Goal produzido e apenas um objeto de dados — nao e executado.
 * A execucao e responsabilidade da Sprint E-02.2 em diante.
 */

import type { CognitiveIntent } from "@/lib/conversation-cognitive-gateway/CCGTypes";

// ── Types ─────────────────────────────────────────────────────────────────────

export type GoalType =
  // Gmail
  | "gmail.readInbox"
  | "gmail.searchMessages"
  | "gmail.readMessage"
  // Calendar
  | "calendar.listToday"
  | "calendar.listTomorrow"
  | "calendar.listWeek"
  | "calendar.createEvent"
  // Drive
  | "drive.openDocument"
  | "drive.searchFiles"
  | "drive.listRecent"
  // General
  | "memory.query"
  | "memory.summarize"
  | "general.conversation"
  | "unknown";

export interface ConversationGoal {
  readonly id: string;
  readonly type: GoalType;
  readonly confidence: number;       // 0-1
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly userIntent: string;       // raw user message
  readonly cognitiveIntent: CognitiveIntent;
  readonly createdAt: number;
  readonly valid: boolean;
  readonly validationErrors: readonly string[];
}

export interface GoalBridgeResult {
  readonly goal: ConversationGoal;
  readonly durationMs: number;
}

// ── Goal ID ───────────────────────────────────────────────────────────────────

let _seq = 0;
function makeGoalId(): string {
  return `cg-${Date.now()}-${(++_seq).toString(36)}`;
}

// ── Goal Pattern Registry ─────────────────────────────────────────────────────
// Each pattern maps keyword signals to a GoalType and parameter extractor.
// Order matters: first match wins.

interface GoalPattern {
  type: GoalType;
  signals: string[];
  extractParams: (msg: string) => Record<string, unknown>;
}

const GOAL_PATTERNS: GoalPattern[] = [
  // ── Gmail ──────────────────────────────────────────────────────────────────
  {
    type: "gmail.readInbox",
    signals: [
      "email", "emails", "e-mail", "e-mails", "inbox", "caixa de entrada",
      "meus emails", "meus e-mails", "ultimos emails", "ultimos e-mails",
      "mensagens recentes", "leia meus", "ver emails", "checar emails",
    ],
    extractParams: (msg) => {
      const numMatch = msg.match(/\b(\d+)\b/);
      const maxResults = numMatch ? parseInt(numMatch[1], 10) : 10;
      return { maxResults: Math.min(maxResults, 50) };
    },
  },
  {
    type: "gmail.searchMessages",
    signals: [
      "buscar email", "buscar e-mail", "pesquisar email", "pesquisar e-mail",
      "encontrar email", "procurar email", "search email", "find email",
    ],
    extractParams: (msg) => {
      // Extract quoted strings or "from:" patterns as query
      const quoted = msg.match(/"([^"]+)"/)?.[1];
      const fromMatch = msg.match(/(?:de|from)\s+(\S+)/i)?.[1];
      return { query: quoted ?? fromMatch ?? msg.trim() };
    },
  },
  {
    type: "gmail.readMessage",
    signals: [
      "abrir email", "abrir mensagem", "ler email", "ler mensagem",
      "ver email", "open email", "read email",
    ],
    extractParams: () => ({ messageId: null }),
  },

  // ── Calendar ───────────────────────────────────────────────────────────────
  {
    type: "calendar.listTomorrow",
    signals: [
      "amanha", "amanhã", "tomorrow", "compromissos amanha",
      "agenda amanha", "reunioes amanha", "eventos amanha",
    ],
    extractParams: () => ({ dateOffset: 1 }),
  },
  {
    type: "calendar.listWeek",
    signals: [
      "semana", "week", "esta semana", "proxima semana",
      "agenda da semana", "compromissos da semana", "eventos da semana",
    ],
    extractParams: () => ({ days: 7 }),
  },
  {
    type: "calendar.listToday",
    signals: [
      "hoje", "today", "agenda", "compromissos", "reunioes", "eventos",
      "calendario", "calendar", "minha agenda", "meu calendario",
    ],
    extractParams: () => ({ dateOffset: 0 }),
  },
  {
    type: "calendar.createEvent",
    signals: [
      "criar evento", "agendar", "marcar reuniao", "nova reuniao",
      "create event", "schedule meeting", "add event",
    ],
    extractParams: (msg) => {
      const timeMatch = msg.match(/\b(\d{1,2}h?\d{0,2})\b/)?.[1];
      return { rawText: msg.trim(), suggestedTime: timeMatch ?? null };
    },
  },

  // ── Drive ──────────────────────────────────────────────────────────────────
  {
    type: "drive.searchFiles",
    signals: [
      "buscar arquivo", "buscar documento", "pesquisar drive",
      "encontrar arquivo", "search drive", "find file",
    ],
    extractParams: (msg) => {
      const quoted = msg.match(/"([^"]+)"/)?.[1];
      return { query: quoted ?? msg.trim() };
    },
  },
  {
    type: "drive.listRecent",
    signals: [
      "arquivos recentes", "documentos recentes", "recent files",
      "ultimos arquivos", "ver drive", "meus arquivos",
    ],
    extractParams: () => ({ maxResults: 10 }),
  },
  {
    type: "drive.openDocument",
    signals: [
      "abrir", "planilha", "documento", "spreadsheet", "doc",
      "open document", "open file", "abrir arquivo",
    ],
    extractParams: (msg) => {
      const quoted = msg.match(/"([^"]+)"/)?.[1];
      return { fileName: quoted ?? null, rawText: msg.trim() };
    },
  },

  // ── Memory ─────────────────────────────────────────────────────────────────
  {
    type: "memory.summarize",
    signals: [
      "resumo", "resumir", "summarize", "summary", "o que foi discutido",
      "o que falamos", "recap", "recapitular",
    ],
    extractParams: () => ({}),
  },
  {
    type: "memory.query",
    signals: [
      "lembro", "recordo", "remember", "memory", "memoria",
      "o que eu disse", "quando foi", "encontrar na memoria",
    ],
    extractParams: () => ({}),
  },
];

// ── Goal Validator ─────────────────────────────────────────────────────────────

function validateGoal(goal: Omit<ConversationGoal, "valid" | "validationErrors">): {
  valid: boolean;
  validationErrors: string[];
} {
  const errors: string[] = [];

  if (!goal.userIntent?.trim()) errors.push("userIntent is required");
  if (!goal.type)               errors.push("type is required");
  if (goal.confidence < 0)      errors.push("confidence must be >= 0");
  if (goal.confidence > 1)      errors.push("confidence must be <= 1");

  return { valid: errors.length === 0, validationErrors: errors };
}

// ── Confidence Calculator ─────────────────────────────────────────────────────

function calculateConfidence(
  type: GoalType,
  matchedSignals: number,
  totalSignals: number,
  cognitiveConfidence: number,
): number {
  if (type === "unknown" || type === "general.conversation") return 0.3;
  const signalScore  = totalSignals > 0 ? matchedSignals / totalSignals : 0;
  const blended      = signalScore * 0.6 + cognitiveConfidence * 0.4;
  return Math.round(Math.min(blended, 1) * 100) / 100;
}

// ── ConversationGoalBridge ─────────────────────────────────────────────────────

export class ConversationGoalBridge {
  private _totalProcessed = 0;
  private _lastGoals: ConversationGoal[] = [];

  /**
   * Transforma uma mensagem do usuario + intencao cognitiva em um ConversationGoal.
   *
   * Garantias:
   * - Nunca lanca excecao (retorna goal do tipo "unknown" em caso de falha)
   * - Nunca faz chamadas de rede
   * - Nunca chama connectors, planning ou runtime
   * - Determinístico para a mesma entrada
   */
  derive(
    userMessage: string,
    cognitiveIntent: CognitiveIntent,
    cognitiveConfidence: number,
  ): GoalBridgeResult {
    const t0 = Date.now();
    const lower = userMessage.toLowerCase();

    let matchedPattern: GoalPattern | null = null;
    let matchedCount = 0;

    for (const pattern of GOAL_PATTERNS) {
      const matched = pattern.signals.filter((s) => lower.includes(s));
      if (matched.length > 0) {
        matchedPattern = pattern;
        matchedCount   = matched.length;
        break;
      }
    }

    let goalType: GoalType;
    let params: Record<string, unknown>;

    if (matchedPattern) {
      goalType = matchedPattern.type;
      params   = matchedPattern.extractParams(userMessage);
    } else {
      // Map cognitive intent to a sensible fallback goal type
      goalType = this._intentToGoalType(cognitiveIntent);
      params   = {};
    }

    const confidence = calculateConfidence(
      goalType,
      matchedCount,
      matchedPattern?.signals.length ?? 0,
      cognitiveConfidence,
    );

    const partial = {
      id:              makeGoalId(),
      type:            goalType,
      confidence,
      parameters:      Object.freeze(params),
      userIntent:      userMessage,
      cognitiveIntent,
      createdAt:       Date.now(),
    };

    const { valid, validationErrors } = validateGoal(partial);

    const goal: ConversationGoal = Object.freeze({
      ...partial,
      valid,
      validationErrors: Object.freeze(validationErrors),
    });

    this._totalProcessed++;
    this._lastGoals.push(goal);
    if (this._lastGoals.length > 100) this._lastGoals.splice(0, this._lastGoals.length - 100);

    return { goal, durationMs: Date.now() - t0 };
  }

  // ── Intent → GoalType fallback mapping ────────────────────────────────────

  private _intentToGoalType(intent: CognitiveIntent): GoalType {
    switch (intent) {
      case "connector_diagnostics":    return "unknown";
      case "project_status":           return "memory.query";
      case "project_history":          return "memory.query";
      case "knowledge_reconstruction": return "memory.summarize";
      case "next_sprint":              return "memory.query";
      case "repository_analysis":      return "general.conversation";
      case "application_analysis":     return "general.conversation";
      case "architecture_question":    return "general.conversation";
      case "implementation_status":    return "general.conversation";
      case "technical_debt":           return "general.conversation";
      case "general_conversation":     return "general.conversation";
      default:                         return "unknown";
    }
  }

  // ── Metrics ───────────────────────────────────────────────────────────────

  getMetrics() {
    return {
      totalProcessed: this._totalProcessed,
      lastGoals:      [...this._lastGoals].reverse().slice(0, 20),
    };
  }
}

// ── App-wide singleton ────────────────────────────────────────────────────────

const _KEY = "__CGB_BRIDGE__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new ConversationGoalBridge();
}

export const conversationGoalBridge: ConversationGoalBridge = (
  globalThis as unknown as Record<string, ConversationGoalBridge>
)[_KEY];