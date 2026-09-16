import test from "node:test";
import assert from "node:assert/strict";
import { runCodeImpact, type GitNexusCalls, type Json } from "../src/codeImpact.ts";

type Counts = { context: number; impact: number; trace: number };
type CallFn = (args: Json) => Promise<Json>;

function fakeGitNexus(overrides: { context?: Json; impact?: Json; trace?: Json } = {}, failing: string[] = []) {
  const counts: Counts = { context: 0, impact: 0, trace: 0 };
  const names: string[] = [];
  const make = (name: "context" | "impact" | "trace", fallback: Json): CallFn => async () => {
    counts[name]++; names.push(name);
    if (failing.includes(name)) throw new Error(`FAKE_${name.toUpperCase()}_ERROR`);
    return overrides[name] ?? fallback;
  };
  const calls: GitNexusCalls = {
    context: make("context", { name: "alpha", uid: "Function:src/a.ts:alpha", kind: "Function", filePath: "src/a.ts" }),
    impact: make("impact", { risk: "HIGH", epistemic: "exact", byDepth: [{ depth: 1, symbols: [{ name: "beta", filePath: "src/b.ts", line: 10 }] }], affected_processes: [{ id: "p1", label: "Redeploy", step: 2 }] }),
    trace: make("trace", { status: "ok", hops: [{ from: "beta", to: "alpha", file: "src/b.ts", line: 10 }] })
  };
  return { calls, counts, names };
}

function fakeFileRead(counter: { value: number }) {
  return async (args: { path: string; startLine?: number; maxLines?: number }) => {
    counter.value++;
    return { path: args.path, startLine: args.startLine, maxLines: args.maxLines, lines: [`// touches beta and alpha at ${args.path}:${args.startLine ?? 1}`] };
  };
}

test("normal flow: context -> impact (+conditional trace) -> compact result with source anchors", async () => {
  const git = fakeGitNexus();
  const reads = { value: 0 };
  const result: any = await runCodeImpact("engineering.code.impact", { target: "alpha" }, { gitnexus: git.calls, fileRead: fakeFileRead(reads) });
  assert.equal(result.status, "OK");
  assert.equal(result.target.name, "alpha");
  assert.equal(result.impact.risk, "HIGH");
  assert.equal(result.impact.epistemic, "exact");
  assert.ok(result.impact.affectedSymbols.length <= 6);
  assert.ok(result.paths[0].hops.length >= 1);
  assert.equal(result.sourceEvidence[0].evidence, "MATCHED");
  assert.equal(git.counts.context, 1);
  assert.equal(git.counts.impact, 1);
  assert.equal(git.counts.trace, 1);
  assert.ok(reads.value <= 2);
  assert.ok(result.meta.gitnexusCalls <= 3);
});

test("ambiguous target: returns AMBIGUOUS and stops before impact/trace/file.read", async () => {
  const git = fakeGitNexus({ context: { status: "ambiguous", candidates: [{ name: "alpha", filePath: "src/a.ts" }, { name: "alpha", filePath: "src/other.ts" }] } });
  const reads = { value: 0 };
  const result: any = await runCodeImpact("engineering.code.impact", { target: "alpha" }, { gitnexus: git.calls, fileRead: fakeFileRead(reads) });
  assert.equal(result.status, "AMBIGUOUS");
  assert.equal(git.counts.impact, 0);
  assert.equal(git.counts.trace, 0);
  assert.equal(reads.value, 0);
  assert.ok(result.gaps.some((gap: string) => gap.startsWith("AMBIGUOUS_TARGET")));
});

test("UNKNOWN risk preserved honestly (PARTIAL, never promoted to OK/safe)", async () => {
  const git = fakeGitNexus({ impact: { risk: "UNKNOWN", riskNote: "No callers resolved; absence of edges is not evidence the symbol is unused.", epistemic: "lower-bound", byDepth: [] } });
  const result: any = await runCodeImpact("engineering.code.impact", { target: "alpha" }, { gitnexus: git.calls, fileRead: fakeFileRead({ value: 0 }) });
  assert.equal(result.status, "PARTIAL");
  assert.equal(result.impact.risk, "UNKNOWN");
  assert.ok(result.impact.riskNote.includes("absence of edges"));
  assert.equal(git.counts.trace, 0); // trace never fires on UNKNOWN risk
  assert.ok(result.gaps.some((gap: string) => gap.includes("not evidence")));
});

test("conditional trace: no_path preserved as honest gap, not an error", async () => {
  const git = fakeGitNexus({ trace: { status: "no_path" } });
  const result: any = await runCodeImpact("engineering.code.impact", { target: "alpha" }, { gitnexus: git.calls, fileRead: fakeFileRead({ value: 0 }) });
  assert.equal(result.status, "OK");
  assert.equal(result.paths, undefined);
  assert.ok(result.gaps.some((gap: string) => gap.startsWith("TRACE_NO_PATH")));
  assert.equal(git.counts.trace, 1);
});

test("call limits: <=3 GitNexus calls, <=2 file reads, no fan-out on large graphs", async () => {
  const many = (depth: number) => Array.from({ length: 20 }, (_, index) => ({ name: `sym${depth}_${index}`, filePath: `src/f${depth}_${index}.ts` }));
  const git = fakeGitNexus({ impact: { risk: "HIGH", epistemic: "exact", byDepth: [1, 2, 3].map((depth) => ({ depth, symbols: many(depth) })), affected_processes: [] } });
  const reads = { value: 0 };
  const result: any = await runCodeImpact("engineering.code.impact", { target: "alpha", max_depth: 3 }, { gitnexus: git.calls, fileRead: fakeFileRead(reads) });
  assert.equal(git.counts.context + git.counts.impact + git.counts.trace, 3);
  assert.ok(reads.value <= 2);
  assert.ok(result.impact.affectedSymbols.length <= 6);
  assert.equal(result.meta.gitnexusCalls, 3);
  assert.equal(result.meta.fileReads, 2);
});

test("read-only: only context/impact/trace/fileRead invoked; no mutating capability", async () => {
  const git = fakeGitNexus();
  const result: any = await runCodeImpact("engineering.code.impact", { target: "alpha" }, { gitnexus: git.calls, fileRead: fakeFileRead({ value: 0 }) });
  assert.deepEqual(git.names.filter((name) => !["context", "impact", "trace"].includes(name)), []);
  assert.ok(["OK", "PARTIAL", "UNKNOWN", "AMBIGUOUS", "NOT_FOUND"].includes(result.status));
});

test("fail-closed: GitNexus unavailable -> UNKNOWN with zero GitNexus calls and zero reads", async () => {
  const reads = { value: 0 };
  const result: any = await runCodeImpact("engineering.code.impact", { target: "alpha" }, { gitnexus: null, fileRead: fakeFileRead(reads) });
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.meta.gitnexusCalls, 0);
  assert.equal(reads.value, 0);
  assert.ok(result.gaps[0].startsWith("GITNEXUS_UNAVAILABLE"));
});
