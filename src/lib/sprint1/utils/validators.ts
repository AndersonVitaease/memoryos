/**
 * Validators — Validação de entrada para Working Memory
 * Foundation: MCS, MQCCS
 * Sprint: 1
 */

import type { IdentityContext } from "../types/IdentityContext";
import type { WorkingMemoryItem } from "../types/WorkingMemoryItem";
import { MemoryPriority } from "../types/MemoryPriority";

/** Erro de validação de entrada */
export class MemoryValidationError extends Error {
  public readonly field: string;
  constructor(field: string, message: string) {
    super(`[WorkingMemory] Validation failed on '${field}': ${message}`);
    this.name = "MemoryValidationError";
    this.field = field;
  }
}

/** Valida um IdentityContext */
export function validateContext(ctx: IdentityContext): void {
  if (!ctx.userId || typeof ctx.userId !== "string" || ctx.userId.trim() === "") {
    throw new MemoryValidationError("ctx.userId", "must be a non-empty string");
  }
  if (!ctx.sessionId || typeof ctx.sessionId !== "string" || ctx.sessionId.trim() === "") {
    throw new MemoryValidationError("ctx.sessionId", "must be a non-empty string");
  }
  if (!ctx.domain) {
    throw new MemoryValidationError("ctx.domain", "must be defined");
  }
}

/** Valida um item a ser armazenado */
export function validateStoreInput(
  item: Omit<WorkingMemoryItem, "id" | "storedAt">
): void {
  if (!item.key || typeof item.key !== "string" || item.key.trim() === "") {
    throw new MemoryValidationError("item.key", "must be a non-empty string");
  }
  if (item.key.length > 256) {
    throw new MemoryValidationError("item.key", "must be 256 characters or less");
  }
  if (item.value === undefined) {
    throw new MemoryValidationError("item.value", "must not be undefined");
  }
  if (!(item.priority in MemoryPriority) && !Object.values(MemoryPriority).includes(item.priority as MemoryPriority)) {
    throw new MemoryValidationError("item.priority", `invalid priority value: ${item.priority}`);
  }
  if (typeof item.expiresAt !== "number" || item.expiresAt <= Date.now()) {
    throw new MemoryValidationError("item.expiresAt", "must be a future timestamp");
  }
}

/** Valida TTL adicional para touch() */
export function validateExtraTtl(extraTtlMs: number): void {
  if (typeof extraTtlMs !== "number" || extraTtlMs <= 0) {
    throw new MemoryValidationError("extraTtlMs", "must be a positive number");
  }
  if (extraTtlMs > 48 * 60 * 60 * 1000) {
    throw new MemoryValidationError("extraTtlMs", "cannot exceed 48 hours");
  }
}