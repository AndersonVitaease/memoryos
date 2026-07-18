// PerformanceBenchmarkEngine.ts — Sprint EF-39.6
// Isolated benchmark runner. Supports warm-up, repeatability, variance, histogram.
// Uses performance.now() exclusively.

import { CertificationConfig } from "./CertificationConfig";

export interface BenchmarkResult {
  readonly operation:  string;
  readonly iterations: number;
  readonly avgMs:      number;
  readonly minMs:      number;
  readonly maxMs:      number;
  readonly medianMs:   number;
  readonly p95Ms:      number;
  readonly p99Ms:      number;
  readonly stdDev:     number;
  readonly opsPerSec:  number;
  readonly variance:   number;
  readonly histogram:  readonly number[];  // 10 buckets
}

export interface BenchmarkReport {
  readonly benchmarks: readonly BenchmarkResult[];
  readonly durationMs: number;
}

function pct(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
}

function histogram(values: number[], buckets = 10): number[] {
  if (values.length === 0) return Array(buckets).fill(0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const hist  = Array(buckets).fill(0);
  for (const v of values) {
    const bucket = Math.min(Math.floor(((v - min) / range) * buckets), buckets - 1);
    hist[bucket]++;
  }
  return hist;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export const PerformanceBenchmarkEngine = Object.freeze({
  async benchmark(name: string, fn: () => Promise<void>): Promise<BenchmarkResult> {
    const { benchmarkIterations, benchmarkWarmupRuns } = CertificationConfig;

    // Warm-up phase (not measured)
    for (let i = 0; i < benchmarkWarmupRuns; i++) await fn();

    // Measured phase
    const times: number[] = [];
    for (let i = 0; i < benchmarkIterations; i++) {
      const t = performance.now();
      await fn();
      times.push(performance.now() - t);
    }

    const sorted  = [...times].sort((a, b) => a - b);
    const avg     = times.reduce((a, b) => a + b, 0) / benchmarkIterations;
    const variance = stddev(times) ** 2;

    return Object.freeze({
      operation:  name,
      iterations: benchmarkIterations,
      avgMs:      round(avg),
      minMs:      round(sorted[0]),
      maxMs:      round(sorted[sorted.length - 1]),
      medianMs:   round(pct(sorted, 50)),
      p95Ms:      round(pct(sorted, 95)),
      p99Ms:      round(pct(sorted, 99)),
      stdDev:     round(stddev(times)),
      opsPerSec:  avg > 0 ? Math.round(1000 / avg) : 999_999,
      variance:   round(variance),
      histogram:  Object.freeze(histogram(times)),
    });
  },
});