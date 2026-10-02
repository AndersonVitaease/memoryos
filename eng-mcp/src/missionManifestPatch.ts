// engineering.mission.manifest_patch — MISSION-MANIFEST-PATCH-01-R2: caminho GOVERNADO
// para o supervisor corrigir um manifesto verify-<missionId>.json mal escrito (tipo de
// prova inválido, timeout < mínimo, grep errado) SEM shell direto.
//
// Doutrina: toda operação repetida vira tool governada. O supervisor hoje corrige via
// shell — 4x no dia 01/10 (description, proof_timeout, grep case, suíte fora do tmp).
// Esta tool substitui isso por: resolução MESMA do verify (cwd-mission > cwd-legacy,
// nunca path ad-hoc), patch JSON-Pointer-like atômico (recusa INTEIRA sem aplicação
// parcial), validação pós-patch do schema do manifesto, audit jsonl por patch.
//
// Zero LLM, determinístico, fail-closed.

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { EngineeringError } from "./policy.ts";

export const AUDIT_PATH = "/data/audit/manifest-patch.jsonl";
const LEDGER_DIR = "/root/.hermes/mission-state";
const TRUNCATE = 200;

const patchOpSchema = z.object({
  op: z.enum(["replace", "remove", "add"]),
  path: z.string().min(1).max(200),
  value: z.unknown().optional()
}).strict();

export const missionManifestPatchInputSchema = z.object({
  missionId: z.string().min(3).max(80),
  patch: z.array(patchOpSchema).min(1).max(20),
  acknowledgeWrite: z.literal(true).optional()
}).strict();

export type MissionManifestPatchInput = z.infer<typeof missionManifestPatchInputSchema>;
export type PatchOp = z.infer<typeof patchOpSchema>;

// ---------------------------------------------------------------- resolução do manifesto
// MESMA lógica do runner /opt/deliver-verify/verify.py resolve_manifest():
// arg explícito > verify-<missionId>.json no cwd > verify.json no cwd. Nunca path ad-hoc.
export function resolveManifestPath(missionId: string, ledger: Record<string, unknown> | null, explicit?: string): { path: string | null; how: string | null } {
  if (explicit) return { path: explicit, how: "arg" };
  const cwd = typeof (ledger as { cwd?: unknown } | null)?.cwd === "string" ? (ledger as { cwd: string }).cwd : null;
  if (cwd) {
    for (const [name, how] of [["verify-%s.json" /* replaced below */, "cwd-mission"], ["verify.json", "cwd-legacy"]] as const) {
      const cand = join(cwd, name.replace("%s", missionId));
      if (existsSync(cand)) return { path: cand, how };
    }
  }
  return { path: null, how: null };
}

function loadLedger(missionId: string, ledgerDir: string, rd: typeof readFileSync, ex: typeof existsSync): Record<string, unknown> {
  const p = join(ledgerDir, `${missionId}.json`);
  if (!ex(p)) throw new EngineeringError("MISSION_NOT_FOUND", `no ledger at ${p}`);
  try {
    return JSON.parse(rd(p, "utf8")) as Record<string, unknown>;
  } catch (e) {
    throw new EngineeringError("LEDGER_UNREADABLE", String(e).slice(0, 200));
  }
}

// ---------------------------------------------------------------- navegação JSON-Pointer-like
// path "cmd[3].run" → navega arrays por índice e objetos por chave.
function navigate(root: unknown, path: string): { parent: unknown; key: string | number; current: unknown } {
  if (!/^[A-Za-z0-9_.\[\]-]+$/.test(path)) throw new EngineeringError("INPUT_INVALID", `path "${path}" has forbidden characters`);
  const tokens: Array<string | number> = [];
  const re = /([A-Za-z0-9_-]+)|\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  let expectKey = true;
  while ((m = re.exec(path)) !== null) {
    // início válido: offset 0; token-índice "[n]" pode vir logo após chave ("cmd[0]") ou "]";
    // token-chave precisa de "." antes (ou início/]).
    const isIndexToken = path[m.index] === "[";
    if (m.index !== 0 && !isIndexToken && path[m.index - 1] !== "." && path[m.index - 1] !== "]") {
      throw new EngineeringError("INPUT_INVALID", `path "${path}" malformed at offset ${m.index}`);
    }
    if (m[1] !== undefined) { tokens.push(m[1]); expectKey = false; }
    else { tokens.push(parseInt(m[2], 10)); expectKey = true; }
  }
  if (tokens.length === 0) throw new EngineeringError("INPUT_INVALID", `path "${path}" is empty`);
  let current: unknown = root;
  for (let i = 0; i < tokens.length - 1; i++) {
    current = step(current, tokens[i], path);
  }
  const last = tokens[tokens.length - 1];
  return { parent: current, key: last, current: step(current, last, path, true) };
}

function step(current: unknown, key: string | number, path: string, peek = false): unknown {
  if (typeof key === "number") {
    if (!Array.isArray(current)) throw new EngineeringError("INPUT_INVALID", `path "${path}": expected array at [${key}]`);
    if (peek) return current[key];
    if (key >= current.length) throw new EngineeringError("INPUT_INVALID", `path "${path}": index ${key} out of bounds (len ${current.length})`);
    return current[key];
  }
  if (current === null || typeof current !== "object") throw new EngineeringError("INPUT_INVALID", `path "${path}": expected object at "${key}"`);
  if (peek) return (current as Record<string, unknown>)[key];
  if (!(key in (current as Record<string, unknown>))) throw new EngineeringError("INPUT_INVALID", `path "${path}": key "${key}" not found`);
  return (current as Record<string, unknown>)[key];
}

export function applyPatchOp(doc: unknown, op: PatchOp): unknown {
  const { parent, key } = navigate(doc, op.path);
  if (op.op === "replace") {
    if (op.value === undefined) throw new EngineeringError("INPUT_INVALID", `op replace em "${op.path}" exige value`);
    if (typeof key === "number") {
      if (!Array.isArray(parent)) throw new EngineeringError("INPUT_INVALID", `path "${op.path}": expected array`);
      if (key >= parent.length) throw new EngineeringError("INPUT_INVALID", `path "${op.path}": index ${key} out of bounds`);
      parent[key] = op.value;
    } else {
      if (parent === null || typeof parent !== "object" || !(key in (parent as Record<string, unknown>))) {
        throw new EngineeringError("INPUT_INVALID", `op replace em "${op.path}": chave inexistente (use add)`);
      }
      (parent as Record<string, unknown>)[key] = op.value;
    }
  } else if (op.op === "remove") {
    if (op.value !== undefined) throw new EngineeringError("INPUT_INVALID", `op remove em "${op.path}" não aceita value`);
    if (typeof key === "number") {
      if (!Array.isArray(parent)) throw new EngineeringError("INPUT_INVALID", `path "${op.path}": expected array`);
      if (key >= parent.length) throw new EngineeringError("INPUT_INVALID", `path "${op.path}": index ${key} out of bounds`);
      parent.splice(key, 1);
    } else {
      if (parent === null || typeof parent !== "object" || !(key in (parent as Record<string, unknown>))) {
        throw new EngineeringError("INPUT_INVALID", `op remove em "${op.path}": chave inexistente`);
      }
      delete (parent as Record<string, unknown>)[key];
    }
  } else { // add
    if (op.value === undefined) throw new EngineeringError("INPUT_INVALID", `op add em "${op.path}" exige value`);
    if (typeof key === "number") {
      if (!Array.isArray(parent)) throw new EngineeringError("INPUT_INVALID", `path "${op.path}": expected array`);
      if (key !== parent.length) throw new EngineeringError("INPUT_INVALID", `op add em "${op.path}": índice ${key} != len ${parent.length} (add só apenda)`);
      parent.push(op.value);
    } else {
      if (parent === null || typeof parent !== "object") throw new EngineeringError("INPUT_INVALID", `path "${op.path}": expected object`);
      if (key in (parent as Record<string, unknown>)) throw new EngineeringError("INPUT_INVALID", `op add em "${op.path}": chave já existe (use replace)`);
      (parent as Record<string, unknown>)[key] = op.value;
    }
  }
  return doc;
}

// ---------------------------------------------------------------- validação pós-patch
// Schema do manifesto verify (mesmo contrato do runner): mission case-identical,
// provas tipadas com "cmd": [{"run", "expect_exit"}] — NÃO "cmds"/"files", NÃO "cmd"
// dentro das entradas; timeout >= mínimo se suíte (npm test etc.).
const SUITE_RE = /\bnpm\s+(?:run\s+)?test\b|\bvitest\b|\bpytest\b|\bcargo\s+test\b|\bgo\s+test\b/;
const SUITE_MIN_TIMEOUT_S = 30;

export function validateManifest(doc: unknown, missionId: string): string[] {
  const errs: string[] = [];
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return ["manifesto não é objeto JSON"];
  const d = doc as Record<string, unknown>;
  if (typeof d.mission !== "string" || d.mission !== missionId) {
    errs.push(`campo "mission" (${JSON.stringify(d.mission)}) != missionId case-identical "${missionId}"`);
  }
  for (const key of ["cmd", "file"]) {
    const arr = d[key];
    if (arr === undefined) continue;
    if (!Array.isArray(arr)) { errs.push(`"${key}" deve ser array`); continue; }
    arr.forEach((e, i) => {
      if (e === null || typeof e !== "object" || Array.isArray(e)) { errs.push(`${key}[${i}] não é objeto`); return; }
      const entry = e as Record<string, unknown>;
      if (key === "cmd") {
        if (typeof entry.run !== "string" || entry.run.length === 0) errs.push(`cmd[${i}].run ausente/vazio`);
        if (!("expect_exit" in entry) || typeof entry.expect_exit !== "number") errs.push(`cmd[${i}].expect_exit numérico ausente`);
        if ("cmd" in entry) errs.push(`cmd[${i}] tem campo "cmd" dentro da entrada (proibido)`);
        if ("cmds" in entry || "files" in entry) errs.push(`cmd[${i}] usa "cmds"/"files" (proibido; provas tipadas "cmd"/"file")`);
        const timeout = entry.timeout;
        if (timeout !== undefined && typeof timeout === "number" && SUITE_RE.test(String(entry.run)) && timeout < SUITE_MIN_TIMEOUT_S) {
          errs.push(`cmd[${i}].timeout ${timeout}s < mínimo ${SUITE_MIN_TIMEOUT_S}s para suíte`);
        }
      } else {
        if (typeof entry.path !== "string" || entry.path.length === 0) errs.push(`file[${i}].path ausente/vazio`);
        if ("files" in entry) errs.push(`file[${i}] usa "files" (proibido)`);
      }
    });
  }
  return errs;
}

// ---------------------------------------------------------------- audit
function truncate(v: unknown): string {
  const s = JSON.stringify(v) ?? String(v);
  return s.length > TRUNCATE ? s.slice(0, TRUNCATE) + "…" : s;
}

export function appendAudit(entry: Record<string, unknown>, auditPath = AUDIT_PATH): void {
  try {
    mkdirSync(dirname(auditPath), { recursive: true });
    appendFileSync(auditPath, JSON.stringify(entry) + "\n");
  } catch (e) {
    throw new EngineeringError("AUDIT_WRITE_FAILED", String(e).slice(0, 200));
  }
}

// ---------------------------------------------------------------- runner
export type ManifestPatchDeps = {
  readFileSync?: typeof readFileSync;
  writeFileSync?: typeof writeFileSync;
  existsSync?: typeof existsSync;
  appendFileSync?: typeof appendFileSync;
  auditPath?: string;
  ledgerDir?: string;
};

export async function runMissionManifestPatch(input: MissionManifestPatchInput, deps: ManifestPatchDeps = {}): Promise<Record<string, unknown>> {
  const rd = deps.readFileSync ?? readFileSync;
  const wr = deps.writeFileSync ?? writeFileSync;
  const ex = deps.existsSync ?? existsSync;
  const ap = deps.appendFileSync ?? appendFileSync;
  const auditPath = deps.auditPath ?? AUDIT_PATH;
  const ledgerDir = deps.ledgerDir ?? LEDGER_DIR;

  const missionId = input.missionId;
  const ledger = loadLedger(missionId, ledgerDir, rd, ex);
  const { path: manifestPath, how } = resolveManifestPath(missionId, ledger);
  if (!manifestPath || !ex(manifestPath)) {
    throw new EngineeringError("MANIFEST_NOT_FOUND", `nenhum verify-<missionId>.json nem verify.json resolvível para ${missionId}`);
  }

  const beforeRaw = rd(manifestPath, "utf8");
  let doc: unknown;
  try {
    doc = JSON.parse(beforeRaw);
  } catch (e) {
    throw new EngineeringError("MANIFEST_UNPARSEABLE", String(e).slice(0, 200));
  }

  // Patch atômico em cópia profunda: qualquer op inválida recusa INTEIRO (sem aplicação parcial).
  let patched: unknown;
  try {
    patched = JSON.parse(beforeRaw);
    for (const op of input.patch) applyPatchOp(patched, op);
  } catch (e) {
    if (e instanceof EngineeringError) throw e;
    throw new EngineeringError("PATCH_FAILED", String(e).slice(0, 200));
  }

  const errs = validateManifest(patched, missionId);
  if (errs.length > 0) {
    throw new EngineeringError("PATCH_INVALID", `validação pós-patch falhou (recusa INTEIRA): ${errs.join("; ")}`.slice(0, 800));
  }

  // Escrita atômica (tmp + rename via writeFileSync direto no caminho — arquivo pequeno,
  // e o runner lê depois; TOCTOU aceitável pois só o supervisor governado escreve).
  wr(manifestPath, JSON.stringify(patched, null, 2) + "\n", "utf8");

  const auditEntry = {
    ts: new Date().toISOString(),
    missionId,
    manifestPath,
    how,
    ops: input.patch.map((o) => ({ op: o.op, path: o.path, value: truncate(o.value) })),
    before: truncate(JSON.parse(beforeRaw)),
    after: truncate(patched),
  };
  mkdirSync(dirname(auditPath), { recursive: true });
  ap(auditPath, Buffer.from(JSON.stringify(auditEntry) + "\n", "utf8"));

  return {
    ok: true,
    missionId,
    manifestPath,
    resolvedHow: how,
    opsApplied: input.patch.length,
    auditPath,
  };
}