/**
 * Test helpers (Sprint 25 — LTM Retrieval)
 */

export function _makeMemories(n = 5) {
  const types = ["fact", "event", "preference", "skill", "note"];
  const statuses = ["active", "archived"];
  const sources = ["conversation", "document", "system"];
  const mems = [];
  for (let i = 0; i < n; i++) {
    mems.push({
      memoryId: `ltm-${i + 1}`,
      memoryRecordId: `ltrec-${i + 1}`,
      memoryType: types[i % types.length],
      content: `Memory content ${i + 1}`,
      tags: [`tag-${i % 3}`, `tag-${(i + 1) % 3}`],
      confidence: "HIGH",
      status: statuses[i % statuses.length],
      source: sources[i % sources.length],
      metadata: {},
    });
  }
  return mems;
}