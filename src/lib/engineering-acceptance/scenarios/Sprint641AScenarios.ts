/**
 * Sprint641AScenarios.ts — Sprint 6.4.1A
 * Engineering Acceptance Scenarios for OAuth Configuration & Discovery.
 */

import { buildCriteria } from "../AcceptanceCriteria";
import type { AcceptanceCriterion } from "../EAFTypes";

export function buildSprint641ACriteria(): AcceptanceCriterion[] {
  return buildCriteria([
    { desc: "OAuthDiscoveryEngine auto-discovers all UOP-registered providers (8+)",                cat: "SMOKE"       },
    { desc: "Redirect URI auto-resolved from runtime environment (no hardcoding)",                   cat: "SMOKE"       },
    { desc: "Callback URI auto-resolved and matches Redirect URI",                                   cat: "FUNCTIONAL"  },
    { desc: "Authorized Origins list generated correctly for current environment",                   cat: "FUNCTIONAL"  },
    { desc: "Client ID status reported (CONFIGURED/MISSING) without exposing value",                 cat: "REGRESSION"  },
    { desc: "Client Secret status reported (CONFIGURED/MISSING) without exposing value",             cat: "REGRESSION"  },
    { desc: "Scope Registry contains all 6.4.1 identity scopes for Google",                         cat: "FUNCTIONAL"  },
    { desc: "OAuthConfigurationValidator scores each provider 0–100",                                cat: "FUNCTIONAL"  },
    { desc: "OAuthRuntimeInspector reads live session data from UOP",                                cat: "FUNCTIONAL"  },
    { desc: "OAuthDiscoveryDiagnostics produces PASS/WARN/FAIL overall result",                      cat: "SMOKE"       },
    { desc: "Discovery audit is append-only and contains no credentials",                            cat: "REGRESSION"  },
    { desc: "GoogleIdentityProvider now consumes discovered Redirect URI (not hardcoded)",           cat: "REGRESSION"  },
    { desc: "OAuthDiscoveryHistory stores up to 20 reports (append-only)",                           cat: "FUNCTIONAL"  },
    { desc: "Dashboard /phase641a renders all 12 tabs without error",                               cat: "SMOKE"       },
    { desc: "Regression Shield GIP+UOP categories remain green after integration",                  cat: "REGRESSION"  },
  ]);
}