/**
 * MultiConnectorPlanner.ts — Engineering Sprint 8.0
 * Central orchestrator for the MCOE.
 *
 * Receives a raw intent → builds ExecutionPlan → runs the graph →
 * merges context → returns unified result.
 *
 * Rules enforced:
 *   - No connector calls another connector.
 *   - All coordination happens exclusively here.
 *   - Independent nodes run in parallel; dependent nodes run sequentially.
 *   - Partial failures do not abort the plan.
 */

import type {
  MultiConnectorExecutionPlan,
  MultiConnectorExecutionResult,
  ExecutionNode,
  ExecutionNodeResult,
  ScenarioId,
  NodeStatus,
} from "./MultiConnectorExecutionPlan";
import { buildExecutionGraph } from "./ConnectorExecutionGraph";
import { ExecutionDependencyResolver } from "./ExecutionDependencyResolver";
import { mergeExecutionContext } from "./ExecutionContextMerger";

// ── Node executor — calls the correct connector capability ────────────────────

async function _executeNode(
  node: ExecutionNode,
  parameters: Record<string, unknown>,
): Promise<{ ok: boolean; data: unknown; error: string | null }> {
  if (node.connectorId === "calendar") {
    const { executeCalendarCapability } = await import("@/lib/google-calendar/GoogleCalendarCapabilityExecutor");
    return executeCalendarCapability(node.capabilityId, parameters);
  }
  if (node.connectorId === "drive") {
    const { executeDriveCapability } = await import("@/lib/google-drive/GoogleDriveCapabilityExecutor");
    return executeDriveCapability(node.capabilityId, parameters);
  }
  if (node.connectorId === "gmail") {
    const { UniversalConnectorRouter } = await import("@/lib/connector-router/UniversalConnectorRouter");
    const router = UniversalConnectorRouter.getInstance();
    const result = await router.execute({ connectorId: "gmail", capability: node.capabilityId, parameters });
    return { ok: result.status === "success", data: result.output, error: result.error };
  }
  return { ok: false, data: null, error: `Unknown connectorId: ${node.connectorId}` };
}

// ── Plan scenarios ────────────────────────────────────────────────────────────

let _planSeq = 1;
function _planId() { return `mcoe-plan-${Date.now()}-${(_planSeq++).toString().padStart(4,"0")}`; }

function _buildPlan(rawQuery: string, scenarioId: ScenarioId): MultiConnectorExecutionPlan {
  const now = new Date();
  const timeMin = now.toISOString();
  const tomorrow = new Date(now.getTime() + 86400_000);
  const tomorrowEnd = new Date(tomorrow);
  tomorrowEnd.setHours(23,59,59,999);
  const weekEnd = new Date(now.getTime() + 7 * 86400_000).toISOString();

  const nodesByScenario: Record<ScenarioId, ExecutionNode[]> = {
    documents_from_meeting: [
      { id: "cal-next",  connectorId: "calendar", capabilityId: "calendar.nextMeeting",  parameters: {},                                    dependsOn: [],          mode: "sequential", timeoutMs: 10000, retries: 1, label: "Next Meeting" },
      { id: "cal-today", connectorId: "calendar", capabilityId: "calendar.today",         parameters: {},                                    dependsOn: [],          mode: "parallel",   timeoutMs: 10000, retries: 1, label: "Today Events" },
      { id: "drv-srch",  connectorId: "drive",    capabilityId: "drive.searchFiles",       parameters: { query: rawQuery, pageSize: 10 },      dependsOn: ["cal-next"], mode: "sequential", timeoutMs: 12000, retries: 1, label: "Drive Search" },
    ],
    client_summary: [
      { id: "gml-srch",  connectorId: "gmail",    capabilityId: "searchEmails",            parameters: { query: rawQuery, maxResults: 10 },    dependsOn: [],          mode: "parallel",   timeoutMs: 12000, retries: 1, label: "Gmail Search" },
      { id: "drv-srch",  connectorId: "drive",    capabilityId: "drive.searchFiles",       parameters: { query: rawQuery, pageSize: 10 },      dependsOn: [],          mode: "parallel",   timeoutMs: 12000, retries: 1, label: "Drive Search" },
      { id: "cal-srch",  connectorId: "calendar", capabilityId: "calendar.searchEvents",   parameters: { query: rawQuery, maxResults: 10 },    dependsOn: [],          mode: "parallel",   timeoutMs: 12000, retries: 1, label: "Calendar Search" },
    ],
    pending_before_meeting: [
      { id: "cal-srch",  connectorId: "calendar", capabilityId: "calendar.thisWeek",       parameters: {},                                    dependsOn: [],          mode: "sequential", timeoutMs: 10000, retries: 1, label: "This Week" },
      { id: "drv-srch",  connectorId: "drive",    capabilityId: "drive.searchFiles",       parameters: { query: rawQuery, pageSize: 10 },      dependsOn: ["cal-srch"], mode: "sequential", timeoutMs: 12000, retries: 1, label: "Drive Pending" },
      { id: "gml-srch",  connectorId: "gmail",    capabilityId: "searchEmails",            parameters: { query: rawQuery, maxResults: 10 },    dependsOn: ["cal-srch"], mode: "parallel",   timeoutMs: 12000, retries: 1, label: "Gmail Pending" },
    ],
    custom: [
      { id: "drv-list",  connectorId: "drive",    capabilityId: "drive.listFiles",         parameters: { pageSize: 15 },                      dependsOn: [],          mode: "parallel",   timeoutMs: 12000, retries: 1, label: "List Drive" },
      { id: "cal-today", connectorId: "calendar", capabilityId: "calendar.today",           parameters: {},                                    dependsOn: [],          mode: "parallel",   timeoutMs: 10000, retries: 1, label: "Today" },
    ],
  };

  return {
    id:         _planId(),
    intentId:   `intent-${Date.now()}`,
    rawQuery,
    scenarioId,
    nodes:      nodesByScenario[scenarioId] ?? nodesByScenario.custom,
    createdAt:  Date.now(),
  };
}

// ── Scenario detector ─────────────────────────────────────────────────────────

export function detectScenario(rawQuery: string): ScenarioId {
  const q = rawQuery.toLowerCase();
  if (/documentos?|arquivos?|contrato/.test(q) && /reuni[aã]o|meeting|amanhã|hoje/.test(q)) return "documents_from_meeting";
  if (/cliente|company|empresa|xpto|resumo|tudo relacionado/.test(q)) return "client_summary";
  if (/pendente|pending|antes da reuni[aã]o|antes de/.test(q)) return "pending_before_meeting";
  return "custom";
}

// ── Main planner ──────────────────────────────────────────────────────────────

export class MultiConnectorPlanner {

  async plan(rawQuery: string, scenarioId?: ScenarioId): Promise<MultiConnectorExecutionPlan> {
    const sid = scenarioId ?? detectScenario(rawQuery);
    return _buildPlan(rawQuery, sid);
  }

  async execute(plan: MultiConnectorExecutionPlan): Promise<MultiConnectorExecutionResult> {
    const startedAt  = Date.now();
    const graph      = buildExecutionGraph(plan.nodes);
    const resolver   = new ExecutionDependencyResolver();
    const completed  = new Map<string, ExecutionNodeResult>();
    const nodeResults: ExecutionNodeResult[] = [];

    // Execute layer by layer (within each layer: parallel)
    for (const layer of graph.layers) {
      const layerPromises = layer.nodes.map(async (node): Promise<void> => {
        const nodeStart = Date.now();
        const resolved  = resolver.resolve(node, completed);
        let status: NodeStatus = "running";
        let output: unknown = null;
        let error: string | null = null;
        let retryCount = 0;

        for (let attempt = 0; attempt <= node.retries; attempt++) {
          try {
            const r = await Promise.race([
              _executeNode(node, resolved.parameters),
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), node.timeoutMs)),
            ]);
            if ((r as { ok?: boolean }).ok !== false) {
              output = r;
              status = "success";
              break;
            } else {
              error = (r as { error?: string }).error ?? "Failed";
              status = "failed";
            }
          } catch (e) {
            error  = (e as Error).message;
            status = "failed";
            retryCount = attempt;
          }
        }

        const nodeResult: ExecutionNodeResult = {
          nodeId: node.id, status, output, error,
          startedAt: nodeStart, finishedAt: Date.now(),
          durationMs: Date.now() - nodeStart, retryCount,
        };
        nodeResults.push(nodeResult);
        completed.set(node.id, nodeResult);
      });

      await Promise.all(layerPromises);
    }

    const finishedAt      = Date.now();
    const totalDurationMs = finishedAt - startedAt;

    // Calculate parallel savings
    const serialMs = nodeResults.reduce((s, r) => s + r.durationMs, 0);
    const parallelSavingsMs = Math.max(0, serialMs - totalDurationMs);

    const unifiedContext = mergeExecutionContext(nodeResults);
    const partialFailures = nodeResults.filter((r) => r.status === "failed").map((r) => r.nodeId);

    return {
      planId:    plan.id, intentId: plan.intentId, nodeResults, unifiedContext,
      totalDurationMs, parallelSavingsMs, startedAt, finishedAt,
      success:   partialFailures.length < plan.nodes.length,
      partialFailures,
    };
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const _KEY = "__MCOE_PLANNER__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new MultiConnectorPlanner();
}
export const mcoe: MultiConnectorPlanner = (
  globalThis as unknown as Record<string, MultiConnectorPlanner>
)[_KEY];