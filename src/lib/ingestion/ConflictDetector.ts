// ConflictDetector.ts — Sprint EF-37
// Detects conflicting decisions and incompatible information

import type { ExtractedDecision, ConflictRecord, ConflictType } from "./KipTypes";

let _seq = 0;
const uid = () => `cfl-${Date.now()}-${++_seq}`;

// Two decisions about the same subject with conflicting types
const CONFLICTING_PAIRS: Array<[import("./KipTypes").DecisionType, import("./KipTypes").DecisionType]> = [
  ["IMPLEMENT", "ABANDON"],
  ["IMPLEMENT", "DEPRECATE"],
  ["ACCEPT",    "REJECT"],
  ["CHANGE",    "REVERT"],
];

function subjectSimilarity(a: string, b: string): number {
  const wa = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 2));
  const wb = new Set(b.toLowerCase().split(/\W+/).filter(w => w.length > 2));
  const intersection = [...wa].filter(w => wb.has(w)).length;
  return intersection > 0 ? intersection / Math.max(wa.size, wb.size) : 0;
}

export const ConflictDetector = {
  detect(decisions: ExtractedDecision[]): ConflictRecord[] {
    const conflicts: ConflictRecord[] = [];

    for (let i = 0; i < decisions.length; i++) {
      for (let j = i + 1; j < decisions.length; j++) {
        const a = decisions[i];
        const b = decisions[j];
        if (a.messageId === b.messageId) continue;

        const isConflictingPair = CONFLICTING_PAIRS.some(
          ([t1, t2]) => (a.type === t1 && b.type === t2) || (a.type === t2 && b.type === t1)
        );

        if (!isConflictingPair) continue;

        const similarity = subjectSimilarity(a.subject, b.subject);
        if (similarity < 0.3) continue;

        const conflictType: ConflictType =
          a.type === "CHANGE" || b.type === "REVERT" ? "strategy" :
          a.type === "IMPLEMENT" || b.type === "ABANDON" ? "decision" :
          "incompatible";

        conflicts.push({
          id:          uid(),
          type:        conflictType,
          description: `Conflict: "${a.type}" vs "${b.type}" on subject "${a.subject.slice(0, 60)}"`,
          itemA:       a.id,
          itemB:       b.id,
          resolution:  a.timestamp < b.timestamp ? "archive_older" : "archive_older",
        });
      }
    }
    return conflicts;
  },

  resolve(conflict: ConflictRecord): ConflictRecord {
    return { ...conflict, resolution: "archive_older", resolvedAt: Date.now() };
  },
};