/**
 * NaturalLanguageGoalNormalizer.ts — Engineering Sprint E-02.7
 * Natural Language Normalization for Connector Goals
 *
 * SRP: receber mensagem em linguagem natural e extrair a entidade
 *      principal de busca, removendo todo ruído gramatical.
 *
 * Garantias:
 * - NAO executa nada
 * - NAO chama connectors
 * - NAO acessa APIs
 * - NAO modifica qualquer camada arquitetural
 * - Puro: determinístico para a mesma entrada
 *
 * Resultado: { entity, normalized, isEmailQuery, isSocialPhrase }
 *
 * Exemplos:
 *   "Tenho algum email da Shopee?"   → entity="Shopee"
 *   "Existe algum PIX?"              → entity="Pix"
 *   "Recebi alguma nota fiscal?"     → entity="Nota Fiscal"
 *   "Shopee"                         → entity="Shopee"
 *   "Olá, tudo bem?"                 → isSocialPhrase=true
 */

// ── Known entities (canonical form + aliases for matching) ───────────────────
// Used for canonical casing after normalization.

const KNOWN_ENTITIES: Array<{ canonical: string; signals: string[] }> = [
  // Brands
  { canonical: "Shopee",        signals: ["shopee"] },
  { canonical: "Amazon",        signals: ["amazon"] },
  { canonical: "Hostinger",     signals: ["hostinger"] },
  { canonical: "Mercado Livre", signals: ["mercado livre", "mercadolivre"] },
  { canonical: "Mercado Pago",  signals: ["mercado pago", "mercadopago"] },
  { canonical: "Google",        signals: ["google"] },
  { canonical: "Meta",          signals: ["meta"] },
  { canonical: "Facebook",      signals: ["facebook"] },
  { canonical: "Instagram",     signals: ["instagram"] },
  { canonical: "WhatsApp",      signals: ["whatsapp"] },
  { canonical: "TikTok",        signals: ["tiktok"] },
  { canonical: "PayPal",        signals: ["paypal"] },
  { canonical: "Shopify",       signals: ["shopify"] },
  { canonical: "GitHub",        signals: ["github"] },
  { canonical: "Netflix",       signals: ["netflix"] },
  { canonical: "Spotify",       signals: ["spotify"] },
  { canonical: "LinkedIn",      signals: ["linkedin"] },
  { canonical: "Nubank",        signals: ["nubank"] },
  { canonical: "Itaú",          signals: ["itau", "itaú"] },
  { canonical: "Bradesco",      signals: ["bradesco"] },
  { canonical: "iFood",         signals: ["ifood"] },
  { canonical: "Correios",      signals: ["correios"] },
  // Documents / financial
  { canonical: "Nota Fiscal",   signals: ["nota fiscal", "nf", "nfe"] },
  { canonical: "DANFE",         signals: ["danfe"] },
  { canonical: "DARF",          signals: ["darf"] },
  { canonical: "Boleto",        signals: ["boleto", "boletos"] },
  { canonical: "Fatura",        signals: ["fatura", "faturas"] },
  { canonical: "Contrato",      signals: ["contrato", "contratos"] },
  { canonical: "Pix",           signals: ["pix"] },
  { canonical: "Pagamento",     signals: ["pagamento", "pagamentos"] },
  { canonical: "Pedido",        signals: ["pedido", "pedidos"] },
  { canonical: "Entrega",       signals: ["entrega", "entregas"] },
  { canonical: "Calendário",    signals: ["calendario", "calendário"] },
  { canonical: "Reunião",       signals: ["reuniao", "reuniões", "reunião"] },
];

// ── Noise patterns to remove before entity extraction ────────────────────────
// Order matters: remove phrases first, then individual words.

const NOISE_PATTERNS: RegExp[] = [
  // Question starters / inquiry phrases
  /\b(tenho algum[a]?|tem algum[a]?|existe algum[a]?|há algum[a]?|existe[m]?|há|tem|tenho)\b/gi,
  /\b(recebi algum[a]?|recebeu algum[a]?|recebi|recebeu|receber)\b/gi,
  /\b(pode (me )?(localizar|encontrar|buscar|mostrar|listar))\b/gi,
  /\b(consegue (me )?(encontrar|buscar|localizar|mostrar))\b/gi,
  /\b(quero (ver|visualizar|listar|mostrar))\b/gi,
  /\b(me (mostra|mostre|lista|liste|busca|busque|procura|procure|encontra|encontre))\b/gi,
  // Action verbs (single)
  /\b(procure?|procurar?|busque?|buscar?|pesquise?|pesquisar?|encontre?|encontrar?)\b/gi,
  /\b(mostre?|mostrar?|liste?|listar?|veja|ver|visualizar?|exibir?)\b/gi,
  /\b(abra?|abrir?|crie?|criar?|agende?|agendar?|envie?|enviar?)\b/gi,
  /\b(cheque?|checar?|verificar?|confirmar?)\b/gi,
  // Email/message nouns
  /\b(e-?mails?|mensagens?|messages?|inbox)\b/gi,
  // Prepositions / articles
  /\b(algum[a]?|algun[s]?|nenhum[a]?|todos?|todas?)\b/gi,
  /\b(da[s]?|do[s]?|de[s]?|no[s]?|na[s]?|sobre|para|com|por|um[a]?|o[s]?|a[s]?)\b/gi,
  // Punctuation
  /[?!.,;:]/g,
];

// ── Social phrases that should NOT be treated as entity searches ──────────────

const SOCIAL_PHRASES: string[] = [
  "ola", "olá", "oi", "hi", "hello",
  "bom dia", "boa tarde", "boa noite",
  "obrigado", "obrigada", "valeu", "vlw",
  "tudo bem", "tudo bom", "como vai", "como esta",
  "tchau", "ate logo", "até logo",
  "quem e voce", "quem é você",
  "conte uma piada", "me conta uma piada",
  "ok", "certo", "entendido", "blz",
  "pode ser", "sim", "nao", "não",
];

// ── NormalizationResult ───────────────────────────────────────────────────────

export interface NormalizationResult {
  /** The extracted canonical entity (e.g. "Shopee", "Nota Fiscal") */
  readonly entity:         string;
  /** The stripped/lowercased intermediate form */
  readonly normalized:     string;
  /** True when the message is clearly an email-related query */
  readonly isEmailQuery:   boolean;
  /** True when the message is a social/greeting phrase — do not dispatch */
  readonly isSocialPhrase: boolean;
  /** True when a canonical casing was found in KNOWN_ENTITIES */
  readonly isKnownEntity:  boolean;
}

// ── Core normalizer ───────────────────────────────────────────────────────────

export function normalize(message: string): NormalizationResult {
  const trimmed = message.trim();
  const lower   = trimmed.toLowerCase().replace(/[?!.,;:]/g, "").trim();

  // ── Social check ────────────────────────────────────────────────────────────
  const isSocialPhrase = SOCIAL_PHRASES.some(
    (s) => lower === s || lower.startsWith(s + " ") || lower.endsWith(" " + s)
  );

  if (isSocialPhrase) {
    return Object.freeze({
      entity: trimmed, normalized: lower, isEmailQuery: false, isSocialPhrase: true, isKnownEntity: false,
    });
  }

  // ── Email query detection ────────────────────────────────────────────────────
  const isEmailQuery = /\b(email|e-?mail|mensagem|inbox|caixa)\b/i.test(trimmed);

  // ── Strip noise ──────────────────────────────────────────────────────────────
  let stripped = trimmed;
  for (const pattern of NOISE_PATTERNS) {
    stripped = stripped.replace(pattern, " ");
  }
  stripped = stripped.replace(/\s{2,}/g, " ").trim();

  const normalizedLower = stripped.toLowerCase();

  // ── Known entity canonical casing ────────────────────────────────────────────
  // Sort by signal length desc so "mercado livre" matches before "mercado"
  const sorted = [...KNOWN_ENTITIES].sort(
    (a, b) => Math.max(...b.signals.map((s) => s.length)) - Math.max(...a.signals.map((s) => s.length))
  );

  // Sprint 1 (correção do antipadrão): `stripped` já é a forma correta da
  // entidade — pode ser "" quando a mensagem inteira era ruído gramatical
  // (verbo de comando sozinho, pontuação, etc). NÃO cair de volta para
  // `trimmed` (a mensagem bruta) nesse caso — isso fazia o próprio verbo
  // de comando virar "entidade extraída". O contrato público continua
  // `entity: string` (nunca null/undefined) — apenas passa a poder ser
  // uma string vazia, que os consumidores existentes já tratam
  // corretamente via `.trim()` truthy-check.
  let entity        = stripped;
  let isKnownEntity = false;

  for (const ke of sorted) {
    if (ke.signals.some((s) => normalizedLower.includes(s))) {
      entity        = ke.canonical;
      isKnownEntity = true;
      break;
    }
  }

  return Object.freeze({
    entity,
    normalized:     normalizedLower,
    isEmailQuery,
    isSocialPhrase: false,
    isKnownEntity,
  });
}

// ── Test suite ────────────────────────────────────────────────────────────────

export interface NormalizationTest {
  input:          string;
  expectedEntity: string;
  passed:         boolean;
  actualEntity:   string;
  error:          string | null;
}

const TEST_CASES: Array<{ input: string; expected: string }> = [
  // Bare entities
  { input: "Shopee",                               expected: "Shopee" },
  { input: "Hostinger",                            expected: "Hostinger" },
  { input: "Amazon",                               expected: "Amazon" },
  { input: "Mercado Livre",                        expected: "Mercado Livre" },
  { input: "Mercado Pago",                         expected: "Mercado Pago" },
  { input: "Google",                               expected: "Google" },
  { input: "Meta",                                 expected: "Meta" },
  { input: "Facebook",                             expected: "Facebook" },
  { input: "Instagram",                            expected: "Instagram" },
  { input: "WhatsApp",                             expected: "WhatsApp" },
  { input: "TikTok",                               expected: "TikTok" },
  { input: "PayPal",                               expected: "PayPal" },
  { input: "Pix",                                  expected: "Pix" },
  { input: "Nota Fiscal",                          expected: "Nota Fiscal" },
  { input: "DANFE",                                expected: "DANFE" },
  { input: "DARF",                                 expected: "DARF" },
  { input: "Boleto",                                expected: "Boleto" },
  { input: "Fatura",                               expected: "Fatura" },
  { input: "Contrato",                             expected: "Contrato" },
  { input: "Pagamento",                            expected: "Pagamento" },
  { input: "Pedido",                               expected: "Pedido" },
  { input: "Entrega",                              expected: "Entrega" },
  // "tenho email da X"
  { input: "Tenho email da Shopee?",               expected: "Shopee" },
  { input: "Tenho algum email da Hostinger?",      expected: "Hostinger" },
  { input: "Tenho emails da Amazon?",              expected: "Amazon" },
  // "existe/há algum X"
  { input: "Existe algum email da Shopee?",        expected: "Shopee" },
  { input: "Há emails do Mercado Livre?",          expected: "Mercado Livre" },
  { input: "Existe algum PIX?",                    expected: "Pix" },
  { input: "Tem alguma nota fiscal?",              expected: "Nota Fiscal" },
  // "recebi X"
  { input: "Recebi algum boleto?",                 expected: "Boleto" },
  { input: "Recebi alguma nota fiscal?",           expected: "Nota Fiscal" },
  { input: "Recebi Pix?",                          expected: "Pix" },
  { input: "Recebi algo do Mercado Livre?",        expected: "Mercado Livre" },
  { input: "Recebi algum email da Shopee?",        expected: "Shopee" },
  // "procure / busque / pesquise"
  { input: "Procure emails da Shopee",             expected: "Shopee" },
  { input: "Busque emails da Hostinger",           expected: "Hostinger" },
  { input: "Pesquise emails Amazon",               expected: "Amazon" },
  // "mostrar / ver"
  { input: "Mostrar emails da Shopee",             expected: "Shopee" },
  { input: "Ver emails do Mercado Pago",           expected: "Mercado Pago" },
  // "há / tem"
  { input: "Há algum DANFE?",                      expected: "DANFE" },
  { input: "Tem algum DARF?",                      expected: "DARF" },
  { input: "Há emails do Google?",                 expected: "Google" },
  { input: "Tem fatura da Hostinger?",             expected: "Hostinger" },
  // Mixed
  { input: "Existe alguma entrega?",               expected: "Entrega" },
  { input: "Tem algum pedido?",                    expected: "Pedido" },
  { input: "Tenho algum contrato?",                expected: "Contrato" },
  { input: "Recebi algum pagamento?",              expected: "Pagamento" },
  { input: "Existe email da Meta?",                expected: "Meta" },
  { input: "Há mensagens do Facebook?",            expected: "Facebook" },
  // English
  { input: "Show emails from Amazon",              expected: "Amazon" },
  { input: "Find emails Shopify",                  expected: "Shopify" },
];

export function runNormalizationTests(): NormalizationTest[] {
  return TEST_CASES.map(({ input, expected }) => {
    const result = normalize(input);
    const passed = result.entity.toLowerCase() === expected.toLowerCase();
    return {
      input,
      expectedEntity: expected,
      passed,
      actualEntity:   result.entity,
      error: passed ? null : `Expected "${expected}", got "${result.entity}"`,
    };
  });
}
