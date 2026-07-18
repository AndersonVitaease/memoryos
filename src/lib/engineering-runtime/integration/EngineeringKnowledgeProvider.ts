/**
 * EngineeringKnowledgeProvider.ts
 * Fetches all relevant knowledge for an engineering task.
 * EXCLUSIVELY via KnowledgeQueryFacade — zero direct Registry access.
 *
 * SRP: Knowledge retrieval only.
 * Sprint: INTEGRATION-05
 */

import { KnowledgeQueryFacade } from "@/lib/knowledge-query/KnowledgeQueryFacade";
import type { KnowledgeResultItem } from "@/lib/knowledge-query/KnowledgeQueryTypes";
import type { EngineeringKnowledgeContext } from "./EngineeringKnowledgeContext";

export interface EngineeringKnowledgeBundle {
  readonly lessons:       KnowledgeResultItem[];
  readonly bestPractices: KnowledgeResultItem[];
  readonly knownIssues:   KnowledgeResultItem[];
  readonly antiPatterns:  KnowledgeResultItem[];
  readonly journal:       KnowledgeResultItem[];
  readonly governance:    KnowledgeResultItem[];
  readonly all:           KnowledgeResultItem[];
}

export const EngineeringKnowledgeProvider = Object.freeze({

  fetch(ctx: EngineeringKnowledgeContext): EngineeringKnowledgeBundle {
    const intent = `${ctx.task} ${ctx.module} ${ctx.component} ${ctx.intent}`;

    const lessons       = KnowledgeQueryFacade.queryLessons(intent).results;
    const bestPractices = KnowledgeQueryFacade.queryBestPractices(intent).results;
    const knownIssues   = KnowledgeQueryFacade.queryKnownIssues(intent).results;
    const antiPatterns  = KnowledgeQueryFacade.queryAntiPatterns(intent).results;
    const journal       = KnowledgeQueryFacade.queryJournal(intent).results;
    const governance    = KnowledgeQueryFacade.queryGovernance(intent).results;

    return Object.freeze({
      lessons, bestPractices, knownIssues, antiPatterns, journal, governance,
      all: [...lessons, ...bestPractices, ...knownIssues, ...antiPatterns, ...journal, ...governance],
    });
  },
});