/**
 * CognitiveLearningEngine.ts — Beta-03.2
 * 2026-07-13
 *
 * Orchestrates the complete Cognitive Learning cycle:
 *   Observe → Compare → Learn → Adjust → Recommend → Integrate
 *
 * NEVER executes connector operations.
 * NEVER mutates history.
 * APPEND-ONLY knowledge model.
 */

import type { ExecutionPlan, ExecutionRecord } from "../cognitive-dev-loop/CDLTypes";
import type { LearningSession, CLEReport, LearningRecord, CLERecommendation, CLEKnowledgeEntry } from "./CLETypes";
import { makeCLEId } from "./CLETypes";
import { OutcomeEvaluator }      from "./OutcomeEvaluator";
import { LearningRecordFactory } from "./LearningRecordFactory";
import { ConfidenceManager }     from "./ConfidenceManager";
import { RecommendationEngine }  from "./RecommendationEngine";
import { KnowledgeIntegrator }   from "./KnowledgeIntegrator";

export class CognitiveLearningEngine {
  private readonly evaluator    = new OutcomeEvaluator();
  private readonly factory      = new LearningRecordFactory();
  private readonly confidence   = new ConfidenceManager();
  private readonly recommender  = new RecommendationEngine();
  private readonly integrator   = new KnowledgeIntegrator();

  private _sessions: LearningSession[] = [];

  // ── Core learn() ────────────────────────────────────────────────────────

  learn(
    plan: ExecutionPlan,
    record: ExecutionRecord,
    cdlReportId: string | null = null,
  ): LearningSession {
    const startedAt = Date.now();
    const errors: string[] = [];

    // 1. Observe & compare
    const outcome = this.evaluator.evaluate(plan, record);

    // 2. Generate learning records
    let learningRecords: LearningRecord[] = [];
    try {
      learningRecords = this.factory.generate(outcome, cdlReportId);
    } catch (e) {
      errors.push(`LearningRecordFactory: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 3. Apply confidence + risk adjustments
    this.confidence.applyLearningRecords(learningRecords);
    const confidenceAdjustments = this.confidence.getState().adjustments.slice(-learningRecords.length * 2);
    const riskAdjustments       = this.confidence.getRiskAdjustments().slice(-learningRecords.length * 2);

    // 4. Generate recommendations
    let recommendations: CLERecommendation[] = [];
    try {
      recommendations = this.recommender.generate(learningRecords);
    } catch (e) {
      errors.push(`RecommendationEngine: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 5. Integrate into knowledge
    let knowledgeEntries: CLEKnowledgeEntry[] = [];
    try {
      knowledgeEntries = this.integrator.integrateRecords(learningRecords, recommendations);
    } catch (e) {
      errors.push(`KnowledgeIntegrator: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 6. Score this session
    const successContrib    = outcome.successRate * 40;
    const learningContrib   = Math.min(learningRecords.length * 5, 30);
    const knowledgeContrib  = Math.min(knowledgeEntries.length * 3, 20);
    const errorPenalty      = errors.length * 10;
    const overallLearningScore = Math.max(0, Math.min(100, Math.round(successContrib + learningContrib + knowledgeContrib - errorPenalty)));

    const session: LearningSession = {
      id:                    makeCLEId("session"),
      startedAt,
      completedAt:           Date.now(),
      durationMs:            Date.now() - startedAt,
      executionId:           record.id,
      outcome,
      learningRecords,
      confidenceAdjustments,
      riskAdjustments,
      recommendations,
      knowledgeEntries,
      overallLearningScore,
      errors,
    };

    this._sessions.push(session);
    return session;
  }

  // ── Report ───────────────────────────────────────────────────────────────

  buildReport(): CLEReport {
    const allLearning     = this._sessions.flatMap(s => s.learningRecords);
    const allRecs         = this._sessions.flatMap(s => s.recommendations);
    const allKnowledge    = this._sessions.flatMap(s => s.knowledgeEntries);
    const allCA           = this._sessions.flatMap(s => s.confidenceAdjustments);
    const allRA           = this._sessions.flatMap(s => s.riskAdjustments);

    const successSessions = this._sessions.filter(s => s.outcome.overallOutcome === "SUCCESS");
    const overallSuccessRate = this._sessions.length > 0 ? successSessions.length / this._sessions.length : 0;

    const topLessons = [...allLearning]
      .sort((a, b) => (b.importance === "critical" ? 4 : b.importance === "high" ? 3 : b.importance === "medium" ? 2 : 1) -
                      (a.importance === "critical" ? 4 : a.importance === "high" ? 3 : a.importance === "medium" ? 2 : 1))
      .slice(0, 5);
    const topRecs = [...allRecs].sort((a, b) => (b.priority === "high" ? 2 : b.priority === "medium" ? 1 : 0) -
                                                 (a.priority === "high" ? 2 : a.priority === "medium" ? 1 : 0)).slice(0, 5);

    const certPct = this._sessions.length > 0
      ? this._sessions.filter(s => s.overallLearningScore >= 50).length / this._sessions.length
      : 0;
    const certLevel = certPct >= 0.9 ? "CERTIFIED" : certPct >= 0.5 ? "PARTIAL" : "FAILED";

    return {
      id:                        makeCLEId("cle_report"),
      generatedAt:               Date.now(),
      certified:                 certLevel === "CERTIFIED",
      certificationLevel:        certLevel,
      totalSessions:             this._sessions.length,
      totalLearningRecords:      allLearning.length,
      totalConfidenceAdjustments: allCA.length,
      totalRiskAdjustments:       allRA.length,
      totalRecommendations:       allRecs.length,
      totalKnowledgeEntries:      allKnowledge.length,
      overallSuccessRate,
      confidenceState:            this.confidence.getState(),
      sessions:                   this._sessions,
      topLessons,
      topRecommendations:         topRecs,
      summary: this._sessions.length === 0
        ? "No learning sessions recorded yet."
        : `CLE ${certLevel} — ${this._sessions.length} session(s), ${allLearning.length} lessons, ${allRecs.length} recommendations, confidence ${(this.confidence.getConfidence("overall") * 100).toFixed(0)}%`,
    };
  }

  // ── Accessors ────────────────────────────────────────────────────────────

  getSessions()            { return this._sessions; }
  getConfidenceState()     { return this.confidence.getState(); }
  getConfidence(d: string) { return this.confidence.getConfidence(d); }
}