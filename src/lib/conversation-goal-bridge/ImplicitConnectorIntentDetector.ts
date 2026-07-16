/**
 * ImplicitConnectorIntentDetector.ts — Engineering Sprint 9.2.2
 * Implicit Connector Intent Recognition v3 — Pure Orchestrator
 *
 * SRP: coordenar a resolucao de intencao implicita.
 *      Nunca conhece dominio. Nunca conhece connectors.
 *
 * Open/Closed (Sprint 9.2.2):
 *   Adicionar um novo connector = criar SemanticProvider + registrar.
 *   ZERO linhas deste arquivo precisam mudar.
 *
 * Este arquivo NAO contem:
 *   - palavras-chave
 *   - pesos
 *   - heuristicas
 *   - sinais semanticos
 *   - referencia a Gmail, Calendar, Drive, Memory
 *   - tabelas de connectors
 *
 * Unicas responsabilidades:
 *   1. Normalizar a mensagem
 *   2. Consultar ConnectorSemanticRegistry
 *   3. Solicitar score a cada SemanticProvider
 *   4. Rankear candidatos
 *   5. Escolher winner
 *   6. Retornar ImplicitIntentResult
 *
 * Garantias:
 *   - Deterministica: mesmo input → mesmo output
 *   - Pura: sem efeitos colaterais por chamada
 *   - Imutavel: Object.freeze() em todo output
 *   - Auditavel: ranking[] + evidences[] + explanation[]
 *   - Ordem-independente: resultado independe da ordem de registro
 *   - Sem rede, sem LLM
 */

import type { GoalType }       from "@/lib/goals/GoalTypes";
import type { GoalDefinition } from "@/lib/goals/GoalRegistry";
import { normalize }           from "./NaturalLanguageGoalNormalizer";

// ── Lazy import to avoid circular-dep at module init ──────────────────────────
// ConnectorSemanticRegistry is loaded once and cached below.
let _registry: import("@/lib/semantic-registry/ConnectorSemanticRegistry").ConnectorSemanticRegistryClass | null = null;

async function getRegistry() {
  if (!_registry) {
    // Ensure providers are registered before first use
    const mod = await import("@/lib/semantic-registry/index");
    _registry = mod.ConnectorSemanticRegistry;
  }
  return _registry;
}

// ── Public types ───────────────────────────────────────────────────────────────

export type ConnectorId = string;

export interface ConnectorCandidate {
  readonly connectorId: ConnectorId;
  readonly goalType:    GoalType;
  readonly score:       number;
  readonly evidences:   readonly string[];
}

export interface ImplicitResolution {
  readonly winner:      ConnectorCandidate;
  readonly ranking:     readonly ConnectorCandidate[];
  readonly confidence:  number;
  readonly explanation: readonly string[];
}

export interface ImplicitIntentResult {
  readonly detected:    boolean;
  readonly goalType:    GoalType | null;
  readonly parameters:  Readonly<Record<string, unknown>>;
  readonly confidence:  number;
  readonly label:       string;
  readonly searchTerm:  string;
  readonly resolution:  ImplicitResolution | null;
}

// ── Minimum score threshold ────────────────────────────────────────────────────
const MIN_SCORE_THRESHOLD = 0.20;

// ── ImplicitConnectorIntentDetectorImpl ────────────────────────────────────────

class ImplicitConnectorIntentDetectorImpl {
  private _totalChecked  = 0;
  private _totalDetected = 0;

  /**
   * Resolve intencao implicita de connector para uma mensagem.
   *
   * Consulta o ConnectorSemanticRegistry para obter todos os providers
   * registrados, solicita score a cada um, e elege o winner por maior score.
   *
   * A ordem de registro dos providers nao influencia o resultado.
   *
   * @param message               — raw user message
   * @param registeredDefinitions — list from GoalRegistry.listAll()
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

    // ── 1. Normalize ─────────────────────────────────────────────────────────
    const norm = normalize(trimmed);
    if (norm.isSocialPhrase)   return none("social_phrase");
    if (!norm.entity.trim())   return none("empty_entity");

    const lower = trimmed.toLowerCase();

    // ── 2. Registered namespaces (from GoalRegistry) ─────────────────────────
    const registeredNamespaces = new Set(
      registeredDefinitions.map((d) => d.namespace)
    );

    // ── 3. Collect providers from SemanticRegistry (sync via globalThis cache) ─
    // The registry is auto-populated at index.ts import time.
    // We access it synchronously through globalThis — safe after first import.
    const registryRaw = (globalThis as unknown as Record<string, unknown>)["__CONNECTOR_SEMANTIC_REGISTRY__"];

    // Fallback: if registry not yet loaded (first render edge-case), defer
    if (!registryRaw) return none("registry_not_ready");

    // Cast — same class, same globalThis key
    const registry = registryRaw as {
      listAll(): readonly Array<{
        connectorId: string;
        implicitGoalType: GoalType;
        score(lower: string, norm: ReturnType<typeof normalize>): { score: number; evidences: readonly string[] };
      }>;
    };

    const allProviders = registry.listAll();

    // ── 4. Score each provider whose connector is registered in GoalRegistry ──
    const candidates: ConnectorCandidate[] = [];

    for (const provider of allProviders) {
      // Only score connectors that have GoalDefinitions registered
      if (!registeredNamespaces.has(provider.connectorId)) continue;

      const { score, evidences } = provider.score(lower, norm);

      candidates.push(Object.freeze({
        connectorId: provider.connectorId,
        goalType:    provider.implicitGoalType,
        score:       Math.round(score * 1000) / 1000,
        evidences:   Object.freeze([...evidences]),
      }));
    }

    if (candidates.length === 0) return none("no_compatible_connector");

    // ── 5. Rank by score desc — tiebreak alphabetical (never by reg. order) ──
    const ranking = [...candidates].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.connectorId.localeCompare(b.connectorId);
    });

    const winner = ranking[0];

    if (winner.score < MIN_SCORE_THRESHOLD) {
      return none(`below_threshold:${winner.connectorId}:${winner.score}`);
    }

    // ── 6. Build explanation ─────────────────────────────────────────────────
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
  (globalThis as unknown as Record<string, unknown>)[_KEY] =
    new ImplicitConnectorIntentDetectorImpl();
}

export const implicitConnectorIntentDetector: ImplicitConnectorIntentDetectorImpl = (
  globalThis as unknown as Record<string, ImplicitConnectorIntentDetectorImpl>
)[_KEY];

// ── Legacy test runner (backward compat with SprintE021Page) ──────────────────

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
    { name: "Shopee bare",        input: "Shopee",                        expectDetect: true  },
    { name: "Hostinger bare",     input: "Hostinger",                     expectDetect: true  },
    { name: "Mercado Livre bare", input: "Mercado Livre",                 expectDetect: true  },
    { name: "Pix bare",           input: "Pix",                           expectDetect: true  },
    { name: "Nota Fiscal bare",   input: "Nota Fiscal",                   expectDetect: true  },
    { name: "GitHub bare",        input: "GitHub",                        expectDetect: true  },
    { name: "Contrato bare",      input: "Contrato",                      expectDetect: true  },
    { name: "Amazon bare",        input: "Amazon",                        expectDetect: true  },
    { name: "DANFE bare",         input: "DANFE",                         expectDetect: true  },
    { name: "Boleto bare",        input: "Boleto",                        expectDetect: true  },
    { name: "Tenho email Shopee", input: "Tenho email da Shopee?",        expectDetect: true  },
    { name: "Existe email",       input: "Existe algum email da Shopee?", expectDetect: true  },
    { name: "Recebi email",       input: "Recebi algum email da Shopee?", expectDetect: true  },
    { name: "Recebi Pix",         input: "Recebi Pix?",                   expectDetect: true  },
    { name: "Recebi boleto",      input: "Recebi algum boleto?",          expectDetect: true  },
    { name: "Recebi ML",          input: "Recebi algo do Mercado Livre?", expectDetect: true  },
    { name: "Tem nota fiscal",    input: "Tem alguma nota fiscal?",       expectDetect: true  },
    { name: "Ha DANFE",           input: "Ha algum DANFE?",               expectDetect: true  },
    { name: "Ola",                input: "Ola",                           expectDetect: false },
    { name: "Bom dia",            input: "Bom dia",                       expectDetect: false },
    { name: "Obrigado",           input: "Obrigado",                      expectDetect: false },
    { name: "Tudo bem",           input: "Tudo bem",                      expectDetect: false },
    { name: "Quem e voce",        input: "Quem e voce",                   expectDetect: false },
    { name: "Conte uma piada",    input: "Conte uma piada",               expectDetect: false },
  ];

  const det = implicitConnectorIntentDetector;
  return CASES.map(({ name, input, expectDetect }) => {
    const result = det.resolve(input, registeredDefinitions);
    const passed = result.detected === expectDetect;
    return {
      name, input, expectDetect, passed,
      detected:   result.detected,
      goalType:   result.goalType,
      searchTerm: result.searchTerm,
      error: passed ? null : `Expected detected=${expectDetect}, got ${result.detected} (${result.label})`,
    };
  });
}