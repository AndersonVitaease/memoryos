// AlertEngine.ts — Sprint EF-35
// Automatic alert generation with severity, evidence, and suggested actions

export type AlertSeverity = "INFO" | "WARNING" | "ERROR" | "CRITICAL";
export type AlertCategory = "Pipeline" | "Connector" | "Memory" | "CPU" | "Latency" | "Retry" | "Audit" | "Security" | "Timeout" | "Loop";

export interface ProductionAlert {
  id: string;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  detail: string;
  timestamp: number;
  evidence: Record<string, unknown>;
  correlationId: string;
  executionId: string;
  suggestedAction: string;
  resolved: boolean;
  resolvedAt?: number;
}

const _alerts: ProductionAlert[] = [];
let _seq = 0;

function genId() { return `ALT-${Date.now()}-${++_seq}`; }
function genCorr() { return `CORR-${Math.random().toString(36).slice(2, 10).toUpperCase()}`; }
function genExec() { return `EXEC-${Math.random().toString(36).slice(2, 10).toUpperCase()}`; }

export const AlertEngine = {
  raise(
    severity: AlertSeverity,
    category: AlertCategory,
    title: string,
    detail: string,
    evidence: Record<string, unknown> = {},
    suggestedAction = "Investigate and remediate.",
  ): ProductionAlert {
    const alert: ProductionAlert = {
      id: genId(),
      severity,
      category,
      title,
      detail,
      timestamp: Date.now(),
      evidence,
      correlationId: genCorr(),
      executionId: genExec(),
      suggestedAction,
      resolved: false,
    };
    _alerts.unshift(alert);
    if (_alerts.length > 500) _alerts.splice(500);
    return alert;
  },

  resolve(id: string) {
    const a = _alerts.find(x => x.id === id);
    if (a) { a.resolved = true; a.resolvedAt = Date.now(); }
  },

  // Evaluate metrics and auto-raise alerts
  evaluate(metrics: import("./OperationalMetricsEngine").MetricsSnapshot) {
    const raised: ProductionAlert[] = [];

    if (metrics.failureRate > 20) {
      raised.push(AlertEngine.raise("ERROR", "Pipeline", "High Pipeline Failure Rate",
        `Failure rate is ${metrics.failureRate}% (threshold: 20%)`,
        { failureRate: metrics.failureRate, totalRequests: metrics.requestsPerMin },
        "Check pipeline stages and connector availability."));
    }
    if (metrics.pipelineLatency.p95 > 10000) {
      raised.push(AlertEngine.raise("WARNING", "Latency", "Pipeline P95 Latency Exceeded",
        `P95 latency is ${metrics.pipelineLatency.p95}ms (threshold: 10s)`,
        { p95: metrics.pipelineLatency.p95 },
        "Investigate slow stages. Check connector timeouts."));
    }
    if (metrics.retryRate > 30) {
      raised.push(AlertEngine.raise("WARNING", "Retry", "Excessive Retry Rate",
        `Retry rate is ${metrics.retryRate}% (threshold: 30%)`,
        { retryRate: metrics.retryRate },
        "Check for transient connector failures or token expiration."));
    }
    if (metrics.heapMB > 400) {
      raised.push(AlertEngine.raise("WARNING", "Memory", "High Memory Usage",
        `Heap is ${metrics.heapMB}MB (threshold: 400MB)`,
        { heapMB: metrics.heapMB, memoryMB: metrics.memoryMB },
        "Check for memory leaks. Consider reloading the session."));
    }
    if (metrics.cpu > 85) {
      raised.push(AlertEngine.raise("WARNING", "CPU", "High CPU Usage",
        `CPU estimated at ${metrics.cpu}% (threshold: 85%)`,
        { cpu: metrics.cpu },
        "Reduce concurrent operations or defer background tasks."));
    }
    if (metrics.connectorLatency.p95 > 8000) {
      raised.push(AlertEngine.raise("WARNING", "Connector", "Connector High Latency",
        `Connector P95 is ${metrics.connectorLatency.p95}ms`,
        { connectorP95: metrics.connectorLatency.p95 },
        "Check connector health and network conditions."));
    }

    return raised;
  },

  // Raise connector offline alert
  connectorOffline(name: string, error: string): ProductionAlert {
    return AlertEngine.raise("CRITICAL", "Connector", `Connector Offline: ${name}`,
      error,
      { connector: name, error },
      `Reconnect ${name}. Check OAuth token validity.`);
  },

  // Raise timeout alert
  timeout(component: string, durationMs: number): ProductionAlert {
    return AlertEngine.raise("ERROR", "Timeout", `Timeout: ${component}`,
      `${component} timed out after ${durationMs}ms`,
      { component, durationMs },
      "Check network conditions and increase timeout if necessary.");
  },

  getAll(): ProductionAlert[] { return [..._alerts]; },
  getUnresolved(): ProductionAlert[] { return _alerts.filter(a => !a.resolved); },
  getBySeverity(s: AlertSeverity): ProductionAlert[] { return _alerts.filter(a => a.severity === s); },
  getByCategory(c: AlertCategory): ProductionAlert[] { return _alerts.filter(a => a.category === c); },
  clear() { _alerts.length = 0; },
};