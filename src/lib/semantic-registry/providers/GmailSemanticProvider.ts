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
  "pagamento", "pagamentos", "recibo", "nf",
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

function firstMatch(lower: string, list: readonly string[]): string | null {
  for (const s of list) {
    if (lower.includes(s)) return s;
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

    const brand = firstMatch(lower, COMMERCIAL_BRANDS);
    if (brand) { score += 0.25; evidences.push(`commercial-brand: "${brand}"`); }

    const verb = firstMatch(lower, EMAIL_VERBS);
    if (verb) { score += 0.20; evidences.push(`email-verb: "${verb}"`); }

    if (normalized.isEmailQuery) {
      score += 0.15;
      evidences.push("normalizer: isEmailQuery=true");
    }

    return Object.freeze({ score: Math.min(score, 1.0), evidences: Object.freeze(evidences) });
  },
});