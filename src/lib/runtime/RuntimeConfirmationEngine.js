/**
 * RuntimeConfirmationEngine — Implementation 010.5
 *
 * Motor universal de confirmacao para acoes irreversiveis.
 *
 * Responsabilidade unica: gerenciar o ciclo de vida de solicitacoes
 * de confirmacao: criar, confirmar, cancelar, expirar e auditar.
 *
 * NAO depende de UI.
 * NAO depende do Gmail.
 * NAO depende do Google.
 * Reutilizavel por qualquer Connector.
 *
 * Seguranca:
 *   - Cada confirmacao so pode ser utilizada UMA unica vez.
 *   - Apos confirmar, cancelar ou expirar: solicitacao e invalidada.
 *   - Reutilizacao sempre bloqueada.
 *   - Timeout padrao: 120 segundos.
 */

const DEFAULT_TIMEOUT_MS = 120_000;
const LOG_PREFIX = "[RuntimeConfirmationEngine]";

// ── ID generator ──────────────────────────────────────────────────────────────

let _seq = 0;
function generateId() {
  _seq += 1;
  return `rce-${Date.now()}-${_seq}-${Math.random().toString(36).slice(2, 6)}`;
}

// ── Audit log ─────────────────────────────────────────────────────────────────

const _auditLog = [];

function _audit(entry) {
  _auditLog.push({ ...entry, recordedAt: Date.now() });
}

// ── Pending store ─────────────────────────────────────────────────────────────
// Map<id, { request, resolve, timeoutHandle }>

const _pending = new Map();

// ── Core API ──────────────────────────────────────────────────────────────────

/**
 * Cria uma solicitacao de confirmacao.
 * Retorna uma Promise que resolve com ConfirmationResult quando o usuario decide.
 *
 * @param {Object} opts
 * @param {string} opts.capability  - Nome do conector/capacidade ("gmail.sendEmail")
 * @param {string} opts.title       - Titulo curto exibido ao usuario
 * @param {string} opts.description - Descricao detalhada da acao
 * @param {unknown} [opts.payload]  - Dados originais (preservados para auditoria)
 * @param {number} [opts.timeoutMs] - Override do timeout padrao (120s)
 * @param {string} [opts.userId]    - ID do usuario (para auditoria)
 * @returns {Promise<ConfirmationResult>}
 */
export function requestConfirmation({ capability, title, description, payload, timeoutMs, userId } = {}) {
  const id        = generateId();
  const now       = Date.now();
  const expiresAt = now + (timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const request = Object.freeze({
    id,
    capability:  capability  ?? "unknown",
    title:       title       ?? "Confirmar acao",
    description: description ?? "Deseja prosseguir?",
    payload:     payload     ?? null,
    userId:      userId      ?? null,
    createdAt:   now,
    expiresAt,
  });

  if (import.meta.env.DEV) {
    console.log(`${LOG_PREFIX} Solicitacao criada: ${id} [${capability}]`);
  }

  return new Promise((resolve) => {
    // Auto-expire
    const timeoutHandle = setTimeout(() => {
      if (!_pending.has(id)) return;
      _pending.delete(id);
      const result = Object.freeze({ confirmed: false, cancelled: false, expired: true });
      _audit({
        id,
        capability:  request.capability,
        userId:      request.userId,
        decision:    "expired",
        durationMs:  Date.now() - now,
      });
      if (import.meta.env.DEV) console.log(`${LOG_PREFIX} Expirado: ${id}`);
      resolve(result);
    }, timeoutMs ?? DEFAULT_TIMEOUT_MS);

    _pending.set(id, { request, resolve, startedAt: now, timeoutHandle });
  });
}

/**
 * Confirma uma solicitacao pelo ID.
 * @param {string} id
 * @returns {boolean} true se encontrada e resolvida, false se invalida
 */
export function confirm(id) {
  const entry = _pending.get(id);
  if (!entry) return false;

  clearTimeout(entry.timeoutHandle);
  _pending.delete(id);

  _audit({
    id,
    capability:  entry.request.capability,
    userId:      entry.request.userId,
    decision:    "confirmed",
    durationMs:  Date.now() - entry.startedAt,
  });

  if (import.meta.env.DEV) console.log(`${LOG_PREFIX} Confirmado: ${id}`);
  entry.resolve(Object.freeze({ confirmed: true, cancelled: false, expired: false }));
  return true;
}

/**
 * Cancela uma solicitacao pelo ID.
 * @param {string} id
 * @returns {boolean} true se encontrada e resolvida, false se invalida
 */
export function cancel(id) {
  const entry = _pending.get(id);
  if (!entry) return false;

  clearTimeout(entry.timeoutHandle);
  _pending.delete(id);

  _audit({
    id,
    capability:  entry.request.capability,
    userId:      entry.request.userId,
    decision:    "cancelled",
    durationMs:  Date.now() - entry.startedAt,
  });

  if (import.meta.env.DEV) console.log(`${LOG_PREFIX} Cancelado: ${id}`);
  entry.resolve(Object.freeze({ confirmed: false, cancelled: true, expired: false }));
  return true;
}

/**
 * Retorna a solicitacao pendente pelo ID (somente leitura).
 * @param {string} id
 * @returns {ConfirmationRequest | null}
 */
export function getPending(id) {
  return _pending.get(id)?.request ?? null;
}

/**
 * Lista todas as solicitacoes pendentes (somente leitura).
 * @returns {ConfirmationRequest[]}
 */
export function listPending() {
  return Array.from(_pending.values()).map(e => e.request);
}

/**
 * Retorna o log de auditoria (somente leitura).
 * @returns {AuditEntry[]}
 */
export function getAuditLog() {
  return [..._auditLog];
}

/**
 * Retorna metricas do engine.
 */
export function getMetrics() {
  const log = _auditLog;
  return {
    pending:    _pending.size,
    total:      log.length,
    confirmed:  log.filter(e => e.decision === "confirmed").length,
    cancelled:  log.filter(e => e.decision === "cancelled").length,
    expired:    log.filter(e => e.decision === "expired").length,
    avgDurationMs: log.length
      ? Math.round(log.reduce((a, e) => a + e.durationMs, 0) / log.length)
      : 0,
  };
}