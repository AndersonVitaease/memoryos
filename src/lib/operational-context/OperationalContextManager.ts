/**
 * OperationalContextManager.ts — Sprint C-03.0
 * Unico ponto de entrada para manipular o Operational Context.
 *
 * Nenhuma outra classe acessa o Store diretamente.
 * Garante imutabilidade, auditoria e telemetria em cada operacao.
 *
 * API publica: bind / lookup / update / remove / clear / expire
 */

import { OperationalContextStore }        from "./OperationalContextStore";
import { OperationalContextService }      from "./OperationalContextService";
import { OCTelemetry }                    from "./OperationalContextTelemetry";
import type { LookupResult }             from "./OperationalContextService";
import type { OperationalResource }      from "./OperationalResource";
import type { OperationalEntity }        from "./OperationalEntity";
import { createResource }                from "./OperationalResource";
import { createEntity, touchEntity, updateEntityResource } from "./OperationalEntity";
import { contextWith, contextWithout, clearedContext }     from "./OperationalContext";

// ── BindInput ─────────────────────────────────────────────────────────────────

export interface BindInput {
  /** Identificador unico da entidade (ex: "curriculo", "rg") */
  readonly entityId:      string;
  /** Nome canonico legivel */
  readonly canonicalName: string;
  /** Aliases adicionais (ex: ["cv", "meu curriculo"]) */
  readonly aliases:       readonly string[];
  /** ResourceId tecnico retornado pelo Reference Resolution */
  readonly resourceId:    string;
  /** Connector que resolveu o recurso */
  readonly connectorId:   string;
  /** Nome legivel do recurso (nome do arquivo / assunto do email) */
  readonly displayName:   string;
  /** Confidence score do Reference Resolution [0,1] */
  readonly confidence:    number;
}

// ── OperationalContextManager ─────────────────────────────────────────────────

export class OperationalContextManager {
  private readonly _store:   OperationalContextStore;
  private readonly _service: OperationalContextService;

  constructor(store?: OperationalContextStore) {
    this._store   = store ?? new OperationalContextStore();
    this._service = new OperationalContextService();
  }

  // ── bind() ──────────────────────────────────────────────────────────────────

  /**
   * Cria ou substitui o binding de uma entidade.
   * Se a entidade ja existir, seus aliases sao preservados e expandidos.
   */
  bind(input: BindInput): Readonly<OperationalEntity> {
    const t0  = Date.now();
    const ctx = this._store.get();

    const resource: Readonly<OperationalResource> = createResource(
      input.resourceId, input.connectorId, input.displayName, input.confidence,
    );

    const existing = ctx.entities.get(input.entityId);
    const isUpdate = existing !== undefined;

    const entity = isUpdate
      ? updateEntityResource(existing!, resource, input.aliases)
      : createEntity(input.entityId, input.canonicalName, input.aliases, resource);

    this._store.set(contextWith(ctx, entity));

    const ms = Date.now() - t0;
    OCTelemetry.recordBind(ms);
    OCTelemetry.emit(Object.freeze({
      type:          isUpdate ? "OperationalBindingUpdated" : "OperationalBindingCreated",
      entityId:      entity.id,
      canonicalName: entity.canonicalName,
      connectorId:   resource.connectorId,
      resourceId:    resource.resourceId,
      reason:        isUpdate ? "Resource updated from Reference Resolution" : "New binding created",
      durationMs:    ms,
      timestamp:     Date.now(),
    }));

    return entity;
  }

  // ── lookup() ─────────────────────────────────────────────────────────────────

  /**
   * Procura um binding pelo alias.
   * Atualiza lastAccessed se encontrado.
   * Retorna LookupResult com explainability.
   */
  lookup(alias: string): LookupResult {
    const t0     = Date.now();
    const ctx    = this._store.get();
    const result = this._service.lookup(ctx, alias);

    if (result.found && result.entity) {
      // Touch lastAccessed
      const updated = touchEntity(result.entity);
      this._store.set(contextWith(ctx, updated));

      const ms = Date.now() - t0;
      OCTelemetry.recordLookup(ms);
      OCTelemetry.emit(Object.freeze({
        type:          "OperationalBindingUsed",
        entityId:      result.entity.id,
        canonicalName: result.entity.canonicalName,
        connectorId:   result.entity.resource.connectorId,
        resourceId:    result.entity.resource.resourceId,
        alias:         result.matchedAlias ?? undefined,
        reason:        result.explanation,
        durationMs:    ms,
        timestamp:     Date.now(),
      }));

      return { ...result, entity: updated };
    }

    OCTelemetry.recordLookup(Date.now() - t0);
    return result;
  }

  // ── update() ─────────────────────────────────────────────────────────────────

  /**
   * Atualiza o resource de uma entidade existente com novos aliases opcionais.
   * No-op se a entidade nao existir.
   */
  update(entityId: string, resource: Readonly<OperationalResource>, newAliases?: readonly string[]): boolean {
    const ctx      = this._store.get();
    const existing = ctx.entities.get(entityId);
    if (!existing) return false;

    const updated = updateEntityResource(existing, resource, newAliases);
    this._store.set(contextWith(ctx, updated));

    OCTelemetry.emit(Object.freeze({
      type:          "OperationalBindingUpdated",
      entityId:      updated.id,
      canonicalName: updated.canonicalName,
      connectorId:   resource.connectorId,
      resourceId:    resource.resourceId,
      reason:        "Manual update",
      timestamp:     Date.now(),
    }));

    return true;
  }

  // ── remove() ─────────────────────────────────────────────────────────────────

  /**
   * Remove uma entidade do contexto.
   * No-op se nao existir.
   */
  remove(entityId: string): boolean {
    const ctx      = this._store.get();
    const existing = ctx.entities.get(entityId);
    if (!existing) return false;

    this._store.set(contextWithout(ctx, entityId));

    OCTelemetry.emit(Object.freeze({
      type:          "OperationalBindingRemoved",
      entityId:      existing.id,
      canonicalName: existing.canonicalName,
      connectorId:   existing.resource.connectorId,
      resourceId:    existing.resource.resourceId,
      reason:        "Explicitly removed",
      timestamp:     Date.now(),
    }));

    return true;
  }

  // ── expire() ─────────────────────────────────────────────────────────────────

  /**
   * Remove entidades cujo resolvedAt seja anterior a (now - ttlMs).
   * Retorna quantidade expirada.
   */
  expire(ttlMs: number): number {
    const ctx    = this._store.get();
    const cutoff = Date.now() - ttlMs;
    let count    = 0;

    let current = ctx;
    for (const entity of ctx.entities.values()) {
      if (entity.resource.resolvedAt < cutoff) {
        current = contextWithout(current, entity.id);
        count++;
        OCTelemetry.emit(Object.freeze({
          type:          "OperationalBindingExpired",
          entityId:      entity.id,
          canonicalName: entity.canonicalName,
          connectorId:   entity.resource.connectorId,
          resourceId:    entity.resource.resourceId,
          reason:        `TTL expired after ${ttlMs}ms`,
          timestamp:     Date.now(),
        }));
      }
    }

    if (count > 0) this._store.set(current);
    return count;
  }

  // ── clear() ──────────────────────────────────────────────────────────────────

  /**
   * Limpa todo o contexto (fim de sessao / disconnect).
   */
  clear(): void {
    const ctx = this._store.get();
    for (const entity of ctx.entities.values()) {
      OCTelemetry.emit(Object.freeze({
        type:          "OperationalBindingRemoved",
        entityId:      entity.id,
        canonicalName: entity.canonicalName,
        connectorId:   entity.resource.connectorId,
        resourceId:    entity.resource.resourceId,
        reason:        "Context cleared (session end)",
        timestamp:     Date.now(),
      }));
    }
    this._store.set(clearedContext());
  }

  // ── Getters ───────────────────────────────────────────────────────────────────

  activeCount(): number {
    return this._store.get().entities.size;
  }

  snapshot(): ReadonlyMap<string, Readonly<OperationalEntity>> {
    return this._store.get().entities;
  }
}

// ── Session singleton ──────────────────────────────────────────────────────────
// One manager per browser session — no cross-session sharing.

const _KEY = "__OC_MANAGER__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new OperationalContextManager();
}
export const operationalContextManager: OperationalContextManager = (
  globalThis as unknown as Record<string, OperationalContextManager>
)[_KEY];