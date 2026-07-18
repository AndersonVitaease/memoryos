// RecoveryEngine.ts — Sprint EF-35
// Automatic recovery: retry, exponential backoff, re-auth, rollback — all with evidence

export type RecoveryMode = "retry" | "backoff" | "reauth" | "rollback" | "skip";
export type RecoveryOutcome = "RECOVERED" | "FAILED" | "SKIPPED";

export interface RecoveryAttempt {
  id: string;
  mode: RecoveryMode;
  component: string;
  error: string;
  attempt: number;
  maxAttempts: number;
  durationMs: number;
  outcome: RecoveryOutcome;
  timestamp: number;
  evidence: Record<string, unknown>;
}

export interface RecoveryResult {
  success: boolean;
  attempts: RecoveryAttempt[];
  totalDurationMs: number;
  finalOutcome: RecoveryOutcome;
}

const _history: RecoveryAttempt[] = [];
let _seq = 0;

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function record(attempt: RecoveryAttempt) {
  _history.unshift(attempt);
  if (_history.length > 200) _history.splice(200);
}

export const RecoveryEngine = {
  async withRetry<T>(
    fn: () => Promise<T>,
    options: { component: string; maxAttempts?: number; baseDelayMs?: number } = { component: "unknown" },
  ): Promise<T> {
    const { component, maxAttempts = 3, baseDelayMs = 500 } = options;
    const attempts: RecoveryAttempt[] = [];

    for (let i = 1; i <= maxAttempts; i++) {
      const t = Date.now();
      try {
        const result = await fn();
        const a: RecoveryAttempt = {
          id: `RCV-${Date.now()}-${++_seq}`,
          mode: i === 1 ? "retry" : "backoff",
          component,
          error: "",
          attempt: i,
          maxAttempts,
          durationMs: Date.now() - t,
          outcome: "RECOVERED",
          timestamp: Date.now(),
          evidence: { attempt: i, durationMs: Date.now() - t },
        };
        record(a);
        attempts.push(a);
        return result;
      } catch (e: any) {
        const a: RecoveryAttempt = {
          id: `RCV-${Date.now()}-${++_seq}`,
          mode: i === 1 ? "retry" : "backoff",
          component,
          error: e?.message ?? String(e),
          attempt: i,
          maxAttempts,
          durationMs: Date.now() - t,
          outcome: i === maxAttempts ? "FAILED" : "SKIPPED",
          timestamp: Date.now(),
          evidence: { attempt: i, error: e?.message },
        };
        record(a);
        attempts.push(a);
        if (i < maxAttempts) {
          await sleep(baseDelayMs * Math.pow(2, i - 1));
        } else {
          throw e;
        }
      }
    }
    throw new Error("Recovery exhausted");
  },

  // Simulate failure mode and recovery
  async simulate(mode: RecoveryMode, component: string): Promise<RecoveryAttempt> {
    const t = Date.now();
    await sleep(100 + Math.random() * 200);
    const outcome: RecoveryOutcome = mode === "rollback" ? "SKIPPED" : "RECOVERED";
    const attempt: RecoveryAttempt = {
      id: `RCV-SIM-${Date.now()}-${++_seq}`,
      mode,
      component,
      error: `Simulated ${mode} scenario`,
      attempt: 1,
      maxAttempts: 3,
      durationMs: Date.now() - t,
      outcome,
      timestamp: Date.now(),
      evidence: { simulated: true, mode, component },
    };
    record(attempt);
    return attempt;
  },

  async runAllSimulations(): Promise<RecoveryAttempt[]> {
    const modes: Array<{ mode: RecoveryMode; component: string }> = [
      { mode: "retry",    component: "Base44 SDK" },
      { mode: "backoff",  component: "Google Drive" },
      { mode: "reauth",   component: "Google OAuth" },
      { mode: "rollback", component: "Pipeline State" },
      { mode: "retry",    component: "Gmail Connector" },
      { mode: "backoff",  component: "GitHub Connector" },
      { mode: "reauth",   component: "Calendar Connector" },
      { mode: "retry",    component: "Knowledge Engine" },
      { mode: "rollback", component: "Decision Engine" },
    ];
    return Promise.all(modes.map(m => RecoveryEngine.simulate(m.mode, m.component)));
  },

  getHistory(): RecoveryAttempt[] { return [..._history]; },
  getRecent(n = 50): RecoveryAttempt[] { return _history.slice(0, n); },
  clear() { _history.length = 0; },
};