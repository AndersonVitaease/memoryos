/**
 * LegalSpecialist.ts — P5 Official Specialist
 * Domain: legal — covers Brazilian civil, labor, and consumer law.
 * Extends BaseSpecialist. Uses InvokeLLM for grounded analysis.
 * P5 · Version: 1.0.0
 */

import { BaseSpecialist } from "@/sdk/specialist/BaseSpecialist";
import { SpecialistBuilder } from "@/sdk/specialist/SpecialistBuilder";
import type { SpecialistRequest, SpecialistResponse } from "@/sdk/specialist/ISpecialist";
import { base44 } from "@/api/base44Client";

const MANIFEST = new SpecialistBuilder(
  "com.memoryos.legal-specialist",
  "1.0.0",
  "Legal Specialist",
  "legal",
)
  .setAuthor("MemoryOS")
  .setSubdomain("civil,labor,consumer,contracts")
  .addLanguage("pt-BR")
  .addLanguage("en-US")
  .addExpertise({
    topic: "Direito trabalhista brasileiro",
    confidence: 0.82,
    sources: ["CLT - Consolidacao das Leis do Trabalho", "TST"],
    limitations: ["Nao substitui advogado. Jurisprudencia pode variar."],
    language: "pt-BR",
  })
  .addExpertise({
    topic: "Direito do consumidor",
    confidence: 0.85,
    sources: ["CDC - Codigo de Defesa do Consumidor", "PROCON"],
    limitations: ["Casos especificos requerem avaliacao juridica profissional"],
    language: "pt-BR",
  })
  .addExpertise({
    topic: "Contratos e obrigacoes",
    confidence: 0.80,
    sources: ["Codigo Civil Brasileiro - Lei 10406/2002"],
    limitations: ["Analise geral — contratos complexos requerem advogado"],
    language: "pt-BR",
  })
  .build();

const KEYWORDS = [
  "contrato", "clausula", "rescisao", "trabalhista", "clt", "ferias", "fgts",
  "inss", "demissao", "aviso previo", "consumidor", "cdc", "procon", "processo",
  "juridico", "advogado", "lei", "direito", "codigo civil", "penal", "crime",
  "legal", "law", "contract", "labor", "court", "lawsuit",
];

export class LegalSpecialist extends BaseSpecialist {
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

    return {
      specialistId:    this.id,
      facts:           result.facts           ?? [],
      reasoning:       result.reasoning       ?? [],
      recommendations: result.recommendations ?? [],
      confidence:      result.confidence      ?? 0.75,
      sources:         ["CLT", "Codigo Civil", "CDC", "TST", "STJ"],
      limitations:     result.limitations     ?? ["Nao constitui consulta juridica. Consulte um advogado para seu caso especifico."],
      durationMs:      Date.now() - t0,
    };
  }
}