// IMAGE-EDIT-JEV-01 — operator-path latency bench for engineering.image.edit.
//
// Measures the ROUTED layer (src/imageEditFast.ts) with an injected mock executor:
//   - route detection + preset expansion + planner merge overhead per call
//   - 1-step preset vs 2-step BATCH preset in ONE tool call
//   - Jev route: real network ONLY if the openrouter credential is present (it
//     exists in the production container; on this host it legitimately is not,
//     so the run reports SKIP instead of inventing a number).
//
// Instrumentation lives in the layer itself: every response carries
// `route` + `timing.stages` (ms) and the audit JSONL is metadata-only.
// Frontier baseline (documented diagnosis of this mission, not re-measured here):
// the frontier LLM composing each tool call costs ~5-20s per command; the relay
// and the local Photopea executor are fast (ms). Run: node --import tsx scripts/image-edit-bench.ts
import { runImageEditRouted, type ImageEditFastDeps } from "../src/imageEditFast.ts";

const ITER = 20;
const auditFile = "/tmp/image-edit-bench-audit.jsonl";

const instantExecutor = async (input: { action: string }) => ({
  status: "ok" as const,
  action: input.action,
  note: "bench-mock-executor"
});

const deps: ImageEditFastDeps = { executor: instantExecutor, auditFile };

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function bench(name: string, input: Record<string, unknown>): Promise<{ p50: number; p95: number }> {
  const times: number[] = [];
  for (let i = 0; i < ITER; i += 1) {
    const start = performance.now();
    const result = await runImageEditRouted(input as any, deps);
    if (result.status !== "ok") {
      throw new Error(`${name} unexpectedly failed: ${result.code ?? "unknown"}`);
    }
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const p50 = percentile(times, 50);
  const p95 = percentile(times, 95);
  console.log(`${name.padEnd(34)} p50=${p50.toFixed(2).padStart(7)}ms  p95=${p95.toFixed(2).padStart(7)}ms  n=${ITER}`);
  return { p50, p95 };
}

console.log(`== routed layer overhead (mock executor, ${ITER} iters) ==`);
const direct = await bench("direct route (action=inspect)", { action: "inspect" });
const preset1 = await bench("preset route 1 step (export-png)", { preset: "export-png", params: { path: "/tmp/out.png" } });
const preset2 = await bench("preset route 2 steps BATCH (open-export-png)", { preset: "open-export-png", params: { source: "D:/a.psd", dest: "/tmp/a.png" } });
const presetGray = await bench("preset route 0-LLM (grayscale)", { preset: "grayscale" });

// ---- Jev route: real provider call only when a credential exists (fail-open skip) ----
console.log("\n== jev route (glm-5.3-flash via openrouter) ==");
try {
  const composeStart = performance.now();
  const result = await runImageEditRouted(
    { command: "deixe a imagem em preto e branco" },
    { executor: instantExecutor, auditFile: "/tmp/image-edit-bench-jev-audit.jsonl" }
  );
  const total = performance.now() - composeStart;
  if (result.status === "ok" && result.route === "jev") {
    console.log(`jev compose+execute OK      total=${total.toFixed(0)}ms  provider=${result.jev.latencyMs}ms  tokens=${result.jev.promptTokens}/${result.jev.completionTokens}`);
  } else {
    console.log(`jev route answered status=${result.status} code=${result.code} — SKIP real benchmark (${result.message ?? ""})`);
  }
} catch (error) {
  console.log(`jev route SKIP real benchmark: ${error instanceof Error ? error.message : String(error)}`);
}

console.log("\n== frontier baseline (documented, not re-measured) ==");
console.log("frontier LLM composing each tool call: ~5000-20000ms per command (mission diagnosis).");
console.log("routed layer p95 vs frontier p50 lower bound (5000ms):");
const worst = Math.max(direct.p95, preset1.p95, preset2.p95, presetGray.p95);
console.log(`  worst routed p95 = ${worst.toFixed(2)}ms  -> composition cost reduction >= ${(5000 - worst).toFixed(0)}ms per command`);