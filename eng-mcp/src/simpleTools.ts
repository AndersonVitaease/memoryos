import { runVpsDoctor } from "./vpsDoctor.ts";
import { defaultReadReleaseState } from "./vpsReconcile.ts";

// Engineering Simple Tools — first batch (SPRINT SIMPLE-TOOLS-01).
//
// Three small, specific, deterministic, 100% read-only tools that each answer ONE
// question by thin composition over the certified read-only Doctor mechanism
// (a single runVpsDoctor(subject, {}) pass — the exact call shape already used
// by the coordinator supertool in tools.ts). These are NOT supertools: no
// coordination, no rollback, no change flow, no automatic action, no approval,
// no execute, no LLM, no SSH/shell, zero mutation, no arbitrary target.
//
//   engineering.vps.health     "Minha VPS está saudável?"
//   engineering.vps.why_down   "Por que minha VPS ou aplicação está com problema?"
//   engineering.deploy.status  "Meu deploy está funcionando?"
//
// Input contract: every tool accepts EXACTLY {} (strict empty object). Any
// caller-supplied key — execute, approval, target, applicationId, serverId,
// toolName, action, command, shell, url, headers, token — is rejected with
// SIMPLE_TOOL_INPUT_REJECTED BEFORE any evidence is collected. The zod schemas
// in tools.ts enforce the same contract at the MCP layer (z.object({}).strict()).
//
// Evidence policy: evidence comes ONLY from the injected Doctor run (production
// default: the certified runVpsDoctor with its fixed READ primitives). Causes
// are selected deterministically from existing Doctor findings (critical first,
// then warning, preserving the Doctor's own phase order). Insufficient evidence
// -> cause=null / status=UNKNOWN — never an invented cause. Zero managed
// applications is reported informatively (NO_APPLICATIONS_MANAGED) and is never
// treated as a VPS failure.

export type SimpleToolsDeps = {
  /** Overrides the certified Doctor pass (tests inject a fake Doctor here). */
  runDoctor?: (subject: string) => Promise<Record<string, unknown>>;
  /** Overrides the release-state reader (tests inject a fake release-state here). */
  runReleaseState?: () => Promise<unknown>;
  /** Overrides the certified reconcile pass. Production wires this at the registration
   *  site with the live tool catalog (mirroring how engineering.vps.recover composes
   *  runVpsReconcile); when absent, reconcile evidence is simply not collected —
   *  never invented. Tests inject a fake reconcile pass here. */
  runReconcile?: () => Promise<unknown>;
  /** Injectable clock for a deterministic checkedAt (tests). */
  now?: () => number;
};

type DoctorFinding = { code: string; severity: string; evidence: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

// Strict-empty input gate (defense in depth; the MCP-layer zod schema already
// enforces z.object({}).strict()). Returns null when input is exactly {} or
// undefined; otherwise reports the rejected keys. ANY caller-supplied key is
// rejected — there is no legitimate extra input for Simple Tools.
function requireStrictEmptyInput(input: unknown): { rejectedKeys: string[] } | null {
  if (input === undefined) return null;
  if (isRecord(input) && Object.keys(input).length === 0) return null;
  if (Array.isArray(input)) return { rejectedKeys: ["<array>"] };
  if (!isRecord(input)) return { rejectedKeys: [`<${typeof input}>`] };
  return { rejectedKeys: Object.keys(input) };
}

function inputRejection(rejected: { rejectedKeys: string[] }, now: () => number): Record<string, unknown> {
  return {
    ok: false,
    status: "UNKNOWN",
    error: {
      code: "SIMPLE_TOOL_INPUT_REJECTED",
      rejectedKeys: rejected.rejectedKeys,
      allowedInput: {},
      message: "Simple tools accept exactly {} (strict empty object). No execute, approval, target, applicationId, serverId, toolName, action, command, shell, url, headers or token input is accepted.",
    },
    summary: "Entrada rejeitada: estas tools aceitam somente {} estrito; nenhuma evidência foi coletada.",
    checkedAt: new Date(now()).toISOString(),
  };
}

function resolveDoctor(subject: string, deps: SimpleToolsDeps): () => Promise<Record<string, unknown>> {
  // Production default: ONE certified read-only Doctor pass with empty input —
  // the same composition already used by the coordinator supertool (tools.ts).
  return deps.runDoctor
    ? () => deps.runDoctor!(subject)
    : () => runVpsDoctor(subject, {});
}

function readFindings(doctor: Record<string, unknown>): DoctorFinding[] {
  if (!Array.isArray(doctor.findings)) return [];
  return doctor.findings.filter(isRecord).map((f) => ({
    code: asString(f.code) ?? "UNKNOWN",
    severity: asString(f.severity) ?? "info",
    evidence: asString(f.evidence) ?? "",
  }));
}

function hasFinding(findings: DoctorFinding[], code: string): boolean {
  return findings.some((f) => f.code === code);
}

function doctorStatus(doctor: Record<string, unknown>): string {
  return asString(doctor.status) ?? "UNKNOWN";
}

// engineering.vps.health — "Minha VPS está saudável?"
// Deterministic mapping from the certified Doctor classification:
//   HEALTHY           -> healthy=true
//   DEGRADED/CRITICAL -> healthy=false
//   UNKNOWN           -> status=UNKNOWN, healthy=null (never invents health)
export async function runVpsHealth(subject: string, input: unknown = {}, deps: SimpleToolsDeps = {}): Promise<Record<string, unknown>> {
  const now = deps.now ?? Date.now;
  const rejected = requireStrictEmptyInput(input);
  if (rejected !== null) return inputRejection(rejected, now);
  const doctor = await resolveDoctor(subject, deps)();
  const status = doctorStatus(doctor);
  const healthy = status === "HEALTHY" ? true : status === "DEGRADED" || status === "CRITICAL" ? false : null;
  const findings = readFindings(doctor);
  const counts = { critical: 0, warning: 0, info: 0 };
  for (const f of findings) if (f.severity in counts) counts[f.severity as keyof typeof counts] += 1;
  return {
    status,
    healthy,
    summary: `VPS status=${status}; healthy=${healthy === null ? "null" : String(healthy)}; findings=${findings.length} (critical=${counts.critical}, warning=${counts.warning}, info=${counts.info}).`,
    findings,
    checkedAt: new Date(now()).toISOString(),
  };
}

// engineering.vps.why_down — "Por que minha VPS ou aplicação está com problema?"
// cause = the most relevant OBSERVABLE finding (first critical, else first
// warning, preserving the Doctor's own phase order); evidence = the
// critical+warning findings backing that cause. No sufficient finding ->
// cause=null. down mapping: DEGRADED/CRITICAL -> true; HEALTHY -> false;
// UNKNOWN -> null. Never invents a cause; never calls any recovery, change or
// coordination flow.
export async function runVpsWhyDown(subject: string, input: unknown = {}, deps: SimpleToolsDeps = {}): Promise<Record<string, unknown>> {
  const now = deps.now ?? Date.now;
  const rejected = requireStrictEmptyInput(input);
  if (rejected !== null) return inputRejection(rejected, now);
  const doctor = await resolveDoctor(subject, deps)();
  const status = doctorStatus(doctor);
  const down = status === "DEGRADED" || status === "CRITICAL" ? true : status === "HEALTHY" ? false : null;
  const findings = readFindings(doctor);
  const cause = findings.find((f) => f.severity === "critical") ?? findings.find((f) => f.severity === "warning") ?? null;
  const evidence = cause === null ? [] : findings.filter((f) => f.severity === "critical" || f.severity === "warning");
  const summary = cause !== null
    ? `Causa observável mais relevante: ${cause.code} (${cause.severity}).`
    : down === false
      ? "Nenhuma condição de problema observada: VPS saudável segundo o diagnóstico read-only."
      : "Evidência insuficiente para determinar uma causa (status=UNKNOWN); nenhuma causa inventada.";
  return { status, down, cause, summary, evidence, findings, checkedAt: new Date(now()).toISOString() };
}
// ---- SPRINT SIMPLE-TOOLS-02 — second batch (capacity / what_changed / app.health) ----
// Same contract as the first batch: small, deterministic, 100% read-only thin
// compositions over EXISTING certified mechanisms (runVpsDoctor; the release
// runner's release-state.json via the SAME reader used by engineering.vps.reconcile).
// Strict {} input, zero mutation, zero LLM, zero SSH/shell, nothing invented,
// no new framework, no new storage, no new timeline.

const CAPACITY_CODE_PATTERN = /^(DISK|MEMORY|CPU|STORAGE|SPACE|LOAD|PRESSURE|CAPACITY)/i;

function resolveReleaseState(deps: SimpleToolsDeps): () => Promise<unknown> {
  return deps.runReleaseState ?? defaultReadReleaseState;
}

function releaseStateField(state: Record<string, unknown> | null, keys: string[]): string | null {
  if (state === null) return null;
  for (const key of keys) {
    const value = state[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function countOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

// engineering.vps.capacity — "A VPS está perto do limite?"
// ONLY evidence already available from the read-only Doctor pass; no new
// monitoring, no agent, no invented metrics:
//   capacity-related critical finding              -> CRITICAL
//   capacity-related warning finding               -> PRESSURE
//   monitoring evidence available, no pressure     -> OK (no observed pressure)
//   no capacity evidence at all / Doctor UNKNOWN   -> UNKNOWN (nothing invented)
export async function runVpsCapacity(subject: string, input: unknown = {}, deps: SimpleToolsDeps = {}): Promise<Record<string, unknown>> {
  const now = deps.now ?? Date.now;
  const rejected = requireStrictEmptyInput(input);
  if (rejected !== null) return inputRejection(rejected, now);
  const doctor = await resolveDoctor(subject, deps)();
  const vpsStatus = doctorStatus(doctor);
  const findings = readFindings(doctor);
  const capacityFindings = findings.filter((f) => CAPACITY_CODE_PATTERN.test(f.code));
  const monitoringAvailable = doctor.monitoringAvailable === true;
  let status: string;
  let summary: string;
  if (vpsStatus === "UNKNOWN") {
    status = "UNKNOWN";
    summary = "Evidência de capacidade insuficiente: o diagnóstico read-only não produziu classificação (status=UNKNOWN); nada inventado.";
  } else if (capacityFindings.some((f) => f.severity === "critical")) {
    status = "CRITICAL";
    summary = `Pressão de capacidade crítica observada: ${capacityFindings.filter((f) => f.severity === "critical").map((f) => f.code).join(", ")}.`;
  } else if (capacityFindings.some((f) => f.severity === "warning")) {
    status = "PRESSURE";
    summary = `Pressão de capacidade observada (warning): ${capacityFindings.filter((f) => f.severity === "warning").map((f) => f.code).join(", ")}.`;
  } else if (monitoringAvailable) {
    status = "OK";
    summary = "Nenhuma pressão de capacidade observada nos findings read-only; evidência de monitoring disponível no mecanismo atual.";
  } else {
    status = "UNKNOWN";
    summary = "Evidência de capacidade ausente: nenhum finding de capacidade e monitoring indisponível; nada inventado.";
  }
  return {
    status,
    vpsStatus,
    capacityFindings,
    findings,
    monitoringAvailable,
    server: isRecord(doctor.server) ? doctor.server : null,
    checkedAt: new Date(now()).toISOString(),
    summary,
  };
}

// engineering.vps.what_changed — "O que mudou recentemente?"
// ONLY existing authorized sources: the release runner's release-state.json (the
// exact file the certified reconcile reads — same reader, no new storage, no new
// timeline, no git substitution). Deterministic:
//   currentRelease != previousRelease -> CHANGED (short evidence)
//   currentRelease == previousRelease -> NO_CHANGE
//   missing/insufficient state        -> UNKNOWN (nothing invented)
export async function runVpsWhatChanged(subject: string, input: unknown = {}, deps: SimpleToolsDeps = {}): Promise<Record<string, unknown>> {
  const now = deps.now ?? Date.now;
  const rejected = requireStrictEmptyInput(input);
  if (rejected !== null) return inputRejection(rejected, now);
  let raw: unknown = null;
  try {
    raw = await resolveReleaseState(deps)();
  } catch {
    raw = null;
  }
  const state = isRecord(raw) ? raw : null;
  const currentRelease = releaseStateField(state, ["currentRelease", "productionImage"]);
  const previousRelease = releaseStateField(state, ["previousImage", "previousRelease", "lastKnownGoodImage"]);
  const sourceHash = releaseStateField(state, ["sourceHash"]);
  const catalogVersion = releaseStateField(state, ["catalogVersion"]);
  const deployedAt = releaseStateField(state, ["deployedAt"]);
  let status: string;
  let changed: boolean | null;
  let summary: string;
  if (currentRelease === null) {
    status = "UNKNOWN";
    changed = null;
    summary = "Evidência insuficiente: release-state indisponível ou sem release atual; nenhuma mudança inventada.";
  } else if (previousRelease === null) {
    status = "UNKNOWN";
    changed = null;
    summary = "Evidência insuficiente: release anterior não registrada no release-state; nenhuma mudança inventada.";
  } else if (currentRelease !== previousRelease) {
    status = "CHANGED";
    changed = true;
    summary = `Release mudou: '${previousRelease}' -> '${currentRelease}'.`;
  } else {
    status = "NO_CHANGE";
    changed = false;
    summary = "Nenhuma mudança de release observada no release-state.";
  }
  return {
    status,
    changed,
    release: { currentRelease, previousRelease, sourceHash, catalogVersion, deployedAt },
    checkedAt: new Date(now()).toISOString(),
    summary,
  };
}

// engineering.app.health — "A aplicação está funcionando?"
// Deterministic projection of the certified Doctor application evidence (the
// Doctor's own deterministic single-application selection; this tool never
// accepts an arbitrary target):
//   Doctor UNKNOWN                                    -> UNKNOWN
//   no deterministically resolved application         -> NO_APPLICATION (informative)
//   DEPLOYMENT_FAILED / lastStatus failed             -> CRITICAL
//   DEPLOYMENT_IN_FLIGHT / QUEUE_PENDING / DEGRADED   -> DEGRADED
//   lastStatus success + Doctor HEALTHY               -> HEALTHY
//   anything else                                     -> UNKNOWN
// Never restarts, never redeploys, never repairs.
export async function runAppHealth(subject: string, input: unknown = {}, deps: SimpleToolsDeps = {}): Promise<Record<string, unknown>> {
  const now = deps.now ?? Date.now;
  const rejected = requireStrictEmptyInput(input);
  if (rejected !== null) return inputRejection(rejected, now);
  const doctor = await resolveDoctor(subject, deps)();
  const vpsStatus = doctorStatus(doctor);
  const findings = readFindings(doctor);
  const application = isRecord(doctor.application)
    ? {
        id: asString(doctor.application.id) ?? asString(doctor.application.applicationId) ?? "",
        name: asString(doctor.application.name) ?? asString(doctor.application.appName) ?? "",
        status: asString(doctor.application.status) ?? asString(doctor.application.applicationStatus),
      }
    : null;
  const deployments = isRecord(doctor.deployments) ? doctor.deployments : {};
  const lastStatus = asString(deployments.lastStatus);
  let status: string;
  let summary: string;
  if (vpsStatus === "UNKNOWN") {
    status = "UNKNOWN";
    summary = "Estado da aplicação indeterminado: o diagnóstico read-only não produziu evidência suficiente (status=UNKNOWN); nada inventado.";
  } else if (application === null) {
    status = "NO_APPLICATION";
    summary = "Nenhuma aplicação gerenciada resolvida deterministicamente: estado informativo e não é falha; nada inventado.";
  } else if (hasFinding(findings, "DEPLOYMENT_FAILED") || lastStatus === "failed") {
    status = "CRITICAL";
    summary = `Aplicação '${application.name}' com problema: último deployment '${lastStatus ?? "unknown"}'.`;
  } else if (hasFinding(findings, "DEPLOYMENT_IN_FLIGHT") || hasFinding(findings, "QUEUE_PENDING") || vpsStatus === "DEGRADED") {
    status = "DEGRADED";
    summary = `Aplicação '${application.name}' parcialmente saudável: atividade de deployment/fila ou VPS degradada.`;
  } else if (lastStatus === "success" && vpsStatus === "HEALTHY") {
    status = "HEALTHY";
    summary = `Aplicação '${application.name}' funcionando: último deployment 'success' e VPS saudável.`;
  } else {
    status = "UNKNOWN";
    summary = `Estado da aplicação '${application.name}' indeterminado (último deployment '${lastStatus ?? "unknown"}', VPS ${vpsStatus}); nada inventado.`;
  }
  return {
    status,
    application,
    vpsStatus,
    deploymentState: { lastStatus: lastStatus ?? null, active: countOf(deployments.active), queued: countOf(deployments.queued) },
    findings,
    checkedAt: new Date(now()).toISOString(),
    summary,
  };
}


// ---- SPRINT SIMPLE-TOOLS-03 — third batch (incident.summary / deploy.ready / docker.health / logs.explain) ----
// Closes the initial catalog at 10 Simple Tools. Same contract as the first two
// batches: small, deterministic, 100% read-only thin compositions over EXISTING
// certified mechanisms (runVpsDoctor; the certified runVpsReconcile wired at the
// registration site with the live tool catalog, exactly like engineering.vps.recover
// composes it; release-state.json via the same reader used by reconcile). There is
// NO LLM anywhere in this file: every summary and explanation below is a fixed
// template over structured findings. Strict {} input, zero mutation, zero
// approval/execute, zero SSH/shell; nothing invented; deploy.ready is strictly
// advisory (it never deploys, never calls the change flow, never approves).

const DOCKER_INFRA_PATTERN = /^(NODE_|MANAGER_|SERVER_|DOCKER|CONTAINER|SWARM|NO_SERVERS)/i;

function errorFindingsOf(findings: DoctorFinding[]): DoctorFinding[] {
  return findings.filter((f) => f.severity === "critical" || f.severity === "warning");
}

async function readReconcile(deps: SimpleToolsDeps): Promise<Record<string, unknown> | null> {
  if (typeof deps.runReconcile !== "function") return null;
  try {
    const raw = await deps.runReconcile();
    return isRecord(raw) ? raw : null;
  } catch {
    return null;
  }
}

function reconcileFindings(reconcile: Record<string, unknown> | null): DoctorFinding[] {
  if (reconcile === null || !Array.isArray(reconcile.findings)) return [];
  return reconcile.findings.filter(isRecord).map((f) => ({
    code: asString(f.code) ?? "UNKNOWN",
    severity: asString(f.severity) ?? "info",
    evidence: asString(f.evidence) ?? asString(f.detail) ?? "",
  }));
}

// Reconcile signals only count when reconcile could actually classify its own
// comparison (IN_SYNC or DRIFTED). A reconcile that could not determine the actual
// state (UNKNOWN) contributes NO signal — absence of evidence is never an incident.
function reconcileSignals(reconcile: Record<string, unknown> | null): DoctorFinding[] {
  const status = reconcile === null ? null : asString(reconcile.status);
  if (status !== "IN_SYNC" && status !== "DRIFTED") return [];
  return reconcileFindings(reconcile).filter((f) => f.severity === "critical" || f.severity === "warning");
}

async function readReleaseStateSafely(deps: SimpleToolsDeps): Promise<Record<string, unknown> | null> {
  try {
    const raw = await resolveReleaseState(deps)();
    return isRecord(raw) ? raw : null;
  } catch {
    return null;
  }
}

// engineering.vps.incident.summary — "O que está acontecendo com minha VPS agora?"
// Composes ONLY existing read-only evidence into a short deterministic answer:
//   Doctor UNKNOWN                                                     -> UNKNOWN
//   Doctor critical/warning findings, Doctor DEGRADED/CRITICAL,
//   reconcile drift/warnings, or release deployStatus/smokeStatus FAIL  -> INCIDENT
//   otherwise (healthy Doctor, zero error signals)                     -> NO_INCIDENT
// No correction is ever attempted; the tool only reports what it observed.
export async function runVpsIncidentSummary(subject: string, input: unknown = {}, deps: SimpleToolsDeps = {}): Promise<Record<string, unknown>> {
  const now = deps.now ?? Date.now;
  const rejected = requireStrictEmptyInput(input);
  if (rejected !== null) return inputRejection(rejected, now);
  const doctor = await resolveDoctor(subject, deps)();
  const doctorStatusValue = doctorStatus(doctor);
  const findings = readFindings(doctor);
  const errors = errorFindingsOf(findings);
  const reconcile = await readReconcile(deps);
  const reconcileStatus = reconcile === null ? null : asString(reconcile.status);
  const signals = reconcileSignals(reconcile);
  const state = await readReleaseStateSafely(deps);
  const deployStatus = releaseStateField(state, ["deployStatus"]);
  const smokeStatus = releaseStateField(state, ["smokeStatus"]);
  const releaseFailure = deployStatus === "FAIL" || smokeStatus === "FAIL";
  const drifted = reconcileStatus === "DRIFTED";
  const incident = errors.length > 0 || doctorStatusValue === "DEGRADED" || doctorStatusValue === "CRITICAL" || drifted || signals.length > 0 || releaseFailure;
  let status: string;
  let cause: DoctorFinding | null;
  let summary: string;
  if (doctorStatusValue === "UNKNOWN") {
    status = "UNKNOWN";
    cause = null;
    summary = "Evidência insuficiente: o diagnóstico read-only não produziu classificação (status=UNKNOWN); nada inventado.";
  } else if (incident) {
    status = "INCIDENT";
    cause = errors.find((f) => f.severity === "critical") ?? errors.find((f) => f.severity === "warning") ?? signals.find((f) => f.severity === "critical") ?? signals.find((f) => f.severity === "warning") ?? null;
    summary = cause !== null
      ? `Incidente observado: ${cause.code} (${cause.severity}).`
      : drifted
        ? "Incidente observado: drift entre o estado esperado (release-state) e o estado atual evidenciado."
        : releaseFailure
          ? `Incidente observado no estado do release: deployStatus='${deployStatus}', smokeStatus='${smokeStatus}'.`
          : "Incidente observado nos findings read-only.";
  } else {
    status = "NO_INCIDENT";
    cause = null;
    summary = "Nenhum incidente observado: Doctor saudável sem erros e nenhuma condição de problema nos mecanismos read-only (Reconcile quando disponível).";
  }
  return {
    status,
    incident: status === "INCIDENT" ? true : status === "NO_INCIDENT" ? false : null,
    doctorStatus: doctorStatusValue,
    cause,
    findings,
    reconcile: reconcile === null ? null : { status: reconcileStatus, findings: reconcileFindings(reconcile) },
    release: state === null ? null : { deployStatus, smokeStatus },
    server: isRecord(doctor.server) ? doctor.server : null,
    checkedAt: new Date(now()).toISOString(),
    summary,
  };
}

// engineering.deploy.ready — "É seguro fazer deploy agora?"
// Strictly ADVISORY: answers whether the OBSERVED read-only state permits
// considering the environment ready. It NEVER deploys, NEVER calls
// engineering.vps.change.safe, NEVER calls the Guardian write mode and NEVER
// approves anything — it only reads the certified Doctor pass, the certified
// reconcile pass (when wired) and the release-state deploy/smoke status.
//   Doctor UNKNOWN                                        -> UNKNOWN
//   Doctor critical/warning findings, failed last deployment,
//   deployment activity (active/queued), release deployStatus
//   != PASS / smokeStatus != PASS, or reconcile
//   DEPLOY_IN_PROGRESS / DEPLOY_FAILED                     -> NOT_READY
//   otherwise (healthy Doctor, zero activity)              -> READY
export async function runDeployReady(subject: string, input: unknown = {}, deps: SimpleToolsDeps = {}): Promise<Record<string, unknown>> {
  const now = deps.now ?? Date.now;
  const rejected = requireStrictEmptyInput(input);
  if (rejected !== null) return inputRejection(rejected, now);
  const doctor = await resolveDoctor(subject, deps)();
  const doctorStatusValue = doctorStatus(doctor);
  const findings = readFindings(doctor);
  const deployments = isRecord(doctor.deployments) ? doctor.deployments : {};
  const active = countOf(deployments.active);
  const queued = countOf(deployments.queued);
  const lastStatus = asString(deployments.lastStatus);
  const reconcile = await readReconcile(deps);
  const reconcileStatus = reconcile === null ? null : asString(reconcile.status);
  const reconcileDeployActivity = reconcileSignals(reconcile).filter((f) => f.code === "DEPLOY_IN_PROGRESS" || f.code === "DEPLOY_FAILED");
  const state = await readReleaseStateSafely(deps);
  const deployStatus = releaseStateField(state, ["deployStatus"]);
  const smokeStatus = releaseStateField(state, ["smokeStatus"]);
  const blockers: string[] = [];
  for (const f of errorFindingsOf(findings)) blockers.push(`${f.code}(${f.severity})`);
  if (lastStatus === "failed") blockers.push("lastDeploymentFailed");
  if (active > 0 || queued > 0) blockers.push("deploymentActivity");
  if (deployStatus !== null && deployStatus !== "PASS") blockers.push(`releaseDeployStatus=${deployStatus}`);
  if (smokeStatus !== null && smokeStatus !== "PASS") blockers.push(`releaseSmokeStatus=${smokeStatus}`);
  for (const f of reconcileDeployActivity) blockers.push(`reconcile.${f.code}`);
  let status: string;
  let summary: string;
  if (doctorStatusValue === "UNKNOWN") {
    status = "UNKNOWN";
    summary = "Evidência insuficiente: o diagnóstico read-only não produziu classificação (status=UNKNOWN); nada inventado.";
  } else if (blockers.length > 0) {
    status = "NOT_READY";
    summary = `Condições impeditivas observadas: ${blockers.join(", ")}. Nada é executado, aprovado ou deployado por esta tool.`;
  } else if (doctorStatusValue === "HEALTHY") {
    status = "READY";
    const note = hasFinding(findings, "NO_APPLICATIONS_MANAGED") ? " (observação: nenhuma aplicação gerenciada no Dokploy)" : "";
    const releaseNote = state === null ? "release-state indisponível (avaliação baseada no Doctor)" : `release ${deployStatus}/${smokeStatus ?? "sem smoke"}`;
    summary = `Estado observado permite considerar o ambiente pronto: Doctor HEALTHY, sem atividade de deployment, ${releaseNote}${note}. Nada é executado, aprovado ou deployado por esta tool.`;
  } else {
    status = "UNKNOWN";
    summary = `Estado do ambiente indeterminado para deploy (Doctor ${doctorStatusValue} sem condições impeditivas legíveis); nada inventado.`;
  }
  return {
    status,
    ready: status === "READY" ? true : status === "NOT_READY" ? false : null,
    blockers,
    doctorStatus: doctorStatusValue,
    deploymentState: { active, queued, lastStatus: lastStatus ?? null },
    release: state === null ? null : { deployStatus, smokeStatus },
    reconcile: reconcile === null ? null : { status: reconcileStatus, findings: reconcileFindings(reconcile) },
    findings,
    checkedAt: new Date(now()).toISOString(),
    summary,
  };
}

// engineering.docker.health — "Meus containers estão saudáveis?"
// Uses ONLY Docker/cluster evidence already available from the certified Doctor
// pass (Swarm node state, manager reachability, server status; NO docker CLI, NO
// SSH, NO agent, NO new privileged path). Per-container inspection does NOT exist
// in the certified mechanisms of this MVP — the tool never pretends it does
// (containerLevelEvidence is always false here) and returns UNKNOWN instead of
// inventing container health. Classification:
//   Doctor UNKNOWN                                -> UNKNOWN
//   critical Docker/Swarm finding                 -> CRITICAL
//   warning Docker/Swarm finding                  -> DEGRADED
//   zero managed applications (Doctor)            -> NO_CONTAINERS
//   healthy Doctor + managed application present  -> HEALTHY
//   anything else                                 -> UNKNOWN
export async function runDockerHealth(subject: string, input: unknown = {}, deps: SimpleToolsDeps = {}): Promise<Record<string, unknown>> {
  const now = deps.now ?? Date.now;
  const rejected = requireStrictEmptyInput(input);
  if (rejected !== null) return inputRejection(rejected, now);
  const doctor = await resolveDoctor(subject, deps)();
  const vpsStatus = doctorStatus(doctor);
  const findings = readFindings(doctor);
  const dockerFindings = findings.filter((f) => DOCKER_INFRA_PATTERN.test(f.code));
  const application = isRecord(doctor.application) ? doctor.application : null;
  const server = isRecord(doctor.server) ? doctor.server : null;
  let status: string;
  let summary: string;
  if (vpsStatus === "UNKNOWN") {
    status = "UNKNOWN";
    summary = "Evidência insuficiente: o diagnóstico read-only não produziu classificação (status=UNKNOWN); nada inventado.";
  } else if (dockerFindings.some((f) => f.severity === "critical")) {
    status = "CRITICAL";
    summary = `Evidência Docker/Swarm crítica: ${dockerFindings.filter((f) => f.severity === "critical").map((f) => f.code).join(", ")}.`;
  } else if (dockerFindings.some((f) => f.severity === "warning")) {
    status = "DEGRADED";
    summary = `Evidência Docker/Swarm degradada: ${dockerFindings.filter((f) => f.severity === "warning").map((f) => f.code).join(", ")}.`;
  } else if (hasFinding(findings, "NO_APPLICATIONS_MANAGED")) {
    status = "NO_CONTAINERS";
    summary = "Nenhum container gerenciado: o mecanismo certificado não reporta aplicações gerenciadas; estado informativo, nada inventado.";
  } else if (vpsStatus === "HEALTHY" && application !== null) {
    status = "HEALTHY";
    summary = "Evidência Docker/Swarm saudável (nó/manager prontos) com aplicação gerenciada presente; inspeção por container não existe nos mecanismos certificados atuais — nada inventado.";
  } else {
    status = "UNKNOWN";
    summary = "Evidência insuficiente para avaliar a saúde dos containers: inspeção por container não existe nos mecanismos certificados atuais; nada inventado.";
  }
  return {
    status,
    server,
    nodeEvidence: server === null ? null : {
      status: asString(server.status),
      nodeStatus: asString(server.nodeStatus),
      availability: asString(server.availability),
      role: asString(server.role),
    },
    dockerFindings,
    findings,
    containerLevelEvidence: false,
    checkedAt: new Date(now()).toISOString(),
    summary,
  };
}

// engineering.logs.explain — "O que esses erros/logs significam?"
// First version WITHOUT LLM: explains ONLY the structured findings already
// observable through the certified Doctor pass (which itself reads application
// logs through its read-only primitives) using a fixed deterministic table of
// known finding codes. It accepts NO log text, NO file path, NO URL (strict {}
// input) and never fetches logs via shell/SSH. Classification:
//   Doctor UNKNOWN                                    -> UNKNOWN
//   zero critical/warning findings                    -> NO_ERRORS
//   error findings with at least one known code        -> EXPLAINED (unknown ones listed)
//   error findings, none with a known explanation      -> UNKNOWN
const LOG_EXPLANATIONS: Record<string, string> = {
  UPSTREAM_ERROR: "Falha no canal upstream do diagnóstico: o primitivo read-only não conseguiu consultar a fonte, então nada pôde ser observado por ele.",
  NO_SERVERS: "Nenhum servidor registrado no Dokploy: não há VPS para o diagnóstico observar.",
  NODE_MISSING: "O nó Swarm esperado não foi encontrado no cluster: o runtime de containers do servidor não está visível.",
  NODE_NOT_READY: "O nó Swarm existe mas não está 'ready': o runtime de containers do nó não está apto a executar cargas.",
  NODE_NOT_ACTIVE: "O nó Swarm não está com disponibilidade 'active': ele não recebe novas cargas até ser reativado.",
  MANAGER_UNREACHABLE: "O manager do Swarm não respondeu: o plano de controle do cluster está inacessível.",
  MANAGER_LEADER_NOT_IDENTIFIED: "Nenhum líder de manager foi identificado: o plano de controle do Swarm está degradado.",
  SERVER_STATUS_NOT_ACTIVE: "O servidor no Dokploy não está com status 'active'.",
  DEPLOYMENT_FAILED: "O último deployment da aplicação terminou com falha (status 'error' no Dokploy).",
  DEPLOYMENT_IN_FLIGHT: "Existe um deployment em andamento: estado transitório de deploy, aguarde a conclusão.",
  QUEUE_PENDING: "Existem deployments na fila aguardando execução.",
  TARGET_NOT_FOUND: "O alvo resolvido deterministicamente não foi encontrado no Dokploy (removido ou renomeado).",
  TARGET_AMBIGUOUS: "Há mais de um candidato para o alvo e a seleção determinística não pôde resolver.",
  NO_APPLICATIONS_MANAGED: "Nenhum aplicativo gerenciado pelo Dokploy: estado informativo, não é um erro.",
};

export async function runLogsExplain(subject: string, input: unknown = {}, deps: SimpleToolsDeps = {}): Promise<Record<string, unknown>> {
  const now = deps.now ?? Date.now;
  const rejected = requireStrictEmptyInput(input);
  if (rejected !== null) return inputRejection(rejected, now);
  const doctor = await resolveDoctor(subject, deps)();
  const doctorStatusValue = doctorStatus(doctor);
  const findings = readFindings(doctor);
  const errors = errorFindingsOf(findings);
  const explained = findings
    .filter((f) => LOG_EXPLANATIONS[f.code] !== undefined)
    .map((f) => ({ code: f.code, severity: f.severity, evidence: f.evidence, explanation: LOG_EXPLANATIONS[f.code] }));
  const unexplained = findings.filter((f) => LOG_EXPLANATIONS[f.code] === undefined).map((f) => f.code);
  const explainedErrors = errors.filter((f) => LOG_EXPLANATIONS[f.code] !== undefined);
  let status: string;
  let summary: string;
  if (doctorStatusValue === "UNKNOWN") {
    status = "UNKNOWN";
    summary = "Evidência insuficiente: o diagnóstico read-only não produziu classificação (status=UNKNOWN); nada inventado.";
  } else if (errors.length === 0) {
    status = "NO_ERRORS";
    summary = `Nenhum erro observado nos findings read-only (${findings.length} finding(s) informativo(s)); logs verificados pelo mecanismo: ${doctor.logsChecked === true ? "sim" : "não"}.`;
  } else if (explainedErrors.length > 0) {
    status = "EXPLAINED";
    summary = `${explainedErrors.length} de ${errors.length} erro(s) explicados deterministicamente pelos códigos conhecidos${unexplained.length > 0 ? `; sem explicação conhecida: ${unexplained.join(", ")}` : ""}.`;
  } else {
    status = "UNKNOWN";
    summary = "Evidência insuficiente: nenhum dos erros observados tem explicação determinística conhecida; nada inventado.";
  }
  return {
    status,
    errorCount: errors.length,
    explained,
    unexplained,
    logsChecked: doctor.logsChecked === true,
    findings,
    checkedAt: new Date(now()).toISOString(),
    summary,
  };
}

// engineering.deploy.status — "Meu deploy está funcionando?"
// Deterministic projection of the Doctor's deployment evidence ONLY:
//   NO_APPLICATIONS_MANAGED first — zero applications is NOT a VPS failure;
//   doctor UNKNOWN -> UNKNOWN; no deterministically resolved application -> UNKNOWN;
//   lastStatus failed / DEPLOYMENT_FAILED -> FAILED;
//   active>0 / DEPLOYMENT_IN_FLIGHT / lastStatus in_flight -> IN_FLIGHT;
//   queued>0 / QUEUE_PENDING -> PENDING;
//   lastStatus success -> OK; anything else -> UNKNOWN. Never deploys/recovers.
export async function runDeployStatus(subject: string, input: unknown = {}, deps: SimpleToolsDeps = {}): Promise<Record<string, unknown>> {
  const now = deps.now ?? Date.now;
  const rejected = requireStrictEmptyInput(input);
  if (rejected !== null) return inputRejection(rejected, now);
  const doctor = await resolveDoctor(subject, deps)();
  const doctorStatusValue = doctorStatus(doctor);
  const findings = readFindings(doctor);
  const deployments = isRecord(doctor.deployments) ? doctor.deployments : {};
  const application = isRecord(doctor.application)
    ? {
        id: asString(doctor.application.id) ?? asString(doctor.application.applicationId) ?? "",
        name: asString(doctor.application.name) ?? asString(doctor.application.appName) ?? "",
        status: asString(doctor.application.status) ?? asString(doctor.application.applicationStatus),
      }
    : null;
  const asCount = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);
  const active = asCount(deployments.active);
  const queued = asCount(deployments.queued);
  const lastStatus = asString(deployments.lastStatus);
  const deploymentState = { application, active, queued, lastStatus };

  let status: string;
  let summary: string;
  if (application === null && hasFinding(findings, "NO_APPLICATIONS_MANAGED")) {
    status = "NO_APPLICATIONS_MANAGED";
    summary = "Nenhuma application gerenciada no Dokploy: estado de deployment informativo e não é falha da VPS.";
  } else if (doctorStatusValue === "UNKNOWN") {
    status = "UNKNOWN";
    summary = "Estado de deployment indeterminado: o diagnóstico read-only não produziu evidência suficiente (status=UNKNOWN); nada inventado.";
  } else if (application === null) {
    status = "UNKNOWN";
    summary = "Estado de deployment indeterminado: nenhuma aplicação alvo resolvida deterministicamente; nada inventado.";
  } else if (lastStatus === "failed" || hasFinding(findings, "DEPLOYMENT_FAILED")) {
    status = "FAILED";
    summary = `Deployment com problema na aplicação '${application.name}': último deployment '${lastStatus ?? "unknown"}'.`;
  } else if (lastStatus === "in_flight" || hasFinding(findings, "DEPLOYMENT_IN_FLIGHT") || active > 0) {
    status = "IN_FLIGHT";
    summary = `Deployment em andamento na aplicação '${application.name}' (ativos=${active}, fila=${queued}).`;
  } else if (queued > 0 || hasFinding(findings, "QUEUE_PENDING")) {
    status = "PENDING";
    summary = `Fila de deployment pendente na aplicação '${application.name}' (fila=${queued}).`;
  } else if (lastStatus === "success") {
    status = "OK";
    summary = `Deployment saudável na aplicação '${application.name}': último deployment 'success' (ativos=${active}, fila=${queued}).`;
  } else {
    status = "UNKNOWN";
    summary = `Estado de deployment indeterminado na aplicação '${application.name}' (último deployment '${lastStatus ?? "unknown"}'); nada inventado.`;
  }

  return { status, deploymentState, summary, findings, checkedAt: new Date(now()).toISOString() };
}
