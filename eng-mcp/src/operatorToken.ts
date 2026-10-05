// SEC-OPERATOR-IDENTITY-01 (04/10) — token de ordem do operator + binding do
// canal autenticado (Telegram), camadas 1 e 2 da identidade de autorização.
//
//   Camada 1 (prioridade, independe de Telegram): ordens de consequência
//   (operatorOrder nas tools de mutação: git.push/merge/release, shell.allowlist
//   put, pipeline, deploy) passam a exigir TOKEN VERIFICÁVEL — hash do token
//   configurado pelo OPERADOR em /data/manifests/operator-order-token.json (0600,
//   mesmo padrão do artefato preauth ORCH-PREAUTH-ARTIFACT-01: hash16 de
//   autointegridade sobre corpo canônico, TTL opcional via expiresAt, revogação
//   via revoked, placeholder desativado via disabled). Verificação
//   DETERMINÍSTICA por comparação de hash (sha256, zero-LLM). Sem token válido →
//   recusa tipada OPERATOR_ORDER_UNVERIFIED (no supervisorGuard.ts), NADA
//   executado, audit operator_order_unverified com hash16 — NUNCA o token.
//
//   Camada 2 (config-dependente): se o binding do gateway Telegram estiver
//   configurado (/data/manifests/operator-allowlist.json com chat_id do operator
//   + autointegridade) e a origem autenticada da chamada for o chat_id
//   allowlistado, a ordem vale como token. Gateway NÃO configurado → camada 2
//   INATIVA com nota honesta no audit (fail-closed: sem token E sem canal, a
//   mutação não sai). A origem é resolvida SERVER-SIDE (env preenchido só por
//   integração que já autenticou a origem) — NUNCA de campo do payload.
//
//   ANTI-SELF-WRITE: este módulo é SÓ LEITURA (assertOperatorTokenAccess) — o
//   worker nunca cria, nunca escreve, nunca toca os artefatos; a concessão
//   (provisionamento do hash real / allowlist) é do OPERADOR.
//
// Fail-closed em TODOS os estados desconhecidos; nunca lança nos leitores (todo
// estado é retorno tipado); NUNCA loga/imprime o token em claro (só hash16).
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { canonicalJson } from "./orchPreauthArtifact.js";

export const OPERATOR_TOKEN_DEFAULT_PATH = "/data/manifests/operator-order-token.json";
export const OPERATOR_ALLOWLIST_DEFAULT_PATH = "/data/manifests/operator-allowlist.json";

export type OperatorTokenStatus = "valid" | "disabled" | "absent" | "expired" | "revoked" | "hash_mismatch" | "invalid";
export type OperatorChannelStatus = "valid" | "inactive" | "revoked" | "hash_mismatch" | "invalid";

export interface OperatorTokenReading {
  path: string;
  status: OperatorTokenStatus;
  /** Motivo estrutural quando status !== 'valid' (null quando válido). */
  reason: string | null;
  /** Primeiros 16 hex do hash do token configurado (metadata de audit — nunca o token). */
  tokenHash16: string | null;
  createdAt: string | null;
  expiresAt: string | null;
}

export interface OperatorOrderVerdict {
  verified: boolean;
  status: OperatorTokenStatus;
  reason: string | null;
  tokenHash16: string | null;
  /** hash16 do VALOR apresentado em operatorOrder (audit-only; nunca o valor). */
  presentedHash16: string;
}

/**
 * RD-HOST-02 (04/10) — leitor do arquivo do token INJETÁVEL. Default (fs
 * direto) preserva 100% o comportamento atual. O agente host-ops (não-root)
 * injeta um leitor que busca os bytes via `sudo -n /usr/bin/cat` (mesma
 * semântica de verificação, outra fonte de leitura — o arquivo é 0600
 * root:root e a leitura direta do uid do agente é EACCES).
 */
export interface OperatorTokenFileReader {
  stat: (path: string) => { isFile: () => boolean; mode: number };
  readFile: (path: string) => string;
}

/** Leitor default: fs direto (statSync/readFileSync) — comportamento existente. */
export const directOperatorTokenReader: OperatorTokenFileReader = {
  stat: statSync,
  readFile: (path: string) => readFileSync(path, "utf8")
};

export interface OperatorAllowlistReading {
  path: string;
  status: OperatorChannelStatus;
  reason: string | null;
  chatHashes16: string[];
}

export interface BindingVerdict {
  allowed: boolean;
  chatHash16: string | null;
  note: string | null;
}

export function operatorTokenPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.ENG_MCP_OPERATOR_TOKEN_FILE || OPERATOR_TOKEN_DEFAULT_PATH;
}

export function operatorAllowlistPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.ENG_MCP_OPERATOR_ALLOWLIST_FILE || OPERATOR_ALLOWLIST_DEFAULT_PATH;
}

/** hash16 (16 hex) do valor apresentado — audit-only: o token/chat NUNCA vai em claro. */
export function operatorTokenHash16Of(candidate: string): string {
  return createHash("sha256").update(String(candidate)).digest("hex").slice(0, 16);
}

function reading(path: string, status: OperatorTokenStatus, reason: string | null, extra: Partial<OperatorTokenReading> = {}): OperatorTokenReading {
  return { path, status, reason, tokenHash16: null, createdAt: null, expiresAt: null, ...extra };
}

const HEX64 = /^[0-9a-f]{64}$/;
const HEX16 = /^[0-9a-f]{16}$/;

/**
 * Lê e valida o arquivo do token (SÓ LEITURA — nunca lança, todo estado é tipado).
 * Ordem fail-closed: existência → arquivo → modo (0600 owner-only) → JSON →
 * objeto → revogado → placeholder disabled → versão → tokenHash → TTL → hash16.
 */
export function readOperatorTokenFile(path: string = operatorTokenPath(), now: number = Date.now(), reader: OperatorTokenFileReader = directOperatorTokenReader): OperatorTokenReading {
  let st;
  try {
    st = reader.stat(path);
  } catch {
    return reading(path, "absent", "ABSENT");
  }
  if (!st.isFile()) return reading(path, "invalid", "NOT_A_FILE");
  // 0600 padrão do contrato: owner-only (qualquer bit group/other recusa —
  // mesma classe da checagem de modo do artefato preauth, mais estrita).
  if ((st.mode & 0o077) !== 0) return reading(path, "invalid", "INSECURE_MODE");
  let parsed: unknown;
  try {
    parsed = JSON.parse(reader.readFile(path));
  } catch {
    return reading(path, "invalid", "UNREADABLE_OR_CORRUPT");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return reading(path, "invalid", "NOT_AN_OBJECT");
  }
  const art = parsed as Record<string, unknown>;
  if (art.revoked === true || (typeof art.revokedAt === "string" && art.revokedAt.length > 0)) {
    return reading(path, "revoked", "REVOKED");
  }
  if (art.disabled === true) {
    return reading(path, "disabled", "PLACEHOLDER_DISABLED");
  }
  if (art.version !== 1) return reading(path, "invalid", "UNSUPPORTED_VERSION");
  const tokenHash = typeof art.tokenHash === "string" ? art.tokenHash.toLowerCase() : null;
  if (tokenHash === null || !HEX64.test(tokenHash)) return reading(path, "invalid", "INVALID_TOKEN_HASH");
  let expiresAt: string | null = null;
  if (typeof art.expiresAt === "string" && art.expiresAt.length > 0) {
    expiresAt = art.expiresAt;
    const exp = Date.parse(expiresAt);
    if (!Number.isFinite(exp)) return reading(path, "invalid", "INVALID_EXPIRES_AT");
    if (exp <= now) return reading(path, "expired", "EXPIRED", { expiresAt });
  }
  const hash16 = typeof art.hash16 === "string" ? art.hash16.toLowerCase() : null;
  const createdAt = typeof art.createdAt === "string" ? art.createdAt : null;
  if (!HEX16.test(hash16 ?? "")) return reading(path, "invalid", "MISSING_SELF_HASH");
  const body: Record<string, unknown> = { ...art };
  delete body.hash16;
  const computed = createHash("sha256").update(canonicalJson(body)).digest("hex").slice(0, 16);
  if (hash16 !== computed) return reading(path, "hash_mismatch", "HASH_MISMATCH", { tokenHash16: tokenHash.slice(0, 16) });
  return reading(path, "valid", null, { tokenHash16: tokenHash.slice(0, 16), createdAt, expiresAt });
}

/**
 * Verificação determinística (comparação de hash, zero-LLM): o candidato
 * apresentado em operatorOrder é hasheado e comparado ao tokenHash configurado.
 * Estados inválidos do arquivo (absente/expirado/revogado/disabled/violado)
 * NUNCA verificam — fail-closed. Nunca retorna nem loga o token em claro.
 */
export function verifyOperatorOrderToken(candidate: string, path: string = operatorTokenPath(), now: number = Date.now(), reader: OperatorTokenFileReader = directOperatorTokenReader): OperatorOrderVerdict {
  const presentedHash16 = operatorTokenHash16Of(candidate);
  const file = readOperatorTokenFile(path, now, reader);
  if (file.status !== "valid") {
    return { verified: false, status: file.status, reason: file.reason, tokenHash16: file.tokenHash16, presentedHash16 };
  }
  // arquivo válido carrega os 64 hex do tokenHash (tokenHash16 é só a fração
  // de 16 para audit) — a comparação é sempre contra o hash completo
  const computed = createHash("sha256").update(String(candidate)).digest("hex");
  const art = JSON.parse(reader.readFile(path)) as { tokenHash?: string };
  const full = typeof art.tokenHash === "string" ? art.tokenHash.toLowerCase() : null;
  const verified = full !== null && HEX64.test(full) && computed === full;
  return {
    verified,
    status: verified ? "valid" : "invalid",
    reason: verified ? null : "TOKEN_HASH_MISMATCH",
    tokenHash16: file.tokenHash16,
    presentedHash16,
  };
}

/** ANTI-SELF-WRITE: o mecanismo é read-only — concessão/ativação é do OPERADOR. */
export function assertOperatorTokenAccess(op: "read", path: string = operatorTokenPath()): void {
  if (op !== "read") {
    throw new Error(`ANTI_SELF_APPROVE: operação "${op}" no artefato do token de ordem recusada (${path}) — o worker só lê (readOperatorTokenFile); concessão/ativação é do OPERADOR (SEC-OPERATOR-IDENTITY-01)`);
  }
}

// ------------------------------------------------ camada 2: binding Telegram

function allowlistReading(path: string, status: OperatorChannelStatus, reason: string | null, chatHashes16: string[] = []): OperatorAllowlistReading {
  return { path, status, reason, chatHashes16 };
}

/**
 * Lê e valida o binding do canal autenticado (mesma disciplina do token):
 * ausente/vazio = camada 2 INATIVA (nota honesta, fail-closed); violado/revogado
 * = recusa; modo owner-only obrigatório. Só leitura, nunca lança.
 */
export function readOperatorAllowlist(path: string = operatorAllowlistPath()): OperatorAllowlistReading {
  let st;
  try {
    st = statSync(path);
  } catch {
    return allowlistReading(path, "inactive", "ABSENT");
  }
  if (!st.isFile()) return allowlistReading(path, "invalid", "NOT_A_FILE");
  if ((st.mode & 0o077) !== 0) return allowlistReading(path, "invalid", "INSECURE_MODE");
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return allowlistReading(path, "invalid", "UNREADABLE_OR_CORRUPT");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return allowlistReading(path, "invalid", "NOT_AN_OBJECT");
  }
  const art = parsed as Record<string, unknown>;
  if (art.revoked === true || art.disabled === true) {
    return allowlistReading(path, "revoked", "REVOKED_OR_DISABLED");
  }
  if (art.version !== 1) return allowlistReading(path, "invalid", "UNSUPPORTED_VERSION");
  const telegram = art.telegram as { chatIds?: unknown } | undefined;
  const chatIds = Array.isArray(telegram?.chatIds) ? telegram.chatIds : null;
  if (!chatIds) return allowlistReading(path, "invalid", "MISSING_TELEGRAM_BINDING");
  const cleaned: string[] = [];
  for (const item of chatIds) {
    if (item && typeof item === "object" && typeof (item as { chatId?: unknown }).chatId === "string" && (item as { chatId: string }).chatId.trim()) {
      cleaned.push((item as { chatId: string }).chatId.trim());
    }
  }
  if (cleaned.length === 0) return allowlistReading(path, "inactive", "NO_CHAT_IDS_BOUND");
  const hash16 = typeof art.hash16 === "string" ? art.hash16.toLowerCase() : null;
  if (!HEX16.test(hash16 ?? "")) return allowlistReading(path, "invalid", "MISSING_SELF_HASH");
  const body: Record<string, unknown> = { ...art };
  delete body.hash16;
  const computed = createHash("sha256").update(canonicalJson(body)).digest("hex").slice(0, 16);
  if (hash16 !== computed) return allowlistReading(path, "hash_mismatch", "HASH_MISMATCH");
  return allowlistReading(path, "valid", null, cleaned.map((c) => operatorTokenHash16Of(c)));
}

/** Origem autenticada da ordem — SERVER-SIDE (env), nunca campo do payload. */
export interface OrderOrigin {
  platform: string;
  chatId: string;
}

export function readOperatorOrderOrigin(env: NodeJS.ProcessEnv = process.env): OrderOrigin | null {
  const platform = (env.ENG_MCP_ORDER_ORIGIN_PLATFORM || "").trim().toLowerCase();
  const chatId = (env.ENG_MCP_ORDER_ORIGIN_CHAT_ID || "").trim();
  if (!platform || !chatId) return null;
  return { platform, chatId };
}

/**
 * Camada 2: a origem autenticada (telegram + chat_id allowlistado) conta como
 * token quando o binding está VÁLIDO. Binding ausente → inativa (nota honesta);
 * violado → fail-closed. chatHash16 vai ao audit — nunca o chat_id.
 */
export function telegramBindingAllows(origin: OrderOrigin | null, path: string = operatorAllowlistPath()): BindingVerdict {
  const file = readOperatorAllowlist(path);
  if (file.status !== "valid") {
    return { allowed: false, chatHash16: null, note: `telegram-binding ${file.status} (${file.reason})` };
  }
  if (!origin || origin.platform !== "telegram" || !origin.chatId) {
    return { allowed: false, chatHash16: null, note: "origem autenticada ausente ou não-telegram" };
  }
  if (!file.chatHashes16.includes(operatorTokenHash16Of(origin.chatId))) {
    return { allowed: false, chatHash16: null, note: "origem chat_id fora da allowlist do operator" };
  }
  return { allowed: true, chatHash16: operatorTokenHash16Of(origin.chatId), note: null };
}