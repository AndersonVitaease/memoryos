/**
 * PipelinePerformanceTests.ts
 * Performance benchmarks: avg, min, max, stddev per pipeline.
 *
 * Sprint: EV-2
 */

import { describe }         from "@/testing/TestScenarioBuilder";
import { AssertionEngine }  from "@/testing/AssertionEngine";
import { KnowledgeQueryFacade }          from "@/lib/knowledge-query/KnowledgeQueryFacade";
import { ConnectorKnowledgePipeline }    from "@/lib/connector-runtime/integration/ConnectorKnowledgePipeline";
import { EngineeringKnowledgePipeline }  from "@/lib/engineering-runtime/integration/EngineeringKnowledgePipeline";
import { PlanningKnowledgePipeline }     from "@/lib/planning-engine/integration/PlanningKnowledgePipeline";
import { DecisionKnowledgePipeline }     from "@/lib/decision-engine/integration/DecisionKnowledgePipeline";

export interface PerfStats {
  avg: number; min: number; max: number; stddev: number; p95: number; samples: number;
}

export function measure(fn: () => void, runs = 20): PerfStats {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t = Date.now();
    fn();
    times.push(Date.now() - t);
  }
  times.sort((a, b) => a - b);
  const avg    = times.reduce((s, x) => s + x, 0) / times.length;
  const min    = times[0];
  const max    = times[times.length - 1];
  const p95    = times[Math.floor(times.length * 0.95)] ?? max;
  const variance = times.reduce((s, x) => s + (x - avg) ** 2, 0) / times.length;
  const stddev = Math.sqrt(variance);
  return { avg: Math.round(avg), min, max, stddev: Math.round(stddev), p95, samples: runs };
}

// Results accessible after run for the dashboard
export const _perfResults: Record<string, PerfStats> = {};

export function registerPipelinePerformanceTests(): void {
  describe("PipelinePerformance [INT]", "PERFORMANCE" as never)

    .test("PERF-01: Knowledge Query avg < 50ms", () => {
      KnowledgeQueryFacade.invalidateCache();
      const stats = measure(() => KnowledgeQueryFacade.queryAll("perf test intent"), 20);
      _perfResults["KnowledgeQuery"] = stats;
      AssertionEngine.assertTrue(stats.avg < 50, `avg=${stats.avg}ms should be < 50ms`);
    })

    .test("PERF-02: Connector Pipeline avg < 20ms", () => {
      const stats = measure(() => ConnectorKnowledgePipeline.run({
        requestId: "PERF-CN", connector: "gmail", operation: "READ",
        intent: "perf test", provider: "google", parameters: {},
        priority: "LOW", domain: "GMAIL", project: "EVP", sprint: "EV-2", tags: [],
      }), 20);
      _perfResults["ConnectorPipeline"] = stats;
      AssertionEngine.assertTrue(stats.avg < 20, `avg=${stats.avg}ms should be < 20ms`);
    })

    .test("PERF-03: Engineering Pipeline avg < 20ms", () => {
      const stats = measure(() => EngineeringKnowledgePipeline.run({
        taskId: "PERF-ENG", task: "IMPLEMENT", intent: "perf test",
        module: "perf", component: "PerfTest", files: [], sprint: "EV-2",
        branch: "perf", priority: "LOW", tags: [],
      }), 20);
      _perfResults["EngineeringPipeline"] = stats;
      AssertionEngine.assertTrue(stats.avg < 20, `avg=${stats.avg}ms should be < 20ms`);
    })

    .test("PERF-04: Planning Pipeline avg < 20ms", () => {
      PlanningKnowledgePipeline.invalidateCache();
      let i = 0;
      const stats = measure(() => PlanningKnowledgePipeline.run({
        goalId: `PERF-PL-${i++}`, intent: "perf test", priority: "LOW",
        domain: "GENERAL", components: [], project: "EVP", sprint: "EV-2", tags: [],
      }), 20);
      _perfResults["PlanningPipeline"] = stats;
      AssertionEngine.assertTrue(stats.avg < 20, `avg=${stats.avg}ms should be < 20ms`);
    })

    .test("PERF-05: Decision Pipeline avg < 20ms", () => {
      const stats = measure(() => DecisionKnowledgePipeline.run({
        decisionId: "PERF-DC", goalId: "G-PERF", intent: "perf test",
        decisionType: "APPROVE", priority: "LOW", domain: "GENERAL",
        components: [], project: "EVP", sprint: "EV-2", tags: [],
      }), 20);
      _perfResults["DecisionPipeline"] = stats;
      AssertionEngine.assertTrue(stats.avg < 20, `avg=${stats.avg}ms should be < 20ms`);
    })

    .test("PERF-06: Knowledge Query p95 < 100ms", () => {
      const { p95 } = _perfResults["KnowledgeQuery"] ?? { p95: 0 };
      AssertionEngine.assertTrue(p95 < 100, `p95=${p95}ms should be < 100ms`);
    })

    .test("PERF-07: No single pipeline run exceeds 200ms", () => {
      const pipelines = ["KnowledgeQuery", "ConnectorPipeline", "EngineeringPipeline", "PlanningPipeline", "DecisionPipeline"];
      for (const name of pipelines) {
        const stats = _perfResults[name];
        if (stats) {
          AssertionEngine.assertTrue(stats.max < 200, `${name} max=${stats.max}ms should be < 200ms`);
        }
      }
    })

    .register();
}