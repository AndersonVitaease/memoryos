/**
 * StateViewContextToken.ts — CRS-01 §2.2
 *
 * O Planner nunca acessa o StateView diretamente — sempre via contextToken
 * que define os scopes autorizados para aquela leitura.
 *
 * Garante isolamento de domínio: um contexto "session" nunca vê dados "github"
 * a menos que explicitamente autorizado.
 *
 * ROLLBACK: remover parâmetro contextToken de StateViewEngine.buildForSession().
 */

import type { ContextScope } from "./KnowledgeRegistryTypes";

// ── ContextToken ──────────────────────────────────────────────────────────────

export interface StateViewContextToken {
  /** Identificador do consumidor (planner, agent, pipeline) */
  readonly consumerId:        string;
  /** Scopes que este token autoriza a ler */
  readonly authorizedScopes:  ReadonlySet<ContextScope>;
  /** Session a que este token está restrito (null = global) */
  readonly sessionId:         string | null;
  /** TTL do token em ms a partir de createdAt */
  readonly ttlMs:             number;
  /** Timestamp de criação */
  readonly createdAt:         number;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function makeSessionToken(sessionId: string, consumerId = "pipeline"): StateViewContextToken {
  return Object.freeze({
    consumerId,
    authorizedScopes: new Set<ContextScope>(["session", "memory"]),
    sessionId,
    ttlMs:     120_000,  // 2 minutos
    createdAt: Date.now(),
  });
}

export function makeProjectToken(sessionId: string, projectId: string, consumerId = "pipeline"): StateViewContextToken {
  return Object.freeze({
    consumerId,
    authorizedScopes: new Set<ContextScope>(["session", "project", "memory"]),
    sessionId,
    ttlMs:     120_000,
    createdAt: Date.now(),
  });
}

export function makeConnectorToken(
  sessionId: string,
  connectors: ContextScope[],
  consumerId = "connector_runtime",
): StateViewContextToken {
  return Object.freeze({
    consumerId,
    authorizedScopes: new Set<ContextScope>(["session", ...connectors]),
    sessionId,
    ttlMs:     60_000,
    createdAt: Date.now(),
  });
}

// ── Validation ────────────────────────────────────────────────────────────────

export function isTokenValid(token: StateViewContextToken): boolean {
  return Date.now() - token.createdAt < token.ttlMs;
}

export function isScopeAuthorized(token: StateViewContextToken, scope: ContextScope): boolean {
  return isTokenValid(token) && token.authorizedScopes.has(scope);
}