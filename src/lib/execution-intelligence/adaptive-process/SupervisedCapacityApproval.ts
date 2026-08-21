/**
 * SupervisedCapacityApproval.ts — V1
 *
 * Helper thin que fecha o ciclo supervisionado:
 *
 *   RECOMMENDATION  →  HUMAN APPROVAL  →  TOOL_POLICY
 *
 * Reutiliza EXCLUSIVAMENTE a infraestrutura de confirmacao existente
 * (RuntimeConfirmationEngine + ConfirmationProvider poll bridge). NAO cria
 * sistema de aprovacao novo.
 *
 * Invariantes absolutos:
 *   - SupervisedCapacityProcess (benchmark + recomendacao) permanece READ-ONLY
 *     em relacao a policy de producao. Nunca chama este helper.
 *   - A escrita somente ocorre atraves de applyRecommendationWithApproval(),
 *     que exige confirmacao explicita entre recommendation e update.
 *   - INDETERMINATE nunca e aplicado (aplicacao proibida).
 *   - A policy e relida no momento da escrita (nao usa snapshot antigo) —
 *     preserva outras tools mesmo se mudaram entre recomendacao e aprovacao.
 *   - Idempotente: se toolName.maxConcurrent ja = recomendado, nao escreve.
 *   - Merge apenas da tool recomendada; outras entradas preservadas.
 *   - CapacityReportAnalyzer NUNCA escreve policy. Este helper e o unico writer.
 */
import { requestConfirmation } from "@/lib/runtime/RuntimeConfirmationEngine";
import type { Recommendation } from "./SupervisedCapacityProcess";
import { base44 } from "@/api/base44Client";

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface ApplyRecommendationInput {
  readonly recommendation: Recommendation;
  readonly server: string;
  readonly toolName: string;
  readonly evidence?: unknown;
}

export interface ApplyResult {
  readonly server: string;
  readonly toolName: string;
  readonly previousMaxConcurrent: number | null;
  readonly newMaxConcurrent: number | null;
  readonly approved: boolean;
  readonly applied: boolean;
  readonly alreadyApplied: boolean;
  readonly reason: string;
}

export interface ConfirmationPrompt {
  readonly capability: string;
  readonly title: string;
  readonly description: string;
  readonly payload: unknown;
}

export interface ConfirmationResult {
  readonly confirmed: boolean;
  readonly cancelled: boolean;
  readonly expired: boolean;
}

export type ConfirmFn = (prompt: ConfirmationPrompt) => Promise<ConfirmationResult>;

type PolicyMap = Record<string, { maxConcurrent?: number }>;

export interface ToolPolicyStore {
  load(server: string): Promise<{ id: string; toolPolicy: PolicyMap } | null>;
  save(id: string, toolPolicy: PolicyMap): Promise<void>;
}

// ── Parse / merge (puro, sem side effects, totalmente testavel) ──────────────

function parsePolicy(raw: unknown): PolicyMap {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      return p && typeof p === "object" && !Array.isArray(p) ? (p as PolicyMap) : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as PolicyMap;
  return {};
}

/**
 * Merge deterministico: adiciona/atualiza APENAS toolName, preservando todas
 * as outras entradas. Retorna whether a write is needed (changed/alreadyApplied).
 */
export function mergeToolPolicy(
  current: PolicyMap,
  toolName: string,
  maxConcurrent: number,
): {
  newPolicy: PolicyMap;
  changed: boolean;
  previousMaxConcurrent: number | null;
  alreadyApplied: boolean;
} {
  const prev = current[toolName]?.maxConcurrent ?? null;
  const alreadyApplied = prev === maxConcurrent;
  if (alreadyApplied) {
    return { newPolicy: { ...current }, changed: false, previousMaxConcurrent: prev, alreadyApplied: true };
  }
  return {
    newPolicy: { ...current, [toolName]: { maxConcurrent } },
    changed: true,
    previousMaxConcurrent: prev,
    alreadyApplied: false,
  };
}

// ── Store default: base44 MCPServerConfig real ───────────────────────────────

const defaultStore: ToolPolicyStore = {
  async load(server: string) {
    const matches = await base44.entities.MCPServerConfig.filter({ name: server });
    const c = matches[0] as { id: string; tool_policy?: unknown } | undefined;
    if (!c) return null;
    return { id: c.id, toolPolicy: parsePolicy(c.tool_policy) };
  },
  async save(id: string, toolPolicy: PolicyMap) {
    await base44.entities.MCPServerConfig.update(id, { tool_policy: JSON.stringify(toolPolicy) });
  },
};

// ── Confirm default: RuntimeConfirmationEngine (surfaces via ConfirmationProvider poll) ──

async function defaultConfirmFn(prompt: ConfirmationPrompt): Promise<ConfirmationResult> {
  return requestConfirmation(prompt) as unknown as Promise<ConfirmationResult>;
}

// ── Aplicacao pura (assume ja aprovado): relid + merge + persist + idempotencia ──

export async function applyRecommendation(
  input: ApplyRecommendationInput,
  recommended: number,
  store: ToolPolicyStore = defaultStore,
): Promise<ApplyResult> {
  const { server, toolName } = input;

  // 1. reler MCPServerConfig MAIS RECENTE (nao snapshot antigo)
  const loaded = await store.load(server);
  if (!loaded) {
    return {
      server, toolName,
      previousMaxConcurrent: null, newMaxConcurrent: null,
      approved: true, applied: false, alreadyApplied: false,
      reason: `MCPServerConfig not found for server "${server}"`,
    };
  }

  // 2. merge APENAS da tool recomendada
  const { newPolicy, changed, previousMaxConcurrent, alreadyApplied } = mergeToolPolicy(
    loaded.toolPolicy, toolName, recommended,
  );

  // 3. idempotencia — ja aplicado, nenhuma escrita desnecessaria
  if (!changed) {
    return {
      server, toolName,
      previousMaxConcurrent, newMaxConcurrent: recommended,
      approved: true, applied: true, alreadyApplied: true,
      reason: "policy already applied — no write needed",
    };
  }

  // 4. persistir merge sobre o estado MAIS RECENTE
  await store.save(loaded.id, newPolicy);
  return {
    server, toolName,
    previousMaxConcurrent, newMaxConcurrent: recommended,
    approved: true, applied: true, alreadyApplied: false,
    reason: "policy applied",
  };
}

// ── Aplicacao supervisionada: INDETERMINATE gate + approval + apply ───────────

export async function applyRecommendationWithApproval(
  input: ApplyRecommendationInput,
  opts: { confirmFn?: ConfirmFn; store?: ToolPolicyStore } = {},
): Promise<ApplyResult> {
  const { recommendation, server, toolName } = input;

  // INDETERMINATE → aplicacao PROIBIDA. Sem fallback, sem numero.
  if (recommendation.status !== "RECOMMENDED" || recommendation.maxConcurrent == null) {
    return {
      server, toolName,
      previousMaxConcurrent: null, newMaxConcurrent: null,
      approved: false, applied: false, alreadyApplied: false,
      reason: "INDETERMINATE — application forbidden",
    };
  }

  const recommended = recommendation.maxConcurrent;

  // Aprovação explicita — reutiliza RuntimeConfirmationEngine.
  // A ConfirmationProvider faz poll e exibe o dialog automaticamente.
  const confirmFn = opts.confirmFn ?? defaultConfirmFn;
  const confirmation = await confirmFn({
    capability: `capacityPolicy.${server}.${toolName}`,
    title: `Aplicar maxConcurrent=${recommended}`,
    description: `Aplicar maxConcurrent=${recommended} para ${server} / ${toolName}?\n\nMotivo: ${recommendation.reason}`,
    payload: { server, toolName, recommendedMaxConcurrent: recommended, evidence: input.evidence },
  });

  if (!confirmation.confirmed) {
    return {
      server, toolName,
      previousMaxConcurrent: null, newMaxConcurrent: null,
      approved: false, applied: false, alreadyApplied: false,
      reason: confirmation.cancelled ? "cancelled by user" : "confirmation expired",
    };
  }

  // Aprovado → relid (estado mais recente) + merge + persist.
  return applyRecommendation(input, recommended, opts.store ?? defaultStore);
}