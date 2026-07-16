/**
 * UnifiedContextPolicy.ts — Sprint 8.11
 *
 * SRP: Decide which context sources to consult, with what priority,
 *      limits, timeouts and fallbacks.
 *
 * Rules:
 * - Deterministic. No LLM.
 * - No network calls.
 * - No side effects.
 * - Signal-matching only.
 *
 * MDS v2.0 compliant.
 */

import type {
  ContextIntent,
  ContextSourceId,
  SourceSelectionPolicy,
  PolicyEvaluation,
} from "./UnifiedContextTypes";

// ── Signal sets (keyword → intent) ───────────────────────────────────────────

const CODE_SIGNALS = [
  "github", "repositorio", "repository", "codigo", "code", "commit", "branch",
  "pull request", "pr", "issue", "bug", "funcao", "function", "classe", "class",
  "arquivo", "file", "pasta", "folder", "deploy", "build", "test", "teste",
  "implementar", "refactor", "review", "merge", "endpoint", "api", "backend",
  "frontend", "componente", "component", "typescript", "javascript", "python",
  "sprint", "engineering", "engenharia",
];

const EMAIL_SIGNALS = [
  "email", "e-mail", "gmail", "mensagem", "inbox", "caixa de entrada", "enviar",
  "responder", "reply", "send", "mensagem recebida", "remetente", "assunto",
  "subject", "draft", "rascunho", "attachment", "anexo", "thread",
];

const DRIVE_SIGNALS = [
  "drive", "documento", "document", "planilha", "spreadsheet", "apresentacao",
  "presentation", "pdf", "arquivo", "file", "pasta", "folder", "compartilhar",
  "share", "google docs", "google sheets", "gdrive", "meu drive",
];

const CALENDAR_SIGNALS = [
  "calendario", "calendar", "evento", "event", "reuniao", "meeting", "agenda",
  "horario", "amanha", "tomorrow", "semana", "week",
  "compromisso", "appointment", "agendamento", "convite", "invite",
];

const BASE44_SIGNALS = [
  "base44",
];

// ── Policy map: intent → source selection ────────────────────────────────────

const POLICY_MAP: Record<ContextIntent, {
  sources:   ContextSourceId[];
  timeoutMs: number;
  reason:    string;
}> = {
  code: {
    sources:   [
      "memory.session_summary",
      "memory.entities",
      "memory.topics",
      "working_memory",
      "github_connector",
      "official_library",
    ],
    timeoutMs: 5000,
    reason:    "Code intent: GitHub + Official Library + Working Memory",
  },
  email: {
    sources:   [
      "memory.session_summary",
      "memory.entities",
      "memory.tasks",
      "working_memory",
      "gmail_connector",
    ],
    timeoutMs: 4000,
    reason:    "Email intent: Gmail + Memory entities + tasks",
  },
  drive: {
    sources:   [
      "memory.session_summary",
      "memory.entities",
      "working_memory",
      "drive_connector",
      "official_library",
    ],
    timeoutMs: 4000,
    reason:    "Drive intent: Google Drive + Memory + Official Library",
  },
  calendar: {
    sources:   [
      "memory.session_summary",
      "memory.entities",
      "memory.decisions",
      "working_memory",
      "calendar_connector",
    ],
    timeoutMs: 4000,
    reason:    "Calendar intent: Google Calendar + Memory + Decisions",
  },
  base44: {
    sources:   [
      "memory.session_summary",
      "memory.entities",
      "memory.topics",
      "working_memory",
      "base44_connector",
      "github_connector",
      "official_library",
    ],
    timeoutMs: 5000,
    reason:    "Base44 intent: Base44 + GitHub + Official Library",
  },
  memory: {
    sources:   [
      "memory.session_summary",
      "memory.entities",
      "memory.keywords",
      "memory.topics",
      "memory.decisions",
      "memory.tasks",
      "working_memory",
      "official_library",
    ],
    timeoutMs: 4000,
    reason:    "Memory intent: full memory layer + Official Library",
  },
  general: {
    sources:   [
      "memory.session_summary",
      "memory.entities",
      "memory.keywords",
      "memory.topics",
      "memory.decisions",
      "memory.tasks",
      "working_memory",
      "official_library",
    ],
    timeoutMs: 4000,
    reason:    "General: full memory + Official Library",
  },
};

// ── Intent Classifier ─────────────────────────────────────────────────────────
// Priority order (checked in sequence, first match wins):
//   1. base44  — explicit "base44" keyword always wins
//   2. memory  — explicit recall/history phrases win before generic signals
//   3. email   — gmail/inbox/email signals
//   4. drive   — drive/document signals
//   5. calendar — calendar/meeting/tomorrow signals
//   6. code    — github/function/code signals (broad, so checked last)
//   7. general — fallback

function classifyIntent(userMessage: string): ContextIntent {
  const lower = userMessage.toLowerCase();

  // 1. Base44: explicit keyword always wins
  if (lower.includes("base44")) return "base44";

  // 2. Memory: explicit recall phrases before broad signals
  if (
    lower.includes("what did we") || lower.includes("last week") ||
    lower.includes("decided") || lower.includes("remember") ||
    lower.includes("lembrar") || lower.includes("memoria") ||
    lower.includes("recall") || lower.includes("historico") ||
    lower.includes("decidi") || lower.includes("anteriormente") ||
    lower.includes("semana passada")
  ) {
    return "memory";
  }

  // 3–6: Signal scoring (lower priority intents get weight bonus to avoid false code matches)
  const hits = (signals: string[]): number =>
    signals.filter((s) => lower.includes(s)).length;

  const emailHits    = hits(EMAIL_SIGNALS);
  const driveHits    = hits(DRIVE_SIGNALS);
  const calendarHits = hits(CALENDAR_SIGNALS);
  const codeHits     = hits(CODE_SIGNALS);

  // Email, Drive, Calendar each get a 2x multiplier over code to avoid false code hits
  const scores: [ContextIntent, number][] = [
    ["email",    emailHits    * 2],
    ["drive",    driveHits    * 2],
    ["calendar", calendarHits * 2],
    ["code",     codeHits],
  ];

  scores.sort((a, b) => b[1] - a[1]);
  if (scores[0][1] > 0) return scores[0][0];

  // Fallback
  return "general";
}

// ── UnifiedContextPolicy ──────────────────────────────────────────────────────

export class UnifiedContextPolicy {
  private _evaluations: PolicyEvaluation[] = [];

  /**
   * Given a user message, deterministically select which sources to query.
   * No LLM. No network. Pure signal matching.
   */
  evaluate(userMessage: string): PolicyEvaluation {
    const t0 = Date.now();
    const intent = classifyIntent(userMessage);
    const cfg    = POLICY_MAP[intent];

    const policy: SourceSelectionPolicy = Object.freeze({
      intent,
      selectedSources: Object.freeze([...cfg.sources]),
      timeoutMs:       cfg.timeoutMs,
      reason:          cfg.reason,
    });

    const evaluation: PolicyEvaluation = Object.freeze({
      policy,
      durationMs: Date.now() - t0,
    });

    this._evaluations.push(evaluation);
    if (this._evaluations.length > 200) this._evaluations.splice(0, this._evaluations.length - 200);

    return evaluation;
  }

  /**
   * Returns whether a given source should be consulted for a given intent.
   */
  shouldConsult(sourceId: ContextSourceId, intent: ContextIntent): boolean {
    return POLICY_MAP[intent].sources.includes(sourceId);
  }

  /** All supported intents */
  allIntents(): ContextIntent[] {
    return Object.keys(POLICY_MAP) as ContextIntent[];
  }

  /** Get the policy for a specific intent */
  policyFor(intent: ContextIntent): SourceSelectionPolicy {
    const cfg = POLICY_MAP[intent];
    return Object.freeze({
      intent,
      selectedSources: Object.freeze([...cfg.sources]),
      timeoutMs:       cfg.timeoutMs,
      reason:          cfg.reason,
    });
  }

  getEvaluations(): PolicyEvaluation[] {
    return [...this._evaluations].reverse().slice(0, 50);
  }

  getStats() {
    const intentCounts: Record<string, number> = {};
    for (const e of this._evaluations) {
      intentCounts[e.policy.intent] = (intentCounts[e.policy.intent] ?? 0) + 1;
    }
    return { total: this._evaluations.length, intentCounts };
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const _KEY = "__UCB_POLICY__";
const _g   = globalThis as unknown as Record<string, unknown>;
if (!_g[_KEY]) _g[_KEY] = new UnifiedContextPolicy();
export const unifiedContextPolicy = _g[_KEY] as UnifiedContextPolicy;

// Export classifier for tests
export { classifyIntent };