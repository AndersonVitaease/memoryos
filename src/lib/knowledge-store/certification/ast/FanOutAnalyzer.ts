// FanOutAnalyzer.ts — Sprint EF-39.6 — SRP: fan-out (imports per file) only
import type { FileASTReport } from "../../auditor/ASTAuditor";

export const FanOutAnalyzer = Object.freeze({
  compute(fr: FileASTReport): number {
    return fr.imports.filter(i => i.from.startsWith(".") || i.from.startsWith("@/")).length;
  },
});