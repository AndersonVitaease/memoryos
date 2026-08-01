/**
 * FinancialPackage.ts — P6 Official Knowledge Package
 * Domain: financial — investments, taxation, banking, and financial planning concepts.
 * Extends BaseKnowledgePackage.
 * P6 · Version: 1.0.0
 */

import { BaseKnowledgePackage } from "@/sdk/knowledge/BaseKnowledgePackage";
import { KnowledgePackageBuilder } from "@/sdk/knowledge/KnowledgePackageBuilder";
import type { KnowledgePackageContent } from "@/sdk/knowledge/IKnowledgePackage";

const MANIFEST = new KnowledgePackageBuilder(
  "com.memoryos.financial",
  "1.0.0",
  "Financial Package",
  "financial",
)
  .setAuthor("MemoryOS")
  .setLicense("CC-BY-4.0")
  .setLanguage("pt-BR")
  .addSource({ name: "Banco Central do Brasil", url: "https://www.bcb.gov.br", date: "2024-01-01", type: "regulation" })
  .addSource({ name: "CVM - Comissao de Valores Mobiliarios", url: "https://www.gov.br/cvm", date: "2024-01-01", type: "regulation" })
  .addSource({ name: "B3 - Bolsa de Valores", url: "https://www.b3.com.br", date: "2024-01-01", type: "standard" })
  .addSource({ name: "Tesouro Nacional", url: "https://www.tesourodireto.com.br", date: "2024-01-01", type: "regulation" })
  .build();

export class FinancialPackage extends BaseKnowledgePackage {
  constructor() {
    super(MANIFEST);
  }

  content(): KnowledgePackageContent {
    return {
      nodes: [
        { id: "fin-001", type: "concept", label: "CDI — Certificado de Deposito Interbancario", content: "Taxa de referencia para investimentos de renda fixa no Brasil. Geralmente proxima da Selic. Usada como benchmark para CDBs, LCIs, LCAs.", confidence: 0.97, sourceIds: ["Banco Central"], tags: ["cdi", "renda-fixa", "taxa"] },
        { id: "fin-002", type: "concept", label: "Selic — Taxa Basica de Juros", content: "Taxa basica de juros da economia brasileira, definida pelo COPOM a cada 45 dias. Influencia todos os outros juros da economia.", confidence: 0.98, sourceIds: ["Banco Central"], tags: ["selic", "juros", "copom"] },
        { id: "fin-003", type: "fact", label: "Tesouro Direto", content: "Programa do governo federal para venda de titulos publicos a pessoas fisicas. Opcoes: Tesouro Selic, Tesouro IPCA+, Tesouro Prefixado.", confidence: 0.97, sourceIds: ["Tesouro Nacional"], tags: ["tesouro", "titulo-publico", "investimento"] },
        { id: "fin-004", type: "concept", label: "CDB — Certificado de Deposito Bancario", content: "Titulo de renda fixa emitido por bancos. Rentabilidade geralmente atrelada ao CDI (ex: 100% do CDI). Protegido pelo FGC ate R$ 250.000.", confidence: 0.96, sourceIds: ["Banco Central", "CVM"], tags: ["cdb", "renda-fixa", "banco"] },
        { id: "fin-005", type: "concept", label: "FGC — Fundo Garantidor de Creditos", content: "Garante depositos bancarios (conta corrente, poupanca, CDB, LCI, LCA) ate R$ 250.000 por CPF por instituicao, limite de R$ 1.000.000 por CPF.", confidence: 0.97, sourceIds: ["Banco Central"], tags: ["fgc", "seguranca", "garantia"] },
        { id: "fin-006", type: "concept", label: "Acoes", content: "Fracao do capital social de uma empresa negociada na B3. Podem gerar dividendos e valorizacao de capital. Renda variavel — sem garantia de retorno.", confidence: 0.95, sourceIds: ["CVM", "B3"], tags: ["acoes", "bolsa", "renda-variavel"] },
        { id: "fin-007", type: "fact", label: "IR sobre Investimentos", content: "Aliquota de IR varia por tipo: Renda fixa (22,5% a 15% regressivo por prazo), Acoes vendidas acima de R$ 20k/mes (15%), Day trade (20%), Dividendos isentos.", confidence: 0.93, sourceIds: ["Receita Federal"], tags: ["ir", "imposto", "investimento"] },
        { id: "fin-008", type: "concept", label: "Fundo de Investimento", content: "Estrutura coletiva que reune recursos de varios investidores. Gerido por um gestor profissional. Tipos: RF, acoes, multimercado, imobiliario (FII).", confidence: 0.94, sourceIds: ["CVM"], tags: ["fundo", "investimento", "cvm"] },
        { id: "fin-009", type: "rule", label: "Diversificacao de Carteira", content: "Principio de nao concentrar todos os recursos em um unico ativo ou classe. Reduz risco nao-sistematico. Correlacao negativa entre ativos e recomendada.", confidence: 0.90, sourceIds: ["CVM"], tags: ["diversificacao", "risco", "carteira"] },
        { id: "fin-010", type: "concept", label: "IPCA — Indice de Precos ao Consumidor Amplo", content: "Indice oficial de inflacao do Brasil, medido pelo IBGE. Referencia para reajuste de contratos e rentabilidade de investimentos indexados a inflacao.", confidence: 0.98, sourceIds: ["IBGE", "Banco Central"], tags: ["ipca", "inflacao", "indice"] },
      ],
      edges: [
        { id: "e-001", fromId: "fin-002", toId: "fin-001", relation: "related_to", weight: 0.95 },
        { id: "e-002", fromId: "fin-001", toId: "fin-004", relation: "related_to", weight: 0.9 },
        { id: "e-003", fromId: "fin-004", toId: "fin-005", relation: "related_to", weight: 0.8 },
        { id: "e-004", fromId: "fin-003", toId: "fin-002", relation: "depends_on", weight: 0.85 },
        { id: "e-005", fromId: "fin-007", toId: "fin-006", relation: "related_to", weight: 0.8 },
        { id: "e-006", fromId: "fin-008", toId: "fin-009", relation: "related_to", weight: 0.75 },
        { id: "e-007", fromId: "fin-010", toId: "fin-003", relation: "related_to", weight: 0.9 },
      ],
    };
  }
}