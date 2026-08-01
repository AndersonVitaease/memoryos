/**
 * FinancialSpecialist.ts — P5 Official Specialist
 * Domain: financial — covers taxation, investments, budgeting, accounting.
 * Extends BaseSpecialist. Uses InvokeLLM for grounded analysis.
 * P5 · Version: 1.0.0
 */

import { BaseSpecialist } from "@/sdk/specialist/BaseSpecialist";
import { SpecialistBuilder } from "@/sdk/specialist/SpecialistBuilder";
import type { SpecialistRequest, SpecialistResponse } from "@/sdk/specialist/ISpecialist";
import { base44 } from "@/api/base44Client";

const MANIFEST = new SpecialistBuilder(
  "com.memoryos.financial-specialist",
  "1.0.0",
  "Financial Specialist",
  "financial",
)
  .setAuthor("MemoryOS")
  .setSubdomain("taxation,investments,budgeting,accounting")
  .addLanguage("pt-BR")
  .addLanguage("en-US")
  .addExpertise({
    topic: "Tributacao brasileira",
    confidence: 0.85,
    sources: ["Receita Federal", "Lei 5172/1966 - CTN"],
    limitations: ["Nao substitui consulta com contador"],
    language: "pt-BR",
  })
  .addExpertise({
    topic: "Investimentos e mercado financeiro",
    confidence: 0.80,
    sources: ["CVM", "B3", "Banco Central do Brasil"],
    limitations: ["Nao constitui recomendacao de investimento"],
    language: "pt-BR",
  })
  .addExpertise({
    topic: "Contabilidade e fluxo de caixa",
    confidence: 0.82,
    sources: ["CFC", "NBC TG - Normas Brasileiras de Contabilidade"],
    limitations: ["Contexto especifico pode variar por setor"],
    language: "pt-BR",
  })
  .build();

const KEYWORDS = [
  "imposto", "tributo", "irpf", "irpj", "simples", "mei", "cnpj", "contabil",
  "investimento", "acoes", "fundo", "renda fixa", "tesouro", "cdi", "selic",
  "orcamento", "fluxo de caixa", "balanco", "dre", "financeiro", "contabilidade",
  "tax", "financial", "accounting", "investment", "budget",
];

export class FinancialSpecialist extends BaseSpecialist {
  constructor() {
    super(MANIFEST);
  }

  canHandle(query: string): boolean {
    const q = query.toLowerCase();
    return KEYWORDS.some((k) => q.includes(k));
  }

  protected async onExecute(request: SpecialistRequest): Promise<SpecialistResponse> {
    const t0 = Date.now();

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Voce e um especialista financeiro do MemoryOS. Analise a consulta abaixo e retorne fatos estruturados, raciocinio e recomendacoes. Seja objetivo e cite fontes quando possivel. Declare limitacoes explicitas.

CONSULTA: ${request.query}

Retorne:
- facts: lista de fatos relevantes com nivel de confianca
- reasoning: passos do raciocinio aplicado
- recommendations: acoes ou proximos passos recomendados
- confidence: confianca geral (0.0-1.0)
- limitations: o que este analise nao cobre`,
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

    return {
      specialistId:    this.id,
      facts:           result.facts           ?? [],
      reasoning:       result.reasoning       ?? [],
      recommendations: result.recommendations ?? [],
      confidence:      result.confidence      ?? 0.7,
      sources:         ["Receita Federal", "CVM", "Banco Central do Brasil", "CFC"],
      limitations:     result.limitations     ?? ["Nao substitui consultoria financeira profissional"],
      durationMs:      Date.now() - t0,
    };
  }
}