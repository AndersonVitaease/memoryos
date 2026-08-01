/**
 * FinancialSpecialist.ts — Specialist Runtime
 * Domain: financial — taxation, investments, budgeting, accounting.
 * MDS v2.0 · Chapter 2 — Engineering Conventions
 * Single Responsibility: domain financial analysis only.
 */

import type {
  SpecialistManifest,
  SpecialistRequest,
  SpecialistResponse,
  SpecialistHealthResult,
  SpecialistMetrics,
} from "./SpecialistTypes";
import { base44 } from "@/api/base44Client";

// ── Manifest ────────────────────────────────────────────────────────────────

const MANIFEST: SpecialistManifest = Object.freeze({
  specialistId: "com.memoryos.financial-specialist",
  name:         "Financial Specialist",
  version:      "1.0.0",
  author:       "MemoryOS",
  domain:       "financial" as const,
  subdomain:    "taxation,investments,budgeting,accounting",
  languages:    Object.freeze(["pt-BR", "en-US"]),
  expertise: Object.freeze([
    Object.freeze({
      topic:       "Tributacao brasileira",
      confidence:  0.85,
      sources:     Object.freeze(["Receita Federal", "Lei 5172/1966 - CTN"]),
      limitations: Object.freeze(["Nao substitui consulta com contador"]),
      language:    "pt-BR",
    }),
    Object.freeze({
      topic:       "Investimentos e mercado financeiro",
      confidence:  0.80,
      sources:     Object.freeze(["CVM", "B3", "Banco Central do Brasil"]),
      limitations: Object.freeze(["Nao constitui recomendacao de investimento"]),
      language:    "pt-BR",
    }),
    Object.freeze({
      topic:       "Contabilidade e fluxo de caixa",
      confidence:  0.82,
      sources:     Object.freeze(["CFC", "NBC TG"]),
      limitations: Object.freeze(["Contexto especifico pode variar por setor"]),
      language:    "pt-BR",
    }),
  ]),
});

const KEYWORDS = Object.freeze([
  "imposto", "tributo", "irpf", "irpj", "simples", "mei", "cnpj", "contabil",
  "investimento", "acoes", "fundo", "renda fixa", "tesouro", "cdi", "selic",
  "orcamento", "fluxo de caixa", "balanco", "dre", "financeiro", "contabilidade",
  "tax", "financial", "accounting", "investment", "budget",
]);

// ── FinancialSpecialist ──────────────────────────────────────────────────────

export class FinancialSpecialist {
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
        prompt: `Voce e um especialista financeiro do MemoryOS. Analise a consulta abaixo e retorne fatos estruturados, raciocinio e recomendacoes. Seja objetivo e cite fontes quando possivel. Declare limitacoes explicitas.

CONSULTA: ${request.query}

Retorne:
- facts: lista de fatos relevantes com nivel de confianca
- reasoning: passos do raciocinio aplicado
- recommendations: acoes ou proximos passos recomendados
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
        confidence:      result.confidence ?? 0.7,
        sources:         Object.freeze(["Receita Federal", "CVM", "Banco Central do Brasil", "CFC"]),
        limitations:     Object.freeze(result.limitations     ?? ["Nao substitui consultoria financeira profissional"]),
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
    return Object.freeze({
      status,
      specialistId: MANIFEST.specialistId,
      executeCount: this._executeCount,
      successRate,
      avgLatencyMs,
      details: `${MANIFEST.name} v${MANIFEST.version} — executions=${this._executeCount} successRate=${Math.round(successRate * 100)}% avgLatency=${avgLatencyMs}ms`,
    });
  }

  metrics(): SpecialistMetrics {
    return Object.freeze({
      specialistId:  MANIFEST.specialistId,
      executeCount:  this._executeCount,
      successCount:  this._successCount,
      failureCount:  this._failureCount,
      avgLatencyMs:  this._executeCount > 0 ? Math.round(this._totalLatencyMs / this._executeCount) : 0,
      successRate:   this._executeCount > 0 ? this._successCount / this._executeCount : 1,
    });
  }
}