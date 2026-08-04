/**
 * GenericFieldValidator.ts — EI-06 (RFC-008 / ADR-015)
 *
 * Investigator generico: valida campos obrigatorios PRESENTES e nao-vazios.
 * Nao valida formato (isso e papel do DateFormatValidator ou investigators de
 * dominio em EI-07). Nao enriquece params — so reporta gaps.
 *
 * Configuravel via construtor: `requiredFields` + `appliesTo` opcional. Cada
 * instancia e um Investigator registrado no InvestigatorRegistry. Exemplo
 * (registro de dominio, EI-07):
 *
 *   investigatorRegistry.register(new GenericFieldValidator({
 *     id: "gmail.sendEmail.required",
 *     description: "Campos obrigatorios para envio de email.",
 *     requiredFields: ["to", "subject", "body"],
 *     appliesTo: (r) => r.connectorId === "gmail" && r.capability === "sendEmail",
 *   }));
 *
 * Puro, stateless, sincrono. Sem LLM, sem chamadas cross-connector.
 */

import type { ExecutionGap, ExecutionRequest } from "../ExecutionTypes";
import type { InvestigationFinding, Investigator } from "./InvestigatorTypes";

export interface GenericFieldValidatorConfig {
  readonly id: string;
  readonly description: string;
  readonly requiredFields: readonly string[];
  readonly appliesTo?: (request: ExecutionRequest) => boolean;
}

export class GenericFieldValidator implements Investigator {
  constructor(private readonly _config: GenericFieldValidatorConfig) {}

  get id(): string {
    return this._config.id;
  }
  get description(): string {
    return this._config.description;
  }
  get appliesTo(): ((request: ExecutionRequest) => boolean) | undefined {
    return this._config.appliesTo;
  }

  investigate(request: ExecutionRequest): InvestigationFinding {
    const gaps: ExecutionGap[] = [];
    for (const field of this._config.requiredFields) {
      const value = request.params[field];
      if (isEmpty(value)) {
        gaps.push({
          field,
          reason: `Campo obrigatorio "${field}" ausente ou vazio.`,
        });
      }
    }
    return { gaps, risks: [] };
  }
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}