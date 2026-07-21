/**
 * LearningEngine.ts — Sprint EF-51 · Cognitive Learning Engine
 *
 * Coordena todo o pipeline de aprendizado:
 *   Episode → EpisodeAnalyzer → PatternMiner → KnowledgeExtractor
 *   → KnowledgeValidator → KnowledgeStore → KnowledgeGraph → Report
 *
 * NÃO modifica sprints anteriores (EF-43 a EF-50).
 * NÃO usa IA para inventar conhecimento.
 * Todo aprendizado é baseado exclusivamente em episódios.
 *
 * HMR-safe singleton via globalThis.
 */

import type { Episode, LearningPolicy, LearningReport, CandidatePattern, KnowledgeRule, ValidationResult } from "./CLTypes";
import { DEFAULT_LEARNING_POLICY } from "./CLTypes";
import { EpisodeAnalyzer }          from "./EpisodeAnalyzer";
import { PatternMiner }             from "./PatternMiner";
import { KnowledgeExtractor }       from "./KnowledgeExtractor";
import { KnowledgeValidator }       from "./KnowledgeValidator";
import { KnowledgeStore }           from "./KnowledgeStore";
import { AntiPatternDetector }      from "./AntiPatternDetector";
import { KnowledgeGraphBuilder }    from "./KnowledgeGraphBuilder";
import { CapabilityReinforcement }  from "./CapabilityReinforcement";
import { StrategyReinforcement }    from "./StrategyReinforcement";
import { LearningMetricsEngine }    from "./LearningMetricsEngine";
import { LearningScheduler }        from "./LearningScheduler";
import { LearningReportBuilder }    from "./LearningReport";

class LearningEngineImpl {
  private readonly _analyzer     = new EpisodeAnalyzer();
  private readonly _miner        = new PatternMiner();
  private readonly _extractor    = new KnowledgeExtractor();
  private readonly _detector     = new AntiPatternDetector();
  private readonly _graphBuilder = new KnowledgeGraphBuilder();
  private readonly _capReinfrc   = new CapabilityReinforcement();
  private readonly _strReinfrc   = new StrategyReinforcement();
  private readonly _metricsEng   = new LearningMetricsEngine();
  private readonly _reportBuilder= new LearningReportBuilder();

  private _reports: LearningReport[] = [];
  private _policy: LearningPolicy = DEFAULT_LEARNING_POLICY;

  // ── Configuration ──────────────────────────────────────────────────────────

  configure(policy: Partial<LearningPolicy>): void {
    this._policy = Object.freeze({ ...this._policy, ...policy });
  }

  // ── Core pipeline ──────────────────────────────────────────────────────────

  /**
   * Run the full learning pipeline on a batch of episodes.
   * Returns a LearningReport with full audit trail.
   */
  learn(episodes: readonly Episode[]): LearningReport {
    const startedAt = Date.now();

    if (!this._policy.learningEnabled) {
      return this._emptyReport(startedAt, episodes.length, "Learning is disabled by policy.");
    }

    // 0. Schedule
    const scheduler  = new LearningScheduler(this._policy.minimumEpisodes, 200);
    const schedule   = scheduler.schedule(episodes);
    if (!schedule.shouldRun) {
      return this._emptyReport(startedAt, episodes.length, schedule.reason);
    }

    const selected = schedule.selectedEpisodes;
    const prevKnowledgeCount = KnowledgeStore.size;

    // 1. Analyze
    const analyzed = this._analyzer.analyze(selected);

    // 2. Reinforce capabilities & strategies
    this._capReinfrc.ingest(analyzed);
    this._strReinfrc.ingest(analyzed);

    // 3. Mine patterns
    const patterns: readonly CandidatePattern[] = this._miner.mine(analyzed);

    // 4. Extract rules (status=candidate)
    const candidateRules: readonly KnowledgeRule[] = this._extractor.extract(patterns);

    // 5. Validate
    const validator = new KnowledgeValidator(this._policy);
    const pairMap   = new Map(patterns.map(p => [p.id, p]));

    const validationResults: ValidationResult[] = [];
    const approvedRules:  KnowledgeRule[] = [];
    const rejectedPatternIds = new Set<string>();

    for (const rule of candidateRules) {
      const pattern = pairMap.get(rule.patternId);
      if (!pattern) continue;
      const result = validator.validate(rule, pattern);
      validationResults.push(result);
      if (result.approved) {
        approvedRules.push(rule);
      } else {
        rejectedPatternIds.add(rule.patternId);
      }
    }

    const approvedPatterns = patterns.filter(p => !rejectedPatternIds.has(p.id));
    const rejectedPatterns = patterns.filter(p =>  rejectedPatternIds.has(p.id));

    // 6. Store validated rules
    const promotedRules: KnowledgeRule[] = [];
    for (const rule of approvedRules) {
      const stored = KnowledgeStore.add(rule);
      if (this._policy.automaticPromotion) {
        const promoted = KnowledgeStore.promote(stored.id);
        if (promoted) promotedRules.push(promoted);
      } else {
        promotedRules.push(stored);
      }
    }

    // 7. Detect anti-patterns
    const antiPatterns = this._detector.detect(patterns);

    // 8. Build knowledge graph
    const allRules    = KnowledgeStore.getAll();
    const knowledgeGraph = this._graphBuilder.build(allRules);

    // 9. Metrics
    const metrics = this._metricsEng.compute({
      episodesProcessed:     selected.length,
      patterns,
      validationResults,
      prevKnowledgeCount,
      currentKnowledgeCount: KnowledgeStore.size,
      durationMs:            Date.now() - startedAt,
      promotedRules,
    });

    // 10. Build report
    const report = this._reportBuilder.build({
      startedAt,
      episodesAnalyzed:         selected.length,
      patterns,
      approvedPatterns,
      rejectedPatterns,
      promotedRules,
      updatedRules:             [],
      deprecatedRules:          [],
      antiPatterns,
      capabilityReinforcements: this._capReinfrc.getAll(),
      strategyReinforcements:   this._strReinfrc.getAll(),
      knowledgeGraph,
      metrics,
    });

    this._reports.push(report);
    return report;
  }

  // ── Accessors ──────────────────────────────────────────────────────────────

  getReports(): readonly LearningReport[] { return this._reports; }
  getLastReport(): LearningReport | null  { return this._reports[this._reports.length - 1] ?? null; }
  getPolicy(): LearningPolicy             { return this._policy; }
  getKnowledgeStore()                     { return KnowledgeStore; }
  getCapabilityReinforcement()            { return this._capReinfrc.getAll(); }
  getStrategyReinforcement()              { return this._strReinfrc.getAll(); }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private _emptyReport(startedAt: number, episodesAnalyzed: number, _reason: string): LearningReport {
    const emptyGraph   = this._graphBuilder.build([]);
    const emptyMetrics = this._metricsEng.compute({
      episodesProcessed:     0, patterns: [], validationResults: [],
      prevKnowledgeCount: 0, currentKnowledgeCount: 0,
      durationMs: Date.now() - startedAt, promotedRules: [],
    });
    return this._reportBuilder.build({
      startedAt,
      episodesAnalyzed,
      patterns: [], approvedPatterns: [], rejectedPatterns: [],
      promotedRules: [], updatedRules: [], deprecatedRules: [],
      antiPatterns: [],
      capabilityReinforcements: [],
      strategyReinforcements:   [],
      knowledgeGraph:           emptyGraph,
      metrics:                  emptyMetrics,
    });
  }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __EF51_LE__?: LearningEngineImpl };
if (!G.__EF51_LE__) G.__EF51_LE__ = new LearningEngineImpl();
export const LearningEngine: LearningEngineImpl = G.__EF51_LE__;