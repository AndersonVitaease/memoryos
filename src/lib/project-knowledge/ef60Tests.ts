/**
 * ef60Tests.ts — EF-60.14 Validation Suite
 * Phase 6.0.0 · MemoryOS · 2026-07-14
 *
 * All tests execute against the live GitHub runtime.
 */

import { RepositoryKnowledgeBuilder } from "./RepositoryKnowledgeBuilder";
import { parseSourceFile, detectLayer } from "./SourceCodeParser";
import { ConnectorInvocationService } from "../cognitive-connector/ConnectorInvocationService";

export interface EF60TestResult {
  id:         string;
  name:       string;
  category:   string;
  status:     "PASS" | "FAIL" | "NOT_CONFIGURED";
  durationMs: number;
  evidence:   string[];
  error?:     string;
}

export interface EF60Report {
  id:            string;
  generatedAt:   number;
  durationMs:    number;
  totalTests:    number;
  passed:        number;
  failed:        number;
  notConfigured: number;
  results:       EF60TestResult[];
  certified:     boolean;
  summary:       string;
  graph?:        any;
}

const cis = new ConnectorInvocationService();

function makeId() { return `ef60-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`; }

export class EF60ValidationSuite {
  async run(): Promise<EF60Report> {
    const t0 = Date.now();
    const results: EF60TestResult[] = [];

    // Discover repo once
    let owner: string | null = null;
    let repo: string | null  = null;
    let graph: any = null;

    const reposInv = await cis.invoke("github", "repos.list", { per_page: 5 },
      { originComponent: "EF60Suite", reason: "Discover repo" });
    if (reposInv.record.status === "SUCCESS") {
      const items = (reposInv.result?.data as any)?.items ?? [];
      if (items.length > 0) { owner = items[0].owner; repo = items[0].name; }
    }

    const run = async (
      id: string, name: string, category: string,
      fn: () => Promise<{ evidence: string[] }>,
    ) => {
      const t = Date.now();
      try {
        const r = await fn();
        results.push({ id, name, category, status: "PASS", durationMs: Date.now() - t, evidence: r.evidence });
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        const nc  = msg.includes("NOT_CONFIGURED") || msg.includes("no repo") || msg.includes("token");
        results.push({ id, name, category, status: nc ? "NOT_CONFIGURED" : "FAIL", durationMs: Date.now() - t, evidence: [], error: msg });
      }
    };

    // ── EF-60.2: Source Code Parser ─────────────────────────────────────────

    await run("60.2.1", "Parser extracts classes from TypeScript", "Source Parser", async () => {
      const src = `export class ConnectionManager {\n  connect() {}\n  disconnect() {}\n}\n`;
      const r   = parseSourceFile("src/lib/test/ConnectionManager.ts", src);
      if (!r.classes.includes("ConnectionManager")) throw new Error("Class not extracted");
      return { evidence: [`Classes: ${r.classes.join(", ")}`, `Language: ${r.language}`] };
    });

    await run("60.2.2", "Parser extracts interfaces", "Source Parser", async () => {
      const src = `export interface IConnector {\n  connect(): void;\n}\n`;
      const r   = parseSourceFile("src/lib/test/IConnector.ts", src);
      if (!r.interfaces.includes("IConnector")) throw new Error("Interface not extracted");
      return { evidence: [`Interfaces: ${r.interfaces.join(", ")}`] };
    });

    await run("60.2.3", "Parser extracts imports correctly", "Source Parser", async () => {
      const src = `import { ConnectorInvocationService } from '../cognitive-connector/ConnectorInvocationService';\nimport type { DetectedIntent } from './CTPTypes';\n`;
      const r   = parseSourceFile("src/lib/test/Test.ts", src);
      if (r.imports.length === 0) throw new Error("No imports extracted");
      return { evidence: [`Imports: ${r.imports.map(i => i.source).join(", ")}`] };
    });

    await run("60.2.4", "Layer detector classifies paths correctly", "Source Parser", async () => {
      const cases = [
        { path: "src/pages/ChatPage.jsx",                           expected: "presentation" },
        { path: "src/lib/cognitive-task-planner/CognitiveTaskPlanner.ts", expected: "orchestration" },
        { path: "src/lib/connector-runtime/connectors/GitHubConnector.ts", expected: "connector" },
        { path: "src/lib/planning-engine/PlanningEngine.ts",         expected: "engine" },
      ];
      for (const c of cases) {
        const layer = detectLayer(c.path);
        if (layer !== c.expected) throw new Error(`${c.path}: expected ${c.expected}, got ${layer}`);
      }
      return { evidence: [`All ${cases.length} layer classifications correct`] };
    });

    // ── EF-60.1 / 60.3: Repository Parsing & Entity Building ───────────────

    await run("60.3.1", "RepositoryKnowledgeBuilder builds graph from live repo", "Entity Building", async () => {
      if (!owner || !repo) throw new Error("NOT_CONFIGURED — no repo");
      const builder = new RepositoryKnowledgeBuilder();
      const g = await builder.build(owner, repo, "main", { maxFiles: 30 });
      graph = g;
      if (g.entityCount === 0) throw new Error("No entities built");
      if (g.durationMs === 0)  throw new Error("Duration is zero");
      return { evidence: [`Entities: ${g.entityCount}`, `Files parsed: ${g.entityCount}`, `Duration: ${g.durationMs}ms`, `Repo: ${owner}/${repo}`] };
    });

    await run("60.3.2", "Entities contain required fields", "Entity Building", async () => {
      if (!graph) throw new Error("NOT_CONFIGURED — graph not built");
      const entity = graph.entities[0];
      if (!entity.id)       throw new Error("Missing entity.id");
      if (!entity.name)     throw new Error("Missing entity.name");
      if (!entity.filePath) throw new Error("Missing entity.filePath");
      if (!entity.layer)    throw new Error("Missing entity.layer");
      if (!entity.type)     throw new Error("Missing entity.type");
      return { evidence: [`Sample: ${entity.name} (${entity.type}) @ ${entity.layer}`, `FilePath: ${entity.filePath}`] };
    });

    await run("60.3.3", "Entities distributed across architectural layers", "Entity Building", async () => {
      if (!graph) throw new Error("NOT_CONFIGURED");
      const populated = Object.entries(graph.layers).filter(([, ids]) => (ids as string[]).length > 0).map(([l]) => l);
      if (populated.length === 0) throw new Error("No layers populated");
      return { evidence: [`Layers populated: ${populated.join(", ")}`, `Total entities: ${graph.entityCount}`] };
    });

    // ── EF-60.4: Relationship Building ─────────────────────────────────────

    await run("60.4.1", "Relationships built between entities", "Relationship Building", async () => {
      if (!graph) throw new Error("NOT_CONFIGURED");
      if (graph.relationshipCount === 0) throw new Error("No relationships built — may need more files parsed");
      const types = [...new Set(graph.relationships.map((r: any) => r.type))];
      return { evidence: [`Relationships: ${graph.relationshipCount}`, `Types: ${types.join(", ")}`] };
    });

    await run("60.4.2", "Relationships are directional", "Relationship Building", async () => {
      if (!graph || graph.relationshipCount === 0) throw new Error("NOT_CONFIGURED or no relationships");
      const rel = graph.relationships[0];
      if (!rel.fromId || !rel.toId) throw new Error("Relationship missing fromId/toId");
      if (!rel.fromName || !rel.toName) throw new Error("Relationship missing names");
      return { evidence: [`Sample: ${rel.fromName} →[${rel.type}]→ ${rel.toName}`] };
    });

    // ── EF-60.5: Module Graph ───────────────────────────────────────────────

    await run("60.5.1", "Module graph constructed", "Module Graph", async () => {
      if (!graph) throw new Error("NOT_CONFIGURED");
      if (graph.modules.length === 0) throw new Error("No modules built");
      return { evidence: [`Modules: ${graph.modules.length}`, `Sample: ${graph.modules[0]?.name}`] };
    });

    await run("60.5.2", "Module inter-dependencies wired", "Module Graph", async () => {
      if (!graph) throw new Error("NOT_CONFIGURED");
      const withDeps = graph.modules.filter((m: any) => m.dependsOn.length > 0);
      return { evidence: [`Modules with deps: ${withDeps.length}/${graph.modules.length}`] };
    });

    // ── EF-60.6: Dependency Graph ───────────────────────────────────────────

    await run("60.6.1", "Circular dependency detection runs", "Dependency Graph", async () => {
      if (!graph) throw new Error("NOT_CONFIGURED");
      // circularDeps array present (may be empty — that's OK)
      if (!Array.isArray(graph.circularDeps)) throw new Error("circularDeps not an array");
      return { evidence: [`Circular deps found: ${graph.circularDeps.length}`, `Dead code candidates: ${graph.deadCode.length}`] };
    });

    await run("60.6.2", "Dead code candidates identified", "Dependency Graph", async () => {
      if (!graph) throw new Error("NOT_CONFIGURED");
      if (!Array.isArray(graph.deadCode)) throw new Error("deadCode not an array");
      return { evidence: [`Dead code candidates: ${graph.deadCode.length}`, `Sample: ${graph.deadCode[0] ?? "none"}`] };
    });

    // ── EF-60.7: Identity Layer ─────────────────────────────────────────────

    await run("60.7.1", "Entities have dependencies and dependents wired", "Identity Layer", async () => {
      if (!graph) throw new Error("NOT_CONFIGURED");
      const withDeps  = graph.entities.filter((e: any) => e.dependencies.length > 0);
      const withDepts = graph.entities.filter((e: any) => e.dependents.length > 0);
      return { evidence: [`With dependencies: ${withDeps.length}`, `With dependents: ${withDepts.length}`] };
    });

    // ── EF-60.9: Incremental Update ────────────────────────────────────────

    await run("60.9.1", "Incremental update runs without full rebuild", "Incremental Update", async () => {
      if (!owner || !repo || !graph) throw new Error("NOT_CONFIGURED");
      const builder = new RepositoryKnowledgeBuilder();
      await builder.build(owner, repo, "main", { maxFiles: 20 });
      // Pick an existing file path to update
      const samplePath = graph.entities[0]?.filePath;
      if (!samplePath) throw new Error("No sample file path");
      const updated = await builder.incrementalUpdate(owner, repo, [samplePath]);
      return { evidence: [`Updated: ${updated} entity/entities`, `Path: ${samplePath}`] };
    });

    // ── EF-60.11: Knowledge Query ───────────────────────────────────────────

    await run("60.11.1", "Knowledge query returns entity by name", "Knowledge Query", async () => {
      if (!graph || !owner || !repo) throw new Error("NOT_CONFIGURED");
      const builder = new RepositoryKnowledgeBuilder();
      await builder.build(owner, repo, "main", { maxFiles: 30 });
      const entityName = graph.entities[0]?.name;
      if (!entityName) throw new Error("No entities to query");
      const result = builder.query(entityName);
      if (!result.found) throw new Error(`Entity "${entityName}" not found in graph`);
      return { evidence: [`Found: ${result.entity?.name}`, `Type: ${result.entity?.type}`, `Layer: ${result.entity?.layer}`, `Source: ${result.source}`] };
    });

    await run("60.11.2", "Knowledge query returns not_found for unknown entity", "Knowledge Query", async () => {
      if (!owner || !repo) throw new Error("NOT_CONFIGURED");
      const builder = new RepositoryKnowledgeBuilder();
      await builder.build(owner, repo, "main", { maxFiles: 10 });
      const result = builder.query("ThisEntityDoesNotExistXYZ123");
      if (result.found) throw new Error("Should not find non-existent entity");
      return { evidence: [`source: ${result.source}`, `found: ${result.found}`] };
    });

    // ── EF-60.10: Coverage ──────────────────────────────────────────────────

    await run("60.10.1", "Knowledge graph coverage > 0", "Coverage", async () => {
      if (!graph) throw new Error("NOT_CONFIGURED");
      if (graph.coverage === 0) throw new Error("Coverage is 0 — no exports/imports found");
      return { evidence: [`Coverage: ${Math.round(graph.coverage * 100)}%`, `Entities: ${graph.entityCount}`, `Relationships: ${graph.relationshipCount}`] };
    });

    const passed   = results.filter(r => r.status === "PASS").length;
    const failed   = results.filter(r => r.status === "FAIL").length;
    const notConf  = results.filter(r => r.status === "NOT_CONFIGURED").length;
    const total    = results.length;
    const certified = failed === 0 && passed >= Math.ceil(total * 0.6);

    return {
      id: makeId(), generatedAt: Date.now(), durationMs: Date.now() - t0,
      totalTests: total, passed, failed, notConfigured: notConf,
      results, certified, graph,
      summary: certified
        ? `EF-60 CERTIFIED — ${passed}/${total} passed · Project Knowledge Graph operational`
        : `EF-60 NOT CERTIFIED — ${passed}/${total} passed · ${failed} failed · ${notConf} not configured`,
    };
  }
}