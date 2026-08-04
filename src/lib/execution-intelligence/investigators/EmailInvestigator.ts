/**
 * EmailInvestigator.ts — EI-07 (RFC-008 / ADR-015)
 *
 * Investigator de dominio para envio de email. Deterministico (EI-07): valida
 * to/subject/body, detecta destinatario sem endereco valido (nome sem "@") e
 * normaliza (trim de subject, trim de to). Nao resolve nomes em enderecos aqui
 * — isso exigiria chamada ao connector de contatos (pos-migracao); reporta como
 * gap + risk.
 *
 * Aplica-se a capabilities de envio de email (sendEmail / mail.send / email.send).
 *
 * Puro, stateless, sync. Invariant ADR-015: so produz findings/enriquecimento.
 */

import type { ExecutionGap, ExecutionRequest } from "../ExecutionTypes";
import type { InvestigationFinding, Investigator } from "./InvestigatorTypes";

const REQUIRED = ["to", "subject", "body"] as const;

export class EmailInvestigator implements Investigator {
  readonly id = "email.send";
  readonly description = "Valida e enriquece envio de email (Gmail/Microsoft).";
  readonly provides = ["to", "subject"] as const;
  readonly requires = [] as const;

  appliesTo(request: ExecutionRequest): boolean {
    const c = request.capability.toLowerCase();
    return c === "sendemail" || c === "mail.send" || c === "email.send";
  }

  investigate(request: ExecutionRequest): InvestigationFinding {
    const params = request.params;
    const gaps: ExecutionGap[] = [];
    const risks: string[] = [];
    const patches: Record<string, unknown> = {};

    for (const field of REQUIRED) {
      const v = params[field];
      if (v === null || v === undefined || v === "") {
        gaps.push({ field, reason: `Campo obrigatorio "${field}" para envio de email ausente.` });
      }
    }

    // to: se presente mas nao contem "@", reporta gap + risk (nome sem endereco).
    const to = params["to"];
    if (typeof to === "string" && to !== "") {
      const trimmed = to.trim();
      if (trimmed !== to) patches["to"] = trimmed;
      if (!trimmed.includes("@")) {
        gaps.push({ field: "to", reason: `"to" nao parece um endereco de email valido (sem "@").` });
        risks.push(`Destinatario "${trimmed}" sem endereco de email — pode exigir resolucao via contatos.`);
      }
    }

    // subject: trim.
    const subject = params["subject"];
    if (typeof subject === "string" && subject !== subject.trim()) {
      patches["subject"] = subject.trim();
    }

    return { gaps, risks, paramPatches: Object.keys(patches).length > 0 ? patches : undefined };
  }
}