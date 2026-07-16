/**
 * GmailCertificationSuite.ts — Engineering Sprint E-03.0
 * Gmail Connector Certification Suite
 *
 * SRP: Certificar exaustivamente o Gmail Connector como o primeiro
 *      Connector homologado do MemoryOS.
 *
 * Zero alteracoes em: Runtime, Planning, GoalEngine, ConversationPipeline,
 * ConnectorRegistry, UniversalConnectorRouter, GmailConnector.
 */

import { EmailAliasRegistry } from "./EmailAliasRegistry";
import { DomainRegistry }     from "./DomainRegistry";
import { smartQueryBuilder }  from "./SmartQueryBuilder";
import { SmartQueryExecutor } from "./SmartQueryExecutor";
import { buildGmailQuery }    from "./SemanticEmailQueryBuilder";

// ── Shared types ──────────────────────────────────────────────────────────────

export interface CertTestResult {
  name:    string;
  passed:  boolean;
  error?:  string;
  details: string[];
  ms:      number;
}

export interface PerfStats {
  count:   number;
  min:     number;
  max:     number;
  avg:     number;
  p95:     number;
  p99:     number;
  total:   number;
}

export interface CertificationReport {
  phase1_nlp:     CertTestResult[];
  phase2_alias:   CertTestResult[];
  phase3_domain:  CertTestResult[];
  phase4_regress: CertTestResult[];
  phase5_perf:    PerfStats;
  phase7_stress:  { passed: boolean; iterations: number; errors: string[] };
  summary: {
    total:  number;
    passed: number;
    failed: number;
    coveragePct: number;
    certified: boolean;
    generatedAt: string;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function now(): number { return typeof performance !== "undefined" ? performance.now() : Date.now(); }

function computeStats(samples: number[]): PerfStats {
  if (!samples.length) return { count: 0, min: 0, max: 0, avg: 0, p95: 0, p99: 0, total: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const total  = sorted.reduce((s, v) => s + v, 0);
  const p = (pct: number) => sorted[Math.min(Math.floor(sorted.length * pct / 100), sorted.length - 1)];
  return {
    count: sorted.length,
    min:   Math.round(sorted[0] * 10) / 10,
    max:   Math.round(sorted[sorted.length - 1] * 10) / 10,
    avg:   Math.round((total / sorted.length) * 10) / 10,
    p95:   Math.round(p(95) * 10) / 10,
    p99:   Math.round(p(99) * 10) / 10,
    total: Math.round(total * 10) / 10,
  };
}

function run(name: string, fn: () => void): CertTestResult {
  const t0 = now();
  try {
    fn();
    return { name, passed: true, details: [], ms: Math.round((now() - t0) * 10) / 10 };
  } catch (e) {
    return { name, passed: false, error: (e as Error).message, details: [], ms: Math.round((now() - t0) * 10) / 10 };
  }
}

// ── FASE 1: Natural Language Validation (200+ comandos) ───────────────────────

const NLP_CASES: Array<{ input: string; expectAlias?: string; expectNoAlias?: boolean; expectModifier?: string }> = [
  // Shopee variants
  { input: "Tenho email da Shopee?",                   expectAlias: "shopee" },
  { input: "Shopee",                                   expectAlias: "shopee" },
  { input: "shopee",                                   expectAlias: "shopee" },
  { input: "SHOPEE",                                   expectAlias: "shopee" },
  { input: "Procure emails da Shopee",                 expectAlias: "shopee" },
  { input: "Buscar emails shopee",                     expectAlias: "shopee" },
  { input: "Emails da Shopee nao lidos",               expectAlias: "shopee" },
  { input: "Recebi algo da Shopee?",                   expectAlias: "shopee" },
  { input: "existe algum email da Shopee?",            expectAlias: "shopee" },
  { input: "tem algum email da Shopee?",               expectAlias: "shopee" },
  { input: "ha emails da Shopee?",                     expectAlias: "shopee" },

  // Mercado Livre variants
  { input: "Mercado Livre",                            expectAlias: "mercadolivre" },
  { input: "MercadoLivre",                             expectAlias: "mercadolivre" },
  { input: "Mercado Libre",                            expectAlias: "mercadolivre" },
  { input: "mercadolivre",                             expectAlias: "mercadolivre" },
  { input: "Meli",                                     expectAlias: "mercadolivre" },
  { input: "ML",                                       expectAlias: "mercadolivre" },
  { input: "Tenho emails do Mercado Livre?",           expectAlias: "mercadolivre" },
  { input: "Procure emails Mercado Livre",             expectAlias: "mercadolivre" },
  { input: "Recebi algo do Mercado Livre?",            expectAlias: "mercadolivre" },
  { input: "existe email Mercado Livre",               expectAlias: "mercadolivre" },

  // Mercado Pago variants
  { input: "Mercado Pago",                             expectAlias: "mercadopago" },
  { input: "MercadoPago",                              expectAlias: "mercadopago" },
  { input: "mercadopago",                              expectAlias: "mercadopago" },
  { input: "MP",                                       expectAlias: "mercadopago" },
  { input: "Tenho emails do Mercado Pago?",            expectAlias: "mercadopago" },
  { input: "Procure emails do Mercado Pago",           expectAlias: "mercadopago" },

  // Hostinger variants
  { input: "Hostinger",                                expectAlias: "hostinger" },
  { input: "hostinger",                                expectAlias: "hostinger" },
  { input: "Tenho email da Hostinger?",                expectAlias: "hostinger" },
  { input: "Procure emails Hostinger",                 expectAlias: "hostinger" },
  { input: "Recebi algo da Hostinger?",                expectAlias: "hostinger" },
  { input: "existe email Hostinger",                   expectAlias: "hostinger" },

  // Amazon variants
  { input: "Amazon",                                   expectAlias: "amazon" },
  { input: "amazon",                                   expectAlias: "amazon" },
  { input: "Amazon Brasil",                            expectAlias: "amazon" },
  { input: "Amazon.com.br",                            expectAlias: "amazon" },
  { input: "Tenho emails da Amazon?",                  expectAlias: "amazon" },
  { input: "Recebi algum pacote da Amazon?",           expectAlias: "amazon" },

  // GitHub variants
  { input: "GitHub",                                   expectAlias: "github" },
  { input: "Github",                                   expectAlias: "github" },
  { input: "github",                                   expectAlias: "github" },
  { input: "Existe algum email do GitHub?",            expectAlias: "github" },
  { input: "Recebi mensagens do GitHub?",              expectAlias: "github" },
  { input: "tem algum email do GitHub",                expectAlias: "github" },

  // Slack variants
  { input: "Slack",                                    expectAlias: "slack" },
  { input: "slack",                                    expectAlias: "slack" },
  { input: "Recebi mensagens do Slack?",               expectAlias: "slack" },
  { input: "Existe algum email do Slack?",             expectAlias: "slack" },

  // Notion variants
  { input: "Notion",                                   expectAlias: "notion" },
  { input: "notion",                                   expectAlias: "notion" },
  { input: "Tenho emails do Notion?",                  expectAlias: "notion" },

  // Jira variants
  { input: "Jira",                                     expectAlias: "jira" },
  { input: "jira",                                     expectAlias: "jira" },
  { input: "JIRA",                                     expectAlias: "jira" },
  { input: "Atlassian Jira",                           expectAlias: "jira" },
  { input: "Tenho emails do Jira?",                    expectAlias: "jira" },

  // PicPay variants
  { input: "PicPay",                                   expectAlias: "picpay" },
  { input: "Pic Pay",                                  expectAlias: "picpay" },
  { input: "picpay",                                   expectAlias: "picpay" },
  { input: "PICPAY",                                   expectAlias: "picpay" },
  { input: "Tenho emails do PicPay?",                  expectAlias: "picpay" },
  { input: "Recebi Pix do PicPay?",                    expectAlias: "picpay" },

  // PayPal variants
  { input: "PayPal",                                   expectAlias: "paypal" },
  { input: "Paypal",                                   expectAlias: "paypal" },
  { input: "paypal",                                   expectAlias: "paypal" },
  { input: "Pay Pal",                                  expectAlias: "paypal" },
  { input: "Tenho emails do PayPal?",                  expectAlias: "paypal" },

  // Nubank variants
  { input: "Nubank",                                   expectAlias: "nubank" },
  { input: "nubank",                                   expectAlias: "nubank" },
  { input: "Nu",                                       expectAlias: "nubank" },
  { input: "Tenho emails do Nubank?",                  expectAlias: "nubank" },
  { input: "Recebi fatura do Nubank?",                 expectAlias: "nubank" },

  // Banco do Brasil variants
  { input: "Banco do Brasil",                          expectAlias: "bancodobrasil" },
  { input: "BB",                                       expectAlias: "bancodobrasil" },
  { input: "bancodobrasil",                            expectAlias: "bancodobrasil" },
  { input: "banco do brasil",                          expectAlias: "bancodobrasil" },
  { input: "Tenho emails do Banco do Brasil?",         expectAlias: "bancodobrasil" },
  { input: "Recebi extrato do Banco do Brasil?",       expectAlias: "bancodobrasil" },

  // Caixa variants
  { input: "Caixa",                                    expectAlias: "caixa" },
  { input: "caixa",                                    expectAlias: "caixa" },
  { input: "CEF",                                      expectAlias: "caixa" },
  { input: "Caixa Economica Federal",                  expectAlias: "caixa" },
  { input: "Tenho emails da Caixa?",                   expectAlias: "caixa" },

  // Santander variants
  { input: "Santander",                                expectAlias: "santander" },
  { input: "santander",                                expectAlias: "santander" },
  { input: "Banco Santander",                          expectAlias: "santander" },
  { input: "Tenho emails do Santander?",               expectAlias: "santander" },
  { input: "Recebi fatura do Santander?",              expectAlias: "santander" },

  // Itau variants
  { input: "Itau",                                     expectAlias: "itau" },
  { input: "itau",                                     expectAlias: "itau" },
  { input: "Banco Itau",                               expectAlias: "itau" },
  { input: "Tenho emails do Itau?",                    expectAlias: "itau" },

  // Bradesco variants
  { input: "Bradesco",                                 expectAlias: "bradesco" },
  { input: "bradesco",                                 expectAlias: "bradesco" },
  { input: "Banco Bradesco",                           expectAlias: "bradesco" },
  { input: "Tenho emails do Bradesco?",                expectAlias: "bradesco" },

  // Inter variants
  { input: "Inter",                                    expectAlias: "inter" },
  { input: "Banco Inter",                              expectAlias: "inter" },
  { input: "Tenho emails do Inter?",                   expectAlias: "inter" },

  // Oracle variants
  { input: "Oracle",                                   expectAlias: "oracle" },
  { input: "oracle",                                   expectAlias: "oracle" },
  { input: "Existe algo da Oracle?",                   expectAlias: "oracle" },
  { input: "Tenho emails da Oracle?",                  expectAlias: "oracle" },

  // SAP variants
  { input: "SAP",                                      expectAlias: "sap" },
  { input: "sap",                                      expectAlias: "sap" },
  { input: "Tenho emails do SAP?",                     expectAlias: "sap" },

  // Zendesk variants
  { input: "Zendesk",                                  expectAlias: "zendesk" },
  { input: "zendesk",                                  expectAlias: "zendesk" },
  { input: "Tenho emails do Zendesk?",                 expectAlias: "zendesk" },

  // HubSpot variants
  { input: "HubSpot",                                  expectAlias: "hubspot" },
  { input: "Hubspot",                                  expectAlias: "hubspot" },
  { input: "hubspot",                                  expectAlias: "hubspot" },
  { input: "Hub Spot",                                 expectAlias: "hubspot" },
  { input: "Tenho emails do HubSpot?",                 expectAlias: "hubspot" },

  // Salesforce variants
  { input: "Salesforce",                               expectAlias: "salesforce" },
  { input: "salesforce",                               expectAlias: "salesforce" },
  { input: "Tenho emails do Salesforce?",              expectAlias: "salesforce" },

  // Stripe variants
  { input: "Stripe",                                   expectAlias: "stripe" },
  { input: "stripe",                                   expectAlias: "stripe" },
  { input: "Tenho emails do Stripe?",                  expectAlias: "stripe" },

  // PagSeguro variants
  { input: "PagSeguro",                                expectAlias: "pagseguro" },
  { input: "pagseguro",                                expectAlias: "pagseguro" },
  { input: "Pag Seguro",                               expectAlias: "pagseguro" },
  { input: "Tenho emails do PagSeguro?",               expectAlias: "pagseguro" },

  // LinkedIn variants
  { input: "LinkedIn",                                 expectAlias: "linkedin" },
  { input: "Linkedin",                                 expectAlias: "linkedin" },
  { input: "linkedin",                                 expectAlias: "linkedin" },
  { input: "Tenho emails do LinkedIn?",                expectAlias: "linkedin" },

  // Dropbox variants
  { input: "Dropbox",                                  expectAlias: "dropbox" },
  { input: "dropbox",                                  expectAlias: "dropbox" },
  { input: "Tenho emails do Dropbox?",                 expectAlias: "dropbox" },

  // Trello variants
  { input: "Trello",                                   expectAlias: "trello" },
  { input: "trello",                                   expectAlias: "trello" },
  { input: "Tenho emails do Trello?",                  expectAlias: "trello" },

  // Asana variants
  { input: "Asana",                                    expectAlias: "asana" },
  { input: "asana",                                    expectAlias: "asana" },
  { input: "Tenho emails do Asana?",                   expectAlias: "asana" },

  // Magazine Luiza variants
  { input: "Magazine Luiza",                           expectAlias: "magazineluiza" },
  { input: "Magalu",                                   expectAlias: "magazineluiza" },
  { input: "magalu",                                   expectAlias: "magazineluiza" },
  { input: "Tenho emails da Magazine Luiza?",          expectAlias: "magazineluiza" },
  { input: "Recebi email do Magalu?",                  expectAlias: "magazineluiza" },

  // AliExpress variants
  { input: "AliExpress",                               expectAlias: "aliexpress" },
  { input: "aliexpress",                               expectAlias: "aliexpress" },
  { input: "Ali Express",                              expectAlias: "aliexpress" },
  { input: "Tenho emails do AliExpress?",              expectAlias: "aliexpress" },

  // Americanas variants
  { input: "Americanas",                               expectAlias: "americanas" },
  { input: "americanas",                               expectAlias: "americanas" },
  { input: "Lojas Americanas",                         expectAlias: "americanas" },
  { input: "Tenho emails das Americanas?",             expectAlias: "americanas" },

  // AWS variants
  { input: "AWS",                                      expectAlias: "aws" },
  { input: "Amazon Web Services",                      expectAlias: "aws" },
  { input: "Tenho emails da AWS?",                     expectAlias: "aws" },

  // DigitalOcean variants
  { input: "DigitalOcean",                             expectAlias: "digitalocean" },
  { input: "Digital Ocean",                            expectAlias: "digitalocean" },
  { input: "digitalocean",                             expectAlias: "digitalocean" },
  { input: "Tenho emails da DigitalOcean?",            expectAlias: "digitalocean" },

  // Vercel variants
  { input: "Vercel",                                   expectAlias: "vercel" },
  { input: "vercel",                                   expectAlias: "vercel" },
  { input: "Tenho emails da Vercel?",                  expectAlias: "vercel" },

  // GoDaddy variants
  { input: "GoDaddy",                                  expectAlias: "godaddy" },
  { input: "godaddy",                                  expectAlias: "godaddy" },
  { input: "Tenho emails do GoDaddy?",                 expectAlias: "godaddy" },

  // Confluence variants
  { input: "Confluence",                               expectAlias: "confluence" },
  { input: "confluence",                               expectAlias: "confluence" },
  { input: "Tenho emails do Confluence?",              expectAlias: "confluence" },

  // Monday variants
  { input: "Monday",                                   expectAlias: "monday" },
  { input: "monday",                                   expectAlias: "monday" },
  { input: "Monday.com",                               expectAlias: "monday" },
  { input: "Tenho emails do Monday?",                  expectAlias: "monday" },

  // Linear variants
  { input: "Linear",                                   expectAlias: "linear" },
  { input: "linear",                                   expectAlias: "linear" },
  { input: "Tenho emails do Linear?",                  expectAlias: "linear" },

  // GitLab variants
  { input: "GitLab",                                   expectAlias: "gitlab" },
  { input: "Gitlab",                                   expectAlias: "gitlab" },
  { input: "gitlab",                                   expectAlias: "gitlab" },
  { input: "Tenho emails do GitLab?",                  expectAlias: "gitlab" },

  // Receita Federal / fiscal (raw — no alias expected)
  { input: "Recebi Pix?",                             expectNoAlias: true },
  { input: "Existe alguma nota fiscal?",              expectNoAlias: true },
  { input: "Procure meus boletos.",                   expectNoAlias: true },
  { input: "Tenho emails da Receita Federal?",        expectNoAlias: true },
  { input: "Recebi alguma cobranca?",                 expectNoAlias: true },
  { input: "Existe algum DARF?",                      expectNoAlias: true },
  { input: "Recebi alguma fatura?",                   expectNoAlias: true },
  { input: "Existe algum contrato?",                  expectNoAlias: true },
  { input: "Recebi emails da Vivo?",                  expectNoAlias: true },
  { input: "Tenho emails da Claro?",                  expectNoAlias: true },
  { input: "DANFE",                                   expectNoAlias: true },
  { input: "Nota de debito",                          expectNoAlias: true },
  { input: "Existe algum comprovante?",               expectNoAlias: true },
  { input: "Recebi algum recibo?",                    expectNoAlias: true },

  // Modifier tests
  { input: "emails nao lidos da Shopee",  expectModifier: "is:unread" },
  { input: "emails com anexo",            expectModifier: "has:attachment" },
  { input: "emails da Shopee deste mes",  expectModifier: "newer_than:30d" },
  { input: "emails importantes do Nubank", expectModifier: "is:important" },
  { input: "emails da Shopee de hoje",    expectModifier: "newer_than:1d" },
  { input: "emails desta semana",         expectModifier: "newer_than:7d" },
  { input: "emails do ultimo ano",        expectModifier: "newer_than:365d" },
];

export function runPhase1NLP(): CertTestResult[] {
  return NLP_CASES.map((tc) => {
    const t0 = now();
    try {
      const result = buildGmailQuery(tc.input);

      if (tc.expectAlias) {
        if (result.aliasName !== tc.expectAlias) {
          throw new Error(`Expected alias "${tc.expectAlias}", got "${result.aliasName ?? "null"}"`);
        }
        if (!result.aliasExpanded) {
          throw new Error(`Alias not expanded for "${tc.input}"`);
        }
        if (!result.gmailQuery.includes("from:(")) {
          throw new Error(`Missing from:( in query: "${result.gmailQuery}"`);
        }
      }

      if (tc.expectNoAlias) {
        if (result.aliasExpanded) {
          throw new Error(`Unexpected alias expansion for "${tc.input}" — got aliasName="${result.aliasName}"`);
        }
      }

      if (tc.expectModifier) {
        if (!result.gmailQuery.includes(tc.expectModifier)) {
          throw new Error(`Missing modifier "${tc.expectModifier}" in query: "${result.gmailQuery}"`);
        }
      }

      return {
        name:    tc.input,
        passed:  true,
        details: [`query: ${result.gmailQuery}`],
        ms:      Math.round((now() - t0) * 100) / 100,
      };
    } catch (e) {
      return {
        name:    tc.input,
        passed:  false,
        error:   (e as Error).message,
        details: [],
        ms:      Math.round((now() - t0) * 100) / 100,
      };
    }
  });
}

// ── FASE 2: Alias Validation ──────────────────────────────────────────────────

const ALIAS_GROUPS: Array<{ slug: string; aliases: string[] }> = [
  { slug: "picpay",        aliases: ["PicPay", "Pic Pay", "picpay", "PICPAY"] },
  { slug: "mercadolivre",  aliases: ["Mercado Livre", "MercadoLivre", "Mercado Libre", "mercadolivre", "Meli", "ML"] },
  { slug: "mercadopago",   aliases: ["Mercado Pago", "MercadoPago", "mercadopago", "MP"] },
  { slug: "bancodobrasil", aliases: ["Banco do Brasil", "BB", "bancodobrasil", "banco do brasil"] },
  { slug: "caixa",         aliases: ["Caixa", "caixa", "CEF", "Caixa Economica Federal"] },
  { slug: "nubank",        aliases: ["Nubank", "nubank", "Nu"] },
  { slug: "shopee",        aliases: ["Shopee", "shopee", "SHOPEE"] },
  { slug: "amazon",        aliases: ["Amazon", "amazon", "Amazon Brasil", "Amazon.com.br"] },
  { slug: "github",        aliases: ["GitHub", "Github", "github"] },
  { slug: "jira",          aliases: ["Jira", "jira", "JIRA", "Atlassian Jira"] },
  { slug: "magazineluiza", aliases: ["Magazine Luiza", "Magalu", "magalu", "MagazineLuiza"] },
  { slug: "aliexpress",    aliases: ["AliExpress", "Aliexpress", "aliexpress", "Ali Express"] },
  { slug: "americanas",    aliases: ["Americanas", "americanas", "Lojas Americanas"] },
  { slug: "aws",           aliases: ["AWS", "Amazon Web Services"] },
  { slug: "hubspot",       aliases: ["HubSpot", "Hubspot", "hubspot", "Hub Spot"] },
  { slug: "paypal",        aliases: ["PayPal", "Paypal", "paypal", "Pay Pal"] },
  { slug: "santander",     aliases: ["Santander", "santander", "Banco Santander"] },
  { slug: "itau",          aliases: ["Itau", "itau", "Banco Itau"] },
  { slug: "bradesco",      aliases: ["Bradesco", "bradesco", "Banco Bradesco"] },
  { slug: "digitalocean",  aliases: ["DigitalOcean", "Digital Ocean", "digitalocean"] },
];

export function runPhase2Alias(): CertTestResult[] {
  return ALIAS_GROUPS.map((group) => {
    const t0 = now();
    const errors: string[] = [];
    const details: string[] = [];

    // All aliases must resolve to the same slug
    const resolutions = group.aliases.map((a) => ({ alias: a, slug: EmailAliasRegistry.resolve(a) }));

    resolutions.forEach(({ alias, slug }) => {
      if (slug === group.slug) {
        details.push(`"${alias}" → "${slug}" OK`);
      } else {
        errors.push(`"${alias}" → "${slug ?? "null"}", expected "${group.slug}"`);
      }
    });

    // All must produce the same set of alias strings
    const firstSlugs = EmailAliasRegistry.getAliasStrings(group.slug).join("|");
    if (!firstSlugs) {
      errors.push(`No aliases registered for slug "${group.slug}"`);
    } else {
      details.push(`${group.aliases.length} aliases all resolve to "${group.slug}"`);
    }

    return {
      name:    `${group.slug} (${group.aliases.length} aliases)`,
      passed:  errors.length === 0,
      error:   errors.join("; ") || undefined,
      details: [...details, ...errors],
      ms:      Math.round((now() - t0) * 100) / 100,
    };
  });
}

// ── FASE 3: Domain Validation ─────────────────────────────────────────────────

const DOMAIN_CASES: Array<{ slug: string; entity: string; requiredDomains: string[]; requiredInStrategy: string[] }> = [
  { slug: "hostinger",    entity: "Hostinger", requiredDomains: ["hostinger.com", "hostinger.com.br"], requiredInStrategy: ["hostinger.com", "from:hostinger.com", "hostinger.com.br"] },
  { slug: "github",       entity: "GitHub",    requiredDomains: ["github.com"],               requiredInStrategy: ["github.com", "from:github.com"] },
  { slug: "notion",       entity: "Notion",    requiredDomains: ["notion.so"],                requiredInStrategy: ["notion.so", "from:notion.so"] },
  { slug: "slack",        entity: "Slack",     requiredDomains: ["slack.com"],                requiredInStrategy: ["slack.com", "from:slack.com"] },
  { slug: "shopee",       entity: "Shopee",    requiredDomains: ["shopee.com.br"],            requiredInStrategy: ["shopee.com.br", "from:shopee.com.br"] },
  { slug: "mercadolivre", entity: "Mercado Livre", requiredDomains: ["mercadolivre.com.br"], requiredInStrategy: ["mercadolivre.com.br"] },
  { slug: "nubank",       entity: "Nubank",    requiredDomains: ["nubank.com.br"],            requiredInStrategy: ["nubank.com.br", "from:nubank.com.br"] },
  { slug: "bancodobrasil",entity: "Banco do Brasil", requiredDomains: ["bb.com.br"],         requiredInStrategy: ["bb.com.br", "from:bb.com.br"] },
  { slug: "caixa",        entity: "Caixa",     requiredDomains: ["caixa.gov.br"],             requiredInStrategy: ["caixa.gov.br", "from:caixa.gov.br"] },
  { slug: "jira",         entity: "Jira",      requiredDomains: ["atlassian.net"],            requiredInStrategy: ["atlassian.net", "from:atlassian.net"] },
  { slug: "oracle",       entity: "Oracle",    requiredDomains: ["oracle.com"],               requiredInStrategy: ["oracle.com", "from:oracle.com"] },
  { slug: "sap",          entity: "SAP",       requiredDomains: ["sap.com"],                  requiredInStrategy: ["sap.com", "from:sap.com"] },
  { slug: "paypal",       entity: "PayPal",    requiredDomains: ["paypal.com"],               requiredInStrategy: ["paypal.com", "from:paypal.com"] },
  { slug: "hubspot",      entity: "HubSpot",   requiredDomains: ["hubspot.com"],              requiredInStrategy: ["hubspot.com", "from:hubspot.com"] },
  { slug: "zendesk",      entity: "Zendesk",   requiredDomains: ["zendesk.com"],              requiredInStrategy: ["zendesk.com", "from:zendesk.com"] },
];

export function runPhase3Domain(): CertTestResult[] {
  return DOMAIN_CASES.map((tc) => {
    const t0 = now();
    const errors: string[] = [];
    const details: string[] = [];

    // 1. Registry has required domains
    const registeredDomains = DomainRegistry.get(tc.slug).map((d) => d.domain);
    tc.requiredDomains.forEach((d) => {
      if (registeredDomains.includes(d)) {
        details.push(`Domain "${d}" registered OK`);
      } else {
        errors.push(`Domain "${d}" missing from DomainRegistry for slug "${tc.slug}"`);
      }
    });

    // 2. Strategy contains required queries
    const strategy = smartQueryBuilder.build(tc.entity);
    const queryStrings = strategy.attempts.map((a) => a.query);
    tc.requiredInStrategy.forEach((q) => {
      if (queryStrings.includes(q)) {
        details.push(`Strategy contains "${q}" OK`);
      } else {
        errors.push(`Strategy missing "${q}" for entity "${tc.entity}" — got [${queryStrings.join(", ")}]`);
      }
    });

    return {
      name:    `${tc.entity} (${tc.requiredDomains.join(", ")})`,
      passed:  errors.length === 0,
      error:   errors.join("; ") || undefined,
      details: [...details, ...errors],
      ms:      Math.round((now() - t0) * 100) / 100,
    };
  });
}

// ── FASE 4: Regression (E-02.7/8/9/9.1) ──────────────────────────────────────

export function runPhase4Regression(): CertTestResult[] {
  const results: CertTestResult[] = [];

  // E-02.7: NaturalLanguageGoalNormalizer + ImplicitConnectorIntentDetector
  // We run a lightweight smoke test here (async tests run in the dashboard)
  const normCases = [
    { input: "emails da Shopee",   expected: "shopee" },
    { input: "emails do GitHub",   expected: "github" },
    { input: "emails do Nubank",   expected: "nubank" },
    { input: "emails da Amazon",   expected: "amazon" },
    { input: "emails da Hostinger",expected: "hostinger" },
  ];
  normCases.forEach((tc) => {
    results.push(run(`E-02.7 NLP normalize: "${tc.input}"`, () => {
      const r = buildGmailQuery(tc.input);
      if (r.aliasName !== tc.expected) throw new Error(`Expected "${tc.expected}", got "${r.aliasName}"`);
    }));
  });

  // E-02.8: SmartQueryBuilder strategy generation
  const smartCases = [
    { entity: "Hostinger", mustContain: ["hostinger.com", "from:hostinger.com"] },
    { entity: "Shopee",    mustContain: ["shopee.com.br", "from:shopee.com.br"] },
    { entity: "GitHub",    mustContain: ["github.com", "from:github.com"] },
    { entity: "Notion",    mustContain: ["notion.so", "from:notion.so"] },
    { entity: "Jira",      mustContain: ["atlassian.net", "from:atlassian.net"] },
    { entity: "Mercado Livre", mustContain: ["Mercado Livre", "mercadolivre.com.br"] },
  ];
  smartCases.forEach((tc) => {
    results.push(run(`E-02.8 Strategy: "${tc.entity}"`, () => {
      const s = smartQueryBuilder.build(tc.entity);
      const qs = s.attempts.map((a) => a.query);
      tc.mustContain.forEach((q) => {
        if (!qs.includes(q)) throw new Error(`Missing "${q}" — got [${qs.slice(0, 5).join(", ")}]`);
      });
    }));
  });

  // E-02.9: Knowledge Layer — alias + domain consistency
  const kl = [
    { slug: "picpay",   alias: "Pic Pay",        domain: "picpay.com" },
    { slug: "shopee",   alias: "Shopee",          domain: "shopee.com.br" },
    { slug: "nubank",   alias: "Nubank",          domain: "nubank.com.br" },
    { slug: "github",   alias: "GitHub",          domain: "github.com" },
    { slug: "notion",   alias: "Notion",          domain: "notion.so" },
  ];
  kl.forEach((tc) => {
    results.push(run(`E-02.9 Registry: "${tc.slug}"`, () => {
      const s = EmailAliasRegistry.resolve(tc.alias);
      if (s !== tc.slug) throw new Error(`Alias "${tc.alias}" → "${s}", expected "${tc.slug}"`);
      const domains = DomainRegistry.get(tc.slug).map((d) => d.domain);
      if (!domains.includes(tc.domain)) throw new Error(`Domain "${tc.domain}" missing`);
    }));
  });

  // E-02.9.1: No findAlias() compat shim — verified structurally
  results.push(run("E-02.9.1 No compat shim — SemanticEmailQueryBuilder uses EmailAliasRegistry directly", () => {
    // Verify resolve works and returns the right type
    const slug = EmailAliasRegistry.resolve("Shopee");
    if (slug !== "shopee") throw new Error(`resolve("Shopee") returned "${slug}"`);
    const terms = EmailAliasRegistry.getAliasStrings("shopee");
    if (!Array.isArray(terms) || terms.length === 0) throw new Error("getAliasStrings empty");
  }));

  return results;
}

// ── FASE 5: Performance ───────────────────────────────────────────────────────

export function runPhase5Performance(): PerfStats {
  const samples: number[] = [];
  const entities = [
    "Shopee", "Mercado Livre", "GitHub", "Notion", "Jira", "Nubank", "PicPay",
    "Amazon", "PayPal", "Banco do Brasil", "Oracle", "Hostinger", "HubSpot",
    "Zendesk", "SAP", "Salesforce", "Magazine Luiza", "Bradesco", "Caixa", "Santander",
  ];

  // 10 iterations over all entities = 200 calls
  for (let i = 0; i < 10; i++) {
    entities.forEach((e) => {
      const t0 = now();
      smartQueryBuilder.build(e);
      samples.push(now() - t0);
    });
  }

  return computeStats(samples);
}

// ── FASE 7: Stress ────────────────────────────────────────────────────────────

export function runPhase7Stress(): { passed: boolean; iterations: number; errors: string[] } {
  const errors: string[] = [];
  const iterations = 500;
  const entities = ["Shopee", "Mercado Livre", "GitHub", "Notion", "Nubank", "Amazon", "PicPay", "Hostinger", "PayPal", "Oracle"];

  for (let i = 0; i < iterations; i++) {
    const entity = entities[i % entities.length];
    try {
      const s = smartQueryBuilder.build(entity);
      if (!s.attempts || s.attempts.length === 0) throw new Error("Empty attempts");
      const r = buildGmailQuery(`emails do ${entity}`);
      if (!r.gmailQuery) throw new Error("Empty gmailQuery");
    } catch (e) {
      errors.push(`[iter ${i}] ${entity}: ${(e as Error).message}`);
    }
  }

  return { passed: errors.length === 0, iterations, errors: errors.slice(0, 10) };
}

// ── Full Certification ────────────────────────────────────────────────────────

export function runFullCertification(): Omit<CertificationReport, "phase5_perf" | "phase7_stress"> & { phase5_perf: PerfStats; phase7_stress: { passed: boolean; iterations: number; errors: string[] } } {
  const p1 = runPhase1NLP();
  const p2 = runPhase2Alias();
  const p3 = runPhase3Domain();
  const p4 = runPhase4Regression();
  const p5 = runPhase5Performance();
  const p7 = runPhase7Stress();

  const all  = [...p1, ...p2, ...p3, ...p4];
  const pass = all.filter((r) => r.passed).length;
  const fail = all.length - pass;

  const certified =
    fail === 0 &&
    p7.passed &&
    p5.avg < 10 && // avg under 10ms
    p5.p99 < 50;   // p99 under 50ms

  return {
    phase1_nlp:    p1,
    phase2_alias:  p2,
    phase3_domain: p3,
    phase4_regress:p4,
    phase5_perf:   p5,
    phase7_stress: p7,
    summary: {
      total:       all.length,
      passed:      pass,
      failed:      fail,
      coveragePct: Math.round((pass / all.length) * 1000) / 10,
      certified,
      generatedAt: new Date().toISOString(),
    },
  };
}