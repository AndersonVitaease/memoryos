// GUARD-SUPERVISOR-READONLY-01 (04/10) — guarda determinística (zero-LLM) das
// tools de mutação/ship do eng-mcp chamadas pelo SUPERVISOR.
//
//   engineering.git.push / engineering.git.merge / engineering.release.run /
//   engineering.release.pipeline / engineering.release.test /
//   engineering.guardian.app.deploy / engineering.base44.function.deploy /
//   engineering.distribution.publish
//
// Recusam quando o CHAMADOR é supervisor (subject autenticado do token bearer,
// resolvido SERVER-SIDE pelo authenticateBearer — nunca campo do payload) e o
// payload não carregar `operatorOrder` (referência explícita da ordem: missionId
// do contrato SHIP vigente ou token de ordem, string trim >= 8 chars). Erro
// tipado SUPERVISOR_MUTATION_FORBIDDEN — lançado ANTES de qualquer execução
// (nada é executado), com evento tipado de audit no spool (recusa E passagem
// com ordem). Chamador não-supervisor (worker/automação) passa sem guard
// (compatibilidade: o guard aponta SUPERVISOR, nunca o worker).
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

// G1 (eng-mcp): recusa tipada ANTES de qualquer execução. Lança
// EngineeringError("SUPERVISOR_MUTATION_FORBIDDEN") quando chamador é
// supervisor sem operatorOrder; grava evento tipado na recusa E na passagem
// com ordem; não-supervisor passa sem audit (worker/daemon compat).
export function assertSupervisorMutationAllowed(tool: string, subject: string | null | undefined, input: unknown): void {
  let isSupervisor = false;
  try {
    isSupervisor = isSupervisorSubject(subject);
  } catch {
    return; // fail-open: falha de resolução nunca bloqueia worker/automação
  }
  if (!isSupervisor) return;
  const order = operatorOrderOf(input);
  const base = { tool, subject: subject ?? null, operatorOrder: order };
  if (order) {
    guardAuditSpool("supervisor_mutation_allowed_by_order", base);
    return;
  }
  guardAuditSpool("supervisor_mutation_forbidden", base);
  // Código no início da mensagem: o envelope de erro só carrega o texto — o
  // operador precisa ver o código tipado no chat também.
  throw new EngineeringError(
    "SUPERVISOR_MUTATION_FORBIDDEN",
    `SUPERVISOR_MUTATION_FORBIDDEN: tool '${tool}' é mutação/ship — chamador supervisor exige operatorOrder explícito (missionId do contrato SHIP vigente ou token de ordem); nada executado, audit gravado no spool (GUARD-SUPERVISOR-READONLY-01)`
  );
}