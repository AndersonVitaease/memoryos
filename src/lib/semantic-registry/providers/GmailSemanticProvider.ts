/**
 * GmailSemanticProvider.ts — Engineering Sprint 9.2.2
 *
 * SRP: unico responsavel por todo o conhecimento semantico do connector Gmail.
 *      O detector nao conhece nenhuma linha deste arquivo.
 *
 * Open/Closed: para adicionar sinais de Gmail, edite apenas este arquivo.
 */

import type { SemanticProvider, SemanticScore } from "../SemanticTypes";
import type { NormalizationResult } from "@/lib/conversation-goal-bridge/NaturalLanguageGoalNormalizer";

// ── Semantic signal tables ─────────────────────────────────────────────────────

const EMAIL_KEYWORDS = Object.freeze([
  "email", "e-mail", "emails", "e-mails", "mensagem", "mensagens",
  "inbox", "caixa de entrada", "correio",
]);

const FINANCIAL_DOCS = Object.freeze([
  "boleto", "fatura", "nota fiscal", "nfe", "danfe", "darf", "pix",
  "pagamento", "pagamentos", "recibo",
  // FIX (auditoria cognição): "nf" sozinho removido — colide como
  // substring com palavras comuns do dia a dia: "informe", "confirme",
  // "enfim", "infinito". Isso disparava busca real no Gmail em
  // mensagens como "me informe o link", sem nenhuma relação com nota
  // fiscal. "nota fiscal"/"nfe"/"danfe" já cobrem o caso real.
]);

const COMMERCIAL_BRANDS = Object.freeze([
  "shopee", "amazon", "hostinger", "mercado livre", "mercadolivre",
  "mercado pago", "mercadopago", "ifood", "correios", "magalu",
  "americanas", "aliexpress", "ebay", "shopify",
]);

const EMAIL_VERBS = Object.freeze([
  "recebi", "recebeu", "receber", "enviei", "enviar", "responder",
  "encaminhar", "encaminhou",
]);

// ── Scoring helper ─────────────────────────────────────────────────────────────

/**
 * FIX (auditoria cognição): trocado de .includes() puro (substring) para
 * matching de palavra/frase inteira com fronteira Unicode — mesmo padrão
 * já aplicado em outros componentes desta auditoria. Reforço defensivo
 * além da remoção do "nf": mesmo sinais mais longos remanescentes agora
 * não colidem com palavras que os contenham como substring.
 */
function firstMatch(lower: string, list: readonly string[]): string | null {
  for (const s of list) {
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "u");
    if (pattern.test(lower)) return s;
  }
  return null;
}

// ── Provider implementation ────────────────────────────────────────────────────

export const GmailSemanticProvider: SemanticProvider = Object.freeze({
  connectorId:      "gmail",
  implicitGoalType: "gmail.searchMessages",

  score(lower: string, normalized: NormalizationResult): SemanticScore {
    const evidences: string[] = [];
    let score = 0;

    const emailKw = firstMatch(lower, EMAIL_KEYWORDS);
    if (emailKw) { score += 0.40; evidences.push(`email-keyword: "${emailKw}"`); }

    const finDoc = firstMatch(lower, FINANCIAL_DOCS);
    if (finDoc) { score += 0.30; evidences.push(`financial-doc: "${finDoc}"`); }

    // FIX (auditoria cognição): score de commercial-brand era 0.25 —
    // sozinho já ultrapassava o MIN_SCORE_THRESHOLD (0.20) do
    // ImplicitConnectorIntentDetector. Qualquer mensagem que apenas
    // MENCIONASSE uma marca ("conector mcp mercado livre", pedindo
    // ajuda com integração, sem nenhuma intenção de e-mail) disparava
    // uma busca real na caixa de entrada do Gmail, trazendo e-mails de
    // suporte/anúncios que não tinham nada a ver com o pedido. Reduzido
    // pra 0.12 — agora precisa se combinar com um verbo de e-mail
    // ("recebi", "enviei"...) ou palavra "email"/"mensagem" pra
    // ultrapassar o threshold, preservando o caso legítimo ("recebi
    // uma notificação do Mercado Livre").
    const brand = firstMatch(lower, COMMERCIAL_BRANDS);
    if (brand) { score += 0.12; evidences.push(`commercial-brand: "${brand}"`); }

    const verb = firstMatch(lower, EMAIL_VERBS);
    if (verb) { score += 0.20; evidences.push(`email-verb: "${verb}"`); }

    if (normalized.isEmailQuery) {
      score += 0.15;
      evidences.push("normalizer: isEmailQuery=true");
    }

    return Object.freeze({ score: Math.min(score, 1.0), evidences: Object.freeze(evidences) });
  },
});
