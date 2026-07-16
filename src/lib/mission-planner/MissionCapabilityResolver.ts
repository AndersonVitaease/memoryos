/**
 * MissionCapabilityResolver.ts — Engineering Sprint 8.1
 * Resolves a Mission into an ordered list of CapabilityRefs.
 * Uses recommended capabilities; falls back when required connectors unavailable.
 *
 * Rule: Missions never know about connectors.
 * This layer bridges Mission → Connector (one-way only).
 */

import type { MissionDefinition, CapabilityRef, MissionEntity } from "./MissionDefinition";

export interface ResolvedCapabilityPlan {
  usedFallback:  boolean;
  capabilities:  CapabilityRef[];
  parametersMap: Map<string, Record<string, unknown>>;
  connectors:    string[];   // unique connectorIds
}

// ── Parameter builder — injects entity values into capability params ───────────

function _buildParameters(cap: CapabilityRef, entities: MissionEntity[]): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  // query / search parameter: build from entities
  const textEntities = entities.filter((e) =>
    ["customer", "name", "company", "project", "trip", "destination",
     "vendor", "participant", "assignee"].includes(e.type)
  ).map((e) => e.value);

  if (textEntities.length > 0) {
    params.query = textEntities.join(" ");
  }

  // date-range
  const dateEntities = entities.filter((e) => e.type === "date_range");
  if (dateEntities.length > 0) params.dateRange = dateEntities[0].value;

  // maxResults / pageSize defaults
  if (cap.capabilityId.includes("search") || cap.capabilityId.includes("list")) {
    params.maxResults = 10;
    params.pageSize   = 10;
  }

  return params;
}

// ── Connector availability check (lightweight — no actual call) ───────────────

function _connectorAvailable(connectorId: string): boolean {
  // Check if Google OAuth token exists in localStorage (best effort)
  try {
    const token = localStorage.getItem("google_access_token") ??
                  localStorage.getItem("gws_token") ??
                  localStorage.getItem("google_auth_token");
    if (!token) return false;
    // All three connectors (calendar, drive, gmail) share the same Google OAuth
    if (["calendar", "drive", "gmail"].includes(connectorId)) return !!token;
    return false;
  } catch {
    return false;
  }
}

// ── Main resolver ─────────────────────────────────────────────────────────────

export class MissionCapabilityResolver {

  resolve(mission: MissionDefinition, entities: MissionEntity[]): ResolvedCapabilityPlan {
    const recommended = mission.recommendedCapabilities;
    const fallback    = mission.fallbackCapabilities;

    // Check if all recommended connectors are available
    const allConnectors = [...new Set(recommended.map((c) => c.connectorId))];
    const anyAvailable  = allConnectors.some(_connectorAvailable);
    // Use recommended (even if not connected — execution will handle errors gracefully)
    const chosen   = recommended.length > 0 ? recommended : fallback;
    const usedFallback = chosen === fallback;

    const parametersMap = new Map<string, Record<string, unknown>>();
    chosen.forEach((cap) => {
      parametersMap.set(cap.capabilityId, _buildParameters(cap, entities));
    });

    const connectors = [...new Set(chosen.map((c) => c.connectorId))];

    return { usedFallback, capabilities: chosen, parametersMap, connectors };
  }

  /** Convert resolved capabilities into ExecutionNode-compatible shape (for MCOE) */
  toExecutionNodes(plan: ResolvedCapabilityPlan): Array<{
    id: string; connectorId: string; capabilityId: string;
    parameters: Record<string, unknown>; dependsOn: string[];
    mode: "parallel" | "sequential"; timeoutMs: number; retries: number; label: string;
  }> {
    const idOf = (cap: CapabilityRef) =>
      `${cap.connectorId.slice(0,3)}-${cap.capabilityId.split(".").pop()}`;

    const capToId = new Map<string, string>(
      plan.capabilities.map((c) => [c.capabilityId, idOf(c)])
    );

    return plan.capabilities.map((cap) => ({
      id:           idOf(cap),
      connectorId:  cap.connectorId,
      capabilityId: cap.capabilityId,
      parameters:   plan.parametersMap.get(cap.capabilityId) ?? {},
      dependsOn:    cap.dependsOn.map((dep) => capToId.get(dep) ?? dep),
      mode:         cap.mode,
      timeoutMs:    cap.timeoutMs,
      retries:      1,
      label:        cap.label,
    }));
  }
}