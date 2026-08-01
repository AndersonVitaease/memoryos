/**
 * BrazilianGovernmentPackage.ts — P6 Official Knowledge Package
 * Domain: government — Brazilian federal government services, agencies, and procedures.
 * Extends BaseKnowledgePackage.
 * P6 · Version: 1.0.0
 */

import { BaseKnowledgePackage } from "@/sdk/knowledge/BaseKnowledgePackage";
import { KnowledgePackageBuilder } from "@/sdk/knowledge/KnowledgePackageBuilder";
import type { KnowledgePackageContent } from "@/sdk/knowledge/IKnowledgePackage";

const MANIFEST = new KnowledgePackageBuilder(
  "com.memoryos.brazilian-government",
  "1.0.0",
  "Brazilian Government Package",
  "government",
)
  .setAuthor("MemoryOS")
  .setLicense("CC-BY-4.0")
  .setLanguage("pt-BR")
  .addSource({ name: "Portal Gov.br", url: "https://www.gov.br", date: "2024-01-01", type: "standard" })
  .addSource({ name: "Receita Federal do Brasil", url: "https://www.gov.br/receitafederal", date: "2024-01-01", type: "regulation" })
  .addSource({ name: "INSS - Instituto Nacional do Seguro Social", url: "https://www.gov.br/inss", date: "2024-01-01", type: "regulation" })
  .addSource({ name: "Ministerio da Economia", url: "https://www.gov.br/economia", date: "2024-01-01", type: "regulation" })
  .build();

export class BrazilianGovernmentPackage extends BaseKnowledgePackage {
  constructor() {
    super(MANIFEST);
  }

  content(): KnowledgePackageContent {
    return {
      nodes: [
        { id: "gov-001", type: "concept", label: "CPF", content: "Cadastro de Pessoas Fisicas — documento fiscal obrigatorio para todos os cidadaos brasileiros. Emitido pela Receita Federal.", confidence: 0.99, sourceIds: ["Receita Federal"], tags: ["documento", "fiscal", "cpf"] },
        { id: "gov-002", type: "concept", label: "CNPJ", content: "Cadastro Nacional da Pessoa Juridica — registro obrigatorio para empresas no Brasil. Emitido pela Receita Federal.", confidence: 0.99, sourceIds: ["Receita Federal"], tags: ["empresa", "fiscal", "cnpj"] },
        { id: "gov-003", type: "fact", label: "INSS — Beneficios", content: "O INSS (Instituto Nacional do Seguro Social) administra aposentadorias, auxilio-doenca, salario-maternidade e pensao por morte.", confidence: 0.97, sourceIds: ["INSS"], tags: ["previdencia", "inss", "aposentadoria"] },
        { id: "gov-004", type: "fact", label: "IR — Imposto de Renda Pessoa Fisica", content: "Declaracao obrigatoria anual para contribuintes que receberam rendimentos acima do limite legal. Prazo geralmente em abril do ano seguinte.", confidence: 0.95, sourceIds: ["Receita Federal"], tags: ["imposto", "irpf", "declaracao"] },
        { id: "gov-005", type: "fact", label: "MEI — Microempreendedor Individual", content: "Modalidade simplificada para formalizacao de autonomos. Faturamento anual limitado a R$ 81.000. Pagamento mensal via DAS.", confidence: 0.96, sourceIds: ["Receita Federal", "Portal Gov.br"], tags: ["mei", "empresa", "autonomo"] },
        { id: "gov-006", type: "concept", label: "Simples Nacional", content: "Regime tributario simplificado para micro e pequenas empresas. Reune varios impostos em uma unica guia (DAS).", confidence: 0.95, sourceIds: ["Receita Federal"], tags: ["simples", "tributario", "pme"] },
        { id: "gov-007", type: "fact", label: "FGTS — Fundo de Garantia", content: "Deposito mensal obrigatorio pelo empregador (8% do salario). O trabalhador pode sacar em casos como demissao sem justa causa, aposentadoria e compra de imovel.", confidence: 0.97, sourceIds: ["Ministerio da Economia", "CEF"], tags: ["fgts", "trabalhista", "beneficio"] },
        { id: "gov-008", type: "rule", label: "Nota Fiscal Eletronica (NF-e)", content: "Obrigatoria para empresas que realizam operacoes de compra e venda de mercadorias. Emitida via SEFAZ estadual.", confidence: 0.94, sourceIds: ["Receita Federal", "SEFAZ"], tags: ["nfe", "fiscal", "empresa"] },
        { id: "gov-009", type: "concept", label: "e-CAC — Centro Virtual de Atendimento", content: "Portal da Receita Federal para servicos digitais: consulta CPF/CNPJ, extrato de IR, parcelamento de debitos, entre outros.", confidence: 0.96, sourceIds: ["Receita Federal"], tags: ["ecac", "receita", "servico-digital"] },
        { id: "gov-010", type: "fact", label: "Carteira de Trabalho Digital (CTPS)", content: "Documento trabalhista disponivel no aplicativo Carteira de Trabalho Digital (gov.br). Registro de vinculos empregaticos e remuneracoes.", confidence: 0.95, sourceIds: ["Ministerio da Economia"], tags: ["ctps", "trabalhista", "emprego"] },
      ],
      edges: [
        { id: "e-001", fromId: "gov-001", toId: "gov-004", relation: "related_to", weight: 0.8 },
        { id: "e-002", fromId: "gov-002", toId: "gov-006", relation: "related_to", weight: 0.9 },
        { id: "e-003", fromId: "gov-002", toId: "gov-005", relation: "related_to", weight: 0.9 },
        { id: "e-004", fromId: "gov-003", toId: "gov-010", relation: "related_to", weight: 0.7 },
        { id: "e-005", fromId: "gov-006", toId: "gov-005", relation: "extends", weight: 0.6 },
      ],
    };
  }
}