/**
 * DateFormatValidator.ts — EI-06 (RFC-008 / ADR-015)
 *
 * Investigator generico: valida que campos de data estao em formato aceito.
 * Nao valida PRESENCA (papel do GenericFieldValidator) — se o campo e ausente
 * ou vazio, nada e reportado aqui. Se presente, deve bater com um formato
 * conhecido ou com `acceptedFormats` configurado.
 *
 * Formatos conhecidos (regex), cobrem os casos comuns do MemoryOS (Gmail
 * Graph, Calendar, Travellink):
 *  - "YYYY-MM-DD"         → /^\d{4}-\d{2}-\d{2}$/
 *  - "DD/MM/YYYY"         → /^\d{2}\/\d{2}\/\d{4}$/
 *  - "YYYY-MM-DDTHH:mm"   → /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/
 *  - "HH:mm"              → /^\d{2}:\d{2}$/
 *
 * Instancias Date (typeof === object && instanceof Date) sao aceitas como ok.
 * Valores nao-string e nao-Date geram gap de tipo.
 *
 * Puro, stateless, sincrono. Sem LLM, sem chamadas cross-connector.
 */

import type { ExecutionGap, ExecutionRequest } from "../ExecutionTypes";
import type { InvestigationFinding, Investigator } from "./InvestigatorTypes";

export type KnownDateFormat = "YYYY-MM-DD" | "DD/MM/YYYY" | "YYYY-MM-DDTHH:mm" | "HH:mm";

const KNOWN_FORMATS: Record<KnownDateFormat, RegExp> = {
  "YYYY-MM-DD": /^\d{4}-\d{2}-\d{2}$/,
  "DD/MM/YYYY": /^\d{2}\/\d{2}\/\d{4}$/,
  "YYYY-MM-DDTHH:mm": /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/,
  "HH:mm": /^\d{2}:\d{2}$/,
};

export interface DateFormatValidatorConfig {
  readonly id: string;
  readonly description: string;
  readonly dateFields: readonly string[];
  /** Se omitido, aceita qualquer formato conhecido. */
  readonly acceptedFormats?: readonly KnownDateFormat[];
  readonly appliesTo?: (request: ExecutionRequest) => boolean;
}

export class DateFormatValidator implements Investigator {
  constructor(private readonly _config: DateFormatValidatorConfig) {}

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
    const formats = this._config.acceptedFormats ?? (Object.keys(KNOWN_FORMATS) as KnownDateFormat[]);
    for (const field of this._config.dateFields) {
      const value = request.params[field];
      if (value === null || value === undefined || value === "") continue; // presenca e papel do GenericFieldValidator
      if (value instanceof Date) continue; // Date object valido
      if (typeof value !== "string") {
        gaps.push({
          field,
          reason: `Campo de data "${field}" com tipo invalido (${typeof value}); esperado string ou Date.`,
        });
        continue;
      }
      const matched = formats.some((f) => KNOWN_FORMATS[f]?.test(value));
      if (!matched) {
        gaps.push({
          field,
          reason: `Campo de data "${field}" nao esta em formato aceito (${formats.join(", ")}). Valor: "${truncate(value, 40)}".`,
        });
      }
    }
    return { gaps, risks: [] };
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}...`;
}