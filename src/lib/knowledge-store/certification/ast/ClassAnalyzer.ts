// ClassAnalyzer.ts — Sprint EF-39.6 — SRP: extracts class structures only
import type { ASTClass } from "../../auditor/ASTAuditor";

export const ClassAnalyzer = Object.freeze({
  extract(source: string): readonly ASTClass[] {
    const classes: ASTClass[] = [];
    const lines    = source.split("\n");
    const CLASS_RE = /^(\s*)(export\s+)?(abstract\s+)?class\s+(\w+)(\s+extends\s+\w+)?(\s+implements\s+[\w,\s]+)?/;

    lines.forEach((line, idx) => {
      const m = CLASS_RE.exec(line);
      if (!m) return;

      const name           = m[4];
      const isExported     = !!m[2];
      const isAbstract     = !!m[3];
      const extendsCount   = m[5] ? 1 : 0;
      const implStr        = m[6] ?? "";
      const implementsCount = implStr ? implStr.split(",").length : 0;

      let depth = 0, started = false, classStart = idx, classEnd = idx;
      const methods: string[] = [];

      for (let i = idx; i < lines.length; i++) {
        const opens  = (lines[i].match(/{/g) || []).length;
        const closes = (lines[i].match(/}/g) || []).length;
        if (!started && opens > 0) started = true;
        depth += opens - closes;

        if (started && depth > 0) {
          const mm = lines[i].match(/^\s+(?:(?:private|public|protected|readonly|static|async|override)\s+)*(\w+)\s*\(/);
          if (mm && mm[1] !== "constructor" && !["if","for","while","switch"].includes(mm[1])) {
            methods.push(mm[1]);
          }
        }
        if (started && depth <= 0) { classEnd = i; break; }
      }

      classes.push(Object.freeze({
        name, line: idx + 1,
        methods:          Object.freeze(methods),
        methodCount:      methods.length,
        isExported, isAbstract,
        implementsCount, extendsCount,
        linesOfCode:      classEnd - classStart + 1,
      }));
    });

    return Object.freeze(classes);
  },
});