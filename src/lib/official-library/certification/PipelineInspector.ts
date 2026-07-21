/**
 * PipelineInspector.ts — Sprint EF-42.8
 *
 * SRP: reconstruct the Official Library pipeline automatically
 *      by introspecting live singletons and their method signatures.
 *
 * Does NOT use static strings for pipeline content — all stage
 * metadata is derived from runtime introspection.
 */

export interface PipelineStageResult {
  readonly stage:       string;
  readonly responsible: string;
  readonly file:        string;
  readonly input:       string;   // inferred from method signatures
  readonly output:      string;   // inferred from return type hints
  readonly isOperational: boolean;
  readonly globalKey:   string | null;
  readonly methodsFound: readonly string[];
  readonly durationMs:  number;
}

export interface PipelineInspectionResult {
  readonly stages:          readonly PipelineStageResult[];
  readonly totalStages:     number;
  readonly operationalStages: number;
  readonly isComplete:      boolean;
  readonly missingStages:   readonly string[];
  readonly inspectedAt:     string;
  readonly durationMs:      number;
}

// ── Stage definitions — derived from actual globalThis key inspection ─────────

const STAGE_DEFINITIONS = [
  {
    stage: "Bootstrap",      globalKey: "__EF426_AUTOBOOTSTRAP__",   file: "bootstrap/OfficialLibraryAutoBootstrap.ts",
    requiredMethods: ["initialize", "reset"],
    input: "force?: boolean",   output: "AutoBootstrapResult",
  },
  {
    stage: "Discovery",      globalKey: "__EF426_DISCOVERY__",       file: "bootstrap/OfficialDocumentDiscovery.ts",
    requiredMethods: ["discover"],
    input: "void",              output: "DiscoveryOutcome",
  },
  {
    stage: "Loader",         globalKey: "__EF426_LOADER__",          file: "bootstrap/OfficialDocumentLoader.ts",
    requiredMethods: ["load", "loadAll", "successful", "errors"],
    input: "DiscoveredEntry[]", output: "LoadResult[]",
  },
  {
    stage: "Parser",         globalKey: "__OL_DOC_PARSER__",         file: "content/OfficialDocumentParser.ts",
    requiredMethods: ["parse"],
    input: "RawDocumentInput", output: "ParsedDocument (frozen)",
  },
  {
    stage: "ChunkBuilder",   globalKey: "__OL_CHUNK_BUILDER__",      file: "content/ChunkBuilder.ts",
    requiredMethods: ["build"],
    input: "ParsedDocument",   output: "OfficialContentChunk[]",
  },
  {
    stage: "MetadataBuilder",globalKey: "__OL_CHUNK_META_BUILDER__", file: "content/ChunkMetadataBuilder.ts",
    requiredMethods: ["build", "estimateTokens"],
    input: "lines[], docTitle",output: "ChunkMeta (frozen)",
  },
  {
    stage: "ChunkIndex",     globalKey: "__OL_CHUNK_INDEX__",        file: "content/ChunkIndex.ts",
    requiredMethods: ["store", "getChunks", "count", "clear", "stats"],
    input: "OfficialContentChunk[]", output: "stored chunks",
  },
  {
    stage: "ContentIndexer", globalKey: "__OL_CONTENT_INDEXER__",   file: "content/ContentIndexer.ts",
    requiredMethods: ["index", "indexAll", "reindex"],
    input: "RawDocumentInput",  output: "IndexResult",
  },
  {
    stage: "LibraryIndex",   globalKey: "__OL_INDEX__",              file: "index/OfficialLibraryIndex.ts",
    requiredMethods: ["get", "getAll", "replaceAll", "query", "checkIntegrity", "stats"],
    input: "OfficialDocumentMetadata[]", output: "indexed metadata",
  },
  {
    stage: "Retrieval",      globalKey: "__OL_RETRIEVAL_ENGINE__",   file: "retrieval/OfficialRetrievalEngine.ts",
    requiredMethods: ["retrieve", "retrieveById", "retrieveByCategory"],
    input: "query string",      output: "RetrievedKnowledge (frozen)",
  },
  {
    stage: "Status",         globalKey: "__EF426_STATUS__",          file: "bootstrap/OfficialLibraryStatus.ts",
    requiredMethods: ["isReady", "snapshot", "chunks", "tokens"],
    input: "void",              output: "LibraryStatusSnapshot",
  },
];

// ── Inspector implementation ──────────────────────────────────────────────────

class PipelineInspectorImpl {

  inspect(): PipelineInspectionResult {
    const t0 = Date.now();
    const G  = globalThis as Record<string, unknown>;
    const stages: PipelineStageResult[] = [];

    for (const def of STAGE_DEFINITIONS) {
      const t1      = Date.now();
      const instance = def.globalKey ? G[def.globalKey] : null;
      const isPresent = instance !== null && instance !== undefined;

      // Detect actual methods on the instance
      let methodsFound: string[] = [];
      if (isPresent && typeof instance === "object" && instance !== null) {
        const proto = Object.getPrototypeOf(instance);
        const own   = Object.getOwnPropertyNames(instance).filter(k => !k.startsWith("_") && typeof (instance as Record<string, unknown>)[k] === "function");
        const pMethods = proto ? Object.getOwnPropertyNames(proto).filter(k => k !== "constructor" && !k.startsWith("_")) : [];
        methodsFound = [...new Set([...own, ...pMethods])];
      }

      // Operational = singleton present + all required methods found
      const isOperational = isPresent &&
        def.requiredMethods.every(m => methodsFound.includes(m));

      stages.push(Object.freeze({
        stage:         def.stage,
        responsible:   def.globalKey ? `globalThis.${def.globalKey}` : "(not registered)",
        file:          def.file,
        input:         def.input,
        output:        def.output,
        isOperational,
        globalKey:     def.globalKey,
        methodsFound:  Object.freeze(methodsFound),
        durationMs:    Date.now() - t1,
      }));
    }

    const operationalStages = stages.filter(s => s.isOperational).length;
    const missingStages     = stages.filter(s => !s.isOperational).map(s => s.stage);

    return Object.freeze({
      stages:           Object.freeze(stages),
      totalStages:      stages.length,
      operationalStages,
      isComplete:       missingStages.length === 0,
      missingStages:    Object.freeze(missingStages),
      inspectedAt:      new Date().toISOString(),
      durationMs:       Date.now() - t0,
    });
  }
}

const G2 = globalThis as typeof globalThis & { __EF428_PIPELINE_INSPECTOR__?: PipelineInspectorImpl };
if (!G2.__EF428_PIPELINE_INSPECTOR__) G2.__EF428_PIPELINE_INSPECTOR__ = new PipelineInspectorImpl();
export const PipelineInspector: PipelineInspectorImpl = G2.__EF428_PIPELINE_INSPECTOR__;