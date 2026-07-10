/**
 * IdentityContext — Tipo de Isolamento de Contexto
 * Foundation: MCS Cap.4, MRS Cap.2
 * Sprint: 1
 *
 * Toda operação de memória DEVE carregar um IdentityContext.
 * Nenhum item cruzará contextos distintos.
 */

/** Domínios possíveis de um contexto de identidade */
export type IdentityDomain = "pessoal" | "empresa" | "projeto" | "condominio" | "turismo" | "outro";

/** Contexto de identidade que isola dados entre diferentes escopos */
export interface IdentityContext {
  /** ID único do usuário proprietário */
  readonly userId: string;
  /** Domínio do contexto — determina partição de memória */
  readonly domain: IdentityDomain;
  /** ID do projeto específico (opcional — restringe ainda mais o escopo) */
  readonly projectId?: string;
  /** ID da sessão ativa */
  readonly sessionId: string;
}

/**
 * Gera uma chave de partição única para o contexto.
 * Usada internamente pelo WorkingMemoryEngine para isolar dados.
 */
export function buildPartitionKey(ctx: IdentityContext): string {
  const base = `${ctx.userId}::${ctx.domain}`;
  return ctx.projectId ? `${base}::${ctx.projectId}` : base;
}

/** Verifica se dois contextos pertencem à mesma partição */
export function isSamePartition(a: IdentityContext, b: IdentityContext): boolean {
  return buildPartitionKey(a) === buildPartitionKey(b);
}