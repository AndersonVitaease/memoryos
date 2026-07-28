/**
 * ImplicitConnectorIntentDetector.ts — Engineering Sprint EF-6.3.x
 * Implicit Connector Intent Recognition v4 — Pure Orchestrator
 *
 * SRP: coordenar a resolucao de intencao implicita.
 *      Nunca conhece dominio. Nunca conhece connectors.
 */

import type { GoalType }       from "@/lib/goals/GoalTypes";
import type { GoalDefinition } from "@/lib/goals/GoalRegistry";
import { normalize }           from "./NaturalLanguageGoalNormalizer";
import { isModernProvider, isLegacyProvider } from "@/lib/semantic-registry/SemanticTypes";

let _registry: import("@/lib/semantic-registry/ConnectorSemanticRegistry").ConnectorSemanticRegistryClass | null = null;

async function getRegistry() {
  if (!_registry) {
    const mod = await import("@/lib/semantic-registry/index");
    _registry = mod.ConnectorSemanticRegistry;
  }
  return _registry;
}

export type ConnectorId = string;

export interface ConnectorCandidate {
  readonly connectorId: ConnectorId;
  readonly goalType:    GoalType | null;
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

const MIN_SCORE_THRESHOLD = 0.20;

type AnyProvider = Record<string, unknown>;

function scoreProvider(
  provider:  AnyProvider,
  lower:     string,
  norm:      ReturnType<typeof normalize>,
): ConnectorCandidate {
  if (isModernProvider(provider)) {
    const detection = provider.detect(lower, norm);
    return Object.freeze({
      connectorId: detection.connector,
      goalType:    detection.goalType,
      score:       detection.goalType === null
        ? Math.round(detection.confidence * 0.5 * 1000) / 1000
        : Math.round(detection.confidence * 1000) / 1000,
      evidences:   Object.freeze([...detection.evidences]),
      entities:    Object.freeze({ ...detection.entities }),
    });
  }

  if (isLegacyProvider(provider)) {
    const { score, evidences } = provider.score(lower, norm);
    return Object.freeze({
      connectorId: provider.connectorId,
      goalType:    provider.implicitGoalType,
      score:       Math.round(score * 1000) / 1000,
      evidences:   Object.freeze([...evidences]),
      entities:    Object.freeze({}),
    });
  }

  const id = (provider.connectorId as string) ?? "unknown";
  return Object.freeze({
    connectorId: id,
    goalType:    `${id}.unknown` as GoalType,
    score:       0,
    evidences:   Object.freeze(["unknown-provider-shape"]),
    entities:    Object.freeze({}),
  });
}

class ImplicitConnectorIntentDetectorImpl {
  private _totalChecked  = 0;
  private _totalDetected = 0;

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
    
    // ✅ CORREÇÃO ADICIONADA: Se for uma saudação ou frase social, NUNCA ative conector.
    if (norm.isSocialPhrase)   return none("social_phrase");
    if (!norm.entity.trim())   return none("empty_entity");
    if (trimmed.length < 4)    return none("too_short_for_connector"); // Palavras muito curtas não acionam conectores

    const lower = trimmed.toLowerCase();

    // ── 2. Registered namespaces ──────────────────────────────────────────────
    const registeredNamespaces = new Set(
      registeredDefinitions.map((d) => d.namespace)
    );

    // ── 3. Access registry ────────────────────────────────────────────────────
    const registryRaw = (globalThis as unknown as Record<string, unknown>)["__CONNECTOR_SEMANTIC_REGISTRY__"];
    if (!registryRaw) return none("registry_not_ready");

    const registry = registryRaw as {
      listAll(): readonly AnyProvider[];
    };

    const allProviders = registry.listAll();
    const candidates: ConnectorCandidate[] = [];

    for (const provider of allProviders) {
      const connId = (provider.connectorId as string) ?? "";
      if (!registeredNamespaces.has(connId)) continue;

      const candidate = scoreProvider(provider, lower, norm);
      candidates.push(candidate);
    }

    if (candidates.length === 0) return none("no_compatible_connector");

    const ranking = [...candidates].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.connectorId.localeCompare(b.connectorId);
    });

    const winner = ranking[0];

    if (winner.score < MIN_SCORE_THRESHOLD) {
      return none(`below_threshold:${winner.connectorId}:${winner.score}`);
    }

    if (winner.goalType === null) {
      return none(`null_goaltype:${winner.connectorId}`);
    }

    const params: Record<string, unknown> = {
      query: norm.entity,
      ...winner.entities,
    };

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

const _KEY = "__IMPLICIT_INTENT_DETECTOR__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] =
    new ImplicitConnectorIntentDetectorImpl();
}

export const implicitConnectorIntentDetector: ImplicitConnectorIntentDetectorImpl = (
  globalThis as unknown as Record<string, ImplicitConnectorIntentDetectorImpl>
)[_KEY];
