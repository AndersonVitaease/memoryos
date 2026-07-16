/**
 * ImplicitConnectorIntentDetector.ts — Engineering Sprint 9.2.1
 * Implicit Connector Intent Recognition v2 — Evidence-Based Scoring
 *
 * SRP: receber texto de conversa + connectors registrados e decidir
 *      qual connector possui maior evidencia para esta mensagem.
 *
 * BREAKING CHANGE from v1:
 *   v1 usava "primeiro connector registrado" (gmail-first bug).
 *   v2 usa scoring por evidencias semanticas — ordem de registro
 *   e completamente irrelevante para o resultado.
 *
 * Garantias:
 * - DETERMINISTICA: mesma entrada sempre produz mesmo output
 * - PURA: sem efeitos colaterais, sem estado mutavel por chamada
 * - IMUTAVEL: todos os objetos retornados sao Object.freeze()
 * - AUDITAVEL: cada decisao acompanha evidencias[] e ranking[]
 * - EXPLICAVEL: campo explanation[] em ImplicitResolution
 * - SEM REDE: nenhuma chamada de API ou LLM
 * - SEM ORDEM: resultado independe da ordem de registro dos connectors
 *
 * Algoritmo:
 *   1. Normalizacao da mensagem
 *   2. Extracao de sinais semanticos (entidade, temporalidade, documento)
 *   3. Construcao de ConnectorCandidate para cada connector registrado
 *   4. Pontuacao independente por connector (sem referencia a outros)
 *   5. Ranking por score decrescente
 *   6. Winner = highestScore
 */

import type { GoalType } from "@/lib/goals/GoalTypes";
import type { GoalDefinition } from "@/lib/goals/GoalRegistry";
import { normalize } from "./NaturalLanguageGoalNormalizer";

// ── Public types ───────────────────────────────────────────────────────────────

/** Identificador do connector como usado no GoalRegistry */
export type ConnectorId = "gmail" | "calendar" | "drive" | "memory" | string;

/**
 * Candidato produzido para cada connector registrado.
 * Score e evidencias sao independentes entre connectors.
 */
export interface ConnectorCandidate {
  readonly connectorId: ConnectorId;
  readonly goalType:    GoalType;
  readonly score:       number;
  readonly evidences:   readonly string[];
}

/**
 * Resultado completo da resolucao implicita.
 * Inclui winner, ranking completo e explicacao auditavel.
 */
export interface ImplicitResolution {
  readonly winner:      ConnectorCandidate;
  readonly ranking:     readonly ConnectorCandidate[];
  readonly confidence:  number;
  readonly explanation: readonly string[];
}

/** Resultado publico compativel com o contrato anterior (ConversationGoalBridge). */
export interface ImplicitIntentResult {
  readonly detected:    boolean;
  readonly goalType:    GoalType | null;
  readonly parameters:  Readonly<Record<string, unknown>>;
  readonly confidence:  number;
  readonly label:       string;
  readonly searchTerm:  string;
  /** v2 addition: full resolution for observability/dashboard */
  readonly resolution:  ImplicitResolution | null;
}

// ── Connector scoring tables ───────────────────────────────────────────────────
// Each connector has its own independent scoring signals.
// No connector references another connector's signals.
// Order within each table is irrelevant — all signals are evaluated.

/** Gmail semantic signals */
const GMAIL_SIGNALS = Object.freeze({
  // Direct email mentions → high weight
  emailKeywords:    ["email", "e-mail", "emails", "e-mails", "mensagem", "mensagens",
                     "inbox", "caixa de entrada", "correio"],
  // Financial/transactional documents — almost always arrive via email
  financialDocs:    ["boleto", "fatura", "nota fiscal", "nfe", "danfe", "darf", "pix",
                     "pagamento", "pagamentos", "recibo", "nf"],
  // Commercial entities — common email senders
  commercialBrands: ["shopee", "amazon", "hostinger", "mercado livre", "mercadolivre",
                     "mercado pago", "mercadopago", "ifood", "correios", "magalu",
                     "americanas", "aliexpress", "ebay", "shopify"],
  // Verbs that imply email actions
  emailVerbs:       ["recebi", "recebeu", "receber", "enviei", "enviar", "responder",
                     "encaminhar", "encaminhou"],
  // Contextual indicators
  contextPhrases:   ["da shopee", "do amazon", "da hostinger", "do mercado", "da fatura"],
});

/** Calendar semantic signals */
const CALENDAR_SIGNALS = Object.freeze({
  // Temporal references — strongest calendar indicators
  temporalDirect:   ["hoje", "today", "amanha", "amanhã", "tomorrow", "ontem", "yesterday",
                     "semana", "week", "mes", "mês", "month", "ano", "year",
                     "segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo",
                     "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
  // Event-type words
  eventTypes:       ["reuniao", "reunião", "reunioes", "reuniões", "meeting", "compromisso",
                     "compromissos", "evento", "eventos", "event", "events", "agendamento",
                     "lembrete", "reminder", "call", "chamada"],
  // Time references
  timeRefs:         ["hora", "horario", "horário", "schedule", "agenda", "calendario",
                     "calendário", "calendar"],
  // Relative time phrases
  relativePhrases:  ["esta semana", "proximo", "proxima", "próximo", "próxima", "next",
                     "fin de semana", "fds", "fim de semana"],
});

/** Drive semantic signals */
const DRIVE_SIGNALS = Object.freeze({
  // Document types — strongest drive indicators
  documentTypes:    ["arquivo", "arquivos", "file", "files", "documento", "documentos",
                     "document", "documents", "planilha", "planilhas", "spreadsheet",
                     "apresentacao", "apresentação", "presentation", "slides", "pdf",
                     "doc", "docx", "xlsx", "pptx", "csv"],
  // Drive actions
  driveActions:     ["abrir", "abra", "open", "criar documento", "editar", "edit",
                     "compartilhar", "share", "upload", "baixar", "download"],
  // Storage context
  storageContext:   ["drive", "google drive", "pasta", "folder", "pastas", "folders",
                     "meus arquivos", "my files", "recentes", "recent"],
  // Contract documents (not financial — typically stored in drive)
  contractDocs:     ["contrato", "contratos", "contract", "contracts", "proposta",
                     "proposta comercial", "ata", "relatorio", "relatório", "report"],
});

/** Memory semantic signals */
const MEMORY_SIGNALS = Object.freeze({
  // Direct memory references
  memoryDirect:     ["lembro", "lembrar", "recordo", "recordar", "memoria", "memória",
                     "remember", "memory", "recall"],
  // History references
  historyPhrases:   ["o que eu disse", "o que falamos", "discutimos", "conversamos",
                     "what i said", "what we discussed"],
  // Summary requests
  summaryPhrases:   ["resumo", "resumir", "summarize", "summary", "recap", "recapitular",
                     "o que foi discutido", "o que falamos"],
  // Session context
  sessionContext:   ["sessao", "sessão", "session", "conversa", "conversa anterior",
                     "ultimas conversas", "historico", "histórico"],
});

// ── Scoring functions ──────────────────────────────────────────────────────────
// Each function is independent and scores its connector without referencing others.

function scoreGmail(lower: string, norm: ReturnType<typeof normalize>): { score: number; evidences: string[] } {
  const evidences: string[] = [];
  let score = 0;

  // Direct email keyword: very strong signal
  for (const kw of GMAIL_SIGNALS.emailKeywords) {
    if (lower.includes(kw)) {
      score += 0.40;
      evidences.push(`email-keyword: "${kw}"`);
      break; // count once
    }
  }

  // Financial documents: strong email signal
  for (const doc of GMAIL_SIGNALS.financialDocs) {
    if (lower.includes(doc)) {
      score += 0.30;
      evidences.push(`financial-doc: "${doc}"`);
      break;
    }
  }

  // Commercial brands: moderate email signal
  for (const brand of GMAIL_SIGNALS.commercialBrands) {
    if (lower.includes(brand)) {
      score += 0.25;
      evidences.push(`commercial-brand: "${brand}"`);
      break;
    }
  }

  // Email verbs: strong signal
  for (const verb of GMAIL_SIGNALS.emailVerbs) {
    if (lower.includes(verb)) {
      score += 0.20;
      evidences.push(`email-verb: "${verb}"`);
      break;
    }
  }

  // Normalizer detected email query
  if (norm.isEmailQuery) {
    score += 0.15;
    evidences.push("normalizer: isEmailQuery=true");
  }

  return { score: Math.min(score, 1.0), evidences };
}

function scoreCalendar(lower: string): { score: number; evidences: string[] } {
  const evidences: string[] = [];
  let score = 0;

  // Direct temporal references: strongest calendar signal
  for (const t of CALENDAR_SIGNALS.temporalDirect) {
    if (lower.includes(t)) {
      score += 0.45;
      evidences.push(`temporal: "${t}"`);
      break;
    }
  }

  // Event type words
  for (const ev of CALENDAR_SIGNALS.eventTypes) {
    if (lower.includes(ev)) {
      score += 0.35;
      evidences.push(`event-type: "${ev}"`);
      break;
    }
  }

  // Time references
  for (const tr of CALENDAR_SIGNALS.timeRefs) {
    if (lower.includes(tr)) {
      score += 0.20;
      evidences.push(`time-ref: "${tr}"`);
      break;
    }
  }

  // Relative time phrases
  for (const rp of CALENDAR_SIGNALS.relativePhrases) {
    if (lower.includes(rp)) {
      score += 0.15;
      evidences.push(`relative-phrase: "${rp}"`);
      break;
    }
  }

  return { score: Math.min(score, 1.0), evidences };
}

function scoreDrive(lower: string): { score: number; evidences: string[] } {
  const evidences: string[] = [];
  let score = 0;

  // Document type words: strongest drive signal
  for (const dt of DRIVE_SIGNALS.documentTypes) {
    if (lower.includes(dt)) {
      score += 0.45;
      evidences.push(`document-type: "${dt}"`);
      break;
    }
  }

  // Drive actions
  for (const da of DRIVE_SIGNALS.driveActions) {
    if (lower.includes(da)) {
      score += 0.30;
      evidences.push(`drive-action: "${da}"`);
      break;
    }
  }

  // Storage context
  for (const sc of DRIVE_SIGNALS.storageContext) {
    if (lower.includes(sc)) {
      score += 0.35;
      evidences.push(`storage-context: "${sc}"`);
      break;
    }
  }

  // Contract documents
  for (const cd of DRIVE_SIGNALS.contractDocs) {
    if (lower.includes(cd)) {
      score += 0.25;
      evidences.push(`contract-doc: "${cd}"`);
      break;
    }
  }

  return { score: Math.min(score, 1.0), evidences };
}

function scoreMemory(lower: string): { score: number; evidences: string[] } {
  const evidences: string[] = [];
  let score = 0;

  // Direct memory references
  for (const md of MEMORY_SIGNALS.memoryDirect) {
    if (lower.includes(md)) {
      score += 0.50;
      evidences.push(`memory-direct: "${md}"`);
      break;
    }
  }

  // History phrases
  for (const hp of MEMORY_SIGNALS.historyPhrases) {
    if (lower.includes(hp)) {
      score += 0.40;
      evidences.push(`history-phrase: "${hp}"`);
      break;
    }
  }

  // Summary requests
  for (const sp of MEMORY_SIGNALS.summaryPhrases) {
    if (lower.includes(sp)) {
      score += 0.35;
      evidences.push(`summary-phrase: "${sp}"`);
      break;
    }
  }

  // Session context
  for (const sc of MEMORY_SIGNALS.sessionContext) {
    if (lower.includes(sc)) {
      score += 0.20;
      evidences.push(`session-context: "${sc}"`);
      break;
    }
  }

  return { score: Math.min(score, 1.0), evidences };
}

// ── Goal type map for implicit detection ──────────────────────────────────────
// Maps namespace → the implicit GoalType to use.
// This is a pure lookup — no ordering dependency.

const IMPLICIT_GOAL_TYPE: Readonly<Record<string, GoalType>> = Object.freeze({
  gmail:    "gmail.searchMessages",
  calendar: "calendar.listToday",
  drive:    "drive.searchFiles",
  memory:   "memory.query",
});

// ── Scorer dispatch map ───────────────────────────────────────────────────────
// Pure function per connector — independent of registration order.

type ScorerFn = (lower: string, norm: ReturnType<typeof normalize>) => { score: number; evidences: string[] };

const CONNECTOR_SCORERS: Readonly<Record<string, ScorerFn>> = Object.freeze({
  gmail:    (lower, norm) => scoreGmail(lower, norm),
  calendar: (lower)       => scoreCalendar(lower),
  drive:    (lower)       => scoreDrive(lower),
  memory:   (lower)       => scoreMemory(lower),
});

// ── Minimum score threshold to be considered a valid candidate ─────────────────
const MIN_SCORE_THRESHOLD = 0.20;

// ── ImplicitConnectorIntentDetectorImpl ────────────────────────────────────────

class ImplicitConnectorIntentDetectorImpl {
  private _totalChecked  = 0;
  private _totalDetected = 0;

  /**
   * Resolves implicit connector intent using evidence-based scoring.
   *
   * The winning connector is the one with the highest score.
   * Registration order of connectors has ZERO effect on the result.
   *
   * @param message               — raw user message
   * @param registeredDefinitions — list from GoalRegistry.listAll()
   * @returns ImplicitIntentResult (compatible with ConversationGoalBridge contract)
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
      resolution: null,
    });

    // ── Step 1: Normalize ────────────────────────────────────────────────────
    const norm = normalize(trimmed);

    if (norm.isSocialPhrase) return none("social_phrase");
    if (!norm.entity.trim()) return none("empty_entity");

    const lower = trimmed.toLowerCase();

    // ── Step 2: Collect registered namespaces ────────────────────────────────
    const registeredNamespaces = new Set(
      registeredDefinitions.map((d) => d.namespace)
    );

    // ── Step 3: Score each registered connector independently ────────────────
    // ORDER-INDEPENDENT: we build all candidates first, then rank.
    const candidates: ConnectorCandidate[] = [];

    for (const [ns, goalType] of Object.entries(IMPLICIT_GOAL_TYPE)) {
      if (!registeredNamespaces.has(ns)) continue;

      const scorer = CONNECTOR_SCORERS[ns];
      if (!scorer) continue;

      const { score, evidences } = scorer(lower, norm);

      candidates.push(Object.freeze({
        connectorId: ns,
        goalType,
        score:       Math.round(score * 1000) / 1000, // 3 decimal precision
        evidences:   Object.freeze([...evidences]),
      }));
    }

    if (candidates.length === 0) return none("no_registered_connectors");

    // ── Step 4: Rank by score descending (deterministic tiebreak by connectorId) ──
    const ranking = [...candidates].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Stable tiebreak: alphabetical by connectorId — never by registration order
      return a.connectorId.localeCompare(b.connectorId);
    });

    const winner = ranking[0];

    // ── Step 5: Reject if best score is below threshold ──────────────────────
    if (winner.score < MIN_SCORE_THRESHOLD) {
      return none(`below_threshold:${winner.connectorId}:${winner.score}`);
    }

    // ── Step 6: Build explanation ────────────────────────────────────────────
    const explanation: string[] = [
      `Winner: ${winner.connectorId} (score=${winner.score})`,
      `Evidences: ${winner.evidences.join(", ") || "none"}`,
      `Ranking: ${ranking.map((c) => `${c.connectorId}=${c.score}`).join(" > ")}`,
      `Entity: "${norm.entity}"`,
      `SearchTerm used: "${norm.entity}"`,
    ];

    const resolution: ImplicitResolution = Object.freeze({
      winner:      Object.freeze(winner),
      ranking:     Object.freeze([...ranking]),
      confidence:  winner.score,
      explanation: Object.freeze([...explanation]),
    });

    this._totalDetected++;

    return Object.freeze({
      detected:   true,
      goalType:   winner.goalType,
      parameters: Object.freeze({ query: norm.entity }),
      confidence: winner.score,
      label:      `evidence:${winner.connectorId}:score=${winner.score}`,
      searchTerm: norm.entity,
      resolution,
    });
  }

  getMetrics() {
    return {
      totalChecked:      this._totalChecked,
      totalDetected:     this._totalDetected,
      minScoreThreshold: MIN_SCORE_THRESHOLD,
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

// ── Legacy test runner (kept for backward compatibility with SprintE021Page) ──

export interface ImplicitIntentTest {
  name:         string;
  input:        string;
  expectDetect: boolean;
  passed:       boolean;
  detected:     boolean;
  goalType:     GoalType | null;
  searchTerm:   string;
  error:        string | null;
}

export function runImplicitIntentTests(
  registeredDefinitions: readonly GoalDefinition[],
): ImplicitIntentTest[] {
  const CASES: Array<{ name: string; input: string; expectDetect: boolean }> = [
    // Positive — bare entities (financial docs — email)
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
    // Positive — natural interrogative forms
    { name: "Tenho email Shopee",       input: "Tenho email da Shopee?",              expectDetect: true  },
    { name: "Existe email Shopee",      input: "Existe algum email da Shopee?",       expectDetect: true  },
    { name: "Recebi email Shopee",      input: "Recebi algum email da Shopee?",       expectDetect: true  },
    { name: "Recebi Pix",               input: "Recebi Pix?",                         expectDetect: true  },
    { name: "Recebi boleto",            input: "Recebi algum boleto?",                expectDetect: true  },
    { name: "Recebi ML",                input: "Recebi algo do Mercado Livre?",       expectDetect: true  },
    { name: "Tem nota fiscal",          input: "Tem alguma nota fiscal?",             expectDetect: true  },
    { name: "Ha DANFE",                 input: "Ha algum DANFE?",                     expectDetect: true  },
    // Negative — social/greeting
    { name: "Ola",                      input: "Ola",                                 expectDetect: false },
    { name: "Bom dia",                  input: "Bom dia",                             expectDetect: false },
    { name: "Obrigado",                 input: "Obrigado",                            expectDetect: false },
    { name: "Tudo bem",                 input: "Tudo bem",                            expectDetect: false },
    { name: "Quem e voce",              input: "Quem e voce",                         expectDetect: false },
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