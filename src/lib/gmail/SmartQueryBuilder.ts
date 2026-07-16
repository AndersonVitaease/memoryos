/**
 * SmartQueryBuilder.ts — Engineering Sprint E-02.9
 * Connector Knowledge Layer
 *
 * SRP: Receber uma entidade, consultar EmailAliasRegistry e DomainRegistry,
 *      produzir um SearchStrategy.
 *
 * Jamais chama Gmail.
 * Jamais executa buscas.
 * Jamais conhece aliases ou dominios diretamente —
 *   tudo e delegado aos registries.
 *
 * Extensibilidade: qualquer novo conector (Drive, Calendar, GitHub, Slack,
 * Notion, Dropbox, OneDrive, Outlook, Teams, Discord, WhatsApp, Facebook,
 * Instagram, TikTok) pode instanciar este builder com seus proprios registries
 * sem tocar em Runtime, Planning, Router ou ConnectorRegistry.
 */

import { EmailAliasRegistry } from "./EmailAliasRegistry";
import { DomainRegistry }     from "./DomainRegistry";
import type {
  SearchAttempt,
  SearchStrategy,
  EntityDescriptor,
} from "./SmartQueryTypes";

// ── SmartQueryBuilder ─────────────────────────────────────────────────────────

export class SmartQueryBuilder {
  /**
   * Resolve a entidade e constroi um SearchStrategy completo.
   *
   * Fluxo:
   *   1. Resolve slug via EmailAliasRegistry
   *   2. Busca dominios via DomainRegistry
   *   3. Constroi lista de SearchAttempts em ordem de prioridade
   *
   * @param entity  - Texto original do usuario (ex: "Mercado Livre")
   * @returns SearchStrategy com todos os attempts em ordem de prioridade
   */
  build(entity: string): SearchStrategy {
    const slug    = EmailAliasRegistry.resolve(entity) ?? this._slugify(entity);
    const aliases = EmailAliasRegistry.getAliasStrings(slug);
    const domains = DomainRegistry.get(slug);

    // EntityDescriptor para rastreabilidade
    const resolved: EntityDescriptor | null = aliases.length > 0 || domains.length > 0
      ? {
          canonical: slug,
          aliases:   EmailAliasRegistry.getAliases(slug),
          domains:   [...domains],
        }
      : null;

    const attempts: SearchAttempt[] = [];
    let counter = 0;

    const add = (query: string, strategy: string) => {
      // Deduplica: nao adiciona a mesma query duas vezes
      if (attempts.some((a) => a.query === query)) return;
      attempts.push({ attempt: ++counter, query, strategy, results: 0, succeeded: false });
    };

    // ── Prioridade 1: aliases registrados (mais especificos) ─────────────────
    // Os aliases sao ordenados: nome canonico primeiro, slugs depois
    const canonicalAliases = aliases.filter((a) => a.length > 2);
    canonicalAliases.slice(0, 3).forEach((alias) => {
      add(alias, "alias_registered");
    });

    // ── Prioridade 2: dominios primarios ────────────────────────────────────
    const primary = domains.find((d) => d.primary);
    if (primary) {
      add(primary.domain, "domain_primary");
      add(`from:${primary.domain}`, "from_domain_primary");
    }

    // ── Prioridade 3: dominios secundarios ──────────────────────────────────
    domains
      .filter((d) => !d.primary)
      .forEach((d) => {
        add(d.domain, "domain_secondary");
        add(`from:${d.domain}`, "from_domain_secondary");
      });

    // ── Prioridade 4: fallback slug-based (se entidade nao reconhecida) ─────
    if (!resolved) {
      const rawSlug = this._slugify(entity);

      // Exato
      add(entity.trim(), "raw_exact");

      // Slug simples
      if (rawSlug !== entity.trim().toLowerCase()) {
        add(rawSlug, "slug_simple");
      }

      // from: prefix
      add(`from:${rawSlug}`, "from_slug");

      // .com domain
      add(`${rawSlug}.com`, "domain_com_fallback");
      add(`from:${rawSlug}.com`, "from_domain_com_fallback");

      // .com.br domain
      add(`${rawSlug}.com.br`, "domain_com_br_fallback");

      // Multi-word: quoted + condensed + camelCase
      if (entity.includes(" ")) {
        add(`"${entity.trim()}"`, "quoted_exact");
        const condensed = entity.toLowerCase().replace(/\s+/g, "");
        add(condensed, "condensed_slug");
        const camel = entity
          .split(/\s+/)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join("");
        add(camel, "camel_case");
      }
    }

    return Object.freeze({ entity, resolved, attempts: Object.freeze(attempts) });
  }

  /** Converte "Mercado Livre" → "mercadolivre" */
  private _slugify(text: string): string {
    return text.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");
  }
}

// ── App-wide singleton ────────────────────────────────────────────────────────

const _KEY = "__SMART_QUERY_BUILDER__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new SmartQueryBuilder();
}
export const smartQueryBuilder: SmartQueryBuilder = (
  globalThis as unknown as Record<string, SmartQueryBuilder>
)[_KEY];