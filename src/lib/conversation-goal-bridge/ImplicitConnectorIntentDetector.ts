/**
 * ImplicitConnectorIntentDetector.ts — Engineering Sprint E-02.6
 * Implicit Connector Intent Recognition
 *
 * SRP: receber texto de conversa + connectors registrados e decidir
 *      se existe uma intenção implícita de acionar algum Connector.
 *
 * Garantias:
 * - NAO executa nada
 * - NAO chama connectors
 * - NAO faz chamadas de rede
 * - NAO modifica qualquer camada arquitetural
 * - Retorna Goal implícito OU null
 *
 * Critérios de ativação (todos devem ser verdadeiros):
 * 1. GoalRegistry não encontrou Goal explícito (ou resultado é general.conversation/unknown)
 * 2. Mensagem tem até 5 palavras
 * 3. Mensagem não contém verbos de ação conhecidos
 * 4. Existe Connector registrado com capability compatível
 */

import type { GoalType } from "@/lib/goals/GoalTypes";
import type { GoalDefinition } from "@/lib/goals/GoalRegistry";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ImplicitIntentResult {
  /** true = found implicit connector intent */
  readonly detected:    boolean;
  /** The Goal type to dispatch */
  readonly goalType:    GoalType | null;
  /** Parameters for the goal (e.g. {query: "shopee"}) */
  readonly parameters:  Readonly<Record<string, unknown>>;
  /** Confidence score 0-1 */
  readonly confidence:  number;
  /** Human label for logging/observability */
  readonly label:       string;
  /** The raw trimmed text used as search term */
  readonly searchTerm:  string;
}

// ── Action verbs — presence means the message is explicit, not implicit ────────

const ACTION_VERBS = [
  // Portuguese
  "procure", "procura", "procurar", "procuro",
  "busque", "busca", "buscar", "busco",
  "pesquise", "pesquisa", "pesquisar", "pesquiso",
  "encontre", "encontra", "encontrar", "encontro",
  "mostre", "mostra", "mostrar", "mostro",
  "liste", "lista", "listar", "listo",
  "abra", "abrir", "abre",
  "crie", "cria", "criar", "crio",
  "agende", "agenda", "agendar",
  "envie", "envia", "enviar",
  "responda", "responder", "responde",
  "leia", "ler", "ler", "le",
  "veja", "ver", "vejo",
  "cheque", "checar", "checa",
  "quero", "queria", "preciso",
  "me mostra", "me mostre", "me lista",
  "me busca", "me procura", "me encontra",
  // English
  "search", "find", "look", "get", "show", "list",
  "open", "read", "send", "create", "schedule",
  "check", "fetch", "retrieve", "give me",
];

// ── Filler words to strip before treating as search term ─────────────────────

const FILLER_PATTERNS = [
  /\b(emails?|e-?mails?|mensagens?|messages?)\b/gi,
  /\b(da|do|de|dos?|das?|no|na|nos?|nas?|sobre|para|com|por)\b/gi,
];

// ── Connectors that support implicit search ───────────────────────────────────
// Maps from GoalDefinition.namespace → the implicit GoalType to use.
// When a new connector registers its namespace in GoalRegistry,
// it only needs an entry here to enable implicit intent detection.

const IMPLICIT_SEARCH_CAPABILITY: Readonly<Record<string, GoalType>> = Object.freeze({
  gmail:    "gmail.searchMessages",
  calendar: "calendar.listToday",
  drive:    "drive.searchFiles",
  memory:   "memory.query",
});

// ── ImplicitConnectorIntentResolver ──────────────────────────────────────────

export interface ImplicitConnectorIntentResolver {
  resolve(
    message:              string,
    registeredDefinitions: readonly GoalDefinition[],
  ): ImplicitIntentResult;
}

// ── Implementation ────────────────────────────────────────────────────────────

class ImplicitConnectorIntentDetectorImpl implements ImplicitConnectorIntentResolver {
  private _totalChecked = 0;
  private _totalDetected = 0;

  /**
   * Resolves implicit connector intent from a short, verb-free user message.
   *
   * @param message               — raw user message
   * @param registeredDefinitions — list from GoalRegistry.listAll()
   * @returns ImplicitIntentResult
   */
  resolve(
    message:               string,
    registeredDefinitions: readonly GoalDefinition[],
  ): ImplicitIntentResult {
    this._totalChecked++;
    const trimmed = message.trim();
    const lower   = trimmed.toLowerCase();

    const none = (label: string): ImplicitIntentResult => Object.freeze({
      detected:   false,
      goalType:   null,
      parameters: Object.freeze({}),
      confidence: 0,
      label,
      searchTerm: trimmed,
    });

    // ── Criterion 1: message must have 5 words or fewer ─────────────────────
    const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
    if (wordCount > 5) return none("too_many_words");

    // ── Criterion 2: no action verbs ────────────────────────────────────────
    const hasVerb = ACTION_VERBS.some((v) => lower.includes(v));
    if (hasVerb) return none("has_action_verb");

    // ── Criterion 3: not a social phrase (greetings, pleasantries) ──────────
    const SOCIAL = [
      "ola", "olá", "bom dia", "boa tarde", "boa noite",
      "obrigado", "obrigada", "tchau", "tudo bem", "tudo bom",
      "quem e voce", "quem é você", "conte uma piada", "piada",
      "como vai", "oi", "hi", "hello", "thanks", "thank you",
      "ok", "certo", "entendido", "blz", "vlw",
    ];
    if (SOCIAL.some((s) => lower === s || lower.startsWith(s + " "))) {
      return none("social_phrase");
    }

    // ── Criterion 4: derive which connectors are registered ─────────────────
    const registeredNamespaces = new Set(
      registeredDefinitions.map((d) => d.namespace)
    );

    // ── Criterion 5: determine target connector + capability ─────────────────
    // Priority: gmail (most common for short searches)
    // Can be extended by adding entries to IMPLICIT_SEARCH_CAPABILITY.
    let targetGoalType: GoalType | null = null;
    for (const [ns, gt] of Object.entries(IMPLICIT_SEARCH_CAPABILITY)) {
      if (registeredNamespaces.has(ns)) {
        targetGoalType = gt;
        break; // use first available connector
      }
    }

    if (!targetGoalType) return none("no_compatible_connector");

    // ── Build the search term ────────────────────────────────────────────────
    let searchTerm = trimmed;
    for (const pattern of FILLER_PATTERNS) {
      searchTerm = searchTerm.replace(pattern, " ");
    }
    searchTerm = searchTerm.replace(/\s{2,}/g, " ").trim();
    if (!searchTerm) searchTerm = trimmed; // fallback to original

    this._totalDetected++;

    return Object.freeze({
      detected:   true,
      goalType:   targetGoalType,
      parameters: Object.freeze({ query: searchTerm }),
      confidence: 0.75,
      label:      `implicit:${targetGoalType}`,
      searchTerm,
    });
  }

  getMetrics() {
    return {
      totalChecked:  this._totalChecked,
      totalDetected: this._totalDetected,
    };
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const _KEY = "__IMPLICIT_INTENT_DETECTOR__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new ImplicitConnectorIntentDetectorImpl();
}

export const implicitConnectorIntentDetector: ImplicitConnectorIntentDetectorImpl = (
  globalThis as unknown as Record<string, ImplicitConnectorIntentDetectorImpl>
)[_KEY];

// ── Test suite ────────────────────────────────────────────────────────────────

export interface ImplicitIntentTest {
  name:        string;
  input:       string;
  expectDetect: boolean;
  passed:      boolean;
  detected:    boolean;
  goalType:    GoalType | null;
  searchTerm:  string;
  error:       string | null;
}

export function runImplicitIntentTests(
  registeredDefinitions: readonly GoalDefinition[],
): ImplicitIntentTest[] {
  const CASES: Array<{ name: string; input: string; expectDetect: boolean }> = [
    // ── Positive cases ────────────────────────────────────────────────────
    { name: "Shopee",         input: "Shopee",          expectDetect: true  },
    { name: "Hostinger",      input: "Hostinger",        expectDetect: true  },
    { name: "Mercado Livre",  input: "Mercado Livre",    expectDetect: true  },
    { name: "Pix",            input: "Pix",              expectDetect: true  },
    { name: "Nota Fiscal",    input: "Nota Fiscal",      expectDetect: true  },
    { name: "GitHub",         input: "GitHub",           expectDetect: true  },
    { name: "Contrato",       input: "Contrato",         expectDetect: true  },
    { name: "Calendário",     input: "Calendário",       expectDetect: true  },
    { name: "Amazon",         input: "Amazon",           expectDetect: true  },
    { name: "DANFE",          input: "DANFE",            expectDetect: true  },
    // ── Negative cases ────────────────────────────────────────────────────
    { name: "Ola",            input: "Olá",              expectDetect: false },
    { name: "Bom dia",        input: "Bom dia",          expectDetect: false },
    { name: "Obrigado",       input: "Obrigado",         expectDetect: false },
    { name: "Tudo bem",       input: "Tudo bem",         expectDetect: false },
    { name: "Quem e voce",    input: "Quem é você",      expectDetect: false },
    { name: "Conte uma piada",input: "Conte uma piada",  expectDetect: false },
    { name: "Procure emails", input: "Procure emails da Shopee", expectDetect: false }, // has verb
    { name: "Long phrase",    input: "Eu quero muito ver os emails da Shopee hoje", expectDetect: false }, // too many words
  ];

  const det = implicitConnectorIntentDetector;

  return CASES.map(({ name, input, expectDetect }) => {
    const result = det.resolve(input, registeredDefinitions);
    const passed = result.detected === expectDetect;
    return {
      name,
      input,
      expectDetect,
      passed,
      detected:   result.detected,
      goalType:   result.goalType,
      searchTerm: result.searchTerm,
      error:      passed ? null : `Expected detected=${expectDetect}, got ${result.detected} (${result.label})`,
    };
  });
}