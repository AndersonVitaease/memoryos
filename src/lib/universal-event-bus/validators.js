/**
 * Validators (Sprint 28)
 *
 * Criar:
 *   validateEvent, validatePriority, validateQueue, validatePublisher,
 *   validateConsumer, validateSubscription, validateRetry
 *
 * Todos retornam: { valid, errors }
 * Jamais lançam exceções.
 */

import {
  EVENT_FIELDS,
  PRIORITIES,
  SUBSCRIPTION_FIELDS,
  PARTICIPANT_KINDS,
} from "./eventBusContracts.js";

function _result(errors) {
  return { valid: errors.length === 0, errors };
}

export function validateEvent(event) {
  const errors = [];
  if (!event || typeof event !== "object") {
    return _result(["event is not an object"]);
  }
  for (const f of EVENT_FIELDS) {
    if (!(f in event)) errors.push(`missing field: ${f}`);
  }
  if (event.eventId !== undefined && typeof event.eventId !== "string") {
    errors.push("eventId must be a string");
  }
  if (!event.eventType || typeof event.eventType !== "string") {
    errors.push("eventType must be a non-empty string");
  }
  if (!PRIORITIES.includes(event.priority)) {
    errors.push(`invalid priority: ${event.priority}`);
  }
  if (event.timestamp !== undefined && typeof event.timestamp !== "string") {
    errors.push("timestamp must be a string");
  }
  if (!Object.isFrozen(event)) {
    errors.push("event must be frozen (Object.freeze)");
  }
  return _result(errors);
}

export function validatePriority(priority) {
  const errors = [];
  if (typeof priority !== "string") {
    return _result(["priority must be a string"]);
  }
  if (!PRIORITIES.includes(priority)) {
    errors.push(`invalid priority: ${priority}. Valid: ${PRIORITIES.join(", ")}`);
  }
  return _result(errors);
}

export function validateQueue(queue) {
  const errors = [];
  if (!queue || typeof queue !== "object") {
    return _result(["queue is not an object"]);
  }
  const methods = ["enqueue", "dequeue", "peek", "clear", "size", "isEmpty"];
  for (const m of methods) {
    if (typeof queue[m] !== "function") {
      errors.push(`queue missing method: ${m}`);
    }
  }
  return _result(errors);
}

export function validatePublisher(publisher) {
  const errors = [];
  if (!publisher || typeof publisher !== "object") {
    return _result(["publisher is not an object"]);
  }
  const methods = ["publish", "publishBatch", "schedule", "cancel", "retry", "discard"];
  for (const m of methods) {
    if (typeof publisher[m] !== "function") {
      errors.push(`publisher missing method: ${m}`);
    }
  }
  return _result(errors);
}

export function validateConsumer(consumer) {
  const errors = [];
  if (!consumer || typeof consumer !== "object") {
    return _result(["consumer is not an object"]);
  }
  const methods = ["subscribe", "unsubscribe", "pause", "resume", "consume", "ack", "nack"];
  for (const m of methods) {
    if (typeof consumer[m] !== "function") {
      errors.push(`consumer missing method: ${m}`);
    }
  }
  return _result(errors);
}

export function validateSubscription(subscription) {
  const errors = [];
  if (!subscription || typeof subscription !== "object") {
    return _result(["subscription is not an object"]);
  }
  for (const f of SUBSCRIPTION_FIELDS) {
    if (!(f in subscription)) errors.push(`missing field: ${f}`);
  }
  if (subscription.consumerName !== undefined && typeof subscription.consumerName !== "string") {
    errors.push("consumerName must be a string");
  }
  if (subscription.eventType !== undefined && typeof subscription.eventType !== "string") {
    errors.push("eventType must be a string");
  }
  if (subscription.active !== undefined && typeof subscription.active !== "boolean") {
    errors.push("active must be boolean");
  }
  if (subscription.paused !== undefined && typeof subscription.paused !== "boolean") {
    errors.push("paused must be boolean");
  }
  if (!Object.isFrozen(subscription)) {
    errors.push("subscription must be frozen");
  }
  return _result(errors);
}

export function validateRetry(record) {
  const errors = [];
  if (!record || typeof record !== "object") {
    return _result(["retry record is not an object"]);
  }
  if (typeof record.attempt !== "number") {
    errors.push("attempt must be a number");
  }
  if (typeof record.maxAttempts !== "number") {
    errors.push("maxAttempts must be a number");
  }
  if (
    typeof record.attempt === "number" &&
    typeof record.maxAttempts === "number" &&
    record.attempt > record.maxAttempts
  ) {
    errors.push("attempt exceeds maxAttempts");
  }
  return _result(errors);
}

export function validateParticipant(participant) {
  const errors = [];
  if (!participant || typeof participant !== "object") {
    return _result(["participant is not an object"]);
  }
  if (!participant.participantId || typeof participant.participantId !== "string") {
    errors.push("missing participantId");
  }
  if (!PARTICIPANT_KINDS.includes(participant.kind)) {
    errors.push(`invalid kind: ${participant.kind}`);
  }
  if (!participant.name || typeof participant.name !== "string") {
    errors.push("missing name");
  }
  if (!Object.isFrozen(participant)) {
    errors.push("participant must be frozen");
  }
  return _result(errors);
}