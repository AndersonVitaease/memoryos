// OperationalMetricsEngine.ts — Sprint EF-35
// Collects continuous operational metrics: latency, throughput, errors, resources

export interface LatencyBucket {
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  min: number;
  max: number;
}

export interface MetricsSnapshot {
  timestamp: number;
  pipelineLatency: LatencyBucket;
  connectorLatency: LatencyBucket;
  requestsPerMin: number;
  throughputPerMin: number;
  successRate: number;
  failureRate: number;
  retryRate: number;
  cpu: number;         // estimated 0-100
  memoryMB: number;
  heapMB: number;
  networkKBs: number;
  storageKB: number;
  totalRequests: number;
  totalFailures: number;
  totalRetries: number;
}

interface Sample {
  ts: number;
  durationMs: number;
  type: "pipeline" | "connector";
  success: boolean;
  retry: boolean;
}

const _samples: Sample[] = [];
const _windowMs = 60_000; // 1 minute window

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[Math.min(idx, sorted.length - 1)];
}

function bucket(values: number[]): LatencyBucket {
  if (!values.length) return { p50: 0, p95: 0, p99: 0, avg: 0, min: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    avg: Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

function estimateCPU(): number {
  // Estimate via script execution time vs requestAnimationFrame delta
  const start = performance.now();
  let n = 0;
  while (performance.now() - start < 5) n++;
  // Rough heuristic: higher count = lower cpu pressure
  return Math.max(0, Math.min(100, Math.round(100 - (n / 5000) * 100)));
}

function estimateMemory(): { memMB: number; heapMB: number } {
  const mem = (performance as any).memory;
  if (mem) {
    return {
      memMB:  Math.round(mem.totalJSHeapSize / 1024 / 1024),
      heapMB: Math.round(mem.usedJSHeapSize  / 1024 / 1024),
    };
  }
  return { memMB: 0, heapMB: 0 };
}

export const OperationalMetricsEngine = {
  record(type: "pipeline" | "connector", durationMs: number, success: boolean, retry = false) {
    _samples.push({ ts: Date.now(), durationMs, type, success, retry });
    // trim to last 5 minutes
    const cutoff = Date.now() - 5 * _windowMs;
    while (_samples.length && _samples[0].ts < cutoff) _samples.shift();
  },

  snapshot(): MetricsSnapshot {
    const now = Date.now();
    const window = _samples.filter(s => now - s.ts <= _windowMs);
    const pipelineSamples  = window.filter(s => s.type === "pipeline").map(s => s.durationMs);
    const connectorSamples = window.filter(s => s.type === "connector").map(s => s.durationMs);

    const total     = window.length;
    const failures  = window.filter(s => !s.success).length;
    const retries   = window.filter(s => s.retry).length;

    const { memMB, heapMB } = estimateMemory();

    return {
      timestamp: now,
      pipelineLatency:  bucket(pipelineSamples),
      connectorLatency: bucket(connectorSamples),
      requestsPerMin:   total,
      throughputPerMin: window.filter(s => s.success).length,
      successRate:      total > 0 ? Math.round(((total - failures) / total) * 100) : 100,
      failureRate:      total > 0 ? Math.round((failures / total) * 100) : 0,
      retryRate:        total > 0 ? Math.round((retries / total) * 100) : 0,
      cpu:              estimateCPU(),
      memoryMB:         memMB,
      heapMB,
      networkKBs:       0,
      storageKB:        Math.round(JSON.stringify(localStorage).length / 1024),
      totalRequests:    _samples.length,
      totalFailures:    _samples.filter(s => !s.success).length,
      totalRetries:     _samples.filter(s => s.retry).length,
    };
  },

  clear() { _samples.length = 0; },
};