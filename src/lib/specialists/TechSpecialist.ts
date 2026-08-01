/**
 * TechSpecialist.ts — Specialist Runtime
 * Domain: technical — software engineering, architecture, DevOps, APIs.
 * MDS v2.0 · Chapter 2 — Engineering Conventions
 * Single Responsibility: domain technical analysis only.
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
  specialistId: "com.memoryos.tech-specialist",
  name:         "Tech Specialist",
  version:      "1.0.0",
  author:       "MemoryOS",
  domain:       "technical" as const,
  subdomain:    "software,architecture,devops,apis,databases",
  languages:    Object.freeze(["pt-BR", "en-US"]),
  expertise: Object.freeze([
    Object.freeze({ topic: "Arquitetura de software", confidence: 0.90, sources: Object.freeze(["SOLID", "Clean Architecture", "DDD"]), limitations: Object.freeze(["Decisoes dependem de contexto especifico"]), language: "pt-BR" }),
    Object.freeze({ topic: "Desenvolvimento web e APIs", confidence: 0.92, sources: Object.freeze(["MDN Web Docs", "RFC Standards", "OpenAPI"]), limitations: Object.freeze(["Versoes de bibliotecas podem variar"]), language: "pt-BR" }),
    Object.freeze({ topic: "DevOps e infraestrutura", confidence: 0.85, sources: Object.freeze(["CNCF", "12-Factor App"]), limitations: Object.freeze(["Configuracoes de ambiente podem variar"]), language: "pt-BR" }),
  ]),
});

const KEYWORDS = Object.freeze([
  "codigo", "programacao", "software", "api", "banco de dados", "sql", "nosql",
  "docker", "kubernetes", "deploy", "ci/cd", "git", "typescript", "javascript",
  "react", "node", "python", "arquitetura", "microservico", "rest", "graphql",
  "bug", "erro", "debug", "performance", "seguranca", "autenticacao", "oauth",
  "code", "programming", "database", "server", "cloud", "architecture", "devops",
]);

export class TechSpecialist {
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
        prompt: `Voce e um especialista tecnico em engenharia de software do MemoryOS. Analise a consulta tecnica abaixo e retorne fatos precisos, raciocinio estruturado e recomendacoes praticas. Cite padroes, documentacao oficial e boas praticas.

CONSULTA: ${request.query}

Retorne:
- facts: fatos tecnicos precisos com nivel de confianca e fonte
- reasoning: explicacao tecnica passo a passo
- recommendations: solucoes praticas, padroes recomendados ou proximos passos
- confidence: confianca geral (0.0-1.0)
- limitations: o que pode variar por contexto ou versao`,
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
        confidence:      result.confidence ?? 0.85,
        sources:         Object.freeze(["MDN", "CNCF", "RFC Standards", "SOLID/Clean Architecture"]),
        limitations:     Object.freeze(result.limitations     ?? ["Versoes e configuracoes de ambiente podem variar"]),
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