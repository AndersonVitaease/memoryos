/**
 * EmailAliasRegistry.ts — Engineering Sprint E-02.9
 * Connector Knowledge Layer
 *
 * SRP: Conhecer aliases de entidades. Apenas isso.
 *
 * Jamais monta queries.
 * Jamais executa buscas.
 * Jamais conhece dominios.
 *
 * Extensibilidade: adicionar uma nova empresa exige apenas chamar
 * EmailAliasRegistry.register() — nenhum outro arquivo precisa mudar.
 */

import type { AliasDescriptor } from "./SmartQueryTypes";

// ── EmailAliasRegistryClass ───────────────────────────────────────────────────

class EmailAliasRegistryClass {
  /** slug → lista de alias descriptors */
  private readonly _bySlug  = new Map<string, AliasDescriptor[]>();
  /** alias lower-case → slug canonico */
  private readonly _reverse = new Map<string, string>();

  /**
   * Registra aliases para um slug canonico.
   * Idempotente: chamadas duplicadas para o mesmo slug sao ignoradas.
   */
  register(slug: string, aliases: string[]): void {
    const key = slug.toLowerCase().trim();
    if (this._bySlug.has(key)) return;

    const descriptors: AliasDescriptor[] = aliases.map((a) => ({
      alias: a,
      slug:  a.toLowerCase().replace(/\s+/g, ""),
    }));

    this._bySlug.set(key, descriptors);

    // Build reverse index for fast lookup
    descriptors.forEach((d) => {
      this._reverse.set(d.alias.toLowerCase(), key);
      this._reverse.set(d.slug.toLowerCase(), key);
    });
  }

  /**
   * Resolve uma string de entrada para o slug canonico.
   * Retorna null se nao encontrado.
   */
  resolve(input: string): string | null {
    const lower = input.toLowerCase().trim();
    // Direct slug match
    if (this._bySlug.has(lower)) return lower;
    // Alias reverse lookup
    return this._reverse.get(lower) ?? null;
  }

  /**
   * Retorna todos os alias descriptors para um slug canonico.
   * Retorna [] se nao registrado.
   */
  getAliases(slug: string): readonly AliasDescriptor[] {
    return this._bySlug.get(slug.toLowerCase().trim()) ?? [];
  }

  /**
   * Retorna todas as strings de alias (incluindo slug) para busca.
   */
  getAliasStrings(slug: string): readonly string[] {
    const descs = this.getAliases(slug);
    const unique = new Set<string>();
    descs.forEach((d) => { unique.add(d.alias); unique.add(d.slug); });
    return [...unique];
  }

  listSlugs(): readonly string[] {
    return [...this._bySlug.keys()];
  }

  get size(): number {
    return this._bySlug.size;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const _KEY = "__EMAIL_ALIAS_REGISTRY__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new EmailAliasRegistryClass();
}
export const EmailAliasRegistry: EmailAliasRegistryClass = (
  globalThis as unknown as Record<string, EmailAliasRegistryClass>
)[_KEY];

// ── Built-in registrations ────────────────────────────────────────────────────

const _aliases: Array<[string, string[]]> = [
  // E-commerce
  ["mercadolivre",  ["Mercado Livre", "MercadoLivre", "Mercado Libre", "mercadolivre", "mercadolibre", "ML", "Meli"]],
  ["mercadopago",   ["Mercado Pago", "MercadoPago", "mercadopago", "MP"]],
  ["shopee",        ["Shopee", "shopee"]],
  ["amazon",        ["Amazon", "amazon", "Amazon.com.br", "Amazon Brasil"]],
  ["americanas",    ["Americanas", "americanas", "Americanas.com", "Lojas Americanas"]],
  ["aliexpress",    ["AliExpress", "Aliexpress", "aliexpress", "Ali Express"]],
  ["magazineluiza", ["Magazine Luiza", "MagazineLuiza", "magazineluiza", "Magalu", "magalu"]],

  // Financeiro / Pagamentos
  ["picpay",        ["PicPay", "Pic Pay", "picpay", "pic pay"]],
  ["nubank",        ["Nubank", "nubank", "Nu", "nu bank"]],
  ["paypal",        ["PayPal", "Paypal", "paypal", "Pay Pal"]],
  ["pagseguro",     ["PagSeguro", "Pag Seguro", "pagseguro"]],
  ["stripe",        ["Stripe", "stripe"]],

  // Bancos
  ["bradesco",      ["Bradesco", "bradesco", "Banco Bradesco"]],
  ["bancodobrasil", ["Banco do Brasil", "BancoDoBrasil", "BB", "banco do brasil", "bancodobrasil"]],
  ["caixa",         ["Caixa", "caixa", "Caixa Economica", "Caixa Economica Federal", "CEF"]],
  ["santander",     ["Santander", "santander", "Banco Santander"]],
  ["itau",          ["Itau", "Itaú", "itau", "Banco Itau", "Banco Itaú"]],
  ["inter",         ["Inter", "inter", "Banco Inter", "banco inter"]],

  // Hospedagem / Cloud
  ["hostinger",     ["Hostinger", "hostinger"]],
  ["godaddy",       ["GoDaddy", "Godaddy", "godaddy", "Go Daddy"]],
  ["aws",           ["AWS", "Amazon Web Services", "aws", "Amazon AWS"]],
  ["digitalocean",  ["DigitalOcean", "Digital Ocean", "digitalocean"]],
  ["vercel",        ["Vercel", "vercel"]],

  // Produtividade / SaaS
  ["notion",        ["Notion", "notion"]],
  ["slack",         ["Slack", "slack"]],
  ["hubspot",       ["HubSpot", "Hubspot", "hubspot", "Hub Spot"]],
  ["zendesk",       ["Zendesk", "zendesk", "Zen Desk"]],
  ["jira",          ["Jira", "jira", "Atlassian Jira", "JIRA"]],
  ["confluence",    ["Confluence", "confluence", "Atlassian Confluence"]],
  ["trello",        ["Trello", "trello"]],
  ["asana",         ["Asana", "asana"]],
  ["monday",        ["Monday", "monday", "Monday.com"]],
  ["linear",        ["Linear", "linear"]],

  // Dev
  ["github",        ["GitHub", "Github", "github"]],
  ["gitlab",        ["GitLab", "Gitlab", "gitlab"]],
  ["npm",           ["npm", "NPM", "npmjs"]],

  // Enterprise / ERP
  ["oracle",        ["Oracle", "oracle"]],
  ["sap",           ["SAP", "sap"]],
  ["salesforce",    ["Salesforce", "salesforce", "Sales Force"]],
  ["microsoft",     ["Microsoft", "microsoft", "MSFT"]],

  // Google
  ["google",        ["Google", "google"]],
  ["youtube",       ["YouTube", "Youtube", "youtube"]],

  // Social / Comunicacao
  ["linkedin",      ["LinkedIn", "Linkedin", "linkedin"]],
  ["twitter",       ["Twitter", "twitter", "X", "X.com"]],
  ["facebook",      ["Facebook", "facebook", "FB"]],
  ["instagram",     ["Instagram", "instagram", "IG"]],
  ["tiktok",        ["TikTok", "Tiktok", "tiktok", "Tik Tok"]],
  ["discord",       ["Discord", "discord"]],
  ["whatsapp",      ["WhatsApp", "Whatsapp", "whatsapp", "Whats App"]],

  // Storage / Docs
  ["dropbox",       ["Dropbox", "dropbox", "Drop Box"]],
  ["onedrive",      ["OneDrive", "Onedrive", "onedrive", "One Drive"]],
  ["outlook",       ["Outlook", "outlook", "Microsoft Outlook"]],
  ["teams",         ["Microsoft Teams", "Teams", "teams", "MS Teams"]],

  // Logistica / Delivery
  ["ifood",         ["iFood", "Ifood", "ifood", "i Food"]],
  ["rappi",         ["Rappi", "rappi"]],
  ["correios",      ["Correios", "correios", "Empresa Brasileira de Correios"]],
];

_aliases.forEach(([slug, aliases]) => EmailAliasRegistry.register(slug, aliases));