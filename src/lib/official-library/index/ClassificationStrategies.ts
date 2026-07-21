/**
 * ClassificationStrategies.ts — Sprint EF-41A (Refinement 4)
 *
 * Replaces the heuristic if-chains in OfficialDocumentMetadata.ts with
 * composable, extensible strategy objects.
 *
 * Each strategy is a pure function object implementing a simple interface:
 *   - matches(path, title): boolean  — does this rule apply?
 *   - value                          — the classification to return
 *
 * Rules are evaluated in declaration order. First match wins.
 * Extending the classification: add a new rule to the appropriate list.
 * No existing code needs to change.
 *
 * SRP: classify — never scan, build, index, compute checksums, or extract keywords.
 */

import type { OfficialDocumentCategory, OfficialDocumentType } from "./OfficialDocumentMetadata";

// ── Strategy interfaces ───────────────────────────────────────────────────────

interface ClassificationRule<T> {
  readonly matches: (path: string, title: string) => boolean;
  readonly value: T;
}

function firstMatch<T>(
  rules: readonly ClassificationRule<T>[],
  fallback: T,
  path: string,
  title: string,
): T {
  const p = path.toLowerCase();
  const t = title.toLowerCase();
  for (const rule of rules) {
    if (rule.matches(p, t)) return rule.value;
  }
  return fallback;
}

// ── Category strategy ─────────────────────────────────────────────────────────

const CATEGORY_RULES: readonly ClassificationRule<OfficialDocumentCategory>[] = [
  { matches: (p, t) => p.includes("/adr/") || t.startsWith("adr-"),                                      value: "decision"       },
  { matches: (p, t) => p.includes("/rfc/") || t.startsWith("rfc-"),                                      value: "rfc"            },
  { matches: (_p, t) => t.includes("vision") || t.startsWith("mv-"),                                     value: "vision"         },
  { matches: (_p, t) => t.includes("product") || t.startsWith("mps-"),                                   value: "vision"         },
  { matches: (_p, t) => t.includes("architecture") && !t.includes("governance"),                         value: "architecture"   },
  { matches: (_p, t) => t.includes("engineering specification") || t.startsWith("mes-"),                  value: "specification"  },
  { matches: (_p, t) => t.includes("governance") || t.startsWith("mpegs") || t.startsWith("mads") || t.startsWith("mqccs"), value: "governance" },
  { matches: (_p, t) => t.includes("operations manual") || t.startsWith("meom"),                         value: "operations"     },
  { matches: (_p, t) => t.includes("onboarding") || t.startsWith("mdok"),                                value: "operations"     },
  { matches: (_p, t) => t.includes("runbook"),                                                            value: "operations"     },
  { matches: (_p, t) => t.includes("developer handbook") || t.startsWith("mdh"),                         value: "developer"      },
  { matches: (_p, t) => t.includes("connector"),                                                          value: "connector"      },
  { matches: (_p, t) => t.includes("testing") || t.includes("standard"),                                 value: "testing"        },
  { matches: (_p, t) => t.includes("changelog") || t.includes("versioning") || t.includes("release"),   value: "changelog"      },
  { matches: (_p, t) => t.includes("reference implementation") || t.startsWith("mri"),                   value: "reference"      },
  { matches: (_p, t) => t.startsWith("mds") || t.includes("developer"),                                  value: "developer"      },
];

/** Strategy-based category derivation. Replaces the heuristic if-chain. */
export const CategoryStrategy = {
  derive(path: string, title: string): OfficialDocumentCategory {
    return firstMatch(CATEGORY_RULES, "unknown", path, title);
  },
};

// ── Document type strategy ────────────────────────────────────────────────────

const DOCUMENT_TYPE_RULES: readonly ClassificationRule<OfficialDocumentType>[] = [
  { matches: (p, t) => p.includes("/adr/") || t.startsWith("adr-"),                     value: "architecture-decision-record" },
  { matches: (p, t) => p.includes("/rfc/") || t.startsWith("rfc-"),                     value: "rfc"                          },
  { matches: (_p, t) => t.includes("runbook"),                                           value: "runbook"                      },
  { matches: (_p, t) => t.includes("changelog") || t.includes("versioning"),            value: "changelog"                    },
  { matches: (_p, t) => t.includes("vision") || t.startsWith("mv-"),                   value: "vision"                       },
  { matches: (_p, t) => t.includes("guide") || t.includes("handbook"),                  value: "guide"                        },
  { matches: (_p, t) => t.includes("standard"),                                          value: "standard"                     },
  { matches: (_p, t) => t.includes("reference") && !t.includes("implementation"),       value: "reference"                    },
  { matches: (_p, t) => t.includes("specification") || t.includes("spec"),              value: "specification"                },
];

/** Strategy-based document type derivation. Replaces the heuristic if-chain. */
export const DocumentTypeStrategy = {
  derive(path: string, title: string): OfficialDocumentType {
    return firstMatch(DOCUMENT_TYPE_RULES, "specification", path, title);
  },
};