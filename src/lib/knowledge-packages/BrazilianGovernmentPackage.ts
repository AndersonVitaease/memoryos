/**
 * BrazilianGovernmentPackage.ts — Knowledge Package Runtime
 * Domain: government — Brazilian federal government services and procedures.
 * MDS v2.0 · Chapter 2 — Engineering Conventions
 */

import type {
  KnowledgePackageManifest,
  KnowledgePackageContent,
  KnowledgeQueryResult,
  KnowledgePackageHealthResult,
  KnowledgePackageMetrics,
} from "./KnowledgePackageTypes";

const MANIFEST: KnowledgePackageManifest = Object.freeze({
  packageId: "com.memoryos.brazilian-government",
  name:      "Brazilian Government Package",
  version:   "1.0.0",
  author:    "MemoryOS",
  license:   "CC-BY-4.0",
  domain:    "government",
  language:  "pt-BR",
  sources: Object.freeze([
    Object.freeze({ name: "Portal Gov.br",              url: "https://www.gov.br",                      date: "2024-01-01", type: "standard"    as const }),
    Object.freeze({ name: "Receita Federal do Brasil",  url: "https://www.gov.br/receitafederal",       date: "2024-01-01", type: "regulation" as const }),
    Object.freeze({ name: "INSS",                       url: "https://www.gov.br/inss",                 date: "2024-01-01", type: "regulation" as const }),
    Object.freeze({ name: "Ministerio da Economia",     url: "https://www.gov.br/economia",             date: "2024-01-01", type: "regulation" as const }),
  ]),
});

const CONTENT: KnowledgePackageContent = Object.freeze({
  nodes: Object.freeze([
    Object.freeze({ id: "gov-001", type: "concept" as const, label: "CPF",                     content: "Cadastro de Pessoas Fisicas — documento fiscal obrigatorio. Emitido pela Receita Federal.", confidence: 0.99, sourceIds: Object.freeze(["Receita Federal"]), tags: Object.freeze(["documento", "fiscal", "cpf"]) }),
    Object.freeze({ id: "gov-002", type: "concept" as const, label: "CNPJ",                    content: "Cadastro Nacional da Pessoa Juridica — registro obrigatorio para empresas.", confidence: 0.99, sourceIds: Object.freeze(["Receita Federal"]), tags: Object.freeze(["empresa", "cnpj"]) }),
    Object.freeze({ id: "gov-003", type: "fact"    as const, label: "INSS Beneficios",          content: "Administra aposentadorias, auxilio-doenca, salario-maternidade e pensao por morte.", confidence: 0.97, sourceIds: Object.freeze(["INSS"]), tags: Object.freeze(["previdencia", "inss"]) }),
    Object.freeze({ id: "gov-004", type: "fact"    as const, label: "IRPF Declaracao",          content: "Declaracao obrigatoria anual para contribuintes acima do limite legal. Prazo geralmente em abril.", confidence: 0.95, sourceIds: Object.freeze(["Receita Federal"]), tags: Object.freeze(["irpf", "declaracao"]) }),
    Object.freeze({ id: "gov-005", type: "fact"    as const, label: "MEI",                      content: "Faturamento anual limitado a R$ 81.000. Pagamento mensal via DAS.", confidence: 0.96, sourceIds: Object.freeze(["Receita Federal"]), tags: Object.freeze(["mei", "autonomo"]) }),
    Object.freeze({ id: "gov-006", type: "concept" as const, label: "Simples Nacional",          content: "Regime tributario simplificado para micro e pequenas empresas. Reune impostos em uma guia (DAS).", confidence: 0.95, sourceIds: Object.freeze(["Receita Federal"]), tags: Object.freeze(["simples", "tributario"]) }),
    Object.freeze({ id: "gov-007", type: "fact"    as const, label: "FGTS",                     content: "8% do salario depositado mensalmente pelo empregador. Saque em demissao sem justa causa, aposentadoria e compra de imovel.", confidence: 0.97, sourceIds: Object.freeze(["Ministerio da Economia"]), tags: Object.freeze(["fgts", "trabalhista"]) }),
    Object.freeze({ id: "gov-008", type: "rule"    as const, label: "Nota Fiscal Eletronica",   content: "Obrigatoria para empresas que realizam compra e venda de mercadorias. Emitida via SEFAZ.", confidence: 0.94, sourceIds: Object.freeze(["Receita Federal"]), tags: Object.freeze(["nfe", "fiscal"]) }),
    Object.freeze({ id: "gov-009", type: "concept" as const, label: "e-CAC",                    content: "Portal da Receita Federal para servicos digitais: CPF/CNPJ, extrato de IR, parcelamento.", confidence: 0.96, sourceIds: Object.freeze(["Receita Federal"]), tags: Object.freeze(["ecac", "servico-digital"]) }),
    Object.freeze({ id: "gov-010", type: "fact"    as const, label: "Carteira de Trabalho Digital", content: "Disponivel no app gov.br. Registra vinculos empregaticos e remuneracoes.", confidence: 0.95, sourceIds: Object.freeze(["Ministerio da Economia"]), tags: Object.freeze(["ctps", "emprego"]) }),
  ]),
  edges: Object.freeze([
    Object.freeze({ id: "e-001", fromId: "gov-001", toId: "gov-004", relation: "related_to" as const, weight: 0.80 }),
    Object.freeze({ id: "e-002", fromId: "gov-002", toId: "gov-006", relation: "related_to" as const, weight: 0.90 }),
    Object.freeze({ id: "e-003", fromId: "gov-002", toId: "gov-005", relation: "related_to" as const, weight: 0.90 }),
    Object.freeze({ id: "e-004", fromId: "gov-003", toId: "gov-010", relation: "related_to" as const, weight: 0.70 }),
    Object.freeze({ id: "e-005", fromId: "gov-006", toId: "gov-005", relation: "extends"    as const, weight: 0.60 }),
  ]),
});

export class BrazilianGovernmentPackage {
  readonly manifest: KnowledgePackageManifest = MANIFEST;

  private _queryCount   = 0;
  private _totalQueryMs = 0;

  content(): KnowledgePackageContent { return CONTENT; }

  query(keywords: readonly string[]): KnowledgeQueryResult {
    const t0 = Date.now();
    this._queryCount++;
    const lower = keywords.map((k) => k.toLowerCase());
    const nodes = CONTENT.nodes.filter((n) =>
      lower.some((k) => n.label.toLowerCase().includes(k) || n.tags.some((t) => t.includes(k)))
    );
    const sorted = [...nodes].sort((a, b) => b.confidence - a.confidence);
    const durationMs = Date.now() - t0;
    this._totalQueryMs += durationMs;
    return Object.freeze({ nodes: Object.freeze(sorted), totalHits: sorted.length, queryMs: durationMs });
  }

  health(): KnowledgePackageHealthResult {
    const { nodes, edges } = CONTENT;
    const status = nodes.length > 0 ? "SUCCESS" : "FAILED";
    return Object.freeze({ status, packageId: MANIFEST.packageId, nodeCount: nodes.length, edgeCount: edges.length, details: `${MANIFEST.name} v${MANIFEST.version}` });
  }

  metrics(): KnowledgePackageMetrics {
    return Object.freeze({ packageId: MANIFEST.packageId, nodeCount: CONTENT.nodes.length, edgeCount: CONTENT.edges.length, queryCount: this._queryCount, avgQueryMs: this._queryCount > 0 ? Math.round(this._totalQueryMs / this._queryCount) : 0 });
  }
}