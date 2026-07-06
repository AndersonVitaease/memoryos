/**
 * Retry Manager (Sprint 28)
 *
 * Controla tentativas de reprocessamento de eventos.
 *
 * Cada evento controla:
 *   - attempt (tentativa atual)
 *   - maxAttempts (limite máximo)
 *   - lastRetry (timestamp da última tentativa)
 *   - nextRetry (timestamp da próxima tentativa)
 *
 * NÃO executa retries. Apenas rastreia e decide se pode tentar novamente.
 */

const DEFAULT_MAX_ATTEMPTS = 3;

export function createRetryManager() {
  const _records = new Map(); // eventId -> { attempt, maxAttempts, lastRetry, nextRetry }

  function _getOrCreate(eventId, maxAttempts) {
    if (!_records.has(eventId)) {
      _records.set(eventId, {
        attempt: 0,
        maxAttempts: maxAttempts || DEFAULT_MAX_ATTEMPTS,
        lastRetry: null,
        nextRetry: null,
      });
    }
    const rec = _records.get(eventId);
    if (maxAttempts && maxAttempts !== rec.maxAttempts) {
      rec.maxAttempts = maxAttempts;
    }
    return rec;
  }

  return Object.freeze({
    retry(event, maxAttempts) {
      if (!event || !event.eventId) return null;
      const rec = _getOrCreate(event.eventId, maxAttempts);
      rec.attempt++;
      const now = new Date().toISOString();
      rec.lastRetry = now;
      rec.nextRetry = now;
      return Object.freeze({ ...rec });
    },
    retryLater(event, delayMs, maxAttempts) {
      if (!event || !event.eventId) return null;
      const rec = _getOrCreate(event.eventId, maxAttempts);
      rec.attempt++;
      const now = new Date();
      rec.lastRetry = now.toISOString();
      rec.nextRetry = new Date(now.getTime() + (delayMs || 0)).toISOString();
      return Object.freeze({ ...rec });
    },
    maxRetries(eventId) {
      const rec = _records.get(eventId);
      return rec ? rec.maxAttempts : DEFAULT_MAX_ATTEMPTS;
    },
    canRetry(eventId) {
      const rec = _records.get(eventId);
      if (!rec) return true;
      return rec.attempt < rec.maxAttempts;
    },
    shouldDiscard(eventId) {
      const rec = _records.get(eventId);
      if (!rec) return false;
      return rec.attempt >= rec.maxAttempts;
    },
    getAttempt(eventId) {
      const rec = _records.get(eventId);
      return rec ? rec.attempt : 0;
    },
    getRecord(eventId) {
      const rec = _records.get(eventId);
      return rec ? Object.freeze({ ...rec }) : null;
    },
    clearAttempt(eventId) {
      return _records.delete(eventId);
    },
    reset() {
      _records.clear();
    },
    size() {
      return _records.size;
    },
    defaultMaxAttempts() {
      return DEFAULT_MAX_ATTEMPTS;
    },
  });
}