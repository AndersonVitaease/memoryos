import test from "node:test";
import assert from "node:assert/strict";
import { runCodeUnderstand, type GitNexusCalls, type Json } from "../src/codeUnderstand.ts";

type Counts = { context: number; trace: number };
type CallFn = (args: Json) => Promise<Json>;

function fakeGitNexus(overrides: { context?: Json; trace?: Json } = {}, failing: string[] = []) {
  const counts: Counts = { context: 0, trace: 0 };
  const names: string[] = [];
  const make = (name: "context" | "trace", fallback: Json): CallFn => async () => {
    counts[name]++; names.push(name);
    if (failing.includes(name)) throw new Error(`FAKE_${name.toUpperCase()}_ERROR`);
    return overrides[name] ?? fallback;
  };
  const calls: GitNexusCalls = {
    context: make("context", { symbol: { name: "alpha", uid: "Function:src/a.ts:alpha", kind: "Function", filePath: "src/a.ts", line: 10, description: "Guards the release flow." }, incoming: [{ name: "beta", filePath: "src/b.ts", type: "calls", line: 22 }, { name: "gamma", filePath: "src/c.ts", type: "calls", line: 5 }], outgoing: [{ name: "delta", filePath: "src/d.ts", type: "calls", line: 11 }] }),
    impact: async () => { throw new Error("FAKE_IMPACT_MUST_NOT_BE_CALLED"); },
    trace: make("trace", { status: "ok", hops: [{ from: "beta", to: "alpha", file: "src/b.ts", line: 22 }, { from: "eta", to: "beta", file: "src/e.ts", line: 3 }] })
  };
  return { calls, counts, names };
}

function fakeFileRead(counter: { value: number }) {
  return async (args: { path: string; startLine?: number; maxLines?: number }) => {
    counter.value++;
    return { path: args.path, startLine: args.startLine, maxLines: args.maxLines, lines: ["// Guards the release flow against unsafe redeploy.", "function alpha() {}"] };
  };
}

test("normal flow: context -> conditional trace -> compact structural view with source anchors", async () => {
  const git = fakeGitNexus();
  const reads = { value: 0 };
  const result: any = await runCodeUnderstand("engineering.code.understand", { target: "alpha" }, { gitnexus: git.calls, fileRead: fakeFileRead(reads) });
  assert.equal(result.status, "OK");
  assert.equal(result.definition.name, "alpha");
  assert.equal(result.definition.file, "src/a.ts");
  assert.equal(result.purpose, "Guards the release flow.");
  assert.equal(result.callers.length, 2);
  assert.equal(result.dependencies.length, 1);
  assert.ok(result.relatedSymbols.includes("eta"));
  assert.equal(result.sourceEvidence[0].evidence, "MATCHED");
  assert.equal(git.counts.context, 1);
  assert.equal(git.counts.trace, 1);
  assert.ok(reads.value <= 2);
  assert.ok(result.meta.graphNote.includes("does not imply"));
});

test("ambiguous target: AMBIGUOUS with candidates, stops before trace and file.read", async () => {
  const git = fakeGitNexus({ context: { status: "ambiguous", candidates: [{ name: "alpha", filePath: "src/a.ts" }, { name: "alpha", filePath: "src/other.ts" }] } });
  const reads = { value: 0 };
  const result: any = await runCodeUnderstand("engineering.code.understand", { target: "alpha" }, { gitnexus: git.calls, fileRead: fakeFileRead(reads) });
  assert.equal(result.status, "AMBIGUOUS");
  assert.equal(git.counts.trace, 0);
  assert.equal(reads.value, 0);
  assert.ok(result.gaps.some((gap: string) => gap.startsWith("AMBIGUOUS_TARGET")));
});

test("not found: explicit NOT_FOUND, nothing invented", async () => {
  const git = fakeGitNexus({ context: { status: "not_found" } });
  const result: any = await runCodeUnderstand("engineering.code.understand", { target: "ghost" }, { gitnexus: git.calls, fileRead: fakeFileRead({ value: 0 }) });
  assert.equal(result.status, "NOT_FOUND");
  assert.ok(result.gaps.some((gap: string) => gap.startsWith("CONTEXT_NOT_FOUND")));
  assert.equal(git.counts.trace, 0);
});

test("fail-closed: GitNexus unavailable -> UNKNOWN, zero GitNexus calls and zero reads", async () => {
  const reads = { value: 0 };
  const result: any = await runCodeUnderstand("engineering.code.understand", { target: "alpha" }, { gitnexus: null, fileRead: fakeFileRead(reads) });
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.meta.gitnexusCalls, 0);
  assert.equal(reads.value, 0);
  assert.ok(result.gaps[0].startsWith("GITNEXUS_UNAVAILABLE"));
});

test("call limits: <=3 GitNexus calls, <=2 file reads, callers and dependencies capped at 6", async () => {
  const many = Array.from({ length: 20 }, (_, index) => ({ name: `caller${index}`, filePath: `src/c${index}.ts`, type: "calls", line: index + 1 }));
  const git = fakeGitNexus({ context: { symbol: { name: "alpha", kind: "Function", filePath: "src/a.ts", line: 10 }, incoming: many, outgoing: many } });
  const reads = { value: 0 };
  const result: any = await runCodeUnderstand("engineering.code.understand", { target: "alpha" }, { gitnexus: git.calls, fileRead: fakeFileRead(reads) });
  assert.equal(result.meta.gitnexusCalls, 2); // context + one conditional trace
  assert.equal(result.meta.fileReads, 2);
  assert.ok(result.callers.length <= 6);
  assert.ok(result.dependencies.length <= 6);
  assert.equal(reads.value, 2);
});

test("read-only: only context/trace invoked on GitNexus; no mutating capability", async () => {
  const git = fakeGitNexus();
  const result: any = await runCodeUnderstand("engineering.code.understand", { target: "alpha" }, { gitnexus: git.calls, fileRead: fakeFileRead({ value: 0 }) });
  assert.deepEqual(git.names.filter((name) => !["context", "trace"].includes(name)), []);
  assert.ok(["OK", "PARTIAL", "UNKNOWN", "AMBIGUOUS", "NOT_FOUND"].includes(result.status));
});
