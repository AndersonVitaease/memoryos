/**
 * SmartQueryExecutor.ts — Engineering Sprint E-02.9
 * Connector Knowledge Layer
 *
 * SRP: Receber um SearchStrategy e executar tentativa por tentativa,
 *      parando na primeira que retornar resultados.
 *
 * Jamais monta queries.
 * Jamais conhece aliases ou dominios.
 * Jamais conhece a estrategia — apenas a executa.
 *
 * Compativel com qualquer conector futuro que implemente o contrato
 * SearchFn (funcao que recebe query+maxResults e retorna { ok, data, error }).
 */

import type { SearchStrategy, SearchResult } from "./SmartQueryTypes";

// ── Contrato da funcao de busca ───────────────────────────────────────────────

export type SearchFn = (
  query:      string,
  maxResults: number,
) => Promise<{ ok: boolean; data: unknown; error: string | null }>;

// ── SmartQueryExecutor ────────────────────────────────────────────────────────

export class SmartQueryExecutor {
  /**
   * Executa a estrategia tentativa a tentativa.
   * Para na primeira tentativa bem-sucedida (results > 0).
   *
   * @param strategy   - Produzida pelo SmartQueryBuilder
   * @param searchFn   - Funcao de busca do conector (ex: Gmail searchMessages)
   * @param maxResults - Limite de resultados por tentativa
   * @returns SearchResult completo com log, vencedor e dados
   */
  async execute(
    strategy:   SearchStrategy,
    searchFn:   SearchFn,
    maxResults: number = 20,
  ): Promise<SearchResult> {
    const tStart = Date.now();
    const log: string[] = [];
    let winningQuery: string | null = null;
    let totalFound = 0;
    let winningData: unknown = null;

    // Trabalha sobre uma copia mutavel das tentativas para registrar resultados
    const mutableAttempts = strategy.attempts.map((a) => ({ ...a }));

    for (const attempt of mutableAttempts) {
      const t0 = Date.now();
      let count = 0;
      let data: unknown = null;

      try {
        const res = await searchFn(attempt.query, maxResults);
        const durationMs = Date.now() - t0;
        attempt.durationMs = durationMs;

        if (res.ok && res.data) {
          const d = res.data as Record<string, unknown>;
          const msgs = d["messages"];
          count = Array.isArray(msgs)
            ? msgs.length
            : typeof d["resultSizeEstimate"] === "number"
              ? (d["resultSizeEstimate"] as number)
              : 0;
          data = res.data;
        }

        attempt.results   = count;
        attempt.succeeded = count > 0;

        log.push(
          `[Executor] #${attempt.attempt} [${attempt.strategy}] q="${attempt.query}" → ${count} results (${durationMs}ms)${attempt.succeeded ? " ✓ WINNER" : ""}`,
        );

        if (attempt.succeeded) {
          winningQuery = attempt.query;
          totalFound   = count;
          winningData  = data;
          break;
        }
      } catch (err) {
        attempt.durationMs = Date.now() - t0;
        log.push(`[Executor] #${attempt.attempt} [${attempt.strategy}] q="${attempt.query}" → ERROR: ${(err as Error).message}`);
      }
    }

    const totalDurationMs = Date.now() - tStart;

    if (!winningQuery) {
      log.push(`[Executor] No results found for entity="${strategy.entity}" after ${mutableAttempts.length} attempts.`);
    } else {
      log.push(`[Executor] Done — entity="${strategy.entity}" winner="${winningQuery}" found=${totalFound} total=${totalDurationMs}ms`);
    }

    return Object.freeze({
      entity:         strategy.entity,
      winningQuery,
      totalFound,
      strategy:       Object.freeze({ ...strategy, attempts: Object.freeze(mutableAttempts) }),
      data:           winningData,
      log:            Object.freeze(log),
      totalDurationMs,
    });
  }
}

// ── App-wide singleton ────────────────────────────────────────────────────────

const _KEY = "__SMART_QUERY_EXECUTOR__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new SmartQueryExecutor();
}
export const smartQueryExecutor: SmartQueryExecutor = (
  globalThis as unknown as Record<string, SmartQueryExecutor>
)[_KEY];