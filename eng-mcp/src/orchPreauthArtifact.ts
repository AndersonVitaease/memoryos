/**
 * ORCH-PREAUTH-ARTIFACT-01 — leitor do artefato preauth do despacho do orquestrador.
 *
 * O gate de despacho do daemon (orch-daemon-consume) vale-se de um ARTEFATO
 * OPERADOR-CONCEDIDO em /data/manifests/orch-daemon-consume.json (modelo
 * PREAUTH-SCOPE-01/AUTO-RUN-01A). Este módulo é a ÚNICA forma de acesso do daemon
 * ao artefato: SOMENTE LEITURA (nunca cria, nunca escreve — a concessão é do
 * operador via engineering.mission.preauth; ver antiSelfApproveGuard no ciclo).
 *
 * Duas formas operator-concedidas são aceitas (o operador concede por uma delas):
 *   A) Forma do contrato: {issuer, subject:"orch-daemon-consume", grantedAt,
 *      expiresAt, scope:["mission_dispatch","tool_call:tier2"], hash} — hash é a
 *      autointegridade: sha256 (16 hex) do corpo canônico (chaves ordenadas, sem
 *      o próprio campo "hash"). Revogação: {"revoked":true} (ou revokedAt).
 *   B) Forma do manifesto preauth (engineering.mission.preauth create com
 *      mission=orch-daemon-consume): {version, mission, holder, createdAt,
 *      expiresAt, operations, approvedBy, hash16, revokedAt?} — validada por
 *      validateManifest (missionManifest.ts), com a exigência extra de que o
 *      manifesto seja DESTA missão (orch-daemon-consume).
 *
 * Fail-closed: ausente / não-arquivo / modo de permissão inseguro / corrompido /
 * forma desconhecida / subject ou missão divergentes / scope insuficiente /
 * expirado / revogado / hash divergente NUNCA liberam execute — o ciclo fica em
 * awaiting_approval (PLAN, exit 0). Nunca lança: todo estado é um retorno tipado.
 */
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { validateManifest } from './missionManifest.js';

export const ORCH_PREAUTH_DEFAULT_PATH = '/data/manifests/orch-daemon-consume.json';
export const ORCH_PREAUTH_SUBJECT = 'orch-daemon-consume';
/** Escopo mínimo para o despacho da fila de intents (o contrato declara também tool_call:tier2). */
export const ORCH_PREAUTH_REQUIRED_SCOPE = 'mission_dispatch';

export type OrchPreauthStatus = 'valid' | 'absent' | 'expired' | 'revoked' | 'hash_mismatch' | 'invalid';

export interface OrchPreauthReading {
  path: string;
  status: OrchPreauthStatus;
  /** Motivo estrutural quando status !== 'valid' (e null quando válido). */
  reason: string | null;
  /** Hash declarado (forma B) ou recalculado (forma A) — metadata de auditoria. */
  hash16: string | null;
  expiresAt: string | null;
  issuer: string | null;
  /** Forma reconhecida do artefato. */
  source: 'artifact' | 'preauth-manifest';
}

/** Override por env (provas E2E usam caminho de fixture); default é produção. */
export function orchPreauthPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.ORCH_PREAUTH_PATH || ORCH_PREAUTH_DEFAULT_PATH;
}

/** Canonical JSON (chaves ordenadas, undefined descartado) — hash é sobre conteúdo. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().filter((k) => obj[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** hash16 do corpo canônico SEM o próprio campo "hash" (autointegridade da forma A). */
export function artifactHash16(body: Record<string, unknown>): string {
  const withoutHash: Record<string, unknown> = { ...body };
  delete withoutHash.hash;
  return createHash('sha256').update(canonical(withoutHash)).digest('hex').slice(0, 16);
}

function reading(path: string, source: OrchPreauthReading['source'], status: OrchPreauthStatus, reason: string | null, extra: Partial<OrchPreauthReading> = {}): OrchPreauthReading {
  return { path, status, reason, hash16: null, expiresAt: null, issuer: null, source, ...extra };
}

/**
 * Lê e valida o artefato preauth (SÓ LEITURA — nunca lança, todo estado é tipado).
 * Ordem de validação (fail-closed): existência → arquivo → permissões → JSON →
 * revogado → forma → campos/subject/missão/scope → expiração → hash.
 */
export function readPreauthArtifact(path: string = orchPreauthPath(), now: number = Date.now()): OrchPreauthReading {
  let st;
  try {
    st = statSync(path);
  } catch {
    return reading(path, 'artifact', 'absent', 'ABSENT');
  }
  if (!st.isFile()) return reading(path, 'artifact', 'invalid', 'NOT_A_FILE');
  // Mesma exigência de loadActiveManifests: group/world-writable é tratado como ausente.
  if ((st.mode & 0o022) !== 0) return reading(path, 'artifact', 'invalid', 'INSECURE_MODE');

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return reading(path, 'artifact', 'invalid', 'UNREADABLE_OR_CORRUPT');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return reading(path, 'artifact', 'invalid', 'NOT_AN_OBJECT');
  }
  const art = parsed as Record<string, unknown>;

  // Revogação (qualquer forma) independe de expiração — fail-closed imediato.
  if (art.revoked === true || (typeof art.revokedAt === 'string' && art.revokedAt.length > 0)) {
    return reading(path, 'artifact', 'revoked', 'REVOKED');
  }

  // Forma B: manifesto preauth (engineering.mission.preauth, mission=orch-daemon-consume).
  if (typeof art.mission === 'string' && typeof art.hash16 === 'string') {
    if (art.mission !== ORCH_PREAUTH_SUBJECT) {
      return reading(path, 'preauth-manifest', 'invalid', 'MISSION_MISMATCH');
    }
    const reason = validateManifest(art, now);
    const status: OrchPreauthStatus = reason === null ? 'valid'
      : reason === 'REVOKED' ? 'revoked'
      : reason === 'EXPIRED' ? 'expired'
      : reason === 'HASH_MISMATCH' ? 'hash_mismatch'
      : 'invalid';
    return reading(path, 'preauth-manifest', status, status === 'valid' ? null : reason, {
      hash16: art.hash16, expiresAt: typeof art.expiresAt === 'string' ? art.expiresAt : null, issuer: typeof art.approvedBy === 'string' ? art.approvedBy : null,
    });
  }

  // Forma A: artefato do contrato.
  if (typeof art.subject === 'string' && typeof art.hash === 'string') {
    if (art.subject !== ORCH_PREAUTH_SUBJECT) {
      return reading(path, 'artifact', 'invalid', 'SUBJECT_MISMATCH');
    }
    if (typeof art.issuer !== 'string' || art.issuer.length === 0 || typeof art.grantedAt !== 'string' || typeof art.expiresAt !== 'string') {
      return reading(path, 'artifact', 'invalid', 'MISSING_FIELDS');
    }
    if (!Array.isArray(art.scope) || !art.scope.includes(ORCH_PREAUTH_REQUIRED_SCOPE)) {
      return reading(path, 'artifact', 'invalid', 'SCOPE_INSUFFICIENT');
    }
    const exp = Date.parse(art.expiresAt);
    if (!Number.isFinite(exp)) return reading(path, 'artifact', 'invalid', 'INVALID_EXPIRES_AT');
    if (exp <= now) return reading(path, 'artifact', 'expired', 'EXPIRED', { expiresAt: art.expiresAt });
    const computed = artifactHash16(art);
    if (art.hash !== computed) {
      return reading(path, 'artifact', 'hash_mismatch', 'HASH_MISMATCH', { hash16: String(art.hash), expiresAt: art.expiresAt });
    }
    return reading(path, 'artifact', 'valid', null, { hash16: computed, expiresAt: art.expiresAt, issuer: art.issuer });
  }

  return reading(path, 'artifact', 'invalid', 'UNKNOWN_SHAPE');
}

/**
 * ORCH-PREAUTH-ARTIFACT-01 (item 4) — ANTI-SELF-APPROVE: o ciclo do daemon SÓ LÊ
 * o artefato. Qualquer operação que não seja leitura é recusada no código, no
 * módulo dono do caminho (a concessão/revogação é do OPERADOR via
 * engineering.mission.preauth — o daemon nunca cria, nunca escreve, nunca toca).
 */
export function assertPreauthArtifactAccess(op: 'read', path: string = orchPreauthPath()): void {
  if (op !== 'read') {
    throw new Error(`ANTI_SELF_APPROVE: operação "${op}" no artefato preauth recusada (${path}) — o daemon só lê (readPreauthArtifact); concessão é do OPERADOR via engineering.mission.preauth`);
  }
}