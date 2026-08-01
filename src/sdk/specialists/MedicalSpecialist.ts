/**
 * MedicalSpecialist.ts — P5 Official Specialist
 * Domain: medical — covers health information, symptoms, medications, procedures.
 * Extends BaseSpecialist. Uses InvokeLLM for grounded analysis.
 * IMPORTANT: Always recommends professional consultation. Never diagnoses.
 * P5 · Version: 1.0.0
 */

import { BaseSpecialist } from "@/sdk/specialist/BaseSpecialist";
import { SpecialistBuilder } from "@/sdk/specialist/SpecialistBuilder";
import type { SpecialistRequest, SpecialistResponse } from "@/sdk/specialist/ISpecialist";
import { base44 } from "@/api/base44Client";

const MANIFEST = new SpecialistBuilder(
  "com.memoryos.medical-specialist",
  "1.0.0",
  "Medical Specialist",
  "medical",
)
  .setAuthor("MemoryOS")
  .setSubdomain("health-information,symptoms,medications,wellness")
  .addLanguage("pt-BR")
  .addLanguage("en-US")
  .addExpertise({
    topic: "Informacoes de saude geral",
    confidence: 0.75,
    sources: ["Ministerio da Saude", "CFM", "OMS/WHO"],
    limitations: ["NAO diagnostica. NAO substitui medico. Sempre consulte um profissional de saude."],
    language: "pt-BR",
  })
  .addExpertise({
    topic: "Medicamentos e bulas",
    confidence: 0.72,
    sources: ["ANVISA", "Bulario Eletronico"],
    limitations: ["Informacoes gerais apenas. Interacoes medicamentosas requerem avaliacao medica."],
    language: "pt-BR",
  })
  .build();

const KEYWORDS = [
  "saude", "doenca", "sintoma", "medicamento", "remedio", "bula", "dosagem",
  "medico", "hospital", "consulta", "exame", "tratamento", "diagnostico",
  "pressao", "diabetes", "colesterol", "febre", "dor", "alergia", "vacina",
  "health", "medical", "symptom", "medication", "doctor", "disease", "treatment",
];

export class MedicalSpecialist extends BaseSpecialist {
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

    return {
      specialistId:    this.id,
      facts:           result.facts           ?? [],
      reasoning:       result.reasoning       ?? [],
      recommendations: result.recommendations ?? [],
      confidence:      result.confidence      ?? 0.7,
      sources:         ["Ministerio da Saude", "ANVISA", "CFM", "OMS/WHO"],
      limitations:     [
        "NAO constitui diagnostico medico.",
        "NAO substitui consulta com profissional de saude.",
        ...(result.limitations ?? []),
      ],
      durationMs: Date.now() - t0,
    };
  }
}