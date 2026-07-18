// FanInAnalyzer.ts — Sprint EF-39.6 — SRP: fan-in (times imported) only
import type { FileASTReport } from "../../auditor/ASTAuditor";

export const FanInAnalyzer = Object.freeze({
  compute(fileReports: readonly FileASTReport[]): Readonly<Record<string, number>> {
    const map: Record<string, number> = {};
    for (const fr of fileReports) {
      for (const imp of fr.imports) {
        const key = imp.from.split("/").pop() ?? imp.from;
        map[key] = (map[key] ?? 0) + 1;
      }
    }
    return Object.freeze(map);
  },
});