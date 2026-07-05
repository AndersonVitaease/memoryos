/**
 * Connector Registry
 *
 * Registro central de todos os conectores do MemoryOS.
 *
 * Princípio arquitetural:
 * - O Core nunca conhece APIs. Apenas intenções humanas.
 * - Os conectores traduzem a linguagem do Core para a linguagem de cada sistema.
 * - O Core aprende padrões de resolução. Os conectores aprendem idiomas.
 *
 * Apenas conectores com `beta: true` estão disponíveis no Beta oficial.
 * Conectores futuros (WhatsApp, Shopify, ERP, etc.) são definidos como arquitetura
 * mas permanecem inativos até serem liberados.
 */

export const CONNECTOR_REGISTRY = [
  {
    id: "gmail",
    name: "Gmail",
    description: "Ler e enviar e-mails através da sua conta Gmail.",
    category: "communication",
    beta: true,
    connected: false,
    intents: ["email", "e-mail", "gmail", "enviar email", "ler email", "caixa de entrada", "inbox"],
    capabilities: ["read_email", "send_email", "search_email"],
    privacyNote:
      "Acessa seus e-mails do Gmail. Permissão: ler e enviar mensagens. Você pode desconectar a qualquer momento.",
  },

  // === CONECTORES FUTUROS (não disponíveis no Beta) ===
  {
    id: "whatsapp",
    name: "WhatsApp",
    description: "Enviar e receber mensagens do WhatsApp.",
    category: "communication",
    beta: false,
    connected: false,
    intents: ["whatsapp", "zap"],
    capabilities: [],
    privacyNote: "",
  },
  {
    id: "googlecalendar",
    name: "Google Agenda",
    description: "Consultar e criar compromissos na sua agenda.",
    category: "productivity",
    beta: false,
    connected: false,
    intents: ["agenda", "calendario", "compromisso", "reunião"],
    capabilities: [],
    privacyNote: "",
  },
  {
    id: "googledrive",
    name: "Google Drive",
    description: "Acessar e gerenciar arquivos no Google Drive.",
    category: "storage",
    beta: false,
    connected: false,
    intents: ["drive", "arquivo no drive"],
    capabilities: [],
    privacyNote: "",
  },
  {
    id: "shopify",
    name: "Shopify",
    description: "Consultar pedidos, produtos e clientes da sua loja.",
    category: "ecommerce",
    beta: false,
    connected: false,
    intents: ["shopify", "pedido da loja"],
    capabilities: [],
    privacyNote: "",
  },
  {
    id: "erp",
    name: "ERP",
    description: "Consultar dados do seu sistema ERP.",
    category: "business",
    beta: false,
    connected: false,
    intents: ["erp", "sistema interno"],
    capabilities: [],
    privacyNote: "",
  },
];

/**
 * Retorna apenas conectores disponíveis no Beta.
 */
export function getBetaConnectors() {
  return CONNECTOR_REGISTRY.filter((c) => c.beta);
}

/**
 * Retorna um conector pelo ID.
 */
export function getConnector(id) {
  return CONNECTOR_REGISTRY.find((c) => c.id === id);
}

/**
 * Encontra o conector apropriado com base na mensagem do usuário.
 * Retorna null se nenhuma intenção de conector for detectada.
 */
export function findConnectorForMessage(message) {
  const normalized = (message || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  for (const connector of CONNECTOR_REGISTRY) {
    if (!connector.beta) continue;
    const matched = connector.intents.some((intent) =>
      normalized.includes(intent.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
    );
    if (matched) return connector;
  }

  return null;
}