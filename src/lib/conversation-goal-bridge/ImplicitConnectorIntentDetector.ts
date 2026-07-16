/**
 * ImplicitConnectorIntentDetector.ts — Engineering Sprint E-02.6 / E-02.7
 * Implicit Connector Intent Recognition + Natural Language Normalization
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
import { normalize } from "./NaturalLanguageGoalNormalizer";

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

    const none = (label: string): ImplicitIntentResult => Object.freeze({
      detected:   false,
      goalType:   null,
      parameters: Object.freeze({}),
      confidence: 0,
      label,
      searchTerm: trimmed,
    });

    // ── Step 1: Normalize — extract entity + detect social ───────────────────
    const norm = normalize(trimmed);

    if (norm.isSocialPhrase) return none("social_phrase");

    // ── Step 2: Entity must be non-empty after normalization ─────────────────
    if (!norm.entity.trim()) return none("empty_entity");

    // ── Step 3: Must not be a pure action-verb-only sentence (no entity) ─────
    // If the normalized entity is the same length as the original and has no
    // known entity, check the word-count guard (≤8 words) to avoid long prose.
    const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
    if (wordCount > 8 && !norm.isKnownEntity) return none("too_many_words_no_entity");

    // ── Step 4: derive which connectors are registered ───────────────────────
    const registeredNamespaces = new Set(
      registeredDefinitions.map((d) => d.namespace)
    );

    // ── Step 5: determine target connector + capability ──────────────────────
    let targetGoalType: GoalType | null = null;
    for (const [ns, gt] of Object.entries(IMPLICIT_SEARCH_CAPABILITY)) {
      if (registeredNamespaces.has(ns)) {
        targetGoalType = gt;
        break;
      }
    }

    if (!targetGoalType) return none("no_compatible_connector");

    this._totalDetected++;

    const searchTerm = norm.entity;

    return Object.freeze({
      detected:   true,
      goalType:   targetGoalType,
      parameters: Object.freeze({ query: searchTerm }),
      confidence: norm.isKnownEntity ? 0.9 : 0.75,
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
    // ── Positive — bare entities ───────────────────────────────────────────
    { name: "Shopee bare",              input: "Shopee",                              expectDetect: true  },
    { name: "Hostinger bare",           input: "Hostinger",                           expectDetect: true  },
    { name: "Mercado Livre bare",       input: "Mercado Livre",                       expectDetect: true  },
    { name: "Pix bare",                 input: "Pix",                                 expectDetect: true  },
    { name: "Nota Fiscal bare",         input: "Nota Fiscal",                         expectDetect: true  },
    { name: "GitHub bare",              input: "GitHub",                              expectDetect: true  },
    { name: "Contrato bare",            input: "Contrato",                            expectDetect: true  },
    { name: "Amazon bare",              input: "Amazon",                              expectDetect: true  },
    { name: "DANFE bare",               input: "DANFE",                               expectDetect: true  },
    { name: "Boleto bare",              input: "Boleto",                              expectDetect: true  },
    // ── Positive — natural interrogative forms ─────────────────────────────
    { name: "Tenho email Shopee",       input: "Tenho email da Shopee?",              expectDetect: true  },
    { name: "Existe email Shopee",      input: "Existe algum email da Shopee?",       expectDetect: true  },
    { name: "Recebi email Shopee",      input: "Recebi algum email da Shopee?",       expectDetect: true  },
    { name: "Recebi Pix",               input: "Recebi Pix?",                         expectDetect: true  },
    { name: "Recebi boleto",            input: "Recebi algum boleto?",                expectDetect: true  },
    { name: "Recebi ML",                input: "Recebi algo do Mercado Livre?",       expectDetect: true  },
    { name: "Tem nota fiscal",          input: "Tem alguma nota fiscal?",             expectDetect: true  },
    { name: "Ha DANFE",                 input: "Há algum DANFE?",                     expectDetect: true  },
    // ── Negative — social/greeting ─────────────────────────────────────────
    { name: "Ola",                      input: "Olá",                                 expectDetect: false },
    { name: "Bom dia",                  input: "Bom dia",                             expectDetect: false },
    { name: "Obrigado",                 input: "Obrigado",                            expectDetect: false },
    { name: "Tudo bem",                 input: "Tudo bem",                            expectDetect: false },
    { name: "Quem e voce",              input: "Quem é você",                         expectDetect: false },
    { name: "Conte uma piada",          input: "Conte uma piada",                     expectDetect: false },
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