/**
 * LegalSpecialist.ts — Specialist Runtime
 * Domain: legal — Brazilian civil, labor, and consumer law.
 * MDS v2.0 · Chapter 2 — Engineering Conventions
 * Single Responsibility: domain legal analysis only.
 */

import type {
  SpecialistManifest,
  SpecialistRequest,
  SpecialistResponse,
  SpecialistHealthResult,
  SpecialistMetrics,
} from "./SpecialistTypes";
import { base44 } from "@/api/base44Client";

const MANIFEST: SpecialistManifest = Object.freeze({
  specialistId: "com.memoryos.legal-specialist",
  name:         "Legal Specialist",
  version:      "1.0.0",
  author:       "MemoryOS",
  domain:       "legal" as const,
  subdomain:    "civil,labor,consumer,contracts",
  languages:    Object.freeze(["pt-BR", "en-US"]),
  expertise: Object.freeze([
    Object.freeze({ topic: "Direito trabalhista brasileiro", confidence: 0.82, sources: Object.freeze(["CLT", "TST"]), limitations: Object.freeze(["Nao substitui advogado"]), language: "pt-BR" }),
    Object.freeze({ topic: "Direito do consumidor", confidence: 0.85, sources: Object.freeze(["CDC", "PROCON"]), limitations: Object.freeze(["Casos especificos requerem avaliacao juridica"]), language: "pt-BR" }),
    Object.freeze({ topic: "Contratos e obrigacoes", confidence: 0.80, sources: Object.freeze(["Codigo Civil - Lei 10406/2002"]), limitations: Object.freeze(["Contratos complexos requerem advogado"]), language: "pt-BR" }),
  ]),
});

const KEYWORDS = Object.freeze([
  "contrato", "clausula", "rescisao", "trabalhista", "clt", "ferias", "fgts",
  "inss", "demissao", "aviso previo", "consumidor", "cdc", "procon", "processo",
  "juridico", "advogado", "lei", "direito", "codigo civil", "penal", "crime",
  "legal", "law", "contract", "labor", "court", "lawsuit",
]);

export class LegalSpecialist {
  readonly manifest: SpecialistManifest = MANIFEST;

  private _executeCount = 0;
  private _successCount = 0;
  private _failureCount = 0;
  private _totalLatencyMs = 0;

  canHandle(query: string): boolean {
    const q = query.toLowerCase();
    return KEYWORDS.some((k) => q.includes(k));
  }

  async execute(request: SpecialistRequest): Promise<SpecialistResponse> {
    const t0 = Date.now();
    this._executeCount++;

    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Voce e um especialista juridico do MemoryOS. Analise a consulta abaixo com base no direito brasileiro. Retorne fatos juridicos estruturados, raciocinio e orientacoes. Sempre declare limitacoes e recomende consulta profissional quando adequado.

CONSULTA: ${request.query}

Retorne:
- facts: fatos juridicos relevantes com nivel de confianca e fonte legal
- reasoning: fundamentacao juridica aplicada
- recommendations: orientacoes praticas ou proximos passos
- confidence: confianca geral (0.0-1.0)
- limitations: o que esta analise nao cobre`,
        response_json_schema: {
          type: "object",
          properties: {
            facts:           { type: "array", items: { type: "object", properties: { claim: { type: "string" }, confidence: { type: "number" }, source: { type: "string" } } } },
            reasoning:       { type: "array", items: { type: "string" } },
            recommendations: { type: "array", items: { type: "string" } },
            confidence:      { type: "number" },
            limitations:     { type: "array", items: { type: "string" } },
          },
        },
      });

      const durationMs = Date.now() - t0;
      this._successCount++;
      this._totalLatencyMs += durationMs;

      return Object.freeze({
        specialistId:    MANIFEST.specialistId,
        facts:           Object.freeze(result.facts           ?? []),
        reasoning:       Object.freeze(result.reasoning       ?? []),
        recommendations: Object.freeze(result.recommendations ?? []),
        confidence:      result.confidence ?? 0.75,
        sources:         Object.freeze(["CLT", "Codigo Civil", "CDC", "TST", "STJ"]),
        limitations:     Object.freeze(result.limitations     ?? ["Nao constitui consulta juridica. Consulte um advogado."]),
        durationMs,
      });
    } catch (err) {
      this._failureCount++;
      this._totalLatencyMs += Date.now() - t0;
      return Object.freeze({
        specialistId:    MANIFEST.specialistId,
        facts:           Object.freeze([]),
        reasoning:       Object.freeze([`Erro na execucao: ${err instanceof Error ? err.message : String(err)}`]),
        recommendations: Object.freeze([]),
        confidence:      0,
        sources:         Object.freeze([]),
        limitations:     Object.freeze(["Execucao falhou — resultado indisponivel"]),
        durationMs:      Date.now() - t0,
      });
    }
  }

  health(): SpecialistHealthResult {
    const successRate = this._executeCount > 0 ? this._successCount / this._executeCount : 1;
    const avgLatencyMs = this._executeCount > 0 ? Math.round(this._totalLatencyMs / this._executeCount) : 0;
    const status = successRate >= 0.9 ? "SUCCESS" : successRate >= 0.5 ? "DEGRADED" : "FAILED";
    return Object.freeze({ status, specialistId: MANIFEST.specialistId, executeCount: this._executeCount, successRate, avgLatencyMs, details: `${MANIFEST.name} v${MANIFEST.version}` });
  }

  metrics(): SpecialistMetrics {
    return Object.freeze({
      specialistId: MANIFEST.specialistId,
      executeCount: this._executeCount,
      successCount: this._successCount,
      failureCount: this._failureCount,
      avgLatencyMs: this._executeCount > 0 ? Math.round(this._totalLatencyMs / this._executeCount) : 0,
      successRate:  this._executeCount > 0 ? this._successCount / this._executeCount : 1,
    });
  }
}