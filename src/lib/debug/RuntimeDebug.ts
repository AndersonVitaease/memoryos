/**
 * RuntimeDebug — MemoryOS Official Observability Infrastructure
 *
 * Event Bus generico e imutavel para rastreamento ponta a ponta de todos
 * os conectores do MemoryOS.
 *
 * DESIGN:
 *   - Zero dependencia de console.log (sem monkey-patch)
 *   - Cada execucao possui um executionId (Correlation ID)
 *   - Todos os eventos do mesmo fluxo compartilham esse ID
 *   - Suporta qualquer conector (Drive, Gmail, Calendar, GitHub, etc.)
 *   - Fan-out automatico para: console | window.__MEMORY_DEBUG__ | UI subscribers
 *
 * API publica:
 *   RuntimeDebug.startExecution(connector, label?) → executionId
 *   RuntimeDebug.emit({ executionId, source, event, connector, payload })
 *   RuntimeDebug.closeExecution(executionId)
 *   RuntimeDebug.subscribe(fn) → unsubscribe
 *   RuntimeDebug.getExecutions(connector?) → DebugExecution[]
 *   RuntimeDebug.clear(connector?)
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type DebugConnector =
  | "google-drive"
  | "gmail"
  | "google-calendar"
  | "github"
  | "whatsapp"
  | "base44"
  | "system"
  | string; // open for future connectors

export interface DebugEvent {
  /** Unique event ID */
  id:          string;
  /** Correlation ID — all events in a single flow share this */
  executionId: string;
  /** Connector that emitted this event */
  connector:   DebugConnector;
  /** Component within the connector (e.g. "Planner", "Executor") */
  source:      string;
  /** Short descriptive label (e.g. "strategy selection") */
  event:       string;
  /** Arbitrary structured payload */
  payload:     Record<string, unknown>;
  /** Epoch ms */
  ts:          number;
}

export interface DebugExecution {
  /** Correlation ID */
  executionId: string;
  /** Connector this execution belongs to */
  connector:   DebugConnector;
  /** Human-readable label (optional) */
  label:       string;
  /** Epoch ms when execution started */
  startedAt:   number;
  /** Epoch ms when execution ended (undefined = still open) */
  endedAt?:    number;
  /** Ordered list of events */
  events:      DebugEvent[];
}

export interface EmitOptions {
  executionId: string;
  connector:   DebugConnector;
  source:      string;
  event:       string;
  payload?:    Record<string, unknown>;
}

// ── ID generators ─────────────────────────────────────────────────────────────

let _seq = 0;
function _execId(connector: string): string {
  return `${connector}-${Date.now()}-${(++_seq).toString().padStart(4, "0")}`;
}
function _evId(): string {
  return `ev-${Date.now()}-${(++_seq).toString().padStart(6, "0")}`;
}

// ── RuntimeDebug class ────────────────────────────────────────────────────────

const MAX_EXECUTIONS = 50;

class RuntimeDebugBus {
  private _executions: DebugExecution[] = [];
  private _listeners: Set<() => void>   = new Set();

  // ── Execution lifecycle ───────────────────────────────────────────────────

  /**
   * Start a new traced execution.
   * Returns a Correlation ID that must be passed to every emit() call
   * belonging to this flow.
   */
  startExecution(connector: DebugConnector, label = ""): string {
    const executionId = _execId(connector);
    this._executions.unshift({
      executionId,
      connector,
      label: label || `${connector} — ${new Date().toLocaleTimeString("pt-BR")}`,
      startedAt: Date.now(),
      events:    [],
    });
    if (this._executions.length > MAX_EXECUTIONS) this._executions.pop();
    this._flush();
    return executionId;
  }

  /** Mark an execution as complete. */
  closeExecution(executionId: string): void {
    const ex = this._find(executionId);
    if (ex && !ex.endedAt) {
      ex.endedAt = Date.now();
      this._flush();
    }
  }

  // ── Event emission ────────────────────────────────────────────────────────

  /**
   * Emit a debug event.
   * If executionId is unknown, auto-creates an execution for the connector.
   * Fan-out order: store → console → window.__MEMORY_DEBUG__ → UI subscribers
   */
  emit(opts: EmitOptions): void {
    let ex = this._find(opts.executionId);
    if (!ex) {
      // Auto-create execution when none exists (covers the "already open" case)
      const executionId = opts.executionId;
      ex = {
        executionId,
        connector: opts.connector,
        label:     `${opts.connector} — auto`,
        startedAt: Date.now(),
        events:    [],
      };
      this._executions.unshift(ex);
      if (this._executions.length > MAX_EXECUTIONS) this._executions.pop();
    }

    const ev: DebugEvent = {
      id:          _evId(),
      executionId: opts.executionId,
      connector:   opts.connector,
      source:      opts.source,
      event:       opts.event,
      payload:     opts.payload ?? {},
      ts:          Date.now(),
    };

    ex.events.push(ev);

    // Fan-out 1: console (structured, no monkey-patch)
    console.debug(
      `[RuntimeDebug][${opts.connector}][${opts.source}] ${opts.event}`,
      { executionId: opts.executionId, ...opts.payload },
    );

    // Fan-out 2+3 handled in _flush
    this._flush();
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  /** Get all executions, optionally filtered by connector. */
  getExecutions(connector?: DebugConnector): DebugExecution[] {
    if (!connector) return [...this._executions];
    return this._executions.filter((e) => e.connector === connector);
  }

  getExecution(executionId: string): DebugExecution | undefined {
    return this._find(executionId);
  }

  /** True when an execution with this ID exists and has no endedAt. */
  isOpen(executionId: string): boolean {
    const ex = this._find(executionId);
    return !!ex && !ex.endedAt;
  }

  clear(connector?: DebugConnector): void {
    if (connector) {
      this._executions = this._executions.filter((e) => e.connector !== connector);
    } else {
      this._executions = [];
    }
    this._flush();
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────

  subscribe(fn: () => void): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _find(executionId: string): DebugExecution | undefined {
    return this._executions.find((e) => e.executionId === executionId);
  }

  private _flush(): void {
    // Fan-out 2: window.__MEMORY_DEBUG__
    const g = globalThis as unknown as Record<string, unknown>;
    if (!g.__MEMORY_DEBUG__) g.__MEMORY_DEBUG__ = {};
    const mem = g.__MEMORY_DEBUG__ as Record<string, unknown>;
    mem.executions = this._executions;
    // Per-connector shortcuts for convenience (e.g. window.__MEMORY_DEBUG__.drive)
    const byConnector: Record<string, DebugExecution[]> = {};
    for (const ex of this._executions) {
      const key = ex.connector.replace(/-/g, "_"); // "google-drive" → "google_drive"
      if (!byConnector[key]) byConnector[key] = [];
      byConnector[key].push(ex);
    }
    Object.assign(mem, byConnector);
    // Also keep legacy .drive key
    mem.drive = byConnector["google_drive"] ?? [];

    // Fan-out 3: UI subscribers
    this._listeners.forEach((fn) => fn());
  }
}

// ── Singleton (globalThis-anchored, HMR-safe) ─────────────────────────────────

const _KEY = "__MEMORY_OS_RUNTIME_DEBUG__";
const _gbl = globalThis as unknown as Record<string, unknown>;
if (!_gbl[_KEY]) _gbl[_KEY] = new RuntimeDebugBus();

export const RuntimeDebug: RuntimeDebugBus = _gbl[_KEY] as RuntimeDebugBus;