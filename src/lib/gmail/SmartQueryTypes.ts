/**
 * SmartQueryTypes.ts — Engineering Sprint E-02.9
 * Connector Knowledge Layer
 *
 * SRP: Apenas tipos. Sem logica. Sem imports de modulos com efeitos.
 */

// ── Alias ─────────────────────────────────────────────────────────────────────

/** Uma variacao de nome que representa a mesma entidade */
export interface AliasDescriptor {
  /** Alias exato (preserva case original) */
  readonly alias: string;
  /** Slug lower-case normalizado */
  readonly slug: string;
}

// ── Domain ────────────────────────────────────────────────────────────────────

/** Um dominio associado a uma entidade */
export interface DomainDescriptor {
  /** Dominio completo (ex: "hostinger.com") */
  readonly domain: string;
  /** Indica se e o dominio primario (mais provavel de aparecer no From:) */
  readonly primary: boolean;
  /** Regiao geografica opcional ("br", "global") */
  readonly region?: string;
}

// ── Entity ────────────────────────────────────────────────────────────────────

/** Entidade resolvida: nome canonico + aliases + dominios */
export interface EntityDescriptor {
  /** Nome canonico da entidade */
  readonly canonical: string;
  /** Todos os aliases conhecidos */
  readonly aliases: readonly AliasDescriptor[];
  /** Todos os dominios conhecidos (primario primeiro) */
  readonly domains: readonly DomainDescriptor[];
}

// ── Search Attempt ────────────────────────────────────────────────────────────

/** Uma unica tentativa de busca dentro de uma estrategia */
export interface SearchAttempt {
  /** Numero sequencial (1-based) */
  readonly attempt: number;
  /** Query enviada ao Gmail */
  readonly query: string;
  /** Descricao da estrategia usada */
  readonly strategy: string;
  /** Numero de resultados retornados */
  results: number;
  /** Se esta tentativa foi bem-sucedida (results > 0) */
  succeeded: boolean;
  /** Tempo de execucao em ms (preenchido pelo Executor) */
  durationMs?: number;
}

// ── Search Strategy ───────────────────────────────────────────────────────────

/** Conjunto de tentativas a executar, em ordem de prioridade */
export interface SearchStrategy {
  /** Entidade original que gerou a estrategia */
  readonly entity: string;
  /** Entidade resolvida (se reconhecida) */
  readonly resolved: EntityDescriptor | null;
  /** Tentativas ordenadas por prioridade */
  readonly attempts: readonly SearchAttempt[];
}

// ── Search Result ─────────────────────────────────────────────────────────────

/** Resultado final produzido pelo Executor apos executar a estrategia */
export interface SearchResult {
  /** Entidade original */
  readonly entity: string;
  /** Query vencedora (null se nenhuma retornou resultados) */
  readonly winningQuery: string | null;
  /** Numero de resultados da query vencedora */
  readonly totalFound: number;
  /** Tentativas executadas (com durationMs preenchido) */
  readonly strategy: SearchStrategy;
  /** Dados brutos retornados pela API */
  readonly data: unknown | null;
  /** Log textual de cada tentativa */
  readonly log: readonly string[];
  /** Tempo total de execucao em ms */
  readonly totalDurationMs: number;
}