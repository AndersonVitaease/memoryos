// KnowledgeStoreMiddleware.ts — Sprint EF-38.1
// Middleware pipeline executed before every store operation.
// Each step is independent, immutable, and replaceable.

import { KnowledgeStoreValidation } from "./KnowledgeStoreValidation";
import { KnowledgeStoreEventBus }   from "./KnowledgeStoreEvents";
import { KnowledgeStoreMetrics }    from "./KnowledgeStoreMetrics";
import { KnowledgeStoreHealthMonitor } from "./KnowledgeStoreHealthMonitor";

export type OperationKind =
  | "store" | "update" | "archive" | "restore" | "delete"
  | "exists" | "get" | "search" | "query" | "stats" | "health";

export interface MiddlewareContext {
  readonly operation:   OperationKind;
  readonly payload:     unknown;
  readonly requestId:   string;
  readonly callerTag?:  string;
  readonly startedAt:   number;
}

export interface MiddlewareResult {
  readonly ok:         boolean;
  readonly context:    MiddlewareContext;
  readonly blocked:    boolean;
  readonly blockReason?: string;
  readonly trace:      readonly string[];
}

let _seq = 0;
const uid = () => `req-${Date.now()}-${++_seq}`;

// ── Step 1: Validation ────────────────────────────────────────────────────────
function stepValidation(ctx: MiddlewareContext): { ok: boolean; reason?: string } {
  if (ctx.operation === "store") {
    const r = KnowledgeStoreValidation.validateDraft(ctx.payload as any);
    if (!r.valid) return { ok: false, reason: r.errors[0]?.message };
  }
  if (ctx.operation === "search") {
    const r = KnowledgeStoreValidation.validateSearchQuery(ctx.payload as any);
    if (!r.valid) return { ok: false, reason: r.errors[0]?.message };
  }
  if (ctx.operation === "query") {
    const r = KnowledgeStoreValidation.validateQuery(ctx.payload as any);
    if (!r.valid) return { ok: false, reason: r.errors[0]?.message };
  }
  return { ok: true };
}

// ── Step 2: Authorization ─────────────────────────────────────────────────────
// In EF-38.1 authorization is always permitted — rules injected in future sprint.
function stepAuthorization(_ctx: MiddlewareContext): { ok: boolean; reason?: string } {
  return { ok: true };
}

// ── Step 3: Audit ─────────────────────────────────────────────────────────────
function stepAudit(ctx: MiddlewareContext): { ok: boolean } {
  KnowledgeStoreEventBus.emit(
    ctx.operation === "health" ? "HEALTH_CHECKED" : "RECORD_QUERIED",
    "middleware",
    { meta: { requestId: ctx.requestId, operation: ctx.operation } }
  );
  return { ok: true };
}

// ── Step 4: Metrics ───────────────────────────────────────────────────────────
function stepMetrics(_ctx: MiddlewareContext): { ok: boolean } {
  // Pre-operation metrics will be finalized in facade after result
  return { ok: true };
}

// ── Step 5: Tracing ───────────────────────────────────────────────────────────
function stepTracing(ctx: MiddlewareContext): { ok: boolean } {
  // Trace entry point — in production this would forward to OpenTelemetry
  return { ok: true };
}

export const KnowledgeStoreMiddleware = {
  createContext(operation: OperationKind, payload: unknown, callerTag?: string): MiddlewareContext {
    return Object.freeze({ operation, payload, requestId: uid(), callerTag, startedAt: Date.now() });
  },

  run(ctx: MiddlewareContext): MiddlewareResult {
    const trace: string[] = [];

    // Step 1: Validation
    const v = stepValidation(ctx);
    trace.push(`validation:${v.ok ? "pass" : "fail"}`);
    if (!v.ok) return Object.freeze({ ok: false, context: ctx, blocked: true, blockReason: v.reason, trace: Object.freeze(trace) });

    // Step 2: Authorization
    const a = stepAuthorization(ctx);
    trace.push(`authorization:${a.ok ? "pass" : "fail"}`);
    if (!a.ok) return Object.freeze({ ok: false, context: ctx, blocked: true, blockReason: a.reason, trace: Object.freeze(trace) });

    // Step 3: Audit
    const au = stepAudit(ctx);
    trace.push(`audit:${au.ok ? "pass" : "fail"}`);

    // Step 4: Metrics
    stepMetrics(ctx);
    trace.push("metrics:recorded");

    // Step 5: Tracing
    stepTracing(ctx);
    trace.push("tracing:recorded");

    return Object.freeze({ ok: true, context: ctx, blocked: false, trace: Object.freeze(trace) });
  },
};