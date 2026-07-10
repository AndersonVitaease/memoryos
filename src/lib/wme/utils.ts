// ─── Working Memory Engine — Utilities ───────────────────────────────────────
// Sprint 1 · Foundation v1.0

import type { IdentityContext } from "./types";

let _counter = 0;

/** Generates a deterministic-ish unique ID without external deps */
export function generateId(prefix = "wme"): string {
  _counter = (_counter + 1) % 1_000_000;
  return `${prefix}_${Date.now()}_${_counter.toString(36).padStart(4, "0")}`;
}

/** Validates IdentityContext — throws with clear message if invalid */
export function validateContext(ctx: IdentityContext): void {
  if (!ctx || typeof ctx !== "object") throw new Error("IdentityContext must be an object");
  if (!ctx.userId || typeof ctx.userId !== "string" || ctx.userId.trim() === "") {
    throw new Error("IdentityContext.userId is required and must be a non-empty string");
  }
  if (!ctx.projectId || typeof ctx.projectId !== "string" || ctx.projectId.trim() === "") {
    throw new Error("IdentityContext.projectId is required and must be a non-empty string");
  }
}

/** Validates a memory key */
export function validateKey(key: string): void {
  if (!key || typeof key !== "string" || key.trim() === "") {
    throw new Error("Memory key is required and must be a non-empty string");
  }
  if (key.length > 256) throw new Error("Memory key must not exceed 256 characters");
}

/** Returns a stable namespace key for context isolation */
export function contextNamespace(ctx: IdentityContext): string {
  return `${ctx.userId}::${ctx.projectId}`;
}

/** Determines if an item has expired */
export function isExpired(expiresAt: number | null): boolean {
  if (expiresAt === null) return false;
  return Date.now() >= expiresAt;
}

/** Computes expiry timestamp */
export function computeExpiresAt(ttl: number): number | null {
  if (!ttl || ttl <= 0) return null;
  return Date.now() + ttl;
}