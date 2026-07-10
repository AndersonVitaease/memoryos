/**
 * MemoryRecord — Registro persistido pelo IMemoryProvider
 * Foundation: MRS Cap.3
 * Sprint: 1
 */

import type { MemoryPriority } from "./MemoryPriority";

/** Registro de memória genérico usado pelo IMemoryProvider */
export interface MemoryRecord {
  readonly id: string;
  readonly key: string;
  value: unknown;
  readonly priority: MemoryPriority;
  readonly storedAt: number;
  expiresAt: number;
  accessCount: number;
  lastAccessedAt: number;
  readonly autoPromote: boolean;
  readonly metadata?: Record<string, string | number | boolean>;
}