/**
 * MRI — MemoryOS Reference Implementation
 * GeneralSpecialist — Specialist de referência para consultas gerais
 * Segue integralmente o Specialist SDK (MDPS Capítulo 4)
 */

import type { ISpecialist, SpecialistRequest, SpecialistResponse, SpecialistMetadata } from "../core/interfaces";

export class GeneralSpecialist implements ISpecialist {
  readonly specialistId = "com.memoryos.general-specialist";
  readonly domain       = "general";
  readonly capabilities = ["general.query.answer", "general.fact.retrieve"];

  async process(request: SpecialistRequest): Promise<SpecialistResponse> {
    // Consultar Knowledge Graph via Interface (nunca diretamente)
    const nodes = await request.knowledgeProvider.search({
      query:  request.query,
      domain: this.domain,
      limit:  10,
    });

    const facts = nodes.map(n => ({
      statement:  n.value,
      confidence: n.confidence,
      source:     n.source,
    }));

    return {
      specialistId:    this.specialistId,
      domain:          this.domain,
      facts,
      reasoning: [{
        step:       "Knowledge Graph search",
        conclusion: `Found ${facts.length} relevant facts for query: "${request.query}"`,
      }],
      recommendations: facts.length > 0
        ? [{ action: "Use retrieved facts to answer query", priority: "HIGH", rationale: "Directly relevant information found" }]
        : [{ action: "Request clarification from user", priority: "MEDIUM", rationale: "No relevant facts found" }],
      confidence:   facts.length > 0 ? Math.max(...facts.map(f => f.confidence)) : 0.3,
      sources:      [...new Set(facts.map(f => f.source))],
      limitations:  [
        "Knowledge limited to loaded base",
        "Does not access external sources in real time",
      ],
    };
  }

  getMetadata(): SpecialistMetadata {
    return {
      specialistId: this.specialistId,
      domain:       this.domain,
      version:      "1.0.0",
      languages:    ["pt-BR", "en-US"],
      expertise:    [{ topic: "General knowledge retrieval", confidence: 0.7 }],
    };
  }
}