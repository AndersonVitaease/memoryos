/**
 * LegalPackage.ts — P6 Official Knowledge Package
 * Domain: legal — Brazilian civil, labor, and consumer law concepts.
 * Extends BaseKnowledgePackage.
 * P6 · Version: 1.0.0
 */

import { BaseKnowledgePackage } from "@/sdk/knowledge/BaseKnowledgePackage";
import { KnowledgePackageBuilder } from "@/sdk/knowledge/KnowledgePackageBuilder";
import type { KnowledgePackageContent } from "@/sdk/knowledge/IKnowledgePackage";

const MANIFEST = new KnowledgePackageBuilder(
  "com.memoryos.legal",
  "1.0.0",
  "Legal Package",
  "legal",
)
  .setAuthor("MemoryOS")
  .setLicense("CC-BY-4.0")
  .setLanguage("pt-BR")
  .addSource({ name: "CLT - Consolidacao das Leis do Trabalho", date: "2023-01-01", type: "law" })
  .addSource({ name: "Codigo Civil Brasileiro - Lei 10406/2002", date: "2023-01-01", type: "law" })
  .addSource({ name: "CDC - Codigo de Defesa do Consumidor - Lei 8078/1990", date: "2023-01-01", type: "law" })
  .addSource({ name: "Constituicao Federal de 1988", date: "2023-01-01", type: "law" })
  .build();

export class LegalPackage extends BaseKnowledgePackage {
  constructor() {
    super(MANIFEST);
  }

  content(): KnowledgePackageContent {
    return {
      nodes: [
        { id: "leg-001", type: "rule", label: "Aviso Previo", content: "O empregador deve comunicar a demissao com antecedencia minima de 30 dias (+ 3 dias por ano trabalhado, limitado a 90 dias). Pode ser indenizado.", confidence: 0.96, sourceIds: ["CLT Art. 487"], tags: ["trabalhista", "demissao", "aviso-previo"] },
        { id: "leg-002", type: "rule", label: "Ferias Anuais", content: "Todo empregado tem direito a 30 dias de ferias apos 12 meses de trabalho (periodo aquisitivo). Podem ser fracionadas em ate 3 periodos.", confidence: 0.97, sourceIds: ["CLT Art. 129-133"], tags: ["ferias", "trabalhista", "direito"] },
        { id: "leg-003", type: "rule", label: "13o Salario", content: "Gratificacao natalina obrigatoria, equivalente a 1 salario mensal, paga em duas parcelas: primeira ate 30/11 e segunda ate 20/12.", confidence: 0.97, sourceIds: ["Lei 4090/1962"], tags: ["13-salario", "trabalhista", "gratificacao"] },
        { id: "leg-004", type: "rule", label: "Direitos do Consumidor — Arrependimento", content: "Compras fora do estabelecimento comercial (internet, telefone): direito de desistencia em 7 dias a partir do recebimento do produto, sem necessidade de justificativa.", confidence: 0.96, sourceIds: ["CDC Art. 49"], tags: ["consumidor", "cdc", "arrependimento", "internet"] },
        { id: "leg-005", type: "rule", label: "Garantia Legal", content: "CDC garante 30 dias para produtos nao-duraveis e 90 dias para produtos duraveis contra vicios. Independente da garantia contratual.", confidence: 0.96, sourceIds: ["CDC Art. 26"], tags: ["garantia", "cdc", "produto", "vicio"] },
        { id: "leg-006", type: "concept", label: "Contrato de Trabalho", content: "Acordo tacito ou expresso entre empregado e empregador. Pode ser por prazo determinado (maximo 2 anos) ou indeterminado. Elementos: pessoalidade, subordinacao, onerosidade, nao-eventualidade.", confidence: 0.95, sourceIds: ["CLT Art. 442-443"], tags: ["contrato", "trabalhista", "emprego"] },
        { id: "leg-007", type: "rule", label: "FGTS — Multa por Dispensa Sem Justa Causa", content: "Empregador deve depositar mensalmente 8% do salario no FGTS. Em dispensa sem justa causa, paga multa de 40% sobre o saldo total do FGTS.", confidence: 0.96, sourceIds: ["Lei 8036/1990"], tags: ["fgts", "demissao", "multa"] },
        { id: "leg-008", type: "concept", label: "Usucapiao", content: "Aquisicao de propriedade pelo exercicio continuo e pacifico da posse por determinado periodo. Tipos: ordinaria (10 anos), extraordinaria (15 anos), especial urbana (5 anos).", confidence: 0.90, sourceIds: ["Codigo Civil Art. 1238-1244"], tags: ["usucapiao", "propriedade", "civil"] },
        { id: "leg-009", type: "rule", label: "Responsabilidade Civil", content: "Obrigacao de reparar dano causado a outrem. Elementos: acao/omissao, culpa/dolo, nexo causal e dano. Responsabilidade objetiva independe de culpa.", confidence: 0.93, sourceIds: ["Codigo Civil Art. 186-188, 927"], tags: ["responsabilidade", "indenizacao", "dano"] },
        { id: "leg-010", type: "rule", label: "Prazo Prescricional — Trabalhista", content: "Acoes trabalhistas: 2 anos apos a extincao do contrato para ingressar na Justica do Trabalho, com retroatividade de 5 anos.", confidence: 0.94, sourceIds: ["CF Art. 7, XXIX", "CLT"], tags: ["prescricao", "trabalhista", "prazo"] },
      ],
      edges: [
        { id: "e-001", fromId: "leg-001", toId: "leg-006", relation: "related_to", weight: 0.9 },
        { id: "e-002", fromId: "leg-002", toId: "leg-006", relation: "related_to", weight: 0.9 },
        { id: "e-003", fromId: "leg-003", toId: "leg-006", relation: "related_to", weight: 0.9 },
        { id: "e-004", fromId: "leg-007", toId: "leg-001", relation: "related_to", weight: 0.85 },
        { id: "e-005", fromId: "leg-004", toId: "leg-005", relation: "related_to", weight: 0.8 },
        { id: "e-006", fromId: "leg-010", toId: "leg-006", relation: "related_to", weight: 0.8 },
      ],
    };
  }
}