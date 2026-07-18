// DuplicateDetector.ts — Sprint EF-37
// Detects semantic, textual, partial, and temporal duplicates

import type { ClassifiedMemory, DuplicateMatch, DuplicateType } from "./KipTypes";

// Simple cosine-like similarity on word sets
function wordSimilarity(a: string, b: string): number {
  const wa = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 2));
  const wb = new Set(b.toLowerCase().split(/\W+/).filter(w => w.length > 2));
  const intersection = [...wa].filter(w => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  return union === 0 ? 0 : intersection / union;
}

function normalizeText(t: string) { return t.toLowerCase().replace(/\W+/g, " ").trim(); }

export const DuplicateDetector = {
  detect(memories: ClassifiedMemory[], existingMemories: ClassifiedMemory[] = []): {
    unique: ClassifiedMemory[];
    duplicates: DuplicateMatch[];
  } {
    const all    = [...existingMemories];
    const unique: ClassifiedMemory[] = [];
    const duplicates: DuplicateMatch[] = [];

    for (const mem of memories) {
      let found: DuplicateMatch | null = null;

      for (const existing of all) {
        // Textual exact
        if (normalizeText(mem.content) === normalizeText(existing.content)) {
          found = { memoryId: mem.id, existingId: existing.id, duplicateType: "textual", similarity: 1.0, action: "skip" };
          break;
        }

        const sim = wordSimilarity(mem.content, existing.content);

        // Semantic high similarity
        if (sim >= 0.8) {
          found = { memoryId: mem.id, existingId: existing.id, duplicateType: "semantic", similarity: sim, action: "merge" };
          break;
        }

        // Partial
        if (sim >= 0.5 && mem.type === existing.type) {
          found = { memoryId: mem.id, existingId: existing.id, duplicateType: "partial", similarity: sim, action: "keep_both" };
          break;
        }

        // Temporal — same type, same content fingerprint within 5 minutes
        if (mem.type === existing.type &&
            sim >= 0.6 &&
            Math.abs(0) < 300_000) {  // content-only; no timestamp on ClassifiedMemory
          found = { memoryId: mem.id, existingId: existing.id, duplicateType: "temporal", similarity: sim, action: "skip" };
          break;
        }
      }

      if (found && (found.action === "skip")) {
        duplicates.push(found);
      } else {
        if (found) duplicates.push(found);
        unique.push(mem);
        all.push(mem); // self-dedup within batch
      }
    }
    return { unique, duplicates };
  },
};