/**
 * RepositoryKnowledgeBuilder.ts — EF-60.1 / 60.3 / 60.4 / 60.5 / 60.6 / 60.7 / 60.8 / 60.9
 * Phase 6.0.0 · MemoryOS · 2026-07-14
 *
 * Traverses a GitHub repository and builds the full Project Knowledge Graph:
 * entities, relationships, module graph, dependency graph, layer classification.
 *
 * Architectural restrictions:
 *   - NEVER modifies Connector Runtime, GitHub Connector, CCG, CTP, Composer
 *   - Read-only: only fetches files, never writes
 *   - Pure addition: populates the knowledge layer only
 */

import type {
  ProjectKnowledgeGraph, ArchEntity, ArchRelationship, ModuleNode,
  ArchitecturalLayer, EntityType, KnowledgeQueryResult,
} from "./PKBTypes";
import { makePKBId } from "./PKBTypes";
import { parseSourceFile, detectLayer, detectLanguage } from "./SourceCodeParser";
import { ConnectorInvocationService } from "../cognitive-connector/ConnectorInvocationService";

// ── Files to ignore (EF-60.1) ─────────────────────────────────────────────────

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

// ── Entity ID stable hash ─────────────────────────────────────────────────────

function entityKey(name: string, filePath: string): string {
  return `${name}@${filePath}`;
}

// ── Layer → Entity Type mapping ───────────────────────────────────────────────

function resolveEntityType(parsed: ReturnType<typeof parseSourceFile>): EntityType {
  if (parsed.classes.length > 0)    return "class";
  if (parsed.interfaces.length > 0) return "interface";
  if (parsed.enums.length > 0)      return "enum";
  if (parsed.functions.length > 0)  return "function";
  if (parsed.language === "json")    return "config";
  return "module";
}

// ── Module path extractor ─────────────────────────────────────────────────────

function moduleOf(filePath: string): string {
  // src/lib/cognitive-task-planner/CTPTypes.ts → cognitive-task-planner
  const parts = filePath.split("/");
  if (parts.length >= 3 && parts[0] === "src") {
    return parts[2] ?? parts[1] ?? "root";
  }
  return parts[1] ?? "root";
}

// ── RepositoryKnowledgeBuilder ────────────────────────────────────────────────

export class RepositoryKnowledgeBuilder {
  private readonly _cis = new ConnectorInvocationService();
  private _graph: ProjectKnowledgeGraph | null = null;
  private _graphBuiltAt = 0;

  // ── Build full graph (EF-60.1 to 60.7) ───────────────────────────────────

  async build(
    owner: string,
    repo:  string,
    branch = "main",
    options: { maxFiles?: number; forceRebuild?: boolean } = {},
  ): Promise<ProjectKnowledgeGraph> {
    const t0 = Date.now();

    // EF-60.9: Skip rebuild if < 10 minutes old and forceRebuild not set
    if (this._graph && !options.forceRebuild && Date.now() - this._graphBuiltAt < 10 * 60 * 1000) {
      return this._graph;
    }

    const maxFiles = options.maxFiles ?? 120;

    // 1. Fetch repository tree
    const treeInv = await this._cis.invoke("github", "repository.tree", { owner, repo },
      { originComponent: "RepositoryKnowledgeBuilder", reason: "Build knowledge graph" });

    const allFiles: Array<{ path: string; type: string }> =
      treeInv.record.status === "SUCCESS"
        ? ((treeInv.result?.data as any)?.files ?? [])
        : [];

    console.log(`[RKB] STAGE repository.tree — allFiles.length = ${allFiles.length}`);
    allFiles.slice(0, 10).forEach((f, i) => {
      console.log(`[RKB] allFiles[${i}] = { path: "${f.path}", type: ${JSON.stringify((f as any).type)}, ext: ${JSON.stringify((f as any).ext)} }`);
    });

    // 2. Filter to supported, non-ignored files
    const targetFiles = allFiles
      .filter(f => {
        const passesType    = f.type === "blob";
        const passesSupport = isSupported(f.path);
        const passesIgnore  = !shouldIgnore(f.path);
        const final         = passesType && passesSupport && passesIgnore;
        if (!final) {
          console.log(`[RKB] FILTER REJECT "${f.path}" — type=${JSON.stringify(f.type)} passesType=${passesType} supported=${passesSupport} ignored=${!passesIgnore}`);
        }
        return final;
      })
      .slice(0, maxFiles);

    console.log(`[RKB] STAGE eligible files — targetFiles.length = ${targetFiles.length}`);

    // 3. Fetch latest commit for metadata
    const commitsInv = await this._cis.invoke("github", "commits.list", { owner, repo, per_page: 1 },
      { originComponent: "RepositoryKnowledgeBuilder", reason: "Get latest commit" });
    const latestCommit = (commitsInv.result?.data as any)?.items?.[0]?.sha ?? null;

    // 4. Fetch & parse files in batches of 8
    const entities: ArchEntity[]      = [];
    const entityMap = new Map<string, ArchEntity>();
    const BATCH = 8;

    let _downloadedCount = 0;
    let _parsedCount = 0;

    for (let i = 0; i < targetFiles.length; i += BATCH) {
      const batch = targetFiles.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(f => this._cis.invoke("github", "files.get",
          { owner, repo, path: f.path },
          { originComponent: "RepositoryKnowledgeBuilder", reason: "Parse file" }))
      );

      for (let j = 0; j < batch.length; j++) {
        const r = results[j];
        const filePath = batch[j].path;
        if (r.status !== "fulfilled" || r.value.record.status !== "SUCCESS") {
          const reason = r.status !== "fulfilled" ? `rejected: ${(r as any).reason}` : `status=${r.value.record.status}`;
          console.warn(`[RKB] files.get FAILED "${filePath}" — ${reason}`);
          continue;
        }

        _downloadedCount++;

        const rawData  = r.value.result?.data as any;
        const content  = rawData?.content ?? "";
        if (!content || content.trim().length === 0) {
          console.warn(`[RKB] SKIP "${filePath}" — empty content (decoded=${rawData?.decoded}, encoding=${rawData?.encoding}, size=${rawData?.size})`);
          continue;
        }

        const parsed   = parseSourceFile(filePath, content);
        _parsedCount++;
        console.log(`[RKB] FILE "${filePath}" contentLength=${content.length} classes=${JSON.stringify(parsed.classes)} interfaces=${JSON.stringify(parsed.interfaces)} enums=${JSON.stringify(parsed.enums)} functions=${parsed.functions.length} types=${parsed.types.length} constants=${parsed.constants.length} imports=${parsed.imports.length} exports=${JSON.stringify(parsed.exports)}`);

        const layer    = detectLayer(filePath);
        const eType    = resolveEntityType(parsed);
        const primary  = [...parsed.classes, ...parsed.interfaces, ...parsed.enums][0] ?? filePath.split("/").pop()?.replace(/\.\w+$/, "") ?? "unknown";

        // One entity per file (the primary export / class)
        const entity: ArchEntity = {
          id:              makePKBId("ent"),
          name:            primary,
          type:            eType,
          layer,
          filePath,
          description:     parsed.description,
          responsibilities: buildResponsibilities(parsed, filePath),
          exports:         parsed.exports.slice(0, 10),
          imports:         parsed.imports.map(i => i.source).slice(0, 15),
          dependencies:    [],   // wired in relationship pass
          dependents:      [],
          confidence:      0.8,
          repo:            `${owner}/${repo}`,
          branch,
          commit:          latestCommit,
          lineCount:       parsed.lineCount,
          updatedAt:       Date.now(),
        };

        entities.push(entity);
        entityMap.set(entityKey(primary, filePath), entity);
        // Also index by short name for cross-reference
        entityMap.set(primary, entity);
      }
    }

    console.log(`[RKB] STAGE downloaded — _downloadedCount = ${_downloadedCount}`);
    console.log(`[RKB] STAGE parsed — _parsedCount = ${_parsedCount}`);
    console.log(`[RKB] STAGE entity extraction — entities.length = ${entities.length}`);

    // 5. Build relationships (EF-60.4)
    const relationships: ArchRelationship[] = buildRelationships(entities, targetFiles, entityMap);

    // 6. Wire dependency/dependent IDs
    for (const rel of relationships) {
      const from = entities.find(e => e.id === rel.fromId);
      const to   = entities.find(e => e.id === rel.toId);
      if (from && to) {
        if (!from.dependencies.includes(to.id))  from.dependencies.push(to.id);
        if (!to.dependents.includes(from.id))    to.dependents.push(from.id);
      }
    }

    console.log(`[RKB] STAGE relationships — relationships.length = ${relationships.length}`);

    // 7. Build module graph (EF-60.5)
    const modules = buildModuleGraph(entities, relationships);

    // 8. Layer index
    const layers: Record<ArchitecturalLayer, string[]> = {
      presentation: [], orchestration: [], connector: [], engine: [],
      utility: [], type_definition: [], test: [], config: [], unknown: [],
    };
    for (const e of entities) layers[e.layer].push(e.id);

    // 9. Circular dependency detection (EF-60.6)
    const circularDeps = detectCircularDeps(entities);

    // 10. Dead code candidates
    const deadCode = entities
      .filter(e => e.dependents.length === 0 && e.layer !== "presentation" && e.layer !== "config" && e.layer !== "test")
      .map(e => e.name)
      .slice(0, 20);

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
      durationMs:        Date.now() - t0,
    };

    console.log(`[RKB] STAGE modules — modules.length = ${modules.length}`);
    console.log(`[RKB] PRE-SET graph.entities.length = ${graph.entities.length}`);
    console.log(`[RKB] PRE-SET graph.relationships.length = ${graph.relationships.length}`);
    console.log(`[RKB] PRE-SET graph.modules.length = ${graph.modules.length}`);

    this._graph = graph;
    this._graphBuiltAt = Date.now();
    return graph;
  }

  // ── EF-60.11: Knowledge Query ─────────────────────────────────────────────

  query(entityName: string): KnowledgeQueryResult {
    if (!this._graph) {
      return { found: false, entityName, entity: null, dependents: [], dependencies: [], relationships: [], source: "not_found", confidence: 0 };
    }
    const entity = this._graph.entities.find(e =>
      e.name.toLowerCase() === entityName.toLowerCase() ||
      e.filePath.toLowerCase().includes(entityName.toLowerCase())
    );
    if (!entity) {
      return { found: false, entityName, entity: null, dependents: [], dependencies: [], relationships: [], source: "not_found", confidence: 0 };
    }

    const rels  = this._graph.relationships.filter(r => r.fromId === entity.id || r.toId === entity.id);
    const deps  = entity.dependencies.map(id => this._graph!.entities.find(e => e.id === id)).filter(Boolean) as ArchEntity[];
    const depts = entity.dependents.map(id => this._graph!.entities.find(e => e.id === id)).filter(Boolean) as ArchEntity[];

    return {
      found: true, entityName, entity,
      dependents: depts, dependencies: deps, relationships: rels,
      source: "knowledge_graph", confidence: entity.confidence,
    };
  }

  getGraph(): ProjectKnowledgeGraph | null { return this._graph; }
  isReady(): boolean { return this._graph !== null; }

  // ── EF-60.9: Incremental update ───────────────────────────────────────────

  async incrementalUpdate(owner: string, repo: string, changedPaths: string[]): Promise<number> {
    if (!this._graph) return 0;
    let updated = 0;
    for (const path of changedPaths) {
      const inv = await this._cis.invoke("github", "files.get", { owner, repo, path },
        { originComponent: "RepositoryKnowledgeBuilder", reason: "Incremental update" });
      if (inv.record.status !== "SUCCESS") continue;
      const content = (inv.result?.data as any)?.content ?? "";
      if (!content) continue;

      const parsed = parseSourceFile(path, content);
      const primary = [...parsed.classes, ...parsed.interfaces][0] ?? path.split("/").pop()?.replace(/\.\w+$/, "") ?? "unknown";

      const existing = this._graph.entities.find(e => e.filePath === path);
      if (existing) {
        existing.exports   = parsed.exports.slice(0, 10);
        existing.imports   = parsed.imports.map(i => i.source).slice(0, 15);
        existing.lineCount = parsed.lineCount;
        existing.updatedAt = Date.now();
        updated++;
      }
    }
    return updated;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildResponsibilities(parsed: ReturnType<typeof parseSourceFile>, filePath: string): string[] {
  const resp: string[] = [];
  if (parsed.classes.length > 0)     resp.push(`Defines: ${parsed.classes.join(", ")}`);
  if (parsed.interfaces.length > 0)  resp.push(`Contracts: ${parsed.interfaces.join(", ")}`);
  if (parsed.functions.length > 0)   resp.push(`Functions: ${parsed.functions.slice(0, 4).join(", ")}`);
  if (parsed.imports.length > 0)     resp.push(`Imports ${parsed.imports.length} module(s)`);
  if (filePath.includes("Engine"))   resp.push("Core processing engine");
  if (filePath.includes("Gateway"))  resp.push("Entry-point gateway");
  if (filePath.includes("Connector"))resp.push("External system connector");
  return resp.slice(0, 5);
}

function buildRelationships(
  entities: ArchEntity[],
  files: Array<{ path: string }>,
  entityMap: Map<string, ArchEntity>,
): ArchRelationship[] {
  const rels: ArchRelationship[] = [];
  const seen = new Set<string>();

  for (const entity of entities) {
    // Parse imports from entity's import list (source paths)
    for (const importSrc of entity.imports) {
      // Resolve relative import to a target entity
      const targetName = importSrc.split("/").pop()?.replace(/\.\w+$/, "") ?? "";
      const target     = entityMap.get(targetName);
      if (!target || target.id === entity.id) continue;
      const key = `${entity.id}→${target.id}:imports`;
      if (seen.has(key)) continue;
      seen.add(key);
      rels.push({
        id:         makePKBId("rel"),
        fromId:     entity.id,
        toId:       target.id,
        fromName:   entity.name,
        toName:     target.name,
        type:       "imports",
        filePath:   entity.filePath,
        confidence: 0.85,
      });
    }

    // extends / implements (from class names in description)
    for (const exp of entity.exports) {
      const target = entityMap.get(exp);
      if (target && target.id !== entity.id) {
        const key = `${target.id}→${entity.id}:exports`;
        if (!seen.has(key)) {
          seen.add(key);
          rels.push({
            id:         makePKBId("rel"),
            fromId:     target.id,
            toId:       entity.id,
            fromName:   target.name,
            toName:     entity.name,
            type:       "exports",
            filePath:   entity.filePath,
            confidence: 0.7,
          });
        }
      }
    }
  }

  return rels;
}

function buildModuleGraph(entities: ArchEntity[], relationships: ArchRelationship[]): ModuleNode[] {
  const moduleMap = new Map<string, ModuleNode>();

  for (const entity of entities) {
    const modName = moduleOf(entity.filePath);
    if (!moduleMap.has(modName)) {
      moduleMap.set(modName, {
        moduleId:    makePKBId("mod"),
        name:        modName,
        path:        entity.filePath.split("/").slice(0, 3).join("/"),
        layer:       entity.layer,
        entityIds:   [],
        dependsOn:   [],
        usedBy:      [],
        fileCount:   0,
        entityCount: 0,
      });
    }
    const m = moduleMap.get(modName)!;
    m.entityIds.push(entity.id);
    m.entityCount++;
    m.fileCount++;
  }

  // Wire module dependencies
  for (const rel of relationships) {
    const fromEntity = entities.find(e => e.id === rel.fromId);
    const toEntity   = entities.find(e => e.id === rel.toId);
    if (!fromEntity || !toEntity) continue;
    const fromMod = moduleOf(fromEntity.filePath);
    const toMod   = moduleOf(toEntity.filePath);
    if (fromMod === toMod) continue;
    const fromNode = moduleMap.get(fromMod);
    const toNode   = moduleMap.get(toMod);
    if (!fromNode || !toNode) continue;
    if (!fromNode.dependsOn.includes(toMod)) fromNode.dependsOn.push(toMod);
    if (!toNode.usedBy.includes(fromMod))    toNode.usedBy.push(fromMod);
  }

  return [...moduleMap.values()];
}

function detectCircularDeps(entities: ArchEntity[]): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack   = new Set<string>();
  const idToName = new Map(entities.map(e => [e.id, e.name]));

  function dfs(entityId: string, path: string[]): void {
    if (stack.has(entityId)) {
      const cycleStart = path.indexOf(entityId);
      if (cycleStart !== -1) cycles.push(path.slice(cycleStart).map(id => idToName.get(id) ?? id));
      return;
    }
    if (visited.has(entityId)) return;
    visited.add(entityId);
    stack.add(entityId);
    const entity = entities.find(e => e.id === entityId);
    for (const depId of entity?.dependencies ?? []) {
      dfs(depId, [...path, entityId]);
    }
    stack.delete(entityId);
  }

  for (const entity of entities) dfs(entity.id, []);
  return cycles.slice(0, 10);
}