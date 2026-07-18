// MethodAnalyzer.ts — Sprint EF-39.6 — SRP: extracts method complexity only
import type { ComplexityMetric } from "../../auditor/ASTAuditor";

export const MethodAnalyzer = Object.freeze({
  extract(source: string, file: string): readonly ComplexityMetric[] {
    const metrics: ComplexityMetric[] = [];
    const lines  = source.split("\n");
    const FN_RE  = /^\s+(?:(?:private|public|protected|static|async|override|abstract)\s+)*(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*\S+\s*)?[{;]/;
    const SKIP   = new Set(["if","for","while","switch","catch","constructor"]);

    lines.forEach((line, idx) => {
      const m = FN_RE.exec(line);
      if (!m) return;
      const name = m[1];
      if (SKIP.has(name)) return;

      const paramCount = m[2].trim() === "" ? 0 : m[2].split(",").length;

      let depth = 0, started = false;
      const bodyLines: string[] = [];

      for (let i = idx; i < Math.min(idx + 150, lines.length); i++) {
        const opens  = (lines[i].match(/{/g) || []).length;
        const closes = (lines[i].match(/}/g) || []).length;
        if (!started && opens > 0) started = true;
        if (started) bodyLines.push(lines[i]);
        depth += opens - closes;
        if (started && depth <= 0) break;
      }

      const body = bodyLines.join("\n");
      metrics.push(Object.freeze({
        name, file, line: idx + 1,
        cyclomaticScore: MethodAnalyzer.cyclomaticComplexity(body),
        paramCount,
        blockDepth:      MethodAnalyzer.maxBlockDepth(body),
        linesOfCode:     bodyLines.length,
      }));
    });

    return Object.freeze(metrics);
  },

  cyclomaticComplexity(body: string): number {
    const decisions = (body.match(/\b(if|else\s+if|for|while|case|catch)\b|&&|\|\||\?\?/g) || []).length;
    return decisions + 1;
  },

  maxBlockDepth(body: string): number {
    let depth = 0, max = 0;
    for (const ch of body) {
      if (ch === "{") { depth++; if (depth > max) max = depth; }
      else if (ch === "}") depth--;
    }
    return max;
  },
});