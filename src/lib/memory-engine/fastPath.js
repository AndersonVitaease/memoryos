/**
 * Fast Path — Memory Classifier (Sprint 1 · Estabilização)
 *
 * Nível 1 do Decision Pipeline.
 * Resolve mensagens óbvias que NÃO devem gerar memória — sem LLM, sem Rule Engine.
 *
 * Razão de existir:
 *   Evita chamadas desnecessárias ao LLM para saudações, agradecimentos,
 *   despedidas, confirmações, matemática simples e conversa casual.
 *
 * Retorno:
 *   null  → Fast Path não decidiu; passar ao Rule Engine.
 *   objeto → decisão definitiva (shouldRemember = false).
 */

export const FAST_PATH_REASONS = {
  GREETING: "Saudação detectada — não contém informação permanente.",
  FAREWELL: "Despedida detectada — não contém informação permanente.",
  THANKS: "Agradecimento detectado — não contém informação permanente.",
  CASUAL_CHAT: "Conversa casual sem valor futuro.",
  SIMPLE_QUESTION: "Pergunta temporária (matemática ou factual pontual) — sem valor permanente.",
  CONFIRMATION: "Confirmação breve — não contém informação permanente.",
};

// Nota: \b (word boundary) do JavaScript não reconhece caracteres acentuados
// (á, ã, ç, etc.) como \w, então usamos ^...$ com [!.?\s]* no final.
const GREETING_PATTERNS = [
  /^(bom\s+dia|boa\s+tarde|boa\s+noite)[!.?\s]*$/i,
  /^(ol[áa]|ola|oi|hey|hello|hi|eai|e\s+a[ií])[!.?\s]*$/i,
];

const FAREWELL_PATTERNS = [
  /^(tchau|adeus|bye)[!.?\s]*$/i,
  /^(at[ée]\s+mais|at[ée]\s+logo|at[ée]\s+amanh[ãa])[!.?\s]*$/i,
  /^(nos\s+vemos|at[ée]\s+breve)[!.?\s]*$/i,
];

const THANKS_PATTERNS = [
  /^(obrigad[oa]|muito\s+obrigad[oa]|obrigad[oa]\s+pela\s+ajuda|obrigad[oa]\s+pelo\s+apoio)[!.?\s]*$/i,
  /^(valeu|valeu\s+mesmo|vlw|thx|thanks|thank\s+you|agradecid[oa])[!.?\s]*$/i,
];

const CONFIRMATION_PATTERNS = [
  /^(ok|sim|n[ãa]o|ah|eh|hum|mmm|certo|perfeito|entendido|beleza|blz|claro|com\s+certeza)[!.?\s]*$/i,
];

const CASUAL_PATTERNS = [
  /^(conte|conta)\s+(uma\s+)?(piada|jogo|hist[óo]ria)/i,
  /^(qual\s+(é\s+)?o\s+clima|como\s+(est[áa]|t[áa]|vai)\s+(o\s+)?clima)/i,
  /^(qual\s+(é\s+)?a\s+previs[ãa]o)/i,
  /^(como\s+vai\s+voc[êe]|tudo\s+bem|tudo\s+certo)[!.?\s]*$/i,
];

const MATH_PATTERN = /^(quanto\s+(é|e|s[ãa]o|sao)\s+)?[\d\s\+\-\*\/x×÷().,%]+\s*=?\s*\??$/i;

/**
 * Avalia a mensagem no Fast Path.
 * @param {string} message
 * @returns {Object|null} decisão ou null
 */
export function evaluateFastPath(message) {
  const msg = (message || "").trim();
  if (!msg) {
    return _buildFalse("CASUAL_CHAT", "Mensagem vazia.");
  }

  // Padrões são avaliados ANTES do check de tamanho — mensagens curtas
  // como "Olá", "Oi", "Ok", "Blz" são legítimas e devem ser classificadas.
  if (GREETING_PATTERNS.some((p) => p.test(msg))) {
    return _buildFalse("GREETING");
  }
  if (FAREWELL_PATTERNS.some((p) => p.test(msg))) {
    return _buildFalse("FAREWELL");
  }
  if (THANKS_PATTERNS.some((p) => p.test(msg))) {
    return _buildFalse("THANKS");
  }
  if (CONFIRMATION_PATTERNS.some((p) => p.test(msg))) {
    return _buildFalse("CONFIRMATION");
  }
  if (CASUAL_PATTERNS.some((p) => p.test(msg))) {
    return _buildFalse("CASUAL_CHAT");
  }
  if (MATH_PATTERN.test(msg)) {
    return _buildFalse("SIMPLE_QUESTION");
  }

  // Após verificar todos os padrões, mensagens muito curtas sem match
  // são tratadas como conversa casual.
  if (msg.length < 4) {
    return _buildFalse("CASUAL_CHAT", "Mensagem muito curta — sem conteúdo permanente.");
  }

  return null;
}

function _buildFalse(reasonCode, customReason) {
  return {
    shouldRemember: false,
    memoryType: "other",
    confidence: "high",
    reasonCode,
    reason: customReason || FAST_PATH_REASONS[reasonCode] || "Não contém informação permanente.",
    suggestedTitle: "",
    tags: [],
    importance: "low",
  };
}