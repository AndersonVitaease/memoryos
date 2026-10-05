/**
 * ENG-HOST-GOVERNED-OPS-01 (04/10) — agente mínimo NO HOST: bridge
 * container→host para operações systemd governadas (unit dedicada
 * eng-mcp-host-ops-agent.service, unix socket sob /data — NUNCA rede TCP).
 *
 * DEFESA EM PROFUNDIDADE: o guard do MCP (src/hostSystemd.ts) NÃO é a única
 * barreira — o agente valida CADA request contra a PRÓPRIA catálogo em nível
 * de sistema (/data/audit/host-ops-agent-catalog.json) antes de executar:
 *   - tier-0 builtin (mesmas units/verbos proibidos do router) → AGENT_REFUSED;
 *   - unit/verb têm de estar na catálogo do agente (unknown → recusa);
 *   - MUTAÇÃO exige operatorOrder verificado contra
 *     /data/manifests/operator-order-token.json (0600) — MESMA interface e
 *     MESMA semântica do verificador compartilhado (verifyOperatorOrderLocal;
 *     quando SEC-OPERATOR-IDENTITY-01 pousar, a fonte única substitui).
 *     RD-HOST-02: o arquivo é lido via `sudo -n /usr/bin/cat` (argv exato,
 *     allowlist no sudoers) porque 0600 root:root é ilegível para o uid do
 *     agente; fallback leitura direta (root/container) + kill switch
 *     HOST_OPS_TOKEN_VIA_SUDO=0.
 *
 * ZERO-LLM POR DESENHO: o tier-2 (Jev) vive na tool, no container — dentro de
 * um daemon privilegiado no host não há modelo; o agente é determinístico e
 * fail-closed honesto (desconhecido → recusa tipada, nunca executa nem finge).
 *
 * Execução: systemctl por ARGV EXATO (spawn shell:false — nada do request
 * vira string de shell). Read verbs rodam como o usuário do agente
 * (não-privilegiado); mutation verbs via `sudo -n /usr/bin/systemctl ...`
 * com sudoers allowlistado POR COMANDO EXATO (deploy/sudoers-eng-mcp-host-ops)
 * — sem root genérico.
 *
 * Anti-frágil: unit com Restart=on-failure; socket recriado limpo no boot
 * (stale unlink); SIGTERM/SIGINT removem o socket; ping responde estado real.
 * Audit: toda decisão (executada/recusada) apenda em
 * /data/audit/host-ops.jsonl com source:"host-ops-agent" — a trilha dos DOIS
 * lados fica no mesmo arquivo (o container monta /data).
 */
import { createServer, type Socket } from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import type { OperatorTokenFileReader } from "./operatorToken.ts";
import {
  HOST_OPS_READ_VERBS, HOST_OPS_MUTATION_VERBS, TIER0_FORBIDDEN_UNITS, TIER0_FORBIDDEN_VERBS,
  isValidUnitName, normalizeUnitName, verifyOperatorOrderLocal,
  type HostAgentRequest, type HostAgentResponse
} from "./hostSystemd.ts";

export const HOST_OPS_AGENT_VERSION = 1;
export const HOST_OPS_AGENT_SOCKET_DEFAULT = "/data/host-ops/agent.sock";
export const HOST_OPS_AGENT_CATALOG_DEFAULT = "/data/audit/host-ops-agent-catalog.json";
export const HOST_OPS_AGENT_AUDIT_DEFAULT = "/data/audit/host-ops.jsonl";
export const HOST_OPS_AGENT_REQUEST_MAX_BYTES = 64_000;
export const HOST_OPS_AGENT_EXEC_TIMEOUT_MS = 30_000;
export const HOST_OPS_AGENT_OUTPUT_HEAD = 25_000;
export const HOST_OPS_AGENT_OUTPUT_TAIL = 25_000;

export type AgentCatalog = {
  version: number;
  readOnlyUnits: string[];
  mutationUnits: Array<{ unit: string; verbs: string[] }>;
  forbiddenUnits?: string[];
  note?: string;
  updatedAt?: string;
};

export type LoadedAgentCatalog =
  | { ok: true; catalog: AgentCatalog; sha16: string }
  | { ok: false; error: string };

const UNIT_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_.@:\\-]{0,127}$|^\(manager\)$/;

export function validateAgentCatalog(raw: unknown): { ok: true; catalog: AgentCatalog } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: "catalog must be a JSON object" };
  const cat = raw as Record<string, unknown>;
  if (cat.version !== 1) return { ok: false, error: "version must be 1" };
  const readList = cat.readOnlyUnits;
  if (!Array.isArray(readList)) return { ok: false, error: "readOnlyUnits must be an array" };
  for (const entry of readList) {
    if (typeof entry !== "string" || !UNIT_KEY_RE.test(entry)) return { ok: false, error: `readOnlyUnits entry invalid: ${JSON.stringify(entry)}` };
  }
  if (!Array.isArray(cat.mutationUnits)) return { ok: false, error: "mutationUnits must be an array" };
  const seen = new Set<string>();
  for (const entry of cat.mutationUnits) {
    if (typeof entry !== "object" || entry === null) return { ok: false, error: "mutationUnits entry must be an object" };
    const m = entry as Record<string, unknown>;
    if (typeof m.unit !== "string" || !UNIT_KEY_RE.test(m.unit)) return { ok: false, error: `mutationUnits unit invalid: ${JSON.stringify(m.unit)}` };
    if (!Array.isArray(m.verbs) || m.verbs.length === 0 || m.verbs.some((v) => typeof v !== "string" || !HOST_OPS_MUTATION_VERBS.includes(v))) {
      return { ok: false, error: `mutationUnits[${m.unit}]: verbs must be a non-empty array of ${HOST_OPS_MUTATION_VERBS.join("|")}` };
    }
    if (seen.has(m.unit)) return { ok: false, error: `duplicate mutationUnit: ${m.unit}` };
    seen.add(m.unit);
  }
  let forbidden: string[] = [];
  if (cat.forbiddenUnits !== undefined) {
    if (!Array.isArray(cat.forbiddenUnits)) return { ok: false, error: "forbiddenUnits must be an array" };
    for (const entry of cat.forbiddenUnits) {
      if (typeof entry !== "string" || entry.length === 0 || entry.length > 128) return { ok: false, error: `forbiddenUnits entry invalid: ${JSON.stringify(entry)}` };
    }
    forbidden = (cat.forbiddenUnits as string[]).slice();
  }
  const catalog: AgentCatalog = {
    version: 1,
    readOnlyUnits: (readList as string[]).slice(),
    mutationUnits: (cat.mutationUnits as Array<{ unit: string; verbs: string[] }>).map((m) => ({ unit: m.unit, verbs: [...m.verbs] })),
    ...(forbidden.length ? { forbiddenUnits: forbidden } : {}),
    ...(typeof cat.note === "string" ? { note: cat.note } : {}),
    ...(typeof cat.updatedAt === "string" ? { updatedAt: cat.updatedAt } : {})
  };
  return { ok: true, catalog };
}

export function loadAgentCatalog(path: string = process.env.ENG_MCP_HOST_OPS_AGENT_CATALOG ?? HOST_OPS_AGENT_CATALOG_DEFAULT): LoadedAgentCatalog {
  if (!existsSync(path)) return { ok: false, error: `agent catalog absent: ${path}` };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return { ok: false, error: `agent catalog unreadable/invalid: ${error instanceof Error ? error.message : String(error)}` };
  }
  const validated = validateAgentCatalog(parsed);
  if (!validated.ok) return { ok: false, error: validated.error };
  return { ok: true, catalog: validated.catalog, sha16: createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 16) };
}

export type AgentExecOutcome = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
};

export type AgentDeps = {
  exec?: (argv: readonly string[], timeoutMs: number) => Promise<AgentExecOutcome>;
  getuid?: () => number;
  now?: () => Date;
  catalog?: LoadedAgentCatalog;
  tokenPath?: string;
  tokenReader?: OperatorTokenFileReader;
  auditFile?: string;
};

// ---------------------------------------------------------------------------
// RD-HOST-02 (04/10) — leitura do token de ordem pelo agente NÃO-ROOT:
// o arquivo é 0600 root:root (exigência dos leitores root: (mode & 0o077)==0)
// e a leitura direta do uid do agente é EACCES — toda mutação recusava
// OPERATOR_ORDER_UNVERIFIED com token íntegro. O leitor injetado busca os
// bytes via `sudo -n /usr/bin/cat <path>` (argv exato, zero shell — linha
// allowlistada no sudoers por comando exato; o arquivo contém SÓ hashes).
// Fallback: leitura direta (processo root — container de teste). Kill switch:
// HOST_OPS_TOKEN_VIA_SUDO=0 desativa o sudo (leitura direta apenas).
// ---------------------------------------------------------------------------

export const HOST_OPS_TOKEN_SUDO_ARGV_PREFIX = ["/usr/bin/sudo", "-n", "/usr/bin/cat"] as const;
export const HOST_OPS_TOKEN_SUDO_TIMEOUT_MS = 5_000;

export type HostOpsSudoCatOutcome = { exitCode: number | null; stdout: string };

function defaultSudoCatSpawn(argv: readonly string[]): HostOpsSudoCatOutcome {
  const result = spawnSync(argv[0]!, argv.slice(1) as string[], { encoding: "utf8", timeout: HOST_OPS_TOKEN_SUDO_TIMEOUT_MS, shell: false });
  if (result.error) throw result.error;
  return { exitCode: result.status, stdout: result.stdout ?? "" };
}

export type HostOpsTokenReadVia = "sudo" | "direct" | "none";

export type HostOpsTokenReader = OperatorTokenFileReader & { readVia: () => HostOpsTokenReadVia };

/**
 * Leitor do arquivo do token: sudo cat primeiro (agente não-root), fallback
 * leitura direta (processo root). Fail-closed preservado: se AMBAS falharem
 * (EACCES), a exceção sobe e o verificador mapeia para UNREADABLE_OR_CORRUPT —
 * exatamente o comportamento pré-RD-HOST-02 para leitor sem permissão.
 */
export function createHostOpsTokenReader(options: { sudoSpawn?: (argv: readonly string[]) => HostOpsSudoCatOutcome; env?: NodeJS.ProcessEnv } = {}): HostOpsTokenReader {
  const sudoSpawn = options.sudoSpawn ?? defaultSudoCatSpawn;
  const env = options.env ?? process.env;
  let lastVia: HostOpsTokenReadVia = "none";
  let cachedPath: string | null = null;
  let cachedContent: string | null = null;
  const readDirect = (path: string): string => {
    const content = readFileSync(path, "utf8");
    lastVia = "direct";
    return content;
  };
  return {
    stat: (path) => statSync(path),
    readFile: (path) => {
      if (path === cachedPath && cachedContent !== null) return cachedContent;
      let content: string;
      if (env.HOST_OPS_TOKEN_VIA_SUDO === "0") {
        content = readDirect(path);
      } else {
        try {
          const out = sudoSpawn([...HOST_OPS_TOKEN_SUDO_ARGV_PREFIX, path]);
          if (out.exitCode === 0 && out.stdout.length > 0) {
            content = out.stdout;
            lastVia = "sudo";
          } else {
            content = readDirect(path); // sudo recusou/sem sudoers → fallback (root)
          }
        } catch {
          content = readDirect(path); // sudo indisponível → fallback (container de teste)
        }
      }
      cachedPath = path;
      cachedContent = content;
      return content;
    },
    readVia: () => lastVia
  };
}

function truncateAgentOutput(text: string): { text: string; truncated: boolean } {
  const length = Buffer.byteLength(text, "utf8");
  if (length <= HOST_OPS_AGENT_OUTPUT_HEAD + HOST_OPS_AGENT_OUTPUT_TAIL) return { text, truncated: false };
  const head = text.slice(0, HOST_OPS_AGENT_OUTPUT_HEAD);
  const tail = text.slice(-HOST_OPS_AGENT_OUTPUT_TAIL);
  const dropped = length - Buffer.byteLength(head, "utf8") - Buffer.byteLength(tail, "utf8");
  return { text: `${head}\n...[HOST_OPS_AGENT_OUTPUT_TRUNCATED ${dropped} bytes dropped]...\n${tail}`, truncated: true };
}

function defaultAgentExec(argv: readonly string[], timeoutMs: number): Promise<AgentExecOutcome> {
  return new Promise((resolvePromise) => {
    const startedAt = Date.now();
    const child = spawn(argv[0], argv.slice(1), { env: process.env, windowsHide: true });
    const stdout: string[] = [];
    const stderr: string[] = [];
    let bytes = 0;
    let timedOut = false;
    const cap = 1_000_000;
    const collect = (sink: string[], chunk: Buffer): void => {
      if (bytes > cap) return;
      bytes += chunk.length;
      sink.push(chunk.toString("utf8"));
    };
    child.stdout?.on("data", (chunk: Buffer) => collect(stdout, chunk));
    child.stderr?.on("data", (chunk: Buffer) => collect(stderr, chunk));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    const finish = (exitCode: number | null): void => {
      if (timer) clearTimeout(timer);
      resolvePromise({ exitCode, stdout: stdout.join(""), stderr: stderr.join(""), timedOut, durationMs: Date.now() - startedAt });
    };
    child.on("error", (error) => {
      stderr.push(`spawn error: ${error instanceof Error ? error.message : String(error)}`);
      finish(-1);
    });
    child.on("close", (code) => finish(code));
  });
}

function writeAgentAudit(file: string, entry: Record<string, unknown>): void {
  try {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify(entry)}\n`, { encoding: "utf8" });
  } catch {
    // fail-open honesto: audit nunca derruba o daemon
  }
}

/** systemd systemctl argv — read: argv exato do usuário do agente; mutation:
 *  sudo -n com comando exato allowlistado no sudoers (sem root genérico). */
export function agentArgvFor(verb: string, unit: string | null, args: readonly string[], isRoot: boolean): string[] {
  if (HOST_OPS_MUTATION_VERBS.includes(verb)) {
    const systemctlArgs = verb === "daemon-reload" ? ["daemon-reload"] : [verb, unit ?? ""];
    return isRoot ? ["/usr/bin/systemctl", ...systemctlArgs] : ["sudo", "-n", "/usr/bin/systemctl", ...systemctlArgs];
  }
  return ["/usr/bin/systemctl", ...args, verb, ...(unit ? [unit] : [])];
}

/** Núcleo determinístico do agente: valida e responde (puro — testável sem socket). */
export async function handleAgentRequest(request: unknown, deps: AgentDeps = {}): Promise<HostAgentResponse> {
  const now = deps.now ?? (() => new Date());
  const auditFile = deps.auditFile ?? process.env.ENG_MCP_HOST_OPS_AGENT_AUDIT_FILE ?? HOST_OPS_AGENT_AUDIT_DEFAULT;
  const exec = deps.exec ?? defaultAgentExec;
  const isRoot = (deps.getuid ?? process.getuid.bind(process))() === 0;
  const loaded = deps.catalog ?? loadAgentCatalog();
  const catalogSha16 = loaded.ok ? loaded.sha16 : null;

  const audit = (fields: Record<string, unknown>): void => {
    writeAgentAudit(auditFile, { source: "host-ops-agent", ts: now().toISOString(), agentVersion: HOST_OPS_AGENT_VERSION, catalogSha16, ...fields });
  };

  if (!request || typeof request !== "object" || Array.isArray(request)) {
    audit({ decision: "refused", code: "AGENT_BAD_REQUEST", detail: "request is not an object" });
    return { ok: false, code: "AGENT_BAD_REQUEST", reason: "request is not an object", agentCatalogSha16: catalogSha16, agentVersion: HOST_OPS_AGENT_VERSION };
  }
  const req = request as Partial<HostAgentRequest> & Record<string, unknown>;
  if (req.op === "ping") {
    audit({ decision: "executed", code: "PING", uptimeMs: process.uptime() * 1000 });
    return { ok: true, pong: true, agentCatalogSha16: catalogSha16, agentVersion: HOST_OPS_AGENT_VERSION };
  }
  if (req.op !== "exec") {
    audit({ decision: "refused", code: "AGENT_BAD_REQUEST", detail: `unknown op ${JSON.stringify(req.op)}` });
    return { ok: false, code: "AGENT_BAD_REQUEST", reason: `unknown op ${JSON.stringify(req.op)}`, agentCatalogSha16: catalogSha16, agentVersion: HOST_OPS_AGENT_VERSION };
  }

  const verb = typeof req.verb === "string" ? req.verb.trim() : "";
  const unit = typeof req.unit === "string" && req.unit.trim() ? req.unit.trim() : null;
  const args = Array.isArray(req.args) ? req.args : [];
  const fields = { verb, unit, args, requestId: typeof req.id === "string" ? req.id.slice(0, 64) : null };

  // catálogo do agente saudável é pré-condição (fail-closed: sem catálogo, o
  // agente NÃO executa nada — diferente do allowlist do container, que é
  // fail-open para o builtin; aqui a catálogo É a fronteira do host).
  if (!loaded.ok) {
    audit({ ...fields, decision: "refused", code: "AGENT_CATALOG_UNAVAILABLE", detail: loaded.error });
    return { ok: false, code: "AGENT_CATALOG_UNAVAILABLE", reason: loaded.error, agentCatalogSha16: null, agentVersion: HOST_OPS_AGENT_VERSION };
  }
  const catalog = loaded.catalog;

  // tier-0 builtin do agente (independe do router do container).
  if (TIER0_FORBIDDEN_VERBS.includes(verb)) {
    audit({ ...fields, decision: "refused", code: "HOST_OPS_FORBIDDEN", rule: `verb:${verb}` });
    return { ok: false, code: "HOST_OPS_FORBIDDEN", reason: `verb '${verb}' is never exposed`, agentCatalogSha16: catalogSha16, agentVersion: HOST_OPS_AGENT_VERSION };
  }
  if (unit && TIER0_FORBIDDEN_UNITS.includes(normalizeUnitName(unit))) {
    audit({ ...fields, decision: "refused", code: "HOST_OPS_FORBIDDEN", rule: `unit:${normalizeUnitName(unit)}` });
    return { ok: false, code: "HOST_OPS_FORBIDDEN", reason: `unit '${unit}' is a critical host unit`, agentCatalogSha16: catalogSha16, agentVersion: HOST_OPS_AGENT_VERSION };
  }
  const forbiddenExtra = catalog.forbiddenUnits ?? [];
  if (unit && forbiddenExtra.some((entry) => normalizeUnitName(entry) === normalizeUnitName(unit))) {
    audit({ ...fields, decision: "refused", code: "HOST_OPS_FORBIDDEN", rule: `agent-catalog:unit:${normalizeUnitName(unit)}` });
    return { ok: false, code: "HOST_OPS_FORBIDDEN", reason: `unit '${unit}' is forbidden by the agent catalog`, agentCatalogSha16: catalogSha16, agentVersion: HOST_OPS_AGENT_VERSION };
  }
  if (!HOST_OPS_READ_VERBS.includes(verb) && !HOST_OPS_MUTATION_VERBS.includes(verb)) {
    audit({ ...fields, decision: "refused", code: "AGENT_VERB_NOT_EXPOSED" });
    return { ok: false, code: "AGENT_VERB_NOT_EXPOSED", reason: `verb '${verb}' is not exposed by the agent`, agentCatalogSha16: catalogSha16, agentVersion: HOST_OPS_AGENT_VERSION };
  }
  if (unit !== null && !isValidUnitName(unit)) {
    audit({ ...fields, decision: "refused", code: "AGENT_BAD_REQUEST", detail: "unit name invalid" });
    return { ok: false, code: "AGENT_BAD_REQUEST", reason: "unit name invalid", agentCatalogSha16: catalogSha16, agentVersion: HOST_OPS_AGENT_VERSION };
  }

  const isMutation = HOST_OPS_MUTATION_VERBS.includes(verb);
  let verifiedOrderHash16: string | null = null;
  let verifiedTokenVia: string | null = null;
  const unitAuthorized = unit !== null && (
    catalog.readOnlyUnits.some((entry) => normalizeUnitName(entry) === normalizeUnitName(unit)) ||
    catalog.mutationUnits.some((m) => normalizeUnitName(m.unit) === normalizeUnitName(unit))
  );
  const managerAuthorized = verb === "daemon-reload" && catalog.mutationUnits.some((m) => m.unit === "(manager)" && m.verbs.includes("daemon-reload"));

  if (isMutation) {
    const mutationEntry = verb === "daemon-reload"
      ? (managerAuthorized ? { unit: "(manager)", verbs: ["daemon-reload"] } : null)
      : (catalog.mutationUnits.find((m) => normalizeUnitName(m.unit) === normalizeUnitName(unit ?? "") && m.verbs.includes(verb)) ?? null);
    if (!mutationEntry) {
      audit({ ...fields, decision: "refused", code: "AGENT_REFUSED", rule: "mutation-not-in-agent-catalog" });
      return { ok: false, code: "AGENT_REFUSED", reason: `mutation '${verb}' on '${unit ?? "(manager)"}' is not in the agent catalog`, agentCatalogSha16: catalogSha16, agentVersion: HOST_OPS_AGENT_VERSION };
    }
    // mutação exige operatorOrder verificado (MESMA interface do container).
    const order = typeof req.operatorOrder === "string" && req.operatorOrder.trim().length >= 8 ? req.operatorOrder.trim() : null;
    if (!order) {
      audit({ ...fields, decision: "refused", code: "HOST_OPS_ORDER_REQUIRED" });
      return { ok: false, code: "HOST_OPS_ORDER_REQUIRED", reason: "mutation requires operatorOrder", agentCatalogSha16: catalogSha16, agentVersion: HOST_OPS_AGENT_VERSION };
    }
    // RD-HOST-02: o leitor busca o arquivo via sudo cat (agente não-root);
    // deps.tokenReader injeta leitor próprio (testes).
    const tokenReaderBundle = deps.tokenReader
      ? { reader: deps.tokenReader, via: () => "injected" as const }
      : (() => { const reader = createHostOpsTokenReader(); return { reader, via: () => reader.readVia() }; })();
    const verdict = verifyOperatorOrderLocal(order, deps.tokenPath ?? process.env.ENG_MCP_OPERATOR_TOKEN_FILE ?? "/data/manifests/operator-order-token.json", now().getTime(), tokenReaderBundle.reader);
    if (!verdict.verified) {
      audit({ ...fields, decision: "refused", code: "OPERATOR_ORDER_UNVERIFIED", tokenStatus: verdict.status, orderHash16: verdict.presentedHash16, tokenVia: tokenReaderBundle.via() });
      return { ok: false, code: "OPERATOR_ORDER_UNVERIFIED", reason: `operatorOrder did not verify (status ${verdict.status})`, agentCatalogSha16: catalogSha16, agentVersion: HOST_OPS_AGENT_VERSION };
    }
    verifiedOrderHash16 = verdict.presentedHash16;
    verifiedTokenVia = tokenReaderBundle.via();
  } else if (verb !== "list-units" && !unitAuthorized) {
    audit({ ...fields, decision: "refused", code: "AGENT_REFUSED", rule: "unit-not-in-agent-catalog" });
    return { ok: false, code: "AGENT_REFUSED", reason: `unit '${unit}' is not in the agent catalog`, agentCatalogSha16: catalogSha16, agentVersion: HOST_OPS_AGENT_VERSION };
  }

  const argv = agentArgvFor(verb, unit, args, isRoot);
  const outcome = await exec(argv, HOST_OPS_AGENT_EXEC_TIMEOUT_MS);
  const stdout = truncateAgentOutput(outcome.stdout);
  const stderr = truncateAgentOutput(outcome.stderr);
  audit({
    ...fields, decision: outcome.timedOut ? "timeout" : "executed", argv: argv.join(" "),
    exitCode: outcome.exitCode, timedOut: outcome.timedOut, durationMs: outcome.durationMs,
    truncated: stdout.truncated || stderr.truncated, isRoot,
    ...(isMutation ? { orderHash16: verifiedOrderHash16, tokenVia: verifiedTokenVia } : {})
  });
  return {
    ok: true, exitCode: outcome.exitCode, stdout: stdout.text, stderr: stderr.text,
    truncated: stdout.truncated || stderr.truncated, durationMs: outcome.durationMs,
    agentCatalogSha16: catalogSha16, agentVersion: HOST_OPS_AGENT_VERSION
  };
}

// ---------------------------------------------------------------------------
// Daemon (socket unix, um request por conexão)
// ---------------------------------------------------------------------------

export type AgentServer = { close: () => Promise<void>; socketPath: string };

export function startHostOpsAgent(options: { socketPath?: string; deps?: AgentDeps } = {}): Promise<AgentServer> {
  const socketPath = options.socketPath ?? process.env.ENG_MCP_HOST_OPS_AGENT_SOCKET ?? HOST_OPS_AGENT_SOCKET_DEFAULT;
  const deps = options.deps ?? {};
  return new Promise((resolvePromise, rejectPromise) => {
    if (existsSync(socketPath)) {
      try {
        statSync(socketPath);
        unlinkSync(socketPath); // stale socket de boot anterior
      } catch {
        // diretório sumiu entre exists e unlink — segue
      }
    }
    mkdirSync(dirname(socketPath), { recursive: true });
    const server = createServer((socket: Socket) => {
      let buffer = "";
      socket.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        if (Buffer.byteLength(buffer, "utf8") > HOST_OPS_AGENT_REQUEST_MAX_BYTES) {
          socket.write(`${JSON.stringify({ ok: false, code: "AGENT_BAD_REQUEST", reason: "request exceeds size cap" })}\n`);
          socket.end();
          return;
        }
        const newline = buffer.indexOf("\n");
        if (newline === -1) return;
        const line = buffer.slice(0, newline);
        socket.removeAllListeners("data");
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(line);
        } catch {
          socket.write(`${JSON.stringify({ ok: false, code: "AGENT_BAD_REQUEST", reason: "request is not valid JSON" })}\n`);
          socket.end();
          return;
        }
        handleAgentRequest(parsed, deps)
          .then((response) => {
            socket.write(`${JSON.stringify(response)}\n`);
            socket.end();
          })
          .catch((error) => {
            socket.write(`${JSON.stringify({ ok: false, code: "AGENT_INTERNAL", reason: error instanceof Error ? error.message : String(error) })}\n`);
            socket.end();
          });
      });
      socket.on("error", () => { /* cliente sumiu — nada a fazer */ });
    });
    server.on("error", rejectPromise);
    server.listen(socketPath, () => {
      try {
        // RD-SEC-SURFACE-01: 0600 (não 0660) — o bit de grupo abria rota lateral
        // de ESCRITA no socket para qualquer membro de eng-mcp-release; o único
        // cliente legítimo é o gate MCP do servidor (container root, que passa
        // por CAP_DAC_OVERRIDE de qualquer forma). Owner fica eng-mcp-host-ops
        // (unit User=), group eng-mcp-release (unit Group=) só como metadado.
        chmodSync(socketPath, 0o600);
      } catch {
        // chmod best-effort (donos diferentes de fs)
      }
      resolvePromise({
        socketPath,
        close: () => new Promise<void>((resolveClose) => {
          try {
            unlinkSync(socketPath);
          } catch {
            // já removido
          }
          server.close(() => resolveClose());
        })
      });
    });
  });
}

/** Entrada do daemon: `node --import tsx src/hostOpsAgent.ts` (unit systemd). */
export async function mainHostOpsAgent(): Promise<void> {
  const server = await startHostOpsAgent();
  process.stdout.write(`host-ops-agent listening on ${server.socketPath} (pid ${process.pid})\n`);
  const shutdown = (): void => {
    server.close().then(() => process.exit(0));
    // se o close travar, o watchdog da unit (Restart=on-failure) recicla
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (process.argv[1] && process.argv[1].endsWith("hostOpsAgent.ts")) {
  mainHostOpsAgent().catch((error) => {
    process.stderr.write(`host-ops-agent failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
