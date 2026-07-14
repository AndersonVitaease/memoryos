/**
 * Sprint641Scenarios.ts — Sprint 6.4.1
 * Engineering Acceptance Scenarios for Google Identity Provider.
 */

import { buildCriteria } from "../AcceptanceCriteria";
import type { AcceptanceCriterion } from "../EAFTypes";

export function buildSprint641Criteria(): AcceptanceCriterion[] {
  return buildCriteria([
    { desc: "Google provider registered in Universal OAuth Platform",                       cat: "SMOKE"       },
    { desc: "Session created after simulated Google login (state=ACTIVE)",                  cat: "SMOKE"       },
    { desc: "UserInfo obtained (email, name, picture, id)",                                 cat: "FUNCTIONAL"  },
    { desc: "Session restored after restart via persistence layer",                         cat: "FUNCTIONAL"  },
    { desc: "Token refresh working via UOP.RefreshManager (result=REFRESHED)",              cat: "FUNCTIONAL"  },
    { desc: "Session validation passes (valid=true, scopes=openid,email,profile)",          cat: "FUNCTIONAL"  },
    { desc: "No raw tokens exposed in public session API (masked refs only)",               cat: "REGRESSION"  },
    { desc: "Audit log append-only, no credentials in any entry",                           cat: "REGRESSION"  },
    { desc: "Dashboard operational (/phase641, all tabs render)",                           cat: "SMOKE"       },
    { desc: "Regression Shield: GIP category all green",                                   cat: "REGRESSION"  },
  ]);
}