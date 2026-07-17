/**
 * ReferenceMatcher.ts — Sprint C-02.4
 * Responsabilidade unica: comparar texto de forma deterministica.
 *
 * Nao conhece score. Nao conhece ranking. Nao conhece Connectors.
 * Retorna apenas o tipo de correspondencia encontrado.
 * Todas as funcoes sao puras — sem efeitos colaterais.
 */

export type MatchType = "EXACT" | "PREFIX" | "CONTAINS" | "NONE";

export class ReferenceMatcher {
  /**
   * Compara dois textos case-insensitive, ignorando espacos laterais.
   * Retorna EXACT quando identicos, PREFIX quando target inicia com query,
   * CONTAINS quando target contem query, NONE caso contrario.
   */
  match(target: string, query: string): MatchType {
    const t = target.toLowerCase().trim();
    const q = query.toLowerCase().trim();
    if (!q) return "NONE";
    if (t === q)           return "EXACT";
    if (t.startsWith(q))   return "PREFIX";
    if (t.includes(q))     return "CONTAINS";
    return "NONE";
  }

  matchExact(target: string, query: string): boolean {
    return target.toLowerCase().trim() === query.toLowerCase().trim();
  }

  matchPrefix(target: string, query: string): boolean {
    const q = query.toLowerCase().trim();
    return q.length > 0 && target.toLowerCase().trim().startsWith(q);
  }

  matchContains(target: string, query: string): boolean {
    const q = query.toLowerCase().trim();
    return q.length > 0 && target.toLowerCase().trim().includes(q);
  }
}

/** Singleton — stateless, safe to share */
export const referenceMatcher = new ReferenceMatcher();