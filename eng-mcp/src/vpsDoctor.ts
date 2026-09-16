import {
  DOKPLOY_SERVER_ID_DEFAULT,
  createMcpClientCallTransport,
  normalizeMcpResult,
  type VpsTransport,
} from "./vpsChangeSafe.ts";

// engineering.vps.doctor — READ-ONLY diagnostic supertool for Dokploy-managed VPS/apps (MVP).
//
// Purpose: one deterministic, allowlisted, ZERO-mutation diagnostic pass over:
//   server (server-all) -> Swarm/node state (cluster-getNodes) -> applications
//   (application-search, application-one) -> deployments (deployment-all,
//   deployment-queueList) -> monitoring (application-readAppMonitoring) ->
//   recent logs (application-readLogs). Compose coverage (compose-search) is part of
//   the read allowlist for future scope; this MVP does not call it (no compose
//   diagnostics were required for classification and no invented semantics allowed).
//
// Hard rules (this sprint):
// - The tool performs NO mutation: no execute/approval input exists, no mutating
//   primitive can ever be reached. toolName ALWAYS comes from the fixed
//   VPS_DOCTOR_READ_PRIMITIVES list — never from caller input.
// - Upstream failures surface as findings (UPSTREAM_ERROR) and push the overall
//   status to UNKNOWN when the failure is on an ESSENTIAL primitive (server-all,
//   cluster-getNodes). A doctor NEVER invents health.
// - Zero applications is NOT a VPS failure: finding NO_APPLICATIONS_MANAGED (info);
//   the server can still be HEALTHY.
// - Deterministic classification only (HEALTHY/DEGRADED/CRITICAL/UNKNOWN) from
//   evidence collected in this single run. No LLM, no SSH/shell, no auto-repair,
//   no rollback, no backups.
// - Same s2s channel as engineering.vps.change.safe (base44 mcpClientCall via
//   agentMemoryBridge), injectable transport so tests run fully offline.

export const VPS_DOCTOR_READ_PRIMITIVES = [
  "server-all",
  "cluster-getNodes",
  "application-search",
  "application-one",
  "application-readLogs",
  "application-readAppMonitoring",
  "compose-search",
  "deployment-all",
  "deployment-allCentralized",
  "deployment-queueList",
] as const;

// Essential primitives (server-all, cluster-getNodes) force status UNKNOWN on upstream failure (Phase 5).
export type VpsDoctorStatus = "HEALTHY" | "DEGRADED" | "CRITICAL" | "UNKNOWN";
export type VpsDoctorOutcome = "DIAGNOSED" | "TARGET_AMBIGUOUS" | "SERVER_NOT_FOUND" | "UPSTREAM_ERROR";

export type VpsDoctorInput = {
  serverId?: string;
  applicationId?: string;
  applicationName?: string;
};

export type VpsDoctorDeps = {
  transport?: VpsTransport;
  now?: () => number;
  dokployServerId?: string;
};

const MAX_SEARCH_RESULTS = 100;
const MAX_FINDINGS = 40;
const MAX_CANDIDATES_SHOWN = 10;
const REDACTED = "[REDACTED]";
const SENSITIVE_KEY_PATTERN = /authorization|token|secret|api_?key|password|cookie|bearer|envvars|^env$/i;
const FAILED_STATUS_PATTERN = /error|fail|cancel/i;
const SUCCESS_STATUS_PATTERN = /\bdone\b|success|complete/i;
const IN_FLIGHT_STATUS_PATTERN = /building|queu|running|deploying|pending|progress|starting|initializ|wait/i;

type Result<T> = { ok: true; value: T } | { ok: false; reason: string };
type Severity = "info" | "warning" | "critical";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function redactSensitive(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return value;
  if (depth > 12) return null;
  if (Array.isArray(value)) return value.slice(0, 500).map((item) => redactSensitive(item, depth + 1));
  if (isRecord(value)) {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      output[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redactSensitive(child, depth + 1);
    }
    return output;
  }
  return value;
}

// Deterministic unwrap of { success, message, data: [...] } envelopes (observed live
// contract of Dokploy MCP via mcp_execute) and bare arrays. success === false and
// present-but-non-array wrappers never become a valid list (null -> UPSTREAM_ERROR);
// conflicting wrappers are never resolved arbitrarily.
function extractArrayPayload(result: unknown, wrapperKeys: string[]): Record<string, unknown>[] | null {
  if (Array.isArray(result)) return result.filter(isRecord);
  if (!isRecord(result)) return null;
  if (result.success === false) return null;
  const wrappers: unknown[] = [];
  for (const key of wrapperKeys) {
    const value = (result as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      wrappers.push(value);
      continue;
    }
    // Real mcp_execute contract (application-search): { success, message, data: { items: [...] } }.
    if (isRecord(value) && Array.isArray(value.items)) wrappers.push(value.items);
    else return null;
  }
  if (wrappers.length !== 1) return null;
  return (wrappers[0] as unknown[]).filter(isRecord);
}

type DeploymentClassification = "success" | "failed" | "in_flight" | "unknown";

function classifyStatus(status: unknown): DeploymentClassification {
  if (typeof status !== "string" || status.length === 0) return "unknown";
  if (FAILED_STATUS_PATTERN.test(status)) return "failed";
  if (SUCCESS_STATUS_PATTERN.test(status)) return "success";
  if (IN_FLIGHT_STATUS_PATTERN.test(status)) return "in_flight";
  return "unknown";
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length > 0) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function newestDeployment(deployments: Record<string, unknown>[]): Record<string, unknown> | null {
  let best: Record<string, unknown> | null = null;
  let bestTime = Number.NEGATIVE_INFINITY;
  for (const deployment of deployments) {
    const time = parseTimestamp(deployment.createdAt) ?? Number.NEGATIVE_INFINITY;
    if (best === null || time >= bestTime) {
      best = deployment;
      bestTime = time;
    }
  }
  return best;
}

function validateInput(input: unknown): Result<VpsDoctorInput> {
  if (!isRecord(input)) return { ok: false, reason: "INPUT_MUST_BE_OBJECT" };
  // Mutation-control keys are structurally impossible here: doctor has no mutation.
  if (input.execute !== undefined || input.approval !== undefined) return { ok: false, reason: "MUTATION_CONTROL_KEYS_REJECTED" };
  const serverId = asString(input.serverId);
  const applicationId = asString(input.applicationId);
  const applicationName = asString(input.applicationName);
  for (const [key, value] of Object.entries({ serverId, applicationId, applicationName })) {
    if (value !== null && value.length > 200) return { ok: false, reason: `${key.toUpperCase()}_TOO_LONG` };
  }
  if (input.serverId !== undefined && serverId === null) return { ok: false, reason: "SERVER_ID_MUST_BE_NON_EMPTY_STRING" };
  if (input.applicationId !== undefined && applicationId === null) return { ok: false, reason: "APPLICATION_ID_MUST_BE_NON_EMPTY_STRING" };
  if (input.applicationName !== undefined && applicationName === null) return { ok: false, reason: "APPLICATION_NAME_MUST_BE_NON_EMPTY_STRING" };
  return { ok: true, value: { serverId: serverId ?? undefined, applicationId: applicationId ?? undefined, applicationName: applicationName ?? undefined } };
}

function pickServerSummary(server: Record<string, unknown>): { serverId: string; name: string; status: string | null; ipAddress: string | null } {
  return {
    serverId: asString(server.serverId) ?? asString(server.id) ?? "",
    name: asString(server.name) ?? "",
    status: asString(server.serverStatus) ?? asString(server.status),
    ipAddress: asString(server.ipAddress) ?? asString(server.ip),
  };
}

function nodeView(node: Record<string, unknown>): { id: string; hostname: string; role: string; availability: string; state: string; addr: string | null; leader: boolean | null; reachability: string | null } {
  const spec = isRecord(node.Spec) ? node.Spec : {};
  const status = isRecord(node.Status) ? node.Status : {};
  const manager = isRecord(node.ManagerStatus) ? node.ManagerStatus : {};
  const description = isRecord(node.Description) ? node.Description : {};
  return {
    id: asString(node.ID) ?? "",
    hostname: asString(description.Hostname) ?? "",
    role: asString(spec.Role) ?? "",
    availability: asString(spec.Availability) ?? "",
    state: asString(status.State) ?? "",
    addr: asString(status.Addr),
    leader: typeof manager.Leader === "boolean" ? manager.Leader : null,
    reachability: asString(manager.Reachability),
  };
}

export async function runVpsDoctor(subject: string, input: unknown, deps: VpsDoctorDeps = {}): Promise<Record<string, unknown>> {
  const now = deps.now ?? (() => Date.now());
  const t0 = now();
  const transport = deps.transport ?? createMcpClientCallTransport({ dokployServerId: deps.dokployServerId });
  const evidence: string[] = [];
  const findings: Array<{ code: string; severity: Severity; evidence: string }> = [];
  const primitivesInvoked: string[] = [];
  let essentialUpstreamFailure = false;
  const note = (message: string): void => {
    if (evidence.length < MAX_FINDINGS) evidence.push(message);
  };
  const finding = (code: string, severity: Severity, detail: string): void => {
    if (findings.length < MAX_FINDINGS) findings.push({ code, severity, evidence: detail });
    note(`${code}: ${detail}`);
  };
  const callPrimitive = async (toolName: string, args: Record<string, unknown>): Promise<{ ok: boolean; status: number; result?: unknown; error?: string }> => {
    primitivesInvoked.push(toolName);
    const response = await transport.call({ toolName, arguments: args, mutating: false, confirmation: { toolName } });
    return response.ok
      ? { ok: true, result: normalizeMcpResult(response.result), status: response.status }
      : { ok: false, status: response.status, error: response.error ?? "UNKNOWN" };
  };
  const finish = (result: Record<string, unknown>): Record<string, unknown> => {
    const totalMs = now() - t0;
    const complete: Record<string, unknown> = {
      findings,
      primitivesInvoked,
      mode: "read-only",
      mutationPerformed: false,
      durationMs: totalMs,
      ...result,
    };
    console.log(JSON.stringify({ event: "engineering.vps.doctor", subject, outcome: String(complete.outcome ?? "UPSTREAM_ERROR"), status: String(complete.status ?? "UNKNOWN"), mutationPerformed: false, durationMs: totalMs, primitives: primitivesInvoked }));
    return JSON.parse(JSON.stringify(redactSensitive(complete))) as Record<string, unknown>;
  };

  // ---- Phase 0: input validation (mutation control keys are rejected outright) ----
  const parsed = validateInput(input);
  if (!parsed.ok) {
    return finish({ ok: false, outcome: "UPSTREAM_ERROR", status: "UNKNOWN", blocked: { phase: "input", reason: parsed.reason }, recommendedNextAction: "Corrigir a entrada e repetir o diagnóstico." });
  }
  const plan = parsed.value;

  // ---- Phase 1: resolve server (server-all; single-server auto-selection ONLY) ----
  const serverAll = await callPrimitive("server-all", {});
  if (!serverAll.ok) {
    essentialUpstreamFailure = true;
    finding("UPSTREAM_ERROR", "critical", `server-all failed (status ${serverAll.status}): ${serverAll.error}`);
    return finish({ ok: false, outcome: "UPSTREAM_ERROR", status: "UNKNOWN", server: null, monitoringAvailable: false, logsChecked: false, deployments: { active: 0, queued: 0, lastStatus: null }, recommendedNextAction: "Repetir o diagnóstico quando o canal upstream (agentMemoryBridge -> Dokploy MCP) estiver saudável." });
  }
  const servers = extractArrayPayload(serverAll.result, ["data", "items", "servers"]);
  if (servers === null) {
    essentialUpstreamFailure = true;
    finding("UPSTREAM_ERROR", "critical", "server-all returned an unexpected shape");
    return finish({ ok: false, outcome: "UPSTREAM_ERROR", status: "UNKNOWN", server: null, monitoringAvailable: false, logsChecked: false, deployments: { active: 0, queued: 0, lastStatus: null }, recommendedNextAction: "Repetir o diagnóstico quando o contrato upstream de server-all estiver determinístico." });
  }
  let selected: { serverId: string; name: string; status: string | null; ipAddress: string | null } | null = null;
  if (plan.serverId) {
    const match = servers.map(pickServerSummary).find((s) => s.serverId === plan.serverId);
    if (!match) {
      finding("SERVER_NOT_FOUND", "info", `serverId '${plan.serverId}' not present in server-all (${servers.length} servers)`);
      return finish({ ok: false, outcome: "SERVER_NOT_FOUND", status: "UNKNOWN", server: null, monitoringAvailable: false, logsChecked: false, deployments: { active: 0, queued: 0, lastStatus: null }, recommendedNextAction: "Confirmar o serverId no Dokploy Cloud e repetir o diagnóstico." });
    }
    selected = match;
  } else if (servers.length === 0) {
    finding("NO_SERVERS", "info", "server-all returned zero servers");
    return finish({ ok: false, outcome: "UPSTREAM_ERROR", status: "UNKNOWN", server: null, monitoringAvailable: false, logsChecked: false, deployments: { active: 0, queued: 0, lastStatus: null }, recommendedNextAction: "Registrar o servidor no Dokploy Cloud antes de diagnosticar." });
  } else if (servers.length > 1) {
    finding("TARGET_AMBIGUOUS", "info", `server-all returned ${servers.length} servers and no serverId criterion was provided`);
    return finish({
      ok: false,
      outcome: "TARGET_AMBIGUOUS",
      status: "UNKNOWN",
      server: null,
      candidates: servers.slice(0, MAX_CANDIDATES_SHOWN).map((s) => ({ serverId: asString(s.serverId) ?? asString(s.id) ?? "", name: asString(s.name) ?? "" })),
      monitoringAvailable: false,
      logsChecked: false,
      deployments: { active: 0, queued: 0, lastStatus: null },
      recommendedNextAction: "Informar serverId para desambiguar o diagnóstico.",
    });
  } else {
    selected = pickServerSummary(servers[0]);
    note(`server resolved by single-server selection: ${selected.serverId} (${selected.name})`);
  }
  if (selected.status !== null && selected.status !== "active") {
    finding("SERVER_STATUS_NOT_ACTIVE", "warning", `serverStatus='${selected.status}' (expected 'active')`);
  }

  // ---- Phase 2: Swarm/node verification (cluster-getNodes, ESSENTIAL) ----
  const cluster = await callPrimitive("cluster-getNodes", { serverId: selected.serverId });
  if (!cluster.ok) {
    essentialUpstreamFailure = true;
    finding("UPSTREAM_ERROR", "critical", `cluster-getNodes failed (status ${cluster.status}): ${cluster.error}`);
    return finish({ ok: false, outcome: "UPSTREAM_ERROR", status: "UNKNOWN", server: { serverId: selected.serverId, name: selected.name, status: selected.status, nodeStatus: null, availability: null, role: null }, monitoringAvailable: false, logsChecked: false, deployments: { active: 0, queued: 0, lastStatus: null }, recommendedNextAction: "Repetir o diagnóstico quando o canal upstream (agentMemoryBridge -> Dokploy MCP) estiver saudável." });
  }
  const nodesRaw = extractArrayPayload(cluster.result, ["data", "nodes"]);
  if (nodesRaw === null) {
    essentialUpstreamFailure = true;
    finding("UPSTREAM_ERROR", "critical", "cluster-getNodes returned an unexpected shape");
    return finish({ ok: false, outcome: "UPSTREAM_ERROR", status: "UNKNOWN", server: { serverId: selected.serverId, name: selected.name, status: selected.status, nodeStatus: null, availability: null, role: null }, monitoringAvailable: false, logsChecked: false, deployments: { active: 0, queued: 0, lastStatus: null }, recommendedNextAction: "Repetir o diagnóstico quando o contrato upstream de cluster-getNodes estiver determinístico." });
  }
  const nodes = nodesRaw.map(nodeView);
  note(`cluster-getNodes returned ${nodes.length} node(s)`);
  if (nodes.length === 0) {
    finding("NODE_MISSING", "critical", "no Swarm nodes returned for the server");
  }
  for (const node of nodes) {
    if (node.state !== "ready") finding("NODE_NOT_READY", "critical", `node ${node.id || node.hostname} state='${node.state || "unknown"}' (expected 'ready')`);
    if (node.availability !== "active") finding("NODE_NOT_ACTIVE", "warning", `node ${node.id || node.hostname} availability='${node.availability || "unknown"}' (expected 'active')`);
  }
  const leader = nodes.find((node) => node.leader === true) ?? null;
  const managerRoleNodes = nodes.filter((node) => node.role === "manager");
  if (leader !== null) {
    if (leader.reachability !== null && leader.reachability !== "reachable") {
      finding("MANAGER_UNREACHABLE", "critical", `manager leader ${leader.id} reachability='${leader.reachability}' (expected 'reachable')`);
    }
  } else if (managerRoleNodes.length > 0) {
    finding("MANAGER_LEADER_NOT_IDENTIFIED", "warning", `${managerRoleNodes.length} manager node(s) present but no leader identified in ManagerStatus`);
  }
  const primary = leader ?? (selected.ipAddress ? nodes.find((node) => node.addr === selected?.ipAddress) ?? null : null) ?? (nodes.length === 1 ? nodes[0] : null);

  // ---- Phase 3: application discovery (READ; zero apps is NOT a VPS failure) ----
  const search = await callPrimitive("application-search", { limit: MAX_SEARCH_RESULTS });
  let applications: Record<string, unknown>[] | null = null;
  if (!search.ok) {
    finding("UPSTREAM_ERROR", "warning", `application-search failed (status ${search.status}): ${search.error}`);
  } else {
    applications = extractArrayPayload(search.result, ["data", "items", "applications"]);
    if (applications === null) {
      finding("UPSTREAM_ERROR", "warning", "application-search returned an unexpected shape");
      applications = null;
    }
  }
  const appCount = applications === null ? -1 : applications.length;
  if (appCount === 0) {
    finding("NO_APPLICATIONS_MANAGED", "info", "application-search returned zero applications (server can still be healthy)");
  } else if (appCount > 0) {
    note(`application-search returned ${appCount} application(s)`);
  }

  // ---- Phase 4: target application diagnostics (explicit caller target, OR deterministic
  // single-application selection without a caller target — mirrors single-server selection
  // in Phase 1. Zero or multiple applications resolve to NO target: application identity
  // is never guessed and consumers stay BLOCKED.) ----
  const singleAppNoTarget =
    applications !== null && !plan.applicationId && !plan.applicationName && applications.length === 1;
  let application: { id: string; name: string; status: string | null } | null = null;
  let appDeployments: Record<string, unknown>[] = [];
  let queued = 0;
  let lastStatus: DeploymentClassification | null = null;
  let monitoringAvailable = false;
  let logsChecked = false;
  let resolvedAppRecord: Record<string, unknown> | null = null;
  if (applications !== null && (plan.applicationId || plan.applicationName || singleAppNoTarget)) {
    const wantedId = plan.applicationId ?? null;
    const wantedName = (plan.applicationName ?? "").toLowerCase();
    const matches = singleAppNoTarget
      ? applications.slice()
      : applications.filter((app) => {
          const id = asString(app.applicationId) ?? asString(app.id);
          const name = asString(app.name) ?? asString(app.appName);
          if (wantedId !== null) return id === wantedId;
          return name !== null && name.toLowerCase() === wantedName;
        });
    if (matches.length === 0) {
      finding("TARGET_NOT_FOUND", "info", wantedId ? `no application with applicationId='${wantedId}'` : `no application named '${plan.applicationName}'`);
    } else if (matches.length > 1 && wantedId === null) {
      finding("TARGET_AMBIGUOUS", "info", `applicationName '${plan.applicationName}' matched ${matches.length} applications; use applicationId`);
    } else {
      resolvedAppRecord = matches[0];
      const appId = asString(resolvedAppRecord.applicationId) ?? asString(resolvedAppRecord.id) ?? "";
      if (singleAppNoTarget) note(`application target resolved by deterministic single-application selection: ${appId}`);
      const one = await callPrimitive("application-one", { applicationId: appId });
      const record = one.ok && isRecord(one.result) ? one.result : resolvedAppRecord;
      application = {
        id: asString(record.applicationId) ?? asString(record.id) ?? appId,
        name: asString(record.name) ?? asString(record.appName) ?? "",
        status: asString(record.applicationStatus) ?? asString(record.status),
      };
      const all = await callPrimitive("deployment-all", {});
      if (all.ok) {
        const list = extractArrayPayload(all.result, ["data", "items", "deployments"]);
        if (list === null) finding("UPSTREAM_ERROR", "warning", "deployment-all returned an unexpected shape");
        else appDeployments = list.filter((d) => { const id = asString(d.applicationId) ?? asString(d.appId); return id === null || id === appId; });
      } else {
        finding("UPSTREAM_ERROR", "warning", `deployment-all failed (status ${all.status}): ${all.error}`);
      }
      const queue = await callPrimitive("deployment-queueList", {});
      if (queue.ok) {
        const list = extractArrayPayload(queue.result, ["data", "items", "queue", "deployments"]);
        if (list === null) finding("UPSTREAM_ERROR", "warning", "deployment-queueList returned an unexpected shape");
        else queued = list.filter((d) => { const id = asString(d.applicationId) ?? asString(d.appId); return id === null || id === appId; }).length;
      } else {
        finding("UPSTREAM_ERROR", "warning", `deployment-queueList failed (status ${queue.status}): ${queue.error}`);
      }
      if (appDeployments.length > 0) {
        const newest = newestDeployment(appDeployments);
        lastStatus = classifyStatus(newest?.status);
        for (const deployment of appDeployments) {
          const cls = classifyStatus(deployment.status);
          if (cls === "failed") finding("DEPLOYMENT_FAILED", "warning", `deployment ${asString(deployment.deploymentId) ?? asString(deployment.id) ?? "?"} status='${String(deployment.status)}'`);
          if (cls === "in_flight") finding("DEPLOYMENT_IN_FLIGHT", "warning", `deployment ${asString(deployment.deploymentId) ?? asString(deployment.id) ?? "?"} status='${String(deployment.status)}' (in flight)`);
        }
      }
      if (queued > 0) finding("QUEUE_PENDING", "warning", `deployment-queueList returned ${queued} queued item(s)`);
      const monitoring = await callPrimitive("application-readAppMonitoring", { applicationId: appId });
      if (monitoring.ok) {
        monitoringAvailable = true;
        note("application-readAppMonitoring returned data");
      } else {
        finding("UPSTREAM_ERROR", "warning", `application-readAppMonitoring failed (status ${monitoring.status}): ${monitoring.error}`);
      }
      const logs = await callPrimitive("application-readLogs", { applicationId: appId });
      if (logs.ok) {
        logsChecked = true;
        note("application-readLogs returned recent logs");
      } else {
        finding("UPSTREAM_ERROR", "warning", `application-readLogs failed (status ${logs.status}): ${logs.error}`);
      }
    }
  }

  // ---- Phase 5: deterministic classification (never invents health) ----
  let status: VpsDoctorStatus = "HEALTHY";
  for (const item of findings) {
    if (item.severity === "critical") status = "CRITICAL";
    else if (item.severity === "warning" && status !== "CRITICAL") status = "DEGRADED";
  }
  if (essentialUpstreamFailure) status = "UNKNOWN";
  const outcome: VpsDoctorOutcome = "DIAGNOSED";
  const recommendedNextAction =
    findings.some((f) => f.code === "NODE_MISSING") ? "Verificar o runtime Docker/Swarm no servidor antes de qualquer operação de deploy."
    : findings.some((f) => f.code === "NODE_NOT_READY") ? "Investigar o node Swarm 'not ready' no servidor antes de qualquer operação de deploy."
    : findings.some((f) => f.code === "MANAGER_UNREACHABLE") ? "Restaurar o alcance do manager Swarm antes de qualquer operação de deploy."
    : findings.some((f) => f.code === "DEPLOYMENT_IN_FLIGHT") ? "Aguardar a conclusão do deployment em andamento antes de novas mudanças."
    : findings.some((f) => f.code === "DEPLOYMENT_FAILED") ? "Inspecionar os logs do último deployment com falha antes de novas mudanças."
    : findings.some((f) => f.code === "QUEUE_PENDING") ? "Drenar/avaliar a fila de deployments antes de novas mudanças."
    : findings.some((f) => f.code === "SERVER_STATUS_NOT_ACTIVE") ? "Verificar o estado do servidor no Dokploy Cloud antes de novas mudanças."
    : findings.some((f) => f.code === "NO_APPLICATIONS_MANAGED") ? "Nenhuma application gerenciada: registrar aplicações no Dokploy antes de operar mudanças."
    : findings.some((f) => f.code === "UPSTREAM_ERROR") ? "Repetir o diagnóstico quando o canal upstream estiver saudável."
    : "Nenhuma ação requerida.";

  return finish({
    ok: !essentialUpstreamFailure,
    outcome,
    status,
    server: {
      serverId: selected.serverId,
      name: selected.name,
      status: selected.status,
      nodeStatus: primary?.state ?? (nodes.length === 0 ? "missing" : nodes.every((n) => n.state === "ready") ? "ready" : "not_ready"),
      availability: primary?.availability ?? (nodes.length === 0 ? "missing" : nodes.every((n) => n.availability === "active") ? "active" : "partial"),
      role: primary?.role ?? (managerRoleNodes.length > 0 ? "manager" : null),
    },
    application,
    deployments: { active: appDeployments.filter((d) => classifyStatus(d.status) === "in_flight").length, queued, lastStatus },
    monitoringAvailable,
    logsChecked,
    recommendedNextAction,
  });
}
