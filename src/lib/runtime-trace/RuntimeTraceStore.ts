/**
 * RuntimeTraceStore.ts
 * Singleton in-memory store for the last pipeline execution trace.
 * Zero dependencies on ConversationStore — can be read from any page.
 * Survives HMR via globalThis anchor.
 */

export type TraceStepStatus = "executed" | "skipped" | "error";

export interface TraceStep {
  id:          string;
  label:       string;
  status:      TraceStepStatus;
  startedAt:   number | null;
  finishedAt:  number | null;
  durationMs:  number | null;
  data:        unknown;
  error:       string | null;
}

export interface RuntimeTrace {
  executionId: string;
  userMessage: string;
  startedAt:   number;
  finishedAt:  number | null;
  steps:       TraceStep[];
}

// Step IDs — ordered
export const TRACE_STEP_IDS = [
  "goal",
  "plan",
  "capability",
  "connector",
  "http_request",
  "http_response",
  "mime_payload",
  "mime_tree",
  "mime_parser_result",
  "llm_input",
  "llm_response",
] as const;

export type TraceStepId = typeof TRACE_STEP_IDS[number];

const STEP_LABELS: Record<TraceStepId, string> = {
  goal:               "1. Goal detectado",
  plan:               "2. Plano gerado",
  capability:         "3. Capability escolhida",
  connector:          "4. Connector executado",
  http_request:       "5. Endpoint chamado",
  http_response:      "6. Response da Gmail API (JSON bruto)",
  mime_payload:       "7. Payload recebido",
  mime_tree:          "8. MIME Tree",
  mime_parser_result: "9. Resultado do GmailMimeParser",
  llm_input:          "10. Resultado enviado ao LLM",
  llm_response:       "11. Resposta final entregue ao usuário",
};

function makeStep(id: TraceStepId): TraceStep {
  return {
    id,
    label:      STEP_LABELS[id],
    status:     "skipped",
    startedAt:  null,
    finishedAt: null,
    durationMs: null,
    data:       null,
    error:      null,
  };
}

class RuntimeTraceStoreClass {
  private _trace: RuntimeTrace | null = null;
  private _listeners: Set<() => void> = new Set();

  beginTrace(executionId: string, userMessage: string): void {
    this._trace = {
      executionId,
      userMessage,
      startedAt:  Date.now(),
      finishedAt: null,
      steps: TRACE_STEP_IDS.map(makeStep),
    };
    this._notify();
  }

  recordStep(
    stepId: TraceStepId,
    status: TraceStepStatus,
    data: unknown,
    startedAt?: number,
    error?: string,
  ): void {
    if (!this._trace) return;
    const now = Date.now();
    const started = startedAt ?? now;
    this._trace = {
      ...this._trace,
      steps: this._trace.steps.map((s) =>
        s.id === stepId
          ? {
              ...s,
              status,
              startedAt:  started,
              finishedAt: now,
              durationMs: now - started,
              data,
              error:      error ?? null,
            }
          : s
      ),
    };
    this._notify();
  }

  markSkipped(stepId: TraceStepId): void {
    if (!this._trace) return;
    this._trace = {
      ...this._trace,
      steps: this._trace.steps.map((s) =>
        s.id === stepId ? { ...s, status: "skipped" } : s
      ),
    };
    this._notify();
  }

  finishTrace(): void {
    if (!this._trace) return;
    this._trace = { ...this._trace, finishedAt: Date.now() };
    this._notify();
  }

  get trace(): RuntimeTrace | null {
    return this._trace;
  }

  subscribe(fn: () => void): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  private _notify(): void {
    this._listeners.forEach((l) => l());
  }
}

const _KEY = "__RUNTIME_TRACE_STORE__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new RuntimeTraceStoreClass();
}

export const runtimeTraceStore: RuntimeTraceStoreClass = (
  globalThis as unknown as Record<string, RuntimeTraceStoreClass>
)[_KEY];