/**
 * LegalPackage.ts — Knowledge Package Runtime
 * Domain: legal — Brazilian civil, labor, and consumer law.
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
  packageId: "com.memoryos.legal",
  name:      "Legal Package",
  version:   "1.0.0",
  author:    "MemoryOS",
  license:   "CC-BY-4.0",
  domain:    "legal",
  language:  "pt-BR",
  sources: Object.freeze([
    Object.freeze({ name: "CLT - Consolidacao das Leis do Trabalho",          date: "2023-01-01", type: "law" as const }),
    Object.freeze({ name: "Codigo Civil Brasileiro - Lei 10406/2002",         date: "2023-01-01", type: "law" as const }),
    Object.freeze({ name: "CDC - Codigo de Defesa do Consumidor - Lei 8078",  date: "2023-01-01", type: "law" as const }),
    Object.freeze({ name: "Constituicao Federal de 1988",                      date: "2023-01-01", type: "law" as const }),
  ]),
});

const CONTENT: KnowledgePackageContent = Object.freeze({
  nodes: Object.freeze([
    Object.freeze({ id: "leg-001", type: "rule" as const,    label: "Aviso Previo",          content: "Minimo 30 dias (+ 3 dias/ano, max 90). Pode ser indenizado.", confidence: 0.96, sourceIds: Object.freeze(["CLT Art. 487"]),            tags: Object.freeze(["trabalhista", "demissao"]) }),
    Object.freeze({ id: "leg-002", type: "rule" as const,    label: "Ferias Anuais",          content: "30 dias apos 12 meses. Podem ser fracionadas em ate 3 periodos.", confidence: 0.97, sourceIds: Object.freeze(["CLT Art. 129-133"]),       tags: Object.freeze(["ferias", "trabalhista"]) }),
    Object.freeze({ id: "leg-003", type: "rule" as const,    label: "13o Salario",            content: "Gratificacao natalina obrigatoria. Parcelas: ate 30/11 e 20/12.", confidence: 0.97, sourceIds: Object.freeze(["Lei 4090/1962"]),           tags: Object.freeze(["13-salario", "trabalhista"]) }),
    Object.freeze({ id: "leg-004", type: "rule" as const,    label: "Arrependimento CDC",     content: "Compras fora do estabelecimento: 7 dias apos recebimento para desistencia sem justificativa.", confidence: 0.96, sourceIds: Object.freeze(["CDC Art. 49"]),           tags: Object.freeze(["consumidor", "arrependimento"]) }),
    Object.freeze({ id: "leg-005", type: "rule" as const,    label: "Garantia Legal",         content: "30 dias (nao-duraveis) e 90 dias (duraveis) contra vicios. Independe da garantia contratual.", confidence: 0.96, sourceIds: Object.freeze(["CDC Art. 26"]),           tags: Object.freeze(["garantia", "cdc"]) }),
    Object.freeze({ id: "leg-006", type: "concept" as const, label: "Contrato de Trabalho",   content: "Acordo tacito ou expresso. Determinado (max 2 anos) ou indeterminado.", confidence: 0.95, sourceIds: Object.freeze(["CLT Art. 442-443"]),      tags: Object.freeze(["contrato", "trabalhista"]) }),
    Object.freeze({ id: "leg-007", type: "rule" as const,    label: "FGTS Multa Dispensa",    content: "8% do salario/mes pelo empregador. Dispensa sem justa causa: multa de 40% sobre saldo.", confidence: 0.96, sourceIds: Object.freeze(["Lei 8036/1990"]),           tags: Object.freeze(["fgts", "multa"]) }),
    Object.freeze({ id: "leg-008", type: "concept" as const, label: "Usucapiao",              content: "Aquisicao de propriedade por posse continua. Ordinaria: 10 anos. Extraordinaria: 15 anos. Urbana: 5 anos.", confidence: 0.90, sourceIds: Object.freeze(["CC Art. 1238-1244"]),    tags: Object.freeze(["usucapiao", "propriedade"]) }),
    Object.freeze({ id: "leg-009", type: "rule" as const,    label: "Responsabilidade Civil", content: "Obrigacao de reparar dano. Elementos: acao, culpa/dolo, nexo causal e dano.", confidence: 0.93, sourceIds: Object.freeze(["CC Art. 186-188, 927"]), tags: Object.freeze(["responsabilidade", "indenizacao"]) }),
    Object.freeze({ id: "leg-010", type: "rule" as const,    label: "Prescricao Trabalhista", content: "2 anos apos extincao do contrato. Retroatividade de 5 anos.", confidence: 0.94, sourceIds: Object.freeze(["CF Art. 7 XXIX", "CLT"]),  tags: Object.freeze(["prescricao", "prazo"]) }),
  ]),
  edges: Object.freeze([
    Object.freeze({ id: "e-001", fromId: "leg-001", toId: "leg-006", relation: "related_to" as const, weight: 0.90 }),
    Object.freeze({ id: "e-002", fromId: "leg-002", toId: "leg-006", relation: "related_to" as const, weight: 0.90 }),
    Object.freeze({ id: "e-003", fromId: "leg-003", toId: "leg-006", relation: "related_to" as const, weight: 0.90 }),
    Object.freeze({ id: "e-004", fromId: "leg-007", toId: "leg-001", relation: "related_to" as const, weight: 0.85 }),
    Object.freeze({ id: "e-005", fromId: "leg-004", toId: "leg-005", relation: "related_to" as const, weight: 0.80 }),
    Object.freeze({ id: "e-006", fromId: "leg-010", toId: "leg-006", relation: "related_to" as const, weight: 0.80 }),
  ]),
});

export class LegalPackage {
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