/**
 * Universal Event Bus — Public API (Sprint 28)
 *
 * Ponto de entrada público do barramento de eventos universal.
 *
 * O Universal Event Bus é a espinha dorsal de comunicação do MemoryOS.
 * Após esta Sprint, toda comunicação entre Engines, Connectors e serviços
 * futuros deve ocorrer exclusivamente através deste barramento.
 *
 * Isolamento: NÃO importa Memory Engine, Cognitive Engine, Intelligence Engine,
 * Autonomous Engine ou Enterprise Integration Layer. Conhece apenas interfaces.
 */

// === Contracts ===
export {
  EVENT_FIELDS,
  PRIORITIES,
  PRIORITY_RANK,
  PRIORITY_WEIGHTS,
  EVENT_STATUSES,
  SUBSCRIPTION_FIELDS,
  PARTICIPANT_KINDS,
  generateEventId,
  generateSubscriptionId,
  generateHistoryId,
  generateParticipantId,
  buildEvent,
  buildSubscription,
  buildHistoryEntry,
  buildParticipant,
  _resetIdsForTests,
} from "./eventBusContracts.js";

// === Infrastructure ===
export { createQueue } from "./eventQueue.js";
export { createPriorityScheduler } from "./priorityScheduler.js";
export { createSubscriptionRegistry } from "./subscriptionRegistry.js";
export { createRetryManager } from "./retryManager.js";
export { createDeadLetterQueue } from "./deadLetterQueue.js";
export { createEventHistory } from "./eventHistory.js";
export { createStatistics } from "./statistics.js";

// === Validators ===
export {
  validateEvent,
  validatePriority,
  validateQueue,
  validatePublisher,
  validateConsumer,
  validateSubscription,
  validateRetry,
  validateParticipant,
} from "./validators.js";

// === Bus, Publisher, Consumer ===
export { createEventBus } from "./universalEventBus.js";
export { createPublisher } from "./publisher.js";
export { createConsumer } from "./consumer.js";

// === Tests ===
export { UNIVERSAL_EVENT_BUS_TEST_CASES, runUniversalEventBusTests } from "./tests/testCases.js";