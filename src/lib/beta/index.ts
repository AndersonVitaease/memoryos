/**
 * index.ts — P10 Beta
 * Exports oficiais do modulo Beta.
 * MDS v2.0 · P10 · Version: 1.0.0
 */

export { BetaProgram }    from "./BetaProgram";
export { runBetaTests }   from "./betaTests";
export type {
  BetaUser, BetaFeedback, StabilizationRFC, StagingCheck, BetaMetrics,
  BetaUserStatus, FeedbackCategory, FeedbackSentiment, RFCStatus, StagingCheckStatus,
} from "./BetaTypes";