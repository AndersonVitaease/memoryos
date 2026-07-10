/**
 * MemoryPriority — Níveis de Prioridade da Memória
 * Foundation: MRS Cap.3
 * Sprint: 1
 */

/** Prioridades numéricas para ordenação determinística */
export enum MemoryPriority {
  LOW      = 1,
  NORMAL   = 2,
  HIGH     = 3,
  CRITICAL = 4,
}

/** TTLs padrão por prioridade (ms) — conforme MPAR */
export const DEFAULT_TTL_BY_PRIORITY: Record<MemoryPriority, number> = {
  [MemoryPriority.LOW]:      30 * 60 * 1000,   // 30 min
  [MemoryPriority.NORMAL]:   60 * 60 * 1000,   // 1 hora
  [MemoryPriority.HIGH]:     4  * 60 * 60 * 1000, // 4 horas
  [MemoryPriority.CRITICAL]: 24 * 60 * 60 * 1000, // 24 horas
};

/** Converte string para MemoryPriority */
export function parsePriority(value: string): MemoryPriority {
  const map: Record<string, MemoryPriority> = {
    low:      MemoryPriority.LOW,
    normal:   MemoryPriority.NORMAL,
    high:     MemoryPriority.HIGH,
    critical: MemoryPriority.CRITICAL,
  };
  const result = map[value.toLowerCase()];
  if (result === undefined) throw new Error(`Invalid priority: ${value}`);
  return result;
}

/** Retorna o label string de uma prioridade */
export function priorityLabel(p: MemoryPriority): string {
  return MemoryPriority[p].toLowerCase();
}