/**
 * OfficialRuntimeBridge.ts — Sprint M-04
 *
 * SRP: eliminate all connector execution that bypasses the official pipeline.
 *
 * This bridge is the ONLY connector execution adapter for cognitive components
 * (ConversationCognitiveGateway, LiveCognitivePipeline).
 *
 * Architecture rules (BLK-04 elimination):
 *   - ConnectorInvocationService.invoke() is NO LONGER the execution path for
 *     cognitive queries. All connector execution routes through:
 *
 *       ConversationPlanningEngine
 *             ↓
 *       ConversationRuntimeEngine
 *             ↓
 *       UniversalConnectorRouter
 *             ↓
 *       Connector (GitHubConnector, GmailConnector, etc.)
 *
 *   - This bridge accepts a GoalType + parameters, builds a synthetic
 *     ConversationGoal, feeds it to ConversationPlanningEngine to get an
 *     ExecutionPlan, then executes it via ConversationRuntimeEngine.
 *
 *   - ConnectorInvocationService is NEVER called from here.
 *   - No new connectors, no new router, no new runtime are created.
 *   - The existing singleton ConversationRuntimeEngine (via
 *     ConnectorRuntimeProvider.getRealRuntimeEngine()) is reused.
 *
 * Consumers (M-04 only):
 *   - ConversationCognitiveGateway  (replaces _cis.invoke for GitHub queries)
 *   - LiveCognitivePipeline stages  (replaces cis.githubListRepos, etc.)
 *
 * MDS v2.0 compliant. Never throws. Singleton via globalThis.
 */

import type { GoalType, ConversationGoal }  from "@/lib/goals/GoalTypes";
import { makeConversationGoalId }            from "@/lib/goals/GoalTypes";
import { conversationPlanningEngine }        from "@/lib/planning-engine-e022/ConversationPlanningEngine";
import { getRealRuntimeEngine }              from "@/lib/connector-runtime-provider/ConnectorRuntimeProvider";
import type { ExecutionResult }              from "@/lib/runtime-engine/RuntimeTypes";

// ── Bridge Result ─────────────────────────────────────────────────────────────

export interface BridgeInvocationResult {
  /** true when connector executed (even if data was empty) */
  success:     boolean;
  /** The raw connector data (first completed step's output) */
  data:        unknown | null;
  /** All step outputs if multi-step plan */
  allOutputs:  Array<{ connector: string; capability: string; output: unknown }>;
  /** Runtime execution status */
  status:      string;
  /** Error message if failed */
  error:       string | null;
  /** Execution duration */
  durationMs:  number;
  /** The executionId for traceability */
  executionId: string;
  /** Full execution result for inspection */
  executionResult: ExecutionResult;
}

// ── Mapping: CIS-style capability strings → GoalType ─────────────────────────
// Maps the legacy ConnectorInvocationService operation names that were used
// in CCG and LCP to the official GoalType names registered in GoalCapabilityRegistry.

const CIS_TO_GOAL_TYPE: Record<string, GoalType> = {
  // GitHub
  "repos.list":              "github.listRepos",
  "branches.list":           "github.listBranches",
  "commits.list":            "github.listCommits",
  "files.list":              "github.listFiles",
  "files.get":               "github.getFile",
  "search.symbol":           "github.searchCode",
  "search.file":             "github.searchCode",
  "search.text":             "github.searchCode",
  "search.reference":        "github.searchCode",
  "search.import":           "github.searchCode",
  "search.class":            "github.searchCode",
  "search.function":         "github.searchCode",
  "search.interface":        "github.searchCode",
  "pullRequests.list":       "github.listPullRequests",
  "issues.list":             "github.listIssues",
  "issue.search":            "github.listIssues",
  "commit.timeline":         "github.commitTimeline",
  "commit.details":          "github.commitTimeline",
  "diff.branch":             "github.commitTimeline",
  "diff.commit":             "github.commitTimeline",
  "repository.statistics":   "github.repoStatistics",
  "repository.tree":         "github.listFiles",
  "repository.modules":      "github.listFiles",
  "repository.dependencies": "github.listFiles",
  "repository.entrypoints":  "github.listFiles",
  "repository.languages":    "github.repoStatistics",
  "file.summary":            "github.getFile",
  "file.explanation":        "github.getFile",
  "file.responsibilities":   "github.getFile",
  "file.dependencies":       "github.getFile",
  "file.imports":            "github.getFile",
  "file.exports":            "github.getFile",
  "history.file":            "github.listCommits",
  "repos.get":               "github.listRepos",
  "repos.stats":             "github.repoStatistics",
  "repos.languages":         "github.repoStatistics",
  "auth.user":               "github.listRepos",
  // Gmail
  "readInbox":               "gmail.readInbox",
  "searchEmails":            "gmail.searchMessages",
  "readMessage":             "gmail.readMessage",
  "gmail.messages.list":     "gmail.readInbox",
  "gmail.messages.get":      "gmail.readMessage",
  "gmail.threads.list":      "gmail.readInbox",
  "gmail.labels.list":       "gmail.readInbox",
  "auth.profile":            "gmail.readInbox",
  // Calendar
  "calendar.events.list":    "calendar.listToday",
  "calendar.events.get":     "calendar.listToday",
  "calendar.calendars.list": "calendar.listCalendars",
  // Drive
  "drive.files.list":        "drive.listRecent",
  "drive.files.get":         "drive.openDocument",
  "drive.files.search":      "drive.searchFiles",
  "drive.about.get":         "drive.listRecent",
  // Connectivity pings → memory.query (produces empty plan → non-blocking no-op)
  "connectivity.ping":       "memory.query",
  "workspace.info":          "memory.query",
  "projects.list":           "memory.query",
  "entities.list":           "memory.query",
};

// ── OfficialRuntimeBridge ─────────────────────────────────────────────────────

export class OfficialRuntimeBridgeClass {
  private _totalInvocations = 0;
  private _totalBypassed    = 0;
  private _lastResults: BridgeInvocationResult[] = [];

  /**
   * Execute a connector capability through the official pipeline.
   *
   * @param connectorId   - The connector id (e.g. "github", "google")
   * @param operation     - The CIS-style operation name (e.g. "repos.list")
   * @param parameters    - Payload to pass as goal parameters
   * @returns BridgeInvocationResult — never throws
   */
  async invoke(
    connectorId: string,
    operation:   string,
    parameters:  Record<string, unknown> = {},
  ): Promise<BridgeInvocationResult> {
    const t0 = Date.now();
    this._totalInvocations++;

    // ── 1. Map operation → GoalType ─────────────────────────────────────────
    const goalType = CIS_TO_GOAL_TYPE[operation] ?? "general.conversation";

    // ── 2. Build synthetic ConversationGoal ─────────────────────────────────
    const goal: ConversationGoal = Object.freeze({
      id:               makeConversationGoalId(),
      type:             goalType,
      confidence:       0.9,
      parameters:       Object.freeze({ ...parameters, _sourceConnector: connectorId, _sourceOperation: operation }),
      userIntent:       `${connectorId}.${operation}`,
      cognitiveIntent:  "repository_analysis" as import("@/lib/conversation-cognitive-gateway/CCGTypes").CognitiveIntent,
      createdAt:        Date.now(),
      valid:            true,
      validationErrors: Object.freeze([]),
    });

    // ── 3. Plan via ConversationPlanningEngine ───────────────────────────────
    const planResult = conversationPlanningEngine.plan(goal);

    if (!planResult.success || planResult.plan.steps.length === 0) {
      // Empty plan = goalType not routable (e.g. connectivity.ping → memory.query)
      // This is a valid non-connector path — return a synthetic "ok" result
      const emptyResult: BridgeInvocationResult = {
        success:         true,
        data:            null,
        allOutputs:      [],
        status:          "NOT_ROUTABLE",
        error:           null,
        durationMs:      Date.now() - t0,
        executionId:     `bridge-empty-${Date.now()}`,
        executionResult: {
          executionId: `bridge-empty-${Date.now()}`,
          planId:      planResult.plan.id,
          status:      "completed",
          steps:       [],
          errors:      [],
          durationMs:  Date.now() - t0,
          startedAt:   t0,
          completedAt: Date.now(),
        },
      };
      this._track(emptyResult);
      return emptyResult;
    }

    // ── 4. Execute via ConversationRuntimeEngine (official path) ─────────────
    try {
      const engine = await getRealRuntimeEngine();
      const executionResult = await engine.execute(planResult.plan);

      const completedSteps = executionResult.steps.filter(
        (s) => s.status === "completed" && s.output !== null,
      );

      const allOutputs = completedSteps.map((s) => ({
        connector:  s.connector,
        capability: s.capability,
        output:     s.output,
      }));

      const primaryData = allOutputs[0]?.output ?? null;
      const success = executionResult.status === "completed" && completedSteps.length > 0;

      const bridgeResult: BridgeInvocationResult = {
        success,
        data:            primaryData,
        allOutputs,
        status:          executionResult.status,
        error:           executionResult.errors[0] ?? null,
        durationMs:      Date.now() - t0,
        executionId:     executionResult.executionId,
        executionResult,
      };

      this._track(bridgeResult);
      return bridgeResult;

    } catch (err) {
      this._totalBypassed++;
      const errResult: BridgeInvocationResult = {
        success:         false,
        data:            null,
        allOutputs:      [],
        status:          "FAILED",
        error:           err instanceof Error ? err.message : String(err),
        durationMs:      Date.now() - t0,
        executionId:     `bridge-err-${Date.now()}`,
        executionResult: {
          executionId: `bridge-err-${Date.now()}`,
          planId:      planResult.plan.id,
          status:      "failed",
          steps:       [],
          errors:      [err instanceof Error ? err.message : String(err)],
          durationMs:  Date.now() - t0,
          startedAt:   t0,
          completedAt: Date.now(),
        },
      };
      this._track(errResult);
      return errResult;
    }
  }

  /**
   * Convenience: invoke and return data in the shape ConnectorInvocationService used to return.
   * Allows drop-in replacement in LCP and CCG with minimal code changes.
   */
  async invokeCompat(
    connectorId: string,
    operation:   string,
    payload:     Record<string, unknown> = {},
    _ctx:        Record<string, unknown> = {},
  ): Promise<{
    record: { id: string; status: string; durationMs: number; error: string | null };
    result: { data: unknown; success: boolean } | null;
  }> {
    const r = await this.invoke(connectorId, operation, payload);
    return {
      record: {
        id:        r.executionId,
        status:    r.success ? "SUCCESS" : (r.status === "NOT_ROUTABLE" ? "NOT_CONFIGURED" : r.status),
        durationMs: r.durationMs,
        error:     r.error,
      },
      result: r.data !== null ? { data: r.data, success: r.success } : null,
    };
  }

  // ── Observability ────────────────────────────────────────────────────────────

  getMetrics() {
    return {
      totalInvocations: this._totalInvocations,
      totalBypassed:    this._totalBypassed,
      lastResults:      [...this._lastResults].reverse().slice(0, 20),
    };
  }

  private _track(r: BridgeInvocationResult): void {
    this._lastResults.push(r);
    if (this._lastResults.length > 100) this._lastResults.splice(0, this._lastResults.length - 100);
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const _KEY = "__OFFICIAL_RUNTIME_BRIDGE__";
const _g   = globalThis as Record<string, unknown>;
if (!_g[_KEY]) _g[_KEY] = new OfficialRuntimeBridgeClass();

export const officialRuntimeBridge = _g[_KEY] as OfficialRuntimeBridgeClass;