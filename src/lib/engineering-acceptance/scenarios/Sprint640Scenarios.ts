/**
 * Sprint640Scenarios.ts — Sprint 6.4.0
 * Engineering Acceptance Scenarios for Universal OAuth Platform.
 */

import { buildCriteria } from "../AcceptanceCriteria";
import type { AcceptanceCriterion } from "../EAFTypes";

export function buildSprint640Criteria(): AcceptanceCriterion[] {
  return buildCriteria([
    { desc: "Universal OAuth Platform created (OAuthRuntime starts and stops)",           cat: "SMOKE"       },
    { desc: "OAuth Registry functional (8 providers auto-registered)",                    cat: "SMOKE"       },
    { desc: "Session Manager functional (create, validate, expire, restore, terminate)",  cat: "FUNCTIONAL"  },
    { desc: "Token Manager functional (store masked, retrieve internal, invalidate)",     cat: "FUNCTIONAL"  },
    { desc: "Refresh Manager functional (NOT_SUPPORTED for non-refresh providers)",       cat: "FUNCTIONAL"  },
    { desc: "Persistence integrated (save → restore round-trip, no tokens persisted)",   cat: "FUNCTIONAL"  },
    { desc: "Security validated (sanitize removes all credential fields)",                cat: "REGRESSION"  },
    { desc: "Diagnostics functional (health, expiration, scope, provider checks)",        cat: "SMOKE"       },
    { desc: "Dashboard operational (/phase640 renders with all tabs)",                   cat: "SMOKE"       },
    { desc: "Regression Shield PASS — UOP category all green",                           cat: "REGRESSION"  },
  ]);
}