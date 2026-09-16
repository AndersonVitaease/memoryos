import test from "node:test";
import assert from "node:assert/strict";
import { runBugTrace, type GitNexusCalls, type Json } from "../src/bugTrace.ts";

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
    context: make("context", { symbol: { name: "suspect", kind: "Function", filePath: "src/suspect.ts", line: 40 }, incoming: [{ name: "handler", filePath: "src/http.ts", type: "calls", line: 88 }], outgoing: [] }),
    impact: async () => { throw new Error("FAKE_IMPACT_MUST_NOT_BE_CALLED"); },
    trace: make("trace", { status: "ok", hops: [{ from: "handler", to: "suspect", file: "src/http.ts", line: 88 }] })
  };
  return { calls, counts, names };
}

function fakeSearch(matches: Json[] = []) {
  const calls: Array<Json> = [];
  const fn = async (args: Json) => { calls.push(args); return { matches, truncated: false, mode: "literal" }; };
  return { fn, calls };
}

function fakeFileRead(counter: { value: number }) {
  return async (args: { path: string; startLine?: number; maxLines?: number }) => {
    counter.value++;
    return { path: args.path, startLine: args.startLine, maxLines: args.maxLines, lines: ["  const payload = decode(raw); // RELEASE_RUNNER_FAILED deploy rejected", "  throw new Error(\"RELEASE_RUNNER_FAILED\");", "  function suspect() { return payload; }"] };
  };
}

const hit = { path: "src/vpsChangeSafe.ts", line: 57, preview: "throw new Error(\"RELEASE_RUNNER_FAILED\");" };

test("textual error finds a candidate: one search pass, honest PLAUSIBLE level", async () => {
  const git = fakeGitNexus();
  const search = fakeSearch([hit]);
  const reads = { value: 0 };
  const result: any = await runBugTrace("engineering.bug.trace", { query: "RELEASE_RUNNER_FAILED deploy rejected" }, { gitnexus: git.calls, fileRead: fakeFileRead(reads), codeSearch: search.fn });
  assert.equal(result.status, "OK");
  assert.equal(result.candidates[0].file, "src/vpsChangeSafe.ts");
  assert.equal(result.candidates[0].source, "code.search");
  assert.equal(result.evidence.level, "PLAUSIBLE");
  assert.equal(result.meta.searchCalls, 1);
  assert.equal(result.meta.gitnexusCalls, 0);
  assert.equal(result.meta.fileReads, 1);
  assert.ok(result.evidence.basis.some((basis: string) => basis.startsWith("SEARCH_MATCH")));
});

test("explicit target: context resolves, trace explains path, SUPPORTED evidence", async () => {
  const git = fakeGitNexus();
  const search = fakeSearch([hit]);
  const result: any = await runBugTrace("engineering.bug.trace", { query: "RELEASE_RUNNER_FAILED deploy rejected", target: "suspect" }, { gitnexus: git.calls, fileRead: fakeFileRead({ value: 0 }), codeSearch: search.fn });
  assert.equal(result.status, "OK");
  assert.equal(git.counts.context, 1);
  assert.equal(git.counts.trace, 1);
  assert.equal(result.probablePath.from, "handler");
  assert.equal(result.probablePath.to, "suspect");
  assert.equal(result.evidence.level, "SUPPORTED");
  assert.equal(result.meta.gitnexusCalls, 2);
  assert.equal(result.meta.fileReads, 2);
});

test("trace no_path stays an honest gap: path unproven, level never promoted", async () => {
  const git = fakeGitNexus({ trace: { status: "no_path" } });
  const search = fakeSearch([hit]);
  const result: any = await runBugTrace("engineering.bug.trace", { query: "RELEASE_RUNNER_FAILED deploy rejected", target: "suspect" }, { gitnexus: git.calls, fileRead: fakeFileRead({ value: 0 }), codeSearch: search.fn });
  assert.ok(result.gaps.some((gap: string) => gap.startsWith("TRACE_NO_PATH")));
  assert.equal(result.probablePath, undefined);
  assert.equal(result.evidence.level, "PLAUSIBLE");
});

test("insufficient evidence: nothing found -> UNKNOWN, no cause claimed", async () => {
  const git = fakeGitNexus();
  const search = fakeSearch([]);
  const result: any = await runBugTrace("engineering.bug.trace", { query: "totally unknown symptom text" }, { gitnexus: git.calls, fileRead: fakeFileRead({ value: 0 }), codeSearch: search.fn });
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.evidence.level, "UNKNOWN");
  assert.equal(result.meta.gitnexusCalls, 0);
  assert.equal(result.meta.fileReads, 0);
  assert.ok(result.gaps.some((gap: string) => gap.startsWith("INSUFFICIENT_EVIDENCE")));
});

test("fail-closed: GitNexus unavailable -> UNKNOWN with zero calls of any kind", async () => {
  const search = fakeSearch([hit]);
  const reads = { value: 0 };
  const result: any = await runBugTrace("engineering.bug.trace", { query: "RELEASE_RUNNER_FAILED deploy rejected" }, { gitnexus: null, fileRead: fakeFileRead(reads), codeSearch: search.fn });
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.meta.gitnexusCalls, 0);
  assert.equal(result.meta.searchCalls, 0);
  assert.equal(reads.value, 0);
  assert.ok(result.gaps[0].startsWith("GITNEXUS_UNAVAILABLE"));
});

test("call limits: <=1 search, <=3 GitNexus calls, <=2 file reads, candidates capped", async () => {
  const many = Array.from({ length: 20 }, (_, index) => ({ name: `caller${index}`, filePath: `src/c${index}.ts`, type: "calls", line: index + 1 }));
  const git = fakeGitNexus({ context: { symbol: { name: "suspect", kind: "Function", filePath: "src/suspect.ts", line: 40 }, incoming: many, outgoing: [] } });
  const search = fakeSearch([hit, { path: "src/other.ts", line: 9, preview: "other occurrence" }, { path: "src/third.ts", line: 3, preview: "third occurrence" }]);
  const reads = { value: 0 };
  const result: any = await runBugTrace("engineering.bug.trace", { query: "RELEASE_RUNNER_FAILED deploy rejected", target: "suspect" }, { gitnexus: git.calls, fileRead: fakeFileRead(reads), codeSearch: search.fn });
  assert.equal(result.meta.searchCalls, 1);
  assert.equal(search.calls.length, 1);
  assert.ok(result.meta.gitnexusCalls <= 3);
  assert.ok(result.meta.fileReads <= 2);
  assert.ok(result.candidates.length <= 6);
  assert.equal(reads.value, 2);
});

test("read-only: only context/trace on GitNexus, at most one search, no mutation", async () => {
  const git = fakeGitNexus();
  const search = fakeSearch([hit]);
  const result: any = await runBugTrace("engineering.bug.trace", { query: "RELEASE_RUNNER_FAILED deploy rejected", target: "suspect" }, { gitnexus: git.calls, fileRead: fakeFileRead({ value: 0 }), codeSearch: search.fn });
  assert.deepEqual(git.names.filter((name) => !["context", "trace"].includes(name)), []);
  assert.ok(search.calls.length <= 1);
  assert.ok(["OK", "PARTIAL", "UNKNOWN", "AMBIGUOUS", "NOT_FOUND"].includes(result.status));
});
