/**
 * TransportRegistry.ts — Universal Transport Layer v1.0
 * Sprint EF-6.5.0
 *
 * Central registry for all ITransport implementations.
 * Plugin model: register(transport) → available automatically.
 * Open/Closed: open for new transports, closed for modification.
 */

import type { ITransport }    from "./ITransport";
import type { TransportRequest } from "./UTLTypes";

class TransportRegistryClass {
  private readonly _transports = new Map<string, ITransport>();

  /** Register a transport. Idempotent — duplicate ids ignored. */
  register(transport: ITransport): void {
    if (this._transports.has(transport.id)) return;
    this._transports.set(transport.id, transport);
  }

  /** Get a transport by id. Returns null if not registered. */
  get(transportId: string): ITransport | null {
    return this._transports.get(transportId) ?? null;
  }

  /** Find the first transport that supports the given request. */
  resolve(request: TransportRequest): ITransport | null {
    for (const t of this._transports.values()) {
      if (t.supports(request)) return t;
    }
    return null;
  }

  /** All registered transport ids (sorted). */
  listIds(): string[] {
    return [...this._transports.keys()].sort();
  }

  /** All registered transports. */
  listAll(): ITransport[] {
    return [...this._transports.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  has(transportId: string): boolean {
    return this._transports.has(transportId);
  }

  get size(): number {
    return this._transports.size;
  }
}

// ── Singleton (HMR-safe) ──────────────────────────────────────────────────────

const _KEY = "__UTL_TRANSPORT_REGISTRY__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new TransportRegistryClass();
}

export const TransportRegistry: TransportRegistryClass = (
  globalThis as unknown as Record<string, TransportRegistryClass>
)[_KEY];