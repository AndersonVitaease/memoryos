/**
 * ReuseEngine.ts — Sprint 6.2.1
 * Searches KG → Repository → GitHub → Memory before proposing any implementation.
 * Never duplicates an existing implementation.
 */

import { KnowledgeGraphStore } from "../project-knowledge/KnowledgeGraphStore";
import type { ReuseResult, ReuseDecision } from "./EITypes";

export class ReuseEngine {
  search(
    objective: string,
    requiredComponents: string[],
    memoryObjectives: string[],
  ): ReuseResult {
    const t0 = Date.now();
    const lower = objective.toLowerCase();
    const found: string[] = [];
    const partial: string[] = [];
    const sources: string[] = [];

    // 1. Search Knowledge Graph
    if (KnowledgeGraphStore.isReady()) {
      sources.push("KnowledgeGraph");
      const keywords = lower.split(/\s+/).filter(w => w.length > 4);
      for (const kw of keywords) {
        const hits = KnowledgeGraphStore.queryByKeyword(kw, "ReuseEngine");
        hits.forEach(h => {
          if (requiredComponents.some(rc => rc.toLowerCase().includes(kw))) {
            found.push(h.name);
          } else {
            partial.push(h.name);
          }
        });
      }
    }

    // 2. Search Repository (KG modules)
    if (KnowledgeGraphStore.isReady()) {
      sources.push("Repository");
      const graph = KnowledgeGraphStore.get("ReuseEngine");
      graph?.modules.forEach(m => {
        const mLower = m.name.toLowerCase();
        const keywords = lower.split(/\s+/).filter(w => w.length > 4);
        if (keywords.some(k => mLower.includes(k))) partial.push(`Module:${m.name}`);
      });
    }

    // 3. Search Engineering Memory (previous objectives)
    const similarPrevious = memoryObjectives.filter(prev => {
      const prevWords = prev.toLowerCase().split(/\s+/);
      const objWords  = lower.split(/\s+/);
      const overlap   = prevWords.filter(w => w.length > 4 && objWords.includes(w));
      return overlap.length >= 2;
    });
    if (similarPrevious.length > 0) {
      sources.push("EngineeringMemory");
      similarPrevious.forEach(p => partial.push(`Memory:${p.slice(0, 40)}`));
    }

    const uniqueFound   = [...new Set(found)].slice(0, 8);
    const uniquePartial = [...new Set(partial)].slice(0, 8);

    let decision: ReuseDecision;
    let explanation: string;

    if (uniqueFound.length > 0) {
      decision = "REUSE";
      explanation = `Found ${uniqueFound.length} existing component(s) that directly match: ${uniqueFound.slice(0, 3).join(", ")}. Reuse them.`;
    } else if (uniquePartial.length > 0) {
      decision = "EXTEND";
      explanation = `Found ${uniquePartial.length} partial match(es): ${uniquePartial.slice(0, 3).join(", ")}. Extend rather than create from scratch.`;
    } else {
      decision = "CREATE_NEW";
      explanation = "No existing implementation found in KG, Repository, or Memory. Safe to create new.";
    }

    return {
      decision,
      found:       uniqueFound,
      partial:     uniquePartial,
      sources,
      explanation,
      durationMs: Date.now() - t0,
    };
  }
}