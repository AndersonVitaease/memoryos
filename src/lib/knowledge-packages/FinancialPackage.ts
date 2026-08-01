/**
 * FinancialPackage.ts — Knowledge Package Runtime
 * Domain: financial — investments, taxation, banking, financial planning.
 * MDS v2.0 · Chapter 2 — Engineering Conventions
 * Single Responsibility: financial knowledge nodes and edges only.
 */

import type {
  KnowledgePackageManifest,
  KnowledgePackageContent,
  KnowledgeQueryResult,
  KnowledgePackageHealthResult,
  KnowledgePackageMetrics,
} from "./KnowledgePackageTypes";

const MANIFEST: KnowledgePackageManifest = Object.freeze({
  packageId: "com.memoryos.financial",
  name:      "Financial Package",
  version:   "1.0.0",
  author:    "MemoryOS",
  license:   "CC-BY-4.0",
  domain:    "financial",
  language:  "pt-BR",
  sources: Object.freeze([
    Object.freeze({ name: "Banco Central do Brasil",          url: "https://www.bcb.gov.br",              date: "2024-01-01", type: "regulation" as const }),
    Object.freeze({ name: "CVM - Comissao de Valores",        url: "https://www.gov.br/cvm",              date: "2024-01-01", type: "regulation" as const }),
    Object.freeze({ name: "B3 - Bolsa de Valores",            url: "https://www.b3.com.br",               date: "2024-01-01", type: "standard"    as const }),
    Object.freeze({ name: "Tesouro Nacional",                 url: "https://www.tesourodireto.com.br",    date: "2024-01-01", type: "regulation" as const }),
  ]),
});

const CONTENT: KnowledgePackageContent = Object.freeze({
  nodes: Object.freeze([
    Object.freeze({ id: "fin-001", type: "concept" as const, label: "CDI", content: "Taxa de referencia para investimentos de renda fixa no Brasil. Proxima da Selic. Benchmark para CDBs, LCIs, LCAs.", confidence: 0.97, sourceIds: Object.freeze(["Banco Central"]), tags: Object.freeze(["cdi", "renda-fixa", "taxa"]) }),
    Object.freeze({ id: "fin-002", type: "concept" as const, label: "Selic", content: "Taxa basica de juros da economia brasileira, definida pelo COPOM a cada 45 dias.", confidence: 0.98, sourceIds: Object.freeze(["Banco Central"]), tags: Object.freeze(["selic", "juros", "copom"]) }),
    Object.freeze({ id: "fin-003", type: "fact"    as const, label: "Tesouro Direto", content: "Programa do governo federal para venda de titulos publicos a pessoas fisicas. Opcoes: Selic, IPCA+, Prefixado.", confidence: 0.97, sourceIds: Object.freeze(["Tesouro Nacional"]), tags: Object.freeze(["tesouro", "titulo-publico"]) }),
    Object.freeze({ id: "fin-004", type: "concept" as const, label: "CDB", content: "Titulo de renda fixa emitido por bancos. Rentabilidade atrelada ao CDI. Protegido pelo FGC ate R$ 250.000.", confidence: 0.96, sourceIds: Object.freeze(["Banco Central", "CVM"]), tags: Object.freeze(["cdb", "renda-fixa"]) }),
    Object.freeze({ id: "fin-005", type: "concept" as const, label: "FGC", content: "Garante depositos bancarios ate R$ 250.000 por CPF por instituicao, limite de R$ 1.000.000 por CPF.", confidence: 0.97, sourceIds: Object.freeze(["Banco Central"]), tags: Object.freeze(["fgc", "garantia"]) }),
    Object.freeze({ id: "fin-006", type: "concept" as const, label: "Acoes", content: "Fracao do capital social de uma empresa negociada na B3. Renda variavel — sem garantia de retorno.", confidence: 0.95, sourceIds: Object.freeze(["CVM", "B3"]), tags: Object.freeze(["acoes", "bolsa", "renda-variavel"]) }),
    Object.freeze({ id: "fin-007", type: "fact"    as const, label: "IR sobre Investimentos", content: "Renda fixa: 22,5% a 15% regressivo por prazo. Acoes > R$ 20k/mes: 15%. Day trade: 20%. Dividendos isentos.", confidence: 0.93, sourceIds: Object.freeze(["Receita Federal"]), tags: Object.freeze(["ir", "imposto"]) }),
    Object.freeze({ id: "fin-008", type: "concept" as const, label: "Fundo de Investimento", content: "Estrutura coletiva com gestor profissional. Tipos: RF, acoes, multimercado, imobiliario (FII).", confidence: 0.94, sourceIds: Object.freeze(["CVM"]), tags: Object.freeze(["fundo", "cvm"]) }),
    Object.freeze({ id: "fin-009", type: "rule"    as const, label: "Diversificacao", content: "Nao concentrar recursos em um unico ativo. Reduz risco nao-sistematico.", confidence: 0.90, sourceIds: Object.freeze(["CVM"]), tags: Object.freeze(["diversificacao", "risco"]) }),
    Object.freeze({ id: "fin-010", type: "concept" as const, label: "IPCA", content: "Indice oficial de inflacao do Brasil, medido pelo IBGE. Referencia para reajuste de contratos.", confidence: 0.98, sourceIds: Object.freeze(["IBGE", "Banco Central"]), tags: Object.freeze(["ipca", "inflacao"]) }),
  ]),
  edges: Object.freeze([
    Object.freeze({ id: "e-001", fromId: "fin-002", toId: "fin-001", relation: "related_to" as const, weight: 0.95 }),
    Object.freeze({ id: "e-002", fromId: "fin-001", toId: "fin-004", relation: "related_to" as const, weight: 0.90 }),
    Object.freeze({ id: "e-003", fromId: "fin-004", toId: "fin-005", relation: "related_to" as const, weight: 0.80 }),
    Object.freeze({ id: "e-004", fromId: "fin-003", toId: "fin-002", relation: "depends_on" as const, weight: 0.85 }),
    Object.freeze({ id: "e-005", fromId: "fin-007", toId: "fin-006", relation: "related_to" as const, weight: 0.80 }),
    Object.freeze({ id: "e-006", fromId: "fin-008", toId: "fin-009", relation: "related_to" as const, weight: 0.75 }),
    Object.freeze({ id: "e-007", fromId: "fin-010", toId: "fin-003", relation: "related_to" as const, weight: 0.90 }),
  ]),
});

export class FinancialPackage {
  readonly manifest: KnowledgePackageManifest = MANIFEST;

  private _queryCount  = 0;
  private _totalQueryMs = 0;

  content(): KnowledgePackageContent {
    return CONTENT;
  }

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
    return Object.freeze({ status, packageId: MANIFEST.packageId, nodeCount: nodes.length, edgeCount: edges.length, details: `${MANIFEST.name} v${MANIFEST.version} — ${nodes.length} nos, ${edges.length} arestas` });
  }

  metrics(): KnowledgePackageMetrics {
    return Object.freeze({
      packageId:  MANIFEST.packageId,
      nodeCount:  CONTENT.nodes.length,
      edgeCount:  CONTENT.edges.length,
      queryCount: this._queryCount,
      avgQueryMs: this._queryCount > 0 ? Math.round(this._totalQueryMs / this._queryCount) : 0,
    });
  }
}