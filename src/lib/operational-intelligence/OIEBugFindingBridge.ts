/**
 * OIEBugFindingBridge.ts — Ponte OIE -> BugFinding
 *
 * Responsabilidade unica: converter Explanation do OIE (severity critical/
 * warning) em registros BugFinding persistentes, para que as observacoes
 * INTERNAS do motor (falhas silenciosas, regressoes, degradacao preditiva)
 * cheguem ao mesmo BugInsightsChat que ja recebe os bugs EXTERNOS do
 * Playwright Bug Hunter. Unifica as duas fontes de observacao num unico
 * canal de triagem.
 *
 * PRINCIPIOS (alinhados ao OIE):
 *  - Fire-and-forget: nunca rejeita, nunca bloqueia o orchestrator.
 *  - Consultivo: so REGISTRA o finding. Nunca corrige, nunca age.
 *  - Dedup por signature (findingType + executionId) com TTL de 5min em
 *    memoria para evitar flooding quando o orchestrator roda por execucao.
 *  - Mapeia findingType -> categoria BugFinding + severidade BugFinding.
 *
 * HOOK POINT: OIEOrchestrator.orchestrate() apos publicar alertas no bus.
 */

import { base44 } from "@/api/base44Client";
import type { Explanation, Severity } from "./Explainer";

// ── Mapeamento findingType -> categoria BugFinding ───────────────────────────

const CATEGORY_MAP: Record<string, string> = {
  // CoverageAnalyzer (Fase 3)
  NoConnectorExecution: "broken_flow",
  PartialRepositoryTraversal: "functional",
  AllExecutionsFailed: "error",
  PartialSuccess: "broken_flow",
  CoverageGap: "functional",
  // DecisionAnalyzer (Fase 2.5)
  SameIntentMultipleGoals: "functional",
  // RegressionAnalyzer (Fase 4)
  new_error_signature: "error",
  new_behavior_signature: "functional",
  failure_rate_increase: "error",
  // AnomalyPredictor (Sprint 11)
  failure_rate_rising: "performance",
  failure_rate_projected_breach: "error",
  connector_degradation: "performance",
  error_signature_accelerating: "error",
};

// ── Dedup em memoria (TTL 5min) ───────────────────────────────────────────────

const DEDUP_TTL_MS = 5 * 60 * 1000;
const _recent = new Map<string, number>();

function _isRecent(sig: string): boolean {
  const now = Date.now();
  const ts = _recent.get(sig);
  if (ts && now - ts < DEDUP_TTL_MS) return true;
  _recent.set(sig, now);
  // Limpa entradas expiradas a cada chamada (barato, Map pequeno).
  if (_recent.size > 200) {
    for (const [k, t] of _recent) {
      if (now - t >= DEDUP_TTL_MS) _recent.delete(k);
    }
  }
  return false;
}

// ── Mapeamento severidade OIE -> severidade BugFinding ────────────────────────

function toBugSeverity(sev: Severity): string {
  if (sev === "critical") return "high";
  if (sev === "warning") return "medium";
  return "low";
}

// ── OIEBugFindingBridge ────────────────────────────────────────────────────────

export const OIEBugFindingBridge = {
  /**
   * Converte explanations critical/warning em BugFindings persistentes.
   * Fire-and-forget: caller NUNCA aguarda nem trata erro daqui.
   *
   * @param explanations  findings do orchestrator (ja filtramos so critical/warning)
   * @param sessionId     sessao de origem
   * @param executionId   executionId da execucao que disparou a orchestracao (opcional)
   */
  async publish(
    explanations: readonly Explanation[],
    sessionId: string,
    executionId?: string,
  ): Promise<number> {
    let created = 0;
    for (const expl of explanations) {
      // so critical/warning viram BugFinding (info e ruido neste canal)
      if (expl.severity === "info") continue;

      const sig = `${expl.findingType}:${executionId ?? sessionId}`;
      if (_isRecent(sig)) continue;

      const category = CATEGORY_MAP[expl.findingType] ?? "other";
      const runId = `oie_${expl.findingType}_${executionId ?? sessionId}`;
      const title = `[OIE] ${expl.title}`;
      const description = expl.causalChain.join(" ");
      const steps = JSON.stringify({
        source: "OIE",
        findingType: expl.findingType,
        severity: expl.severity,
        sessionId,
        executionId: executionId ?? null,
        causalChain: expl.causalChain,
        evidenceRefs: expl.evidenceRefs,
      }, null, 2);

      try {
        await base44.entities.BugFinding.create({
          run_id: runId,
          target_url: "internal://memoryos/pipeline",
          title,
          description,
          severity: toBugSeverity(expl.severity),
          category,
          steps_to_reproduce: steps,
          expected: "Comportamento deterministico e conforme a arquitetura esperada.",
          actual: expl.recommendation,
          console_errors: expl.evidenceRefs.join("\n"),
          status: "open",
        });
        created++;
      } catch {
        // shadow: falha ao persistir um finding nunca quebra o orchestrator
      }
    }
    return created;
  },
};