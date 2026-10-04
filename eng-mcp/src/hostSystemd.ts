/**
 * ENG-HOST-GOVERNED-OPS-01 (04/10) — engineering.host.systemd: operações
 * systemd do HOST governadas a partir do eng-mcp.
 *
 * O MCP não enxerga o systemd do host: daemon-reload/restart de units ficavam
 * fora de trilho (DEFER-HOST-SIDE manual do supervisor). A ponte aprovada:
 * agente mínimo NO HOST (unit dedicada eng-mcp-host-ops-agent.service,
 * src/hostOpsAgent.ts) expondo unix socket (NUNCA rede TCP) sob /data — o
 * container já monta /data rw, então o socket é visível dos dois lados sem
 * recriar container. O agente valida CADA request contra a própria catálogo em
 * nível de sistema (defesa em profundidade: o guard do MCP NÃO é a única
 * barreira) e executa systemctl por argv exato (zero shell; mutação via sudo
 * allowlistado por comando exato — o agente NÃO roda com root genérico).
 *
 * Roteador 4-andares (mesma doutrina do engineering.shell.run):
 * - TIER 0 (ANTES de tudo, vence TUDO — inclusive operatorOrder): units
 *   críticas (sshd, docker, o próprio agente, orquestrador, systemd core) e
 *   verbos nunca expostos (disable, mask, kill, reset-failed, edit, power
 *   lifecycle) → recusa tipada HOST_OPS_FORBIDDEN, nada enviado ao socket.
 * - TIER 1 (custo zero): catálogo versionado por componente
 *   /data/audit/host-ops-allowlist-<componente>.json — regras por
 *   `verb unit args` (mesmo formato do shell-allowlist) + mutationUnits
 *   (units de mutação). Read-only (status/show/is-active/is-enabled/
 *   list-units) executa direto; mutação (restart/reload/daemon-reload) só
 *   para units EM mutationUnits e SEMPRE exige operatorOrder verificado
 *   (SEC-OPERATOR-IDENTITY-01: token de ordem + arquivo de hash 0600 —
 *   /data/manifests/operator-order-token.json). sha16 do catálogo vai ao
 *   audit de toda decisão.
 * - TIER 2: leitura fora do catálogo → Jev classifica (4 perguntas band-2,
 *   safeScore >= 0.9) → encaminha ao agente ou recusa; judge indisponível =
 *   fail-closed (HOST_OPS_JUDGE_UNAVAILABLE). O AGENTE continua
 *   determinístico (zero LLM dentro do daemon privilegiado) e recusa por
 *   conta própria o que seu catálogo não cobre — fail-closed honesto no host.
 * - TIER 3: operador — operatorOrder verificado encaminha ao agente (que
 *   ainda aplica a própria catálogo; unidade fora dela = HOST_AGENT_REFUSED).
 *
 * Audit: toda decisão (executada/recusada, dos DOIS lados) em
 * /data/audit/host-ops.jsonl — commandSha16/tier/rule/unit/verb/duração, mesmo
 * padrão do shell-run.jsonl. Anti-frágil: socket ausente/parado/mudo →
 * HOST_AGENT_UNAVAILABLE tipado (nunca finge execução); liveness honesta no
 * orchestrate.list (presença do socket) + op=ping com resposta real.
 *
 * NOTA DE INTEGRAÇÃO (SEC-OPERATOR-IDENTITY-01, irmã em voo): a verificação do
 * operatorOrder consome o verificador COMPARTILHADO da irmã
 * SEC-OPERATOR-IDENTITY-01 (operatorToken.ts, commit 1b6f6e3f — aterrissou em
 * main ANTES deste commit): mesma interface (operatorOrder + arquivo de hash
 * 0600 — modo 0600, revoked/disabled, version 1, TTL, hash16 de
 * autointegridade sobre corpo canônico). verifyOperatorOrderLocal é wrapper de
 * delegação (nome preservado para deps.verifyToken e testes).
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { connect as netConnect } from "node:net";
import * as z from "zod/v4";
import { EngineeringError } from "./policy.js";
import { assertSupervisorMutationAllowed } from "./supervisorGuard.ts";
import { verifyOperatorOrderToken, operatorTokenPath, type OperatorOrderVerdict } from "./operatorToken.ts";

export const HOST_SYSTEMD_TOOL = "engineering.host.systemd";
/** Socket unix da ponte container→host (sob /data: o bind mount do container
 *  já o expõe; socket de rede TCP é PROIBIDO pelo design aprovado). */
export const HOST_OPS_SOCKET_DEFAULT = "/data/host-ops/agent.sock";
export const HOST_OPS_AUDIT_DEFAULT = "/data/audit/host-ops.jsonl";
export const HOST_OPS_ALLOWLIST_DIR_DEFAULT = "/data/audit";
/** Timeout do round-trip ao agente (socket). */
export const HOST_OPS_AGENT_TIMEOUT_DEFAULT_MS = 15_000;
export const HOST_OPS_AGENT_TIMEOUT_MAX_MS = 60_000;
export const HOST_OPS_JUDGE_THRESHOLD = 0.9;

/** Verbos da 1ª fase. Read-only executa sem ordem; mutação exige operatorOrder. */
export const HOST_OPS_READ_VERBS: ReadonlyArray<string> = ["status", "show", "is-active", "is-enabled", "list-units"];
export const HOST_OPS_MUTATION_VERBS: ReadonlyArray<string> = ["restart", "reload", "daemon-reload"];
export const HOST_OPS_PHASE1_VERBS: ReadonlyArray<string> = [...HOST_OPS_READ_VERBS, ...HOST_OPS_MUTATION_VERBS];

/** TIER 0 — verbos NUNCA expostos (vencem até operatorOrder). */
export const TIER0_FORBIDDEN_VERBS: ReadonlyArray<string> = [
  "disable", "mask", "kill", "reset-failed", "edit",
  "reboot", "poweroff", "halt", "kexec", "suspend", "hibernate",
  "isolate", "emergency", "rescue", "link", "revert", "set-default", "freeze", "thaw"
];

/** TIER 0 — units críticas (comparadas pelo nome base, sem sufixo: cobre .service/.socket/.timer). */
export const TIER0_FORBIDDEN_UNITS: ReadonlyArray<string> = [
  "sshd", "ssh", "docker", "containerd", "eng-mcp-host-ops-agent",
  "orch-daemon-consume", "or-mission-supervisor", "mission-watcher",
  "herdr-server", "oom-sentinel", "systemd", "systemd-journald", "systemd-logind",
  "systemd-udevd", "systemd-networkd", "systemd-resolved", "systemd-timesyncd"
];

export const HOST_OPS_TIER2_QUESTIONS: ReadonlyArray<{ id: string; instructions: string }> = [
  { id: "q_destructive", instructions: "Does this systemd operation destroy, stop or destabilize a service or system state outside its obvious read-only intent? noul means the destructive risk applies." },
  { id: "q_outward_facing", instructions: "Does this systemd operation send data or requests to systems outside this machine? noul means it reaches the outside." },
  { id: "q_touches_credentials", instructions: "Does this systemd operation read, move or expose credentials, tokens, keys or secret files? noul means it touches credentials." },
  { id: "q_large_blast_radius", instructions: "If this systemd operation misbehaves, would the impact extend beyond this working session (shared services, other missions, the host itself)? noul means yes." }
];

const UNIT_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.@\\:-]{0,127}$/;
const VERB_RE = /^[a-z][a-z-]{0,23}$/;
const ARG_RE = /^[A-Za-z0-9_.@%+=:\\/-]{1,200}$/;
const MANAGER_KEY = "(manager)";

export type HostSystemdInput = {
  op?: "exec" | "ping";
  verb?: string;
  unit?: string;
  args?: string[];
  operatorOrder?: string;
  component?: string;
  timeoutMs?: number;
};

export const hostSystemdInputSchema = z.object({
  op: z.enum(["exec", "ping"]).optional(),
  verb: z.string().max(32).optional(),
  unit: z.string().max(160).optional(),
  args: z.array(z.string().max(200)).max(8).optional(),
  operatorOrder: z.string().min(8).max(400).optional(),
  component: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,31}$/).optional(),
  timeoutMs: z.number().int().min(1000).max(HOST_OPS_AGENT_TIMEOUT_MAX_MS).optional()
}).strict();

/** Normaliza o nome da unit para comparação (sufixo fora). */
export function normalizeUnitName(unit: string): string {
  return unit.trim().replace(/\.(service|socket|timer|target|path|mount|slice|scope)$/i, "").toLowerCase();
}

export function isValidUnitName(unit: string): boolean {
  if (!UNIT_NAME_RE.test(unit)) return false;
  if (unit.includes("..") || unit.includes("/") || unit.includes("*") || unit.includes("?") || unit.includes("[")) return false;
  return true;
}

/** Chave canônica `verb unit args` (o formato que o catálogo casa por regex). */
export function canonicalHostOp(verb: string, unit: string | null, args: readonly string[]): string {
  return [verb, unit ?? "", ...args].filter((part) => part.length > 0).join(" ");
}

// ---------------------------------------------------------------------------
// Catálogo (mesmo formato do shell-allowlist + mutationUnits)
// ---------------------------------------------------------------------------

export type HostOpsAllowlistRule = { id: string; pattern: string };
export type HostOpsAllowlistCatalog = {
  component: string;
  version: number;
  rules: HostOpsAllowlistRule[];
  mutationUnits?: string[];
  updatedAt?: string;
  note?: string;
};

export type LoadedHostOpsAllowlist =
  | { ok: true; component: string; path: string; sha16: string; rules: Array<{ id: string; regex: RegExp }>; mutationUnits: string[] }
  | { ok: false; path: string; error: string }
  | null;

const COMPONENT_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const RULE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function hostOpsAllowlistCatalogPath(component: string, dir: string = process.env.ENG_MCP_HOST_OPS_ALLOWLIST_DIR ?? HOST_OPS_ALLOWLIST_DIR_DEFAULT): string {
  return `${dir.replace(/\/$/, "")}/host-ops-allowlist-${component}.json`;
}

export function validateHostOpsAllowlistCatalog(raw: unknown, expectedComponent?: string): { ok: true; catalog: HostOpsAllowlistCatalog } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: "catalog must be a JSON object" };
  const cat = raw as Record<string, unknown>;
  if (typeof cat.component !== "string" || !COMPONENT_RE.test(cat.component)) return { ok: false, error: "component field missing/invalid" };
  if (expectedComponent && cat.component !== expectedComponent) return { ok: false, error: `component mismatch (catalog says ${cat.component}, expected ${expectedComponent})` };
  if (typeof cat.version !== "number" || !Number.isInteger(cat.version) || cat.version < 1) return { ok: false, error: "version must be integer >= 1" };
  if (!Array.isArray(cat.rules)) return { ok: false, error: "rules must be an array" };
  const seen = new Set<string>();
  for (const rule of cat.rules) {
    if (typeof rule !== "object" || rule === null) return { ok: false, error: "rule must be an object" };
    const r = rule as Record<string, unknown>;
    if (typeof r.id !== "string" || !RULE_ID_RE.test(r.id)) return { ok: false, error: `rule id invalid: ${JSON.stringify(r.id)}` };
    if (typeof r.pattern !== "string" || r.pattern.length === 0 || r.pattern.length > 500) return { ok: false, error: `rule ${r.id}: pattern missing/too long` };
    try {
      // eslint-disable-next-line no-new
      new RegExp(r.pattern);
    } catch (error) {
      return { ok: false, error: `rule ${r.id}: pattern does not compile (${error instanceof Error ? error.message : String(error)})` };
    }
    if (seen.has(r.id)) return { ok: false, error: `duplicate rule id: ${r.id}` };
    seen.add(r.id);
  }
  const catalog: HostOpsAllowlistCatalog = {
    component: cat.component,
    version: cat.version,
    rules: (cat.rules as HostOpsAllowlistRule[]).map((r) => ({ id: r.id, pattern: r.pattern }))
  };
  if (cat.mutationUnits !== undefined) {
    if (!Array.isArray(cat.mutationUnits)) return { ok: false, error: "mutationUnits must be an array" };
    const units = new Set<string>();
    for (const entry of cat.mutationUnits) {
      if (typeof entry !== "string" || entry.length === 0 || entry.length > 160) return { ok: false, error: `mutationUnit invalid: ${JSON.stringify(entry)}` };
      if (entry !== MANAGER_KEY && !isValidUnitName(entry)) return { ok: false, error: `mutationUnit invalid unit name: ${entry}` };
      if (units.has(entry)) return { ok: false, error: `duplicate mutationUnit: ${entry}` };
      units.add(entry);
    }
    catalog.mutationUnits = (cat.mutationUnits as string[]).slice();
  }
  if (typeof cat.updatedAt === "string") catalog.updatedAt = cat.updatedAt;
  if (typeof cat.note === "string") catalog.note = cat.note;
  return { ok: true, catalog };
}

export function loadHostOpsAllowlistCatalog(component: string, dir?: string): LoadedHostOpsAllowlist {
  if (!COMPONENT_RE.test(component)) return { ok: false, path: "", error: `invalid component id: ${component}` };
  const path = hostOpsAllowlistCatalogPath(component, dir);
  if (!existsSync(path)) return null;
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    return { ok: false, path, error: `catalog unreadable: ${error instanceof Error ? error.message : String(error)}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { ok: false, path, error: `catalog JSON invalid: ${error instanceof Error ? error.message : String(error)}` };
  }
  const validated = validateHostOpsAllowlistCatalog(parsed, component);
  if (!validated.ok) return { ok: false, path, error: validated.error };
  const rules: Array<{ id: string; regex: RegExp }> = [];
  for (const rule of validated.catalog.rules) {
    try {
      rules.push({ id: rule.id, regex: new RegExp(rule.pattern) });
    } catch {
      return { ok: false, path, error: `rule ${rule.id}: pattern does not compile` };
    }
  }
  return {
    ok: true, component, path, sha16: createHash("sha256").update(raw).digest("hex").slice(0, 16),
    rules, mutationUnits: validated.catalog.mutationUnits ?? []
  };
}

// ---------------------------------------------------------------------------
// Classificação (tier-0 > tier-1 > tier-2/tier-3)
// ---------------------------------------------------------------------------

export type HostCommandClass = { tier: 0 | 1 | 2 | 3; rule?: string; reason?: string; code?: string };

export type ClassifyHostOpInput = { verb: string; unit: string | null; args: string[] };

export function classifyHostOp(
  input: ClassifyHostOpInput,
  allowlist: LoadedHostOpsAllowlist
): HostCommandClass {
  // TIER 0 — vence TUDO (mesmo operatorOrder; provado no contrato).
  if (TIER0_FORBIDDEN_VERBS.includes(input.verb)) {
    return { tier: 0, rule: `verb:${input.verb}`, reason: `verb '${input.verb}' is never exposed (critical host control)`, code: "HOST_OPS_FORBIDDEN" };
  }
  if (input.unit && TIER0_FORBIDDEN_UNITS.includes(normalizeUnitName(input.unit))) {
    return { tier: 0, rule: `unit:${normalizeUnitName(input.unit)}`, reason: `unit '${input.unit}' is a critical host unit (tier-0 wins over operatorOrder)`, code: "HOST_OPS_FORBIDDEN" };
  }
  const isRead = HOST_OPS_READ_VERBS.includes(input.verb);
  const isMutation = HOST_OPS_MUTATION_VERBS.includes(input.verb);
  const mutationUnits = allowlist && allowlist.ok ? allowlist.mutationUnits : [];
  const inMutationUnits = input.verb === "daemon-reload"
    ? mutationUnits.includes(MANAGER_KEY)
    : Boolean(input.unit && mutationUnits.some((entry) => normalizeUnitName(entry) === normalizeUnitName(input.unit!)));
  if (isRead) {
    // TIER 1 leitura: regra do catálogo casa `verb unit args` OU a unit é de
    // mutação (units de mutação são sempre legíveis).
    if (allowlist && allowlist.ok) {
      const canonical = canonicalHostOp(input.verb, input.unit, input.args);
      const matched = allowlist.rules.find((rule) => rule.regex.test(canonical));
      if (matched) return { tier: 1, rule: `catalog:${matched.id}` };
      if (inMutationUnits) return { tier: 1, rule: "catalog:mutation-unit-read" };
    }
    return { tier: 2, rule: "outside_allowlist" };
  }
  if (isMutation) {
    if (inMutationUnits) return { tier: 1, rule: "catalog:mutation-unit" };
    // mutação fora do catálogo de mutação = consequência de operador (tier 3) —
    // o agente continua recusando por conta própria se a unit não estiver na
    // catálogo dele (defesa em profundidade).
    return { tier: 3, rule: "mutation_outside_catalog", reason: `mutation '${input.verb}' on '${input.unit ?? "(manager)"}' is outside the mutation catalog — operator consequence` };
  }
  // verbo fora da 1ª fase: só operador (o agente recusa verdes fora da lista).
  return { tier: 3, rule: "verb_outside_phase1", reason: `verb '${input.verb}' is not exposed in phase 1 — operator consequence` };
}

// ---------------------------------------------------------------------------
// Verificação de operatorOrder (interface de arquivo da irmã
// SEC-OPERATOR-IDENTITY-01; verificador COMPARTILHADO consumido por delegação)
// ---------------------------------------------------------------------------

/** canonicalJson do corpo canônico do token — ÚNICA fonte: orchPreauthArtifact.ts (irmã). */
export { canonicalJson as canonicalJsonHostOps } from "./orchPreauthArtifact.ts";

export type HostOpsOrderVerdict = OperatorOrderVerdict;

/**
 * Delegação ao verificador compartilhado (operatorToken.ts da irmã, commit
 * 1b6f6e3f — aterrissou ANTES deste commit, então o contrato manda CONSUMIR o
 * verificador dela em vez de replicar). Fail-closed em TODOS os estados;
 * nunca loga o token (só hash16).
 */
export function verifyOperatorOrderLocal(candidate: string, path: string = operatorTokenPath(), now: number = Date.now()): HostOpsOrderVerdict {
  return verifyOperatorOrderToken(candidate, path, now);
}

// ---------------------------------------------------------------------------
// Cliente do socket (container → agente no host)
// ---------------------------------------------------------------------------

export type HostAgentRequest = {
  id: string;
  op: "exec" | "ping";
  verb?: string;
  unit?: string | null;
  args?: string[];
  operatorOrder?: string | null;
  ts: string;
};

export type HostAgentResponse = {
  ok: boolean;
  pong?: boolean;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  truncated?: boolean;
  durationMs?: number;
  agentCatalogSha16?: string | null;
  agentVersion?: number;
  code?: string;
  reason?: string;
};

export class HostAgentUnavailableError extends Error {
  readonly detail: string;
  constructor(detail: string) {
    super(`HOST_AGENT_UNAVAILABLE: ${detail}`);
    this.detail = detail;
  }
}

const AGENT_RESPONSE_MAX_BYTES = 1_000_000;

/** Um request por conexão; JSON + "\n" nos dois sentidos. */
export function connectHostAgent(socketPath: string, request: HostAgentRequest, timeoutMs: number): Promise<HostAgentResponse> {
  return new Promise((resolvePromise, rejectPromise) => {
    let buffer = "";
    const socket = netConnect(socketPath);
    const timer = setTimeout(() => {
      socket.destroy();
      rejectPromise(new HostAgentUnavailableError(`no response within ${timeoutMs}ms`));
    }, timeoutMs);
    const fail = (detail: string): void => {
      clearTimeout(timer);
      socket.destroy();
      rejectPromise(new HostAgentUnavailableError(detail));
    };
    socket.on("error", (error: NodeJS.ErrnoException) => {
      fail(error.code ? `${error.code} on ${socketPath}` : String(error));
    });
    socket.on("connect", () => {
      socket.write(`${JSON.stringify(request)}\n`, "utf8");
    });
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      if (Buffer.byteLength(buffer, "utf8") > AGENT_RESPONSE_MAX_BYTES) {
        fail(`response exceeds ${AGENT_RESPONSE_MAX_BYTES} bytes`);
        return;
      }
      const newline = buffer.indexOf("\n");
      if (newline === -1) return;
      const line = buffer.slice(0, newline);
      clearTimeout(timer);
      socket.end();
      try {
        const parsed = JSON.parse(line) as HostAgentResponse;
        if (!parsed || typeof parsed !== "object" || typeof parsed.ok !== "boolean") {
          rejectPromise(new Error("HOST_AGENT_BAD_RESPONSE: response is not a typed envelope"));
          return;
        }
        resolvePromise(parsed);
      } catch {
        rejectPromise(new Error("HOST_AGENT_BAD_RESPONSE: response is not valid JSON"));
      }
    });
  });
}

/** Liveness honesta (presença) para o orchestrate.list — sincrona por desenho
 *  do list; presença ≠ resposta (a resposta real é op=ping da tool). */
export function hostOpsSocketState(): { socketPath: string; present: boolean; isSocket: boolean; note: string } {
  const socketPath = process.env.ENG_MCP_HOST_OPS_SOCKET ?? HOST_OPS_SOCKET_DEFAULT;
  try {
    const st = statSync(socketPath);
    const isSocket = st.isSocket();
    return { socketPath, present: true, isSocket, note: isSocket ? "socket file present (presence ≠ alive; use engineering.host.systemd op=ping for a real round-trip)" : "path exists but is not a socket" };
  } catch {
    return { socketPath, present: false, isSocket: false, note: "socket absent — agent not deployed or stopped (HOST_AGENT_UNAVAILABLE expected)" };
  }
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export type HostOpsResult = {
  tool: string;
  status: "executed" | "refused";
  tier: 0 | 1 | 2 | 3;
  op: "exec" | "ping";
  verb: string | null;
  unit: string | null;
  args: string[];
  code?: string;
  reason?: string;
  rule?: string;
  component: string;
  catalog: { path: string | null; sha16: string | null; error?: string };
  orderHash16?: string;
  exitCode?: number | null;
  durationMs?: number;
  stdout?: string;
  stderr?: string;
  truncated?: boolean;
  agentCatalogSha16?: string | null;
  agentRefused?: boolean;
  audit: string;
};

export type HostRunDeps = {
  judge?: (input: { state: string; questions: ReadonlyArray<{ id: string; instructions: string }> })
    => Promise<{ answers: Array<{ id: string; probability: number }> }>;
  send?: (request: HostAgentRequest, timeoutMs: number) => Promise<HostAgentResponse>;
  socketPath?: string;
  auditFile?: string;
  /** Diretório do catálogo (testes; produção usa /data/audit via env/default). */
  catalogDir?: string;
  now?: () => Date;
  verifyToken?: (candidate: string) => HostOpsOrderVerdict;
  /** Subject autenticado server-side (tools.ts repassa; nunca campo do payload). */
  subject?: string | null;
};

function operatorOrderOf(input: HostSystemdInput): string | null {
  const value = input.operatorOrder;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= 8 ? trimmed : null;
}

function writeHostOpsAudit(file: string, entry: Record<string, unknown>): string {
  try {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify(entry)}\n`, { encoding: "utf8" });
    return "written";
  } catch (error) {
    return `failed:${error instanceof Error ? error.message : String(error)}`;
  }
}

function refusedResult(
  base: Record<string, unknown>, tier: 0 | 1 | 2 | 3, code: string, reason: string,
  auditFile: string, auditEntry: Record<string, unknown>, extra: Partial<HostOpsResult> = {}
): HostOpsResult {
  const result: HostOpsResult = {
    tool: HOST_SYSTEMD_TOOL, status: "refused", tier, op: base.op as "exec" | "ping",
    verb: (base.verb as string | null) ?? null, unit: (base.unit as string | null) ?? null,
    args: (base.args as string[]) ?? [], code, reason, component: base.component as string,
    catalog: base.catalog as HostOpsResult["catalog"], ...extra,
    audit: writeHostOpsAudit(auditFile, auditEntry)
  };
  if (base.orderHash16) result.orderHash16 = base.orderHash16 as string;
  return result;
}

export async function runHostSystemd(input: HostSystemdInput, deps: HostRunDeps = {}): Promise<HostOpsResult> {
  const now = deps.now ?? (() => new Date());
  const auditFile = deps.auditFile ?? process.env.ENG_MCP_HOST_OPS_AUDIT_FILE ?? HOST_OPS_AUDIT_DEFAULT;
  const socketPath = deps.socketPath ?? process.env.ENG_MCP_HOST_OPS_SOCKET ?? HOST_OPS_SOCKET_DEFAULT;
  const timeoutMs = input.timeoutMs ?? HOST_OPS_AGENT_TIMEOUT_DEFAULT_MS;
  const component = input.component ?? process.env.ENG_MCP_HOST_OPS_COMPONENT ?? "eng-mcp";
  const op = input.op ?? "exec";
  const verb = typeof input.verb === "string" ? input.verb.trim() : null;
  const unit = typeof input.unit === "string" && input.unit.trim() ? input.unit.trim() : null;
  const args = Array.isArray(input.args) ? input.args.map((arg) => arg.trim()).filter((arg) => arg.length > 0) : [];
  const allowlist = loadHostOpsAllowlistCatalog(component, deps.catalogDir);
  const catalog = {
    path: allowlist && allowlist.ok ? allowlist.path : (allowlist ? allowlist.path : null),
    sha16: allowlist && allowlist.ok ? allowlist.sha16 : null,
    ...(allowlist && !allowlist.ok && allowlist.error ? { error: allowlist.error } : {})
  };

  // op=ping: liveness real (round-trip no socket; sem gate de verb/unit).
  if (op === "ping") {
    const base = { tool: HOST_SYSTEMD_TOOL, ts: now().toISOString(), op, verb: null, unit: null, args: [], component, catalog, tier: "ping" };
    try {
      const response = await (deps.send ?? connectHostAgent)(
        socketPath, { id: `ping-${now().toISOString()}`, op: "ping", ts: now().toISOString() }, Math.min(timeoutMs, 5000)
      );
      const audit = writeHostOpsAudit(auditFile, { ...base, status: "executed", agentPong: response.pong === true });
      return { tool: HOST_SYSTEMD_TOOL, status: "executed", tier: 1, op, verb: null, unit: null, args: [], component, catalog, agentCatalogSha16: response.agentCatalogSha16 ?? null, audit };
    } catch (error) {
      const detail = error instanceof HostAgentUnavailableError ? error.detail : String(error);
      return refusedResult(base, 1, "HOST_AGENT_UNAVAILABLE", `host agent socket did not answer a ping: ${detail}`, auditFile, { ...base, status: "refused", code: "HOST_AGENT_UNAVAILABLE", detail });
    }
  }

  const order = operatorOrderOf(input);
  const orderHash16 = order ? createHash("sha256").update(order).digest("hex").slice(0, 16) : undefined;
  const base: Record<string, unknown> = {
    tool: HOST_SYSTEMD_TOOL, ts: now().toISOString(), op, verb, unit, args, component, catalog,
    ...(catalog.sha16 ? { catalogSha16: catalog.sha16 } : {}),
    ...(orderHash16 ? { orderHash16 } : {})
  };

  // validação estrutural ANTES dos tiers (recusa tipada, nada enviado).
  if (!verb || !VERB_RE.test(verb)) {
    return refusedResult(base, 0, "INPUT_INVALID", `verb missing/invalid: ${JSON.stringify(input.verb)}`, auditFile, { ...base, tier: 0, status: "refused", code: "INPUT_INVALID" });
  }
  if (unit !== null && !isValidUnitName(unit)) {
    return refusedResult(base, 0, "INPUT_INVALID", `unit name invalid: ${JSON.stringify(unit)}`, auditFile, { ...base, tier: 0, status: "refused", code: "INPUT_INVALID" });
  }
  for (const arg of args) {
    if (!ARG_RE.test(arg)) {
      return refusedResult(base, 0, "INPUT_INVALID", `argument invalid: ${JSON.stringify(arg)}`, auditFile, { ...base, tier: 0, status: "refused", code: "INPUT_INVALID" });
    }
  }
  if (HOST_OPS_MUTATION_VERBS.includes(verb) && verb !== "daemon-reload" && args.length > 0) {
    return refusedResult(base, 0, "INPUT_INVALID", `mutation verb '${verb}' takes no extra args`, auditFile, { ...base, tier: 0, status: "refused", code: "INPUT_INVALID" });
  }

  const classified = classifyHostOp({ verb, unit, args }, allowlist);
  const auditTier = { ...base, tier: classified.tier };

  // TIER 0 — critical units/verbs: recusa tipada, NADA enviado ao socket,
  // operatorOrder não muda nada (tier-0 vence tudo).
  if (classified.tier === 0) {
    return refusedResult(base, 0, classified.code ?? "HOST_OPS_FORBIDDEN", classified.reason ?? "forbidden host operation", auditFile, { ...auditTier, status: "refused", code: classified.code ?? "HOST_OPS_FORBIDDEN", rule: classified.rule }, { rule: classified.rule });
  }

  const sendToAgent = async (): Promise<HostOpsResult> => {
    const startedAt = Date.now();
    try {
      const request: HostAgentRequest = { id: `host-ops-${startedAt}-${Math.random().toString(36).slice(2, 8)}`, op: "exec", verb, unit, args, operatorOrder: order ?? null, ts: now().toISOString() };
      const response = await (deps.send ?? connectHostAgent)(socketPath, request, timeoutMs);
      if (response.ok) {
        const audit = writeHostOpsAudit(auditFile, { ...auditTier, status: "executed", rule: classified.rule, exitCode: response.exitCode ?? null, durationMs: Date.now() - startedAt, agentDurationMs: response.durationMs ?? null, agentCatalogSha16: response.agentCatalogSha16 ?? null });
        return {
          tool: HOST_SYSTEMD_TOOL, status: "executed", tier: classified.tier, op, verb, unit, args,
          component, catalog, rule: classified.rule, exitCode: response.exitCode ?? null,
          durationMs: Date.now() - startedAt, stdout: response.stdout ?? "", stderr: response.stderr ?? "",
          truncated: response.truncated === true, agentCatalogSha16: response.agentCatalogSha16 ?? null, audit
        };
      }
      const audit = writeHostOpsAudit(auditFile, { ...auditTier, status: "refused", rule: classified.rule, code: response.code ?? "HOST_AGENT_REFUSED", agentReason: response.reason ?? null, durationMs: Date.now() - startedAt, agentCatalogSha16: response.agentCatalogSha16 ?? null });
      return {
        tool: HOST_SYSTEMD_TOOL, status: "refused", tier: classified.tier, op, verb, unit, args,
        component, catalog, rule: classified.rule, code: response.code ?? "HOST_AGENT_REFUSED",
        reason: response.reason ?? "host agent refused the operation", agentRefused: true,
        agentCatalogSha16: response.agentCatalogSha16 ?? null, audit
      };
    } catch (error) {
      // anti-frágil: socket ausente/parado/mudo → erro tipado, NUNCA finge execução.
      const unavailable = error instanceof HostAgentUnavailableError;
      const code = unavailable ? "HOST_AGENT_UNAVAILABLE" : "HOST_AGENT_BAD_RESPONSE";
      const detail = error instanceof Error ? error.message : String(error);
      const audit = writeHostOpsAudit(auditFile, { ...auditTier, status: "refused", code, detail, durationMs: Date.now() - startedAt });
      return {
        tool: HOST_SYSTEMD_TOOL, status: "refused", tier: classified.tier, op, verb, unit, args,
        component, catalog, rule: classified.rule, code, reason: detail, audit
      };
    }
  };

  // TIER 1/3 mutação — operatorOrder verificado é SEMPRE exigido (worker e
  // supervisor); o guard do supervisor (GUARD-SUPERVISOR-READONLY-01) aplica
  // os códigos legados para chamador supervisor.
  if (HOST_OPS_MUTATION_VERBS.includes(verb)) {
    try {
      assertSupervisorMutationAllowed(HOST_SYSTEMD_TOOL, deps.subject ?? null, input);
    } catch (error) {
      const code = error instanceof EngineeringError ? error.code : "SUPERVISOR_MUTATION_FORBIDDEN";
      const audit = writeHostOpsAudit(auditFile, { ...auditTier, status: "refused", code: "SUPERVISOR_GUARD", guardCode: code });
      return refusedResult(base, classified.tier, code, error instanceof Error ? error.message : String(error), auditFile, { ...auditTier, status: "refused", code });
    }
    if (!order) {
      return refusedResult(base, classified.tier, "HOST_OPS_ORDER_REQUIRED", `mutation '${verb}' on '${unit ?? "(manager)"}' requires a verified operatorOrder (token de ordem; SEC-OPERATOR-IDENTITY-01) — nothing executed`, auditFile, { ...auditTier, status: "refused", code: "HOST_OPS_ORDER_REQUIRED" });
    }
    const verdict = (deps.verifyToken ?? verifyOperatorOrderLocal)(order);
    if (!verdict.verified) {
      return refusedResult(base, classified.tier, "OPERATOR_ORDER_UNVERIFIED", `operatorOrder did not verify (status ${verdict.status}${verdict.reason ? `, ${verdict.reason}` : ""}) — mutation NOT executed; token de ordem em /data/manifests/operator-order-token.json (0600)`, auditFile, { ...auditTier, status: "refused", code: "OPERATOR_ORDER_UNVERIFIED", tokenStatus: verdict.status });
    }
    return sendToAgent();
  }

  // TIER 1 leitura — executa direto via socket (custo zero, sem LLM).
  if (classified.tier === 1) return sendToAgent();

  // TIER 3 (verbo fora da 1ª fase / mutação fora do catálogo) — só com
  // operatorOrder verificado; o agente ainda aplica a própria catálogo.
  if (classified.tier === 3) {
    if (!order) {
      return refusedResult(base, 3, "HOST_OPS_ORDER_REQUIRED", `${classified.reason ?? "operator consequence"} — requires verified operatorOrder`, auditFile, { ...auditTier, status: "refused", code: "HOST_OPS_ORDER_REQUIRED" });
    }
    const verdict = (deps.verifyToken ?? verifyOperatorOrderLocal)(order);
    if (!verdict.verified) {
      return refusedResult(base, 3, "OPERATOR_ORDER_UNVERIFIED", `operatorOrder did not verify (status ${verdict.status}${verdict.reason ? `, ${verdict.reason}` : ""}) — nothing executed`, auditFile, { ...auditTier, status: "refused", code: "OPERATOR_ORDER_UNVERIFIED", tokenStatus: verdict.status });
    }
    return sendToAgent();
  }

  // TIER 2 — leitura fora do catálogo: Jev classifica (fail-closed).
  let judgeAnswers: Array<{ id: string; probability: number }> | null = null;
  let judgeDetail: string | null = null;
  try {
    const envelope = await (deps.judge ?? defaultJudge)({
      state: JSON.stringify({ verb, unit, args, context: "engineering.host.systemd tier-2 evaluation of a host systemd read operation" }),
      questions: HOST_OPS_TIER2_QUESTIONS
    });
    judgeAnswers = Array.isArray(envelope?.answers) ? envelope.answers : [];
  } catch (error) {
    judgeDetail = error instanceof Error ? error.message : String(error);
  }
  if (judgeAnswers === null) {
    return refusedResult(base, 2, "HOST_OPS_JUDGE_UNAVAILABLE", `read outside the allowlist and judge unavailable — fail-closed: ${judgeDetail}`, auditFile, { ...auditTier, status: "refused", code: "HOST_OPS_JUDGE_UNAVAILABLE" });
  }
  const probabilities: Record<string, number> = {};
  let worst = 0;
  for (const question of HOST_OPS_TIER2_QUESTIONS) {
    const answer = judgeAnswers.find((entry) => entry.id === question.id);
    const probability = typeof answer?.probability === "number" ? answer.probability : 1; // unknown => max risk
    probabilities[question.id] = probability;
    if (probability > worst) worst = probability;
  }
  const safeScore = 1 - worst;
  if (safeScore < HOST_OPS_JUDGE_THRESHOLD) {
    const reasons = HOST_OPS_TIER2_QUESTIONS.map((question) => `${question.id}=${probabilities[question.id].toFixed(3)}`).join(" ");
    return refusedResult(base, 2, "HOST_OPS_JUDGE_REFUSED", `judge refused (safeScore ${safeScore.toFixed(3)} < ${HOST_OPS_JUDGE_THRESHOLD}): ${reasons}`, auditFile, { ...auditTier, status: "refused", code: "HOST_OPS_JUDGE_REFUSED", judge: { safeScore } });
  }
  return sendToAgent();
}

/** Default tier-2 judge adapter: real Jev evaluate, noul band-2 questions. */
async function defaultJudge(input: { state: string; questions: ReadonlyArray<{ id: string; instructions: string }> }) {
  const { runJudgeEvaluate } = await import("./judge.ts");
  const envelope = await runJudgeEvaluate({
    state: input.state,
    questions: input.questions.map((question) => ({ id: question.id, type: "noul" as const, instructions: question.instructions }))
  });
  return {
    answers: envelope.answers.map((answer) => ({ id: answer.id, probability: answer.probability as number }))
  };
}
