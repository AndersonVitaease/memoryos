/**
 * Memory Audit (Sprint 22 — Memory Engine)
 *
 * Registra trilha de auditoria para cada operação do Memory Engine.
 * Determinístico — IDs sequenciais, timestamps ISO.
 *
 * NÃO chama LLM, NÃO executa HTTP, NÃO acessa APIs externas.
 */

import { buildAuditEntry } from "./memoryResult";

const _entries = [];

/**
 * Registra uma entrada de auditoria.
 */
export function record(step, action, detail) {
  const entry = buildAuditEntry({ step, action, detail });
  _entries.push(entry);
  return entry;
}

/**
 * Retorna a trilha de auditoria completa (cópia).
 */
export function getTrail() {
  return [..._entries];
}

/**
 * Retorna entradas filtradas por step.
 */
export function getEntriesByStep(step) {
  return _entries.filter((e) => e.step === step);
}

/**
 * Limpa a trilha de auditoria.
 */
export function clear() {
  _entries.length = 0;
}

/**
 * Retorna o número de entradas.
 */
export function size() {
  return _entries.length;
}