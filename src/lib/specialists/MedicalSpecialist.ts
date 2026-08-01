/**
 * MedicalSpecialist.ts — Specialist Runtime
 * Domain: medical — health information, symptoms, medications, wellness.
 * MDS v2.0 · Chapter 2 — Engineering Conventions
 * Single Responsibility: domain health information only. NEVER diagnoses.
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
  specialistId: "com.memoryos.medical-specialist",
  name:         "Medical Specialist",
  version:      "1.0.0",
  author:       "MemoryOS",
  domain:       "medical" as const,
  subdomain:    "health-information,symptoms,medications,wellness",
  languages:    Object.freeze(["pt-BR", "en-US"]),
  expertise: Object.freeze([
    Object.freeze({ topic: "Informacoes de saude geral", confidence: 0.75, sources: Object.freeze(["Ministerio da Saude", "CFM", "OMS/WHO"]), limitations: Object.freeze(["NAO diagnostica. Consulte um medico."]), language: "pt-BR" }),
    Object.freeze({ topic: "Medicamentos e bulas", confidence: 0.72, sources: Object.freeze(["ANVISA", "Bulario Eletronico"]), limitations: Object.freeze(["Informacoes gerais apenas. Interacoes medicamentosas requerem avaliacao medica."]), language: "pt-BR" }),
  ]),
});

const KEYWORDS = Object.freeze([
  "saude", "doenca", "sintoma", "medicamento", "remedio", "bula", "dosagem",
  "medico", "hospital", "consulta", "exame", "tratamento", "diagnostico",
  "pressao", "diabetes", "colesterol", "febre", "dor", "alergia", "vacina",
  "health", "medical", "symptom", "medication", "doctor", "disease", "treatment",
]);

export class MedicalSpecialist {
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
        prompt: `Voce e um especialista em informacoes de saude do MemoryOS. NUNCA diagnostique. Forneca apenas informacoes educativas baseadas em fontes oficiais (Ministerio da Saude, ANVISA, OMS). Sempre recomende consulta medica profissional.

CONSULTA: ${request.query}

Retorne:
- facts: informacoes de saude relevantes com nivel de confianca e fonte
- reasoning: contexto e explicacao educativa
- recommendations: orientacoes gerais e quando buscar atendimento medico
- confidence: confianca geral (0.0-1.0)
- limitations: SEMPRE inclua "Nao diagnostica. Consulte um medico."`,
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
        confidence:      result.confidence ?? 0.7,
        sources:         Object.freeze(["Ministerio da Saude", "ANVISA", "CFM", "OMS/WHO"]),
        limitations:     Object.freeze(["NAO constitui diagnostico medico.", "NAO substitui consulta com profissional de saude.", ...(result.limitations ?? [])]),
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