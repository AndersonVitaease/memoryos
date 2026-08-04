/**
 * TravelInvestigator.ts — EI-07 (RFC-008 / ADR-015)
 *
 * Investigator de dominio para emissao de passagem aerea (Travellink). Deterministico
 * (EI-07): valida campos obrigatorios, normaliza data (DD/MM/YYYY → YYYY-MM-DD) e
 * preenche defaults (passengerType=adulto). Nao chama LLM nem Travellink API aqui —
 * o hook cost/paramPatches fica pronto para enriquecimento real pos-migracao.
 *
 * Aplica-se a capabilities de voo/passagem (connector "travellink" ou capability
 * contendo air/flight/ticket/passagem/voo). Hoje dorme (nao ha connector Travellink
 * registrado) — ativa quando um connector Travellink existir.
 *
 * Puro, stateless, sync. Invariant ADR-015: so produz findings/enriquecimento.
 */

import type { ExecutionGap, ExecutionRequest } from "../ExecutionTypes";
import type { InvestigationFinding, Investigator } from "./InvestigatorTypes";

const REQUIRED = ["passenger", "document", "origin", "destination", "date"] as const;

export class TravelInvestigator implements Investigator {
  readonly id = "travel.airTicket";
  readonly description = "Valida e enriquece emissao de passagem aerea (Travellink).";
  readonly provides = ["date", "passengerType"] as const;
  readonly requires = [] as const;

  appliesTo(request: ExecutionRequest): boolean {
    if (request.connectorId === "travellink") return true;
    const c = request.capability.toLowerCase();
    return /air|flight|ticket|passagem|voo/.test(c);
  }

  investigate(request: ExecutionRequest): InvestigationFinding {
    const params = request.params;
    const gaps: ExecutionGap[] = [];
    const patches: Record<string, unknown> = {};

    for (const field of REQUIRED) {
      const v = params[field];
      if (v === null || v === undefined || v === "") {
        gaps.push({ field, reason: `Campo obrigatorio "${field}" para emissao de passagem ausente.` });
      }
    }

    // Normaliza date DD/MM/YYYY -> YYYY-MM-DD (formato que a Travellink aceita).
    const date = params["date"];
    if (typeof date === "string") {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
      if (m) patches["date"] = `${m[3]}-${m[2]}-${m[1]}`;
    }

    // Default passengerType=adulto quando ausente.
    if (params["passengerType"] === undefined || params["passengerType"] === "") {
      patches["passengerType"] = "adulto";
    }

    return { gaps, risks: [], paramPatches: Object.keys(patches).length > 0 ? patches : undefined };
  }
}