/**
 * SemanticEmailQueryBuilder.ts — Engineering Sprint E-02.6
 * Semantic Email Search Engine — Connector Intelligence Layer
 *
 * SRP: receber uma query em linguagem natural e retornar uma query
 *      otimizada para a Gmail API (sintaxe de busca do Gmail).
 *
 * Sem HTTP. Sem Runtime. Sem OAuth. Sem side effects.
 * Toda a inteligencia de busca reside neste modulo.
 */

import { EmailAliasRegistry } from "./EmailAliasRegistry";

// Compat shim: adapt new EmailAliasRegistry to the old findAlias() contract
function findAlias(query: string): { name: string; aliases: string[] } | null {
  const slug = EmailAliasRegistry.resolve(query);
  if (!slug) return null;
  const aliases = EmailAliasRegistry.getAliasStrings(slug) as string[];
  return aliases.length > 0 ? { name: slug, aliases } : null;
}

const LOG_PREFIX = "[SemanticEmailQueryBuilder]";

function log(msg: string, data?: unknown): void {
  if (typeof window !== "undefined" && import.meta.env.DEV) {
    if (data !== undefined) console.log(`${LOG_PREFIX} ${msg}`, data);
    else console.log(`${LOG_PREFIX} ${msg}`);
  }
}

// ── Modifier detectors ────────────────────────────────────────────────────────

interface QueryModifiers {
  hasAttachment: boolean;
  isUnread:      boolean;
  isImportant:   boolean;
  isStarred:     boolean;
  newerThan:     string | null;  // e.g. "30d", "7d", "1y"
  olderThan:     string | null;
  subject:       string | null;
  label:         string | null;
  hasFilename:   boolean;
}

function detectModifiers(text: string): QueryModifiers {
  const lower = text.toLowerCase();
  return {
    hasAttachment: /\b(anexo|attachment|arquivo anexo|com anexo|has:attachment)\b/.test(lower),
    isUnread:      /\b(n[aã]o lido|nao lido|unread|n[aã]o aberto|is:unread)\b/.test(lower),
    isImportant:   /\b(importante|important|is:important)\b/.test(lower),
    isStarred:     /\b(favorito|starred|is:starred)\b/.test(lower),
    newerThan:     detectTimeRange(lower),
    olderThan:     null,
    subject:       detectSubject(lower),
    label:         detectLabel(lower),
    hasFilename:   /\b(pdf|xlsx|docx|csv|filename:|planilha anexa)\b/.test(lower),
  };
}

function detectTimeRange(lower: string): string | null {
  if (/\b(hoje|today)\b/.test(lower))                          return "1d";
  if (/\b(ontem|yesterday)\b/.test(lower))                    return "2d";
  if (/\b(essa semana|esta semana|this week|7 dias)\b/.test(lower)) return "7d";
  if (/\b(esse m[eê]s|este m[eê]s|this month|30 dias|deste m[eê]s)\b/.test(lower)) return "30d";
  if (/\b([uú]ltimos? 3 meses|last 3 months|90 dias)\b/.test(lower)) return "90d";
  if (/\b([uú]ltimo ano|last year|esse ano|este ano)\b/.test(lower)) return "365d";
  return null;
}

function detectSubject(lower: string): string | null {
  const m = lower.match(/(?:assunto|subject)[:\s]+["']?([^"'\n,]+)["']?/i);
  return m?.[1]?.trim() ?? null;
}

function detectLabel(lower: string): string | null {
  if (/\b(promo[cç][aã]o|promo[cç]oes|promotion)\b/.test(lower)) return "category:promotions";
  if (/\b(social)\b/.test(lower))                                  return "category:social";
  if (/\b(atuali[zs]a[cç][aã]o|update)\b/.test(lower))           return "category:updates";
  if (/\b(forum)\b/.test(lower))                                   return "category:forums";
  return null;
}

// ── Core query builder ────────────────────────────────────────────────────────

export interface SemanticQueryResult {
  /** Original user input */
  readonly originalQuery: string;
  /** Optimized Gmail API query string */
  readonly gmailQuery:    string;
  /** Whether alias expansion was applied */
  readonly aliasExpanded: boolean;
  /** The alias name found, if any */
  readonly aliasName:     string | null;
  /** The raw alias terms used */
  readonly aliasTerms:    readonly string[];
  /** Detected modifiers */
  readonly modifiers:     QueryModifiers;
}

/**
 * Builds an optimized Gmail API query from a natural language search string.
 *
 * Examples:
 *   "emails da Shopee"            → "from:(Shopee OR shopee.com.br OR ...) "
 *   "emails da Shopee não lidos"  → "from:(...) is:unread"
 *   "emails da Shopee com anexo"  → "from:(...) has:attachment"
 *   "emails deste mês"            → "newer_than:30d"
 *   "emails sobre DANFE"          → "DANFE"  (no alias → raw)
 */
export function buildGmailQuery(naturalQuery: string): SemanticQueryResult {
  const trimmed = naturalQuery.trim();
  log("Input query:", trimmed);

  const modifiers = detectModifiers(trimmed);
  log("Detected modifiers:", modifiers);

  // 1. Try alias expansion
  const alias = findAlias(trimmed);
  log("Alias found:", alias?.name ?? "none");

  const parts: string[] = [];

  if (alias) {
    // Build from:(...) clause with all alias terms
    const fromTerms = alias.aliases.join(" OR ");
    parts.push(`from:(${fromTerms})`);
    log("Alias terms:", alias.aliases);
  } else {
    // No alias — use original query as the main search term
    // Strip common command words ("procure", "buscar", "pesquise", etc.)
    const stripped = trimmed
      .replace(/\b(procur[ea]r?|pesquis[ae]r?|buscar?|encontrar?|mostrar?|ver|listar?|procure|emails?|e-?mails?|da|do|de|com|sobre|contendo|todos?)\b/gi, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    const rawTerm = stripped || trimmed;
    parts.push(rawTerm);
    log("No alias — using raw term:", rawTerm);
  }

  // 2. Append subject filter
  if (modifiers.subject) {
    parts.push(`subject:"${modifiers.subject}"`);
  }

  // 3. Append label/category
  if (modifiers.label) {
    parts.push(modifiers.label);
  }

  // 4. Append modifiers
  if (modifiers.hasAttachment || modifiers.hasFilename) parts.push("has:attachment");
  if (modifiers.isUnread)    parts.push("is:unread");
  if (modifiers.isImportant) parts.push("is:important");
  if (modifiers.isStarred)   parts.push("is:starred");
  if (modifiers.newerThan)   parts.push(`newer_than:${modifiers.newerThan}`);
  if (modifiers.olderThan)   parts.push(`older_than:${modifiers.olderThan}`);

  const gmailQuery = parts.join(" ").trim();

  log("Final Gmail query:", gmailQuery);

  return Object.freeze({
    originalQuery: trimmed,
    gmailQuery,
    aliasExpanded: alias !== null,
    aliasName:     alias?.name ?? null,
    aliasTerms:    Object.freeze(alias?.aliases ?? []),
    modifiers:     Object.freeze(modifiers),
  });
}

// ── Test helper ───────────────────────────────────────────────────────────────

export interface SemanticQueryTest {
  name:     string;
  input:    string;
  passed:   boolean;
  output:   string;
  error:    string | null;
}

export function runSemanticQueryTests(): SemanticQueryTest[] {
  const cases: Array<{ name: string; input: string; checks: (r: SemanticQueryResult) => void }> = [
    {
      name: "Shopee — from alias",
      input: "Procure emails da Shopee",
      checks: (r) => {
        if (!r.aliasExpanded)             throw new Error("alias not expanded");
        if (!r.gmailQuery.includes("from:(")) throw new Error("missing from:(");
        if (!r.gmailQuery.toLowerCase().includes("shopee")) throw new Error("missing shopee");
      },
    },
    {
      name: "Mercado Livre — from alias",
      input: "Procure emails Mercado Livre",
      checks: (r) => {
        if (!r.aliasExpanded)             throw new Error("alias not expanded");
        if (!r.gmailQuery.includes("MercadoLivre") && !r.gmailQuery.includes("Mercado Livre")) throw new Error("missing ML terms");
      },
    },
    {
      name: "Hostinger — from alias",
      input: "Procure emails Hostinger",
      checks: (r) => {
        if (!r.aliasExpanded)             throw new Error("alias not expanded");
        if (!r.gmailQuery.includes("hostinger")) throw new Error("missing hostinger");
      },
    },
    {
      name: "Amazon — from alias",
      input: "Procure emails Amazon",
      checks: (r) => {
        if (!r.aliasExpanded)             throw new Error("alias not expanded");
        if (!r.gmailQuery.toLowerCase().includes("amazon")) throw new Error("missing amazon");
      },
    },
    {
      name: "Mercado Pago — from alias",
      input: "Procure emails Mercado Pago",
      checks: (r) => {
        if (!r.aliasExpanded)             throw new Error("alias not expanded");
        if (!r.gmailQuery.toLowerCase().includes("mercadopago")) throw new Error("missing mercadopago");
      },
    },
    {
      name: "Google — from alias",
      input: "Procure emails Google",
      checks: (r) => {
        if (!r.aliasExpanded)             throw new Error("alias not expanded");
        if (!r.gmailQuery.toLowerCase().includes("google")) throw new Error("missing google");
      },
    },
    {
      name: "Meta — from alias",
      input: "Procure emails Meta",
      checks: (r) => {
        if (!r.aliasExpanded)             throw new Error("alias not expanded");
        if (!r.gmailQuery.toLowerCase().includes("meta") && !r.gmailQuery.toLowerCase().includes("facebook")) throw new Error("missing meta terms");
      },
    },
    {
      name: "Shopify — from alias",
      input: "Procure emails Shopify",
      checks: (r) => {
        if (!r.aliasExpanded)             throw new Error("alias not expanded");
        if (!r.gmailQuery.toLowerCase().includes("shopify")) throw new Error("missing shopify");
      },
    },
    {
      name: "PayPal — from alias",
      input: "Procure emails PayPal",
      checks: (r) => {
        if (!r.aliasExpanded)             throw new Error("alias not expanded");
        if (!r.gmailQuery.toLowerCase().includes("paypal")) throw new Error("missing paypal");
      },
    },
    {
      name: "PIX — no alias, raw term",
      input: "Procure emails contendo PIX",
      checks: (r) => {
        if (r.aliasExpanded)              throw new Error("should NOT expand alias for PIX");
        if (!r.gmailQuery.toUpperCase().includes("PIX")) throw new Error("missing PIX in query");
      },
    },
    {
      name: "DANFE — no alias, raw term",
      input: "Procure emails contendo DANFE",
      checks: (r) => {
        if (r.aliasExpanded)              throw new Error("should NOT expand alias for DANFE");
        if (!r.gmailQuery.toUpperCase().includes("DANFE")) throw new Error("missing DANFE in query");
      },
    },
    {
      name: "Shopee unread",
      input: "Procure emails nao lidos da Shopee",
      checks: (r) => {
        if (!r.aliasExpanded)             throw new Error("alias not expanded");
        if (!r.gmailQuery.includes("is:unread")) throw new Error("missing is:unread");
        if (!r.gmailQuery.includes("from:("))    throw new Error("missing from:(");
      },
    },
    {
      name: "Shopee this month",
      input: "Procure emails da Shopee deste mes",
      checks: (r) => {
        if (!r.aliasExpanded)             throw new Error("alias not expanded");
        if (!r.gmailQuery.includes("newer_than:30d")) throw new Error("missing newer_than:30d");
      },
    },
    {
      name: "With attachment",
      input: "Procure emails com anexo",
      checks: (r) => {
        if (!r.gmailQuery.includes("has:attachment")) throw new Error("missing has:attachment");
      },
    },
  ];

  return cases.map(({ name, input, checks }) => {
    try {
      const result = buildGmailQuery(input);
      checks(result);
      return { name, input, passed: true, output: result.gmailQuery, error: null };
    } catch (e) {
      const result = buildGmailQuery(input);
      return { name, input, passed: false, output: result.gmailQuery, error: (e as Error).message };
    }
  });
}