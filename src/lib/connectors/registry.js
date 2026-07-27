import { isConnected } from "@/lib/google-auth/GoogleAuthSession";

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
    service: "email",
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
    service: "messages",
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
    service: "agenda",
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
    service: "documents",
    description: "Acessar e gerenciar arquivos no Google Drive.",
    category: "storage",
    // IA-011: estava false — excluía o Drive de getConnectorsForService(), que
    // filtra por beta===true, fazendo o Core acreditar que "nenhum conector
    // está instalado" para o Drive, mesmo ele funcionando em produção.
    beta: true,
    connected: false,
    intents: ["drive", "arquivo no drive"],
    capabilities: [],
    privacyNote: "",
  },
  {
    id: "shopify",
    name: "Shopify",
    service: "commerce",
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
    service: "erp",
    description: "Consultar dados do seu sistema ERP.",
    category: "business",
    beta: false,
    connected: false,
    intents: ["erp", "sistema interno"],
    capabilities: [],
    privacyNote: "",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    service: "ai",
    description: "Traduz, resume, gera código e processa texto usando modelos de IA especializados via OpenRouter.",
    category: "ai",
    beta: true,
    connected: true,
    intents: ["traduzir", "resumir", "gerar codigo", "transcrever", "modelo de ia"],
    capabilities: ["chat_completion", "list_models"],
    privacyNote: "Envia o texto da sua mensagem para processamento por modelos de IA de terceiros via OpenRouter. Nenhum dado é armazenado pelo OpenRouter além do necessário para gerar a resposta.",
  },
];

// IA-011: conectores Google cujo status real pode ser checado via GoogleAuthSession.
// Os demais (whatsapp, shopify, erp) não têm mecanismo de autenticação implementado
// ainda — para esses, connected:false continua correto, não é bug.
const _GOOGLE_AUTH_CONNECTOR_IDS = new Set(["gmail", "googlecalendar", "googledrive"]);

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
 * Encontra conectores disponíveis para um Serviço específico.
 * Usado pelo Connector Manager (Etapa 6 do Processo de Raciocínio).
 *
 * IA-011: connected agora reflete o estado real de autenticação (via
 * GoogleAuthSession.isConnected) para conectores Google, em vez do
 * valor fixo `false` que estava hardcoded no registro.
 */
export function getConnectorsForService(serviceId) {
  return CONNECTOR_REGISTRY
    .filter((c) => c.service === serviceId && c.beta)
    .map((c) => _GOOGLE_AUTH_CONNECTOR_IDS.has(c.id)
      ? { ...c, connected: isConnected("default") }
      : c
    );
}
