import * as z from "zod/v4";
import { spawnGitNexus, gitnexusCommand, RESPONSE_TOKENS, type GitNexusCalls, type Json, type FileReadFn } from "./codeImpact.ts";

// engineering.code.understand - composed READ-ONLY supertool (GitNexus-backed).
// One call returns a compact structural view of a symbol before it is modified:
// GitNexus context (identity + categorized callers/dependencies; ambiguity stops
// the flow) -> GitNexus trace (at most once, only when a top caller path is worth
// explaining; no_path preserved honestly) -> at most 2 ENG-MCP file.read anchors
// (definition + top caller) for real source evidence. `purpose` is reported only
// when the graph (symbol description) or the source window (comment block directly
// above the declaration) supports it - never invented. Absence of graph relations
// is never evidence of absence of dependencies (see meta.graphNote). Reuses the
// exact GitNexus stdio integration proven in codeImpact (spawnGitNexus): no new
// client, no provisioning, no loops, no fan-out, zero mutation.
// Caps: 3 GitNexus calls, 2 file.read.

export const codeUnderstandInputSchema = z.object({
  target: z.string().min(2).max(256),
  file: z.string().max(512).optional(),
  kind: z.enum(["Function", "Class", "Method", "Interface", "Constructor"]).optional()
}).strict();

export type CodeUnderstandInput = z.infer<typeof codeUnderstandInputSchema>;
export type CodeUnderstandDeps = { gitnexus?: GitNexusCalls | null; fileRead?: FileReadFn };

// File-local one-line helpers (kept tiny on purpose; not a shared abstraction).
const str = (value: unknown, max = 200): string | undefined => (typeof value === "string" && value.length > 0 ? value.slice(0, max) : undefined);
const num = (value: unknown): number | undefined => (typeof value === "number" ? value : undefined);
const compact = (text: string) => text.replace(/\s+/g, " ").trim();

const firstArray = (container: Json | null, keys: string[]): Json[] | undefined => {
  if (!container) return undefined;
  for (const key of keys) if (Array.isArray(container[key])) return container[key] as Json[];
  return undefined;
};

const mapRefs = (entries: Json[]) => entries.slice(0, 6).map((entry) => {
  const file = str(entry.filePath ?? entry.file, 160);
  const line = num(entry.line);
  const relation = str(entry.type ?? entry.reason ?? entry.relation, 40);
  return { name: str(entry.name, 120) ?? "?", ...(file ? { file } : {}), ...(line ? { line } : {}), ...(relation ? { relation } : {}) };
});

// Purpose is only extracted from a real comment block directly above the
// declaration inside the file.read window; anything else stays undefined.
const commentAbove = (page: Json | undefined, expect: string): string | undefined => {
  const lines = Array.isArray(page?.lines) ? (page!.lines as unknown[]).filter((line): line is string => typeof line === "string") : [];
  const index = lines.findIndex((line) => line.includes(expect));
  if (index < 0) return undefined;
  const comment: string[] = [];
  for (let i = index - 1; i >= 0 && comment.length < 4; i--) {
    const trimmed = lines[i].trim();
    if (!trimmed) break;
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) comment.unshift(trimmed.replace(/^\/\*+|\*+\/$|^\*|^\/\//g, "").trim());
    else break;
  }
  const text = compact(comment.join(" "));
  return text.length > 0 ? text.slice(0, 300) : undefined;
};

export async function runCodeUnderstand(toolName: string, rawInput: unknown, deps: CodeUnderstandDeps = {}) {
  const input = codeUnderstandInputSchema.parse(rawInput);
  const session = deps.gitnexus !== undefined ? (deps.gitnexus ? { client: deps.gitnexus, close: () => {} } : null) : await spawnGitNexus();
  const gaps: string[] = [];
  let gitnexusCalls = 0;
  let fileReads = 0;
  try {
    if (!session) {
      gaps.push(`GITNEXUS_UNAVAILABLE: "${gitnexusCommand()} mcp" could not be spawned/initialized; understanding not possible (fail-closed, zero mutation)`);
      return { status: "UNKNOWN", target: { name: input.target }, definition: null, callers: [], dependencies: [], relatedSymbols: [], sourceEvidence: [], gaps, meta: { tool: toolName, gitnexusCalls: 0, fileReads: 0 } };
    }
    // 1) GitNexus context - identity + categorized references. Never auto-pick a symbol.
    const contextArgs: Json = { name: input.target, maxTokens: RESPONSE_TOKENS };
    if (input.file) contextArgs.file_path = input.file;
    if (input.kind) contextArgs.kind = input.kind;
    let context: Json | null = null;
    try { gitnexusCalls++; context = await session.client.context(contextArgs); }
    catch (error) { gaps.push(`CONTEXT_FAILED: ${compact((error as Error).message)}`); }
    const candidates = Array.isArray(context?.candidates) ? (context!.candidates as Json[]) : [];
    if (context && (context.status === "ambiguous" || candidates.length > 0)) {
      for (const candidate of candidates.slice(0, 5)) gaps.push(`CANDIDATE: ${str(candidate.name, 80) ?? "?"} (${str(candidate.filePath ?? candidate.file, 120) ?? "?"})`);
      gaps.push("AMBIGUOUS_TARGET: re-call with file or kind; no symbol was auto-selected");
      return { status: "AMBIGUOUS", target: { name: input.target }, definition: null, callers: [], dependencies: [], relatedSymbols: [], sourceEvidence: [], gaps, meta: { tool: toolName, gitnexusCalls, fileReads: 0 } };
    }
    if (context && (context.status === "not_found" || context.found === false))
      return { status: "NOT_FOUND", target: { name: input.target }, definition: null, callers: [], dependencies: [], relatedSymbols: [], sourceEvidence: [], gaps: [...gaps, "CONTEXT_NOT_FOUND: GitNexus could not resolve this target"], meta: { tool: toolName, gitnexusCalls, fileReads: 0 } };
    const symbol = ((context?.symbol ?? context) ?? {}) as Json;
    const resolvedFile = str(symbol.filePath ?? symbol.file, 200) ?? input.file;
    const resolvedName = str(symbol.name, 160) ?? input.target;
    const resolvedKind = str(symbol.kind ?? symbol.kindName, 40) ?? input.kind;
    const resolvedLine = num(symbol.line);
    const definition = {
      name: resolvedName,
      ...(resolvedKind ? { kind: resolvedKind } : {}),
      ...(resolvedFile ? { file: resolvedFile } : {}),
      ...(resolvedLine ? { line: resolvedLine } : {})
    };
    // 2) Categorized references - defensive shape: alternates are honored, a missing
    // shape is reported, and an empty array is never reported as "no dependencies".
    const incoming = firstArray(context, ["incoming", "callers", "references_in"]) ?? firstArray(symbol, ["incoming", "callers"]);
    const outgoing = firstArray(context, ["outgoing", "callees", "references_out"]) ?? firstArray(symbol, ["outgoing", "callees"]);
    if (incoming === undefined && outgoing === undefined) gaps.push("CONTEXT_SHAPE_UNRECOGNIZED: no incoming/outgoing arrays in the GitNexus context payload; treated as unavailable, NOT as zero relations");
    const callers = mapRefs(incoming ?? []);
    const dependencies = mapRefs(outgoing ?? []);
    // 3) GitNexus trace - conditional: at most once, only to explain how the top caller reaches the symbol.
    const topCaller = callers.find((entry) => entry.name !== "?" && entry.name !== resolvedName);
    const relatedSymbols: string[] = [];
    if (topCaller && gitnexusCalls < 3) {
      try {
        gitnexusCalls++;
        const trace = await session.client.trace({ from: topCaller.name, to: resolvedName, ...(topCaller.file ? { from_file: topCaller.file } : {}), ...(resolvedFile ? { to_file: resolvedFile } : {}), maxDepth: 6, maxTokens: RESPONSE_TOKENS });
        if (trace.status === "no_path" || trace.found === false) gaps.push(`TRACE_NO_PATH: ${topCaller.name} -> ${resolvedName} (dynamic dispatch boundary possible); preserved honestly, not an error`);
        else for (const hop of (Array.isArray(trace.hops) ? trace.hops as Json[] : []).slice(0, 6)) {
          const from = str(hop.from ?? hop.source, 80);
          const to = str(hop.to ?? hop.target, 80);
          for (const name of [from, to]) if (name && name !== resolvedName && !relatedSymbols.includes(name) && relatedSymbols.length < 6) relatedSymbols.push(name);
        }
      } catch (error) { gaps.push(`TRACE_FAILED: ${compact((error as Error).message)}`); }
    }
    // 4) ENG-MCP file.read - at most 2 anchors: the definition and the top caller.
    const anchors: Array<{ path: string; startLine?: number; expect: string; finding: string }> = [];
    if (resolvedFile) anchors.push({ path: resolvedFile, startLine: Math.max(1, (resolvedLine ?? 1) - 20), expect: resolvedName, finding: `definition of ${resolvedName}` });
    if (topCaller?.file && topCaller.file !== resolvedFile) anchors.push({ path: topCaller.file, startLine: Math.max(1, (topCaller.line ?? 1) - 20), expect: topCaller.name, finding: `top caller ${topCaller.name}` });
    const sourceEvidence: Array<{ file: string; line?: number; finding: string; evidence: "MATCHED" | "NOT_MATCHED" | "UNAVAILABLE" }> = [];
    const pages: Array<Json | undefined> = [];
    if (deps.fileRead) for (const anchor of anchors.slice(0, 2)) {
      try {
        const page = await deps.fileRead({ path: anchor.path, startLine: anchor.startLine, maxLines: 60 }) as Json;
        fileReads++;
        pages.push(page);
        sourceEvidence.push({ file: anchor.path, ...(anchor.startLine ? { line: anchor.startLine } : {}), finding: anchor.finding, evidence: compact(JSON.stringify(page)).includes(anchor.expect) ? "MATCHED" : "NOT_MATCHED" });
      } catch {
        fileReads++;
        pages.push(undefined);
        sourceEvidence.push({ file: anchor.path, ...(anchor.startLine ? { line: anchor.startLine } : {}), finding: anchor.finding, evidence: "UNAVAILABLE" });
      }
    }
    const purpose = str(symbol.description ?? symbol.summary ?? symbol.purpose, 400) ?? commentAbove(pages[0], resolvedName);
    if (!purpose) gaps.push("PURPOSE_UNSUPPORTED: no graph description and no source comment above the declaration; no purpose is claimed");
    // 5) Synthesis - honest status; absence of relations is never a completeness claim.
    const partial = context === null || incoming === undefined || sourceEvidence.some((entry) => entry.evidence === "UNAVAILABLE");
    if (partial) gaps.push("PARTIAL: some evidence was missing, unresolved or unvalidatable");
    return {
      status: partial ? "PARTIAL" : "OK",
      target: { name: resolvedName, ...(resolvedFile ? { file: resolvedFile } : {}), ...(resolvedKind ? { kind: resolvedKind } : {}) },
      definition,
      ...(purpose ? { purpose } : {}),
      callers,
      dependencies,
      relatedSymbols,
      sourceEvidence,
      gaps: gaps.slice(0, 6),
      meta: { tool: toolName, gitnexusCalls, fileReads, graphNote: "absence of graph relations does not imply absence of dependencies", ...(partial ? { partial: true } : {}) }
    };
  } finally { session?.close(); }
}
