/**
 * SEC-SHELL-GUARD-01 (04/10) — allowlist por componente como DADO.
 *
 * Política de shell deixa de ser só regex hardcoded no roteador: um catálogo
 * versionado por componente (/data/audit/shell-allowlist-<componente>.json)
 * carrega regras tier-1 ADICIONAIS (o builtin do shellRun.ts permanece) e o
 * hash do catálogo entra no audit de CADA decisão (shell-run.jsonl) — mudar a
 * política muda o hash e fica visível na trilha.
 *
 * Mudança de allowlist é mutação auditada: runShellAllowlistPut valida o
 * catálogo (schema estrito, regex compilável, ids únicos), grava atomicamente
 * e apenda a mutação em shell-allowlist-mutations.jsonl. A tool
 * engineering.shell.allowlist (tools.ts) expõe get/put; put de supervisor
 * passa pelo guard GUARD-SUPERVISOR-READONLY-01 (operatorOrder obrigatório).
 *
 * Catálogo ausente/corrupto NUNCA derruba a decisão: builtin tier-1 segue
 * valendo e o audit registra o erro (allowlistError) — fail-open para o
 * estado anterior, nunca fail-open para perigo (tier-3 continua ANTES).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import * as z from "zod/v4";

export const SHELL_ALLOWLIST_DIR_DEFAULT = "/data/audit";
export const SHELL_ALLOWLIST_MUTATIONS_DEFAULT = "/data/audit/shell-allowlist-mutations.jsonl";

export type ShellAllowlistRule = { id: string; pattern: string };
export type ShellAllowlistCatalog = {
  component: string;
  version: number;
  rules: ShellAllowlistRule[];
  updatedAt?: string;
  note?: string;
};

export type LoadedAllowlist =
  | { ok: true; component: string; path: string; sha16: string; rules: Array<{ id: string; regex: RegExp }> }
  | { ok: false; path: string; error: string }
  | null;

const COMPONENT_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const RULE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function allowlistCatalogPath(component: string, dir: string = process.env.ENG_MCP_SHELL_ALLOWLIST_DIR ?? SHELL_ALLOWLIST_DIR_DEFAULT): string {
  return `${dir.replace(/\/$/, "")}/shell-allowlist-${component}.json`;
}

/** Validação estrita do catálogo: componente bate, version int >=1, regras únicas e compiláveis. */
export function validateAllowlistCatalog(raw: unknown, expectedComponent?: string): { ok: true; catalog: ShellAllowlistCatalog } | { ok: false; error: string } {
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
  const catalog: ShellAllowlistCatalog = {
    component: cat.component,
    version: cat.version,
    rules: (cat.rules as ShellAllowlistRule[]).map((r) => ({ id: r.id, pattern: r.pattern }))
  };
  if (typeof cat.updatedAt === "string") catalog.updatedAt = cat.updatedAt;
  if (typeof cat.note === "string") catalog.note = cat.note;
  return { ok: true, catalog };
}

/**
 * Carrega o catálogo do componente para a decisão corrente. null = sem
 * catálogo (builtin only); ok:false = catálogo inválido (ignorado, erro vai
 * ao audit); ok:true = regras compiladas + sha16 do ARQUIVO (conteúdo exato
 * que validou a decisão).
 */
export function loadAllowlistCatalog(component: string, dir?: string): LoadedAllowlist {
  if (!COMPONENT_RE.test(component)) return { ok: false, path: "", error: `invalid component id: ${component}` };
  const path = allowlistCatalogPath(component, dir);
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
  const validated = validateAllowlistCatalog(parsed, component);
  if (!validated.ok) return { ok: false, path, error: validated.error };
  const rules: Array<{ id: string; regex: RegExp }> = [];
  for (const rule of validated.catalog.rules) {
    try {
      rules.push({ id: rule.id, regex: new RegExp(rule.pattern) });
    } catch {
      return { ok: false, path, error: `rule ${rule.id}: pattern does not compile` };
    }
  }
  return { ok: true, component, path, sha16: createHash("sha256").update(raw).digest("hex").slice(0, 16), rules };
}

export type ShellAllowlistPutInput = {
  op: "put";
  component: string;
  version: number;
  rules: ShellAllowlistRule[];
  note?: string;
  operatorOrder?: string;
};
export type ShellAllowlistGetInput = { op: "get"; component: string };
export type ShellAllowlistInput = ShellAllowlistPutInput | ShellAllowlistGetInput;

const COMPONENT_SCHEMA = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,31}$/);
const RULE_SCHEMA = z.object({ id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/), pattern: z.string().min(1).max(500) }).strict();

export const shellAllowlistInputSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("get"), component: COMPONENT_SCHEMA }).strict(),
  z.object({
    op: z.literal("put"),
    component: COMPONENT_SCHEMA,
    version: z.number().int().min(1),
    rules: z.array(RULE_SCHEMA).max(200),
    note: z.string().max(500).optional(),
    // GUARD-SUPERVISOR-READONLY-01: put de supervisor exige operatorOrder explícito.
    operatorOrder: z.string().min(8).max(200).optional()
  }).strict()
]);

export type ShellAllowlistResult = {
  op: "get" | "put";
  ok: boolean;
  component: string;
  path?: string;
  version?: number;
  ruleCount?: number;
  sha16?: string;
  catalog?: ShellAllowlistCatalog;
  code?: string;
  reason?: string;
  audit?: string;
};

function mutationsFile(): string {
  return process.env.ENG_MCP_SHELL_ALLOWLIST_MUTATIONS ?? SHELL_ALLOWLIST_MUTATIONS_DEFAULT;
}

function appendMutationAudit(entry: Record<string, unknown>): string {
  try {
    const file = mutationsFile();
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify(entry)}\n`, "utf8");
    return "written";
  } catch (error) {
    return `failed:${error instanceof Error ? error.message : String(error)}`;
  }
}

export function runShellAllowlistGet(input: ShellAllowlistGetInput): ShellAllowlistResult {
  const loaded = loadAllowlistCatalog(input.component);
  if (loaded === null) {
    return { op: "get", ok: false, component: input.component, code: "SHELL_ALLOWLIST_NOT_FOUND", reason: `no catalog for component ${input.component} (builtin tier-1 only)` };
  }
  if (!loaded.ok) {
    return { op: "get", ok: false, component: input.component, path: loaded.path, code: "SHELL_ALLOWLIST_INVALID", reason: loaded.error };
  }
  return {
    op: "get", ok: true, component: input.component, path: loaded.path, sha16: loaded.sha16,
    ruleCount: loaded.rules.length,
    catalog: { component: input.component, version: 0, rules: loaded.rules.map((r) => ({ id: r.id, pattern: r.regex.source })) }
  };
}

/** put = mutação auditada da política: valida, grava atomicamente, apenda trilha. */
export function runShellAllowlistPut(input: ShellAllowlistPutInput, deps: { now?: () => Date; actor?: string } = {}): ShellAllowlistResult {
  const now = deps.now ?? (() => new Date());
  const component = String(input.component ?? "").trim();
  if (!COMPONENT_RE.test(component)) {
    return { op: "put", ok: false, component, code: "SHELL_ALLOWLIST_INVALID_COMPONENT", reason: `component must match ${COMPONENT_RE.source}` };
  }
  const candidate: ShellAllowlistCatalog = {
    component,
    version: input.version,
    rules: input.rules ?? [],
    updatedAt: now().toISOString()
  };
  if (typeof input.note === "string" && input.note.trim()) candidate.note = input.note.trim().slice(0, 500);
  const validated = validateAllowlistCatalog(candidate, component);
  if (!validated.ok) {
    return { op: "put", ok: false, component, code: "SHELL_ALLOWLIST_INVALID", reason: validated.error };
  }
  const path = allowlistCatalogPath(component);
  const body = `${JSON.stringify(candidate, null, 2)}\n`;
  let sha16 = "";
  try {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp-${Date.now()}`;
    writeFileSync(tmp, body, "utf8");
    sha16 = createHash("sha256").update(readFileSync(tmp)).digest("hex").slice(0, 16);
    renameSync(tmp, path);
  } catch (error) {
    return { op: "put", ok: false, component, code: "SHELL_ALLOWLIST_WRITE_FAILED", reason: error instanceof Error ? error.message : String(error) };
  }
  const audit = appendMutationAudit({
    ts: now().toISOString(),
    event: "shell_allowlist_mutated",
    component,
    version: candidate.version,
    ruleCount: candidate.rules.length,
    sha16,
    actor: deps.actor ?? "engineering.shell.allowlist",
    operatorOrder: typeof input.operatorOrder === "string" && input.operatorOrder.trim() ? input.operatorOrder.trim() : null
  });
  return { op: "put", ok: true, component, path, version: candidate.version, ruleCount: candidate.rules.length, sha16, audit };
}

export function runShellAllowlist(input: ShellAllowlistInput, deps: { now?: () => Date; actor?: string } = {}): ShellAllowlistResult {
  return input.op === "put" ? runShellAllowlistPut(input, deps) : runShellAllowlistGet(input);
}
