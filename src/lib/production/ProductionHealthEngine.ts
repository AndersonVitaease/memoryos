// ProductionHealthEngine.ts — Sprint EF-35
// Monitors platform health: availability, degradation, uptime, MTTR, MTBF

export type HealthStatus = "HEALTHY" | "WARNING" | "DEGRADED" | "CRITICAL";

export interface HealthEvent {
  timestamp: number;
  status: HealthStatus;
  component: string;
  detail: string;
}

export interface HealthSnapshot {
  status: HealthStatus;
  uptimePct: number;
  availabilityPct: number;
  mttrMs: number;   // mean time to recovery
  mtbfMs: number;   // mean time between failures
  components: ComponentHealth[];
  events: HealthEvent[];
  checkedAt: number;
}

export interface ComponentHealth {
  name: string;
  status: HealthStatus;
  latencyMs: number;
  lastChecked: number;
  consecutiveFailures: number;
}

const _events: HealthEvent[] = [];
const _failures: { start: number; end?: number }[] = [];
let _startTime = Date.now();

function classify(latencyMs: number, consecutiveFails: number): HealthStatus {
  if (consecutiveFails >= 3) return "CRITICAL";
  if (consecutiveFails >= 1) return "DEGRADED";
  if (latencyMs > 5000)      return "WARNING";
  return "HEALTHY";
}

async function checkComponent(name: string, fn: () => Promise<void>): Promise<ComponentHealth> {
  const t = Date.now();
  let latencyMs = 0;
  let consecutiveFailures = 0;
  let status: HealthStatus = "HEALTHY";
  try {
    await fn();
    latencyMs = Date.now() - t;
    status = classify(latencyMs, 0);
  } catch {
    consecutiveFailures = 1;
    latencyMs = Date.now() - t;
    status = "DEGRADED";
    _failures.push({ start: t });
  }
  return { name, status, latencyMs, lastChecked: Date.now(), consecutiveFailures };
}

function calcUptime(): number {
  const now = Date.now();
  const totalMs = now - _startTime;
  const downMs = _failures.reduce((sum, f) => sum + ((f.end ?? now) - f.start), 0);
  return totalMs > 0 ? Math.max(0, Math.round(((totalMs - downMs) / totalMs) * 10000) / 100) : 100;
}

function calcMTTR(): number {
  const recovered = _failures.filter(f => f.end !== undefined);
  if (!recovered.length) return 0;
  return Math.round(recovered.reduce((s, f) => s + (f.end! - f.start), 0) / recovered.length);
}

function calcMTBF(): number {
  if (_failures.length < 2) return 0;
  const gaps: number[] = [];
  for (let i = 1; i < _failures.length; i++) {
    gaps.push(_failures[i].start - (_failures[i - 1].end ?? _failures[i - 1].start));
  }
  return Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
}

export const ProductionHealthEngine = {
  async check(): Promise<HealthSnapshot> {
    const { base44 } = await import("@/api/base44Client");

    const components = await Promise.all([
      checkComponent("Base44 SDK", async () => {
        await base44.entities.ChatSession.list("-created_date", 1);
      }),
      checkComponent("Google OAuth", async () => {
        const { getConnection } = await import("@/lib/google-auth/GoogleAuthSession");
        const c = getConnection("default");
        if (!c || c.state !== "CONNECTED") throw new Error("Not connected");
      }),
      checkComponent("LocalStorage", async () => {
        localStorage.setItem("_health_check", "1");
        localStorage.removeItem("_health_check");
      }),
    ]);

    const criticalCount = components.filter(c => c.status === "CRITICAL").length;
    const degradedCount = components.filter(c => c.status === "DEGRADED").length;
    const warningCount  = components.filter(c => c.status === "WARNING").length;

    let status: HealthStatus = "HEALTHY";
    if (criticalCount > 0)      status = "CRITICAL";
    else if (degradedCount > 0) status = "DEGRADED";
    else if (warningCount > 0)  status = "WARNING";

    const event: HealthEvent = {
      timestamp: Date.now(),
      status,
      component: "platform",
      detail: `${components.length} components checked`,
    };
    _events.push(event);
    if (_events.length > 200) _events.splice(0, _events.length - 200);

    return {
      status,
      uptimePct: calcUptime(),
      availabilityPct: calcUptime(),
      mttrMs: calcMTTR(),
      mtbfMs: calcMTBF(),
      components,
      events: [..._events].reverse().slice(0, 50),
      checkedAt: Date.now(),
    };
  },

  markRecovery() {
    const last = _failures.findLast(f => !f.end);
    if (last) last.end = Date.now();
  },

  reset() {
    _events.length = 0;
    _failures.length = 0;
    _startTime = Date.now();
  },
};