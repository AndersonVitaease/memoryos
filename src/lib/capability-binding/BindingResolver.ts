/**
 * BindingResolver.ts — Sprint EF-49 · Capability Binding Engine
 *
 * SRP: resolver qual provider concreto satisfaz cada CapabilityNode.
 *
 * Algoritmo:
 *   1. Obter todos providers que suportam a capability (via ProviderRegistry)
 *   2. Ordenar por prioridade (1 = melhor)
 *   3. Primary   = providers[0]
 *   4. Secondary = providers[1] (fallback)
 *   5. Emergency = providers[2] ou local_runtime (fallback final)
 *
 * NÃO chama APIs. NÃO executa conectores. NÃO cria planos.
 * Apenas produz ProviderBinding para cada CapabilityNode.
 *
 * Imutável — sem side effects.
 */

import type { CapabilityNode }           from "@/lib/capability-reasoning/CapabilityGraph";
import { getProvidersForCapability, getProvider } from "./ProviderRegistry";
import type { ProviderBinding, FallbackProvider } from "./BoundCapabilityGraph";
import { makeCOId }                               from "@/lib/cognitive-orchestrator/COTypes";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBindingId(): string { return makeCOId("bind"); }

function toFallback(entry: ReturnType<typeof getProvider>, priority: number, reason: string): FallbackProvider | null {
  if (!entry) return null;
  return Object.freeze({
    providerId:           entry.id,
    providerName:         entry.name,
    providerType:         entry.type,
    estimatedLatencyMs:   entry.estimatedLatencyMs,
    estimatedCostScore:   entry.estimatedCostScore,
    estimatedReliability: entry.estimatedReliability,
    priority,
    reason,
  });
}

// ── Main resolver ─────────────────────────────────────────────────────────────

export function resolveBinding(node: CapabilityNode): ProviderBinding {
  const providers = getProvidersForCapability(node.capabilityName);

  // Unresolved — no provider found
  if (providers.length === 0) {
    return Object.freeze({
      capabilityId:         node.capabilityId,
      capabilityName:       node.capabilityName,
      providerId:           "unresolved",
      providerName:         "No provider available",
      providerType:         "local" as const,
      implementationId:     "unresolved",
      confidence:           0,
      estimatedLatencyMs:   0,
      estimatedCostScore:   0,
      estimatedReliability: 0,
      authRequired:         false,
      rateLimit:            "n/a",
      priority:             99,
      fallbackProviders:    Object.freeze([]),
      status:               "unresolved" as const,
    });
  }

  const primary   = providers[0];
  const secondary = providers[1];
  const emergency = providers[2] ?? getProvider("local_runtime");

  // Build fallbacks list (secondary + emergency, deduped)
  const fallbacks: FallbackProvider[] = [];
  if (secondary) {
    const fb = toFallback(secondary, 2, "Primary unavailable or rate-limited");
    if (fb) fallbacks.push(fb);
  }
  if (emergency && emergency.id !== primary.id && emergency.id !== secondary?.id) {
    const fb = toFallback(emergency, 3, "Secondary also unavailable — emergency fallback");
    if (fb) fallbacks.push(fb);
  }

  // Confidence: high if primary reliability > 90, medium otherwise
  const confidence = primary.estimatedReliability >= 90 ? 0.95
    : primary.estimatedReliability >= 80 ? 0.80 : 0.65;

  const implId = `${primary.implementationPrefix}.${node.capabilityName.toLowerCase()}`;

  return Object.freeze({
    capabilityId:         node.capabilityId,
    capabilityName:       node.capabilityName,
    providerId:           primary.id,
    providerName:         primary.name,
    providerType:         primary.type,
    implementationId:     implId,
    confidence,
    estimatedLatencyMs:   primary.estimatedLatencyMs,
    estimatedCostScore:   primary.estimatedCostScore,
    estimatedReliability: primary.estimatedReliability,
    authRequired:         primary.authRequired,
    rateLimit:            primary.rateLimit,
    priority:             primary.priority,
    fallbackProviders:    Object.freeze(fallbacks),
    status:               "resolved" as const,
  });
}

/** Resolve bindings for all nodes in order */
export function resolveAllBindings(nodes: readonly CapabilityNode[]): ProviderBinding[] {
  return nodes.map(resolveBinding);
}