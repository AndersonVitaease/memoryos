/**
 * KnowledgeGraphValidator.ts — Sprint 6.3.5
 * Validates the KnowledgeGraphStore lifecycle and data integrity.
 */

import type { ValidatorResult, CheckResult } from "./ReadinessTypes";
import { KnowledgeGraphStore } from "../project-knowledge/KnowledgeGraphStore";

function check(name: string, ok: boolean, detail: string, critical = false): CheckResult {
  return { name, status: ok ? "PASS" : ok === null ? "WARN" : "FAIL", detail, critical };
}

export class KnowledgeGraphValidator {
  validate(): ValidatorResult {
    const t0 = Date.now();
    const checks: CheckResult[] = [];

    // API surface
    checks.push(check("KGStore.isReady() callable", typeof KnowledgeGraphStore.isReady === "function", "API OK", true));
    checks.push(check("KGStore.ageMs() callable", typeof KnowledgeGraphStore.ageMs === "function", "API OK", true));
    checks.push(check("KGStore.snapshotFields() callable", typeof KnowledgeGraphStore.snapshotFields === "function", "API OK", false));
    checks.push(check("KGStore.listAllEntities() callable", typeof KnowledgeGraphStore.listAllEntities === "function", "API OK", false));
    checks.push(check("KGStore.query() callable", typeof KnowledgeGraphStore.query === "function", "API OK", false));

    // Singleton stability
    const age1 = KnowledgeGraphStore.ageMs();
    const age2 = KnowledgeGraphStore.ageMs();
    const ageStable = Math.abs(age2 - age1) < 100;
    checks.push(check("Singleton ageMs() stable", ageStable, `diff=${Math.abs(age2 - age1)}ms`, false));

    // snapshotFields
    const fields = KnowledgeGraphStore.snapshotFields() as any;
    checks.push(check("snapshotFields has kgHealth", "kgHealth" in fields, `kgHealth=${fields.kgHealth}`, false));

    // Ready state (informational — KG may not be built yet)
    const ready = KnowledgeGraphStore.isReady();
    checks.push({
      name: "KG built and ready",
      status: ready ? "PASS" : "WARN",
      detail: ready ? `entityCount=${KnowledgeGraphStore.get?.("erc")?.entityCount ?? "N/A"}` : "KG not built — build via Phase 6.0.2 before going to production",
      critical: false,
    });

    if (ready) {
      const g = KnowledgeGraphStore.get("erc");
      if (g) {
        checks.push(check("entityCount > 0", g.entityCount > 0, `entityCount=${g.entityCount}`, false));
        checks.push(check("No duplicate entities", new Set(g.entities.map((e: any) => e.id)).size === g.entities.length, `unique=${new Set(g.entities.map((e: any) => e.id)).size} total=${g.entities.length}`, false));
        checks.push(check("entities.length === entityCount", g.entities.length === g.entityCount, `len=${g.entities.length} count=${g.entityCount}`, false));
      }
    }

    const failed = checks.filter(c => c.status === "FAIL");
    const warned = checks.filter(c => c.status === "WARN");
    const score = Math.round(((checks.length - failed.length) / checks.length) * 100);

    return {
      id: "kg_validator",
      name: "Knowledge Graph Validator",
      domain: "KnowledgeGraph",
      status: failed.length > 0 ? "FAIL" : warned.length > 0 ? "WARN" : "PASS",
      score,
      detail: ready
        ? `KG ready — ${checks.filter(c => c.status === "PASS").length}/${checks.length} checks passed`
        : `KG not built yet — API checks passed, data checks skipped`,
      checks,
      durationMs: Date.now() - t0,
      blockers: failed.map(c => `[KG] ${c.name}: ${c.detail}`),
      warnings: warned.map(c => `${c.name}: ${c.detail}`),
      recommendations: !ready
        ? ["Build KnowledgeGraph via Phase 6.0.2 before certification for full score."]
        : [],
    };
  }
}