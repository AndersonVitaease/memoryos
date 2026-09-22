import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { EngineeringError, type AuthenticatedSubject, assertNoSensitiveContent } from "./policy.js";
import type { RepositoryAdapter } from "./repository.js";
import { runRegistryScopeGrant, registryScopeGrantInputSchema } from "./registryScopeGrant.ts";
import { ObservabilityClient } from "./observability.ts";
import { AgentMemoryClient } from "./memory.ts";
import { SupervisedMissionClient } from "./supervised.ts";
// MEMORY-GATE-01: admission gate for memory.capture — triage (dedupe + calibrated Jev screen)
// before the Base44 KB bridge; refusal throws MEMORY_GATE_REFUSED (curated taxonomy entry).
import { emitGateAudit, gateCapture } from "./memoryGate.ts";
// MEMORY-DEDUPE-01: interior KB hygiene — read-only semantic dedupe scan over
// memory pairs + calibrated re-ranking of memory.search; fail-open, advisory only.
import { dedupeScan, rerankSearchPayload } from "./memoryDedupe.ts";

import { runHttpProbe } from "./probe.ts";
import { runVpsChangeSafe, createMcpClientCallTransport, DOKPLOY_SERVER_ID_DEFAULT, DEFAULT_MEMORY_ENDPOINT } from "./vpsChangeSafe.ts";
import { runVpsDoctor } from "./vpsDoctor.ts";
import { runVpsReconcile } from "./vpsReconcile.ts";
import { runVpsRecover, vpsRecoverInputSchema } from "./vpsRecover.ts";
import { runVpsRunnerRestart, vpsRunnerRestartInputSchema } from "./vpsRunnerRestart.ts";
import { runVpsDiagnostics, vpsDiagnosticsInputSchema } from "./vpsDiagnostics.ts";
import { runVpsContainerProbe, vpsContainerProbeInputSchema } from "./vpsContainerProbe.ts";
import { runVpsSecretWrite, vpsSecretWriteInputSchema } from "./vpsSecretWrite.ts";
import { runVpsSystemdCredential, vpsSystemdCredentialInputSchema } from "./vpsSystemdCredential.ts";
// FASE 2: GitHub READ-ONLY super tool (10 operations, GET-only by construction;
// credential + rate protection live inside the module, never in the registry layer).
import { runGithubRead, githubReadInputSchema } from "./githubRead.ts";
import { defaultJudgeDeps, runJudgeEvaluate, runJudgeVerify, judgeEvaluateInputSchema, judgeVerifyInputSchema } from "./judge.ts";
import { runSecurityIds, securityIdsInputSchema } from "./securityIds.ts";
import { guardianInputSchema, runVpsGuardian } from "./vpsGuardian.ts";
import { runGuardianAppDeploy } from "./guardianAppDeploy.ts";
import { runVpsHealth, runVpsWhyDown, runDeployStatus, runVpsCapacity, runVpsWhatChanged, runAppHealth, runVpsIncidentSummary, runDeployReady, runDockerHealth, runLogsExplain } from "./simpleTools.ts";
import { codeImpactInputSchema, runCodeImpact } from "./codeImpact.ts";
import { codeUnderstandInputSchema, runCodeUnderstand } from "./codeUnderstand.ts";
import { bugTraceInputSchema, runBugTrace } from "./bugTrace.ts";
import { webConnectorInputSchema, runWebConnector } from "./webConnector.ts";
import { distributionPrepareInputSchema, runDistributionPrepare } from "./distributionPrepare.ts";
import { distributionPublishInputSchema, runDistributionPublish } from "./distributionPublish.ts";
import { distributionCampaignInputSchema, runDistributionCampaign } from "./distributionCampaign.ts";
import { imageEditInputSchema, runImageEdit } from "./imageEdit.ts";
import { imageCreateInputSchema, runImageCreate } from "./imageCreate.ts";
import { imageAdaptInputSchema, runImageAdapt } from "./imageAdapt.ts";
import { visionInspectInputSchema, runVisionInspect } from "./visionInspect.ts";
import { complianceAssessInputSchema, runComplianceAssess } from "./complianceAssess.ts";
import { sandboxCreateInputSchema, runSandboxCreate, sandboxDestroyInputSchema, runSandboxDestroy, sandboxExecInputSchema, runSandboxExec, sandboxInspectInputSchema, runSandboxInspect, sandboxCancelInputSchema, runSandboxCancel } from "./sandbox.ts";
import { sandboxBatchWriteInputSchema, runSandboxBatchWrite } from "./sandboxBatchWrite.ts";
import { manifestEditInputSchema, runManifestEdit } from "./manifestEdit.ts";
import { notifyHermesInputSchema, runNotifyHermes } from "./notifyHermes.ts";
import { getTestJobStore, createSuiteJob, finishSuiteJobFromRunner, finishSuiteJobInfra } from "./testJobs.js";
// ERROR-01: canonical structured-error envelope for every tools/call failure.
import { buildErrorEnvelope, isCanonicalEnvelope, writeErrorAudit, type ErrorEnvelope } from "./errorEnvelope.ts";

export const ENGINEERING_SERVER_INFO = { name: "memoryos-eng-mcp", version: "0.1.0" } as const;
export type ToolCatalogEntry = { name: string; access: "read" | "write" };

// GH-03 TOOL-ALIAS-COMPAT: MCP clients that sanitize tool names (dots -> underscores,
// e.g. Kilo/Goose surface "eng-mcp__engineering_git_status" and call the server with
// "engineering_git_status") used to receive -32602 "Tool not found" for every canonical
// dotted tool name, and the registry appeared to vanish mid-session whenever the
// deployed build's catalog spelling changed. The map below resolves the sanitized
// alias to the canonical name ONLY inside the tools/call wrapper
// (installToolAliasCompatibility). tools/list output is untouched: the canonical
// catalog is never duplicated or renamed, so both spellings reach the same
// registered tool and the registry stays stable within and across sessions.
const SANITIZED_TOOL_ALIASES = new Map<string, string>();
export function resolveToolAlias(name: string): string | null {
  return SANITIZED_TOOL_ALIASES.get(name) ?? null;
}

type ToolsCallRequestLike = { params?: { name?: unknown } & Record<string, unknown> } & Record<string, unknown>;
type ToolsCallHandlerLike = (request: ToolsCallRequestLike, ctx: unknown) => Promise<unknown>;
export function installToolAliasCompatibility(mcpServer: unknown): void {
  const server = mcpServer as { setRequestHandler(method: string, handler: ToolsCallHandlerLike): unknown; _getRequestHandler?(method: string): ToolsCallHandlerLike | undefined };
  const original = server._getRequestHandler?.("tools/call");
  if (typeof original !== "function") return;
  server.setRequestHandler("tools/call", async (request, ctx) => {
    const name = request?.params?.name;
    if (typeof name === "string" && name.includes("_")) {
      const canonical = SANITIZED_TOOL_ALIASES.get(name);
      if (canonical) {
        const next: ToolsCallRequestLike = { ...request, params: { ...(request.params ?? {}), name: canonical } };
        return original(next, ctx);
      }
    }
    return original(request, ctx);
  });
}

// ERROR-01 ERROR-ENVELOPE-COMPAT: post-process EVERY tools/call failure into the
// canonical structured-error envelope — ONE choke point covers all registered tools
// without touching their registration sites (same idiom as the alias wrapper above).
// Semantics frozen by design:
//  - SUCCESS results pass through byte-identical (zero behavior change, design point 5);
//  - an already-canonical envelope passes through byte-identical (no double wrap, no double audit);
//  - unknown tool names still REJECT with the original /not found/ error (rejections
//    are never caught — only resolved isError results are post-processed);
//  - every mounted envelope is REDACTED before mount (token fragments, credential
//    paths, raw secrets never reach the caller) and audited in full
//    (/data/audit/tool-errors.jsonl, never-fail — audit failure degrades to a marker).
export function mountErrorEnvelope(request: ToolsCallRequestLike, result: unknown): unknown {
  const tool = typeof request?.params?.name === "string" ? request.params.name : "unknown";
  // Design point 5 — only actual error results are post-processed: SUCCESS
  // results (isError not exactly true) pass through byte-identical.
  if ((result as { isError?: unknown } | null)?.isError !== true) return result;
  let text: string | null = null;
  if (result && typeof result === "object" && Array.isArray((result as { content?: unknown[] }).content)) {
    const part = ((result as { content: Array<{ type?: unknown; text?: unknown }> }).content).find((item) => item && typeof item === "object" && item.type === "text" && typeof item.text === "string") as { text: string } | undefined;
    if (part) text = part.text;
  }
  const parsed = text !== null ? safeJsonParseEnvelope(text) : undefined;
  if (parsed !== undefined && isCanonicalEnvelope(parsed)) {
    // Already canonical — passthrough byte-identical, no audit line (no double wrap).
    return result; // byte-identical passthrough of the ORIGINAL result object
  }
  const envelope = buildErrorEnvelope({ message: text ?? "", tool });
  writeErrorAudit({ ts: new Date().toISOString(), tool, envelope });
  return { content: [{ type: "text", text: JSON.stringify(envelope) ?? "null" }], isError: true };
}

function safeJsonParseEnvelope(text: string): unknown {
  try { return JSON.parse(text); } catch { return undefined; }
}

// ERROR-01: wraps the alias-normalizing handler — chain becomes envelope(alias(real)),
// so the envelope shim always sees the CANONICAL tool name in request.params.name.
export function installErrorEnvelopeCompatibility(mcpServer: unknown): void {
  const server = mcpServer as { setRequestHandler(method: string, handler: ToolsCallHandlerLike): unknown; _getRequestHandler?(method: string): ToolsCallHandlerLike | undefined };
  const original = server._getRequestHandler?.("tools/call");
  if (typeof original !== "function") return;
  server.setRequestHandler("tools/call", async (request, ctx) => {
    // Rejections propagate untouched (unknown tool /not found/); only resolved
    // results are post-processed into the canonical envelope when needed.
    return mountErrorEnvelope(request, await original(request, ctx));
  });
}


function response(value: unknown) { return { content: [{ type: "text" as const, text: JSON.stringify(value) ?? "null" }] }; }

type ReleaseOperation = "test" | "build" | "candidate" | "deploy" | "status" | "smoke" | "rollback" | "restart" | "inspect" | "container_probe" | "unit_credential";
const releaseTimeouts = { test: 1_210_000, build: 130_000, candidate: 610_000, deploy: 30_000, status: 30_000, smoke: 310_000, rollback: 130_000, restart: 30_000, inspect: 40_000, container_probe: 110_000, unit_credential: 110_000 };
let releasePipelineBusy = false;

// Only the official Unix socket API is reachable; no caller-supplied URL or command.
export function callReleaseRunner(operation: ReleaseOperation, jobId?: string, params?: Record<string, unknown>): Promise<{ httpStatus: number; body: any }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      socketPath: process.env.ENG_MCP_RELEASE_SOCKET ?? "/opt/eng-mcp-release-data/run/release-runner.sock",
      method: "POST", path: "/v1/release", headers: { "content-type": "application/json" }
    }, (incoming) => {
      const chunks: Buffer[] = []; let bytes = 0;
      incoming.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 262_144) { request.destroy(new Error("RELEASE_RESPONSE_TOO_LARGE")); return; }
        chunks.push(chunk);
      });
      incoming.on("error", reject);
      incoming.on("end", () => {
        try { resolve({ httpStatus: incoming.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }); }
        catch { reject(new Error("RELEASE_RESPONSE_INVALID")); }
      });
    });
    const timer = setTimeout(() => request.destroy(new Error("RELEASE_REQUEST_TIMEOUT")), releaseTimeouts[operation]);
    request.on("close", () => clearTimeout(timer));
    request.on("error", reject);
    // Runner HTTP body contract: FLAT bounded primitives only (operation/jobId/commit,
    // plus image/probe/path/maxBytes for container_probe) — a nested {params} key is refused 400 INPUT_INVALID.
    request.end(JSON.stringify({ operation, ...(jobId ? { jobId } : {}), ...(params ? params : {}) }));
  });
}

// engineering.release.test - TEST-ONLY official runner operation. Reuses the exact
// channel of engineering.release.pipeline (callReleaseRunner) and hardcodes the
// operation to "test" (the runner's synchronous, deploy-free operation). No
// caller-supplied operation/URL/socket/command is accepted; build/candidate/deploy/
// rollback/status/smoke can never be sent from here. The runner's official testAction
// may build the ephemeral test image (official test mechanism, NOT a production
// deploy). No production mutation; never a release.
// RELEASE-TEST-DIAGNOSTICS-01: on suite failure the runner answers non-2xx with the
// SAME operation:"test" body and embeds the official TAP in TESTS_FAILED:<stderr||stdout>
// (testAction). That evidence is preserved as a bounded, sanitized FAIL report built
// ONLY from what the TAP contains (names/files/messages are never invented); every
// propagated string passes through the official assertNoSensitiveContent gate and
// oversized output is truncated (failureOutput carries the bounded evidence when the
// TAP cannot be structured). No host logs are dumped and nothing is persisted.
export type ReleaseTestFailure = { test: string; file?: string; message?: string };

const RELEASE_TEST_FAILURES_LIMIT = 20;
const RELEASE_TEST_FAILURE_OUTPUT_LIMIT = 8_000;

function releaseTestTapCount(source: string, label: string): number | null {
  const match = new RegExp(`\\b${label} (\\d+)\\s*$`, "m").exec(source);
  return match === null ? null : Number(match[1]);
}

function releaseTestSafeField(value: string): string | undefined {
  try {
    assertNoSensitiveContent(value);
    return value;
  } catch {
    return undefined;
  }
}

export async function runReleaseTestOnly() {
  const result = await callReleaseRunner("test");
  if (result.httpStatus >= 200 && result.httpStatus < 300 && result.body?.operation === "test")
    return result.body;
  if (result.body?.operation !== "test")
    throw new Error("RELEASE_RUNNER_REJECTED");
  const rawEvidence = typeof result.body.stderr === "string" && result.body.stderr.length > 0
    ? result.body.stderr
    : typeof result.body.stdout === "string" && result.body.stdout.length > 0
      ? result.body.stdout
      : JSON.stringify(result.body);
  // The runner embeds the suite output after the literal TESTS_FAILED: prefix (see
  // testAction); the first TAP line may be glued to that prefix, so strip the marker
  // before parsing instead of requiring "not ok" at a line start.
  const marker = "TESTS_FAILED:";
  const evidence = rawEvidence.includes(marker) ? rawEvidence.slice(rawEvidence.indexOf(marker) + marker.length) : rawEvidence;
  const tests = releaseTestTapCount(evidence, "tests");
  const passed = releaseTestTapCount(evidence, "pass");
  const failures = evidence.split(/^\s*not ok \d+ - /m).slice(1).slice(0, RELEASE_TEST_FAILURES_LIMIT).map((block) => {
    const failure: ReleaseTestFailure = { test: releaseTestSafeField(block.split("\n")[0].trim()) ?? "[REDACTED]" };
    const file = /(?:file|location):\s*'([^']+)'/m.exec(block) ?? /([A-Za-z0-9_./-]+\.test\.ts)/.exec(block);
    const safeFile = file === null ? undefined : releaseTestSafeField(file[1].replace(/:\d+(?::\d+)?$/, ""));
    if (safeFile !== undefined) failure.file = safeFile;
    const message = /error:\s*'([^'\n]+)/.exec(block);
    const safeMessage = message === null ? undefined : releaseTestSafeField(message[1].trim().slice(0, 300));
    if (safeMessage !== undefined) failure.message = safeMessage;
    return failure;
  });
  const bounded = (evidence.length > RELEASE_TEST_FAILURE_OUTPUT_LIMIT ? evidence.slice(-RELEASE_TEST_FAILURE_OUTPUT_LIMIT) : evidence).trim();
  return {
    status: "FAIL" as const,
    tests,
    passed,
    failed: releaseTestTapCount(evidence, "fail") ?? (tests !== null && passed !== null ? tests - passed : null),
    failures,
    failureOutput: bounded.length > 0 ? releaseTestSafeField(bounded) ?? "[REDACTED]" : ""
  };
}

// TEST-01-W1: suite/full/integration profiles run as PERSISTED async jobs on the
// official release runner (the same deploy-free "test" operation as
// engineering.release.test). The MCP call returns immediately with the executionId;
// the floating promise only translates the runner result into the job store when it
// lands. Survival across MCP client disconnects is guaranteed by the runner itself,
// which keeps executing and persists release-state.json; a later engineering.test.status
// call reconciles the job from that persisted evidence (or from the runner response if
// this promise is still alive). No new daemon is created and no MCP call stays open
// for the duration of a 10+ minute suite.
async function startReleaseTestJob(profile: "suite" | "full") {
  const store = getTestJobStore();
  const job = await createSuiteJob(store, profile);
  void (async () => {
    try {
      const body = await runReleaseTestOnly();
      await finishSuiteJobFromRunner(store, job.executionId, body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "release runner unreachable");
      await finishSuiteJobInfra(store, job.executionId, message).catch(() => undefined);
    }
  })();
  return { executionId: job.executionId, status: "RUNNING" as const, profile, executor: "release-runner" as const, selection: [] as string[], note: "Async job started on the official release runner. Poll engineering.test.status with this executionId for the persisted result; readback survives client disconnects." };
}

export async function runOfficialReleasePipeline(deployJobId?: string) {
  const evidence: Array<{ operation: ReleaseOperation; httpStatus: number; body: any }> = [];
  if (releasePipelineBusy) return { success: false, error: "RELEASE_PIPELINE_BUSY", evidence };
  releasePipelineBusy = true;
  let operation: ReleaseOperation = deployJobId ? "status" : "test";
  const call = async (next: ReleaseOperation, jobId?: string) => {
    operation = next;
    const result = await callReleaseRunner(next, jobId);
    evidence.push({ operation: next, ...result });
    if (result.httpStatus < 200 || result.httpStatus >= 300 || result.body?.operation !== next)
      throw new Error("RELEASE_RUNNER_REJECTED");
    return result.body;
  };
  const completed = (body: any, expected: ReleaseOperation) => {
    if (body.success !== true || body.exitCode !== 0 || body.job?.operation !== expected || body.job?.status !== "success")
      throw new Error("RELEASE_STAGE_FAILED");
  };
  try {
    if (!deployJobId) {
      for (const stage of ["test", "build", "candidate"] as const) completed(await call(stage), stage);
      const accepted = await call("deploy");
      if (accepted.accepted !== true || accepted.status !== "queued" || !/^[a-f0-9-]{16,64}$/i.test(accepted.jobId ?? ""))
        throw new Error("RELEASE_DEPLOY_NOT_ACCEPTED");
      // Deploy stops this container. Return the durable runner ID before replacement.
      // Resume this same tool with deployJobId; queued is never reported as success.
      return { success: false, pending: true, deployJobId: accepted.jobId, nextAction: "Call engineering.release.pipeline with this deployJobId after reconnecting.", evidence };
    }
    if (!/^[a-f0-9-]{16,64}$/i.test(deployJobId)) throw new Error("RELEASE_JOB_ID_INVALID");
    const deadline = Date.now() + 240_000;
    for (let attempt = 0; attempt < 48 && Date.now() < deadline; attempt++) {
      const status = await call("status", deployJobId);
      const job = status.job;
      if (status.success !== true || job?.jobId !== deployJobId || job.operation !== "deploy")
        throw new Error("RELEASE_DEPLOY_JOB_INVALID");
      if (job.status === "success") {
        if (job.exitCode !== 0) throw new Error("RELEASE_DEPLOY_FAILED");
        completed(await call("smoke"), "smoke");
        return { success: true, deployJobId, evidence };
      }
      if (job.status !== "queued" && job.status !== "running") throw new Error("RELEASE_DEPLOY_FAILED");
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
    throw new Error("RELEASE_DEPLOY_TIMEOUT");
  } catch (error) {
    return { success: false, failedOperation: operation, deployJobId, error: error instanceof Error ? error.message : "RELEASE_FAILED", evidence };
  } finally { releasePipelineBusy = false; }
}

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
  const register = (name: string, access: ToolCatalogEntry["access"], configure: (registeredName: string) => void) => { toolMetadata.push({ name, access }); configure(name); const alias = name.replaceAll(".", "_"); if (alias !== name && !SANITIZED_TOOL_ALIASES.has(alias)) SANITIZED_TOOL_ALIASES.set(alias, name); };
  const requireRead = () => { if (!subject.scopes.includes("engineering:read")) throw new EngineeringError("AUTHORIZATION_SCOPE_REQUIRED"); };
  const requireWrite = () => { if (!subject.scopes.includes("engineering:write")) throw new EngineeringError("AUTHORIZATION_SCOPE_REQUIRED"); };
  const requireVerify = () => { if (!subject.scopes.includes("engineering:verify")) throw new EngineeringError("AUTHORIZATION_SCOPE_REQUIRED"); };
  const requireGit = () => { if (!subject.scopes.includes("engineering:git")) throw new EngineeringError("AUTHORIZATION_SCOPE_REQUIRED"); };
  const requireRelease = () => { if (!subject.scopes.includes("engineering:release")) throw new EngineeringError("AUTHORIZATION_SCOPE_REQUIRED"); };
  // Trusted operator approval boundary for distribution publish: only operator-issued
  // bearer tokens carry this scope (src/token-create.ts, ENG_MCP_TOKEN_SCOPES). The agent
  // cannot add scopes to its own token; the registry is operator-managed and hashed server-side.
  const requireDistributionPublish = () => { if (!subject.scopes.includes("engineering:distribution:publish")) throw new EngineeringError("AUTHORIZATION_SCOPE_REQUIRED"); };
  // ITEM-0 SCOPE GAP: engineering.vps.change.safe performs a REAL mutation (Dokploy
  // application-redeploy) and previously gated on read+write only - weaker than the
  // release pipeline. The mutation-grade scope now required mirrors the
  // engineering:distribution:publish enforcement pattern (operator-issued token via
  // src/token-create.ts / ENG_MCP_TOKEN_SCOPES; the agent cannot self-authorize).
  const requireVpsChangeSafe = () => { if (!subject.scopes.includes("engineering:vps:application:redeploy")) throw new EngineeringError("AUTHORIZATION_SCOPE_REQUIRED"); };
  // ITEM-1: restart of the official release runner service is a governed mutation of
  // a long-lived service — its own scope, mirroring the <resource>:<action> convention.
  const requireVpsRunnerRestart = () => { if (!subject.scopes.includes("engineering:vps:runner:restart")) throw new EngineeringError("AUTHORIZATION_SCOPE_REQUIRED"); };

  // ITEM-3: host diagnostics read the runner service's systemd/journal/docker
  // state — outside the repository boundary, so the read-only scope is
  // UNCONDITIONAL (scope is the primary control; redaction is defense in depth).
  const requireVpsDiagnosticsRead = () => { if (!subject.scopes.includes("engineering:vps:diagnostics:read")) throw new EngineeringError("AUTHORIZATION_SCOPE_REQUIRED"); };

  // ITEM-2: one-off container probes spawn a disposable, network-less, read-only
  // container from a LOCAL allowlisted image — still outside the repository
  // boundary, so the scope is UNCONDITIONAL (same convention as diagnostics).
  const requireVpsContainerProbe = () => { if (!subject.scopes.includes("engineering:vps:container:probe")) throw new EngineeringError("AUTHORIZATION_SCOPE_REQUIRED"); };

  // VPS-SECRET-WRITE-01: writing credential FILES on the VPS filesystem mutates
  // secrets storage — its own operator-issued scope per the <resource>:<action>
  // convention; the agent can never self-authorize and secret values never cross
  // the tool boundary (paths and 16-hex sha256 prefixes only).
  const requireVpsSecretWrite = () => { if (!subject.scopes.includes("engineering:vps:secret:write")) throw new EngineeringError("AUTHORIZATION_SCOPE_REQUIRED"); };
  const requireVpsSystemdCredential = () => { if (!subject.scopes.includes("engineering:vps:systemd:credential")) throw new EngineeringError("AUTHORIZATION_SCOPE_REQUIRED"); };
  // FASE 2: outbound GitHub reads are gated by their own operator-issued scope —
  // the internal read scope proves repository access; this one proves the PAT may be spent.
  const requireGithubRead = () => { if (!subject.scopes.includes("engineering:github:read")) throw new EngineeringError("AUTHORIZATION_SCOPE_REQUIRED"); };
  const requireJudgeRead = () => { if (!subject.scopes.includes("engineering:judge:read")) throw new EngineeringError("AUTHORIZATION_SCOPE_REQUIRED"); };

  // GIT-PUSH-01: outbound pushes mutate the REMOTE — their own operator-issued
  // scope per the <resource>:<action> convention (ITEM-1); the generic git scope never implies remote write.
  const requireGitPush = () => { if (!subject.scopes.includes("engineering:git:push")) throw new EngineeringError("AUTHORIZATION_SCOPE_REQUIRED"); };

  // GIT-FETCH-01: fetch mutates NOTHING local — it only refreshes remote-tracking
  // refs. Still its own operator-issued scope: network egress + credential use are
  // authorized independently of local repo write (mirrors git:push vs git).
  const requireGitFetch = () => { if (!subject.scopes.includes("engineering:git:fetch")) throw new EngineeringError("AUTHORIZATION_SCOPE_REQUIRED"); };

  // GIT-MERGE-01: merge rewrites LOCAL history (branch head, merge commits) and
  // closes the fetch → merge → push cycle — its own operator-issued scope, never
  // implied by engineering:git or by the fetch/push scopes.
  const requireGitMerge = () => { if (!subject.scopes.includes("engineering:git:merge")) throw new EngineeringError("AUTHORIZATION_SCOPE_REQUIRED"); };
  const requireRegistryScopeGrant = () => { if (!subject.scopes.includes("engineering:registry:scope:grant")) throw new EngineeringError("AUTHORIZATION_SCOPE_REQUIRED"); };

  const observability = new ObservabilityClient();
  const agentMemory = new AgentMemoryClient();
  const supervisedMission = new SupervisedMissionClient();

  register("engineering.supervised_mission", "write", (name) => server.registerTool(name, {
    description: "Forward a supervised engineering mission to the backend and return its real result.",
    inputSchema: z.object({ prompt: z.string(), sessionId: z.string(), projectId: z.string().optional(), executionId: z.string().optional() }).strict()
  }, async (input) => {
    requireWrite();
    const payload = { prompt: input.prompt, sessionId: input.sessionId, projectId: input.projectId, executionId: input.executionId };
    return response(await supervisedMission.call(payload));
  }));

  register("engineering.repo.structure", "read", (name) => server.registerTool(name, { description: "Read the authorized repository structure.", inputSchema: z.object({ path: z.string().optional(), maxDepth: z.number().int().optional(), includeFiles: z.boolean().optional(), maxEntries: z.number().int().optional() }) }, async (input) => { requireRead(); return response(await repository.structure(input)); }));
  register("engineering.file.read", "read", (name) => server.registerTool(name, { description: "Read an allowed UTF-8 source file.", inputSchema: z.object({ path: z.string(), startLine: z.number().int().optional(), maxLines: z.number().int().optional(), maxBytes: z.number().int().optional(), repository: z.enum(["eng-mcp", "memoryos"]).optional() }) }, async (input) => { requireRead(); return response(await repository.fileRead(input, input.repository)); }));
  register("engineering.code.search", "read", (name) => server.registerTool(name, { description: "Search allowed repository source with ripgrep.", inputSchema: z.object({ query: z.string(), mode: z.enum(["literal", "regex", "filename"]).optional(), maxResults: z.number().int().optional(), repository: z.enum(["eng-mcp", "memoryos"]).optional() }) }, async (input) => { requireRead(); return response(await repository.search(subject.subject, input, input.repository)); }));
  register("engineering.code.references", "read", (name) => server.registerTool(name, { description: "Find heuristic textual references in the authorized repository.", inputSchema: z.object({ symbol: z.string(), maxResults: z.number().int().optional() }) }, async (input) => { requireRead(); return response(await repository.references(subject.subject, input.symbol, input.maxResults)); }));
  register("engineering.deadcode.scan", "read", (name) => server.registerTool(name, { description: "Read-only heuristic scan for dead-code candidates; never deletes code.", inputSchema: z.object({ path: z.string().optional(), maxCandidates: z.number().int().optional() }).strict() }, async (input) => { requireRead(); return response(await repository.deadCodeScan(subject.subject, input)); }));
  register("engineering.parallelpath.scan", "read", (name) => server.registerTool(name, { description: "Read-only scan for potentially parallel or legacy responsibility paths.", inputSchema: z.object({ responsibility: z.string(), maxPaths: z.number().int().optional() }).strict() }, async (input) => { requireRead(); return response(await repository.parallelPathScan(subject.subject, input)); }));
  register("engineering.contract.verify", "read", (name) => server.registerTool(name, { description: "Read-only heuristic comparison of a declared contract and one implementation.", inputSchema: z.object({ contractPath: z.string(), implementationPath: z.string(), contractSymbol: z.string().optional(), implementationSymbol: z.string().optional() }).strict() }, async (input) => { requireRead(); return response(await repository.contractVerify(input)); }));
  register("engineering.change.impact", "read", (name) => server.registerTool(name, { description: "Read-only direct and one-hop impact analysis for a file or symbol.", inputSchema: z.object({ path: z.string().optional(), symbol: z.string().optional(), description: z.string().max(1_000).optional(), maxResults: z.number().int().optional() }).strict() }, async (input) => { requireRead(); return response(await repository.changeImpact(subject.subject, input)); }));
  register("engineering.code.impact", "read", (name) => server.registerTool(name, {
    description: "Composed read-only pre-change impact (GitNexus-backed): GitNexus context resolves the target (ambiguity stops the flow, no auto-selection), GitNexus impact computes blast radius/risk/epistemic/depths/processes, at most one conditional trace explains a relevant path, and at most 2 ENG-MCP file.read anchors validate critical points against the authorized source. Preserves UNKNOWN/PARTIAL honestly; absence of relations is never a safety claim; zero mutation.",
    inputSchema: codeImpactInputSchema
  }, async (input) => { requireRead(); return response(await runCodeImpact(name, input, { fileRead: (args) => repository.fileRead(args, undefined) })); }));
  register("engineering.code.understand", "read", (name) => server.registerTool(name, {
    description: "Composed read-only structural understanding (GitNexus-backed): GitNexus context resolves the symbol and its categorized callers/dependencies (ambiguity stops the flow, no auto-selection), at most one conditional trace explains how the top caller reaches the symbol, and at most 2 ENG-MCP file.read anchors ground the definition and top caller in the authorized source. Purpose is reported only when the graph or the source window supports it; absence of graph relations never implies absence of dependencies; zero mutation.",
    inputSchema: codeUnderstandInputSchema
  }, async (input) => { requireRead(); return response(await runCodeUnderstand(name, input, { fileRead: (args) => repository.fileRead(args, undefined) })); }));
  register("engineering.bug.trace", "read", (name) => server.registerTool(name, {
    description: "Composed read-only bug investigation (GitNexus-backed): exactly one engineering.code.search pass localizes the symptom text, GitNexus context resolves an explicit suspect target (never auto-picked from search hits), at most one conditional trace explains the path into the suspect symbol, and at most 2 ENG-MCP file.read anchors validate critical points against real source. Honest evidence levels (PROVEN never auto-claimed, SUPPORTED, PLAUSIBLE, UNKNOWN); never claims root cause without proof; no retry, no patch, zero mutation.",
    inputSchema: bugTraceInputSchema
  }, async (input) => { requireRead(); return response(await runBugTrace(name, input, { fileRead: (args) => repository.fileRead(args, undefined), codeSearch: (args) => repository.search(subject.subject, args, undefined) })); }));
  register("engineering.web.connector", "write", (name) => server.registerTool(name, {
    description: "Deterministic bridge to the EXISTING Playwright MCP servers (playwright-web-connector / playwright-bug-hunter) via the Base44 mcp_execute gateway: sequential validated steps (navigate/snapshot/find/click/type/fill_form/press_key/select_option/tabs/wait_for/screenshot/console/network/resize/dialog/drop) plus a bounded binary upload action that stages files into the shared playwright-staging host bind and calls browser_file_upload with supertool-generated paths only. Goose never supplies toolName/serverId/server_url/raw args; browser_run_code_unsafe and browser_evaluate are impossible; staged files are deleted in finally. Optional authSessionRef (32-hex opaque, from the POST /auth-session ingest route) applies a domain-bound short-TTL temporary session to the Playwright context BEFORE navigation: fail-closed on unknown/expired refs, missing navigation and domain mismatch; secrets are never exposed; absent ref keeps behavior identical.",
    inputSchema: webConnectorInputSchema
  }, async (input) => { requireRead(); requireWrite(); return response(await runWebConnector(name, input, {})); }));
  register("engineering.distribution.prepare", "write", (name) => server.registerTool(name, {
    description: "High-level distribution supertool (v1, channel \"dev\" only): ONE intention that composes engineering.web.connector capabilities (navigate/snapshot/fill_form/type/click/wait_for/upload) into a deterministic plan - open the authenticated DEV editor, verify the session, fill title/body, optionally add up to 4 tags and attach media through the proven connector staging pipeline, snapshot-verify the content, save as DRAFT and confirm the Unpublished state. Goose never supplies refs/selectors/toolName/raw args; browser_run_code_unsafe and browser_evaluate are unreachable; media inherits the connector invariants (2 MiB/file, 4 files/step, random names, traversal denial, cleanup, orphan sweep). There is NO publish capability or parameter: every result reports published:false, the only persistence action is the Save Draft button, and any gate/step/verification failure is fail-closed (never publishes, never retries mutable actions).",
    inputSchema: distributionPrepareInputSchema
  }, async (input) => { requireRead(); requireWrite(); return response(await runDistributionPrepare(name, input, {})); }));
  register("engineering.distribution.publish", "write", (name) => server.registerTool(name, {
    description: "Guardian-gated publish boundary (v1, channel \"dev\" only): publishes EXACTLY ONE previously-approved DEV draft. Input is ONLY a data-only state-bound approval artifact {version, action:\"publish_draft\", channel:\"dev\", draftUrl, account, title, bodyProbe, tags, mediaRefs, fingerprint(sha256 over full content), approvedBy(provenance), observedAt}. Governed by frozen Guardian Core v0.1.0 via a thin Distribution Adapter: bind (read-only eligibility), apply (in-session live revalidation: draft exists, still UNPUBLISHED, same account, title/bodyProbe/tags match, fingerprint shape; ANY mismatch -> NOT_EXECUTED zero mutation), then EXACTLY ONE click on the internally-resolved Publish control, then read-only postvalidation. No approved/execute/publish booleans, no content fields, no refs/selectors/toolName/steps/URLs from the caller. No automatic mutation retry (maxPublishClicks=1); occurrence reported honestly as SUCCESS_PROVEN / NOT_EXECUTED / NONE_PROVEN / INDETERMINATE; no atomicity claim (residual race window declared). Requires bearer scope engineering:distribution:publish (operator-issued; the agent cannot self-authorize).",
    inputSchema: distributionPublishInputSchema
  }, async (input) => { requireRead(); requireWrite(); requireDistributionPublish(); return response(await runDistributionPublish(name, input, {})); }));
  register("engineering.distribution.campaign", "write", (name) => server.registerTool(name, {
    description: "REAL multichannel distribution supertool (v1, PREPARE-ONLY, channels dev+reddit): ONE high-level call coordinates preparation of the SAME canonical content ({campaign:{title,body,media?}}) across the explicitly requested channels — dev reuses engineering.distribution.prepare verbatim (authenticated editor, tags/media, Save Draft, Unpublished proof) and reddit composes engineering.web.connector read-only gates (auth fail-closed: block/login markers -> that channel FAILED, no login flow, no CAPTCHA/2FA bypass) then mounts title+body in the composer with ZERO click steps (target pre-selected via the /r/{target}/submit URL) and reports PREPARED_NOT_PERSISTED with persisted:false (no persistent Reddit web draft is claimed). Strict schema at every level: mode must be the literal \"prepare\"; publish flags, raw refs/selectors/toolNames/steps/code, approval artifacts and tokens are structurally impossible. Channels run sequentially in caller order; a channel failure never rolls back another channel's result and never publishes as a fallback (global SUCCESS/PARTIAL/FAIL). published:false is structural on every result; Guardian is NOT integrated (publication stays Guardian-gated in engineering.distribution.publish); no campaign.publish exists.",
    inputSchema: distributionCampaignInputSchema
  }, async (input) => { requireRead(); requireWrite(); return response(await runDistributionCampaign(name, input, {})); }));
  register("engineering.image.edit", "write", (name) => server.registerTool(name, {
    description: "Professional image editing supertool over the user's LOCAL Photopea executor via the authenticated outbound-only relay: ONE tool with 14 high-level actions (inspect/document/layers/transform/style/text/compose/adjust/filter/selection/place/export/undo/redo) and deterministically sequential composed operations per call. Strict structured schema only - callers can NEVER supply raw toolName/JSON-RPC/Photopea script/shell (schema-level rejection); internal run_script fallbacks are fixed templates owned by the local executor. Same persistent Photopea document across calls (state = open Photopea). Fail-closed: LOCAL_EDITOR_OFFLINE / RELAY_TIMEOUT / RELAY_INVALID_RESPONSE / RELAY_DISCONNECTED never invent success; export refuses overwrite without explicit output.overwrite and never touches the master PSD.",
    inputSchema: imageEditInputSchema
  }, async (input) => { requireRead(); requireWrite(); return response(await runImageEdit(input)); }));
  register("engineering.image.create", "write", (name) => server.registerTool(name, {
    description: "NEW visual creation supertool (v1): creates pixels/compositions that do not exist yet. generate/background/scene/variation create new images via the proven Cloudflare Workers AI REST path (flux-1-schnell; provider/model is never a caller requirement - optional pin only); product/campaign/compose mount generated + real user assets (product, logo, text, shape) into an editable Photopea document by delegating ALL editing work to the existing engineering.image.edit executor path (same relay, same structured actions, no second editor). Generated bytes are delivered to the local executor over this server's HTTPS origin at /image-asset/<random id> (short TTL) because the existing executor resolves sources as URLs/local paths. variation = concept-level variations (count 2-4, optional styleHints), never resizes. referenceImages fail closed (UNSUPPORTED_REFERENCE_MODE); generation dimensions are provider-validated (INVALID_DIMENSIONS); missing credential fails closed (GENERATION_PROVIDER_UNAVAILABLE). Strict schema: no raw shell/JS/JSON-RPC/toolName/script/URL execution anywhere; credentials never returned or logged; partial variation results are reported honestly (status partial).",
    inputSchema: imageCreateInputSchema
  }, async (input) => { requireRead(); requireWrite(); return response(await runImageCreate(name, input, {})); }));
  register("engineering.image.adapt", "write", (name) => server.registerTool(name, {
    description: "Adaptation supertool (v1): adapts an EXISTING piece/document into versions for other formats, proportions and destinations. Exactly 7 high-level actions: resize (fit|fill|stretch - stretch explicit only), reflow (reorganize existing layers for a new ratio via deterministic V1 layout rules), format (ONE destination: explicit target dimensions are the final source of truth; optional semantic square|portrait|story|landscape - no social network catalog), batch (deterministic sequential per-target results; PARTIAL when some fail; never SUCCESS if any failed), crop (recompose for the target ratio; never auto-cuts product/logo/text when structured layers allow recomposition; honest center-crop warning for flattened sources), extend (enlarge canvas structurally first; new background pixels only via the EXISTING engineering.image.create generation path, INSUFFICIENT_BACKGROUND when that is not possible) and variant (layout variant of the same piece - same identity/assets/content, adapted layout; distinct from image.create variation which is a new concept). ALL layer/document/export work is delegated to the EXISTING engineering.image.edit executor path (zero second editor); background generation delegates to the EXISTING engineering.image.create path (zero second generator); no new bridge/relay. Editable documents keep their layers (never flattened prematurely). Layout V1 is deterministic only: bounds, relative positions/scale, margins, alignment and layer-name roles - no computer vision, no ML layout model. Master protection: the source/master is NEVER overwritten - every target exports to a NEW output path (overwriting an existing output file only with explicit output.overwrite). Strict structured schema only - callers can NEVER supply raw JS/shell/JSON-RPC/toolName/Photopea script/commands; no social APIs, no publication, no scheduler.",
    inputSchema: imageAdaptInputSchema
  }, async (input) => { requireRead(); requireWrite(); return response(await runImageAdapt(name, input, {})); }));
  register("engineering.compliance.assess", "read", (name) => server.registerTool(name, {
    description: "GLGPD-01 first Guardian LGPD scanner (READ_ONLY): composes three proven read-only engines (LGPD MCP knowledge layer, GDPR Shift-Left AST privacy engineering, SAST read-only subset with separate venvs for the proven mcp<2 / mcp>=2 conflict) over one repository target and aggregates deterministic findings with preserved evidence, source, UNKNOWN and HUMAN_INPUT_REQUIRED statuses. Scanner absence is reported as UNAVAILABLE, never as no-vulnerability. Produces readiness assessment only - NEVER LGPD_COMPLIANT/CERTIFIED conclusions. Zero mutation: no patch, no commit, no deploy, no fix, no external integrations; Guardian Core untouched.",
    inputSchema: complianceAssessInputSchema
  }, async (input) => { requireRead(); return response(await runComplianceAssess(input)); }));
  register("engineering.vision.inspect", "write", (name) => server.registerTool(name, {
    description: "Horizontal vision supertool (v1): REAL multimodal perception - REAL image(s) -> multimodal model -> visual response. VISION perceives, it never acts: zero mutation, no browser, no editor, no publication, no scheduler. Exactly 7 high-level actions: inspect (describe what is visible), analyze (composition/colors/layout/quality), verify (claims TRUE/FALSE/UNCLEAR with reasons), compare (per-image factual description for comparison), locate (find a target with relative spatial position; NOT_FOUND when absent), extract (visible text and structured elements in reading order), diagnose (visual defects with low/medium/high severity). Images: 1..4 inline base64 (png/jpeg/webp/gif); the multimodal provider contract is single-image per call, so multi-image input runs as deterministic sequential per-image calls with honest per-image results (partial never pretends success). Spatial evidence is model-reported relative positioning (top/bottom/left/right/center) when spatial=true - no OCR or CV engine is implemented here. Provider: the PROVEN Cloudflare Workers AI REST path reused from engineering.image.create with the same credential resolution (env or operator-provisioned credential file; token never returned, logged or echoed; base64 payloads never echoed back). Fail-closed: VISION_PROVIDER_UNAVAILABLE / VISION_PROVIDER_ERROR / IMAGE_DECODE_FAILED / INPUT_INVALID / VISION_FAILED. Strict schema: no raw shell/JS/JSON-RPC/toolName/script/URL execution anywhere.",
    inputSchema: visionInspectInputSchema
  }, async (input) => { requireRead(); requireWrite(); return response(await runVisionInspect(name, input, {})); }));
  register("engineering.sandbox.create", "write", (name) => server.registerTool(name, {
    description: "SB-01 sandbox foundation: create ONE real sandbox on E2B Managed (the only provider) for a mission. The sandbox is created through the official E2B SDK with the native provider TTL applied at creation (ttlMs, default 5 minutes) and the missionId attached as sandbox metadata, then a MissionRecord (missionId, sandboxId, provider, status, createdAt, expiresAt) is persisted so ownership survives the process. The E2B credential is read only from the server env and is never written, logged, stored or echoed. Fail-closed typed errors: SANDBOX_CREDENTIAL_MISSING, SANDBOX_PROVIDER_UNAVAILABLE, SANDBOX_CREATE_FAILED, MISSION_ALREADY_ACTIVE, MISSION_RECORD_PERSIST_FAILED (the freshly created sandbox is rolled back). A mission owns at most one active sandbox. SB-02 scope (exec, inspect, lifecycle, timeout/cancel) is not part of this tool.",
    inputSchema: sandboxCreateInputSchema
  }, async (input) => { requireRead(); requireWrite(); return response(await runSandboxCreate(input)); }));
  register("engineering.sandbox.destroy", "write", (name) => server.registerTool(name, {
    description: "SB-01 sandbox foundation: destroy ONE sandbox, PROVEN. Ownership rule: a sandboxId alone grants no authority - destroy only runs when the missionId is registered AND the sandboxId is the one registered for that same mission; any mismatch fails with zero mutation (MISSION_NOT_REGISTERED, MISSION_SANDBOX_MISMATCH, MISSION_NOT_ACTIVE). After killing the sandbox through the official E2B SDK the provider lists the account again and the destruction must be proven - a sandbox still listed after kill is reported as SANDBOX_DESTROY_UNVERIFIED, never as success. The MissionRecord is marked destroyed only after the proof. The E2B credential is read only from the server env and is never written, logged, stored or echoed.",
    inputSchema: sandboxDestroyInputSchema
  }, async (input) => { requireRead(); requireWrite(); return response(await runSandboxDestroy(input)); }));
  register("engineering.sandbox.exec", "write", (name) => server.registerTool(name, {
    description: "SB-02 minimal exec: run ONE controlled command inside the mission's REAL E2B sandbox (never on this host) and return {executionId, exitCode, stdout, stderr, timedOut, cancelled}. One execution = one controlled operation: no persistent shell, no scheduler, executions are serial per sandbox (SANDBOX_EXEC_BUSY if one is still in flight). Ownership gates deny with zero mutation (MISSION_NOT_REGISTERED / MISSION_SANDBOX_MISMATCH / MISSION_NOT_ACTIVE); a destroyed/expired/gone sandbox fails closed (MISSION_NOT_ACTIVE / SANDBOX_EXPIRED / SANDBOX_GONE). timeoutMs (default 60s, max 10min) actively kills the process through the provider (the SDK request deadline is never the timeout mechanism) and reports timedOut=true; termination is never inferred from the timeout alone. stdout/stderr are capped with truncated flags. Cancel via engineering.sandbox.cancel; cancelling never destroys the sandbox.",
    inputSchema: sandboxExecInputSchema
  }, async (input) => { requireRead(); requireWrite(); return response(await runSandboxExec(input)); }));
  register("engineering.sandbox.inspect", "read", (name) => server.registerTool(name, {
    description: "SB-02 minimal inspect: READ-ONLY lifecycle view of the mission's sandbox, assembled from the real provider listing (no connection, no mutation, no secrets): missionId binding, sandboxId, provider, recordStatus (active/destroyed), computed lifecycle (running/paused/expired/failed/destroyed), exists, state, startedAt, endAt, createdAt, expiresAt. Ownership is required but an ACTIVE mission is not - inspect reports destroyed/expired missions honestly and never becomes an authority (MISSION_NOT_REGISTERED / MISSION_SANDBOX_MISMATCH deny with zero mutation).",
    inputSchema: sandboxInspectInputSchema
  }, async (input) => { requireRead(); return response(await runSandboxInspect(input)); }));
  register("engineering.sandbox.cancel", "write", (name) => server.registerTool(name, {
    description: "SB-02 minimal cancel: kill ONE in-flight execution of THIS mission's sandbox (the pair missionId+sandboxId is validated against the registered MissionRecord and the in-flight execution BEFORE any kill; cross-mission cancel is denied with zero mutation). The process is SIGKILLed through the provider and termination can be proven independently (e.g. pgrep via engineering.sandbox.exec); cancelling an execution NEVER destroys the sandbox (post-cancel exec keeps working). Fail-closed typed errors: MISSION_NOT_REGISTERED, MISSION_SANDBOX_MISMATCH, MISSION_NOT_ACTIVE, EXECUTION_NOT_FOUND (nothing in flight), EXECUTION_NOT_STARTED, EXECUTION_CANCEL_FAILED (process already gone).",
    inputSchema: sandboxCancelInputSchema
  }, async (input) => { requireRead(); requireWrite(); return response(await runSandboxCancel(input)); }));
  register("engineering.sandbox.batchWrite", "write", (name) => server.registerTool(name, {
    description: "SBW-01 batched writes MVP (ceiling 10 since SBW-02): ONE governed flow for batched source-file writes, composed from the certified pieces untouched (SB-01 SandboxService, certified SB-02 exec transport, repository.patch per-file integrity). Exactly 4 actions: materialize (create the mission's sandbox, copy 1-10 repository files byte-exactly through the certified exec transport, record each file's base sha256 AT COPY TIME; any integrity mismatch destroys the sandbox), write (apply up to 10 {path, content} ops INSIDE the disposable sandbox - no per-file baseHash there, sha equality is the proof; duplicate paths in one call rejected before any exec; every path must have been materialized), validate (run tsc --noEmit in-sandbox over the materialized+written set with deps installed in the sandbox; a FAILED check DESTROYS the sandbox so nothing reaches the real code), sync (ONE approval for the whole set: bind re-reads every target and refuses with SBW_DRIFT_DETECTED on ANY divergence since materialization - zero mutation, no merge; apply sends ONE full-replace hunk per file through the existing repository.patch, which revalidates each baseHash again, and reports the real newHash per file; per-file results honestly report a partial apply). MVP scope: replacement of materialized files only (no file creation, no new directories, no ceilings above 10 ops, no BOM-bearing base files - repository.patch fails closed on those). Fail-closed typed errors: SBW_BATCH_NOT_FOUND (in-memory batch state; lost on server restart), SBW_DUPLICATE_PATH, SBW_TARGET_NOT_MATERIALIZED, SBW_INVALID_CONTENT, SBW_INTEGRITY_MISMATCH, SBW_NOTHING_TO_VALIDATE, SBW_VALIDATION_REQUIRED, SBW_VALIDATION_FAILED, SBW_DRIFT_DETECTED, SBW_ALREADY_SYNCED. No secrets in outputs: hashes, exit codes and capped diagnostics only.",
    inputSchema: sandboxBatchWriteInputSchema
  }, async (input) => { requireRead(); requireWrite(); return response(await runSandboxBatchWrite(input, { repository })); }));
  register("engineering.git.status", "read", (name) => server.registerTool(name, { description: "Read Git working-tree status.", inputSchema: z.object({ repository: z.enum(["eng-mcp", "memoryos"]).optional() }) }, async (input) => { requireRead(); return response(await repository.gitStatus(input.repository)); }));
  register("engineering.git.diff", "read", (name) => server.registerTool(name, { description: "Read a safe Git working-tree or staged diff.", inputSchema: z.object({ paths: z.array(z.string()).optional(), staged: z.boolean().optional(), repository: z.enum(["eng-mcp", "memoryos"]).optional() }) }, async (input) => { requireRead(); return response(await repository.gitDiff(input, input.repository)); }));
  register("engineering.git.branches", "read", (name) => server.registerTool(name, { description: "List locally known local and remote branches without fetching.", inputSchema: z.object({ filter: z.string().max(128).optional(), includeRemote: z.boolean().optional() }).strict() }, async (input) => { requireRead(); return response(await repository.gitBranches(input)); }));
  register("engineering.git.worktrees", "read", (name) => server.registerTool(name, { description: "List repository worktrees without changing them.", inputSchema: z.object({}).strict() }, async () => { requireRead(); return response(await repository.gitWorktrees()); }));
  register("engineering.git.log", "read", (name) => server.registerTool(name, { description: "Read bounded Git commit history without diffs.", inputSchema: z.object({ limit: z.number().int().min(1).max(200).optional(), path: z.string().optional(), since: z.string().max(128).optional(), until: z.string().max(128).optional(), ref: z.string().max(256).optional() }).strict() }, async (input) => { requireRead(); return response(await repository.gitLog(input)); }));
  register("engineering.git.remote_compare", "read", (name) => server.registerTool(name, { description: "Compare local refs with an already-known remote ref without fetching.", inputSchema: z.object({ localRef: z.string().max(256).optional(), remoteRef: z.string().max(256).optional() }).strict() }, async (input) => { requireRead(); return response(await repository.gitRemoteCompare(input)); }));
  register("engineering.git.inspect_commit", "read", (name) => server.registerTool(name, { description: "Inspect one Git commit read-only. Modes: meta (commit metadata + parents with merge flag), stat (metadata + changed files with per-file status/additions/deletions + aggregate stat), patch (stat plus a bounded patch, default 32KB, maxPatchBytes honored, truncated honest) and file (historical content of one path at the ref, with a deterministic and safe path filter). Git history passes the sensitive-content gate; ref injection is denied; no mutation is possible.", inputSchema: z.object({ ref: z.string().min(1).max(256), mode: z.enum(["meta", "stat", "patch", "file"]), path: z.string().max(512).optional(), maxPatchBytes: z.number().int().min(256).max(131072).optional() }).strict() }, async (input) => { requireRead(); return response(await repository.gitInspectCommit(input)); }));
  register("engineering.git.inspect_changes", "read", (name) => server.registerTool(name, { description: "Inspect working-tree/index changes read-only: worktree identity (toplevel, gitCommonDir, linkedWorktree - .git is never assumed to be a directory), branch/HEAD/detached/dirty state, staged, unstaged, untracked, conflicted, changedFiles and numstat stat (untracked counted separately). Patch is returned ONLY on demand via includePatch (bounded, default 32KB, truncated honest). No mutation is possible.", inputSchema: z.object({ base: z.string().max(256).optional(), includePatch: z.boolean().optional(), maxPatchBytes: z.number().int().min(256).max(131072).optional() }).strict() }, async (input) => { requireRead(); return response(await repository.gitInspectChanges(input)); }));
  // FASE 2: GitHub read-only super tool — the LIVE answer for remote refs. Compare,
  // commits, branches, PRs, Actions, tags/releases, file content and rate limit
  // come straight from the GitHub REST API; git.remote_compare stays for LOCAL
  // ref state but is honestly stale (freshness field) — see repository.ts.
  register("engineering.github.read", "read", (name) => server.registerTool(name, {
    description: "GitHub read-only super tool (10 operations, GET-only by construction): compare (live ahead/behind between two refs ON GitHub — the live answer git.remote_compare cannot give), get_commit (meta/stat; bounded patch only under includePatch), list_commits (since ISO date or sinceSha range), get_branch_head, get_repo, get_pr (state/mergeable; reviews and checks on demand), list_action_runs, list_refs (tags|releases), get_file (text at a ref; house sensitive-path denylist + sensitive-content gate; refuses >maxBytes, binary and >1MB), get_rate_limit (free meter). Credential: operator-issued fine-grained PAT (read-only) via GITHUB_TOKEN or GITHUB_TOKEN_FILE, never returned or logged; repo allowlisted via ENG_MCP_GITHUB_REPO. Rate protection: quota block on every response, TTL cache, local floor guard (GITHUB_RATE_LIMIT_LOW). Fail-closed typed errors: GITHUB_CREDENTIAL_MISSING, GITHUB_AUTH_REJECTED, GITHUB_FORBIDDEN, GITHUB_NOT_FOUND (GitHub returns 404 for private/inaccessible repos by design), GITHUB_VALIDATION_FAILED, GITHUB_RATE_LIMIT_EXCEEDED, GITHUB_RATE_LIMIT_LOW, GITHUB_TIMEOUT, GITHUB_UNREACHABLE, GITHUB_FILE_TOO_LARGE, GITHUB_FILE_BINARY. Requires bearer scope engineering:github:read (operator-issued; the agent cannot self-authorize).",
    inputSchema: githubReadInputSchema
  }, async (input) => { requireRead(); requireGithubRead(); return response(await runGithubRead(input)); }));
  // JUDGE-01: engineering.judge.verify / engineering.judge.evaluate — calibrated judgment (Jev via OpenRouter) as read-only governed tools (github.read pattern: no PLAN, no retries, no global state). Operator-issued judge-read scope gates both; credential is file-only with sha16-only provenance; state/evidence are sanitized before the provider sees them; provider failures are structured and retried never; a judgment is never fabricated. The response envelope always carries the ADVISORY line.
  register("engineering.judge.verify", "read", (name) => server.registerTool(name, { description: "Verify mission-report claims against evidence with calibrated probabilities (Jev via OpenRouter) under a closed-world rubric. Per claim: supported/contradicted/not_addressed/uncertain with probability and full distribution; aggregate ALL_SUPPORTED/HAS_CONTRADICTIONS/MIXED/UNCERTAIN at threshold 0.6. Evidence is sanitized before the provider call (evidence may leave, credentials never); provider failures are structured and retried never; a judgment is never fabricated. Audit line in /data/audit/judge.jsonl (ts, tool, n_claims, verdict, model, usage, latency_ms, authorizerHash16, contentHash16 — metadata and hashes only, never state/evidence content). ADVISORY — calibrated judgment is not a security boundary; operator approval decides.", inputSchema: judgeVerifyInputSchema }, async (input) => { requireRead(); requireJudgeRead(); return response(await runJudgeVerify(input, { ...defaultJudgeDeps(), authorizerHash16: subject.tokenHash16 })); }));
  register("engineering.judge.evaluate", "read", (name) => server.registerTool(name, { description: "Typed decision triage with calibrated probabilities (Jev via OpenRouter). questions typed noul/choice/score, each with instructions and criteria; returns the full calibrated distribution per question (noul probability plus complement; choice argmax with probabilities and confidence; score expected index with normalizedScore and legend). State is sanitized before the provider call; provider failures are structured and retried never; a judgment is never fabricated. Audit line in /data/audit/judge.jsonl (ts, tool, n_claims, verdict, model, usage, latency_ms, authorizerHash16, contentHash16 — metadata and hashes only, never state/evidence content). ADVISORY — calibrated judgment is not a security boundary; operator approval decides.", inputSchema: judgeEvaluateInputSchema }, async (input) => { requireRead(); requireJudgeRead(); return response(await runJudgeEvaluate(input, { ...defaultJudgeDeps(), authorizerHash16: subject.tokenHash16 })); }));
  // IDS-01: advisory-only IDS; fail-safe triggers DESIGN-ONLY FASE 2.
  register("engineering.security.ids", "read", (name) => server.registerTool(name, {
    description: "IDS over the governance audit trails (git-fetch/merge/push, registry-grant, judge, tool-errors .jsonl): sliding window -> structured events; deterministic privilege-creep features per subject (grants+growth, first-time use, off-hours, mutual grants, 97e485f7 legacy detector via registry hash16 join);" +
    "one judge.evaluate per flagged subject; deterministic bands in code info<0.6<=warn<0.9<=critical. Advisory-only (it reports; it never pauses or revokes anything);" +
    "rigid fail-open (judge down -> raw features, verdict unavailable);" +
    "own audit ids.jsonl w/ calibration; periodic 1/h ~US$0.01/day; fail-safe DESIGN-ONLY FASE 2. Requires engineering:judge:read.",
    inputSchema: securityIdsInputSchema
  }, async (input) => { requireRead(); requireJudgeRead(); return response(await runSecurityIds(input, { authorizerHash16: subject.tokenHash16, callerSubject: subject.subject })); }));
  register("engineering.file.patch", "write", (name) => server.registerTool(name, { description: "Apply a version-checked structured patch to one allowed file. Zero-effect patches are refused (PATCH_NO_EFFECT); no-effect hunks in a partial patch are reported in warnings.", inputSchema: z.object({ path: z.string(), baseHash: z.string(), hunks: z.array(z.object({ startLine: z.number().int(), deleteLines: z.array(z.string()), insertLines: z.array(z.string()) })), expectedChangeCount: z.number().int().optional(), acknowledgeWrite: z.literal(true) }) }, async (input) => { requireRead(); requireWrite(); return response(await repository.patch(input)); }));
  register("engineering.file.create", "write", (name) => server.registerTool(name, { description: "Atomically create one allowed source file.", inputSchema: z.object({ path: z.string(), content: z.string(), acknowledgeWrite: z.literal(true) }) }, async (input) => { requireRead(); requireWrite(); return response(await repository.create(input)); }));
  register("engineering.test.run", "read", (name) => server.registerTool(name, { description: "Run one of the fixed, read-only ENG-MCP test profiles without accepting commands or arguments (no arbitrary command can ever be sent). file: one authorized test file, synchronous within the 110s budget. related: an explicit, already-resolved selection of at most 10 test files, synchronous. suite/full/integration: the whole suite as a PERSISTED async job on the official release runner - the call returns immediately with {executionId, status RUNNING} and the result is read back via engineering.test.status, surviving MCP client disconnects (the runner persists release-state.json). Every run writes an atomic persisted job record (status, counters, failure class); INFRASTRUCTURE_ERROR is never a test verdict and never increments failed counters; full logs stay on disk, bounded failure summaries only.", inputSchema: z.object({ mode: z.enum(["file", "related", "suite", "full", "integration"]), path: z.string().max(512).optional(), paths: z.array(z.string().max(512)).min(1).max(10).optional(), timeoutMs: z.number().int().min(1).max(300_000).optional() }).strict() }, async (input) => { requireRead(); requireVerify(); if (input.mode === "suite" || input.mode === "full" || input.mode === "integration") return response(await startReleaseTestJob(input.mode === "integration" ? "full" : input.mode)); return response(await repository.testRun(subject.subject, input)); }));
  register("engineering.test.status", "read", (name) => server.registerTool(name, { description: "Read the persisted status of one test execution by executionId (TEST-01-W1 reconnect-safe readback). Read-only: RUNNING is a normal answer, never an error; unknown ids raise the typed TEST_JOB_NOT_FOUND; suite/full jobs are reconciled from the official runner persisted release-state.json even if every MCP client disconnected; sync orphans older than their timeout budget are marked INFRASTRUCTURE_ERROR (never a test verdict). Full logs are never returned - use outputLocation and the bounded failure summaries already on the job.", inputSchema: z.object({ executionId: z.string().min(8).max(128) }).strict() }, async (input) => { requireRead(); return response(await repository.testStatus(input)); }));
  register("engineering.lint.run", "read", (name) => server.registerTool(name, { description: "Run the host-configured ESLint verification without fixes.", inputSchema: z.object({}).strict() }, async () => { requireVerify(); return response(await repository.lint(subject.subject)); }));
  register("engineering.git.stage", "write", (name) => server.registerTool(name, { description: "Stage explicitly validated non-sensitive files.", inputSchema: z.object({ paths: z.array(z.string()).min(1).max(50), expectedHashes: z.record(z.string(), z.string()), acknowledgeStage: z.literal(true) }).strict() }, async (input) => { requireGit(); return response(await repository.gitStage(input)); }));
  register("engineering.git.unstage", "write", (name) => server.registerTool(name, { description: "Remove explicit paths from the Git index only.", inputSchema: z.object({ paths: z.array(z.string()).min(1).max(50), expectedIndexHash: z.string(), acknowledgeUnstage: z.literal(true) }).strict() }, async (input) => { requireGit(); return response(await repository.gitUnstage(input)); }));
  register("engineering.git.commit", "write", (name) => server.registerTool(name, { description: "Commit exactly the previously validated staged index.", inputSchema: z.object({ message: z.string(), expectedIndexHash: z.string(), acknowledgeCommit: z.literal(true) }).strict() }, async (input) => { requireGit(); return response(await repository.gitCommit(input)); }));
  // GIT-PUSH-01: governed push — default call is a read-only PLAN; a real push
  // requires approval.approved=true + acknowledgePush=true and re-runs the precheck fresh.
  register("engineering.git.push", "write", (name) => server.registerTool(name, {
    description: "Governed push of the authorized git repository to origin (GIT-PUSH-01). Default call is a read-only PLAN: branch (main only, MVP), local HEAD, LIVE remote head via github.read get_branch_head (never the stale refs/remotes/*), ahead/behind classification, pending commits, uncommitted counts, credential-store state (existence only - the credential content is never read) and blockers; zero mutation. execute=true requires approval.approved=true AND acknowledgePush=true, re-runs the full precheck fresh (TOCTOU) and pushes EXACTLY refs/heads/main:refs/heads/main - no --force, no --tags, no deletes, no refspec redirection; hooks always run (never --no-verify). Divergence (remote head absent locally) and non-fast-forward are BLOCKED with typed errors - reconciliation (fetch/rebase/merge) is operator work and is never attempted. The credential is the operator's git credential-store FILE mounted read-only (GIT_CREDENTIALS_FILE, default /run/secrets/git-credentials); no token/URL/remote/credential/refspec can ever be passed as input (strict schema; remote is always the repository's own origin; no token in argv - credential.helper is explicitly reset then pointed at the mounted store). Postcheck re-reads the branch head FRESH (cache-bypassing) and must equal the pushed sha (bounded retries); success is never taken from git stdout. Typed errors: PUSH_STATE_DIVERGED, PUSH_NON_FAST_FORWARD_BLOCKED, PUSH_NOTHING_TO_PUSH, PUSH_HEAD_MISMATCH, PUSH_CREDENTIAL_MISSING, PUSH_AUTH_REJECTED, PUSH_FORBIDDEN, PUSH_BRANCH_NOT_FOUND, PUSH_REMOTE_MISSING, PUSH_PRECHECK_UNAVAILABLE, PUSH_TIMEOUT, PUSH_EXECUTION_FAILED, PUSH_POSTCHECK_FAILED, PUSH_IN_FLIGHT, PUSH_APPROVAL_REQUIRED, PUSH_INPUT_FORBIDDEN. Requires bearer scope engineering:git:push (operator-issued; the agent cannot self-authorize).",
    inputSchema: z.object({ execute: z.boolean().optional(), approval: z.object({ approved: z.boolean() }).optional(), expectedHead: z.string().regex(/^[0-9a-f]{40}$/).optional(), acknowledgePush: z.literal(true).optional() }).strict()
  }, async (input) => { requireGitPush(); return response(await repository.gitPush(input, subject.subject)); }));

  // GIT-FETCH-01: governed read-only fetch — refreshes remote-tracking refs ONLY
  // and reports ahead/behind per compared branch; the reconciliation prerequisite
  // for git.push (quantify main vs origin/main divergence BEFORE any push decision).
  register("engineering.git.fetch", "read", (name) => server.registerTool(name, {
    description: "Governed READ-ONLY fetch of the authorized git repository (GIT-FETCH-01): runs EXACTLY ONE `git fetch --no-tags origin` - never merge/pull/checkout/rebase, no --prune, no refspec, zero caller input (strict empty schema; the remote is always the repository's own origin). Mutation boundary: remote-tracking refs (refs/remotes/origin/*) ONLY - the working tree, HEAD, local branches and tags are snapshot-compared before/after and ANY change fails closed (FETCH_LOCAL_STATE_MUTATED). Structured output: for every local branch with an origin counterpart (main always first, capped at 10) reports ahead, behind and divergent commit lists (short sha + subject, max 20 per side) plus remoteCommitDate, the remote-tracking ref diff {updated, added, removed} and zeroMutationProof {worktreeStatusIdentical, headUnchanged, localBranchAndTagRefsUnchanged}; the origin URL is NEVER returned (it may embed credentials - only the fixed remote name is). The credential is the operator's git credential-store FILE (GIT_CREDENTIALS_FILE, default /run/secrets/git-credentials) mounted read-only via the LoadCredential 3-link pattern; its content is never read by this tool (stat only) and the helper is explicitly reset in argv - no token ever reaches argv/env/logs. Immediate purpose: quantify main vs origin/main divergence as the prerequisite for a governed git.push. Typed errors: FETCH_INPUT_FORBIDDEN, FETCH_CREDENTIAL_MISSING, FETCH_REMOTE_MISSING, FETCH_AUTH_REJECTED, FETCH_FORBIDDEN, FETCH_NETWORK_UNREACHABLE, FETCH_TIMEOUT, FETCH_EXECUTION_FAILED, FETCH_BRANCH_NOT_FOUND, FETCH_LOCAL_STATE_MUTATED. Requires bearer scope engineering:git:fetch (operator-issued; the agent cannot self-authorize). Audit line in /data/audit/git-fetch.jsonl.",
    inputSchema: z.object({}).strict()
  }, async () => { requireRead(); requireGitFetch(); return response(await repository.gitFetch(subject.subject)); }));

  // GIT-MERGE-01: governed layered merge — the third leg of fetch → merge → push.
  // The layer is decided by the REAL repo state and never escalated beyond it:
  // AUTO_FF (strictly behind → git merge --ff-only, no merge commit), NATIVE
  // (divergent with DISJOINT changed paths → one automatic merge commit with a
  // deterministic message, post-validated by parents/tree sha/predicted-vs-actual
  // paths, restored via reset --hard on ANY postcheck failure), ASSISTED (any
  // overlapping path → NEVER executes, not even with approval — structured
  // conflict list + recommendation, zero mutation; a conflicting merge is an
  // operator decision). PLAN is the default and read-only; execution requires
  // execute=true + approval.approved=true + acknowledgeMerge=true; a non-main
  // branch requires passing `branch` explicitly and being checked out. Blockers
  // (uncommitted changes, detached HEAD, branch not checked out, missing
  // origin/<branch>) report BLOCKED and are never bypassed; NOTHING_TO_MERGE
  // covers 0/0 and ahead-only (recommending engineering.git.push). Zero mutation
  // outside the target is snapshot-proven (porcelain byte-identical, tags and all
  // other refs unchanged; HEAD moves only for a performed merge). Purely local:
  // no credential, no network, no origin URL in any output. Audit line in
  // /data/audit/git-merge.jsonl.
  register("engineering.git.merge", "write", (name) => server.registerTool(name, {
    description: "Governed layered merge of origin/<branch> into the checked-out branch (GIT-MERGE-01): the layer is decided by the real repo state and never escalated beyond it. LAYER 1 AUTO_FF: branch strictly behind origin → one `git merge --ff-only` fast-forward, no merge commit. LAYER 2 NATIVE: divergent (ahead>0 AND behind>0) with DISJOINT changed-path sets relative to the merge base → one automatic merge commit with a deterministic single-line message, post-validated by parents, tree sha, predicted-vs-actual changed paths and a clean porcelain; ANY postcheck failure restores the pre-merge head (git reset --hard) and reports RESTORED. LAYER 3 ASSISTED: any overlapping changed path (or unrelated histories) → the merge is NEVER executed, not even with approval - a structured conflict list (path + local/remote change kind + nature + recommendation) is returned and the call stops with zero mutation. Default call is a read-only PLAN. Execution requires execute=true AND approval.approved=true AND acknowledgeMerge=true; merging a branch other than main requires passing `branch` explicitly (the declaration itself) and that branch being checked out. Blockers (UNCOMMITTED_CHANGES, MERGE_DETACHED_HEAD, BRANCH_NOT_CHECKED_OUT, MERGE_REMOTE_REF_MISSING, MERGE_REPOSITORY_UNAVAILABLE) report status BLOCKED and are never bypassed; NOTHING_TO_MERGE covers both 0/0 and ahead-only (the latter recommends engineering.git.push). Zero mutation outside the target is snapshot-proven (zeroMutationProof: worktreeStatusIdentical, tagsUnchanged, otherRefsUnchanged, headUnchanged for non-mutating outcomes). Purely local: no credential, no network, no origin URL anywhere in the output. Typed errors: MERGE_INPUT_FORBIDDEN, MERGE_BLOCKED, MERGE_ACKNOWLEDGMENT_REQUIRED, MERGE_APPROVAL_REQUIRED, MERGE_EXECUTION_FAILED, MERGE_POSTCHECK_FAILED, MERGE_RESTORE_FAILED, MERGE_TIMEOUT. Requires bearer scope engineering:git:merge (operator-issued; the agent cannot self-authorize). Audit line in /data/audit/git-merge.jsonl.",
    inputSchema: z.object({
      branch: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/).optional(),
      execute: z.boolean().optional(),
      approval: z.object({ approved: z.boolean() }).optional(),
      acknowledgeMerge: z.literal(true).optional()
    }).strict()
  }, async (input) => { requireRead(); requireGitMerge(); return response(await repository.gitMerge(input, subject.subject)); }));

  // REGISTRY-GRANT-01: governed, grant-only scope edit of the token registry (the
  // anchor of trust). PLAN = exact entry diff, zero mutation; mutation requires
  // execute+approval and is atomic (automatic backup, tmp+fsync+rename, TOCTOU drift
  // check, post-validation with restore-on-failure). Self-grants refused; scopes
  // validated against the catalog; idempotent (NO_OP). Registry reloads only at boot:
  // the reload is one release.pipeline deploy, a declared separate step.
  register("engineering.registry.scope.grant", "write", (name) => server.registerTool(name, {
    description: "Governed grant-only scope edit of the token registry (REGISTRY-GRANT-01): PLAN returns the exact diff of the affected entry (entry index, scopesBefore -> scopesAfter, registry sha16 before/after, planned backup path) with zero mutation; mutation requires execute=true AND approval.approved=true (and acknowledgeGrant=true at schema level). Grant-only by construction: scopes are appended, never removed; tokenHash/expiresAt/revokedAt and every other entry are structurally unreachable; one entry per call; the subject must exist and be unambiguous; self-grant is refused both by subject and by the caller's own tokenHash16; target scopes are validated against the scope catalog (KNOWN_REGISTRY_SCOPES); idempotent (already-present scopes = NO_OP with zero writes). Execution is atomic: planned bytes validated with the SAME rules the boot loader enforces before anything touches the disk, automatic backup tokens.json.bak-registry-grant-<timestamp> (0600), same-directory temp + fsync + rename with source mode/owner preserved, TOCTOU drift re-check immediately before the rename, and ANY post-rename failure restores the backup bytes and reports RESTORED. Audit line in /data/audit/registry-grant.jsonl (target subject, scopes, authorizer subject + sha16, registry sha16s - the tool never sees raw bearer values). NOTE: the :8787 server reads the registry ONCE at boot - a grant takes effect on the next container boot only; the reload is one engineering.release.pipeline deploy, a declared separate step. Requires bearer scope engineering:registry:scope:grant (operator-issued; the agent cannot self-authorize).",
    inputSchema: registryScopeGrantInputSchema
  }, async (input) => { requireRead(); requireWrite(); requireRegistryScopeGrant(); return response(await runRegistryScopeGrant(input, { callerSubject: subject.subject, authorizerHash16: subject.tokenHash16 })); }));

  // MANIFEST-GOVERNED-EDIT-01: caminho governado bind/apply para os três manifests de
  // raiz (package.json, package-lock.json, Dockerfile). propose/refuse são não-mutantes;
  // apply exige approval artifact + fingerprint + escopo do kind armazenado. Os demais
  // caminhos HIGH_IMPACT mantêm o bloqueio total em policy.resolveWritable.
  register("engineering.manifest.edit", "write", (name) => server.registerTool(name, { description: "Governed bind/apply path for the three root manifests (package.json, package-lock.json, Dockerfile): propose returns the exact proposed diff with zero mutation, refuse permanently blocks the proposal, apply executes only after an explicit operator approval artifact with matching fingerprint and hash revalidated at mutation time.", inputSchema: manifestEditInputSchema }, async (input) => { requireRead(); return response(await runManifestEdit(input, { repository, repositoryId, scopes: { write: subject.scopes.includes("engineering:write"), git: subject.scopes.includes("engineering:git") } })); }));
  register("engineering.mcp.catalog", "read", (name) => server.registerTool(name, { description: "Return the deterministic catalog of tools exposed by this ENG-MCP server.", inputSchema: z.object({}).strict() }, async () => { requireRead(); return response(createToolCatalog(toolMetadata, repositoryId)); }));
  register("engineering.release.run", "write", (name) => server.registerTool(name, { description: "Run an allowlisted Release Pipeline V1 operation through the durable local runner.", inputSchema: z.object({ jobId: z.string().optional(), operation: z.enum(["deploy", "verify", "clean"]) }).strict() }, async (input) => { requireRead(); requireWrite(); return response(await repository.releaseRun(subject.subject, input)); }));
  register("engineering.release.pipeline", "write", (name) => server.registerTool(name, {
    description: "Run official test, build, candidate, deploy. Reconnect and resume with the returned deployJobId for bounded status polling and smoke. Never treats queued deployment as success.",
    inputSchema: z.object({ acknowledgeRelease: z.literal(true), deployJobId: z.string().regex(/^[a-f0-9-]{16,64}$/i).optional() }).strict()
  }, async (input) => {
    requireRead(); requireWrite(); requireRelease();
    const result = await runOfficialReleasePipeline(input.deployJobId);
    return { ...response(result), ...(!result.success && !("pending" in result) ? { isError: true } : {}) };
  }));

  // engineering.release.test - TEST-ONLY official runner operation (deploy-free MVP).
  // Hardcodes {"operation":"test"} through the same callReleaseRunner channel as
  // engineering.release.pipeline. Input is {} (strict): no operation, URL, socket
  // path, command, headers or tokens are accepted; build/candidate/deploy/rollback/
  // status/smoke can never be sent. The runner's official testAction may build the
  // ephemeral test image (official test mechanism, NOT a production deploy).
  // Guard set matches engineering.release.run (read+write); NO deploy capability
  // exists here (deploy remains exclusive to engineering.release.pipeline with
  // the engineering:release scope). No production mutation; never a release.
  register("engineering.release.test", "write", (name) => server.registerTool(name, {
    description: "Run ONLY the official test-only operation of the release runner (POST /v1/release {operation:'test'} over the official Unix socket, reusing the engineering.release.pipeline channel). Synchronous and deploy-free: the operation is hardcoded to 'test'; build/candidate/deploy/rollback/status/smoke can never be sent; no caller-supplied operation, URL, socket path, command or headers are accepted. The runner's official testAction may build the ephemeral test image (official test mechanism, not a production deploy). No production mutation; never triggers a release.",
    inputSchema: z.object({}).strict()
  }, async () => {
    requireRead();
    requireWrite();
    return response(await runReleaseTestOnly());
  }));
  register("engineering.orchestrate.batch", "read", (name) => server.registerTool(name, { description: "Execute multiple independent read operations concurrently to reduce Kilo latency. operations[].tool must use canonical engineering.* names: engineering.repo.structure, engineering.file.read, engineering.code.search, engineering.code.references, engineering.git.status, engineering.git.diff, engineering.deadcode.scan, engineering.parallelpath.scan, engineering.contract.verify, engineering.change.impact, engineering.git.branches, engineering.git.worktrees, engineering.git.log, engineering.git.remote_compare, engineering.git.inspect_commit, engineering.git.inspect_changes, engineering.mcp.catalog. Do not use client-specific prefixes or external names.", inputSchema: z.object({ operations: z.array(z.object({ tool: z.enum(["engineering.repo.structure", "engineering.file.read", "engineering.code.search", "engineering.code.references", "engineering.git.status", "engineering.git.diff", "engineering.deadcode.scan", "engineering.parallelpath.scan", "engineering.contract.verify", "engineering.change.impact", "engineering.git.branches", "engineering.git.worktrees", "engineering.git.log", "engineering.git.remote_compare", "engineering.git.inspect_commit", "engineering.git.inspect_changes", "engineering.mcp.catalog"]), arguments: z.record(z.string(), z.any()).optional() })).min(1).max(30) }).strict() }, async (input) => { requireRead(); return response(await repository.batchOrchestrate(subject.subject, input.operations, () => createToolCatalog(toolMetadata, repositoryId))); }));

  register("engineering.memory.context", "read", (name) => server.registerTool(name, {
    description: "Load the durable MemoryOS project context for an external engineering agent. Call this at the start of every meaningful engineering mission before investigating or changing code.",
    inputSchema: z.object({ projectId: z.string().max(200).optional(), limit: z.number().int().min(1).max(100).optional() }).strict()
  }, async (input) => {
    requireRead();
    return response(await agentMemory.call("context", { projectId: input.projectId ?? repositoryId, limit: input.limit }));
  }));

  register("engineering.memory.search", "read", (name) => server.registerTool(name, {
    description: "Search durable MemoryOS project memory when the user asks about previous work, decisions, bugs, solutions, or historical context. MEMORY-DEDUPE-01: rerank=true optionally reorders the top 10 rows by judge-scored relevance (fail-open: judge unavailable returns the original order).",
    inputSchema: z.object({ query: z.string().min(1).max(2000), projectId: z.string().max(200).optional(), limit: z.number().int().min(1).max(50).optional(), rerank: z.boolean().optional() }).strict()
  }, async (input) => {
    requireRead();
    const searchResult = await agentMemory.call("search", { query: input.query, projectId: input.projectId ?? repositoryId, limit: input.limit });
    if (!input.rerank) return response(searchResult);
    const reranked = await rerankSearchPayload(input.query, searchResult, { authorizerHash16: subject.tokenHash16 });
    return response({ ...(reranked.payload as Record<string, unknown>), rerank: reranked.rerank });
  }));

  register("engineering.memory.capture", "write", (name) => server.registerTool(name, {
    description: "Persist a durable MemoryOS mission summary after every completed meaningful engineering mission. Capture decisions, root causes, fixes, validation and next steps; do not call for acknowledgements, small talk, or trivial 'continue' turns. MEMORY-GATE-01: every capture passes an admission gate BEFORE the KB bridge — cheap dedupe + calibrated Jev screen; admission embeds a [MEMORYGATE:...] score tag in the stored summary; refusals return a didactic reason (rewrite and re-send); operator override via force=true (audit-marked); judge unavailable fails open (verdict unavailable).",
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
      nextSteps: z.array(z.string().max(1000)).max(30).optional(),
      force: z.boolean().optional()
    }).strict()
  }, async (input) => {
    requireWrite();
    const pid = input.projectId ?? repositoryId;
    const agentName = input.agent ?? subject.subject;
    // MEMORY-GATE-01: triage BEFORE the bridge — dedupe + calibrated Jev screen;
    // refusal returns to the caller (who captures rewrites and re-sends); the judge
    // never edits or deletes anything. recentContext feeds the cheap dedupe.
    const gate = await gateCapture(input, {
      projectId: pid,
      agent: agentName,
      authorizerHash16: subject.tokenHash16,
      recentContext: () => agentMemory.call("context", { projectId: pid, limit: 20 })
    });
    if (!gate.ok) {
      emitGateAudit(gate, null, { projectId: pid });
      throw new Error(gate.refusalMessage ?? "MEMORY_GATE_REFUSED");
    }
    const captured = await agentMemory.call("capture", {
      summary: gate.taggedSummary,
      projectId: pid,
      agent: agentName,
      userPrompt: input.userPrompt,
      outcome: input.outcome,
      decisions: input.decisions,
      problems: input.problems,
      solutions: input.solutions,
      tests: input.tests,
      files: input.files,
      nextSteps: input.nextSteps
    }) as { stored?: boolean; memoryId?: string } & Record<string, unknown>;
    emitGateAudit(gate, typeof captured.memoryId === "string" ? captured.memoryId : null, { projectId: pid });
    return response({
      ...captured,
      gate: { score: gate.score, band: gate.band, verdict: gate.verdict, reasons: gate.reasons, tag: gate.tag }
    });
  }));

  // MEMORY-DEDUPE-01: read-only interior scan — pairs are judged, never deleted or edited;
  // the report is the operator's approval list; periodic mode is rate-limited (1/day/project).
  register("engineering.memory.dedupe.scan", "read", (name) => server.registerTool(name, {
    description: "MEMORY-DEDUPE-01: read-only semantic dedupe scan over the MemoryOS KB - cheaply pairs candidate records (same normalized hash/prefix or shared mission slug) and judges each pair with the calibrated judge (duplicate? conflict? obsolete? which record is more complete?). NEVER deletes or edits anything: the report is the operator's approval list and flagged pairs carry advisory [DEDUPE-CANDIDATE]/[CONFLICT] tags. mode 'periodic' is rate-limited to one scan per 24h per project (MEMORY_DEDUPE_RATE_LIMIT); 'ondemand' is unlimited; dryRun lists candidates without judging. Fail-open: judge unavailable -> report with verdict unavailable, zero crash. Audit: /data/audit/memory-dedupe.jsonl (metadata + hashes only, never memory content).",
    inputSchema: z.object({
      projectId: z.string().max(200).optional(),
      mode: z.enum(["ondemand", "periodic"]).optional(),
      maxPairs: z.number().int().min(1).max(50).optional(),
      dryRun: z.boolean().optional()
    }).strict()
  }, async (input) => {
    requireRead();
    const pid = input.projectId ?? repositoryId;
    return response(await dedupeScan(input, {
      projectId: pid,
      authorizerHash16: subject.tokenHash16,
      recentContext: () => agentMemory.call("context", { projectId: pid, limit: 50 })
    }));
  }));

  register("engineering.memoryos.sync_files", "write", (name) => server.registerTool(name, {
    description: "Synchronize a small explicit set of MemoryOS source files into a fixed /opt/memoryos/src/lib/** allowlist with backup-before-replace and post-write hash verification. Narrow channel only; not a generic file write.",
    inputSchema: z.object({
      files: z.array(z.object({ path: z.string().min(1).max(512), content: z.string().max(131_072) })).min(1).max(10),
      acknowledgeSync: z.literal(true)
    }).strict()
  }, async (input) => {
    requireWrite();
    return response(await repository.syncFiles(input));
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

  // Controlled HTTP diagnostic probe: allowlisted target only, GET/POST only,
  // bounded response, credentialRef resolved server-side, secrets never returned.
  register("engineering.runtime.http_probe", "write", (name) => server.registerTool(name, {
    description: "Run a bounded HTTP diagnostic probe against the allowlisted Base44 target (target 'base44'). Credential is resolved server-side via credentialRef (AGENT_MEMORY_MCP_SECRET) and never returned. GET/POST only, timeout capped at 30s, response size-capped and secret-redacted; redirects are never followed.",
    inputSchema: z.object({
      target: z.string().min(1).max(64),
      method: z.enum(["GET", "POST"]),
      path: z.string().min(1).max(256),
      body: z.record(z.string(), z.any()).optional(),
      credentialRef: z.string().min(1).max(64).optional(),
      credentialHeader: z.string().min(1).max(64).optional(),
      timeoutMs: z.number().int().min(1).max(30_000).optional()
    }).strict()
  }, async (input) => {
    requireRead();
    requireWrite();
    return response(await runHttpProbe(subject.subject, input));
  }));
  // engineering.vps.change.safe — controlled VPS change supertool (MVP):
  // allowlisted action 'redeploy_application' ONLY (single mutating primitive:
  // application-redeploy); deterministic PLAN -> PRE-CHECK -> RISK -> APPROVAL
  // GATE -> CHANGE -> VALIDATION -> RESULT flow; execute defaults to false
  // (plan-only); mutation requires execute=true AND approval.approved=true;
  // read-only pre/post checks; rollback unavailable (not proven); zero LLM;
  // no SSH/shell; no secrets or env values in results.
  register("engineering.vps.change.safe", "write", (name) => server.registerTool(name, {
    description: "Controlled VPS change supertool (MVP): allowlisted action 'redeploy_application' only, executed via the single mutating primitive application-redeploy. Deterministic PLAN -> PRE-CHECK -> RISK -> APPROVAL GATE -> CHANGE -> VALIDATION -> RESULT flow. execute defaults to false (plan-only); mutation requires execute=true AND approval.approved=true. Read-only pre/post checks; rollback unavailable (not proven); zero LLM; no SSH/shell; no secrets or env values in results. Requires bearer scope engineering:vps:application:redeploy (operator-issued; the agent cannot self-authorize).",
    inputSchema: z.object({
      action: z.literal("redeploy_application"),
      target: z.object({ applicationId: z.string().min(1).optional(), applicationName: z.string().min(1).optional() }).strict(),
      execute: z.boolean().optional(),
      approval: z.object({ approved: z.boolean() }).strict().optional(),
      validation: z.object({ externalHealth: z.boolean().optional() }).strict().optional()
    }).strict()
  }, async (input) => {
    requireRead();
    requireWrite();
    requireVpsChangeSafe();
    return response(await runVpsChangeSafe(subject.subject, input));
  }));
  // engineering.vps.runner.restart — controlled restart supertool for the official
  // release runner service (eng-mcp-release-runner.service), the ONLY long-lived
  // service this server may recycle. Zero raw shell/SSH/systemctl: the mutation is
  // the runner's OWN governed "restart" operation over the official Unix socket
  // channel (the runner drains, persists a restart-intent snapshot and self-exits
  // with protocol code 42; the systemd supervisor recycles it and the next boot's
  // recover() completes the intent). PLAN mode (execute defaults to false) is
  // read-only. Mutation requires execute=true AND approval.approved=true;
  // 202/accepted is NEVER RESTARTED: bounded status polling requires ALL five
  // criteria (runner reachable, pid changed, lastRestartId match, lastRestartOutcome
  // completed, zero orphaned jobs); exhaustion -> UNKNOWN/pending with the durable
  // restartId; non-202 -> NOT_RESTARTED with the runner's own blockers. No LLM;
  // no SSH/shell; nothing caller-controlled reaches the request body.
  register("engineering.vps.runner.restart", "write", (name) => server.registerTool(name, {
    description: "Controlled restart supertool for the official release runner service (eng-mcp-release-runner.service): zero raw shell/SSH/systemctl — the mutation is the runner's OWN governed restart operation over the official Unix socket channel (the runner drains, persists a restart-intent snapshot and self-exits with protocol code 42; the systemd supervisor recycles it and the next boot completes the intent). PLAN mode (execute defaults to false) is read-only. Mutation requires execute=true AND approval.approved=true. 202/accepted is NEVER RESTARTED: bounded status polling requires ALL five postcheck criteria (runner reachable, pid changed, lastRestartId match, lastRestartOutcome completed, zero orphaned jobs); exhaustion -> UNKNOWN/pending with the durable restartId; non-202 -> NOT_RESTARTED with the runner's own blockers. No LLM; no SSH/shell; nothing caller-controlled reaches the request body. Requires bearer scope engineering:vps:runner:restart (operator-issued; the agent cannot self-authorize).",
    inputSchema: vpsRunnerRestartInputSchema
  }, async (input) => {
    requireRead();
    requireWrite();
    requireVpsRunnerRestart();
    return response(await runVpsRunnerRestart(input, {
      runRunner: callReleaseRunner,
      readCatalog: async () => {
        const catalog = createToolCatalog(toolMetadata, repositoryId);
        return { catalogHash: catalog.catalogHash, catalogVersion: catalog.catalogVersion, toolCount: catalog.actualToolCount };
      }
    }));
  }));

  // ITEM-3: engineering.vps.diagnostics — read-only host diagnostics for the
  // official release runner service (the frozen allowlist's only entry).
  // view=unit returns effective systemd directives (Restart, SuccessExitStatus,
  // RestartForceExitStatus, NoNewPrivileges, ProtectSystem — systemctl show
  // merges the operator drop-in) plus service/process/runner evidence and a
  // cross-check against the runner's self-reported parsed unit; view=journal
  // returns sanitized journal lines; view=docker returns a fixed-column
  // docker ps -a inventory. Zero mutation, frozen allowlist, dual-layer
  // redaction (pipeline sanitizeSecrets + redactSensitive);
  // environmentValuesReturned stays false by construction. Requires bearer
  // scope engineering:vps:diagnostics:read (operator-issued; the agent cannot
  // self-authorize).
  register("engineering.vps.diagnostics", "read", (name) => server.registerTool(name, {
    description: "Read-only host diagnostics for the official release runner service (eng-mcp-release-runner.service, the frozen allowlist's only entry). view=unit: effective systemd directives (Restart, SuccessExitStatus, RestartForceExitStatus, NoNewPrivileges, ProtectSystem) + service/process/runner evidence + cross-check vs the runner's self-reported unit; view=journal: sanitized journal lines; view=docker: fixed-column docker ps -a inventory. Zero mutation; dual-layer redaction (pipeline sanitizeSecrets + key-based redactSensitive); environmentValuesReturned always false. Requires bearer scope engineering:vps:diagnostics:read (operator-issued; the agent cannot self-authorize).",
    inputSchema: vpsDiagnosticsInputSchema
  }, async (input) => {
    requireRead();
    requireVpsDiagnosticsRead();
    return response(await runVpsDiagnostics(input, { runRunner: callReleaseRunner }));
  }));
  // ITEM-2: engineering.vps.container.probe — one-off READ-ONLY inspection of a
  // candidate container's filesystem, spawned fresh by the release runner from a
  // LOCAL allowlisted image (prefix eng-mcp-candidate:, no pull ever happens).
  // Exactly 3 probes (file_stat/read_text/list_dir); the docker argv is fully
  // determined by the frozen PROBE_SPECS table + PROBE_ISOLATION flags
  // (--network none, --read-only, uid 65534, --cap-drop ALL, memory/pids caps)
  // and spawned with shell:false — no caller field ever reaches docker beyond
  // {image, probe, path, maxBytes}. Dual redaction (pipeline sanitizeSecrets +
  // key-based redactSensitive); append-only probes.jsonl audit (last 50).
  // Requires bearer scope engineering:vps:container:probe (operator-issued; the
  // agent cannot self-authorize).
  register("engineering.vps.container.probe", "read", (name) => server.registerTool(name, {
    description: "One-off read-only filesystem probe inside a LOCAL allowlisted candidate container image (prefix eng-mcp-candidate:; the image is never pulled — a missing local image fails closed). Exactly 3 probes: file_stat (ls -ld), read_text (head -c maxBytes, binary content is refused with stdout withheld), list_dir (ls -la). The docker argv is fully determined by the frozen PROBE_SPECS table + PROBE_ISOLATION flags (--network none, --read-only, uid 65534, --cap-drop ALL, memory/pids caps) and spawned with shell:false; no caller field reaches docker beyond {image, probe, path, maxBytes}. Path grammar + sensitive-path denylist on both mirrors; 30s hard timeout with proven container cleanup; dual redaction (pipeline sanitizeSecrets + key-based redactSensitive); append-only probes.jsonl audit keeps the last 50 probes. Requires bearer scope engineering:vps:container:probe (operator-issued; the agent cannot self-authorize).",
    inputSchema: vpsContainerProbeInputSchema
  }, async (input) => {
    requireRead();
    requireVpsContainerProbe();
    return response(await runVpsContainerProbe(input, { runRunner: callReleaseRunner }));
  }));

  // VPS-SECRET-WRITE-01: engineering.vps.secret.write — governed credential-file
  // writer for the VPS filesystem. The secret value is NEVER an input field: it is
  // read server-side from an operator-staged owner-only file under the staging
  // prefix (/data/.staging-secret-*) or from a named env var — channels `ps aux`
  // cannot observe (`docker run -e K=V` argv IS ps-visible and stays banned for
  // secrets). Atomic same-directory temp+fsync+rename, mode forced 0o600, owner
  // forced to the target directory's uid/gid, symlinks refused anywhere in the
  // target chain, allowlist = /data/credentials/* + /data/tokens.json, empty
  // values refused. Byte-identical rewrite = NO_OP with zero mutation (full sha256
  // compare; only the 16-hex prefix is reported). PLAN mode is read-only; mutation
  // requires execute=true AND approval.approved=true AND acknowledgeWrite=true.
  // Requires bearer scope engineering:vps:secret:write (operator-issued).
  register("engineering.vps.secret.write", "write", (name) => server.registerTool(name, {
    description: "Governed VPS credential-file writer: creates/updates a credential FILE atomically (same-directory temp + fsync + rename), forcing mode 0600 and the target directory's owner, refusing symlinks anywhere in the target chain, non-regular targets, paths outside the credential allowlist (/data/credentials/* or /data/tokens.json), and empty values. The secret value is NEVER an input field — it is read server-side from an operator-staged 0600 file under /data/.staging-secret-* or from a named env var; values never appear in payloads, errors, logs or process arguments. Byte-identical rewrite is a reported NO_OP with zero mutation (full sha256 compare; only the 16-hex prefix is reported). PLAN mode (execute defaults to false) is read-only; mutation requires execute=true AND approval.approved=true AND acknowledgeWrite=true. No LLM; no SSH/shell. Requires bearer scope engineering:vps:secret:write (operator-issued; the agent cannot self-authorize).",
    inputSchema: vpsSecretWriteInputSchema
  }, async (input) => {
    requireRead();
    requireWrite();
    requireVpsSecretWrite();
    return response(await runVpsSecretWrite(input));
  }));
  // engineering.vps.systemd.credential — UNIT-CREDENTIAL-01: governed systemd
  // LoadCredential= drop-in registrar over the official runner socket. Writes
  // /etc/systemd/system/<unit>.d/credentials.conf (0644) — never edits the base
  // unit, never uses Environment= and never restarts a service; critical units
  // get a restart-required note pointing at engineering.vps.runner.restart.
  // Credential values never cross the boundary (path/perms/size/sha256-16 only).
  register("engineering.vps.systemd.credential", "write", (name) => server.registerTool(name, {
    description: "Governed systemd LoadCredential drop-in registrar (UNIT-CREDENTIAL-01): writes /etc/systemd/system/<unit>.d/credentials.conf (0644, atomic temp+fsync+rename) with LoadCredential=<unitPath>:<credential file> — never edits the base unit, never uses Environment= and NEVER restarts a service. PLAN mode (execute defaults to false) is zero-write and reports the unit, credential evidence (path/perms/size/sha256-16 only — the value is never returned), the drop-in path, the desired line and the resulting diff; systemd-analyze verify runs against the unit before any write and again after, with fail-closed rollback BEFORE daemon-reload on any failure. Mutation requires execute=true AND approval.approved=true, then runs systemctl daemon-reload. Byte-identical re-execute is a reported NO_OP with zero mutation (mtime preserved, no daemon-reload). Critical units (eng-mcp-release-runner.service) get a restart-required note — restart is engineering.vps.runner.restart's job. No LLM; no SSH/shell. Requires bearer scope engineering:vps:systemd:credential (operator-issued; the agent cannot self-authorize).",
    inputSchema: vpsSystemdCredentialInputSchema
  }, async (input) => {
    requireRead();
    requireWrite();
    requireVpsSystemdCredential();
    return response(await runVpsSystemdCredential(input, { runRunner: callReleaseRunner }));
  }));
  // engineering.vps.doctor — READ-ONLY diagnostic supertool (MVP): deterministic
  // server + Swarm/node + application + deployment/queue + monitoring/logs
  // diagnostics using ONLY confirmed Dokploy READ primitives (server-all,
  // cluster-getNodes, application-*, deployment-*); zero mutation (no
  // execute/approval input exists); essential upstream failures -> UNKNOWN,
  // never invented health; no LLM, no SSH/shell; no secrets in results.
  register("engineering.vps.doctor", "read", (name) => server.registerTool(name, {
    description: "READ-ONLY diagnostic supertool for Dokploy-managed VPS/apps: deterministic server + Swarm/node + application + deployment/queue + monitoring/logs diagnostics over the confirmed READ primitives (server-all, cluster-getNodes, application-search/one/readLogs/readAppMonitoring, deployment-all/allCentralized/queueList). Zero mutation (no execute/approval input exists); essential upstream failures surface as UNKNOWN, never invented health; no LLM, no SSH/shell; no secrets in results.",
    inputSchema: z.object({
      serverId: z.string().min(1).max(200).optional(),
      applicationId: z.string().min(1).max(200).optional(),
      applicationName: z.string().min(1).max(200).optional()
    }).strict()
  }, async (input) => {
    requireRead();
    return response(await runVpsDoctor(subject.subject, input));
  }));
  // engineering.vps.reconcile — READ-ONLY drift detection supertool (MVP):
  // EXPECTED = release-state.json written by the release runner only; ACTUAL =
  // internal tool catalog (computed here via createToolCatalog over the
  // registered tools) and optional container inspection (not injected in this
  // MVP, so it stays unavailable). Absence of evidence is NEVER drift:
  // undeterminable comparisons stay UNKNOWN and never produce a mismatch
  // finding. Zero mutation (no execute/approval input exists); no LLM; no
  // SSH/shell; no Dokploy changes; never writes release-state.json.
  register("engineering.vps.reconcile", "read", (name) => server.registerTool(name, {
    description: "READ-ONLY drift detection supertool (MVP): compares the release runner's release-state.json (expected) against actually evidenced state (actual: internal tool catalog hash/version/toolCount; container inspection when injected by the host, else unavailable). Absence of evidence is NEVER drift - undeterminable comparisons return UNKNOWN, never a mismatch finding. Zero mutation (no execute/approval input exists); no LLM; no SSH/shell; no Dokploy changes; never writes release-state.json.",
    inputSchema: z.object({}).strict()
  }, async () => {
    requireRead();
    const actualCatalog = createToolCatalog(toolMetadata, repositoryId);
    return response(await runVpsReconcile({
      readCatalog: async () => ({ catalogHash: actualCatalog.catalogHash, catalogVersion: actualCatalog.catalogVersion, toolCount: actualCatalog.actualToolCount })
    }));
  }));
  // engineering.vps.recover — controlled official-rollback recovery supertool (MVP):
  // PLAN mode (execute defaults to false) is fully read-only and deterministically
  // reuses engineering.vps.reconcile + the release-state last-known-good evidence.
  // The ONLY mutable operation is the official release runner rollback, hardcoded
  // over the official Unix socket channel (callReleaseRunner); the caller can never
  // choose operation/target/applicationId/toolName/command/shell/URL/socket/headers/
  // token/image/container (strict { execute?, approval? } input). Mutation requires
  // execute=true AND approval.approved=true, reconcile=DRIFTED, last-known-good
  // present and no incompatible job in progress. 202/queued is NEVER RECOVERED:
  // bounded official job status polling returns UNKNOWN/pending with the jobId.
  // Post-validation: official smoke (which re-syncs the release-state production
  // fields left stale by rollbackAction), live catalog and a fresh reconcile —
  // RECOVERED only with full evidence, NOT_RECOVERED on failed validation, UNKNOWN
  // on insufficient evidence. No LLM; no SSH/shell; no new executor/gateway.
  register("engineering.vps.recover", "write", (name) => server.registerTool(name, {
    description: "Controlled official-rollback recovery supertool for ENG-MCP (MVP): PLAN mode (execute defaults to false) is read-only and deterministically reuses engineering.vps.reconcile plus the release-state last-known-good evidence; the only mutable operation is the official release runner rollback, hardcoded over the official Unix socket channel (the caller can never choose operation, target, applicationId, toolName, command, shell, URL, socket, headers, token, image or container). Mutation requires execute=true AND approval.approved=true, reconcile=DRIFTED, last-known-good present and no incompatible job in progress. 202/queued is NEVER RECOVERED: bounded official job status polling returns UNKNOWN/pending with the durable jobId. Post-validation runs the official smoke (which re-syncs the release-state production fields left stale by rollbackAction), reads the live catalog and re-runs reconcile: RECOVERED only with full evidence, NOT_RECOVERED on failed validation, UNKNOWN on insufficient evidence. No LLM; no SSH/shell; no new executor/gateway.",
    inputSchema: vpsRecoverInputSchema
  }, async (input) => {
    requireRead();
    requireWrite();
    requireRelease();
    return response(await runVpsRecover(input, {
      runRunner: callReleaseRunner,
      readCatalog: async () => {
        const catalog = createToolCatalog(toolMetadata, repositoryId);
        return { catalogHash: catalog.catalogHash, catalogVersion: catalog.catalogVersion, toolCount: catalog.actualToolCount };
      }
    }));
  }));
  // engineering.vps.guardian v2 — coordinator/classifier supertool with CONTROLLED
  // write mode: default ({}) stays fully read-only (classification only, exactly
  // like v1). Mutation requires execute=true AND approval.approved=true and even
  // then Guardian executes ONLY the action the deterministic classification
  // recommended: RECOVER via runVpsRecover({execute:true, approval:{approved:true}})
  // (official rollback; Recover keeps its own gates) or CHANGE_SAFE via
  // runVpsChangeSafe with the action hardcoded 'redeploy_application' and the
  // applicationId resolved ONLY from Doctor's own evidence — never caller-supplied,
  // never invented; unresolved applicationId -> BLOCKED. NONE/INVESTIGATE/BLOCKED/
  // UNKNOWN never mutate. Post-validation re-runs doctor + reconcile after any
  // mutation attempt; "action accepted" is never counted as final success. Access
  // is 'write' because Guardian CAN mutate when authorized (gates mirror recover).
  register("engineering.vps.guardian", "write", (name) => server.registerTool(name, {
    description: "Coordinator/classifier supertool with CONTROLLED write mode (v2): default {} stays fully read-only — deterministically composes engineering.vps.doctor (always) and engineering.vps.reconcile (always), plus engineering.vps.recover STRICTLY in PLAN mode (input exactly {}, only when reconcile=DRIFTED) into one conservative answer: status HEALTHY|DEGRADED|CRITICAL|DRIFTED|UNKNOWN (precedence UNKNOWN > CRITICAL > DRIFTED > DEGRADED > HEALTHY) with recommendedAction NONE|INVESTIGATE|RECOVER|CHANGE_SAFE|BLOCKED. Mutation ONLY with execute=true AND approval.approved=true, and ONLY the recommended action: RECOVER via runVpsRecover (official rollback, Recover keeps its own gates) or CHANGE_SAFE via runVpsChangeSafe (action hardcoded redeploy_application; applicationId resolved ONLY from Doctor's own evidence, never caller-supplied — unresolved applicationId blocks). NONE/INVESTIGATE/BLOCKED/UNKNOWN never mutate. Post-validation re-runs doctor + reconcile after any mutation attempt; accepted/pending is never counted as final success. No LLM, no memory, no scheduler, no watch loop, no new framework.",
    inputSchema: guardianInputSchema
  }, async (input) => {
    requireRead();
    requireWrite();
    requireRelease();
    // ITEM-0 SCOPE GAP: the guardian reaches the SAME runVpsChangeSafe mutation
    // internally - without this conditional gate it would remain a side-door around
    // the change.safe scope. The condition is exact: runVpsGuardian only mutates with
    // execute=true AND approval.approved=true; read-only classification stays reachable.
    if (input?.execute === true && input?.approval?.approved === true) requireVpsChangeSafe();
    return response(await runVpsGuardian(input, {
      runDoctor: () => runVpsDoctor(subject.subject, {}),
      runReconcile: () => {
        const actualCatalog = createToolCatalog(toolMetadata, repositoryId);
        return runVpsReconcile({ readCatalog: async () => ({ catalogHash: actualCatalog.catalogHash, catalogVersion: actualCatalog.catalogVersion, toolCount: actualCatalog.actualToolCount }) });
      },
      runRecover: (recoverInput: unknown) => {
        const recoverCatalog = createToolCatalog(toolMetadata, repositoryId);
        return runVpsRecover(recoverInput, { runRunner: callReleaseRunner, readCatalog: async () => ({ catalogHash: recoverCatalog.catalogHash, catalogVersion: recoverCatalog.catalogVersion, toolCount: recoverCatalog.actualToolCount }) });
      },
      runChangeSafe: (changeInput: unknown) => runVpsChangeSafe(subject.subject, changeInput)
    }));
  }));
  // engineering.guardian.app.deploy — GCLOUD-01D SuperTool: governed composition
  // project snapshot -> detectNodeApp -> PLAN -> Guardian approval -> application-create
  // (single mutating boundary inside Guardian apply) -> application-deploy ->
  // application-one health -> application-domain -> LIVE + evidenced URL.
  // Reuses ONLY existing capabilities; no new deployment engine; env VALUES never
  // echoed (names + [REDACTED] only). LIVE requires create accepted + deploy ok +
  // health running + domain READY with https URL; otherwise honest intermediate
  // states (DEPLOYED_AWAITING_DOMAIN / DEPLOYING / FAILED / UNKNOWN).
  register("engineering.guardian.app.deploy", "write", (name) => server.registerTool(name, {
    description: "Governed Node application deploy SuperTool (GCLOUD-01D/01F): PLAN mode (execute defaults to false) runs the evidence-only Node detector over the caller-provided project snapshot and returns PLANNED/NEEDS_INPUT with ZERO transport calls. Execution (execute=true) is Guardian-gated: bind(action='create_application', approved===true) then the governed provisioning sequence INSIDE the Guardian mutating boundary — project/environment reuse-or-create (GCLOUD-01F: project-all/project-create + environment-byProjectId/environment-create; skipped when environmentId is provided), application-create, then git/build/env configuration (application-saveGitProvider/saveBuildType/saveEnvironment); OUTSIDE the boundary: ONE allowlisted application-deploy, read-only health (application-one) and domain evidence (application-domain). A documented multi-mutation sequence with partial-result points — never presented as one atomic mutation. LIVE only with full evidence (create accepted + config applied + deploy ok + applicationStatus running + domain READY https URL); pending domain -> DEPLOYED_AWAITING_DOMAIN with url:null (never invented). Env VALUES never appear in plan or output (names only). No new deployment engine; Guardian Core untouched.",
    inputSchema: z.object({
      name: z.string().min(1),
      source: z.string().min(1),
      environmentId: z.string().min(1).optional(),
      projectName: z.string().min(1).optional(),
      environmentName: z.string().min(1).optional(),
      branch: z.string().min(1).optional(),
      buildType: z.enum(["dockerfile", "heroku_buildpacks", "paketo_buildpacks", "nixpacks", "static", "railpack"]).optional(),
      serverId: z.string().min(1).optional(),
      projectSnapshot: z.object({
        packageJsonText: z.string().nullable().optional(),
        files: z.record(z.string(), z.string()).optional()
      }).optional(),
      env: z.record(z.string(), z.string()).optional(),
      approved: z.boolean().optional(),
      execute: z.boolean().optional()
    }).strict()
  }, async (input) => {
    requireRead();
    requireWrite();
    return response(await runGuardianAppDeploy(input, {
      // Host-provided transport: Guardian Cloud never self-wires operational values.
      transport: createMcpClientCallTransport({ dokployServerId: process.env.ENG_MCP_VPS_DOKPLOY_SERVER_ID ?? DOKPLOY_SERVER_ID_DEFAULT, endpoint: process.env.ENG_MCP_AGENT_MEMORY_ENDPOINT ?? DEFAULT_MEMORY_ENDPOINT }),
    }));
  }));
  // Engineering Simple Tools — first batch (SPRINT SIMPLE-TOOLS-01): three small,
  // specific, deterministic, 100% read-only tools that each answer ONE question by
  // thin composition over the certified read-only Doctor mechanism (one single
  // runVpsDoctor(subject, {}) pass). NOT supertools: no coordination, no rollback,
  // no change flow, no automatic action. Input is EXACTLY {} (strict) — any caller
  // key (execute, approval, target, applicationId, serverId, toolName, action,
  // command, shell, url, headers, token) is rejected before evidence collection.
  // Zero mutation, zero LLM, zero SSH/shell.
  register("engineering.vps.health", "read", (name) => server.registerTool(name, {
    description: "Simple read-only tool: answers 'Is my VPS healthy?' by running ONE deterministic read-only Doctor pass and projecting the certified classification (HEALTHY -> healthy=true, DEGRADED/CRITICAL -> healthy=false, UNKNOWN -> healthy=null). Input is exactly {} (strict); zero mutation, no LLM, no SSH/shell; never invents health; zero managed applications is informative, not a failure.",
    inputSchema: z.object({}).strict()
  }, async (input) => {
    requireRead();
    return response(await runVpsHealth(subject.subject, input));
  }));
  register("engineering.vps.why_down", "read", (name) => server.registerTool(name, {
    description: "Simple read-only tool: answers 'Why is my VPS or application having a problem?' by projecting the deterministic Doctor findings into one observable cause (first critical, else first warning) with the supporting read-only evidence; never invents a cause (cause=null when evidence is insufficient or status=UNKNOWN). Input is exactly {} (strict); zero mutation, no LLM, no SSH/shell; never triggers recovery, change or coordination flows.",
    inputSchema: z.object({}).strict()
  }, async (input) => {
    requireRead();
    return response(await runVpsWhyDown(subject.subject, input));
  }));
  register("engineering.deploy.status", "read", (name) => server.registerTool(name, {
    description: "Simple read-only tool: answers 'Is my deployment working?' by projecting the read-only Doctor deployment evidence (last deployment classification, in-flight count, queue depth) as OK/IN_FLIGHT/PENDING/FAILED/UNKNOWN; zero managed applications is reported informatively as NO_APPLICATIONS_MANAGED and is never treated as a VPS failure. Input is exactly {} (strict); zero mutation, never deploys/redeploys/recovers, no LLM, no SSH/shell.",
    inputSchema: z.object({}).strict()
  }, async (input) => {
    requireRead();
    return response(await runDeployStatus(subject.subject, input));
  }));
  // Engineering Simple Tools — second batch (SPRINT SIMPLE-TOOLS-02): same contract
  // as the first batch — small, deterministic, 100% read-only compositions over
  // EXISTING certified mechanisms (runVpsDoctor; release-state.json via the same
  // reader used by engineering.vps.reconcile). Input is EXACTLY {} (strict); zero
  // mutation, zero LLM, zero SSH/shell; nothing invented; no arbitrary target.
  register("engineering.vps.capacity", "read", (name) => server.registerTool(name, {
    description: "Simple read-only tool: answers 'Is my VPS close to its limits?' by projecting ONLY existing read-only capacity evidence from the certified Doctor pass (capacity-related findings: disk/memory/cpu/storage/pressure; monitoring availability) into OK/PRESSURE/CRITICAL/UNKNOWN. Missing evidence -> UNKNOWN; no metrics are invented, no agent is installed, no new monitoring is created. Input is exactly {} (strict); zero mutation, no LLM, no SSH/shell.",
    inputSchema: z.object({}).strict()
  }, async (input) => {
    requireRead();
    return response(await runVpsCapacity(subject.subject, input));
  }));
  register("engineering.vps.what_changed", "read", (name) => server.registerTool(name, {
    description: "Simple read-only tool: answers 'What changed recently?' using ONLY the existing authorized release-state.json source (the same file the certified reconcile reads): compares the current release against the recorded previous release into CHANGED/NO_CHANGE/UNKNOWN with short evidence. No git substitution, no new timeline, no new storage; insufficient state -> UNKNOWN and nothing is invented. Input is exactly {} (strict); zero mutation, no LLM, no SSH/shell.",
    inputSchema: z.object({}).strict()
  }, async (input) => {
    requireRead();
    return response(await runVpsWhatChanged(subject.subject, input));
  }));
  register("engineering.app.health", "read", (name) => server.registerTool(name, {
    description: "Simple read-only tool: answers 'Is my application working?' by projecting the certified Doctor application evidence (deterministic single-application selection; no arbitrary target) into HEALTHY/DEGRADED/CRITICAL/UNKNOWN, with informative NO_APPLICATION when zero managed applications exist. Never restarts, redeploys or repairs. Input is exactly {} (strict); zero mutation, no LLM, no SSH/shell.",
    inputSchema: z.object({}).strict()
  }, async (input) => {
    requireRead();
    return response(await runAppHealth(subject.subject, input));
  }));

  // Engineering Simple Tools — third batch (SPRINT SIMPLE-TOOLS-03): closes the
  // initial catalog at 10 Simple Tools. Same contract as the first two batches:
  // deterministic read-only compositions over existing certified mechanisms (Doctor;
  // Reconcile wired with the live tool catalog exactly like engineering.vps.recover
  // composes it; release-state.json via the same reader used by reconcile).
  // incident.summary and logs.explain are LLM-free: every summary and explanation is
  // a fixed template over structured findings. Input is EXACTLY {} (strict); zero
  // mutation, zero approval/execute, zero SSH/shell; nothing invented; deploy.ready
  // is strictly advisory (never deploys, never calls change.safe, never calls the
  // Guardian write mode, approves nothing).
  register("engineering.vps.incident.summary", "read", (name) => server.registerTool(name, {
    description: "Simple read-only tool: answers 'What is happening with my VPS right now?' by composing ONLY existing read-only evidence (one certified Doctor pass; the certified reconcile pass wired with the live tool catalog; release-state deploy/smoke status) into a short deterministic summary classified NO_INCIDENT/INCIDENT/UNKNOWN. No LLM: the summary is a fixed template over structured findings; no correction is ever attempted. Input is exactly {} (strict); zero mutation, no approval/execute, no LLM, no SSH/shell.",
    inputSchema: z.object({}).strict()
  }, async (input) => {
    requireRead();
    const incidentCatalog = createToolCatalog(toolMetadata, repositoryId);
    return response(await runVpsIncidentSummary(subject.subject, input, {
      runReconcile: () => runVpsReconcile({ readCatalog: async () => ({ catalogHash: incidentCatalog.catalogHash, catalogVersion: incidentCatalog.catalogVersion, toolCount: incidentCatalog.actualToolCount }) })
    }));
  }));
  register("engineering.deploy.ready", "read", (name) => server.registerTool(name, {
    description: "Simple read-only tool: answers 'Is it safe to deploy now?' from observed read-only state only (Doctor findings and deployment activity; reconcile DEPLOY_IN_PROGRESS/DEPLOY_FAILED wired with the live tool catalog; release-state deployStatus/smokeStatus) classified READY/NOT_READY/UNKNOWN. Strictly advisory: it NEVER deploys, NEVER calls engineering.vps.change.safe, NEVER calls the Guardian write mode and NEVER approves anything. Input is exactly {} (strict); zero mutation, no LLM, no SSH/shell.",
    inputSchema: z.object({}).strict()
  }, async (input) => {
    requireRead();
    const readyCatalog = createToolCatalog(toolMetadata, repositoryId);
    return response(await runDeployReady(subject.subject, input, {
      runReconcile: () => runVpsReconcile({ readCatalog: async () => ({ catalogHash: readyCatalog.catalogHash, catalogVersion: readyCatalog.catalogVersion, toolCount: readyCatalog.actualToolCount }) })
    }));
  }));
  register("engineering.docker.health", "read", (name) => server.registerTool(name, {
    description: "Simple read-only tool: answers 'Are my containers healthy?' using ONLY Docker/cluster evidence already available from the certified Doctor pass (Swarm node state, manager reachability, server status) classified HEALTHY/DEGRADED/CRITICAL/UNKNOWN, with NO_CONTAINERS when zero managed applications exist. No docker CLI, no SSH, no agent, no new privileged path; per-container inspection does not exist in the certified mechanisms (containerLevelEvidence=false) and missing evidence -> UNKNOWN, never invented. Input is exactly {} (strict); zero mutation, no LLM, no SSH/shell.",
    inputSchema: z.object({}).strict()
  }, async (input) => {
    requireRead();
    return response(await runDockerHealth(subject.subject, input));
  }));
  register("engineering.logs.explain", "read", (name) => server.registerTool(name, {
    description: "Simple read-only tool (NO LLM): answers 'What do these errors/logs mean?' by deterministically explaining ONLY the structured findings already observable through the certified Doctor pass (fixed table of known finding codes), classified NO_ERRORS/EXPLAINED/UNKNOWN. Accepts NO log text, NO file path, NO URL (input is exactly {} strict) and never fetches logs via shell/SSH; unknown codes are listed unexplained, never invented.",
    inputSchema: z.object({}).strict()
  }, async (input) => {
    requireRead();
    return response(await runLogsExplain(subject.subject, input));
  }));

  const requireNotifyHermes = () => { if (!subject.scopes.includes("engineering:notify:hermes")) throw new EngineeringError("AUTHORIZATION_SCOPE_REQUIRED"); };
  register("engineering.notify.hermes", "write", (name) => server.registerTool(name, {
    description: "One-way best-effort mission notification to the local Hermes Agent gateway (OpenAI-compatible API server). The endpoint (loopback 127.0.0.1:8642), the Bearer and the target session are ALWAYS server-side configuration (env / LoadCredential chain unit -> runner -> container); caller-supplied URLs, endpoints, credentials or session ids are structurally impossible by schema ({summary, status?} only) and every notification lands in ONE persistent dedicated Hermes session (default gh-notifications, env ENG_MCP_HERMES_SESSION_ID override). Sends a PT-BR one-way message; 10min dedupe, 60s cooldown and an hourly rolling budget protect the gateway; every failure is honest best-effort (delivered:false + typed error, never thrown) and never blocks the calling mission. Requires bearer scope engineering:notify:hermes (operator-issued; the agent cannot self-authorize).",
    inputSchema: notifyHermesInputSchema
  }, async (input) => {
    requireRead();
    requireNotifyHermes();
    return response(await runNotifyHermes(input));
  }));

}