/**
 * MRI — MemoryOS Reference Implementation
 * GovernmentSpecialist — Specialist de referência para documentos e serviços gov.br
 */

import type { ISpecialist, SpecialistRequest, SpecialistResponse, SpecialistMetadata } from "../core/interfaces";

export class GovernmentSpecialist implements ISpecialist {
  readonly specialistId = "com.memoryos.government-specialist";
  readonly domain       = "government";
  readonly capabilities = [
    "gov.document.explain",
    "gov.benefit.check",
    "gov.procedure.guide",
  ];

  async process(request: SpecialistRequest): Promise<SpecialistResponse> {
    const nodes = await request.knowledgeProvider.search({
      query:  request.query,
      domain: this.domain,
      limit:  15,
    });

    const facts = nodes.map(n => ({
      statement:  n.value,
      confidence: n.confidence,
      source:     n.source,
    }));

    // Detecção de intenção de serviço gov específico
    const query = request.query.toLowerCase();
    const isCpf  = query.includes("cpf");
    const isCnpj = query.includes("cnpj");
    const isBeneficio = query.includes("benefício") || query.includes("aposentadoria") || query.includes("inss");

    const recommendations = [];
    if (isCpf)      recommendations.push({ action: "Use GovConnector.cpf.validate",   priority: "HIGH" as const, rationale: "User asked about CPF" });
    if (isCnpj)     recommendations.push({ action: "Use GovConnector.cnpj.validate",  priority: "HIGH" as const, rationale: "User asked about CNPJ" });
    if (isBeneficio) recommendations.push({ action: "Use GovConnector.benefit.check", priority: "HIGH" as const, rationale: "User asked about social benefits" });

    return {
      specialistId:    this.specialistId,
      domain:          this.domain,
      facts,
      reasoning: [{
        step:       "Government domain analysis",
        conclusion: `Identified government services: CPF=${isCpf}, CNPJ=${isCnpj}, Benefits=${isBeneficio}`,
      }],
      recommendations,
      confidence:  facts.length > 0 ? 0.85 : 0.5,
      sources:     ["Gov.br — Portal de Serviços", "Receita Federal", "INSS"],
      limitations: [
        "Não substitui consulta jurídica especializada",
        "Dados do mock — consultar gov.br para valores atualizados",
      ],
    };
  }

  getMetadata(): SpecialistMetadata {
    return {
      specialistId: this.specialistId,
      domain:       this.domain,
      version:      "1.0.0",
      languages:    ["pt-BR"],
      expertise: [
        { topic: "CPF e CNPJ",             confidence: 0.90 },
        { topic: "Benefícios INSS",        confidence: 0.80 },
        { topic: "Serviços gov.br",        confidence: 0.85 },
        { topic: "Documentos de identidade", confidence: 0.85 },
      ],
    };
  }
}