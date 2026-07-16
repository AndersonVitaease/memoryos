/**
 * SmartGmailQueryBuilder.ts — Engineering Sprint E-02.8
 * Smart Gmail Query Engine — Connector Intelligence Layer
 *
 * SRP: receber uma entidade (nome de empresa/marca) e gerar
 *      uma estrategia de busca progressiva para a Gmail API.
 *
 * Sem HTTP. Sem Runtime. Sem OAuth. Sem side effects.
 * Toda a inteligencia de busca reside neste modulo.
 *
 * Camadas superiores inalteradas:
 *   ConversationPipeline, Runtime, Planning, Router,
 *   ConnectorRegistry, GoalEngine — ZERO mudancas.
 *
 * Unico ponto de entrada para o GmailConnector: buildSearchStrategy().
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SearchAttempt {
  /** Sequential index (1-based) */
  readonly attempt: number;
  /** Gmail query string used */
  readonly query: string;
  /** Label describing the strategy */
  readonly strategy: string;
  /** Results found (null = not yet executed) */
  results: number | null;
  /** Whether this attempt succeeded (found > 0 results) */
  succeeded: boolean;
}

export interface SmartSearchStrategy {
  /** Original entity name from user */
  readonly entity: string;
  /** Canonicalized (lower-case, trimmed) version */
  readonly canonical: string;
  /** Ordered list of queries to attempt */
  readonly attempts: SearchAttempt[];
}

export interface SmartSearchResult {
  readonly entity: string;
  readonly strategy: SmartSearchStrategy;
  /** The winning query, or null if nothing found */
  readonly winningQuery: string | null;
  /** All log lines for observability */
  readonly log: readonly string[];
  /** Total emails found (from the winning attempt) */
  readonly totalFound: number;
}

// ── Query Strategy Builder ─────────────────────────────────────────────────────

/**
 * Generates a multi-attempt search strategy for a given entity name.
 *
 * Rules (generic — no hardcoding of specific brands):
 *
 * 1. Exact name              → "Hostinger"
 * 2. Domain variant          → "hostinger.com"  (lowercase canonical + .com)
 * 3. From: sender prefix     → "from:hostinger"  (matches any @hostinger.*)
 * 4. Country TLD variant     → "hostinger.com.br" (if multi-word or BR-market)
 * 5. Quoted exact phrase     → "\"Mercado Livre\"" (for multi-word names)
 * 6. Condensed variant       → "MercadoLivre"    (camelCase, spaces removed)
 * 7. from:(domain OR domain) → "from:(hostinger.com OR hostinger.com.br)"
 */
export function buildSearchStrategy(entity: string): SmartSearchStrategy {
  const trimmed   = entity.trim();
  const canonical = trimmed.toLowerCase().replace(/\s+/g, " ").trim();
  const words     = canonical.split(" ");
  const isMultiWord = words.length > 1;

  // Slug: remove spaces → "mercadolivre"
  const slug = canonical.replace(/\s+/g, "");

  // CamelCase: "Mercado Livre" → "MercadoLivre"
  const camel = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");

  const attempts: SearchAttempt[] = [];
  const seen = new Set<string>();

  function add(query: string, strategy: string) {
    const q = query.trim();
    if (!q || seen.has(q)) return;
    seen.add(q);
    attempts.push({ attempt: attempts.length + 1, query: q, strategy, results: null, succeeded: false });
  }

  // ── Attempt 1: Exact name (original casing) ──────────────────────────────
  add(trimmed, "exact_name");

  // ── Special domain overrides ─────────────────────────────────────────────
  // Some services use non-.com primary domains. Handle them here.
  const DOMAIN_OVERRIDES: Readonly<Record<string, string>> = {
    notion: "notion.so",
    jira:   "atlassian.net",
    slack:  "slack.com",
  };
  const primaryDomain = DOMAIN_OVERRIDES[slug] ?? `${slug}.com`;

  // ── Attempt 2: Primary domain ─────────────────────────────────────────────
  add(primaryDomain, "domain_primary");

  // ── Attempt 3: from: prefix ───────────────────────────────────────────────
  add(`from:${slug}`, "from_prefix");

  // ── Attempt 4: Country-specific domain (.com.br) — skip for overrides ────
  if (!DOMAIN_OVERRIDES[slug]) {
    add(`${slug}.com.br`, "domain_com_br");
  }

  // ── Attempt 5: Quoted exact phrase (multi-word only) ─────────────────────
  if (isMultiWord) {
    add(`"${trimmed}"`, "quoted_exact");
  }

  // ── Attempt 6: Condensed slug (lowercase, no spaces) ─────────────────────
  if (isMultiWord) {
    add(slug, "condensed_slug");
  }

  // ── Attempt 7: CamelCase variant (multi-word only) ───────────────────────
  if (isMultiWord && camel !== trimmed) {
    add(camel, "camel_case");
  }

  // ── Attempt 8: from:(domain OR domain) combined ───────────────────────────
  const domainCom   = primaryDomain;
  const domainComBr = `${slug}.com.br`;
  if (domainCom !== domainComBr) {
    add(`from:(${domainCom} OR ${domainComBr})`, "from_domain_combined");
  }

  return Object.freeze({
    entity:    trimmed,
    canonical,
    attempts:  attempts as SearchAttempt[],
  });
}

// ── Executor ──────────────────────────────────────────────────────────────────

/**
 * Executes the smart search strategy against the real Gmail API.
 * Stops on first attempt that returns results.
 * All attempts are logged regardless of outcome.
 *
 * @param entity        Raw entity name from user (e.g. "Hostinger")
 * @param searchFn      The real searchMessages function from GmailConnector.js
 * @param maxResults    Max results per attempt (default: 10)
 */
export async function executeSmartSearch(
  entity:     string,
  searchFn:   (query: string, maxResults: number) => Promise<{ ok: boolean; data: unknown; error: string | null }>,
  maxResults  = 10,
): Promise<SmartSearchResult> {
  const strategy = buildSearchStrategy(entity);
  const log: string[] = [];

  log.push(`[SmartGmailQueryBuilder] Entity: "${entity}" — ${strategy.attempts.length} attempts planned`);

  let winningQuery: string | null = null;
  let totalFound = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let winningData: any = null;

  for (const attempt of strategy.attempts) {
    log.push(`  Search #${attempt.attempt} [${attempt.strategy}]: q="${attempt.query}"`);

    const result = await searchFn(attempt.query, maxResults);

    if (!result.ok) {
      attempt.results = 0;
      attempt.succeeded = false;
      log.push(`    → ERROR: ${result.error ?? "unknown"}`);
      continue;
    }

    // Count results: data may be { messages: [...] } or an array
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.data as any;
    const count =
      Array.isArray(data)              ? data.length :
      Array.isArray(data?.messages)    ? data.messages.length :
      typeof data?.resultSizeEstimate  === "number" ? data.resultSizeEstimate :
      0;

    attempt.results   = count;
    attempt.succeeded = count > 0;

    if (count > 0) {
      log.push(`    → ${count} resultado(s) encontrado(s). Busca encerrada.`);
      winningQuery = attempt.query;
      totalFound   = count;
      winningData  = data;
      break;
    } else {
      log.push(`    → 0 resultados. Tentando proxima estrategia...`);
    }
  }

  if (!winningQuery) {
    log.push(`  Nenhum e-mail encontrado apos ${strategy.attempts.length} tentativas.`);
  }

  return Object.freeze({
    entity,
    strategy,
    winningQuery,
    log: Object.freeze(log),
    totalFound,
    // Attach winning data for the connector to return
    _data: winningData,
  } as SmartSearchResult & { _data: unknown });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

export interface SmartQueryTest {
  name:         string;
  entity:       string;
  passed:       boolean;
  attempts:     number;
  firstQuery:   string;
  allQueries:   string[];
  error:        string | null;
}

/**
 * Validates strategy generation (no real API calls — pure structural tests).
 * Checks that each entity produces the expected query variants.
 */
export function runSmartQueryTests(): SmartQueryTest[] {
  const cases: Array<{
    name:       string;
    entity:     string;
    checks:     (s: SmartSearchStrategy) => void;
  }> = [
    {
      name:   "Hostinger",
      entity: "Hostinger",
      checks: (s) => {
        const qs = s.attempts.map((a) => a.query);
        if (!qs.includes("Hostinger"))        throw new Error("missing exact name");
        if (!qs.includes("hostinger.com"))    throw new Error("missing domain .com");
        if (!qs.includes("from:hostinger"))   throw new Error("missing from: prefix");
        if (!qs.includes("hostinger.com.br")) throw new Error("missing .com.br");
        if (s.attempts.length < 4)            throw new Error("too few attempts");
      },
    },
    {
      name:   "Shopee",
      entity: "Shopee",
      checks: (s) => {
        const qs = s.attempts.map((a) => a.query);
        if (!qs.includes("Shopee"))         throw new Error("missing exact name");
        if (!qs.includes("shopee.com"))     throw new Error("missing domain");
        if (!qs.includes("from:shopee"))    throw new Error("missing from:");
        if (!qs.includes("shopee.com.br"))  throw new Error("missing .com.br");
      },
    },
    {
      name:   "Mercado Livre",
      entity: "Mercado Livre",
      checks: (s) => {
        const qs = s.attempts.map((a) => a.query);
        if (!qs.includes("Mercado Livre"))          throw new Error("missing exact name");
        if (!qs.some((q) => q.includes("mercadolivre.com"))) throw new Error("missing domain");
        if (!qs.some((q) => q.includes("from:")))  throw new Error("missing from:");
        if (!qs.includes('"Mercado Livre"'))         throw new Error("missing quoted exact");
        if (!qs.includes("mercadolivre"))            throw new Error("missing condensed slug");
        if (!qs.includes("MercadoLivre"))            throw new Error("missing camelCase");
        if (s.attempts.length >= 6)                  return; // ok
        throw new Error(`expected >= 6 attempts, got ${s.attempts.length}`);
      },
    },
    {
      name:   "Amazon",
      entity: "Amazon",
      checks: (s) => {
        const qs = s.attempts.map((a) => a.query);
        if (!qs.includes("Amazon"))           throw new Error("missing exact");
        if (!qs.includes("amazon.com"))       throw new Error("missing .com");
        if (!qs.includes("from:amazon"))      throw new Error("missing from:");
        if (!qs.includes("amazon.com.br"))    throw new Error("missing .com.br");
      },
    },
    {
      name:   "PicPay",
      entity: "PicPay",
      checks: (s) => {
        const qs = s.attempts.map((a) => a.query);
        if (!qs.includes("PicPay"))           throw new Error("missing exact");
        if (!qs.includes("picpay.com"))       throw new Error("missing domain");
        if (!qs.includes("from:picpay"))      throw new Error("missing from:");
      },
    },
    {
      name:   "PayPal",
      entity: "PayPal",
      checks: (s) => {
        const qs = s.attempts.map((a) => a.query);
        if (!qs.includes("PayPal"))           throw new Error("missing exact");
        if (!qs.includes("paypal.com"))       throw new Error("missing domain");
        if (!qs.includes("from:paypal"))      throw new Error("missing from:");
      },
    },
    {
      name:   "Mercado Pago",
      entity: "Mercado Pago",
      checks: (s) => {
        const qs = s.attempts.map((a) => a.query);
        if (!qs.includes("Mercado Pago"))         throw new Error("missing exact");
        if (!qs.includes('"Mercado Pago"'))         throw new Error("missing quoted");
        if (!qs.includes("mercadopago"))           throw new Error("missing slug");
        if (!qs.includes("MercadoPago"))           throw new Error("missing camelCase");
        if (!qs.some((q) => q.includes("from:"))) throw new Error("missing from:");
      },
    },
    {
      name:   "Google",
      entity: "Google",
      checks: (s) => {
        const qs = s.attempts.map((a) => a.query);
        if (!qs.includes("Google"))         throw new Error("missing exact");
        if (!qs.includes("google.com"))     throw new Error("missing domain");
        if (!qs.includes("from:google"))    throw new Error("missing from:");
      },
    },
    {
      name:   "Meta",
      entity: "Meta",
      checks: (s) => {
        const qs = s.attempts.map((a) => a.query);
        if (!qs.includes("Meta"))           throw new Error("missing exact");
        if (!qs.includes("meta.com"))       throw new Error("missing domain");
        if (!qs.includes("from:meta"))      throw new Error("missing from:");
      },
    },
    {
      name:   "Facebook",
      entity: "Facebook",
      checks: (s) => {
        const qs = s.attempts.map((a) => a.query);
        if (!qs.includes("Facebook"))       throw new Error("missing exact");
        if (!qs.includes("from:facebook"))  throw new Error("missing from:");
      },
    },
    {
      name:   "Instagram",
      entity: "Instagram",
      checks: (s) => {
        const qs = s.attempts.map((a) => a.query);
        if (!qs.includes("Instagram"))      throw new Error("missing exact");
        if (!qs.includes("from:instagram")) throw new Error("missing from:");
      },
    },
    {
      name:   "WhatsApp",
      entity: "WhatsApp",
      checks: (s) => {
        const qs = s.attempts.map((a) => a.query);
        if (!qs.includes("WhatsApp"))       throw new Error("missing exact");
        if (!qs.includes("from:whatsapp"))  throw new Error("missing from:");
      },
    },
    {
      name:   "TikTok",
      entity: "TikTok",
      checks: (s) => {
        const qs = s.attempts.map((a) => a.query);
        if (!qs.includes("TikTok"))         throw new Error("missing exact");
        if (!qs.includes("tiktok.com"))     throw new Error("missing domain");
        if (!qs.includes("from:tiktok"))    throw new Error("missing from:");
      },
    },
    {
      name:   "Nubank",
      entity: "Nubank",
      checks: (s) => {
        const qs = s.attempts.map((a) => a.query);
        if (!qs.includes("Nubank"))         throw new Error("missing exact");
        if (!qs.includes("nubank.com"))     throw new Error("missing domain");
        if (!qs.includes("from:nubank"))    throw new Error("missing from:");
      },
    },
    {
      name:   "Itau",
      entity: "Itau",
      checks: (s) => {
        const qs = s.attempts.map((a) => a.query);
        if (!qs.includes("Itau"))           throw new Error("missing exact");
        if (!qs.includes("itau.com"))       throw new Error("missing domain");
        if (!qs.includes("from:itau"))      throw new Error("missing from:");
      },
    },
    {
      name:   "Banco do Brasil",
      entity: "Banco do Brasil",
      checks: (s) => {
        const qs = s.attempts.map((a) => a.query);
        if (!qs.includes("Banco do Brasil"))          throw new Error("missing exact");
        if (!qs.includes('"Banco do Brasil"'))         throw new Error("missing quoted");
        if (!qs.some((q) => q.includes("bancodobrasil"))) throw new Error("missing slug");
      },
    },
    {
      name:   "Caixa",
      entity: "Caixa",
      checks: (s) => {
        const qs = s.attempts.map((a) => a.query);
        if (!qs.includes("Caixa"))          throw new Error("missing exact");
        if (!qs.includes("from:caixa"))     throw new Error("missing from:");
      },
    },
    {
      name:   "Bradesco",
      entity: "Bradesco",
      checks: (s) => {
        const qs = s.attempts.map((a) => a.query);
        if (!qs.includes("Bradesco"))       throw new Error("missing exact");
        if (!qs.includes("bradesco.com"))   throw new Error("missing domain");
        if (!qs.includes("from:bradesco"))  throw new Error("missing from:");
      },
    },
    {
      name:   "Santander",
      entity: "Santander",
      checks: (s) => {
        const qs = s.attempts.map((a) => a.query);
        if (!qs.includes("Santander"))      throw new Error("missing exact");
        if (!qs.includes("from:santander")) throw new Error("missing from:");
      },
    },
    {
      name:   "Oracle",
      entity: "Oracle",
      checks: (s) => {
        const qs = s.attempts.map((a) => a.query);
        if (!qs.includes("Oracle"))         throw new Error("missing exact");
        if (!qs.includes("oracle.com"))     throw new Error("missing domain");
        if (!qs.includes("from:oracle"))    throw new Error("missing from:");
      },
    },
    {
      name:   "SAP",
      entity: "SAP",
      checks: (s) => {
        const qs = s.attempts.map((a) => a.query);
        if (!qs.includes("SAP"))            throw new Error("missing exact");
        if (!qs.includes("sap.com"))        throw new Error("missing domain");
        if (!qs.includes("from:sap"))       throw new Error("missing from:");
      },
    },
    {
      name:   "Slack",
      entity: "Slack",
      checks: (s) => {
        const qs = s.attempts.map((a) => a.query);
        if (!qs.includes("Slack"))          throw new Error("missing exact");
        if (!qs.includes("slack.com"))      throw new Error("missing domain");
        if (!qs.includes("from:slack"))     throw new Error("missing from:");
      },
    },
    {
      name:   "GitHub",
      entity: "GitHub",
      checks: (s) => {
        const qs = s.attempts.map((a) => a.query);
        if (!qs.includes("GitHub"))         throw new Error("missing exact");
        if (!qs.includes("github.com"))     throw new Error("missing domain");
        if (!qs.includes("from:github"))    throw new Error("missing from:");
      },
    },
    {
      name:   "Notion",
      entity: "Notion",
      checks: (s) => {
        const qs = s.attempts.map((a) => a.query);
        if (!qs.includes("Notion"))         throw new Error("missing exact");
        if (!qs.includes("notion.so"))      throw new Error("missing notion.so domain");
        if (!qs.includes("from:notion"))    throw new Error("missing from:");
      },
    },
    {
      name:   "Jira",
      entity: "Jira",
      checks: (s) => {
        const qs = s.attempts.map((a) => a.query);
        if (!qs.includes("Jira"))           throw new Error("missing exact");
        if (!qs.includes("from:jira"))      throw new Error("missing from:");
      },
    },
    {
      name:   "Zendesk",
      entity: "Zendesk",
      checks: (s) => {
        const qs = s.attempts.map((a) => a.query);
        if (!qs.includes("Zendesk"))        throw new Error("missing exact");
        if (!qs.includes("zendesk.com"))    throw new Error("missing domain");
        if (!qs.includes("from:zendesk"))   throw new Error("missing from:");
      },
    },
    {
      name:   "HubSpot",
      entity: "HubSpot",
      checks: (s) => {
        const qs = s.attempts.map((a) => a.query);
        if (!qs.includes("HubSpot"))        throw new Error("missing exact");
        if (!qs.includes("hubspot.com"))    throw new Error("missing domain");
        if (!qs.includes("from:hubspot"))   throw new Error("missing from:");
      },
    },
  ];

  return cases.map(({ name, entity, checks }) => {
    try {
      const strategy = buildSearchStrategy(entity);
      checks(strategy);
      return {
        name,
        entity,
        passed:     true,
        attempts:   strategy.attempts.length,
        firstQuery: strategy.attempts[0]?.query ?? "",
        allQueries: strategy.attempts.map((a) => a.query),
        error:      null,
      };
    } catch (e) {
      const strategy = buildSearchStrategy(entity);
      return {
        name,
        entity,
        passed:     false,
        attempts:   strategy.attempts.length,
        firstQuery: strategy.attempts[0]?.query ?? "",
        allQueries: strategy.attempts.map((a) => a.query),
        error:      (e as Error).message,
      };
    }
  });
}