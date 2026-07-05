/**
 * Event Emitter — Infraestrutura mínima (MES §22)
 *
 * Conforme MES §22 (Eventos) e Correção 5:
 * - Implementar APENAS a infraestrutura mínima.
 * - Não criar Event Bus completo.
 * - Apenas emitir os eventos.
 *
 * Eventos oficiais:
 *   - audit.started
 *   - audit.completed
 *   - audit.failed
 *
 * v3.1 — Correção 6 (Documentação do EventEmitter):
 * O método on() existe apenas para permitir integração futura com a interface
 * do usuário e com o Event Bus. Ele NÃO caracteriza um Event Bus completo.
 * A implementação completa do Event Bus fica para uma fase futura (roadmap oficial).
 */

const _listeners = new Map();

/**
 * Registra um listener para um evento.
 *
 * v3.1 — Documentação oficial (Correção 6):
 * Este método existe APENAS para permitir integração futura com a interface
 * do usuário e com o Event Bus oficial. Ele não caracteriza um Event Bus completo.
 * A implementação completa do Event Bus fica para uma fase futura (roadmap oficial).
 *
 * @returns {Function} unsubscribe
 */
export function on(event, callback) {
  if (!_listeners.has(event)) _listeners.set(event, []);
  _listeners.get(event).push(callback);
  return () => {
    const arr = _listeners.get(event);
    if (arr) {
      const idx = arr.indexOf(callback);
      if (idx >= 0) arr.splice(idx, 1);
    }
  };
}

/**
 * Emite um evento.
 * Apenas notifica listeners registrados — sem persistência, sem bus completo.
 */
export function emit(event, payload = {}) {
  const arr = _listeners.get(event);
  if (!arr) return;
  for (const cb of arr) {
    try {
      cb({ event, timestamp: new Date().toISOString(), ...payload });
    } catch {
      // listener não pode quebrar o pipeline
    }
  }
}

export const AUDIT_EVENTS = {
  STARTED: "audit.started",
  COMPLETED: "audit.completed",
  FAILED: "audit.failed",
};