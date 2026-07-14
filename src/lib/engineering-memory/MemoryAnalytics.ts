/**
 * MemoryAnalytics.ts — Sprint 6.2.4
 */
import type { AnyMemoryEntry, MemoryKind } from "./MEMTypes";

export interface AnalyticsReport {
  topChangedComponents:  Array<{ component: string; count: number }>;
  topBugModules:         Array<{ module: string; count: number }>;
  topReuseComponents:    Array<{ component: string; count: number }>;
  topConnectors:         Array<{ name: string; count: number }>;
  recurringCauses:       string[];
  averageDurationMs:     number;
  regressionsAvoided:    number;
  memoriesByKind:        Partial<Record<MemoryKind, number>>;
}

export class MemoryAnalytics {
  analyze(entries: AnyMemoryEntry[]): AnalyticsReport {
    const compFreq    = new Map<string, number>();
    const bugModules  = new Map<string, number>();
    const connectors  = new Map<string, number>();
    const causes: string[] = [];
    let totalDuration = 0, durationCount = 0;

    for (const e of entries) {
      if (e.kind === "IMPLEMENTATION") {
        const impl = e as any;
        impl.components?.forEach((c: string) => compFreq.set(c, (compFreq.get(c) ?? 0) + 1));
        if (impl.durationMs) { totalDuration += impl.durationMs; durationCount++; }
      }
      if (e.kind === "BUG") {
        const bug = e as any;
        bugModules.set(bug.module, (bugModules.get(bug.module) ?? 0) + 1);
        if (bug.rootCause) causes.push(bug.rootCause);
      }
      if (e.kind === "CONNECTOR") {
        const conn = e as any;
        connectors.set(conn.connectorName, (connectors.get(conn.connectorName) ?? 0) + 1);
      }
    }

    const top = (m: Map<string, number>, n = 5) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ component: k, count: v, name: k, module: k }));

    const kinds = {} as Partial<Record<MemoryKind, number>>;
    for (const e of entries) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;

    const regressionsAvoided = entries.filter(e => e.kind === "REGRESSION" && (e as any).testsFailed === 0).length;

    return {
      topChangedComponents: top(compFreq).map(x => ({ component: x.component, count: x.count })),
      topBugModules:        top(bugModules).map(x => ({ module: x.module, count: x.count })),
      topReuseComponents:   [...compFreq.entries()].filter(([,v]) => v >= 2).sort((a,b) => b[1]-a[1]).slice(0,5).map(([component, count]) => ({ component, count })),
      topConnectors:        top(connectors).map(x => ({ name: x.name, count: x.count })),
      recurringCauses:      [...new Set(causes)].slice(0, 5),
      averageDurationMs:    durationCount ? Math.round(totalDuration / durationCount) : 0,
      regressionsAvoided,
      memoriesByKind:       kinds,
    };
  }
}