/**
 * Statistics (Sprint 28)
 *
 * Contadores de observabilidade do barramento.
 *
 * Implementa:
 *   publishedEvents, consumedEvents, queuedEvents, retriedEvents,
 *   discardedEvents, deadLetterEvents, activeConsumers, activePublishers,
 *   subscriptions, queueSizes
 *
 * + resetStatistics(), describeStatistics()
 */

export function createStatistics() {
  const _counters = {
    publishedEvents: 0,
    consumedEvents: 0,
    queuedEvents: 0,
    retriedEvents: 0,
    discardedEvents: 0,
    deadLetterEvents: 0,
    activeConsumers: 0,
    activePublishers: 0,
    subscriptions: 0,
  };
  let _queueSizes = {};

  return Object.freeze({
    inc(key, amount = 1) {
      if (key in _counters) _counters[key] += amount;
    },
    dec(key, amount = 1) {
      if (key in _counters) _counters[key] -= amount;
    },
    get(key) {
      return key in _counters ? _counters[key] : 0;
    },
    setQueueSizes(sizes) {
      _queueSizes = { ...sizes };
    },
    snapshot() {
      return { ..._counters, queueSizes: { ..._queueSizes } };
    },
    resetStatistics() {
      for (const k of Object.keys(_counters)) _counters[k] = 0;
      _queueSizes = {};
    },
    describeStatistics() {
      const s = { ..._counters, queueSizes: { ..._queueSizes } };
      const lines = [
        "Universal Event Bus — Statistics",
        `  Published: ${s.publishedEvents}`,
        `  Consumed: ${s.consumedEvents}`,
        `  Queued: ${s.queuedEvents}`,
        `  Retried: ${s.retriedEvents}`,
        `  Discarded: ${s.discardedEvents}`,
        `  Dead Letter: ${s.deadLetterEvents}`,
        `  Active Consumers: ${s.activeConsumers}`,
        `  Active Publishers: ${s.activePublishers}`,
        `  Subscriptions: ${s.subscriptions}`,
        `  Queue Sizes: ${JSON.stringify(s.queueSizes)}`,
      ];
      return lines.join("\n");
    },
  });
}