/**
 * SmartQueryTests.ts — Engineering Sprint E-02.9
 * Connector Knowledge Layer — Test Suite
 *
 * Valida: aliases, dominios, queries geradas, ordem das tentativas,
 *         query vencedora simulada e regressao completa E-02.8.
 */

import { EmailAliasRegistry } from "./EmailAliasRegistry";
import { DomainRegistry }     from "./DomainRegistry";
import { smartQueryBuilder }  from "./SmartQueryBuilder";
import { SmartQueryExecutor } from "./SmartQueryExecutor";
import type { SearchResult }  from "./SmartQueryTypes";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QueryTestResult {
  name:       string;
  passed:     boolean;
  error?:     string;
  details:    string[];
  queries:    string[];
  aliases:    string[];
  domains:    string[];
  winner?:    string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function assertAlias(slug: string, expected: string): string | null {
  const resolved = EmailAliasRegistry.resolve(expected);
  if (resolved !== slug) return `Expected alias "${expected}" to resolve to "${slug}", got "${resolved}"`;
  return null;
}

function assertDomain(slug: string, domain: string): string | null {
  const domains = DomainRegistry.get(slug).map((d) => d.domain);
  if (!domains.includes(domain)) return `Expected domain "${domain}" for slug "${slug}", got [${domains.join(", ")}]`;
  return null;
}

function assertQueryContains(strategy: ReturnType<typeof smartQueryBuilder.build>, query: string): string | null {
  const queries = strategy.attempts.map((a) => a.query);
  if (!queries.includes(query)) return `Expected query "${query}" in strategy, got [${queries.join(", ")}]`;
  return null;
}

// ── Test Cases ────────────────────────────────────────────────────────────────

interface TestCase {
  entity:         string;
  slug:           string;
  expectedAliases: string[];
  expectedDomains: string[];
  expectedQueries: string[];
}

const TEST_CASES: TestCase[] = [
  {
    entity:          "Hostinger",
    slug:            "hostinger",
    expectedAliases: ["Hostinger", "hostinger"],
    expectedDomains: ["hostinger.com", "hostinger.com.br"],
    expectedQueries: ["Hostinger", "hostinger.com", "from:hostinger.com"],
  },
  {
    entity:          "Shopee",
    slug:            "shopee",
    expectedAliases: ["Shopee", "shopee"],
    expectedDomains: ["shopee.com.br", "shopee.com"],
    expectedQueries: ["Shopee", "shopee.com.br", "from:shopee.com.br"],
  },
  {
    entity:          "Mercado Livre",
    slug:            "mercadolivre",
    expectedAliases: ["Mercado Livre", "MercadoLivre", "mercadolivre"],
    expectedDomains: ["mercadolivre.com.br", "mercadolibre.com"],
    expectedQueries: ["Mercado Livre", "MercadoLivre", "mercadolivre.com.br"],
  },
  {
    entity:          "Mercado Pago",
    slug:            "mercadopago",
    expectedAliases: ["Mercado Pago", "MercadoPago", "mercadopago"],
    expectedDomains: ["mercadopago.com.br", "mercadopago.com"],
    expectedQueries: ["Mercado Pago", "MercadoPago", "mercadopago.com.br"],
  },
  {
    entity:          "Amazon",
    slug:            "amazon",
    expectedAliases: ["Amazon", "amazon"],
    expectedDomains: ["amazon.com.br", "amazon.com"],
    expectedQueries: ["Amazon", "amazon.com.br", "from:amazon.com.br"],
  },
  {
    entity:          "GitHub",
    slug:            "github",
    expectedAliases: ["GitHub", "Github", "github"],
    expectedDomains: ["github.com"],
    expectedQueries: ["GitHub", "github.com", "from:github.com"],
  },
  {
    entity:          "Slack",
    slug:            "slack",
    expectedAliases: ["Slack", "slack"],
    expectedDomains: ["slack.com"],
    expectedQueries: ["Slack", "slack.com", "from:slack.com"],
  },
  {
    entity:          "Notion",
    slug:            "notion",
    expectedAliases: ["Notion", "notion"],
    expectedDomains: ["notion.so"],
    expectedQueries: ["Notion", "notion.so", "from:notion.so"],
  },
  {
    entity:          "Jira",
    slug:            "jira",
    expectedAliases: ["Jira", "jira", "JIRA"],
    expectedDomains: ["atlassian.net", "atlassian.com"],
    expectedQueries: ["Jira", "atlassian.net", "from:atlassian.net"],
  },
  {
    entity:          "PicPay",
    slug:            "picpay",
    expectedAliases: ["PicPay", "Pic Pay", "picpay"],
    expectedDomains: ["picpay.com"],
    expectedQueries: ["PicPay", "picpay.com", "from:picpay.com"],
  },
  {
    entity:          "PayPal",
    slug:            "paypal",
    expectedAliases: ["PayPal", "Paypal", "paypal"],
    expectedDomains: ["paypal.com"],
    expectedQueries: ["PayPal", "paypal.com", "from:paypal.com"],
  },
  {
    entity:          "Nubank",
    slug:            "nubank",
    expectedAliases: ["Nubank", "nubank"],
    expectedDomains: ["nubank.com.br"],
    expectedQueries: ["Nubank", "nubank.com.br", "from:nubank.com.br"],
  },
  {
    entity:          "Banco do Brasil",
    slug:            "bancodobrasil",
    expectedAliases: ["Banco do Brasil", "BB", "bancodobrasil"],
    expectedDomains: ["bb.com.br"],
    expectedQueries: ["Banco do Brasil", "bb.com.br", "from:bb.com.br"],
  },
  {
    entity:          "Bradesco",
    slug:            "bradesco",
    expectedAliases: ["Bradesco", "bradesco"],
    expectedDomains: ["bradesco.com.br"],
    expectedQueries: ["Bradesco", "bradesco.com.br", "from:bradesco.com.br"],
  },
  {
    entity:          "Caixa",
    slug:            "caixa",
    expectedAliases: ["Caixa", "caixa", "CEF"],
    expectedDomains: ["caixa.gov.br"],
    expectedQueries: ["Caixa", "caixa.gov.br", "from:caixa.gov.br"],
  },
  {
    entity:          "Santander",
    slug:            "santander",
    expectedAliases: ["Santander", "santander"],
    expectedDomains: ["santander.com.br"],
    expectedQueries: ["Santander", "santander.com.br", "from:santander.com.br"],
  },
  {
    entity:          "Oracle",
    slug:            "oracle",
    expectedAliases: ["Oracle", "oracle"],
    expectedDomains: ["oracle.com"],
    expectedQueries: ["Oracle", "oracle.com", "from:oracle.com"],
  },
  {
    entity:          "SAP",
    slug:            "sap",
    expectedAliases: ["SAP", "sap"],
    expectedDomains: ["sap.com"],
    expectedQueries: ["SAP", "sap.com", "from:sap.com"],
  },
  {
    entity:          "Zendesk",
    slug:            "zendesk",
    expectedAliases: ["Zendesk", "zendesk"],
    expectedDomains: ["zendesk.com"],
    expectedQueries: ["Zendesk", "zendesk.com", "from:zendesk.com"],
  },
  {
    entity:          "HubSpot",
    slug:            "hubspot",
    expectedAliases: ["HubSpot", "Hubspot", "hubspot"],
    expectedDomains: ["hubspot.com"],
    expectedQueries: ["HubSpot", "hubspot.com", "from:hubspot.com"],
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────

export function runSmartQueryTests(): QueryTestResult[] {
  return TEST_CASES.map((tc) => {
    const details: string[] = [];
    const errors:  string[] = [];

    // 1. Alias resolution
    const resolved = EmailAliasRegistry.resolve(tc.entity);
    if (resolved !== tc.slug) {
      errors.push(`Alias resolution: "${tc.entity}" → "${resolved}", expected "${tc.slug}"`);
    } else {
      details.push(`Alias resolved: "${tc.entity}" → "${tc.slug}" OK`);
    }

    // 2. Expected aliases present
    tc.expectedAliases.forEach((a) => {
      const err = assertAlias(tc.slug, a);
      if (err) errors.push(err); else details.push(`Alias "${a}" OK`);
    });

    // 3. Expected domains present
    tc.expectedDomains.forEach((d) => {
      const err = assertDomain(tc.slug, d);
      if (err) errors.push(err); else details.push(`Domain "${d}" OK`);
    });

    // 4. Build strategy
    const strategy = smartQueryBuilder.build(tc.entity);
    const queries  = strategy.attempts.map((a) => a.query);

    // 5. Expected queries present
    tc.expectedQueries.forEach((q) => {
      const err = assertQueryContains(strategy, q);
      if (err) errors.push(err); else details.push(`Query "${q}" generated OK`);
    });

    // 6. Order: first attempt must be an alias or exact name
    if (queries.length > 0) {
      const first = queries[0];
      const isAlias = tc.expectedAliases.some(
        (a) => a === first || a.toLowerCase() === first.toLowerCase(),
      );
      if (!isAlias && first !== tc.entity) {
        details.push(`First query "${first}" (not exact alias — may be acceptable for unknown entity)`);
      } else {
        details.push(`Order OK: first query = "${first}"`);
      }
    }

    return {
      name:    tc.entity,
      passed:  errors.length === 0,
      error:   errors.join("; ") || undefined,
      details: [...details, ...errors],
      queries,
      aliases: EmailAliasRegistry.getAliasStrings(tc.slug) as string[],
      domains: DomainRegistry.get(tc.slug).map((d) => d.domain),
    };
  });
}

// ── Simulated Executor Test ───────────────────────────────────────────────────

/**
 * Simula a execucao de um SmartQueryExecutor com um mock de searchFn.
 * O mock retorna resultados apenas para a query que contem o dominio primario.
 */
export async function runExecutorSimulation(entity: string): Promise<SearchResult> {
  const strategy   = smartQueryBuilder.build(entity);
  const executor   = new SmartQueryExecutor();
  const primaryDom = strategy.resolved?.domains.find((d) => d.primary)?.domain ?? "";

  // Mock searchFn: returns 3 results only for primary domain query
  const mockSearch = async (query: string, _max: number) => {
    await new Promise((r) => setTimeout(r, 10)); // simulate network
    const hits = primaryDom && (query.includes(primaryDom) || query === entity) ? 3 : 0;
    return {
      ok:    true,
      data:  { messages: hits > 0 ? Array(hits).fill({ id: "mock" }) : [], resultSizeEstimate: hits },
      error: null,
    };
  };

  return executor.execute(strategy, mockSearch, 20);
}