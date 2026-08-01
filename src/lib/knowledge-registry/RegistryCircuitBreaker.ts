/**
 * RegistryCircuitBreaker.ts — CRS-01 §5.1
 *
 * Anti-FeedbackLoop: rastreia taxa de escrita por targetObjectId em janelas
 * de 60 segundos. Se um objeto receber mais de MAX_WRITES_PER_WINDOW escritas
 * em 60s, o breaker OPEN por 30s — novas escritas naquele objeto são rejeitadas.
 *
 * GARANTIAS:
 *   - Pure in-memory (sem I/O) — nunca lança exceção
 *   - Singleton HMR-safe via globalThis
 *   - Imutável externamente: só expose check() + record() + getState()
 *
 * ROLLBACK: remover chamada de check() no KnowledgeRegistry.commit().
 */

// ── Config ────────────────────────────────────────────────────────────────────

const WINDOW_MS          = 60_000;  // janela de 60 segundos
const MAX_WRITES         = 20;      // máx. escritas por objeto por janela
const COOLDOWN_MS        = 30_000;  // tempo de bloqueio após abrir o breaker

// ── Types ─────────────────────────────────────────────────────────────────────

export type BreakerState = "closed" | "open";

export interface BreakerStatus {
  readonly state:       BreakerState;
  readonly writeCount:  number;
  readonly windowStart: number;
  readonly openedAt:    number | null;
  readonly unlocksAt:   number | null;
}

export interface BreakerCheckResult {
  readonly allowed:  boolean;
  readonly reason:   string | null;
  readonly objectId: string;
}

// ── RegistryCircuitBreaker ────────────────────────────────────────────────────

class RegistryCircuitBreakerClass {
  /** objectId → { count, windowStart, openedAt | null } */
  private _windows = new Map<string, {
    count:       number;
    windowStart: number;
    openedAt:    number | null;
  }>();

  private _totalTripped = 0;
  private _totalBlocked = 0;

  /**
   * Verifica se a escrita para `objectId` é permitida.
   * Deve ser chamado ANTES do commit no Registry.
   */
  check(objectId: string): BreakerCheckResult {
    const now   = Date.now();
    const entry = this._getOrCreate(objectId, now);

    // Verifica se o breaker está OPEN (cooldown)
    if (entry.openedAt !== null) {
      const elapsed = now - entry.openedAt;
      if (elapsed < COOLDOWN_MS) {
        this._totalBlocked++;
        const unlocksIn = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
        return Object.freeze({
          allowed:  false,
          reason:   `CircuitBreaker OPEN: objeto bloqueado por feedback-loop. Libera em ${unlocksIn}s.`,
          objectId,
        });
      }
      // Cooldown expirou — reset
      entry.openedAt    = null;
      entry.count       = 0;
      entry.windowStart = now;
    }

    // Verifica se a janela expirou → reset
    if (now - entry.windowStart >= WINDOW_MS) {
      entry.count       = 0;
      entry.windowStart = now;
    }

    return Object.freeze({ allowed: true, reason: null, objectId });
  }

  /**
   * Registra uma escrita confirmada para `objectId`.
   * Deve ser chamado APÓS commit bem-sucedido no Registry.
   */
  record(objectId: string): void {
    const now   = Date.now();
    const entry = this._getOrCreate(objectId, now);

    // Se janela expirou, reinicia
    if (now - entry.windowStart >= WINDOW_MS) {
      entry.count       = 0;
      entry.windowStart = now;
    }

    entry.count++;

    // Abre o breaker se limite atingido
    if (entry.count >= MAX_WRITES && entry.openedAt === null) {
      entry.openedAt = now;
      this._totalTripped++;
      console.warn(
        `[CircuitBreaker][OPEN] objectId="${objectId}" atingiu ${entry.count} escritas em ${WINDOW_MS / 1000}s. Bloqueando por ${COOLDOWN_MS / 1000}s.`
      );
    }
  }

  getState(objectId: string): BreakerStatus {
    const now   = Date.now();
    const entry = this._windows.get(objectId);
    if (!entry) return Object.freeze({ state: "closed", writeCount: 0, windowStart: now, openedAt: null, unlocksAt: null });

    const state: BreakerState = entry.openedAt !== null && (now - entry.openedAt) < COOLDOWN_MS
      ? "open"
      : "closed";

    return Object.freeze({
      state,
      writeCount:  entry.count,
      windowStart: entry.windowStart,
      openedAt:    entry.openedAt,
      unlocksAt:   entry.openedAt !== null ? entry.openedAt + COOLDOWN_MS : null,
    });
  }

  getMetrics() {
    return Object.freeze({
      trackedObjects: this._windows.size,
      totalTripped:   this._totalTripped,
      totalBlocked:   this._totalBlocked,
      config:         Object.freeze({ WINDOW_MS, MAX_WRITES, COOLDOWN_MS }),
    });
  }

  private _getOrCreate(objectId: string, now: number) {
    if (!this._windows.has(objectId)) {
      this._windows.set(objectId, { count: 0, windowStart: now, openedAt: null });
    }
    return this._windows.get(objectId)!;
  }
}

// ── Singleton HMR-safe ────────────────────────────────────────────────────────

const _KEY = "__REGISTRY_CIRCUIT_BREAKER__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new RegistryCircuitBreakerClass();
}

export const registryCircuitBreaker: RegistryCircuitBreakerClass = (
  globalThis as unknown as Record<string, RegistryCircuitBreakerClass>
)[_KEY];