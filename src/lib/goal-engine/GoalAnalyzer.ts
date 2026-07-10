// ─── Goal Analyzer ─────────────────────────────────────────────────────────────
// Foundation v1.0 · Interpreta intenção via regras estruturadas (sem IA externa)

import type { AnalysisResult, GoalComplexity } from "./GoalTypes";

// ── Intent pattern library ────────────────────────────────────────────────────

interface IntentPattern {
  keywords: string[];
  title: string;
  primaryObjective: string;
  secondaryObjectives: string[];
  constraints: string[];
  assumptions: string[];
  requiredInformation: string[];
  requiredDocuments: string[];
  acceptanceCriteria: string[];
  complexity: GoalComplexity;
  duration: string;
  confidence: number;
}

const PATTERNS: IntentPattern[] = [
  {
    keywords: ["abrir empresa", "abrir uma empresa", "criar empresa", "constituir empresa", "registrar empresa"],
    title: "Abertura de Empresa",
    primaryObjective: "Constituir e registrar uma pessoa jurídica no Brasil",
    secondaryObjectives: ["Obter CNPJ", "Registrar na Junta Comercial", "Habilitar atividades fiscais"],
    constraints: ["Conformidade com legislação brasileira", "Capital social mínimo definido por tipo societário"],
    assumptions: ["Sócios identificados", "Endereço comercial disponível"],
    requiredInformation: ["Tipo societário (MEI, LTDA, S/A)", "Ramo de atividade (CNAE)", "Endereço sede", "Sócios e participação"],
    requiredDocuments: ["RG/CPF dos sócios", "Comprovante de endereço", "Contrato social ou DASN"],
    acceptanceCriteria: ["CNPJ ativo emitido", "Empresa registrada na Junta Comercial", "Alvará de funcionamento obtido"],
    complexity: "Complex",
    duration: "15-30 dias",
    confidence: 0.92,
  },
  {
    keywords: ["nota fiscal", "emitir nota", "nfe", "nf-e", "emissão de nota"],
    title: "Emissão de Nota Fiscal",
    primaryObjective: "Emitir documento fiscal válido para operação comercial",
    secondaryObjectives: ["Validar CNPJ emissor", "Configurar série e numeração", "Transmitir à SEFAZ"],
    constraints: ["Empresa com certificado digital A1/A3", "Ativa no cadastro estadual"],
    assumptions: ["CNPJ já emitido", "Sistema ERP ou portal disponível"],
    requiredInformation: ["CNPJ emissor", "CNPJ/CPF destinatário", "Itens e valores", "CFOP"],
    requiredDocuments: ["Certificado digital", "Dados do destinatário", "Descrição dos produtos/serviços"],
    acceptanceCriteria: ["NF-e transmitida e autorizada pela SEFAZ", "XML gerado e armazenado", "DANFE disponível"],
    complexity: "Moderate",
    duration: "1-2 dias",
    confidence: 0.90,
  },
  {
    keywords: ["consultar cpf", "verificar cpf", "situação cpf", "cpf regular", "cpf irregular"],
    title: "Consulta de CPF",
    primaryObjective: "Verificar situação cadastral do CPF junto à Receita Federal",
    secondaryObjectives: ["Identificar pendências", "Regularizar se necessário"],
    constraints: ["Dados pessoais protegidos pela LGPD"],
    assumptions: ["Número de CPF disponível"],
    requiredInformation: ["Número de CPF", "Data de nascimento"],
    requiredDocuments: ["Documento com CPF"],
    acceptanceCriteria: ["Situação cadastral consultada", "Comprovante de situação emitido"],
    complexity: "Simple",
    duration: "Imediato",
    confidence: 0.95,
  },
  {
    keywords: ["registrar marca", "registro de marca", "proteger marca", "inpi", "propriedade intelectual"],
    title: "Registro de Marca",
    primaryObjective: "Registrar marca junto ao INPI para proteção da propriedade intelectual",
    secondaryObjectives: ["Pesquisa de anterioridade", "Depósito do pedido", "Acompanhamento do processo"],
    constraints: ["Prazo de vigência de 10 anos renovável", "Classificação de Nice aplicável"],
    assumptions: ["Marca ainda não registrada por terceiros", "Empresa ou CPF com cadastro no INPI"],
    requiredInformation: ["Nome/logotipo da marca", "Classe de Nice", "Titular (CPF/CNPJ)", "Especificação de produtos/serviços"],
    requiredDocuments: ["Comprovante de pagamento GRU", "Representação gráfica da marca", "Procuração (se via advogado)"],
    acceptanceCriteria: ["Pedido de registro depositado no INPI", "Número de processo emitido", "Publicação na RPI"],
    complexity: "Complex",
    duration: "18-24 meses",
    confidence: 0.88,
  },
  {
    keywords: ["importar suplemento", "importação de suplemento", "importar produto", "importação"],
    title: "Importação de Suplemento",
    primaryObjective: "Realizar importação de suplemento alimentar em conformidade com regulamentação brasileira",
    secondaryObjectives: ["Obter licença ANVISA", "Desembaraço aduaneiro", "Regularizar CNPJ importador"],
    constraints: ["Regularização obrigatória na ANVISA", "Licença de importação no SISCOMEX", "Conformidade com RDC ANVISA"],
    assumptions: ["Empresa com CNPJ ativo e habilitada para importação", "Fornecedor internacional identificado"],
    requiredInformation: ["País de origem", "NCM do produto", "Quantidade e valor", "Fornecedor internacional"],
    requiredDocuments: ["LI (Licença de Importação)", "Invoice comercial", "Packing list", "Laudo técnico ANVISA", "Certificate of Analysis"],
    acceptanceCriteria: ["LI aprovada no SISCOMEX", "Produto regularizado na ANVISA", "Desembaraço aduaneiro concluído"],
    complexity: "Critical",
    duration: "60-180 dias",
    confidence: 0.85,
  },
  {
    keywords: ["declarar imposto", "imposto de renda", "irpf", "declaração", "restituição"],
    title: "Declaração de Imposto de Renda",
    primaryObjective: "Elaborar e transmitir declaração IRPF à Receita Federal",
    secondaryObjectives: ["Levantar rendimentos", "Identificar deduções", "Calcular imposto a pagar/restituir"],
    constraints: ["Prazo anual de entrega (geralmente abril)", "Obrigatoriedade por critério de renda"],
    assumptions: ["Contribuinte com CPF ativo", "Dados de rendimentos disponíveis"],
    requiredInformation: ["Rendimentos do ano-base", "Dependentes", "Despesas dedutíveis", "Bens e direitos"],
    requiredDocuments: ["Informe de rendimentos (empregadores/bancos)", "Recibos de plano de saúde", "Comprovantes de doações"],
    acceptanceCriteria: ["Declaração transmitida e recibo de entrega emitido", "Sem pendências na malha fina"],
    complexity: "Moderate",
    duration: "1-5 dias",
    confidence: 0.91,
  },
  {
    keywords: ["alvará", "alvará de funcionamento", "licença municipal", "licença de funcionamento"],
    title: "Obtenção de Alvará de Funcionamento",
    primaryObjective: "Obter alvará de funcionamento para estabelecimento comercial junto à prefeitura",
    secondaryObjectives: ["Vistoria do Corpo de Bombeiros", "Aprovação de projeto arquitetônico", "Licença sanitária (se aplicável)"],
    constraints: ["Zoneamento urbano compatível com a atividade", "Conformidade com normas municipais"],
    assumptions: ["CNPJ ativo", "Imóvel com documentação regular"],
    requiredInformation: ["Endereço do estabelecimento", "Tipo de atividade", "Área do imóvel"],
    requiredDocuments: ["Contrato social", "CNPJ", "Habite-se ou Auto de Conclusão", "AVCB do Corpo de Bombeiros"],
    acceptanceCriteria: ["Alvará emitido pela prefeitura", "Número de alvará afixado no estabelecimento"],
    complexity: "Moderate",
    duration: "7-30 dias",
    confidence: 0.87,
  },
];

// ── Generic fallback ──────────────────────────────────────────────────────────

function genericAnalysis(intent: string): AnalysisResult {
  const words = intent.trim().split(/\s+/).length;
  return {
    primaryObjective:    `Realizar: ${intent.trim()}`,
    secondaryObjectives: [],
    constraints:         ["Conformidade com regulamentação aplicável"],
    assumptions:         ["Informações necessárias serão fornecidas pelo usuário"],
    requiredInformation: ["Detalhes específicos do objetivo", "Prazo desejado", "Recursos disponíveis"],
    requiredDocuments:   ["Documentação específica a ser levantada"],
    acceptanceCriteria:  ["Objetivo principal atingido com sucesso"],
    estimatedComplexity: words <= 5 ? "Simple" : words <= 10 ? "Moderate" : "Complex",
    estimatedDuration:   "A definir",
    confidenceScore:     0.45,
    suggestedTitle:      intent.length > 50 ? intent.substring(0, 50) + "…" : intent,
    needsClarification:  true,
    clarificationQuestions: [
      "Qual é o resultado esperado desta ação?",
      "Há prazo específico para conclusão?",
      "Quais recursos (documentos, sistemas) já estão disponíveis?",
    ],
  };
}

// ── Analyzer public API ───────────────────────────────────────────────────────

export function analyzeIntent(userIntent: string): AnalysisResult {
  const normalized = userIntent.toLowerCase().trim();

  for (const pattern of PATTERNS) {
    const matched = pattern.keywords.some(kw => normalized.includes(kw));
    if (matched) {
      return {
        primaryObjective:    pattern.primaryObjective,
        secondaryObjectives: pattern.secondaryObjectives,
        constraints:         pattern.constraints,
        assumptions:         pattern.assumptions,
        requiredInformation: pattern.requiredInformation,
        requiredDocuments:   pattern.requiredDocuments,
        acceptanceCriteria:  pattern.acceptanceCriteria,
        estimatedComplexity: pattern.complexity,
        estimatedDuration:   pattern.duration,
        confidenceScore:     pattern.confidence,
        suggestedTitle:      pattern.title,
        needsClarification:  pattern.confidence < 0.70,
        clarificationQuestions: pattern.confidence < 0.70
          ? ["Poderia fornecer mais detalhes sobre sua intenção?"]
          : [],
      };
    }
  }

  return genericAnalysis(userIntent);
}