import { createHash } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { EngineeringError, type AuthenticatedSubject } from "./policy.js";
import type { RepositoryAdapter } from "./repository.js";
import { ObservabilityClient } from "./observability.ts";
import { AgentMemoryClient } from "./memory.ts";

export const ENGINEERING_SERVER_INFO = { name: "memoryos-eng-mcp", version: "0.1.0" } as const;
export type ToolCatalogEntry = { name: string; access: "read" | "write" };

function response(value: unknown) { return { content: [{ type: "text" as const, text: JSON.stringify(value) }] }; }

export function createToolCatalog(entries: readonly ToolCatalogEntry[], repositoryId: string) {
  const tools = [...entries].sort((left, right) => left.name.localeCompare(right.name));
  if (new Set(tools.map((tool) => tool.name)).size !== tools.length) throw new EngineeringError("TOOL_CATALOG_INVALID");
  const catalogVersion = `eng-mcp-tools-v${tools.length}`;
  const canonical = JSON.stringify({ catalogVersion, tools });
  return {
    serverName: ENGINEERING_SERVER_INFO.name,
    serverVersion: ENGINEERING_SERVER_INFO.version,
    catalogVersion,
    repositoryId,
    actualToolCount: tools.length,
    tools,
    catalogHash: createHash("sha256").update(canonical).digest("hex")
  };
}

export function registerEngineeringTools(server: McpServer, repository: RepositoryAdapter, subject: AuthenticatedSubject, repositoryId: string): void {
  const toolMetadata: ToolCatalogEntry[] = [];
  const register = (name: string, access: ToolCatalogEntry["access"], configure: (registeredName: string) => void) => { toolMetadata.push({ name, access }); configure(name); };
  const requireRead = () => { if (!subject.scopes.includes("engineering:read")) throw new EngineeringError("AUTHORIZATION_SCOPE_REQUIRED"); };
  const requireWrite = () => { if (!subject.scopes.includes("engineering:write")) throw new EngineeringError("AUTHORIZATION_SCOPE_REQUIRED"); };
  const requireVerify = () => { if (!subject.scopes.includes("engineering:verify")) throw new EngineeringError("AUTHORIZATION_SCOPE_REQUIRED"); };
  const requireGit = () => { if (!subject.scopes.includes("engineering:git")) throw new EngineeringError("AUTHORIZATION_SCOPE_REQUIRED"); };
  const requireRelease = () => { if (!subject.scopes.includes("engineering:release")) throw new EngineeringError("AUTHORIZATION_SCOPE_REQUIRED"); };

  const observability = new ObservabilityClient();
  const agentMemory = new AgentMemoryClient();

  register("engineering.repo.structure", "read", (name) => server.registerTool(name, { description: "Read the authorized repository structure.", inputSchema: z.object({ path: z.string().optional(), maxDepth: z.number().int().optional(), includeFiles: z.boolean().optional(), maxEntries: z.number().int().optional() }) }, async (input) => { requireRead(); return response(await repository.structure(input)); }));
  register("engineering.file.read", "read", (name) => server.registerTool(name, { description: "Read an allowed UTF-8 source file.", inputSchema: z.object({ path: z.string(), startLine: z.number().int().optional(), maxLines: z.number().int().optional(), maxBytes: z.number().int().optional() }) }, async (input) => { requireRead(); return response(await repository.fileRead(input)); }));
  register("engineering.code.search", "read", (name) => server.registerTool(name, { description: "Search allowed repository source with ripgrep.", inputSchema: z.object({ query: z.string(), mode: z.enum(["literal", "regex", "filename"]).optional(), maxResults: z.number().int().optional() }) }, async (input) => { requireRead(); return response(await repository.search(subject.subject, input)); }));
  register("engineering.code.references", "read", (name) => server.registerTool(name, { description: "Find heuristic textual references in the authorized repository.", inputSchema: z.object({ symbol: z.string(), maxResults: z.number().int().optional() }) }, async (input) => { requireRead(); return response(await repository.references(subject.subject, input.symbol, input.maxResults)); }));
  register("engineering.deadcode.scan", "read", (name) => server.registerTool(name, { description: "Read-only heuristic scan for dead-code candidates; never deletes code.", inputSchema: z.object({ path: z.string().optional(), maxCandidates: z.number().int().optional() }).strict() }, async (input) => { requireRead(); return response(await repository.deadCodeScan(subject.subject, input)); }));
  register("engineering.parallelpath.scan", "read", (name) => server.registerTool(name, { description: "Read-only scan for potentially parallel or legacy responsibility paths.", inputSchema: z.object({ responsibility: z.string(), maxPaths: z.number().int().optional() }).strict() }, async (input) => { requireRead(); return response(await repository.parallelPathScan(subject.subject, input)); }));
  register("engineering.contract.verify", "read", (name) => server.registerTool(name, { description: "Read-only heuristic comparison of a declared contract and one implementation.", inputSchema: z.object({ contractPath: z.string(), implementationPath: z.string(), contractSymbol: z.string().optional(), implementationSymbol: z.string().optional() }).strict() }, async (input) => { requireRead(); return response(await repository.contractVerify(input)); }));
  register("engineering.change.impact", "read", (name) => server.registerTool(name, { description: "Read-only direct and one-hop impact analysis for a file or symbol.", inputSchema: z.object({ path: z.string().optional(), symbol: z.string().optional(), description: z.string().max(1_000).optional(), maxResults: z.number().int().optional() }).strict() }, async (input) => { requireRead(); return response(await repository.changeImpact(subject.subject, input)); }));
  register("engineering.git.status", "read", (name) => server.registerTool(name, { description: "Read Git working-tree status.", inputSchema: z.object({}) }, async () => { requireRead(); return response(await repository.gitStatus()); }));
  register("engineering.git.diff", "read", (name) => server.registerTool(name, { description: "Read a safe Git working-tree or staged diff.", inputSchema: z.object({ paths: z.array(z.string()).optional(), staged: z.boolean().optional() }) }, async (input) => { requireRead(); return response(await repository.gitDiff(input)); }));
  register("engineering.git.branches", "read", (name) => server.registerTool(name, { description: "List locally known local and remote branches without fetching.", inputSchema: z.object({ filter: z.string().max(128).optional(), includeRemote: z.boolean().optional() }).strict() }, async (input) => { requireRead(); return response(await repository.gitBranches(input)); }));
  register("engineering.git.worktrees", "read", (name) => server.registerTool(name, { description: "List repository worktrees without changing them.", inputSchema: z.object({}).strict() }, async () => { requireRead(); return response(await repository.gitWorktrees()); }));
  register("engineering.git.log", "read", (name) => server.registerTool(name, { description: "Read bounded Git commit history without diffs.", inputSchema: z.object({ limit: z.number().int().min(1).max(200).optional(), path: z.string().optional(), since: z.string().max(128).optional(), until: z.string().max(128).optional(), ref: z.string().max(256).optional() }).strict() }, async (input) => { requireRead(); return response(await repository.gitLog(input)); }));
  register("engineering.git.remote_compare", "read", (name) => server.registerTool(name, { description: "Compare local refs with an already-known remote ref without fetching.", inputSchema: z.object({ localRef: z.string().max(256).optional(), remoteRef: z.string().max(256).optional() }).strict() }, async (input) => { requireRead(); return response(await repository.gitRemoteCompare(input)); }));
  register("engineering.file.patch", "write", (name) => server.registerTool(name, { description: "Apply a version-checked structured patch to one allowed file.", inputSchema: z.object({ path: z.string(), baseHash: z.string(), hunks: z.array(z.object({ startLine: z.number().int(), deleteLines: z.array(z.string()), insertLines: z.array(z.string()) })), expectedChangeCount: z.number().int().optional(), acknowledgeWrite: z.literal(true) }) }, async (input) => { requireRead(); requireWrite(); return response(await repository.patch(input)); }));
  register("engineering.file.create", "write", (name) => server.registerTool(name, { description: "Atomically create one allowed source file.", inputSchema: z.object({ path: z.string(), content: z.string(), acknowledgeWrite: z.literal(true) }) }, async (input) => { requireRead(); requireWrite(); return response(await repository.create(input)); }));
  register("engineering.test.run", "read", (name) => server.registerTool(name, { description: "Run one of the fixed, read-only ENG-MCP test profiles without accepting commands or arguments.", inputSchema: z.object({ mode: z.enum(["file", "suite", "integration"]), path: z.string().optional(), timeoutMs: z.number().int().min(1).max(300_000).optional() }).strict() }, async (input) => { requireRead(); requireVerify(); return response(await repository.testRun(subject.subject, input)); }));
  register("engineering.lint.run", "read", (name) => server.registerTool(name, { description: "Run the host-configured ESLint verification without fixes.", inputSchema: z.object({}).strict() }, async () => { requireVerify(); return response(await repository.lint(subject.subject)); }));
  register("engineering.git.stage", "write", (name) => server.registerTool(name, { description: "Stage explicitly validated non-sensitive files.", inputSchema: z.object({ paths: z.array(z.string()).min(1).max(50), expectedHashes: z.record(z.string(), z.string()), acknowledgeStage: z.literal(true) }).strict() }, async (input) => { requireGit(); return response(await repository.gitStage(input)); }));
  register("engineering.git.unstage", "write", (name) => server.registerTool(name, { description: "Remove explicit paths from the Git index only.", inputSchema: z.object({ paths: z.array(z.string()).min(1).max(50), expectedIndexHash: z.string(), acknowledgeUnstage: z.literal(true) }).strict() }, async (input) => { requireGit(); return response(await repository.gitUnstage(input)); }));
  register("engineering.git.commit", "write", (name) => server.registerTool(name, { description: "Commit exactly the previously validated staged index.", inputSchema: z.object({ message: z.string(), expectedIndexHash: z.string(), acknowledgeCommit: z.literal(true) }).strict() }, async (input) => { requireGit(); return response(await repository.gitCommit(input)); }));
  register("engineering.mcp.catalog", "read", (name) => server.registerTool(name, { description: "Return the deterministic catalog of tools exposed by this ENG-MCP server.", inputSchema: z.object({}).strict() }, async () => { requireRead(); return response(createToolCatalog(toolMetadata, repositoryId)); }));
  register("engineering.release.run", "write", (name) => server.registerTool(name, { description: "Run an allowlisted Release Pipeline V1 operation through the durable local runner.", inputSchema: z.object({ jobId: z.string().optional(), operation: z.enum(["deploy", "verify", "clean"]) }).strict() }, async (input) => { requireRead(); requireWrite(); return response(await repository.releaseRun(subject.subject, input)); }));
  register("engineering.orchestrate.batch", "read", (name) => server.registerTool(name, { description: "Execute multiple independent read operations concurrently to reduce Kilo latency.", inputSchema: z.object({ operations: z.array(z.object({ tool: z.string(), arguments: z.record(z.string(), z.any()).optional() })).min(1).max(10) }).strict() }, async (input) => { requireRead(); return response(await repository.batchOrchestrate(subject.subject, input.operations)); }));

  register("engineering.memory.context", "read", (name) => server.registerTool(name, {
    description: "Load the durable MemoryOS project context for an external engineering agent. Call this at the start of every meaningful engineering mission before investigating or changing code.",
    inputSchema: z.object({ projectId: z.string().max(200).optional(), limit: z.number().int().min(1).max(100).optional() }).strict()
  }, async (input) => {
    requireRead();
    return response(await agentMemory.call("context", { projectId: input.projectId ?? repositoryId, limit: input.limit }));
  }));

  register("engineering.memory.search", "read", (name) => server.registerTool(name, {
    description: "Search durable MemoryOS project memory when the user asks about previous work, decisions, bugs, solutions, or historical context.",
    inputSchema: z.object({ query: z.string().min(1).max(2000), projectId: z.string().max(200).optional(), limit: z.number().int().min(1).max(50).optional() }).strict()
  }, async (input) => {
    requireRead();
    return response(await agentMemory.call("search", { query: input.query, projectId: input.projectId ?? repositoryId, limit: input.limit }));
  }));

  register("engineering.memory.capture", "write", (name) => server.registerTool(name, {
    description: "Persist a durable MemoryOS mission summary after every completed meaningful engineering mission. Capture decisions, root causes, fixes, validation and next steps; do not call for acknowledgements, small talk, or trivial 'continue' turns.",
    inputSchema: z.object({
      summary: z.string().min(1).max(3000),
      projectId: z.string().max(200).optional(),
      agent: z.string().max(80).optional(),
      userPrompt: z.string().max(2000).optional(),
      outcome: z.string().max(3000).optional(),
      decisions: z.array(z.string().max(1000)).max(30).optional(),
      problems: z.array(z.string().max(1000)).max(30).optional(),
      solutions: z.array(z.string().max(1000)).max(30).optional(),
      tests: z.array(z.string().max(1000)).max(30).optional(),
      files: z.array(z.string().max(1000)).max(30).optional(),
      nextSteps: z.array(z.string().max(1000)).max(30).optional()
    }).strict()
  }, async (input) => {
    requireWrite();
    return response(await agentMemory.call("capture", {
      ...input,
      projectId: input.projectId ?? repositoryId,
      agent: input.agent ?? subject.subject
    }));
  }));

  register("engineering.typecheck.run", "read", (name) => server.registerTool(name, { description: "Run the project official TypeScript type check in no-emit mode without accepting arbitrary commands.", inputSchema: z.object({ timeoutMs: z.number().int().min(1).max(120_000).optional() }).strict() }, async (input) => { requireVerify(); return response(await repository.typeCheckRun(subject.subject, input)); }));

  // Runtime observability tools
  register("engineering.runtime.trace", "read", (name) => server.registerTool(name, {
    description: "Read the durable runtime trace for one MemoryOS execution.",
    inputSchema: z.object({
      executionId: z.string().min(1),
      limit: z.number().int().min(1).max(2000).optional()
    }).strict()
  }, async (input) => {
    requireRead();
    return response(await observability.query("trace", input));
  }));

  register("engineering.runtime.logs", "read", (name) => server.registerTool(name, {
    description: "Read bounded MemoryOS runtime system events with optional execution, session, source and status filters.",
    inputSchema: z.object({
      executionId: z.string().min(1).optional(),
      sessionId: z.string().min(1).optional(),
      source: z.string().min(1).optional(),
      status: z.string().min(1).optional(),
      limit: z.number().int().min(1).max(2000).optional()
    }).strict()
  }, async (input) => {
    requireRead();
    return response(await observability.query("logs", input));
  }));

  register("engineering.runtime.errors", "read", (name) => server.registerTool(name, {
    description: "Read failed, timed-out or blocked MemoryOS runtime observations.",
    inputSchema: z.object({
      executionId: z.string().min(1).optional(),
      limit: z.number().int().min(1).max(2000).optional()
    }).strict()
  }, async (input) => {
    requireRead();
    return response(await observability.query("errors", input));
  }));

  register("engineering.runtime.metrics", "read", (name) => server.registerTool(name, {
    description: "Read aggregate MemoryOS runtime reliability and latency metrics.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(2000).optional()
    }).strict()
  }, async (input) => {
    requireRead();
    return response(await observability.query("metrics", input));
  }));

  register("engineering.runtime.investigate", "read", (name) => server.registerTool(name, {
    description: "Investigate one execution, or the most recent failing execution, using nearby runtime phase evidence.",
    inputSchema: z.object({
      executionId: z.string().min(1).optional(),
      limit: z.number().int().min(1).max(2000).optional(),
      windowMs: z.number().int().min(30000).max(3600000).optional()
    }).strict()
  }, async (input) => {
    requireRead();
    return response(await observability.query("investigate", input));
  }));

  register("engineering.runtime.compare", "read", (name) => server.registerTool(name, {
    description: "Compare the supervised runtime phase sequence of two MemoryOS executions.",
    inputSchema: z.object({
      executionIdA: z.string().min(1),
      executionIdB: z.string().min(1),
      limit: z.number().int().min(1).max(2000).optional()
    }).strict()
  }, async (input) => {
    requireRead();
    return response(await observability.query("compare", input));
  }));

  register("engineering.runtime.bottlenecks", "read", (name) => server.registerTool(name, {
    description: "Rank MemoryOS connector and capability bottlenecks using latency, failures and timeouts.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(2000).optional()
    }).strict()
  }, async (input) => {
    requireRead();
    return response(await observability.query("bottlenecks", input));
  }));

  register("engineering.runtime.watch", "read", (name) => server.registerTool(name, {
    description: "Inspect whether a supervised MemoryOS execution is progressing, terminal or stalled.",
    inputSchema: z.object({
      executionId: z.string().min(1).optional(),
      limit: z.number().int().min(1).max(2000).optional(),
      silenceThresholdMs: z.number().int().min(5000).max(600000).optional()
    }).strict()
  }, async (input) => {
    requireRead();
    return response(await observability.query("watch", input));
  }));

  register("engineering.runtime.timeline", "read", (name) => server.registerTool(name, {
    description: "Build a chronological timeline of runtime observations and system events around one execution.",
    inputSchema: z.object({
      executionId: z.string().min(1),
      limit: z.number().int().min(1).max(2000).optional(),
      windowMs: z.number().int().min(30000).max(3600000).optional()
    }).strict()
  }, async (input) => {
    requireRead();
    return response(await observability.query("timeline", input));
  }));

  register("engineering.runtime.executions", "read", (name) => server.registerTool(name, {
    description: "List and summarize recent MemoryOS runtime executions so an engineering agent can discover relevant execution IDs.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(2000).optional()
    }).strict()
  }, async (input) => {
    requireRead();
    return response(await observability.query("executions", input));
  }));

  register("engineering.runtime.health", "read", (name) => server.registerTool(name, {
    description: "Inspect MemoryOS runtime health using recent execution observations, failures and connector behavior.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(2000).optional()
    }).strict()
  }, async (input) => {
    requireRead();
    return response(await observability.query("health", input));
  }));

  register("engineering.runtime.saturation", "read", (name) => server.registerTool(name, {
    description: "Inspect MemoryOS runtime saturation, backpressure and semaphore wait behavior.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(2000).optional()
    }).strict()
  }, async (input) => {
    requireRead();
    return response(await observability.query("saturation", input));
  }));

  register("engineering.runtime.releaseContext", "read", (name) => server.registerTool(name, {
    description: "Return the release and sprint context actually evidenced for one MemoryOS runtime execution.",
    inputSchema: z.object({
      executionId: z.string().min(1)
    }).strict()
  }, async (input) => {
    requireRead();
    return response(await observability.query("releaseContext", input));
  }));

  register("engineering.runtime.query", "read", (name) => server.registerTool(name, {
    description: "Perform a bounded read-only query over recent MemoryOS runtime telemetry.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(2000).optional()
    }).strict()
  }, async (input) => {
    requireRead();
    return response(await observability.query("query", input));
  }));
}