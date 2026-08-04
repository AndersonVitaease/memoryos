/**
 * GitHubRateLimiter.ts — Token Bucket por conta (Upgrade 2 do plano).
 *
 * Por que um limiter dedicado (e nao reuso do UCRRateLimiter)?
 *   - O UCRRateLimiter e por-CONNECTOR (uma taxa global por conector).
 *   - O GitHub cobra rate-limit POR TOKEN (por conta). Com multi-conta,
 *     cada token tem seu proprio budget (5000/h). Precisamos indexar por
 *     token, nao por conector. Por isso modulo dedicado.
 *
 * Indexacao por token (hash), nunca guarda o token em si.
 *   - acquire/check antes de cada request.
 *   - update apos cada response, lendo x-ratelimit-remaining / x-ratelimit-reset
 *     do header (ou do body do endpoint /rate_limit).
 *
 * Sem dependencias. Stateful em memoria (singleton). Sobrevive a reloads
 * porque se reidrata a partir da proxima resposta.
 */

interface RateLimitState {
  remaining: number;
  limit: number;
  resetAt: number; // epoch ms
  lastUpdated: number;
}

const DEFAULT_REMAINING = 5000;
const DEFAULT_LIMIT = 5000;
const MAX_WAIT_MS = 60_000; // teto de espera numa unica tentativa

function tokenKey(token: string): string {
  // hash simples e estavel — nunca guardar o token em si
  let h = 0;
  for (let i = 0; i < token.length; i++) {
    h = ((h << 5) - h + token.charCodeAt(i)) | 0;
  }
  return `t_${(h >>> 0).toString(36)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class GitHubRateLimiter {
  private states = new Map<string, RateLimitState>();
  retries = 0;
  rateLimitedRequests = 0;
  waitedMs = 0;

  /** Le o estado atual do rate-limit de um token (do header/body da resposta). */
  update(
    token: string,
    headers: Record<string, string> | undefined,
    body: unknown,
  ): void {
    if (!token) return;
    const key = tokenKey(token);
    let state = this.states.get(key);
    if (!state) {
      state = { remaining: DEFAULT_REMAINING, limit: DEFAULT_LIMIT, resetAt: 0, lastUpdated: 0 };
      this.states.set(key, state);
    }
    const rem = headers?.["x-ratelimit-remaining"];
    const lim = headers?.["x-ratelimit-limit"];
    const reset = headers?.["x-ratelimit-reset"];
    if (rem !== undefined) state.remaining = parseInt(rem, 10);
    if (lim !== undefined) state.limit = parseInt(lim, 10);
    if (reset !== undefined) state.resetAt = parseInt(reset, 10) * 1000;
    // Body do /rate_limit traz os mesmos campos de forma confiavel
    const rate = (body as any)?.rate;
    if (rate) {
      state.remaining = rate.remaining;
      state.limit = rate.limit;
      state.resetAt = rate.reset * 1000;
    }
    state.lastUpdated = Date.now();
  }

  /**
   * Verifica se um request pode ser disparado agora.
   * Retorna { allowed, waitMs, remaining }.
   *   - allowed=true  → dispare.
   *   - allowed=false → remaining==0; espere waitMs (ate reset, capped 60s)
   *                     antes de tentar de novo.
   * Nao bloqueia — o caller decide se espera ou falha rapido.
   */
  check(token: string): { allowed: boolean; waitMs: number; remaining: number } {
    if (!token) return { allowed: true, waitMs: 0, remaining: Infinity };
    const state = this.states.get(tokenKey(token));
    if (!state) return { allowed: true, waitMs: 0, remaining: Infinity };
    if (state.remaining > 0) return { allowed: true, waitMs: 0, remaining: state.remaining };
    const waitMs = Math.max(0, Math.min(state.resetAt - Date.now(), MAX_WAIT_MS));
    return { allowed: false, waitMs, remaining: 0 };
  }

  /** Snapshot agregado para diagnostico/metrics. */
  snapshot(): Array<{ key: string; remaining: number; limit: number; resetInMs: number }> {
    return Array.from(this.states.entries()).map(([key, s]) => ({
      key,
      remaining: s.remaining,
      limit: s.limit,
      resetInMs: Math.max(0, s.resetAt - Date.now()),
    }));
  }

  reset(): void {
    this.states.clear();
    this.retries = 0;
    this.rateLimitedRequests = 0;
    this.waitedMs = 0;
  }
}

export const gitHubRateLimiter = new GitHubRateLimiter();

/**
 * Decide se um FetchResult merece retry.
 *   - 5xx → sim (backoff exponencial).
 *   - 429 → sim (respeita Retry-After).
 *   - 403 com x-ratelimit-remaining:0 ou Retry-After → sim (rate-limit, nao permissao).
 *   - 403 sem rate-limit → nao (erro de permissao/escopo; retry nao adianta).
 *   - 404/422/outros 4xx → nao.
 */
export function isRetryable(res: {
  status: number;
  headers?: Record<string, string>;
}): boolean {
  if (res.status >= 500) return true;
  if (res.status === 429) return true;
  if (res.status === 403) {
    const h = res.headers ?? {};
    return h["x-ratelimit-remaining"] === "0" || !!h["retry-after"];
  }
  return false;
}

export function computeBackoffMs(
  res: { status: number; headers?: Record<string, string> },
  attempt: number,
  rateLimiterCheck: { waitMs: number },
): number {
  const retryAfter = parseInt(res.headers?.["retry-after"] ?? "0", 10);
  if (retryAfter > 0) return Math.min(retryAfter * 1000, MAX_WAIT_MS);
  if (res.status === 403 || res.status === 429) {
    // rate-limit sem Retry-After: usa o reset do limiter (ate 60s)
    return Math.min(rateLimiterCheck.waitMs, MAX_WAIT_MS);
  }
  // 5xx: backoff exponencial 1s, 2s, 4s... capped 8s
  return Math.min(1000 * Math.pow(2, attempt - 1), 8000);
}