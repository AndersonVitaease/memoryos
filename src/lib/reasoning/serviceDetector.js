/**
 * Service Layer
 *
 * Camada que define domínios funcionais.
 *
 * Princípio arquitetural da Constituição:
 * - O Core identifica qual Serviço é necessário (ex: Serviço de E-mail).
 * - O Serviço define O QUE precisa ser feito. Nunca COMO.
 * - O Connector Manager verifica qual Conector está disponível para aquele Serviço.
 * - O Conector define COMO será feito (Gmail, Outlook, etc.).
 *
 * O Core nunca pensa em "Gmail" ou "WhatsApp".
 * O Core pensa em "Serviço de E-mail" ou "Serviço de Mensagens".
 */

export const SERVICE_REGISTRY = [
  {
    id: "email",
    name: "Serviço de E-mail",
    description: "Ler, buscar e enviar e-mails.",
    keywords: ["email", "e-mail", "gmail", "enviar email", "ler email", "caixa de entrada", "inbox", "mensagem por email"],
    beta: true,
  },
  {
    id: "agenda",
    name: "Serviço de Agenda",
    description: "Consultar e criar compromissos e reuniões.",
    keywords: ["agenda", "calendario", "compromisso", "reunião", "reuniao", "evento", "agendar"],
    beta: false,
  },
  {
    id: "documents",
    name: "Serviço de Documentos",
    description: "Acessar e gerenciar arquivos em armazenamento na nuvem.",
    keywords: ["drive", "arquivo no drive", "documento na nuvem", "meus arquivos no drive"],
    beta: false,
  },
  {
    id: "messages",
    name: "Serviço de Mensagens",
    description: "Enviar e receber mensagens instantâneas.",
    keywords: ["whatsapp", "zap", "mensagem", "mensagens", "enviar mensagem"],
    beta: false,
  },
  {
    id: "commerce",
    name: "Serviço de Comércio",
    description: "Consultar pedidos, produtos e clientes.",
    keywords: ["shopify", "pedido da loja", "vendas da loja", "produtos da loja"],
    beta: false,
  },
  {
    id: "travel",
    name: "Serviço de Turismo",
    description: "Pesquisar voos, hotéis e pacotes de viagem.",
    keywords: ["viagem", "passagem", "hotel", "voo", "reserva de hotel", "pacote de viagem"],
    beta: false,
  },
  {
    id: "finance",
    name: "Serviço Financeiro",
    description: "Consultar transações, saldos e faturas.",
    keywords: ["banco", "fatura", "saldo bancario", "transação bancaria", "conta bancaria"],
    beta: false,
  },
  {
    id: "erp",
    name: "Serviço de ERP",
    description: "Consultar dados de sistemas de gestão interna.",
    keywords: ["erp", "sistema interno", "dados do sistema"],
    beta: false,
  },
];

function normalize(text) {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Detecta qual Serviço é necessário com base na mensagem do usuário.
 *
 * Etapa 5 do Processo de Raciocínio:
 * "Determinar quais Serviços serão utilizados."
 *
 * @param {string} message - Mensagem do usuário
 * @returns {Object|null} - Serviço identificado ou null se nenhum for necessário
 */
export function detectService(message) {
  const normalized = normalize(message);

  for (const service of SERVICE_REGISTRY) {
    const matched = service.keywords.some((kw) =>
      normalized.includes(normalize(kw))
    );
    if (matched) return service;
  }

  return null;
}

/**
 * Retorna apenas serviços disponíveis no Beta.
 */
export function getBetaServices() {
  return SERVICE_REGISTRY.filter((s) => s.beta);
}

/**
 * Retorna um serviço pelo ID.
 */
export function getService(id) {
  return SERVICE_REGISTRY.find((s) => s.id === id);
}