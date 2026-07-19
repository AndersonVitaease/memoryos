/**
 * DriveDebugStore.ts
 *
 * Intercepta TODOS os logs [DIAG] do fluxo Google Drive e os espelha em:
 *   window.__MEMORY_DEBUG__.drive
 *
 * Não altera nenhuma lógica de produção.
 * Apenas observa via patch no console.log.
 */

export interface DriveDebugEvent {
  ts: number;
  source: string;
  label: string;
  data: Record<string, unknown>;
}

export interface DriveDebugRun {
  id: string;
  startedAt: number;
  events: DriveDebugEvent[];
  closed: boolean;
}

const MAX_RUNS = 20;

class DriveDebugStore {
  private runs: DriveDebugRun[] = [];
  private listeners: Array<() => void> = [];

  /** Returns a copy of all runs for UI rendering */
  getRuns(): DriveDebugRun[] {
    return [...this.runs];
  }

  startRun(): string {
    const id = `run-${Date.now()}`;
    this.runs.unshift({ id, startedAt: Date.now(), events: [], closed: false });
    if (this.runs.length > MAX_RUNS) this.runs.pop();
    this._notify();
    return id;
  }

  addEvent(runId: string, event: Omit<DriveDebugEvent, "ts">): void {
    const run = this.runs.find((r) => r.id === runId);
    if (!run) return;
    run.events.push({ ts: Date.now(), ...event });
    this._notify();
  }

  closeRun(runId: string): void {
    const run = this.runs.find((r) => r.id === runId);
    if (run) run.closed = true;
    this._notify();
  }

  /** Add an event to the most recent open run (used by console intercept) */
  addToLatestRun(event: Omit<DriveDebugEvent, "ts">): void {
    const open = this.runs.find((r) => !r.closed);
    if (!open) {
      // Auto-start a run if none is open
      const id = this.startRun();
      const run = this.runs.find((r) => r.id === id)!;
      run.events.push({ ts: Date.now(), ...event });
    } else {
      open.events.push({ ts: Date.now(), ...event });
    }
    this._notify();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  clear(): void {
    this.runs = [];
    this._notify();
  }

  private _notify(): void {
    this.listeners.forEach((l) => l());
    // Keep window.__MEMORY_DEBUG__.drive in sync
    const g = globalThis as unknown as Record<string, unknown>;
    if (!g.__MEMORY_DEBUG__) g.__MEMORY_DEBUG__ = {};
    (g.__MEMORY_DEBUG__ as Record<string, unknown>).drive = this.runs;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const _key = "__DRIVE_DEBUG_STORE__";
const _g = globalThis as unknown as Record<string, unknown>;
if (!_g[_key]) _g[_key] = new DriveDebugStore();
export const driveDebugStore: DriveDebugStore = _g[_key] as DriveDebugStore;

// ── Console interceptor ───────────────────────────────────────────────────────
// Patches console.log once. Parses [DIAG] messages and routes to the store.

let _intercepted = false;

const DIAG_SOURCES: Record<string, string> = {
  "[DIAG][Planner]":              "Planner",
  "[DIAG][DriveCtxBuilder]":      "DriveContextBuilder",
  "[DIAG][ConversationStore]":    "ConversationStore",
  "[DIAG][DriveDownloadExecutor]":"DriveDownloadExecutor",
};

function _classify(msg: string): { source: string; label: string } | null {
  for (const [prefix, source] of Object.entries(DIAG_SOURCES)) {
    if (msg.startsWith(prefix)) {
      const label = msg.slice(prefix.length).trim();
      return { source, label };
    }
  }
  return null;
}

export function installConsoleInterceptor(): void {
  if (_intercepted) return;
  _intercepted = true;

  const _orig = console.log.bind(console);

  console.log = (...args: unknown[]) => {
    _orig(...args);

    const first = args[0];
    if (typeof first !== "string") return;
    const classified = _classify(first);
    if (!classified) return;

    const data = (args[1] && typeof args[1] === "object" ? args[1] : {}) as Record<string, unknown>;
    driveDebugStore.addToLatestRun({
      source: classified.source,
      label:  classified.label,
      data,
    });
  };
}