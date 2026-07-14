/**
 * RKBInstrumented.ts — EF-60.2.1 / 60.2.2 / 60.2.3 / 60.2.4 / 60.2.5 / 60.2.6 / 60.2.7
 * Phase 6.0.2 · MemoryOS · 2026-07-14
 *
 * Instrumented wrapper around RepositoryKnowledgeBuilder that:
 *   - Records every execution step with timing (EF-60.2.1)
 *   - Logs repository tree validation (EF-60.2.2)
 *   - Traces every file fetched and parsed (EF-60.2.3 / 60.2.4 / 60.2.5 / 60.2.6)
 *   - Validates KnowledgeGraphStore persistence (EF-60.2.7)
 *
 * Architectural rule: this file ONLY adds instrumentation.
 * It does NOT modify RepositoryKnowledgeBuilder, SourceCodeParser, or KnowledgeGraphStore.
 */

import { ConnectorInvocationService } from "../cognitive-connector/ConnectorInvocationService";
import { parseSourceFile, detectLayer, detectLanguage } from "./SourceCodeParser";
import { KnowledgeGraphStore } from "./KnowledgeGraphStore";
import { RKBTracer } from "./RKBTrace";
import type { RKBRunTrace, FileTrace } from "./RKBTrace";
import type { ProjectKnowledgeGraph, ArchEntity, ArchRelationship, ModuleNode, ArchitecturalLayer, EntityType } from "./PKBTypes";
import { makePKBId } from "./PKBTypes";

const IGNORE_PATTERNS = [
  "node_modules", "dist/", "build/", "coverage/", ".git/",
  ".cache/", "tmp/", ".next/", "out/", "public/assets/",
];
const SUPPORTED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".json"]);

function shouldIgnore(path: string): boolean {
  return IGNORE_PATTERNS.some(p => path.includes(p));
}
function isSupported(path: string): boolean {
  return SUPPORTED_EXTENSIONS.has("." + path.split(".").pop());
}
function entityKey(name: string, filePath: string): string {
  return `${name}@${filePath}`;
}
function resolveEntityType(parsed: ReturnType<typeof parseSourceFile>): EntityType {
  if (parsed.classes.length > 0)    return "class";
  if (parsed.interfaces.length > 0) return "interface";
  if (parsed.enums.length > 0)      return "enum";
  if (parsed.functions.length > 0)  return "function";
  if (parsed.language === "json")    return "config";
  return "module";
}
function moduleOf(filePath: string): string {
  const parts = filePath.split("/");
  if (parts.length >= 3 && parts[0] === "src") return parts[2] ?? parts[1] ?? "root";
  return parts[1] ?? "root";
}

export class RKBInstrumented {
  private readonly _cis = new ConnectorInvocationService();

  async build(
    owner: string,
    repo: string,
    branch = "main",
    options: { maxFiles?: number; forceRebuild?: boolean } = {},
  ): Promise<{ graph: ProjectKnowledgeGraph; trace: RKBRunTrace }> {
    const run = RKBTracer.begin(owner, repo, branch);
    const maxFiles = options.maxFiles ?? 120;

    // ── Step 1: Repository Discovery ──────────────────────────────────────────
    const s1 = RKBTracer.addStep(run, "Repository Discovery", "Listing repositories via GitHub connector");
    let repoList: any[] = [];
    try {
      const reposInv = await this._cis.invoke("github", "repos.list", { per_page: 20 },
        { originComponent: "RKBInstrumented", reason: "Discover repositories" });
      repoList = (reposInv.result?.data as any)?.items ?? [];
      run.reposFound   = repoList.length;
      run.selectedRepo = `${owner}/${repo}`;
      RKBTracer.finishStep(s1, "ok",
        `Found ${repoList.length} repos. Target: ${owner}/${repo}`,
        { repoCount: repoList.length, target: `${owner}/${repo}` });
    } catch (e) {
      RKBTracer.finishStep(s1, "failed", "Repository list failed", {}, String(e));
      RKBTracer.finish(run);
      return { graph: _emptyGraph(owner, repo, branch), trace: run };
    }

    // ── Step 2: Repository Tree Download ──────────────────────────────────────
    const s2 = RKBTracer.addStep(run, "Repository Tree Download", `Downloading tree for ${owner}/${repo}`);
    let allFiles: Array<{ path: string; type: string }> = [];
    try {
      const treeInv = await this._cis.invoke("github", "repository.tree", { owner, repo },
        { originComponent: "RKBInstrumented", reason: "Download tree" });
      if (treeInv.record.status !== "SUCCESS") {
        RKBTracer.finishStep(s2, "failed",
          `Tree download returned ${treeInv.record.status}`,
          { status: treeInv.record.status, error: treeInv.record.error ?? "unknown" },
          treeInv.record.error ?? `status=${treeInv.record.status}`);
        RKBTracer.finish(run);
        return { graph: _emptyGraph(owner, repo, branch), trace: run };
      }
      allFiles = (treeInv.result?.data as any)?.files ?? [];
      run.treeDownloaded = true;
      run.totalTreeNodes = allFiles.length;
      run.defaultBranch  = branch;
      RKBTracer.finishStep(s2, "ok",
        `Downloaded ${allFiles.length} tree nodes`,
        { totalNodes: allFiles.length });
    } catch (e) {
      RKBTracer.finishStep(s2, "failed", "Tree download threw", {}, String(e));
      RKBTracer.finish(run);
      return { graph: _emptyGraph(owner, repo, branch), trace: run };
    }

    // ── Step 3: File Filter ────────────────────────────────────────────────────
    const s3 = RKBTracer.addStep(run, "File Filter", "Filtering files by extension and ignore patterns");
    const skipReasons: Record<string, number> = {};

    const targetFiles: Array<{ path: string; type: string }> = [];
    for (const f of allFiles) {
      if (f.type !== "blob") {
        skipReasons["not_blob"] = (skipReasons["not_blob"] ?? 0) + 1;
        continue;
      }
      if (shouldIgnore(f.path)) {
        const reason = IGNORE_PATTERNS.find(p => f.path.includes(p)) ?? "ignore_pattern";
        skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
        run.ignoredNodes++;
        continue;
      }
      if (!isSupported(f.path)) {
        skipReasons["unsupported_ext"] = (skipReasons["unsupported_ext"] ?? 0) + 1;
        run.skippedFiles++;
        continue;
      }
      targetFiles.push(f);
    }

    const limited = targetFiles.slice(0, maxFiles);
    run.eligibleFiles = limited.length;
    run.skippedFiles  += targetFiles.length - limited.length; // capped by maxFiles
    if (targetFiles.length > maxFiles) skipReasons["max_files_cap"] = targetFiles.length - maxFiles;
    run.skipReasons = skipReasons;

    RKBTracer.finishStep(s3, run.eligibleFiles > 0 ? "ok" : "failed",
      `${run.eligibleFiles} eligible files (ignored: ${run.ignoredNodes}, skipped: ${run.skippedFiles})`,
      { eligible: run.eligibleFiles, ignored: run.ignoredNodes, skipped: run.skippedFiles, reasons: skipReasons });

    if (run.eligibleFiles === 0) {
      RKBTracer.finish(run);
      return { graph: _emptyGraph(owner, repo, branch), trace: run };
    }

    // ── Step 4: Latest Commit ──────────────────────────────────────────────────
    const s4 = RKBTracer.addStep(run, "Latest Commit", "Fetching latest commit SHA");
    let latestCommit: string | null = null;
    try {
      const cInv = await this._cis.invoke("github", "commits.list", { owner, repo, per_page: 1 },
        { originComponent: "RKBInstrumented", reason: "Latest commit" });
      latestCommit = (cInv.result?.data as any)?.items?.[0]?.sha ?? null;
      RKBTracer.finishStep(s4, "ok", `Commit: ${latestCommit?.slice(0, 8) ?? "unknown"}`, { sha: latestCommit });
    } catch (e) {
      RKBTracer.finishStep(s4, "skipped", "Could not fetch commit (non-fatal)", {}, String(e));
    }

    // ── Step 5: File Fetch & Parse ─────────────────────────────────────────────
    const s5 = RKBTracer.addStep(run, "File Fetch & Parse", `Fetching and parsing ${limited.length} files in batches`);
    const entities: ArchEntity[] = [];
    const entityMap = new Map<string, ArchEntity>();
    const BATCH = 8;
    let filesFetched = 0, filesParsed = 0, fetchFailed = 0, parseEmpty = 0;

    for (let i = 0; i < limited.length; i += BATCH) {
      const batch = limited.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(f => this._cis.invoke("github", "files.get",
          { owner, repo, path: f.path },
          { originComponent: "RKBInstrumented", reason: "Parse file" }))
      );

      for (let j = 0; j < batch.length; j++) {
        const r = results[j];
        const filePath = batch[j].path;
        const lang     = detectLanguage(filePath);
        const ft: FileTrace = {
          path: filePath, language: lang, lines: 0,
          fetchStatus: "ok", parseStatus: "ok", parseDurationMs: 0,
          classes: [], interfaces: [], enums: [], functions: 0, types: 0,
          imports: 0, exports: 0, constants: 0,
          entitiesExtracted: 0, entityName: "", layer: "",
          skipReason: null, error: null,
        };

        if (r.status !== "fulfilled" || r.value.record.status !== "SUCCESS") {
          ft.fetchStatus = "failed";
          ft.parseStatus = "skipped";
          ft.error = r.status === "fulfilled"
            ? (r.value.record.error ?? `status=${r.value.record.status}`)
            : String((r as PromiseRejectedResult).reason);
          ft.skipReason = "fetch_failed";
          fetchFailed++;
          run.fileTraces.push(ft);
          continue;
        }
        filesFetched++;

        const content = (r.value.result?.data as any)?.content ?? "";
        ft.lines = content.split("\n").length;

        if (!content || content.trim().length === 0) {
          ft.fetchStatus = "empty";
          ft.parseStatus = "skipped";
          ft.skipReason  = "empty_content";
          parseEmpty++;
          run.fileTraces.push(ft);
          continue;
        }

        // Parse
        const pt0 = Date.now();
        let parsed: ReturnType<typeof parseSourceFile>;
        try {
          parsed = parseSourceFile(filePath, content);
        } catch (e) {
          ft.parseStatus = "failed";
          ft.error = String(e);
          run.fileTraces.push(ft);
          continue;
        }
        ft.parseDurationMs = Date.now() - pt0;
        ft.classes     = parsed.classes;
        ft.interfaces  = parsed.interfaces;
        ft.enums       = parsed.enums;
        ft.functions   = parsed.functions.length;
        ft.types       = parsed.types.length;
        ft.imports     = parsed.imports.length;
        ft.exports     = parsed.exports.length;
        ft.constants   = parsed.constants.length;
        filesParsed++;

        const layer  = detectLayer(filePath);
        const eType  = resolveEntityType(parsed);
        const primary = [...parsed.classes, ...parsed.interfaces, ...parsed.enums][0]
          ?? filePath.split("/").pop()?.replace(/\.\w+$/, "") ?? "unknown";

        ft.entityName = primary;
        ft.layer      = layer;
        ft.lines      = parsed.lineCount;

        const entity: ArchEntity = {
          id:               makePKBId("ent"),
          name:             primary,
          type:             eType,
          layer,
          filePath,
          description:      parsed.description,
          responsibilities: _buildResponsibilities(parsed, filePath),
          exports:          parsed.exports.slice(0, 10),
          imports:          parsed.imports.map(i => i.source).slice(0, 15),
          dependencies:     [],
          dependents:       [],
          confidence:       0.8,
          repo:             `${owner}/${repo}`,
          branch,
          commit:           latestCommit,
          lineCount:        parsed.lineCount,
          updatedAt:        Date.now(),
        };

        ft.entitiesExtracted = 1;
        entities.push(entity);
        entityMap.set(entityKey(primary, filePath), entity);
        entityMap.set(primary, entity);
        run.fileTraces.push(ft);
      }
    }

    RKBTracer.finishStep(s5, entities.length > 0 ? "ok" : "failed",
      `Fetched: ${filesFetched}, Parsed: ${filesParsed}, Entities: ${entities.length}, FetchFailed: ${fetchFailed}, Empty: ${parseEmpty}`,
      { filesFetched, filesParsed, entities: entities.length, fetchFailed, parseEmpty });

    // ── Step 6: Relationship Builder ──────────────────────────────────────────
    const s6 = RKBTracer.addStep(run, "Relationship Builder", "Building import/export relationships");
    const relationships: ArchRelationship[] = [];
    const relSeen = new Set<string>();
    let relsRejected = 0;

    for (const entity of entities) {
      for (const importSrc of entity.imports) {
        const targetName = importSrc.split("/").pop()?.replace(/\.\w+$/, "") ?? "";
        const target = entityMap.get(targetName);
        if (!target || target.id === entity.id) { relsRejected++; continue; }
        const key = `${entity.id}→${target.id}:imports`;
        if (relSeen.has(key)) { relsRejected++; continue; }
        relSeen.add(key);
        relationships.push({
          id: makePKBId("rel"), fromId: entity.id, toId: target.id,
          fromName: entity.name, toName: target.name, type: "imports",
          filePath: entity.filePath, confidence: 0.85,
        });
      }
      for (const exp of entity.exports) {
        const target = entityMap.get(exp);
        if (target && target.id !== entity.id) {
          const key = `${target.id}→${entity.id}:exports`;
          if (!relSeen.has(key)) {
            relSeen.add(key);
            relationships.push({
              id: makePKBId("rel"), fromId: target.id, toId: entity.id,
              fromName: target.name, toName: entity.name, type: "exports",
              filePath: entity.filePath, confidence: 0.7,
            });
          }
        }
      }
    }

    // Wire dep/dependent IDs
    for (const rel of relationships) {
      const from = entities.find(e => e.id === rel.fromId);
      const to   = entities.find(e => e.id === rel.toId);
      if (from && to) {
        if (!from.dependencies.includes(to.id)) from.dependencies.push(to.id);
        if (!to.dependents.includes(from.id))   to.dependents.push(from.id);
      }
    }

    RKBTracer.finishStep(s6, "ok",
      `${relationships.length} relationships created, ${relsRejected} rejected`,
      { created: relationships.length, rejected: relsRejected });

    // ── Step 7: Module Graph ──────────────────────────────────────────────────
    const s7 = RKBTracer.addStep(run, "Module Graph Builder", "Building module dependency graph");
    const modules = _buildModuleGraph(entities, relationships);
    RKBTracer.finishStep(s7, "ok", `${modules.length} modules built`, { moduleCount: modules.length });

    // ── Step 8: Layer Index ───────────────────────────────────────────────────
    const s8 = RKBTracer.addStep(run, "Layer Index", "Indexing entities by architectural layer");
    const layers: Record<ArchitecturalLayer, string[]> = {
      presentation: [], orchestration: [], connector: [], engine: [],
      utility: [], type_definition: [], test: [], config: [], unknown: [],
    };
    for (const e of entities) layers[e.layer].push(e.id);
    RKBTracer.finishStep(s8, "ok",
      `Layers: ${Object.entries(layers).filter(([,v])=>v.length>0).map(([k,v])=>`${k}:${v.length}`).join(", ")}`,
      Object.fromEntries(Object.entries(layers).map(([k,v])=>[k, v.length])));

    // ── Step 9: Circular Dep + Dead Code ──────────────────────────────────────
    const s9 = RKBTracer.addStep(run, "Quality Analysis", "Detecting circular deps and dead code");
    const circularDeps = _detectCircularDeps(entities);
    const deadCode = entities
      .filter(e => e.dependents.length === 0 && e.layer !== "presentation" && e.layer !== "config" && e.layer !== "test")
      .map(e => e.name).slice(0, 20);
    RKBTracer.finishStep(s9, "ok",
      `Circular: ${circularDeps.length}, DeadCode: ${deadCode.length}`,
      { circularDeps: circularDeps.length, deadCode: deadCode.length });

    // ── Step 10: Graph Assembly ───────────────────────────────────────────────
    const s10 = RKBTracer.addStep(run, "Graph Assembly", "Assembling final ProjectKnowledgeGraph");
    const coverage = entities.length > 0
      ? entities.filter(e => e.exports.length > 0 || e.imports.length > 0).length / entities.length
      : 0;

    const graph: ProjectKnowledgeGraph = {
      graphId:           makePKBId("graph"),
      owner, repo, branch,
      commit:            latestCommit,
      entities,
      relationships,
      modules,
      layers,
      circularDeps,
      deadCode,
      coverage,
      entityCount:       entities.length,
      relationshipCount: relationships.length,
      builtAt:           Date.now(),
      durationMs:        0, // filled below
    };

    RKBTracer.finishStep(s10, entities.length > 0 ? "ok" : "failed",
      `Graph: ${entities.length} entities, ${relationships.length} rels, ${modules.length} modules, coverage=${Math.round(coverage*100)}%`,
      { entities: entities.length, relationships: relationships.length, modules: modules.length, coverage });

    // ── Step 11: KnowledgeGraphStore Persistence ──────────────────────────────
    const s11 = RKBTracer.addStep(run, "KnowledgeGraphStore Persistence", "Persisting graph to KnowledgeGraphStore singleton");
    try {
      graph.durationMs = Date.now() - run.startedAt;
      KnowledgeGraphStore.set(graph);
      const diag = KnowledgeGraphStore.diagnostics();
      run.persistenceStatus = "ok";
      run.persistedAt       = Date.now();
      run.entitiesTotal     = entities.length;
      run.relationshipsTotal = relationships.length;
      run.modulesTotal      = modules.length;
      RKBTracer.finishStep(s11, "ok",
        `Persisted: ${diag.entityCount} entities, ${diag.relationshipCount} rels, ready=${diag.ready}`,
        { entityCount: diag.entityCount, relationshipCount: diag.relationshipCount, moduleCount: diag.moduleCount,
          coverage: diag.coverage, ready: diag.ready, buildDurationMs: graph.durationMs });
    } catch (e) {
      run.persistenceStatus = "failed";
      RKBTracer.finishStep(s11, "failed", "KnowledgeGraphStore.set() threw", {}, String(e));
    }

    RKBTracer.finish(run);
    return { graph, trace: run };
  }
}

// ── Helpers (mirrors RepositoryKnowledgeBuilder helpers) ─────────────────────

function _buildResponsibilities(parsed: ReturnType<typeof parseSourceFile>, filePath: string): string[] {
  const resp: string[] = [];
  if (parsed.classes.length > 0)    resp.push(`Defines: ${parsed.classes.join(", ")}`);
  if (parsed.interfaces.length > 0) resp.push(`Contracts: ${parsed.interfaces.join(", ")}`);
  if (parsed.functions.length > 0)  resp.push(`Functions: ${parsed.functions.slice(0, 4).join(", ")}`);
  if (parsed.imports.length > 0)    resp.push(`Imports ${parsed.imports.length} module(s)`);
  if (filePath.includes("Engine"))  resp.push("Core processing engine");
  if (filePath.includes("Gateway")) resp.push("Entry-point gateway");
  if (filePath.includes("Connector")) resp.push("External system connector");
  return resp.slice(0, 5);
}

function _buildModuleGraph(entities: ArchEntity[], relationships: ArchRelationship[]): ModuleNode[] {
  const moduleMap = new Map<string, ModuleNode>();
  for (const entity of entities) {
    const modName = moduleOf(entity.filePath);
    if (!moduleMap.has(modName)) {
      moduleMap.set(modName, {
        moduleId: makePKBId("mod"), name: modName,
        path: entity.filePath.split("/").slice(0, 3).join("/"),
        layer: entity.layer, entityIds: [], dependsOn: [], usedBy: [],
        fileCount: 0, entityCount: 0,
      });
    }
    const m = moduleMap.get(modName)!;
    m.entityIds.push(entity.id);
    m.entityCount++;
    m.fileCount++;
  }
  for (const rel of relationships) {
    const fromE = entities.find(e => e.id === rel.fromId);
    const toE   = entities.find(e => e.id === rel.toId);
    if (!fromE || !toE) continue;
    const fromMod = moduleOf(fromE.filePath);
    const toMod   = moduleOf(toE.filePath);
    if (fromMod === toMod) continue;
    const fromNode = moduleMap.get(fromMod);
    const toNode   = moduleMap.get(toMod);
    if (!fromNode || !toNode) continue;
    if (!fromNode.dependsOn.includes(toMod)) fromNode.dependsOn.push(toMod);
    if (!toNode.usedBy.includes(fromMod))    toNode.usedBy.push(fromMod);
  }
  return [...moduleMap.values()];
}

function _detectCircularDeps(entities: ArchEntity[]): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack   = new Set<string>();
  const idToName = new Map(entities.map(e => [e.id, e.name]));
  function dfs(id: string, path: string[]): void {
    if (stack.has(id)) {
      const start = path.indexOf(id);
      if (start !== -1) cycles.push(path.slice(start).map(i => idToName.get(i) ?? i));
      return;
    }
    if (visited.has(id)) return;
    visited.add(id); stack.add(id);
    const e = entities.find(x => x.id === id);
    for (const d of e?.dependencies ?? []) dfs(d, [...path, id]);
    stack.delete(id);
  }
  for (const e of entities) dfs(e.id, []);
  return cycles.slice(0, 10);
}

function _emptyGraph(owner: string, repo: string, branch: string): ProjectKnowledgeGraph {
  return {
    graphId: makePKBId("graph"), owner, repo, branch, commit: null,
    entities: [], relationships: [], modules: [],
    layers: { presentation: [], orchestration: [], connector: [], engine: [], utility: [], type_definition: [], test: [], config: [], unknown: [] },
    circularDeps: [], deadCode: [], coverage: 0,
    entityCount: 0, relationshipCount: 0, builtAt: Date.now(), durationMs: 0,
  };
}