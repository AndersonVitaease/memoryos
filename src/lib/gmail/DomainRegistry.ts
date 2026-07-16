/**
 * DomainRegistry.ts — Engineering Sprint E-02.9
 * Connector Knowledge Layer
 *
 * SRP: Conhecer dominios de entidades. Apenas isso.
 *
 * Jamais constroi queries.
 * Jamais executa buscas.
 * Jamais conhece aliases.
 *
 * Extensibilidade: adicionar uma nova empresa exige apenas chamar
 * DomainRegistry.register() — nenhum outro arquivo precisa mudar.
 *
 * Reutilizavel por qualquer conector futuro (Drive, Calendar, GitHub,
 * Slack, Notion, Dropbox, OneDrive, Outlook, Teams, Discord, WhatsApp,
 * Facebook, Instagram, TikTok) sem modificar Runtime, Planning, Router
 * ou Registry.
 */

import type { DomainDescriptor } from "./SmartQueryTypes";

// ── DomainRegistryClass ───────────────────────────────────────────────────────

class DomainRegistryClass {
  private readonly _map = new Map<string, DomainDescriptor[]>();

  /**
   * Registra dominios para um slug canonico (lower-case).
   * Idempotente: chamadas duplicadas para o mesmo slug sao ignoradas.
   */
  register(slug: string, domains: DomainDescriptor[]): void {
    const key = slug.toLowerCase().trim();
    if (this._map.has(key)) return;
    this._map.set(key, [...domains]);
  }

  /**
   * Retorna os dominios para o slug dado.
   * Dominio primario sempre primeiro.
   */
  get(slug: string): readonly DomainDescriptor[] {
    return this._map.get(slug.toLowerCase().trim()) ?? [];
  }

  /** Dominio primario para o slug, ou null se desconhecido. */
  primary(slug: string): string | null {
    const entries = this.get(slug);
    return entries.find((d) => d.primary)?.domain ?? entries[0]?.domain ?? null;
  }

  /** Lista todos os slugs registrados. */
  listSlugs(): readonly string[] {
    return [...this._map.keys()];
  }

  get size(): number {
    return this._map.size;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const _KEY = "__DOMAIN_REGISTRY__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new DomainRegistryClass();
}
export const DomainRegistry: DomainRegistryClass = (
  globalThis as unknown as Record<string, DomainRegistryClass>
)[_KEY];

// ── Built-in registrations ────────────────────────────────────────────────────
// Formato: register(slug, [{ domain, primary, region? }])

const _domains: Array<[string, DomainDescriptor[]]> = [
  // E-commerce / Marketplaces
  ["shopee",         [{ domain: "shopee.com.br", primary: true, region: "br" }, { domain: "shopee.com", primary: false }]],
  ["amazon",         [{ domain: "amazon.com.br", primary: true, region: "br" }, { domain: "amazon.com", primary: false }]],
  ["mercadolivre",   [{ domain: "mercadolivre.com.br", primary: true, region: "br" }, { domain: "mercadolibre.com", primary: false }]],
  ["americanas",     [{ domain: "americanas.com.br", primary: true, region: "br" }]],
  ["aliexpress",     [{ domain: "aliexpress.com", primary: true }]],
  ["magazineluiza",  [{ domain: "magazineluiza.com.br", primary: true, region: "br" }, { domain: "magalu.com.br", primary: false }]],

  // Financeiro / Pagamentos
  ["mercadopago",    [{ domain: "mercadopago.com.br", primary: true, region: "br" }, { domain: "mercadopago.com", primary: false }]],
  ["picpay",         [{ domain: "picpay.com", primary: true }]],
  ["nubank",         [{ domain: "nubank.com.br", primary: true, region: "br" }]],
  ["paypal",         [{ domain: "paypal.com", primary: true }]],
  ["pagseguro",      [{ domain: "pagseguro.com.br", primary: true, region: "br" }]],
  ["stripe",         [{ domain: "stripe.com", primary: true }]],

  // Bancos
  ["bradesco",       [{ domain: "bradesco.com.br", primary: true, region: "br" }]],
  ["bancodobrasil",  [{ domain: "bb.com.br", primary: true, region: "br" }]],
  ["caixa",          [{ domain: "caixa.gov.br", primary: true, region: "br" }]],
  ["santander",      [{ domain: "santander.com.br", primary: true, region: "br" }]],
  ["itau",           [{ domain: "itau.com.br", primary: true, region: "br" }]],
  ["inter",          [{ domain: "bancointer.com.br", primary: true, region: "br" }]],

  // Hospedagem / Cloud
  ["hostinger",      [{ domain: "hostinger.com", primary: true }, { domain: "hostinger.com.br", primary: false, region: "br" }]],
  ["godaddy",        [{ domain: "godaddy.com", primary: true }]],
  ["aws",            [{ domain: "amazonaws.com", primary: true }]],
  ["digitalocean",   [{ domain: "digitalocean.com", primary: true }]],
  ["vercel",         [{ domain: "vercel.com", primary: true }]],

  // Produtividade / SaaS
  ["notion",         [{ domain: "notion.so", primary: true }]],
  ["slack",          [{ domain: "slack.com", primary: true }]],
  ["hubspot",        [{ domain: "hubspot.com", primary: true }]],
  ["zendesk",        [{ domain: "zendesk.com", primary: true }]],
  ["jira",           [{ domain: "atlassian.net", primary: true }, { domain: "atlassian.com", primary: false }]],
  ["confluence",     [{ domain: "atlassian.net", primary: true }]],
  ["trello",         [{ domain: "trello.com", primary: true }]],
  ["asana",          [{ domain: "asana.com", primary: true }]],
  ["monday",         [{ domain: "monday.com", primary: true }]],
  ["linear",         [{ domain: "linear.app", primary: true }]],

  // Dev
  ["github",         [{ domain: "github.com", primary: true }]],
  ["gitlab",         [{ domain: "gitlab.com", primary: true }]],
  ["npm",            [{ domain: "npmjs.com", primary: true }]],

  // Enterprise / ERP
  ["oracle",         [{ domain: "oracle.com", primary: true }]],
  ["sap",            [{ domain: "sap.com", primary: true }]],
  ["salesforce",     [{ domain: "salesforce.com", primary: true }]],
  ["microsoft",      [{ domain: "microsoft.com", primary: true }]],

  // Google Workspace
  ["google",         [{ domain: "google.com", primary: true }]],
  ["youtube",        [{ domain: "youtube.com", primary: true }]],

  // Social / Comunicacao
  ["linkedin",       [{ domain: "linkedin.com", primary: true }]],
  ["twitter",        [{ domain: "twitter.com", primary: true }]],
  ["facebook",       [{ domain: "facebookmail.com", primary: true }]],
  ["instagram",      [{ domain: "facebookmail.com", primary: true }]],
  ["tiktok",         [{ domain: "tiktok.com", primary: true }]],
  ["discord",        [{ domain: "discord.com", primary: true }]],
  ["whatsapp",       [{ domain: "whatsapp.com", primary: true }]],

  // Storage / Docs
  ["dropbox",        [{ domain: "dropbox.com", primary: true }]],
  ["onedrive",       [{ domain: "microsoft.com", primary: true }]],
  ["outlook",        [{ domain: "microsoft.com", primary: true }]],
  ["teams",          [{ domain: "microsoft.com", primary: true }]],

  // Logistica / Delivery
  ["ifood",          [{ domain: "ifood.com.br", primary: true, region: "br" }]],
  ["rappi",          [{ domain: "rappi.com.br", primary: true, region: "br" }]],
  ["correios",       [{ domain: "correios.com.br", primary: true, region: "br" }]],
];

_domains.forEach(([slug, domains]) => DomainRegistry.register(slug, domains));