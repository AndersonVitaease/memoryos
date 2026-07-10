// ─── Strategy Builder ──────────────────────────────────────────────────────────
// Foundation v1.0 · Deterministically builds a SpecialistStrategy from a contract
// NO generative AI — purely rule-based derivation from specialist metadata

import type { SpecialistContract } from "@/lib/specialist-router/SpecialistTypes";
import type { SpecialistStrategy, StrategyRecommendation } from "./SFETypes";
import { makeSFEId } from "./SFETypes";

// Domain-specific rule tables ─────────────────────────────────────────────────

type RuleEntry = {
  title: string;
  description: string;
  priority: "Critical" | "High" | "Medium" | "Low";
  risk: string;
  justification: string;
};

const DOMAIN_RULES: Record<string, RuleEntry[]> = {
  juridico: [
    { title: "Constituição societária", description: "Definir tipo societário (LTDA, S/A, MEI) conforme atividade e porte.", priority: "Critical", risk: "Escolha inadequada gera responsabilidade civil ilimitada.", justification: "Fundamento legal para todas as demais operações." },
    { title: "Registro em Junta Comercial", description: "Registrar contrato social ou REQUERIMENTO DE EMPRESÁRIO nos órgãos competentes.", priority: "Critical", risk: "Empresa irregular sujeita a multa e interdição.", justification: "Obrigatoriedade legal — art. 967 CC." },
    { title: "Registro de Marca no INPI", description: "Depositar pedido de registro de marca antes de iniciar operações comerciais.", priority: "High", risk: "Uso de marca sem registro expõe a disputas e perda do nome.", justification: "Proteção de ativo intangível." },
    { title: "Contratos com fornecedores", description: "Elaborar contratos padronizados com cláusulas de SLA, confidencialidade e penalidades.", priority: "High", risk: "Ausência de contratos fragiliza posição jurídica.", justification: "Segurança jurídica nas relações comerciais." },
  ],
  contabil: [
    { title: "Abertura de CNPJ", description: "Solicitar CNPJ junto à Receita Federal após registro na Junta.", priority: "Critical", risk: "Sem CNPJ não é possível emitir NF nem abrir conta PJ.", justification: "Obrigação acessória obrigatória." },
    { title: "Escolha do regime tributário", description: "Avaliar Simples Nacional, Lucro Presumido ou Lucro Real conforme faturamento projetado.", priority: "Critical", risk: "Regime inadequado resulta em carga tributária excessiva.", justification: "Impacto direto na margem de lucro." },
    { title: "Escrituração contábil", description: "Implantar sistema de ERP e contratar contador responsável técnico.", priority: "High", risk: "Escrituração inadequada gera autuações fiscais.", justification: "Obrigação legal — NBC TG 1000." },
  ],
  tributario: [
    { title: "Planejamento tributário inicial", description: "Mapear todos os tributos incidentes (PIS, COFINS, ICMS, ISS, IPI) conforme NCM/CNAE.", priority: "Critical", risk: "Não tributação correta gera passivo fiscal.", justification: "Redução legal da carga tributária." },
    { title: "Inscrição Estadual e Municipal", description: "Obter IE (ICMS) e ISS Municipal conforme atividade.", priority: "Critical", risk: "Operação sem inscrições gera multa e restrição de atividade.", justification: "Habilitação para emissão de documentos fiscais." },
    { title: "Monitoramento de obrigações acessórias", description: "Calendário de entrega: SPED, EFD, ECD, DCTF, PGDAS.", priority: "High", risk: "Atraso em obrigações gera multa automática.", justification: "Conformidade fiscal contínua." },
  ],
  financeiro: [
    { title: "Projeção de fluxo de caixa", description: "Elaborar DFC para 12 meses considerando ciclo operacional.", priority: "Critical", risk: "Falta de liquidez compromete continuidade operacional.", justification: "Sustentabilidade financeira." },
    { title: "Estrutura de capital inicial", description: "Definir proporção capital próprio vs. terceiros e necessidade de crédito.", priority: "High", risk: "Endividamento excessivo aumenta custo financeiro.", justification: "Equilíbrio patrimonial." },
    { title: "Abertura de conta bancária PJ", description: "Contratar conta corrente PJ e capital de giro rotativo.", priority: "High", risk: "Mistura de contas PF/PJ viola separação patrimonial.", justification: "Controle financeiro e crédito." },
  ],
  anvisa: [
    { title: "Registro sanitário de produto", description: "Cadastrar ou registrar o produto na ANVISA conforme categoria de risco.", priority: "Critical", risk: "Comercialização sem registro sujeita a interdição e apreensão.", justification: "RDC 27/2010 e RDC 240/2018." },
    { title: "Licença de Funcionamento", description: "Obter AFE (Autorização de Funcionamento de Empresa) para fabricação/importação.", priority: "Critical", risk: "Operação sem AFE é infração sanitária grave.", justification: "Requisito pré-operacional obrigatório." },
    { title: "Boas Práticas de Fabricação", description: "Implantar BPF conforme RDC 658/2022 e realizar auditoria interna pré-operacional.", priority: "High", risk: "Falha em BPF resulta em cancelamento de registro.", justification: "Conformidade regulatória contínua." },
  ],
  comercio_exterior: [
    { title: "Habilitação no SISCOMEX", description: "Habilitar empresa para operar no SISCOMEX via RADAR (Receita Federal).", priority: "Critical", risk: "Sem RADAR não é possível realizar nenhuma operação aduaneira.", justification: "Pré-requisito operacional para importação/exportação." },
    { title: "Classificação NCM correta", description: "Identificar NCM dos produtos para determinar alíquotas e restrições.", priority: "Critical", risk: "NCM errada gera multa aduaneira e retenção de carga.", justification: "Base para toda tributação no comércio exterior." },
    { title: "Due diligence de fornecedor", description: "Verificar fornecedor internacional (BL, packing list, CoA, SIF/FDA).", priority: "High", risk: "Fornecedor sem certificações impede desembaraço.", justification: "Conformidade documental na importação." },
  ],
  rh: [
    { title: "Definição de estrutura de cargos", description: "Elaborar organograma e plano de cargos/salários conforme CCT.", priority: "High", risk: "Estrutura inadequada gera passivo trabalhista.", justification: "Conformidade com CLT e CCT da categoria." },
    { title: "Implantação do eSocial", description: "Cadastrar empresa e realizar transmissão de eventos S-1000, S-2200.", priority: "Critical", risk: "Atraso no eSocial gera multa automática por trabalhador.", justification: "Obrigação legal trabalhista e previdenciária." },
  ],
  compliance: [
    { title: "Programa de Compliance e LGPD", description: "Implantar DPO, mapeamento de dados pessoais e política de privacidade.", priority: "High", risk: "Violação de LGPD sujeita a multa de até 2% faturamento.", justification: "Lei 13.709/2018 — LGPD." },
    { title: "Canal de denúncias", description: "Implantar canal de ética e código de conduta.", priority: "Medium", risk: "Ausência de canal fragiliza governança corporativa.", justification: "Melhores práticas de compliance." },
  ],
  geral: [
    { title: "Análise de viabilidade", description: "Realizar análise de mercado, concorrência e viabilidade econômica.", priority: "High", risk: "Falta de análise leva a decisões sem base factual.", justification: "Embasamento estratégico." },
    { title: "Plano de negócios", description: "Elaborar Business Plan com projeções de 3 anos.", priority: "High", risk: "Sem plano de negócios dificulta captação de recursos.", justification: "Visão integrada do negócio." },
  ],
};

const DOMAIN_LIMITATIONS: Record<string, string[]> = {
  juridico:          ["Não cobre direito tributário específico", "Não substitui pareceres jurídicos formais"],
  contabil:          ["Não cobre tributos estaduais específicos", "Sujeito a mudanças na legislação fiscal"],
  tributario:        ["Alíquotas sujeitas a alterações legais", "Não cobre planejamento de holdings"],
  financeiro:        ["Projeções baseadas em premissas de mercado", "Não garante rentabilidade"],
  anvisa:            ["Prazos de registro sujeitos a fila ANVISA", "Não cobre medicamentos controlados"],
  comercio_exterior: ["Requer despachante aduaneiro habilitado", "Variações cambiais não cobertas"],
  rh:                ["CCT varia por categoria profissional", "Não cobre acidentes de trabalho"],
  compliance:        ["Não substitui auditoria externa formal", "Requer revisão periódica"],
  geral:             ["Cobertura genérica — verificar especialistas específicos"],
};

// ── Builder ────────────────────────────────────────────────────────────────────

export function buildStrategy(specialist: SpecialistContract, goalId: string, goalTitle: string): SpecialistStrategy {
  const rules = DOMAIN_RULES[specialist.domain] ?? DOMAIN_RULES["geral"];
  const limitations = DOMAIN_LIMITATIONS[specialist.domain] ?? DOMAIN_LIMITATIONS["geral"];

  const recommendations: StrategyRecommendation[] = rules.map(r => ({
    id:          makeSFEId("rec"),
    title:       r.title,
    description: r.description,
    priority:    r.priority,
    status:      "Accepted" as const,
  }));

  const risks = rules.map(r => r.risk);
  const justifications = rules.map(r => r.justification);
  const dependencies: string[] = getDomainDependencies(specialist.domain);

  return {
    id:             makeSFEId("strat"),
    specialistId:   specialist.id,
    specialistName: specialist.name,
    domain:         specialist.domain,
    objective:      `Garantir conformidade e excelência na dimensão ${specialist.domain.replace(/_/g," ")} do objetivo: "${goalTitle}"`,
    recommendations,
    justifications,
    risks,
    dependencies,
    limitations,
    confidenceLevel: specialist.confidenceLevel,
    createdAt:      Date.now(),
  };
}

function getDomainDependencies(domain: string): string[] {
  const deps: Record<string, string[]> = {
    contabil:          ["juridico"],
    tributario:        ["juridico", "contabil"],
    financeiro:        ["contabil", "tributario"],
    anvisa:            ["juridico"],
    comercio_exterior: ["juridico", "anvisa"],
    rh:                ["juridico", "contabil"],
    compliance:        ["juridico", "rh"],
    geral:             [],
  };
  return deps[domain] ?? [];
}