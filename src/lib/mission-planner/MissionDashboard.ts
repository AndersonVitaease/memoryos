/**
 * MissionDashboard.ts — Engineering Sprint 8.1
 * Dashboard aggregation helpers — pure functions, no side effects.
 */

import type { MissionContext } from "./MissionDefinition";
import { loadContextHistory } from "./MissionContext";
import { MissionRegistry }   from "./MissionRegistry";

export interface MissionStats {
  total:        number;
  success:      number;
  partial:      number;
  failed:       number;
  avgDurationMs:number;
  avgScore:     number;
  topMissions:  { missionId: string; count: number }[];
}

export function getMissionStats(): MissionStats {
  const history = loadContextHistory();
  if (history.length === 0) return { total:0, success:0, partial:0, failed:0, avgDurationMs:0, avgScore:0, topMissions:[] };

  const success = history.filter((c) => c.status === "success").length;
  const partial = history.filter((c) => c.status === "partial").length;
  const failed  = history.filter((c) => c.status === "failed" || c.status === "running").length;

  const durations = history.filter((c) => c.durationMs != null).map((c) => c.durationMs as number);
  const avgDurationMs = durations.length > 0 ? Math.round(durations.reduce((a,b) => a+b, 0) / durations.length) : 0;
  const avgScore = Math.round(history.reduce((a,c) => a + c.successScore, 0) / history.length);

  const counts = new Map<string, number>();
  history.forEach((c) => counts.set(c.missionId, (counts.get(c.missionId) ?? 0) + 1));
  const topMissions = Array.from(counts.entries())
    .sort((a,b) => b[1] - a[1])
    .slice(0, 5)
    .map(([missionId, count]) => ({ missionId, count }));

  return { total: history.length, success, partial, failed, avgDurationMs, avgScore, topMissions };
}

export function getMissionName(id: string): string {
  return MissionRegistry.get(id)?.name ?? id;
}