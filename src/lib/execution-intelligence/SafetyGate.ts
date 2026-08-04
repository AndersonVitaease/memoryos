/**
 * SafetyGate.ts — EI-03 (RFC-008 / ADR-015)
 *
 * Camada que freia a execucao de capabilities irreversiveis.
 *
 * Regra (EI-03):
 *   - safe / reversible            → approved (pass-through, despacha).
 *   - irreversible + confirmedByUser=true → approved.
 *   - irreversible sem confirmacao → needs_confirmation (pede confirmacao ao
 *     usuario; NAO despacha). Retorna um resumo generico da acao.
 *
 * Nao ha "blocked" hardcoded ainda — polices obrigatorias (hard policies)
 * vêm com o PolicyRegistry futuro. Hoje o Safety Gate so freia por reversibility.
 *
 * Componente puro: stateless, sem dependencias. Recebe a request + a
 * reversibility (lida pelo Runtime do metadata do connector) e devolve a
 * decisao. Investigadores de dominio (resumos ricos por capability) vêm em
 * EI-07; hoje o resumo e generico (capability + preview de params).
 *
 * Invariant ADR-015: o SafetyGate NUNCA despacha — so decide. O dispatch
 * continua interno e exclusivo do Runtime.processCapability().
 */

import type { Reversibility } from "@/lib/connector-runtime/ConnectorTypes";
import type { PreparedExecution, SafetyDecision } from "./ExecutionTypes";

export class SafetyGate {
  /**
   * Decide se a capability pode ser despachada.
   * @param prepared   O PreparedExecution (da ExecutionIntelligence — EI-05).
   * @param reversibility Classificacao da capability (lida do metadata).
   * @returns SafetyDecision — approved | needs_confirmation | blocked.
   */
  guard(prepared: PreparedExecution, reversibility: Reversibility): SafetyDecision {
    // safe / reversible sempre passam.
    if (reversibility === "safe" || reversibility === "reversible") {
      return { type: "approved" };
    }

    // irreversible: exige confirmacao explicita do usuario.
    if (prepared.request.confirmedByUser === true) {
      return { type: "approved" };
    }

    return {
      type: "needs_confirmation",
      reason: `A capability "${prepared.request.capability}" e irreversivel e requer confirmacao antes de executar.`,
      summary: this._summarize(prepared),
    };
  }

  /**
   * Resumo generico da acao irreversivel (EI-07 trara investigadores de
   * dominio que produzem resumos ricos por capability — ex: TravelInvestigator,
   * EmailInvestigator). Hoje: connector.capability + preview dos params.
   */
  private _summarize(prepared: PreparedExecution): string {
    const { connectorId, capability } = prepared.request;
    const params = prepared.enrichedParams;
    const keys = Object.keys(params);
    let base: string;
    if (keys.length === 0) {
      base = `Executar ${connectorId}.${capability}.`;
    } else {
      const preview = keys.slice(0, 5).map((k) => `${k}=${this._previewValue(params[k])}`).join(", ");
      const extra = keys.length > 5 ? `, +${keys.length - 5} campo(s)` : "";
      base = `Executar ${connectorId}.${capability} com: ${preview}${extra}.`;
    }
    // EI-06: anexa gaps detectados pelos investigators (se houver).
    if (prepared.gaps.length > 0) {
      const lista = prepared.gaps.map((g) => `- ${g.field}: ${g.reason}`).join("\n");
      return `${base}\n\nCampos pendentes:\n${lista}`;
    }
    return base;
  }

  private _previewValue(v: unknown): string {
    if (v === null || v === undefined) return "—";
    if (typeof v === "string") return v.length > 60 ? `"${v.slice(0, 57)}..."` : `"${v}"`;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return "[objeto]";
  }
}