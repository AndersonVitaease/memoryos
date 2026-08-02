/**
 * WatchDeduplicator.ts — WE-04
 *
 * Evita criação de Watches duplicados/semanticamente equivalentes.
 * Usa dois níveis:
 *   1. Hash rápido da ConditionTree serializada (match exato)
 *   2. Jaccard de provider+action tokens (match semântico, threshold 0.8)
 *
 * Regras (RFC-005 §4):
 * - Dois Watches são duplicatas se hash(conditionTree) == hash(conditionTree)
 *   OU se similaridade Jaccard dos tokens >= SEMANTIC_THRESHOLD
 * - Deduplicação não bloqueia criação — apenas informa o caller
 * - Nunca usa eval()
 */

import { base44 } from "@/api/base44Client";
import type { ConditionTree } from "./WatchTypes";

const SEMANTIC_THRESHOLD = 0.8;

// ── Extrai tokens provider+action de uma ConditionTree recursivamente ─────────

function extractTokens(tree: ConditionTree): string[] {
  if (tree.kind === "leaf") {
    return [`${tree.provider}:${tree.action}`];
  }
  if (tree.kind === "NOT") {
    return extractTokens(tree.condition);
  }
  // AND / OR
  return tree.conditions.flatMap(extractTokens);
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

// ── Hash determinístico (sem crypto — usa FNV-1a 32-bit) ──────────────────────

function fnv1a32(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export interface DeduplicationResult {
  isDuplicate: boolean;
  matchType: "none" | "exact" | "semantic";
  existingWatchId?: string;
  existingWatchName?: string;
  similarity?: number;
}

export class WatchDeduplicatorClass {
  async check(
    conditionTree: ConditionTree,
    sessionId?: string
  ): Promise<DeduplicationResult> {
    const serialized = JSON.stringify(conditionTree);
    const hash = fnv1a32(serialized);
    const tokens = extractTokens(conditionTree);

    try {
      // Busca watches ativos (mesma sessão se fornecido, senão global)
      const query: Record<string, unknown> = { status: "active" };
      if (sessionId) query.session_id = sessionId;

      const existing = await base44.entities.Watch.filter(query, "-created_date", 100);

      for (const w of existing) {
        if (!w.condition_tree) continue;

        // Nível 1: hash exato
        const existingHash = fnv1a32(w.condition_tree);
        if (existingHash === hash) {
          return {
            isDuplicate: true,
            matchType: "exact",
            existingWatchId: w.id,
            existingWatchName: w.name,
            similarity: 1.0,
          };
        }

        // Nível 2: Jaccard semântico
        try {
          const existingTree: ConditionTree = JSON.parse(w.condition_tree);
          const existingTokens = extractTokens(existingTree);
          const similarity = jaccardSimilarity(tokens, existingTokens);
          if (similarity >= SEMANTIC_THRESHOLD) {
            return {
              isDuplicate: true,
              matchType: "semantic",
              existingWatchId: w.id,
              existingWatchName: w.name,
              similarity,
            };
          }
        } catch {
          // ConditionTree inválida no banco — ignora
        }
      }
    } catch {
      // Falha na query não bloqueia a criação
    }

    return { isDuplicate: false, matchType: "none" };
  }
}

// Singleton HMR-safe
const _g = globalThis as unknown as Record<string, unknown>;
if (!_g.__WatchDeduplicator__) {
  _g.__WatchDeduplicator__ = new WatchDeduplicatorClass();
}
export const watchDeduplicator = _g.__WatchDeduplicator__ as WatchDeduplicatorClass;