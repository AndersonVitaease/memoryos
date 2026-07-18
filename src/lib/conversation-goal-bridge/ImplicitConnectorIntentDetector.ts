/**
 * ImplicitConnectorIntentDetector.ts — Engineering Sprint EF-6.3.x
 * Implicit Connector Intent Recognition v4 — Pure Orchestrator
 *
 * SRP: coordenar a resolucao de intencao implicita.
 *      Nunca conhece dominio. Nunca conhece connectors.
 *
 * EF-6.3.x: suporte ao novo contrato SemanticProvider.detect() que retorna
 * SemanticDetection com goalType especifico determinado internamente.
 * Retrocompatibilidade total com providers legados (score + implicitGoalType).
 *
 * Open/Closed:
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
 * Responsabilidades:
 *   1. Normalizar a mensagem
 *   2. Consultar ConnectorSemanticRegistry
 *   3. Solicitar deteccao a cada SemanticProvider (detect OU score)
 *   4. Rankear candidatos por confidence
 *   5. Escolher winner
 *   6. Retornar ImplicitIntentResult
 */

import type { GoalType }       from "@/lib/goals/GoalTypes";
import type { GoalDefinition } from "@/lib/goals/GoalRegistry";
import { normalize }           from "./NaturalLanguageGoalNormalizer";
import { isModernProvider, isLegacyProvider } from "@/lib/semantic-registry/SemanticTypes";

// ── Lazy import to avoid circular-dep at module init ──────────────────────────
let _registry: import("@/lib/semantic-registry/ConnectorSemanticRegistry").ConnectorSemanticRegistryClass | null = null;

async function getRegistry() {
  if (!_registry) {
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
  readonly entities:    Readonly<Record<string, unknown>>;
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

// ── Unified adapter: modern (detect) OR legacy (score) provider ───────────────

type AnyProvider = Record<string, unknown>;

function scoreProvider(
  provider:  AnyProvider,
  lower:     string,
  norm:      ReturnType<typeof normalize>,
): ConnectorCandidate {
  if (isModernProvider(provider)) {
    // EF-6.3.x v2: goalType may be null (domain detected, intent unknown)
    const detection = provider.detect(lower, norm);
    // When goalType is null, fall back to a safe domain-level goal
    // so the detector can still signal domain confidence correctly.
    // The Bridge will handle null goalType via GoalRegistry fallback.
    const resolvedGoalType = detection.goalType
      ?? (`${detection.connector}.searchFiles` as import("@/lib/goals/GoalTypes").GoalType);
    return Object.freeze({
      connectorId: detection.connector,
      goalType:    resolvedGoalType,
      score:       detection.goalType === null
        // penalize null-intent: halve confidence so GoalRegistry signals win
        ? Math.round(detection.confidence * 0.5 * 1000) / 1000
        : Math.round(detection.confidence * 1000) / 1000,
      evidences:   Object.freeze([...detection.evidences]),
      entities:    Object.freeze({ ...detection.entities }),
    });
  }

  if (isLegacyProvider(provider)) {
    // Sprint 9.2.2: legacy contract — score() + fixed implicitGoalType
    const { score, evidences } = provider.score(lower, norm);
    return Object.freeze({
      connectorId: provider.connectorId,
      goalType:    provider.implicitGoalType,
      score:       Math.round(score * 1000) / 1000,
      evidences:   Object.freeze([...evidences]),
      entities:    Object.freeze({}),
    });
  }

  // Unknown provider shape — return zero score
  const id = (provider.connectorId as string) ?? "unknown";
  return Object.freeze({
    connectorId: id,
    goalType:    `${id}.unknown` as GoalType,
    score:       0,
    evidences:   Object.freeze(["unknown-provider-shape"]),
    entities:    Object.freeze({}),
  });
}

// ── ImplicitConnectorIntentDetectorImpl ───────────────────────────────────────

class ImplicitConnectorIntentDetectorImpl {
  private _totalChecked  = 0;
  private _totalDetected = 0;

  /**
   * Resolve intencao implicita de connector para uma mensagem.
   *
   * Consulta o ConnectorSemanticRegistry, delega a deteccao a cada provider
   * (moderno ou legado), e elege o winner por maior score/confidence.
   *
   * A ordem de registro dos providers nao influencia o resultado.
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

    // ── 1. Normalize ──────────────────────────────────────────────────────────
    const norm = normalize(trimmed);
    if (norm.isSocialPhrase)   return none("social_phrase");
    if (!norm.entity.trim())   return none("empty_entity");

    const lower = trimmed.toLowerCase();

    // ── 2. Registered namespaces (from GoalRegistry) ──────────────────────────
    const registeredNamespaces = new Set(
      registeredDefinitions.map((d) => d.namespace)
    );

    // ── 3. Access registry synchronously via globalThis ───────────────────────
    const registryRaw = (globalThis as unknown as Record<string, unknown>)["__CONNECTOR_SEMANTIC_REGISTRY__"];
    if (!registryRaw) return none("registry_not_ready");

    const registry = registryRaw as {
      listAll(): readonly AnyProvider[];
    };

    const allProviders = registry.listAll();

    // ── 4. Score / detect each provider ───────────────────────────────────────
    const candidates: ConnectorCandidate[] = [];

    for (const provider of allProviders) {
      const connId = (provider.connectorId as string) ?? "";
      // Only score connectors that have GoalDefinitions registered
      if (!registeredNamespaces.has(connId)) continue;

      const candidate = scoreProvider(provider, lower, norm);
      candidates.push(candidate);
    }

    if (candidates.length === 0) return none("no_compatible_connector");

    // ── 5. Rank by score desc — tiebreak alphabetical ─────────────────────────
    const ranking = [...candidates].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.connectorId.localeCompare(b.connectorId);
    });

    const winner = ranking[0];

    if (winner.score < MIN_SCORE_THRESHOLD) {
      return none(`below_threshold:${winner.connectorId}:${winner.score}`);
    }

    // ── 6. Build parameters — prefer provider entities, fallback to norm.entity ─
    const params: Record<string, unknown> = {
      query: norm.entity,
      ...winner.entities,
    };

    // ── 7. Build explanation ──────────────────────────────────────────────────
    const explanation: string[] = [
      `Winner: ${winner.connectorId} / ${winner.goalType} (score=${winner.score})`,
      `Evidences: ${winner.evidences.join(", ") || "none"}`,
      `Ranking: ${ranking.map((c) => `${c.connectorId}:${c.goalType}=${c.score}`).join(" > ")}`,
      `Entity: "${norm.entity}"`,
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
      parameters: Object.freeze(params),
      confidence: winner.score,
      label:      `evidence:${winner.connectorId}:${winner.goalType}:score=${winner.score}`,
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