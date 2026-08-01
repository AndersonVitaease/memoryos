/**
 * TechSpecialist.ts — P5 Official Specialist
 * Domain: technical — covers software engineering, architecture, DevOps, APIs.
 * Extends BaseSpecialist. Uses InvokeLLM for grounded analysis.
 * P5 · Version: 1.0.0
 */

import { BaseSpecialist } from "@/sdk/specialist/BaseSpecialist";
import { SpecialistBuilder } from "@/sdk/specialist/SpecialistBuilder";
import type { SpecialistRequest, SpecialistResponse } from "@/sdk/specialist/ISpecialist";
import { base44 } from "@/api/base44Client";

const MANIFEST = new SpecialistBuilder(
  "com.memoryos.tech-specialist",
  "1.0.0",
  "Tech Specialist",
  "technical",
)
  .setAuthor("MemoryOS")
  .setSubdomain("software,architecture,devops,apis,databases")
  .addLanguage("pt-BR")
  .addLanguage("en-US")
  .addExpertise({
    topic: "Arquitetura de software",
    confidence: 0.90,
    sources: ["SOLID Principles", "Clean Architecture", "Domain-Driven Design"],
    limitations: ["Decisoes de arquitetura dependem de contexto especifico do projeto"],
    language: "pt-BR",
  })
  .addExpertise({
    topic: "Desenvolvimento web e APIs",
    confidence: 0.92,
    sources: ["MDN Web Docs", "RFC Standards", "OpenAPI Specification"],
    limitations: ["Versoes de bibliotecas podem variar"],
    language: "pt-BR",
  })
  .addExpertise({
    topic: "DevOps e infraestrutura",
    confidence: 0.85,
    sources: ["CNCF", "AWS/GCP/Azure Docs", "12-Factor App"],
    limitations: ["Configuracoes especificas de ambiente podem variar"],
    language: "pt-BR",
  })
  .build();

const KEYWORDS = [
  "codigo", "programacao", "software", "api", "banco de dados", "sql", "nosql",
  "docker", "kubernetes", "deploy", "ci/cd", "git", "typescript", "javascript",
  "react", "node", "python", "arquitetura", "microservico", "rest", "graphql",
  "bug", "erro", "debug", "performance", "seguranca", "autenticacao", "oauth",
  "code", "programming", "database", "server", "cloud", "architecture", "devops",
];

export class TechSpecialist extends BaseSpecialist {
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

    return {
      specialistId:    this.id,
      facts:           result.facts           ?? [],
      reasoning:       result.reasoning       ?? [],
      recommendations: result.recommendations ?? [],
      confidence:      result.confidence      ?? 0.85,
      sources:         ["MDN", "CNCF", "RFC Standards", "SOLID/Clean Architecture"],
      limitations:     result.limitations     ?? ["Versoes e configuracoes de ambiente podem variar"],
      durationMs:      Date.now() - t0,
    };
  }
}