// GUARD-SUPERVISOR-READONLY-01 (04/10) — guarda determinística (zero-LLM) das
// tools de mutação/ship do eng-mcp chamadas pelo SUPERVISOR.
//
//   engineering.git.push / engineering.git.merge / engineering.release.run /
//   engineering.release.pipeline / engineering.release.test /
//   engineering.guardian.app.deploy / engineering.base44.function.deploy /
//   engineering.distribution.publish
//
// Recusam quando o CHAMADOR é supervisor (subject autenticado do token bearer,
// resolvido SERVER-SIDE pelo authenticateBearer — nunca campo do payload).
// SEC-OPERATOR-IDENTITY-01 (04/10): o `operatorOrder` de mutação passou a ser
// TOKEN VERIFICÁVEL (hash em /data/manifests/operator-order-token.json ou origem
// Telegram allowlistada em /data/manifests/operator-allowlist.json — ver
// operatorToken.ts); referência textual continua aceita como intent pendente e
// para ações NÃO-consequência, mas MUTAÇÃO só sai com token: sem token válido →
// OPERATOR_ORDER_UNVERIFIED, NADA executado, audit operator_order_unverified
// (hash16, nunca o token). Sem operatorOrder → SUPERVISOR_MUTATION_FORBIDDEN
// (legado). Erro tipado lançado ANTES de qualquer execução, com evento tipado de
// audit no spool (recusa E passagem). Chamador não-supervisor (worker/automação)
// passa sem guard (compatibilidade: o guard aponta SUPERVISOR, nunca o worker).
//
// Resolução de identidade (honestidade anti-spoof): o subject vem do token
// bearer autenticado server-side (policy.authenticateBearer) — bem mais forte
// que autodeclaração de payload — mas a LISTA de subjects-supervisor é
// operator-owned (roles.json "supervisorSubjects" ∪ env
// ENG_MCP_SUPERVISOR_SUBJECTS ∪ {"supervisor"}): quem controla esses arquivos/
// env controla quem é supervisor. Mesma classe de risco operator-owned do
// chainBasis=payload (ORCH-CHAIN-CWD-01). Mitigação futura sugerida: token de
// ordem assinado/revogável emitido pelo registry em vez de referência textual.
//
// Audit fail-open: erro de escrita no spool NUNCA derruba o fluxo.
import { EngineeringError } from "./policy.js";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { operatorTokenHash16Of, telegramBindingAllows, verifyOperatorOrderToken, readOperatorOrderOrigin } from "./operatorToken.js";

const CANONICAL_SUBJECTS = new Set(["supervisor"]);

function rolesPath(): string {
  return process.env.ENG_MCP_ROLES_FILE || "/opt/gpu-bridge/roles.json";
}

export function supervisorSubjects(): Set<string> {
  const out = new Set(CANONICAL_SUBJECTS);
  const envList = process.env.ENG_MCP_SUPERVISOR_SUBJECTS || "";
  for (const piece of envList.split(",")) {
    const trimmed = piece.trim();
    if (trimmed) out.add(trimmed);
  }
  try {
    const roles = JSON.parse(readFileSync(rolesPath(), "utf8")) as Record<string, unknown>;
    const listed = roles.supervisorSubjects;
    if (Array.isArray(listed)) {
      for (const item of listed) {
        if (typeof item === "string" && item.trim()) out.add(item.trim());
      }
    }
  } catch {
    // roles.json ausente/inválido → default canônico (fail-open, nunca levanta)
  }
  return out;
}

export function isSupervisorSubject(subject: string | null | undefined): boolean {
  return Boolean(subject) && supervisorSubjects().has(String(subject));
}

export function operatorOrderOf(input: unknown): string | null {
  const value = (input as { operatorOrder?: unknown } | null | undefined)?.operatorOrder;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= 8 ? trimmed : null;
}

// Evento tipado no spool (mesmo arquivo do plugin: /opt/mission-events/spool.jsonl,
// linhas JSON com ts/event/kind/source). Best-effort: falha de escrita é
// silenciosa por desenho (audit nunca derruba o fluxo da missão).
export function guardAuditSpool(kind: string, fields: Record<string, unknown>): void {
  try {
    const path = process.env.ENG_MCP_GUARD_AUDIT_FILE || "/opt/mission-events/spool.jsonl";
    const rec = { ts: Date.now() / 1000, event: kind, kind, source: "supervisor-guard-engmcp", ...fields };
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify(rec) + "\n", "utf8");
  } catch {
    // fail-open honesto: audit é best-effort
  }
}

// G1 (eng-mcp): recusa tipada ANTES de qualquer execução. Estados do
// operatorOrder para chamador SUPERVISOR (SEC-OPERATOR-IDENTITY-01):
//   sem operatorOrder        → SUPERVISOR_MUTATION_FORBIDDEN (legado, inalterado)
//   operatorOrder = token válido (hash confere em
//                            /data/manifests/operator-order-token.json) →
//                            executa; audit operator_order_verified + hash16 do
//                            token (nunca o token) + evento legado allowed_by_order
//   origem telegram          → binding válido (/data/manifests/operator-allowlist.
//                            allowlistada             json) + chat_id allowlistado
//                            resolve como token (camada 2); binding ausente →
//                            camada inativa, nota honesta no audit (fail-closed)
//   token inválido/expirado/ → OPERATOR_ORDER_UNVERIFIED: NADA executado, audit
//   revogado/replay          operator_order_unverified (hash16 do valor
//                            apresentado, nunca o valor)
// Chamador não-supervisor passa sem guard (worker/daemon compat).
export function assertSupervisorMutationAllowed(tool: string, subject: string | null | undefined, input: unknown): void {
  let isSupervisor = false;
  try {
    isSupervisor = isSupervisorSubject(subject);
  } catch {
    return; // fail-open: falha de resolução nunca bloqueia worker/automação
  }
  if (!isSupervisor) return;
  const order = operatorOrderOf(input);
  if (order) {
    const verdict = verifyOperatorOrderToken(order);
    const orderHash16 = operatorTokenHash16Of(order);
    if (verdict.verified) {
      guardAuditSpool("operator_order_verified", { tool, subject: subject ?? null, basis: "token", tokenHash16: verdict.tokenHash16, orderHash16 });
      // evento legado GUARD-SUPERVISOR-READONLY-01 preservado (passagem com
      // ordem) — SEC-OPERATOR-IDENTITY-01: a ordem É o token agora, então o
      // legado carrega orderHash16 (NUNCA o valor em claro)
      guardAuditSpool("supervisor_mutation_allowed_by_order", { tool, subject: subject ?? null, orderHash16, basis: "token" });
      return;
    }
    const binding = telegramBindingAllows(readOperatorOrderOrigin());
    if (binding.allowed) {
      guardAuditSpool("operator_order_verified", { tool, subject: subject ?? null, basis: "telegram-binding", chatHash16: binding.chatHash16, orderHash16, tokenStatus: verdict.status });
      guardAuditSpool("supervisor_mutation_allowed_by_order", { tool, subject: subject ?? null, orderHash16, basis: "telegram-binding" });
      return;
    }
    guardAuditSpool("operator_order_unverified", { tool, subject: subject ?? null, tokenStatus: verdict.status, tokenReason: verdict.reason, orderHash16, channelNote: binding.note });
    throw new EngineeringError(
      "OPERATOR_ORDER_UNVERIFIED",
      `OPERATOR_ORDER_UNVERIFIED: operatorOrder de '${tool}' não verificou como token de ordem (status ${verdict.status}${verdict.reason ? `, ${verdict.reason}` : ""}); ${binding.note ?? "canal autenticado inativo"} — mutação NÃO executada; ordens de consequência exigem token válido em /data/manifests/operator-order-token.json (concessão do operator; SEC-OPERATOR-IDENTITY-01)`,
    );
  }
  const base = { tool, subject: subject ?? null, operatorOrder: null };
  guardAuditSpool("supervisor_mutation_forbidden", base);
  // Código no início da mensagem: o envelope de erro só carrega o texto — o
  // operador precisa ver o código tipado no chat também.
  throw new EngineeringError(
    "SUPERVISOR_MUTATION_FORBIDDEN",
    `SUPERVISOR_MUTATION_FORBIDDEN: tool '${tool}' é mutação/ship — chamador supervisor exige operatorOrder VERIFICÁVEL (token de ordem em /data/manifests/operator-order-token.json ou canal Telegram allowlistado; referência textual NÃO autoriza mutação — SEC-OPERATOR-IDENTITY-01); nada executado, audit gravado no spool`
  );
}