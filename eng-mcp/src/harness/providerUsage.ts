/**
 * GUARDIAN-COST-ROUTE-01 — provider-side usage accounting.
 *
 * Captures the usage the PROVIDER actually returned per request (the
 * Anthropic-compatible usage block carried on every SDK assistant message)
 * and prices it with the OpenRouter catalog pricing of the actual route.
 *
 * This is deliberately SEPARATE from `total_cost_usd`: that SDK field is
 * priced against Anthropic's price table regardless of the route the call
 * actually used, so for OpenRouter models it overstates real provider cost by
 * orders of magnitude (audit GUARDIAN-COST-LATENCY-01 2026-09-13: measured
 * inflation 55-137x). Nothing here changes Guardian/Supervisor/Advisor
 * behavior — capture and registration only; no decision reads these numbers.
 *
 * Cache policy: the catalog snapshots expose only input/output per-token
 * prices, so cache READ tokens are conservatively EXCLUDED from the estimate
 * (reported in usage, not priced). This can only understate, never inflate.
 */
export interface ProviderUsageSnapshot {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  /** Number of provider responses (assistant messages) accumulated. */
  requests: number;
}

/** OpenRouter catalog pricing for one route, USD per token. */
export interface ModelPricing {
  inputPerToken: number;
  outputPerToken: number;
}

/**
 * Static pricing snapshot from the saved OpenRouter catalog exports
 * (or-models-live-promotion / -lowcost / -now, identical on 2026-09-13;
 * per-token = USD-per-million / 1e6). Routes absent here yield no estimate —
 * a price is never invented.
 */
export const PROVIDER_PRICING_PER_TOKEN: Readonly<Record<string, ModelPricing>> = {
  'openai/gpt-oss-120b': { inputPerToken: 0.037e-6, outputPerToken: 0.17e-6 },
  'nvidia/nemotron-3-super-120b-a12b': { inputPerToken: 0.085e-6, outputPerToken: 0.4e-6 },
  'nvidia/nemotron-3-super-120b-a12b:free': { inputPerToken: 0, outputPerToken: 0 },
  'z-ai/glm-5.3-flash': { inputPerToken: 0.15e-6, outputPerToken: 0.5e-6 },
  'z-ai/glm-5.3': { inputPerToken: 1.4e-6, outputPerToken: 4.4e-6 },
  'nex-agi/nex-n2.5-pro:free': { inputPerToken: 0, outputPerToken: 0 },
};

export function emptyProviderUsage(): ProviderUsageSnapshot {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    requests: 0,
  };
}

/**
 * Extract the provider usage block + model id from ONE SDK assistant message
 * (Anthropic-compatible envelope: `message.message.usage`, `message.message.model`).
 * Returns an empty object when the message carries no usage block.
 */
export function readAssistantUsage(
  message: Record<string, unknown>,
): { usage?: Record<string, unknown>; model?: string } {
  const envelope = message.message;
  if (!envelope || typeof envelope !== 'object') return {};
  const env = envelope as Record<string, unknown>;
  const model =
    typeof env.model === 'string' && env.model.length > 0 ? env.model : undefined;
  const usage =
    typeof env.usage === 'object' && env.usage !== null
      ? (env.usage as Record<string, unknown>)
      : undefined;
  return usage ? { usage, model } : {};
}

/** Accumulate one provider-returned usage block into the cycle snapshot. */
export function accumulateProviderUsage(
  target: ProviderUsageSnapshot,
  usage: Record<string, unknown>,
): void {
  target.requests += 1;
  if (typeof usage.input_tokens === 'number') target.inputTokens += usage.input_tokens;
  if (typeof usage.output_tokens === 'number') target.outputTokens += usage.output_tokens;
  if (typeof usage.cache_read_input_tokens === 'number')
    target.cacheReadInputTokens += usage.cache_read_input_tokens;
  if (typeof usage.cache_creation_input_tokens === 'number')
    target.cacheCreationInputTokens += usage.cache_creation_input_tokens;
}

/**
 * Catalog-priced cost of the accumulated usage for one route (USD). Returns
 * undefined when the route has no catalog entry — never an invented price.
 */
export function estimateProviderCostUsd(
  model: string,
  usage: ProviderUsageSnapshot,
): number | undefined {
  const pricing = PROVIDER_PRICING_PER_TOKEN[model];
  if (!pricing) return undefined;
  const billableInput = usage.inputTokens + usage.cacheCreationInputTokens;
  return billableInput * pricing.inputPerToken + usage.outputTokens * pricing.outputPerToken;
}

/**
 * Per-model provider-returned usage totals (the SDK result message's
 * `modelUsage`, verbatim subset). On OpenRouter routes the per-assistant
 * usage blocks arrive ZEROED (observed live on the :free route — real totals
 * surface only in the final result), so this is the reliable provider-side
 * capture; each entry is priced with the catalog of its OWN model key.
 */
export type ProviderModelUsage = Record<string, ProviderUsageSnapshot>;

export function readResultModelUsage(
  message: Record<string, unknown>,
): ProviderModelUsage | undefined {
  const raw = message.modelUsage;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: ProviderModelUsage = {};
  for (const [model, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    out[model] = {
      inputTokens: typeof e.inputTokens === 'number' ? e.inputTokens : 0,
      outputTokens: typeof e.outputTokens === 'number' ? e.outputTokens : 0,
      cacheReadInputTokens:
        typeof e.cacheReadInputTokens === 'number' ? e.cacheReadInputTokens : 0,
      cacheCreationInputTokens:
        typeof e.cacheCreationInputTokens === 'number' ? e.cacheCreationInputTokens : 0,
      requests: 1, // one aggregated provider report per model
    };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Catalog-priced cost of per-model provider-returned totals (USD). Undefined
 * when empty OR when ANY observed model lacks a catalog entry — a price is
 * never invented and a partial estimate never masquerades as the total.
 */
export function estimateModelUsageCostUsd(
  modelUsage: ProviderModelUsage,
): number | undefined {
  const entries = Object.entries(modelUsage);
  if (entries.length === 0) return undefined;
  let total = 0;
  for (const [model, usage] of entries) {
    const cost = estimateProviderCostUsd(model, usage);
    if (cost === undefined) return undefined;
    total += cost;
  }
  return total;
}
