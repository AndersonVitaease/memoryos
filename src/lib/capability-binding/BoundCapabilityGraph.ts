/**
 * BoundCapabilityGraph.ts — Sprint EF-49 · Capability Binding Engine
 *
 * SRP: tipos imutáveis que representam um grafo de capacidades com
 *      providers concretos resolvidos para cada nó.
 *
 * NÃO contém lógica de binding nem de seleção de providers.
 * Apenas o modelo de dados e helpers.
 */

import { makeCOId } from "@/lib/cognitive-orchestrator/COTypes";
import type { CapabilityGraph, CapabilityNode } from "@/lib/capability-reasoning/CapabilityGraph";

// ── Provider types ─────────────────────────────────────────────────────────────

export type ProviderType =
  | "connector"   // external service connector (GitHub, Drive, Gmail…)
  | "llm"         // large language model provider
  | "local"       // local computation, no external call
  | "cache"       // cached data layer
  | "hybrid";     // combination of local + external

export type BindingStatus = "resolved" | "partial" | "unresolved";

// ── A single provider binding ─────────────────────────────────────────────────

export interface ProviderBinding {
  readonly capabilityId:         string;
  readonly capabilityName:       string;
  readonly providerId:           string;   // e.g. "github_connector"
  readonly providerName:         string;   // e.g. "GitHub Connector"
  readonly providerType:         ProviderType;
  readonly implementationId:     string;   // specific impl e.g. "github.repos.list"
  readonly confidence:           number;   // 0–1
  readonly estimatedLatencyMs:   number;
  readonly estimatedCostScore:   number;   // 0–10
  readonly estimatedReliability: number;   // 0–100
  readonly authRequired:         boolean;
  readonly rateLimit:            string;   // e.g. "5000/hr"
  readonly priority:             number;   // 1 = highest
  readonly fallbackProviders:    readonly FallbackProvider[];
  readonly status:               BindingStatus;
}

export interface FallbackProvider {
  readonly providerId:           string;
  readonly providerName:         string;
  readonly providerType:         ProviderType;
  readonly estimatedLatencyMs:   number;
  readonly estimatedCostScore:   number;
  readonly estimatedReliability: number;
  readonly priority:             number;   // 2, 3… (higher = lower priority)
  readonly reason:               string;   // why this is a fallback
}

// ── Bound capability graph ────────────────────────────────────────────────────

export interface BoundCapabilityGraph {
  readonly boundGraphId:       string;
  readonly sourceGraphId:      string;   // original CapabilityGraph.graphId
  readonly goalId:             string;
  readonly bindings:           readonly ProviderBinding[];
  readonly resolvedCount:      number;
  readonly partialCount:       number;
  readonly unresolvedCount:    number;
  readonly totalEstimatedCost: number;
  readonly avgReliability:     number;
  readonly avgLatencyMs:       number;
  readonly uniqueProviders:    readonly string[];
  readonly bindingStatus:      BindingStatus;   // overall graph status
  readonly durationMs:         number;
  readonly createdAt:          string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function makeBoundGraphId(): string { return makeCOId("bgraph"); }

export function buildBoundCapabilityGraph(
  sourceGraph: CapabilityGraph,
  bindings:    ProviderBinding[],
  durationMs:  number,
): BoundCapabilityGraph {
  const resolved   = bindings.filter(b => b.status === "resolved").length;
  const partial    = bindings.filter(b => b.status === "partial").length;
  const unresolved = bindings.filter(b => b.status === "unresolved").length;

  const totalCost = bindings.reduce((a, b) => a + b.estimatedCostScore, 0);
  const avgRel    = bindings.length
    ? Math.round(bindings.reduce((a, b) => a + b.estimatedReliability, 0) / bindings.length)
    : 0;
  const avgLat    = bindings.length
    ? Math.round(bindings.reduce((a, b) => a + b.estimatedLatencyMs, 0) / bindings.length)
    : 0;

  const uniqueProviders = [...new Set(bindings.map(b => b.providerName))];

  const overallStatus: BindingStatus =
    unresolved > 0 ? "partial"
    : partial > 0  ? "partial"
    : "resolved";

  return Object.freeze({
    boundGraphId:       makeBoundGraphId(),
    sourceGraphId:      sourceGraph.graphId,
    goalId:             sourceGraph.goalId,
    bindings:           Object.freeze(bindings),
    resolvedCount:      resolved,
    partialCount:       partial,
    unresolvedCount:    unresolved,
    totalEstimatedCost: totalCost,
    avgReliability:     avgRel,
    avgLatencyMs:       avgLat,
    uniqueProviders:    Object.freeze(uniqueProviders),
    bindingStatus:      overallStatus,
    durationMs,
    createdAt:          new Date().toISOString(),
  });
}