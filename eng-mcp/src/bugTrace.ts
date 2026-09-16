import * as z from "zod/v4";
import { spawnGitNexus, gitnexusCommand, RESPONSE_TOKENS, type GitNexusCalls, type Json, type FileReadFn } from "./codeImpact.ts";

// engineering.bug.trace - composed READ-ONLY bug investigation supertool (GitNexus-backed).
// Given an error message, symptom text or a suspect symbol, one call performs a short
// structural investigation: exactly one engineering.code.search pass localizes the
// symptom text in the authorized repository, GitNexus context resolves an EXPLICIT
// suspect target (never auto-picked from search hits), a conditional GitNexus trace
// explains the path from the top known caller into the suspect symbol, and at most
// 2 ENG-MCP file.read anchors validate the critical points against real source.
// Evidence levels are honest: PROVEN is intentionally never emitted (a read-only
// structural pass cannot prove a root cause); SUPPORTED requires a graph-resolved
// path; PLAUSIBLE means partial evidence; UNKNOWN means nothing usable was found.
// No retry, no auto-fix, no patch, zero mutation. Reuses the exact GitNexus stdio
// integration proven in codeImpact (spawnGitNexus): no new client, no loops.
// Caps: 1 code.search, 3 GitNexus calls, 2 file.read.

export const bugTraceInputSchema = z.object({
  query: z.string().min(2).max(512),
  file: z.string().max(512).optional(),
  target: z.string().max(256).optional()
}).strict();

export type BugTraceInput = z.infer<typeof bugTraceInputSchema>;
export type SearchFn = (args: { query: string; mode?: "literal" | "regex" | "filename"; maxResults?: number }) => Promise<unknown>;
export type BugTraceDeps = { gitnexus?: GitNexusCalls | null; fileRead?: FileReadFn; codeSearch?: SearchFn };

// File-local one-line helpers (kept tiny on purpose; not a shared abstraction).
const str = (value: unknown, max = 200): string | undefined => (typeof value === "string" && value.length > 0 ? value.slice(0, max) : undefined);
const num = (value: unknown): number | undefined => (typeof value === "number" ? value : undefined);
const compact = (text: string) => text.replace(/\s+/g, " ").trim();

const firstArray = (container: Json | null, keys: string[]): Json[] | undefined => {
  if (!container) return undefined;
  for (const key of keys) if (Array.isArray(container[key])) return container[key] as Json[];
  return undefined;
};

export async function runBugTrace(toolName: string, rawInput: unknown, deps: BugTraceDeps = {}) {
  const input = bugTraceInputSchema.parse(rawInput);
  const session = deps.gitnexus !== undefined ? (deps.gitnexus ? { client: deps.gitnexus, close: () => {} } : null) : await spawnGitNexus();
  const gaps: string[] = [];
  const evidence: string[] = [];
  let gitnexusCalls = 0;
  let searchCalls = 0;
  let fileReads = 0;
  try {
    if (!session) {
      gaps.push(`GITNEXUS_UNAVAILABLE: "${gitnexusCommand()} mcp" could not be spawned/initialized; no investigation possible (fail-closed, zero mutation)`);
      return { status: "UNKNOWN", symptom: compact(input.query).slice(0, 300), candidates: [], evidence: { level: "UNKNOWN", basis: [] }, sourceEvidence: [], gaps, meta: { tool: toolName, gitnexusCalls: 0, searchCalls: 0, fileReads: 0 } };
    }
    const candidates: Array<Json> = [];
    // 1) engineering.code.search - exactly one textual pass on the symptom text (cap: 1).
    let hits: Array<{ file: string; line?: number; preview?: string }> = [];
    if (deps.codeSearch) {
      try {
        searchCalls++;
        const search = await deps.codeSearch({ query: input.query.slice(0, 256), mode: "literal", maxResults: 5 }) as Json;
        const matches = Array.isArray(search?.matches) ? (search.matches as Json[]) : [];
        hits = matches.slice(0, 5).map((match) => {
          const file = str(match.path ?? match.file, 200) ?? "?";
          const line = num(match.line);
          const preview = str(match.preview, 160);
          return { file, ...(line ? { line } : {}), ...(preview ? { preview } : {}) };
        });
        for (const hit of hits) candidates.push({ file: hit.file, ...(hit.line ? { line: hit.line } : {}), ...(hit.preview ? { preview: hit.preview } : {}), source: "code.search" });
        if (hits.length > 0) evidence.push(`SEARCH_MATCH: symptom text found at ${hits.map((hit) => `${hit.file}${hit.line ? `:${hit.line}` : ""}`).join(", ")}`);
        else gaps.push("SEARCH_NO_HITS: symptom text not found verbatim in the authorized repository (literal mode)");
      } catch (error) { gaps.push(`SEARCH_FAILED: ${compact((error as Error).message)}`); }
    } else gaps.push("SEARCH_UNAVAILABLE: no code.search dependency provided; textual localization skipped");
    // 2) GitNexus context - resolve an EXPLICIT suspect target only; search hits are
    // never auto-promoted to symbols (no invention, no auto-selection).
    let resolved: { name: string; file?: string; kind?: string; line?: number } | null = null;
    let context: Json | null = null;
    if (input.target) {
      const contextArgs: Json = { name: input.target, maxTokens: RESPONSE_TOKENS };
      if (input.file) contextArgs.file_path = input.file;
      try {
        gitnexusCalls++;
        context = await session.client.context(contextArgs);
        const contextCandidates = Array.isArray(context.candidates) ? (context.candidates as Json[]) : [];
        if (context.status === "ambiguous" || contextCandidates.length > 0) {
          for (const candidate of contextCandidates.slice(0, 5)) gaps.push(`CANDIDATE: ${str(candidate.name, 80) ?? "?"} (${str(candidate.filePath ?? candidate.file, 120) ?? "?"})`);
          gaps.push("AMBIGUOUS_TARGET: re-call with file or kind; no symbol was auto-selected");
          return { status: "AMBIGUOUS", symptom: compact(input.query).slice(0, 300), candidates, evidence: { level: hits.length > 0 ? "PLAUSIBLE" : "UNKNOWN", basis: [...evidence] }, sourceEvidence: [], gaps, meta: { tool: toolName, gitnexusCalls, searchCalls, fileReads: 0 } };
        }
        if (context.status === "not_found" || context.found === false) gaps.push("TARGET_NOT_RESOLVED: GitNexus could not resolve the explicit target; continuing with textual evidence only");
        else {
          const symbol = ((context.symbol ?? context) ?? {}) as Json;
          const file = str(symbol.filePath ?? symbol.file, 200) ?? input.file;
          const line = num(symbol.line);
          const kind = str(symbol.kind ?? symbol.kindName, 40);
          resolved = { name: str(symbol.name, 160) ?? input.target, ...(file ? { file } : {}), ...(kind ? { kind } : {}), ...(line ? { line } : {}) };
          candidates.unshift({ name: resolved.name, ...(resolved.file ? { file: resolved.file } : {}), source: "gitnexus.context" });
          evidence.push(`CONTEXT_RESOLVED: suspect symbol ${resolved.name}${resolved.file ? ` (${resolved.file})` : ""}`);
        }
      } catch (error) { gaps.push(`CONTEXT_FAILED: ${compact((error as Error).message)}`); }
    }
    // 3) GitNexus trace - conditional: at most once; path from the top known caller into the suspect symbol.
    let probablePath: { from: string; to: string; hops: Array<{ from?: string; to?: string; file?: string; line?: number }>; level: "SUPPORTED" } | null = null;
    if (resolved) {
      const symbolShaped = ((context?.symbol ?? {}) as Json);
      const incoming = firstArray(context, ["incoming", "callers"]) ?? firstArray(symbolShaped, ["incoming", "callers"]);
      const topCaller = (incoming ?? []).slice(0, 6)
        .map((entry) => ({ name: str(entry.name, 120) ?? "?", file: str(entry.filePath ?? entry.file, 160), line: num(entry.line) }))
        .find((entry) => entry.name !== "?" && entry.name !== resolved!.name);
      if (topCaller && gitnexusCalls < 3) {
        try {
          gitnexusCalls++;
          const trace = await session.client.trace({ from: topCaller.name, to: resolved.name, ...(topCaller.file ? { from_file: topCaller.file } : {}), ...(resolved.file ? { to_file: resolved.file } : {}), maxDepth: 6, maxTokens: RESPONSE_TOKENS });
          if (trace.status === "no_path" || trace.found === false) gaps.push(`TRACE_NO_PATH: ${topCaller.name} -> ${resolved.name} (dynamic dispatch boundary possible); path stays unproven`);
          else {
            probablePath = { from: topCaller.name, to: resolved.name, level: "SUPPORTED", hops: (Array.isArray(trace.hops) ? trace.hops as Json[] : []).slice(0, 5).map((hop) => {
              const file = str(hop.file ?? hop.filePath, 160);
              const line = num(hop.line);
              const from = str(hop.from ?? hop.source, 80);
              const to = str(hop.to ?? hop.target, 80);
              return { ...(from ? { from } : {}), ...(to ? { to } : {}), ...(file ? { file } : {}), ...(line ? { line } : {}) };
            }) };
            evidence.push(`TRACE_PATH: ${topCaller.name} -> ${resolved.name} resolved by the graph`);
          }
        } catch (error) { gaps.push(`TRACE_FAILED: ${compact((error as Error).message)}`); }
      }
    }
    // 4) ENG-MCP file.read - at most 2 anchors: top symptom hit + suspect definition.
    const anchors: Array<{ path: string; startLine?: number; expect: string; finding: string }> = [];
    if (hits[0]) anchors.push({ path: hits[0].file, startLine: Math.max(1, (hits[0].line ?? 1) - 10), expect: compact(input.query).slice(0, 80), finding: `symptom text near ${hits[0].file}` });
    if (resolved?.file && resolved.file !== anchors[0]?.path) anchors.push({ path: resolved.file, startLine: Math.max(1, (resolved.line ?? 1) - 20), expect: resolved.name, finding: `suspect symbol definition ${resolved.name}` });
    const sourceEvidence: Array<{ file: string; line?: number; finding: string; evidence: "MATCHED" | "NOT_MATCHED" | "UNAVAILABLE" }> = [];
    if (deps.fileRead) for (const anchor of anchors.slice(0, 2)) {
      try {
        const page = await deps.fileRead({ path: anchor.path, startLine: anchor.startLine, maxLines: 60 }) as Json;
        fileReads++;
        sourceEvidence.push({ file: anchor.path, ...(anchor.startLine ? { line: anchor.startLine } : {}), finding: anchor.finding, evidence: compact(JSON.stringify(page)).includes(anchor.expect) ? "MATCHED" : "NOT_MATCHED" });
      } catch {
        fileReads++;
        sourceEvidence.push({ file: anchor.path, ...(anchor.startLine ? { line: anchor.startLine } : {}), finding: anchor.finding, evidence: "UNAVAILABLE" });
      }
    }
    // 5) Evidence level - honest; PROVEN is intentionally never emitted by a read-only pass.
    let level: "PROVEN" | "SUPPORTED" | "PLAUSIBLE" | "UNKNOWN" = "UNKNOWN";
    if (probablePath && sourceEvidence.some((entry) => entry.evidence === "MATCHED")) level = "SUPPORTED";
    else if (probablePath || hits.length > 0) level = "PLAUSIBLE";
    if (level === "UNKNOWN") gaps.push("INSUFFICIENT_EVIDENCE: no verbatim symptom match and no resolvable suspect symbol; no probable cause is claimed");
    const failed = gaps.some((gap) => gap.startsWith("SEARCH_FAILED") || gap.startsWith("SEARCH_UNAVAILABLE") || gap.startsWith("CONTEXT_FAILED") || gap.startsWith("TARGET_NOT_RESOLVED") || gap.startsWith("TRACE_FAILED")) || sourceEvidence.some((entry) => entry.evidence === "UNAVAILABLE");
    const status = level === "UNKNOWN" ? "UNKNOWN" : failed ? "PARTIAL" : "OK";
    return {
      status,
      symptom: compact(input.query).slice(0, 300),
      candidates: candidates.slice(0, 6),
      ...(probablePath ? { probablePath } : {}),
      evidence: { level, basis: evidence.slice(0, 6) },
      sourceEvidence,
      gaps: gaps.slice(0, 6),
      meta: { tool: toolName, gitnexusCalls, searchCalls, fileReads, rootCauseNote: "read-only structural pass: never claims root cause; highest honest level is SUPPORTED", ...(failed && status !== "UNKNOWN" ? { partial: true } : {}) }
    };
  } finally { session?.close(); }
}
