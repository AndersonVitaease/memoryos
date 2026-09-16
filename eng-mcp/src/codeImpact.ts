import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import * as z from "zod/v4";

// engineering.code.impact - composed READ-ONLY supertool (GitNexus-backed).
// Composition: GitNexus context (resolve target; ambiguity stops the flow)
//   -> GitNexus impact (blast radius core) -> GitNexus trace (at most once, only
//   when a relevant path needs explaining; no_path preserved honestly)
//   -> at most 2 ENG-MCP file.read anchors on critical points -> compact synthesis.
// No mutation, no retry, no loops, no new infrastructure. GitNexus boundary: a
// short-lived `gitnexus mcp` stdio child speaking the official MCP JSON-RPC wire
// protocol (the same mechanism Goose itself uses), configured via
// ENG_MCP_GITNEXUS_COMMAND, fail-closed when unavailable.

export const codeImpactInputSchema = z.object({
  target: z.string().min(2).max(256),
  target_uid: z.string().optional(),
  file: z.string().max(512).optional(),
  kind: z.enum(["Function", "Class", "Method", "Interface", "Constructor"]).optional(),
  direction: z.enum(["upstream", "downstream"]).default("upstream"),
  max_depth: z.number().int().min(1).max(5).default(2)
}).strict();

export type CodeImpactInput = z.infer<typeof codeImpactInputSchema>;
export type Json = Record<string, unknown>;
export type GitNexusCalls = { context(args: Json): Promise<Json>; impact(args: Json): Promise<Json>; trace(args: Json): Promise<Json> };
export type FileReadFn = (args: { path: string; startLine?: number; maxLines?: number }) => Promise<unknown>;
export type CodeImpactDeps = { gitnexus?: GitNexusCalls | null; fileRead?: FileReadFn };

// Read lazily: boot-time provisioning (src/main.ts) sets ENG_MCP_GITNEXUS_COMMAND
// after modules are imported; a module-load-time const would freeze the fallback.
export const gitnexusCommand = () => process.env.ENG_MCP_GITNEXUS_COMMAND ?? "gitnexus";
const CALL_TIMEOUT_MS = 30_000;
// GitNexus caps its formatted MCP response (GITNEXUS_MCP_DEFAULT_MAX_TOKENS);
// large graphs truncate the JSON mid-object. Ask for a bounded-but-generous budget.
export const RESPONSE_TOKENS = 16000;

// Minimal MCP-over-stdio client: initialize handshake + tools/call on one
// short-lived child process killed by close(). Not a daemon, not a proxy.
// Shared by engineering.code.impact, engineering.code.understand and
// engineering.bug.trace - do not duplicate this client.
export async function spawnGitNexus(): Promise<{ client: GitNexusCalls; close: () => void } | null> {
  try {
    // cwd = the served repository root: GitNexus resolves its registered index by
    // process cwd; the server's own cwd (/app image layer) has no .gitnexus.
    const child = spawn(gitnexusCommand(), ["mcp"], { stdio: ["pipe", "pipe", "pipe"], cwd: process.env.ENG_MCP_REPOSITORY_ROOT || undefined, env: { ...process.env, GITNEXUS_MCP_DEFAULT_MAX_TOKENS: String(RESPONSE_TOKENS) } });
    const pending = new Map<number, { resolve: (value: Json) => void; reject: (error: Error) => void }>();
    let nextId = 0;
    createInterface({ input: child.stdout }).on("line", (line) => {
      let message: Json;
      try { message = JSON.parse(line) as Json; } catch { return; }
      const waiter = pending.get(Number(message.id));
      if (!waiter) return;
      pending.delete(Number(message.id));
      const error = message.error as Json | undefined;
      if (error) waiter.reject(new Error(String(error.message ?? "GITNEXUS_TOOL_ERROR")));
      else waiter.resolve((message.result ?? {}) as Json);
    });
    child.stderr.resume();
    // spawn ENOENT emits 'error' (not 'exit'): fail fast and honestly instead
    // of leaving the initialize request pending until the internal timeout.
    child.on("error", () => { for (const waiter of pending.values()) waiter.reject(new Error("GITNEXUS_SPAWN_FAILED")); pending.clear(); });
    child.once("exit", () => { for (const waiter of pending.values()) waiter.reject(new Error("GITNEXUS_EXITED")); pending.clear(); });
    const request = (method: string, params: Json) => new Promise<Json>((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`GITNEXUS_${method.toUpperCase()}_TIMEOUT`)); }, CALL_TIMEOUT_MS);
      pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); }
      });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
    await request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "memoryos-eng-mcp", version: "0.1.0" } });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    const callTool = (tool: string) => async (args: Json): Promise<Json> => {
      const result = await request("tools/call", { name: tool, arguments: args }) as { content?: Array<{ text?: string }>; structuredContent?: Json; isError?: boolean };
      if (result.isError) throw new Error("GITNEXUS_TOOL_IS_ERROR");
      // MCP structured tool output (protocol 2025-06-18): the official SDK serves the
      // machine-readable object here; the text channel is human-formatted and may not
      // re-parse as JSON.
      const structured = result.structuredContent;
      if (structured && typeof structured === "object" && !Array.isArray(structured)) return structured;
      const text = result.content?.find((part) => typeof part.text === "string")?.text ?? "{}";
      try { return JSON.parse(text) as Json; } catch {
        const end = balancedJsonEnd(text);
        if (end > 0) { try { return JSON.parse(text.slice(0, end)) as Json; } catch { /* fall through */ } }
        return { raw: text };
      }
    };
    return { client: { context: callTool("context"), impact: callTool("impact"), trace: callTool("trace") }, close: () => child.kill() };
  } catch { return null; }
}

const str = (value: unknown, max = 200): string | undefined => (typeof value === "string" && value.length > 0 ? value.slice(0, max) : undefined);
const num = (value: unknown): number | undefined => (typeof value === "number" ? value : undefined);
const compact = (text: string) => text.replace(/\s+/g, " ").trim();

// GitNexus appends a human-readable "**Next:** ..." suffix after the JSON payload;
// find the end of the leading balanced JSON object instead of trusting the text end.
function balancedJsonEnd(text: string): number {
  if (!text.startsWith("{")) return -1;
  let depth = 0, inString = false, escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) { if (escape) escape = false; else if (ch === "\\") escape = true; else if (ch === "\"") inString = false; continue; }
    if (ch === "\"") inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return i + 1;
  }
  return -1;
}

export async function runCodeImpact(toolName: string, rawInput: unknown, deps: CodeImpactDeps = {}) {
  const input = codeImpactInputSchema.parse(rawInput);
  const session = deps.gitnexus !== undefined ? (deps.gitnexus ? { client: deps.gitnexus, close: () => {} } : null) : await spawnGitNexus();
  const gaps: string[] = [];
  let gitnexusCalls = 0;
  let fileReads = 0;
  try {
    if (!session) {
      gaps.push(`GITNEXUS_UNAVAILABLE: "${gitnexusCommand()} mcp" could not be spawned/initialized; analysis not possible (fail-closed, zero mutation)`);
      return { status: "UNKNOWN", target: { name: input.target }, impact: { direction: input.direction, risk: "UNKNOWN", epistemic: "UNKNOWN" }, gaps, meta: { tool: toolName, gitnexusCalls: 0, fileReads: 0 } };
    }
    // 1) GitNexus context - resolve the target identity. Never auto-pick a symbol.
    const contextArgs: Json = { name: input.target, maxTokens: RESPONSE_TOKENS };
    if (input.file) contextArgs.file_path = input.file;
    if (input.kind) contextArgs.kind = input.kind;
    if (input.target_uid) contextArgs.uid = input.target_uid;
    let context: Json | null = null;
    try { gitnexusCalls++; context = await session.client.context(contextArgs); }
    catch (error) { gaps.push(`CONTEXT_FAILED: ${compact((error as Error).message)}`); }
    const candidates = Array.isArray(context?.candidates) ? (context!.candidates as Json[]) : [];
    if (context && (context.status === "ambiguous" || candidates.length > 0)) {
      for (const candidate of candidates.slice(0, 5)) gaps.push(`CANDIDATE: ${str(candidate.name, 80) ?? "?"} (${str(candidate.filePath ?? candidate.file, 120) ?? "?"})`);
      gaps.push("AMBIGUOUS_TARGET: re-call with target_uid, file or kind; no symbol was auto-selected");
      return { status: "AMBIGUOUS", target: { name: input.target }, gaps, meta: { tool: toolName, gitnexusCalls, fileReads: 0 } };
    }
    if (context && (context.status === "not_found" || context.found === false))
      return { status: "NOT_FOUND", target: { name: input.target }, gaps: [...gaps, "CONTEXT_NOT_FOUND: GitNexus could not resolve this target"], meta: { tool: toolName, gitnexusCalls, fileReads: 0 } };
    const symbol = ((context?.symbol ?? context) ?? {}) as Json;
    const resolvedFile = str(symbol.filePath ?? symbol.file, 200) ?? input.file;
    const resolved = {
      name: str(symbol.name, 160) ?? input.target,
      ...(str(symbol.uid, 120) || input.target_uid ? { uid: str(symbol.uid, 120) ?? input.target_uid } : {}),
      ...(str(symbol.kind ?? symbol.kindName, 40) || input.kind ? { kind: str(symbol.kind ?? symbol.kindName, 40) ?? input.kind } : {}),
      ...(resolvedFile ? { file: resolvedFile } : {})
    };
    // 2) GitNexus impact - blast radius core.
    const impactArgs: Json = { target: resolved.uid ?? input.target, direction: input.direction, maxDepth: input.max_depth, maxTokens: RESPONSE_TOKENS };
    if (resolved.file) impactArgs.file_path = resolved.file;
    if (resolved.kind) impactArgs.kind = resolved.kind;
    if (resolved.uid) impactArgs.target_uid = resolved.uid;
    let impact: Json | null = null;
    try { gitnexusCalls++; impact = await session.client.impact(impactArgs); }
    catch (error) { gaps.push(`IMPACT_FAILED: ${compact((error as Error).message)}`); }
    if (!impact)
      return { status: "UNKNOWN", target: resolved, impact: { direction: input.direction, risk: "UNKNOWN", epistemic: "UNKNOWN" }, gaps, meta: { tool: toolName, gitnexusCalls, fileReads: 0 } };
    const risk = str(impact.risk, 20) ?? "UNKNOWN";
    if (risk === "UNKNOWN" && !Array.isArray(impact.byDepth) && !impact.riskNote) {
      const rawText = typeof impact.raw === "string" ? impact.raw : JSON.stringify(impact);
      gaps.push(`IMPACT_UNRECOGNIZED(len=${rawText.length},tail=${compact(rawText.slice(-120))}): ${compact(rawText).slice(0, 1200)}`);
    }
    const epistemic = str(impact.epistemic, 20) ?? "UNKNOWN";
    const riskNote = str(impact.riskNote, 300);
    const boundaries = (Array.isArray(impact.boundaries) ? impact.boundaries as unknown[] : []).slice(0, 3).map((entry) => String(entry).slice(0, 200));
    const byDepthCounts: Record<string, number> = {};
    const affectedSymbols: Array<{ name: string; file?: string; depth: number; line?: number }> = [];
    for (const [key, value] of Object.entries((impact.byDepthCounts ?? {}) as Json)) if (typeof value === "number") byDepthCounts[`d${key}`] = value;
    const depthGroups: Array<{ depth: number; entries: Json[] }> = [];
    if (Array.isArray(impact.byDepth)) for (const group of impact.byDepth as Json[]) depthGroups.push({ depth: num(group.depth) ?? 0, entries: Array.isArray(group.symbols) ? group.symbols as Json[] : [] });
    else if (impact.byDepth && typeof impact.byDepth === "object") for (const [key, value] of Object.entries(impact.byDepth as Json)) if (Array.isArray(value)) depthGroups.push({ depth: Number(key) || 0, entries: value as Json[] });
    for (const group of depthGroups) {
      byDepthCounts[`d${group.depth}`] ??= group.entries.length;
      for (const entry of group.entries) if (affectedSymbols.length < 6) {
        const file = str(entry.filePath ?? entry.file, 160);
        const line = num(entry.line);
        affectedSymbols.push({ name: str(entry.name, 120) ?? "?", ...(file ? { file } : {}), depth: num(entry.depth) ?? group.depth, ...(line ? { line } : {}) });
      }
    }
    const affectedProcesses = (Array.isArray(impact.affected_processes) ? impact.affected_processes as Json[] : []).slice(0, 3).map((process) => {
      const step = num(process.step ?? process.earliest_broken_step);
      return { id: str(process.id ?? process.name, 80) ?? "?", label: str(process.label ?? process.heuristicLabel ?? process.name, 120) ?? "?", ...(step ? { step } : {}) };
    });
    // 3) GitNexus trace - conditional: at most once, only to explain the top direct relation.
    const topRelation = affectedSymbols.find((entry) => entry.depth === 1 && entry.name !== "?" && entry.name !== resolved.name);
    const paths: Array<{ from: string; to: string; hops: Array<{ from?: string; to?: string; file?: string; line?: number }> }> = [];
    if (topRelation && risk !== "UNKNOWN" && gitnexusCalls < 3) {
      try {
        gitnexusCalls++;
        const trace = await session.client.trace({ from: topRelation.name, to: resolved.name, ...(topRelation.file ? { from_file: topRelation.file } : {}), ...(resolved.file ? { to_file: resolved.file } : {}), maxDepth: 6, maxTokens: RESPONSE_TOKENS });
        if (trace.status === "no_path" || trace.found === false) gaps.push(`TRACE_NO_PATH: ${topRelation.name} -> ${resolved.name} (dynamic dispatch boundary possible); preserved honestly, not an error`);
        else paths.push({ from: topRelation.name, to: resolved.name, hops: (Array.isArray(trace.hops) ? trace.hops as Json[] : []).slice(0, 5).map((hop) => {
          const file = str(hop.file ?? hop.filePath, 160); const line = num(hop.line);
          return { ...(str(hop.from ?? hop.source, 80) ? { from: str(hop.from ?? hop.source, 80) } : {}), ...(str(hop.to ?? hop.target, 80) ? { to: str(hop.to ?? hop.target, 80) } : {}), ...(file ? { file } : {}), ...(line ? { line } : {}) };
        }) });
      } catch (error) { gaps.push(`TRACE_FAILED: ${compact((error as Error).message)}`); }
    }
    // 4) ENG-MCP file.read - at most 2 anchors on critical points (parallel when independent).
    const anchors: Array<{ path: string; startLine?: number; expect: string; finding: string }> = [];
    if (topRelation?.file) anchors.push({ path: topRelation.file, startLine: Math.max(1, (topRelation.line ?? 1) - 20), expect: topRelation.name, finding: `top direct ${input.direction} relation ${topRelation.name}` });
    if (resolved.file && resolved.file !== anchors[0]?.path) anchors.push({ path: resolved.file, expect: resolved.name, finding: `target definition ${resolved.name}` });
    const sourceEvidence: Array<{ file: string; line?: number; finding: string; evidence: "MATCHED" | "NOT_MATCHED" | "UNAVAILABLE" }> = [];
    if (deps.fileRead) sourceEvidence.push(...await Promise.all(anchors.slice(0, 2).map(async (anchor) => {
      try {
        const page = await deps.fileRead!({ path: anchor.path, startLine: anchor.startLine, maxLines: 60 });
        fileReads++;
        return { file: anchor.path, ...(anchor.startLine ? { line: anchor.startLine } : {}), finding: anchor.finding, evidence: compact(JSON.stringify(page)).includes(anchor.expect) ? "MATCHED" as const : "NOT_MATCHED" as const };
      } catch {
        fileReads++;
        return { file: anchor.path, ...(anchor.startLine ? { line: anchor.startLine } : {}), finding: anchor.finding, evidence: "UNAVAILABLE" as const };
      }
    })));
    // 5) Synthesis - honest status; absence of relations is never a safety claim.
    if (risk === "UNKNOWN") gaps.push("NO_RELATIONS_RESOLVED: absence of relations is not evidence that the symbol is safe to change");
    const partial = impact.partial === true || impact.truncated === true || context === null || risk === "UNKNOWN" || sourceEvidence.some((entry) => entry.evidence === "UNAVAILABLE");
    if (partial) gaps.push("PARTIAL: some evidence was missing, truncated, unresolved or unvalidatable; see impact.riskNote and boundaries");
    return {
      status: partial ? "PARTIAL" : "OK",
      target: resolved,
      impact: { direction: input.direction, risk, ...(riskNote ? { riskNote } : {}), epistemic, byDepth: byDepthCounts, affectedSymbols, affectedProcesses, ...(boundaries.length ? { boundaries } : {}) },
      ...(paths.length ? { paths } : {}),
      ...(sourceEvidence.length ? { sourceEvidence } : {}),
      gaps: gaps.slice(0, 6),
      meta: { tool: toolName, gitnexusCalls, fileReads, ...(partial ? { partial: true } : {}), ...(impact.truncated === true ? { truncated: true } : {}) }
    };
  } finally { session?.close(); }
}
