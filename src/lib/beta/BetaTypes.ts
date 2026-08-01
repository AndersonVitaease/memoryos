/**
 * BetaTypes.ts — P10 Beta
 * Tipos imutaveis para o programa Beta do MemoryOS.
 * MDS v2.0 · P10 · Version: 1.0.0
 */

export type BetaUserStatus = "invited" | "onboarded" | "active" | "churned";

export type FeedbackCategory = "bug" | "feature_request" | "ux" | "performance" | "other";

export type FeedbackSentiment = "positive" | "neutral" | "negative";

export type RFCStatus = "draft" | "open" | "accepted" | "rejected" | "implemented";

export type StagingCheckStatus = "pass" | "fail" | "pending";

export interface BetaUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly status: BetaUserStatus;
  readonly invitedAt: string;
  readonly onboardedAt?: string;
  readonly lastActiveAt?: string;
  readonly feedbackCount: number;
}

export interface BetaFeedback {
  readonly id: string;
  readonly userId: string;
  readonly category: FeedbackCategory;
  readonly sentiment: FeedbackSentiment;
  readonly title: string;
  readonly description: string;
  readonly submittedAt: string;
  readonly resolved: boolean;
}

export interface StabilizationRFC {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly status: RFCStatus;
  readonly priority: "critical" | "high" | "medium" | "low";
  readonly createdAt: string;
  readonly resolvedAt?: string;
  readonly linkedFeedbackIds: readonly string[];
}

export interface StagingCheck {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly status: StagingCheckStatus;
  readonly checkedAt: string;
  readonly details?: string;
}

export interface BetaMetrics {
  readonly totalInvited: number;
  readonly totalOnboarded: number;
  readonly totalActive: number;
  readonly totalFeedback: number;
  readonly resolvedFeedback: number;
  readonly openRFCs: number;
  readonly stagingPassRate: number;
  readonly readinessScore: number;
}