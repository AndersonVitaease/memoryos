/**
 * EmailAliasRegistry.ts — Engineering Sprint E-02.6
 * Semantic Email Search Engine — Connector Intelligence Layer
 *
 * SRP: mapear nomes de marcas/remetentes para seus aliases de busca.
 * Sem HTTP. Sem Runtime. Sem OAuth. Sem side effects.
 *
 * Extensao: adicionar novas entradas no objeto ALIAS_MAP.
 * Nenhuma regra hardcoded fora deste arquivo.
 */

export interface AliasEntry {
  /** Primary human-readable name */
  readonly name: string;
  /** All search terms that represent this entity (lower-case signal for matching) */
  readonly signals: readonly string[];
  /** Gmail-optimized aliases: used in from:(...) or general OR query */
  readonly aliases: readonly string[];
}

// ── Registry ──────────────────────────────────────────────────────────────────
// Key: lower-case canonical name used for signal matching.
// aliases: values placed inside from:(...) or bare OR query.

const ALIAS_MAP: Readonly<Record<string, AliasEntry>> = Object.freeze({

  shopee: {
    name: "Shopee",
    signals: ["shopee"],
    aliases: ["Shopee", "shopee.com.br", "seller.shopee", "no-reply@shopee", "support@shopee"],
  },

  "mercado livre": {
    name: "Mercado Livre",
    signals: ["mercado livre", "mercadolivre", "ml"],
    aliases: ["Mercado Livre", "MercadoLivre", "mercadolivre", "mercadoenvios", "mercadolivre.com.br"],
  },

  "mercado pago": {
    name: "Mercado Pago",
    signals: ["mercado pago", "mercadopago"],
    aliases: ["Mercado Pago", "mercadopago", "mercadopago.com.br"],
  },

  amazon: {
    name: "Amazon",
    signals: ["amazon"],
    aliases: ["Amazon", "amazon.com", "amazon.com.br", "sellercentral.amazon"],
  },

  hostinger: {
    name: "Hostinger",
    signals: ["hostinger"],
    aliases: ["Hostinger", "hostinger.com", "support.hostinger", "billing.hostinger", "no-reply@hostinger"],
  },

  google: {
    name: "Google",
    signals: ["google", "gmail", "workspace google"],
    aliases: ["Google", "google.com", "gmail.com", "workspace.google"],
  },

  meta: {
    name: "Meta",
    signals: ["meta", "facebook", "instagram", "whatsapp meta"],
    aliases: ["Meta", "Facebook", "Instagram", "facebookmail.com", "meta.com"],
  },

  facebook: {
    name: "Facebook",
    signals: ["facebook"],
    aliases: ["Facebook", "facebookmail.com", "meta.com"],
  },

  paypal: {
    name: "PayPal",
    signals: ["paypal"],
    aliases: ["PayPal", "service@paypal.com", "paypal.com"],
  },

  shopify: {
    name: "Shopify",
    signals: ["shopify"],
    aliases: ["Shopify", "shopify.com", "notifications@shopify.com"],
  },

  ifood: {
    name: "iFood",
    signals: ["ifood"],
    aliases: ["iFood", "ifood.com.br", "noreply@ifood"],
  },

  nubank: {
    name: "Nubank",
    signals: ["nubank", "nu "],
    aliases: ["Nubank", "nubank.com.br", "todomundo@nubank.com.br"],
  },

  itau: {
    name: "Itau",
    signals: ["itau", "itaú"],
    aliases: ["Itau", "itau.com.br", "itaucard"],
  },

  bradesco: {
    name: "Bradesco",
    signals: ["bradesco"],
    aliases: ["Bradesco", "bradesco.com.br"],
  },

  correios: {
    name: "Correios",
    signals: ["correios"],
    aliases: ["Correios", "correios.com.br"],
  },

  netflix: {
    name: "Netflix",
    signals: ["netflix"],
    aliases: ["Netflix", "netflix.com", "info@netflix.com"],
  },

  spotify: {
    name: "Spotify",
    signals: ["spotify"],
    aliases: ["Spotify", "spotify.com", "no-reply@spotify.com"],
  },

  linkedin: {
    name: "LinkedIn",
    signals: ["linkedin"],
    aliases: ["LinkedIn", "linkedin.com", "messages-noreply@linkedin.com"],
  },

  github: {
    name: "GitHub",
    signals: ["github"],
    aliases: ["GitHub", "github.com", "noreply@github.com"],
  },

});

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Finds an alias entry whose signals match anywhere in the input text.
 * Returns the first match (most specific signals are listed first in each entry).
 */
export function findAlias(text: string): AliasEntry | null {
  const lower = text.toLowerCase();
  // Try multi-word signals first (longer = more specific)
  const entries = Object.values(ALIAS_MAP).sort(
    (a, b) => Math.max(...b.signals.map((s) => s.length)) - Math.max(...a.signals.map((s) => s.length))
  );
  for (const entry of entries) {
    if (entry.signals.some((s) => lower.includes(s))) {
      return entry;
    }
  }
  return null;
}

/** Returns all registered alias entries. */
export function listAllAliases(): readonly AliasEntry[] {
  return Object.values(ALIAS_MAP);
}

/** Returns an alias entry by its canonical key, or null. */
export function getAliasByKey(key: string): AliasEntry | null {
  return ALIAS_MAP[key.toLowerCase()] ?? null;
}