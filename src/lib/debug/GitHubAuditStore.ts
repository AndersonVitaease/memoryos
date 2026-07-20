/**
 * GitHubAuditStore.ts — Sprint M1.12 Forensic Audit
 *
 * SRP: armazenar eventos de auditoria forense do fluxo GitHub.
 *
 * AUDIT_MODE = false → nenhum evento registrado, zero impacto de performance.
 * AUDIT_MODE = true  → todos os eventos são capturados para diagnóstico.
 *
 * NÃO altera comportamento funcional.
 * NÃO bloqueia execução.
 * NÃO modifica qualquer pipeline, connector ou runtime.
 */

// ── AUDIT_MODE flag ───────────────────────────────────────────────────────────
// Set to true to enable forensic recording. Zero-cost when false.
export const GITHUB_AUDIT_MODE: boolean =
  (globalThis as any).__GITHUB_AUDIT_MODE__ === true;

// ── Event type ────────────────────────────────────────────────────────────────

export interface GitHubAuditEvent {
  id:          string;
  timestamp:   string;
  executionId: string;
  stage:
    | "route"
    | "repos.list"
    | "resolver"
    | "capability"
    | "runtime"
    | "connector";
  status?:       string;
  error?:        string;
  capability?:   string;
  payload?:      unknown;
  result?:       unknown;
  repoCount?:    number;
  selectedRepo?: unknown;
}

// ── Store ─────────────────────────────────────────────────────────────────────

let _seq = 1;

function makeEventId(): string {
  return `gh-audit-${Date.now()}-${(_seq++).toString().padStart(4, "0")}`;
}

class GitHubAuditStoreClass {
  private _events: GitHubAuditEvent[] = [];
  private _subscribers: Array<() => void> = [];

  record(event: Omit<GitHubAuditEvent, "id" | "timestamp">): void {
    if (!GITHUB_AUDIT_MODE) return;
    const full: GitHubAuditEvent = {
      ...event,
      id:        makeEventId(),
      timestamp: new Date().toISOString(),
    };
    this._events.push(full);
    if (this._events.length > 500) this._events.splice(0, this._events.length - 500);
    this._notify();
  }

  getAll(): readonly GitHubAuditEvent[] {
    return [...this._events];
  }

  getByExecutionId(executionId: string): readonly GitHubAuditEvent[] {
    return this._events.filter(e => e.executionId === executionId);
  }

  clear(): void {
    this._events = [];
    this._notify();
  }

  export(): string {
    return JSON.stringify(this._events, null, 2);
  }

  subscribe(fn: () => void): () => void {
    this._subscribers.push(fn);
    return () => { this._subscribers = this._subscribers.filter(s => s !== fn); };
  }

  private _notify(): void {
    this._subscribers.forEach(fn => { try { fn(); } catch { /* non-blocking */ } });
  }

  get size(): number { return this._events.length; }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const _KEY = "__GITHUB_AUDIT_STORE__";
if (!(globalThis as any)[_KEY]) {
  (globalThis as any)[_KEY] = new GitHubAuditStoreClass();
}

export const githubAuditStore: GitHubAuditStoreClass =
  (globalThis as any)[_KEY] as GitHubAuditStoreClass;