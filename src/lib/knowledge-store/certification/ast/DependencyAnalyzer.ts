// DependencyAnalyzer.ts — Sprint EF-39.6 — SRP: builds dependency graph only
import type { DependencyReport, FileASTReport } from "../../auditor/ASTAuditor";
import { CertificationConfig } from "../CertificationConfig";

export const DependencyAnalyzer = Object.freeze({
  analyze(fileReports: readonly FileASTReport[]): DependencyReport {
    const edges: Array<{ from: string; to: string }> = [];
    const fanInMap: Record<string, number> = {};

    for (const fr of fileReports) {
      for (const imp of fr.imports) {
        if (imp.from.startsWith(".") || imp.from.startsWith("@/lib/knowledge-store")) {
          const to = imp.from.split("/").pop() ?? imp.from;
          edges.push(Object.freeze({ from: fr.file, to }));
          fanInMap[to] = (fanInMap[to] ?? 0) + 1;
        }
      }
    }

    // Circular detection (A→B→A)
    const circularPairs: string[] = [];
    const edgeSet = new Set(edges.map(e => `${e.from}|${e.to}`));
    for (const e of edges) {
      const reverse = `${e.to}|${e.from}`;
      if (edgeSet.has(reverse)) {
        const pair = [e.from, e.to].sort().join(" \u2194 ");
        if (!circularPairs.includes(pair)) circularPairs.push(pair);
      }
    }

    // High coupling
    const fanOutMap: Record<string, number> = {};
    for (const e of edges) fanOutMap[e.from] = (fanOutMap[e.from] ?? 0) + 1;
    const highCouplingFiles = Object.entries(fanOutMap)
      .filter(([, n]) => n > CertificationConfig.maxFanOutImports)
      .map(([f]) => f);

    return Object.freeze({
      edges:             Object.freeze(edges.map(e => Object.freeze(e))),
      circularPairs:     Object.freeze(circularPairs),
      hasCircular:       circularPairs.length > 0,
      fanInMap:          Object.freeze(fanInMap),
      highCouplingFiles: Object.freeze(highCouplingFiles),
    });
  },
});