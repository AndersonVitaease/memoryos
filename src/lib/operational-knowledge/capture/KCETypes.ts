/**
 * KCETypes.ts
 * Type contracts for the Knowledge Capture Engine.
 *
 * Authority: ENGINEERING
 * SRP: Types only — no logic.
 * Sprint: KB-03
 */

// ── Capture Source ─────────────────────────────────────────────────────────────

export type KCESourceType =
  | "MANUAL_FORM"        // Developer fills a structured form
  | "INCIDENT_REPORT"    // Post-incident capture after resolution
  | "SPRINT_RETROSPECTIVE" // Sprint retro input
  | "CODE_REVIEW"        // Learnings from code review
  | "OBSERVATION"        // Passive observation during development
  | "REGRESSION"         // Regression-triggered capture
  | "SEARCH_GAP"         // Knowledge gap identified from a failed search
  | "VALIDATION_FAILURE"; // Triggered by EvidenceValidator failure

// ── Capture Status ─────────────────────────────────────────────────────────────

export type KCECaptureStatus =
  | "DRAFT"       // Being filled
  | "PENDING"     // Submitted, awaiting classification
  | "CLASSIFIED"  // Auto-classified, awaiting promotion
  | "PROMOTED"    // Promoted to at least one KB document
  | "REJECTED"    // Not relevant / duplicate
  | "ARCHIVED";   // Kept for history but not active

// ── Capture Priority ──────────────────────────────────────────────────────────

export type KCECapturePriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

// ── Capture Targets ───────────────────────────────────────────────────────────

export type KCECaptureTarget =
  | "LESSONS_LEARNED"
  | "ANTI_PATTERNS"
  | "BEST_PRACTICES"
  | "KNOWN_ISSUES"
  | "TROUBLESHOOTING"
  | "ENGINEERING_JOURNAL"
  | "EVIDENCE"
  | "ALL";

// ── Raw Capture (input form) ──────────────────────────────────────────────────

export interface KCERawCapture {
  readonly title:            string;
  readonly what:             string;   // What happened
  readonly why:              string;   // Why it happened (root cause)
  readonly how:              string;   // How it was fixed
  readonly outcome:          string;   // Result after fix
  readonly sprint?:          string;
  readonly components?:      string[];
  readonly files?:           string[];
  readonly tags?:            string[];
  readonly sourceType:       KCESourceType;
  readonly priority:         KCECapturePriority;
  readonly capturedAt:       string;   // ISO date
  readonly capturedBy:       string;
}

// ── Classification Result ─────────────────────────────────────────────────────

export interface KCEClassification {
  readonly captureId:       string;
  readonly suggestedTargets:KCECaptureTarget[];
  readonly confidence:      number;           // 0–1
  readonly reasoning:       string;
  readonly keywords:        string[];
  readonly isAntiPattern:   boolean;
  readonly isBestPractice:  boolean;
  readonly isKnownIssue:    boolean;
  readonly isLesson:        boolean;
  readonly severity:        KCECapturePriority;
}

// ── Promotion Result ──────────────────────────────────────────────────────────

export interface KCEPromotion {
  readonly captureId:       string;
  readonly promotedTargets: KCECaptureTarget[];
  readonly generatedIds:    string[];   // LL-NNN, AP-NNN, EVD-NNN, etc.
  readonly promotedAt:      string;
  readonly summary:         string;
}

// ── Full Capture Record ───────────────────────────────────────────────────────

export interface KCECapture {
  readonly id:             string;         // KCE-NNN
  readonly raw:            KCERawCapture;
  readonly status:         KCECaptureStatus;
  readonly classification: KCEClassification | null;
  readonly promotion:      KCEPromotion | null;
  readonly createdAt:      string;
  readonly updatedAt:      string;
}

// ── Capture Pipeline Result ───────────────────────────────────────────────────

export interface KCEPipelineResult {
  readonly capture:        KCECapture;
  readonly classification: KCEClassification;
  readonly promotion:      KCEPromotion | null;
  readonly durationMs:     number;
  readonly success:        boolean;
  readonly errors:         string[];
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export interface KCEStats {
  readonly total:              number;
  readonly byStatus:           Partial<Record<KCECaptureStatus, number>>;
  readonly byPriority:         Partial<Record<KCECapturePriority, number>>;
  readonly bySource:           Partial<Record<KCESourceType, number>>;
  readonly promotedCount:      number;
  readonly avgConfidence:      number;
  readonly topTargets:         Array<{ target: KCECaptureTarget; count: number }>;
  readonly recentCaptures:     KCECapture[];
}