/**
 * Sprint635Scenarios.ts — Sprint 6.3.5
 * Engineering Acceptance Scenarios for ERC.
 */

import { buildCriteria } from "../AcceptanceCriteria";
import type { AcceptanceCriterion } from "../EAFTypes";

export function buildSprint635Criteria(): AcceptanceCriterion[] {
  return buildCriteria([
    { desc: "All capability layers certified (Infrastructure score >= 90)",    cat: "SMOKE"        },
    { desc: "No blockers in any validator domain",                              cat: "SMOKE"        },
    { desc: "Recovery scenarios approved (SHR warmup + reconnect + restore)",   cat: "FUNCTIONAL"   },
    { desc: "Persistence validated (sessions, memory, KG, history, audit)",     cat: "FUNCTIONAL"   },
    { desc: "Acceptance Framework operational (EAF registry + audit + metrics)", cat: "FUNCTIONAL"  },
    { desc: "Regression Shield passes (shield != BLOCKED, score > 0)",         cat: "REGRESSION"   },
    { desc: "Readiness score >= 95% (overall weighted scorecard)",              cat: "PERFORMANCE"  },
    { desc: "Certification = READY_FOR_CONNECTORS or higher",                   cat: "SMOKE"        },
  ]);
}