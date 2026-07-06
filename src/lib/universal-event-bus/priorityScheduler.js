/**
 * Priority Scheduler (Sprint 28)
 *
 * Decide qual fila executar e qual evento será o próximo.
 * NÃO executa eventos. Apenas decide.
 *
 * Garante ordenação: CRITICAL > HIGH > NORMAL > LOW > BACKGROUND
 * sem starvation: eventos LOW e BACKGROUND eventualmente executam.
 *
 * Estratégia: weighted round-robin com quotas por ciclo.
 * Cada prioridade recebe PRIORITY_WEIGHTS[priority] slots por ciclo.
 * Ao esgotar a quota (ou fila vazia), avança para a próxima prioridade.
 * BACKGROUND sempre recebe pelo menos 1 slot por ciclo.
 */

import { createQueue } from "./eventQueue.js";
import { PRIORITIES, PRIORITY_WEIGHTS } from "./eventBusContracts.js";

export function createPriorityScheduler() {
  const _queues = new Map();
  for (const p of PRIORITIES) {
    _queues.set(p, createQueue(p));
  }

  let _pIdx = 0;
  let _quota = PRIORITY_WEIGHTS[PRIORITIES[0]];
  let _servedCount = 0;

  function _totalSize() {
    let total = 0;
    for (const p of PRIORITIES) total += _queues.get(p).size();
    return total;
  }

  function _advancePriority() {
    _pIdx = (_pIdx + 1) % PRIORITIES.length;
    _quota = PRIORITY_WEIGHTS[PRIORITIES[_pIdx]];
  }

  return Object.freeze({
    enqueue(event) {
      if (!event || !event.priority) return false;
      const q = _queues.get(event.priority);
      if (!q) return false;
      return q.enqueue(event);
    },
    next() {
      if (_totalSize() === 0) return null;

      for (let scan = 0; scan < PRIORITIES.length * 2; scan++) {
        const p = PRIORITIES[_pIdx];
        const q = _queues.get(p);

        if (!q.isEmpty() && _quota > 0) {
          const event = q.dequeue();
          _quota--;
          _servedCount++;
          return event;
        }

        _advancePriority();
      }

      // Fallback: serve any non-empty queue
      for (const p of PRIORITIES) {
        const q = _queues.get(p);
        if (!q.isEmpty()) {
          _servedCount++;
          return q.dequeue();
        }
      }
      return null;
    },
    peek() {
      for (const p of PRIORITIES) {
        const q = _queues.get(p);
        if (!q.isEmpty()) return q.peek();
      }
      return null;
    },
    size() {
      return _totalSize();
    },
    sizeByPriority(priority) {
      const q = _queues.get(priority);
      return q ? q.size() : 0;
    },
    queueSizes() {
      const result = {};
      for (const p of PRIORITIES) result[p] = _queues.get(p).size();
      return result;
    },
    clear() {
      for (const p of PRIORITIES) {
        _queues.get(p).clear();
      }
      _pIdx = 0;
      _quota = PRIORITY_WEIGHTS[PRIORITIES[0]];
      _servedCount = 0;
    },
    servedCount() {
      return _servedCount;
    },
    getQueue(priority) {
      return _queues.get(priority) || null;
    },
    priorities() {
      return [...PRIORITIES];
    },
  });
}