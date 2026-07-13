/**
 * ResponseBindingTracer.ts — Phase 5.6.1
 * 2026-07-13
 *
 * Instruments the complete response flow without modifying any engine.
 * Records every stage: Router → Gateway → Pipeline → ChatPage render.
 *
 * Architecture rules:
 *   - Read-only observer — never modifies response data
 *   - Never calls connectors directly
 *   - Never replaces or overwrites any answer
 */

let _seq = 0;
function makeId(p: string) { return `${p}_${Date.now().toString(36)}_${(++_seq).toString(36)}`; }

// ── Types ─────────────────────────────────────────────────────────────────────

export type BindingStatus = "BOUND" | "OVERWRITTEN" | "FALLBACK_ALLOWED" | "FALLBACK_VIOLATION" | "PENDING";

export interface StageTrace {
  stage:       string;
  timestamp:   number;
  durationMs:  number;
  input:       string;       // message or answer excerpt
  output:      string;       // answer excerpt
  executionId: string | null;
  metadata:    Record<string, unknown>;
}

export interface BindingViolation {
  traceId:    string;
  stage:      string;
  reason:     string;
  pipelineAnswer:  string;
  renderedAnswer:  string;
}

export interface ResponseTrace {
  id:               string;
  userMessage:      string;
  sessionId:        string;
  startedAt:        number;
  completedAt:      number | null;
  durationMs:       number;

  // Stage data
  routerDecision:   string | null;
  intentDetected:   string | null;
  pipelineAnswer:   string | null;
  gatewayAnswer:    string | null;
  renderedAnswer:   string | null;

  // Binding
  bindingStatus:    BindingStatus;
  fallbackUsed:     boolean;
  fallbackReason:   string | null;
  overwriteDetected: boolean;
  violation:        BindingViolation | null;

  // Stages
  stages:           StageTrace[];
  executionId:      string | null;
  stagesExecuted:   number;
  confidence:       number;
  evidence:         string[];
}

// ── Allowed fallback conditions ───────────────────────────────────────────────

export type FallbackReason =
  | "GENERAL_CONVERSATION"
  | "PIPELINE_NOT_AVAILABLE"
  | "PIPELINE_ERROR"
  | "EMPTY_PIPELINE_ANSWER";

function excerpt(s: string | null | undefined, n = 120): string {
  if (!s) return "(empty)";
  return s.length <= n ? s : s.slice(0, n) + "…";
}

// ── Tracer ────────────────────────────────────────────────────────────────────

export class ResponseBindingTracer {
  private _traces: ResponseTrace[] = [];
  private _active  = new Map<string, ResponseTrace>();

  // ── Step 1: message enters router ─────────────────────────────────────────

  beginTrace(userMessage: string, sessionId: string): string {
    const id = makeId("trace");
    const trace: ResponseTrace = {
      id, userMessage, sessionId,
      startedAt: Date.now(), completedAt: null, durationMs: 0,
      routerDecision: null, intentDetected: null,
      pipelineAnswer: null, gatewayAnswer: null, renderedAnswer: null,
      bindingStatus: "PENDING", fallbackUsed: false, fallbackReason: null,
      overwriteDetected: false, violation: null,
      stages: [], executionId: null, stagesExecuted: 0, confidence: 0, evidence: [],
    };
    this._active.set(id, trace);
    return id;
  }

  // ── Step 2: router decision recorded ─────────────────────────────────────

  recordRouterDecision(traceId: string, decision: string, intent: string, durationMs: number) {
    const t = this._active.get(traceId); if (!t) return;
    t.routerDecision = decision;
    t.intentDetected = intent;
    t.stages.push({
      stage: "PrimaryConversationRouter", timestamp: Date.now(), durationMs,
      input: excerpt(t.userMessage), output: `decision=${decision}`,
      executionId: null, metadata: { intent, decision },
    });
  }

  // ── Step 3: gateway / pipeline answer received ────────────────────────────

  recordPipelineAnswer(
    traceId: string,
    answer: string,
    executionId: string | null,
    stagesExecuted: string[],
    confidence: number,
    evidence: string[],
    durationMs: number,
  ) {
    const t = this._active.get(traceId); if (!t) return;
    t.pipelineAnswer  = answer;
    t.gatewayAnswer   = answer;
    t.executionId     = executionId;
    t.stagesExecuted  = stagesExecuted.length;
    t.confidence      = confidence;
    t.evidence        = evidence;
    t.stages.push({
      stage: "ConversationCognitiveGateway → LiveCognitivePipeline",
      timestamp: Date.now(), durationMs,
      input: excerpt(t.userMessage),
      output: excerpt(answer),
      executionId,
      metadata: { stages: stagesExecuted.length, confidence, evidenceCount: evidence.length },
    });
  }

  // ── Step 4: fallback used (allowed conditions) ────────────────────────────

  recordFallback(traceId: string, reason: FallbackReason, fallbackAnswer: string, durationMs: number) {
    const t = this._active.get(traceId); if (!t) return;
    t.fallbackUsed   = true;
    t.fallbackReason = reason;
    t.renderedAnswer = fallbackAnswer;
    t.stages.push({
      stage: "MemoryReasoningPlanner (fallback)",
      timestamp: Date.now(), durationMs,
      input: excerpt(t.userMessage),
      output: excerpt(fallbackAnswer),
      executionId: null,
      metadata: { fallbackReason: reason },
    });
  }

  // ── Step 5: ChatPage sets the rendered answer ─────────────────────────────

  recordRendered(traceId: string, renderedAnswer: string) {
    const t = this._active.get(traceId); if (!t) return;
    t.renderedAnswer = renderedAnswer;
    t.completedAt    = Date.now();
    t.durationMs     = t.completedAt - t.startedAt;

    // ── Binding verification ───────────────────────────────────────────────
    if (t.fallbackUsed) {
      // Fallback allowed — check reason is legitimate
      const allowedReasons: FallbackReason[] = [
        "GENERAL_CONVERSATION", "PIPELINE_NOT_AVAILABLE",
        "PIPELINE_ERROR", "EMPTY_PIPELINE_ANSWER",
      ];
      t.bindingStatus = allowedReasons.includes(t.fallbackReason as FallbackReason)
        ? "FALLBACK_ALLOWED"
        : "FALLBACK_VIOLATION";
      if (t.bindingStatus === "FALLBACK_VIOLATION") {
        t.violation = {
          traceId: t.id, stage: "ChatPage",
          reason: `Fallback used without documented reason: ${t.fallbackReason}`,
          pipelineAnswer:  t.pipelineAnswer ?? "",
          renderedAnswer:  t.renderedAnswer ?? "",
        };
      }
    } else if (t.pipelineAnswer) {
      // Cognitive path — verify rendered === pipeline answer (by excerpt comparison)
      const pEx = t.pipelineAnswer.slice(0, 60);
      const rEx = renderedAnswer.slice(0, 60);
      if (pEx === rEx) {
        t.bindingStatus    = "BOUND";
        t.overwriteDetected = false;
      } else {
        t.bindingStatus    = "OVERWRITTEN";
        t.overwriteDetected = true;
        t.violation = {
          traceId: t.id, stage: "ChatPage",
          reason: "Rendered answer does not match pipeline answer",
          pipelineAnswer: excerpt(t.pipelineAnswer),
          renderedAnswer: excerpt(renderedAnswer),
        };
      }
    } else {
      // No pipeline answer, no fallback recorded — general conversation
      t.bindingStatus = "FALLBACK_ALLOWED";
      t.fallbackReason = t.fallbackReason ?? "GENERAL_CONVERSATION";
    }

    t.stages.push({
      stage: "ChatPage render",
      timestamp: Date.now(), durationMs: 0,
      input: excerpt(t.pipelineAnswer ?? t.fallbackReason ?? ""),
      output: excerpt(renderedAnswer),
      executionId: t.executionId,
      metadata: { bindingStatus: t.bindingStatus, overwrite: t.overwriteDetected },
    });

    this._traces.push({ ...t });
    this._active.delete(traceId);
    if (this._traces.length > 200) this._traces.splice(0, this._traces.length - 200);
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  getTraces()                          { return [...this._traces].reverse(); }
  getViolations(): BindingViolation[]  { return this._traces.filter(t => t.violation).map(t => t.violation!); }
  getBound()                           { return this._traces.filter(t => t.bindingStatus === "BOUND").length; }
  getFallbackAllowed()                 { return this._traces.filter(t => t.bindingStatus === "FALLBACK_ALLOWED").length; }
  getOverwritten()                     { return this._traces.filter(t => t.overwriteDetected).length; }
}

// App-wide singleton
export const responseTracer = new ResponseBindingTracer();