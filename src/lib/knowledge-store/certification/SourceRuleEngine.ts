// SourceRuleEngine.ts — Sprint EF-39.6
// Rule-based source analysis engine. Each rule is a plain object — easily extensible.
// Add new rules without changing any other file.

import type { Severity, SourceFinding } from "../auditor/SourceAudit";
import { CertificationConfig } from "./CertificationConfig";

export interface SourceRule {
  readonly id:            string;
  readonly description:   string;
  readonly severity:      Severity;
  readonly documentation: string;
  readonly enabled:       boolean;
  readonly codeOnly?:     boolean;  // skip pure-comment lines if true
  readonly matcher:       (line: string) => RegExpExecArray | null;
}

// ── Built-in rules ────────────────────────────────────────────────────────────
const BUILT_IN_RULES: SourceRule[] = [
  {
    id: "no-as-any",
    description:   "Type-unsafe 'as any' cast bypasses type safety",
    severity:      "critical",
    documentation: "Replace 'as any' with a proper type assertion or generic parameter.",
    enabled:       true,
    matcher:       (l) => /\bas\s+any\b/.exec(l),
  },
  {
    id: "no-ts-ignore",
    description:   "@ts-ignore suppresses TypeScript errors unsafely",
    severity:      "critical",
    documentation: "Fix the underlying type error instead of suppressing it.",
    enabled:       true,
    matcher:       (l) => /@ts-ignore/.exec(l),
  },
  {
    id: "no-ts-nocheck",
    description:   "@ts-nocheck disables type checking for entire file",
    severity:      "critical",
    documentation: "Remove @ts-nocheck and fix all type errors.",
    enabled:       true,
    matcher:       (l) => /@ts-nocheck/.exec(l),
  },
  {
    id: "no-eslint-disable",
    description:   "eslint-disable suppresses linting rules broadly",
    severity:      "error",
    documentation: "Fix the lint violation or use eslint-disable-next-line with a comment.",
    enabled:       true,
    matcher:       (l) => /eslint-disable(?!-next-line)/.exec(l),
  },
  {
    id: "no-debugger",
    description:   "debugger statement must not be in production code",
    severity:      "critical",
    documentation: "Remove all debugger statements before committing.",
    enabled:       true,
    codeOnly:      true,
    matcher:       (l) => /\bdebugger\b/.exec(l),
  },
  {
    id: "no-console-log",
    description:   "console.log must not be in production code",
    severity:      "error",
    documentation: "Remove console.log or replace with a structured logger.",
    enabled:       true,
    codeOnly:      true,
    matcher:       (l) => /console\.log\s*\(/.exec(l),
  },
  {
    id: "no-console-warn",
    description:   "console.warn should not be in production code",
    severity:      "warning",
    documentation: "Replace with a structured logger or remove.",
    enabled:       true,
    codeOnly:      true,
    matcher:       (l) => /console\.warn\s*\(/.exec(l),
  },
  {
    id: "no-console-error",
    description:   "console.error should not be in production code",
    severity:      "warning",
    documentation: "Replace with a structured logger or remove.",
    enabled:       true,
    codeOnly:      true,
    matcher:       (l) => /console\.error\s*\(/.exec(l),
  },
  {
    id: "no-todo",
    description:   "TODO comment indicates incomplete implementation",
    severity:      "warning",
    documentation: "Resolve or track in the issue tracker.",
    enabled:       true,
    matcher:       (l) => /\/\/\s*TODO\b/i.exec(l),
  },
  {
    id: "no-fixme",
    description:   "FIXME comment indicates known defect",
    severity:      "error",
    documentation: "Fix the defect before merging.",
    enabled:       true,
    matcher:       (l) => /\/\/\s*FIXME\b/i.exec(l),
  },
  {
    id: "no-hack",
    description:   "HACK comment indicates technical debt",
    severity:      "error",
    documentation: "Refactor the code and remove the HACK comment.",
    enabled:       true,
    matcher:       (l) => /\/\/\s*HACK\b/i.exec(l),
  },
  {
    id: "no-xxx",
    description:   "XXX comment indicates problematic code",
    severity:      "warning",
    documentation: "Address the issue and remove the comment.",
    enabled:       true,
    matcher:       (l) => /\/\/\s*XXX\b/i.exec(l),
  },
];

// ── Registry (extensible) ─────────────────────────────────────────────────────
const _rules: SourceRule[] = [...BUILT_IN_RULES];

export const SourceRuleEngine = Object.freeze({
  // Register a new rule (plugin architecture)
  register(rule: SourceRule): void {
    _rules.push(rule);
  },

  getRules(): readonly SourceRule[] {
    return Object.freeze([..._rules.filter(r => r.enabled)]);
  },

  analyzeFile(file: string, source: string): readonly SourceFinding[] {
    const findings: SourceFinding[] = [];
    const lines = source.split("\n");
    const activeRules = _rules.filter(r => r.enabled);

    lines.forEach((line, idx) => {
      const trimmed   = line.trim();
      const isComment = trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");

      for (const rule of activeRules) {
        if (rule.codeOnly && isComment) continue;
        const match = rule.matcher(line);
        if (match) {
          findings.push(Object.freeze({
            file,
            line:        idx + 1,
            column:      match.index + 1,
            snippet:     line.trim().slice(0, 120),
            severity:    rule.severity,
            rule:        rule.id,
            description: rule.description,
          }));
        }
      }
    });

    // Large file check
    if (lines.length > CertificationConfig.maxFileLines) {
      findings.push(Object.freeze({
        file, line: 1, column: 1,
        snippet:     `File has ${lines.length} lines`,
        severity:    "warning" as Severity,
        rule:        "max-file-lines",
        description: `File exceeds ${CertificationConfig.maxFileLines} lines (${lines.length} lines) — consider splitting`,
      }));
    }

    return Object.freeze(findings);
  },
});