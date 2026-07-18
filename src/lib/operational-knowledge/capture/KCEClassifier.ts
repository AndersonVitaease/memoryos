/**
 * KCEClassifier.ts
 * Classifies raw captures into KB targets automatically.
 *
 * Authority: ENGINEERING
 * SRP: Classification only — no storage, no promotion.
 * Sprint: KB-03
 *
 * Zero external dependencies. Pure deterministic scoring.
 */

import type { KCERawCapture, KCEClassification, KCECaptureTarget, KCECapturePriority } from "./KCETypes";

// ── Signal sets for classification ────────────────────────────────────────────

const ANTI_PATTERN_SIGNALS = [
  "static instantiation", "singleton", "global state", "shared mutation",
  "raw import", "hardcoded", "frontend api call", "breaking change",
  "srp violation", "orphan", "direct connector call", "state bleed",
  "module scope", "top-level", "never do", "anti-pattern", "forbidden",
  "should not", "do not", "avoid",
];

const BEST_PRACTICE_SIGNALS = [
  "lazy factory", "frozen", "object.freeze", "immutable", "singletons",
  "auto-registration", "backend", "test contract", "manifest first",
  "telemetry", "srp", "decoupled", "abstraction", "factory pattern",
  "recommended", "best practice", "always use", "prefer", "should use",
  "clean separation",
];

const KNOWN_ISSUE_SIGNALS = [
  "blank screen", "intermittent", "404", "403", "token loss", "not working",
  "broken", "bug", "known issue", "limitation", "workaround", "open issue",
  "fails intermittently", "inconsistent", "session lost",
];

const LESSON_SIGNALS = [
  "learned", "discovered", "realized", "understood", "found out",
  "root cause", "post-mortem", "incident", "regression", "what we learned",
  "lesson", "takeaway", "insight", "finding",
];

const TROUBLESHOOT_SIGNALS = [
  "how to debug", "steps to fix", "diagnosis", "investigation", "trace",
  "troubleshoot", "procedure", "checklist", "runbook", "how to resolve",
  "when you see", "symptom",
];

function normalize(text: string): string {
  return text.toLowerCase();
}

function countSignals(text: string, signals: string[]): number {
  const t = normalize(text);
  return signals.filter(s => t.includes(s)).length;
}

function extractKeywords(raw: KCERawCapture): string[] {
  const text = [raw.title, raw.what, raw.why, raw.how, raw.outcome].join(" ");
  const tokens = text.toLowerCase().split(/[\s,._\-/()]+/).filter(t => t.length > 3);
  const freq: Record<string, number> = {};
  for (const tok of tokens) freq[tok] = (freq[tok] ?? 0) + 1;
  return Object.entries(freq)
    .sort(([,a],[,b]) => b - a)
    .slice(0, 12)
    .map(([k]) => k);
}

function determinePriority(raw: KCERawCapture): KCECapturePriority {
  if (raw.priority === "CRITICAL") return "CRITICAL";
  const text = normalize([raw.title, raw.what, raw.why].join(" "));
  if (["crash", "boot error", "data loss", "security", "critical"].some(s => text.includes(s))) return "CRITICAL";
  if (["high", "broken", "regression", "failure"].some(s => text.includes(s))) return "HIGH";
  if (raw.priority === "LOW") return "LOW";
  return raw.priority ?? "MEDIUM";
}

export const KCEClassifier = Object.freeze({
  /**
   * Classify a raw capture deterministically.
   */
  classify(captureId: string, raw: KCERawCapture): KCEClassification {
    const fullText = [raw.title, raw.what, raw.why, raw.how, raw.outcome].join(" ");

    const apScore   = countSignals(fullText, ANTI_PATTERN_SIGNALS);
    const bpScore   = countSignals(fullText, BEST_PRACTICE_SIGNALS);
    const kiScore   = countSignals(fullText, KNOWN_ISSUE_SIGNALS);
    const llScore   = countSignals(fullText, LESSON_SIGNALS);
    const tgScore   = countSignals(fullText, TROUBLESHOOT_SIGNALS);

    const isAntiPattern  = apScore >= 1;
    const isBestPractice = bpScore >= 1;
    const isKnownIssue   = kiScore >= 2;
    const isLesson       = llScore >= 1 || (!isAntiPattern && !isBestPractice && !isKnownIssue);

    const targets: KCECaptureTarget[] = [];
    if (isLesson)       targets.push("LESSONS_LEARNED");
    if (isAntiPattern)  targets.push("ANTI_PATTERNS");
    if (isBestPractice) targets.push("BEST_PRACTICES");
    if (isKnownIssue)   targets.push("KNOWN_ISSUES");
    if (tgScore >= 1)   targets.push("TROUBLESHOOTING");
    if (raw.sprint)     targets.push("ENGINEERING_JOURNAL");
    targets.push("EVIDENCE"); // always generate an evidence record

    // Confidence: proportion of expected targets that have signal
    const signalCount = [apScore, bpScore, kiScore, llScore, tgScore].filter(s => s > 0).length;
    const confidence  = Math.min(1, 0.5 + signalCount * 0.1);

    const keywords = [
      ...extractKeywords(raw),
      ...(raw.tags ?? []),
    ].slice(0, 15);

    const reasonParts: string[] = [];
    if (isLesson)       reasonParts.push("lesson signals detected");
    if (isAntiPattern)  reasonParts.push(`anti-pattern signals (${apScore})`);
    if (isBestPractice) reasonParts.push(`best-practice signals (${bpScore})`);
    if (isKnownIssue)   reasonParts.push(`known-issue signals (${kiScore})`);
    if (tgScore >= 1)   reasonParts.push("troubleshooting signals");
    if (raw.sprint)     reasonParts.push("sprint provided → journal");

    return {
      captureId,
      suggestedTargets: targets,
      confidence,
      reasoning:        reasonParts.join("; ") || "default lesson capture",
      keywords,
      isAntiPattern,
      isBestPractice,
      isKnownIssue,
      isLesson,
      severity: determinePriority(raw),
    };
  },
});