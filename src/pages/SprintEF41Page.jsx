/**
 * SprintEF41Page.jsx — Sprint EF-41
 * Official Library Index Engine — Certification Dashboard
 */

import React, { useState, useCallback } from "react";

// ── Primitivos ────────────────────────────────────────────────────────────────

function Pill({ color, children }) {
  const c = {
    violet: "bg-violet-950/60 text-violet-300 border-violet-700",
    green:  "bg-emerald-950/60 text-emerald-300 border-emerald-700",
    red:    "bg-red-950/60 text-red-300 border-red-800",
    amber:  "bg-amber-950/60 text-amber-300 border-amber-700",
    zinc:   "bg-zinc-800/60 text-zinc-400 border-zinc-600",
    blue:   "bg-blue-950/60 text-blue-300 border-blue-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-bold font-mono ${c[color] ?? c.zinc}`}>
      {children}
    </span>
  );
}

function Metric({ label, value, color = "text-zinc-200" }) {
  return (
    <div className="bg-zinc-800/80 rounded-lg px-3 py-2 text-center">
      <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
      <div className="text-zinc-500 text-xs">{label}</div>
    </div>
  );
}

function TestRow({ r }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`border-b border-zinc-800 last:border-0 ${!r.passed ? "bg-red-950/10" : ""}`}>
      <button
        onClick={() => r.error && setOpen(o => !o)}
        className="w-full flex items-start gap-3 py-2.5 px-3 text-left"
      >
        <Pill color={r.passed ? "green" : "red"}>{r.passed ? "PASS" : "FAIL"}</Pill>
        <span className="text-zinc-400 font-mono text-xs w-5 shrink-0">{r.id}</span>
        <span className={`flex-1 text-sm ${r.passed ? "text-zinc-200" : "text-red-300"}`}>{r.name}</span>
        <span className="text-zinc-600 font-mono text-xs">{r.durationMs}ms</span>
      </button>
      {open && r.error && (
        <div className="px-3 pb-2 ml-14 border-l-2 border-zinc-700">
          <p className="text-xs text-red-400 font-mono">error: {r.error}</p>
        </div>
      )}
    </div>
  );
}

// ── Architecture diagram ──────────────────────────────────────────────────────

const ARCH_PIPELINE = [
  { label: "OfficialLibraryBootstrap",  color: "bg-zinc-700 text-zinc-300 border-zinc-600",      note: "Existing (untouched)" },
  { label: "OfficialDocumentMeta[]",    color: "bg-zinc-800 text-zinc-400 border-zinc-700",       note: "Input from Bootstrap" },
  { label: "OfficialDocumentScanner",   color: "bg-violet-900/60 text-violet-300 border-violet-700", note: "EF-41 — scan + validate + extract" },
  { label: "OfficialDocumentMetadata[]",color: "bg-violet-800/40 text-violet-200 border-violet-600", note: "Rich metadata per doc" },
  { label: "OfficialLibraryIndexer",    color: "bg-blue-900/60 text-blue-300 border-blue-700",    note: "EF-41 — build / update / remove" },
  { label: "OfficialLibraryIndex",      color: "bg-emerald-900/60 text-emerald-300 border-emerald-700", note: "EF-41 — single source of truth" },
  { label: "OfficialLibraryRegistry",   color: "bg-teal-900/60 text-teal-300 border-teal-700",    note: "EF-41 — categories + versions + relations" },
  { label: "Retrieval Engine (EF-42+)", color: "bg-zinc-800 text-zinc-500 border-zinc-700",       note: "Future sprint" },
];

const COMPONENTS = [
  { name: "OfficialDocumentMetadata.ts", role: "Type contract + factory helpers", resp: "Checksum, category derivation, keyword extraction, document type classification" },
  { name: "OfficialLibraryIndex.ts",     role: "Flat in-memory index",            resp: "upsert/remove/query/getRelated/checkIntegrity/stats — single source of truth" },
  { name: "OfficialLibraryRegistry.ts",  role: "Organized cross-reference store", resp: "Category buckets, version timeline, relationship map, registry snapshot" },
  { name: "OfficialDocumentScanner.ts",  role: "Meta extraction layer",           resp: "Validate structure, derive category/type, extract keywords, compute checksum, detect relationships" },
  { name: "OfficialLibraryIndexer.ts",   role: "Indexing lifecycle orchestrator", resp: "rebuildFull, updateIncremental, removeDocument, needsReindex — delegates scan → index → registry" },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SprintEF41Page() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError]     = useState(null);
  const [activeTab, setActiveTab] = useState("tests");

  const handleRun = useCallback(async () => {
    setRunning(true); setResults(null); setError(null);
    try {
      const { runOfficialLibraryIndexTests } = await import("@/lib/official-library/index/officialLibraryIndexTests");
      setResults(await runOfficialLibraryIndexTests());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, []);

  const TABS = ["tests", "architecture", "components", "retrieval-criteria"];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6 font-mono">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div className="bg-gradient-to-r from-violet-950/60 to-blue-950/40 border border-violet-800/50 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 mb-2 text-xs">
            <Pill color="violet">SPRINT EF-41</Pill>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Official Library Index Engine</span>
            <span className="text-zinc-600">·</span>
            <span className="text-emerald-400">Infrastructure Only — No Retrieval</span>
          </div>
          <h1 className="text-xl font-black text-white">Official Library Index Engine</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Scanner · Indexer · Registry · Index · Metadata — 8 testes certificados
          </p>
          <div className="flex flex-wrap gap-2 mt-3 items-center">
            <button
              onClick={handleRun}
              disabled={running}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-sm font-bold transition-colors"
            >
              {running ? "Executando..." : "Executar Testes"}
            </button>
            {results && (
              <Pill color={results.allPassed ? "green" : "red"}>
                {results.allPassed ? `✓ ${results.passed}/${results.total} PASS` : `✗ ${results.failed} FAIL`}
              </Pill>
            )}
          </div>
          {results && (
            <div className="mt-4 grid grid-cols-4 gap-2">
              <Metric label="Passou"  value={results.passed}  color="text-emerald-400" />
              <Metric label="Falhou"  value={results.failed}  color={results.failed > 0 ? "text-red-400" : "text-zinc-500"} />
              <Metric label="Total"   value={results.total}   color="text-zinc-200" />
              <Metric label="Tempo"   value={`${results.durationMs}ms`} color="text-violet-400" />
            </div>
          )}
        </div>

        {/* Loading */}
        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-violet-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Executando 8 cenários de certificação...</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-950/30 border border-red-800 rounded-xl p-4">
            <p className="text-red-300 font-bold text-sm mb-1">Erro durante execução</p>
            <p className="text-red-400 text-xs font-mono">{error}</p>
          </div>
        )}

        {/* Tabs */}
        {!running && (
          <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                  activeTab === t ? "bg-violet-700 text-white" : "text-zinc-400 hover:text-white"
                }`}
              >
                {t.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
              </button>
            ))}
          </div>
        )}

        {/* Tab: Tests */}
        {activeTab === "tests" && !running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
              <span className="text-sm font-bold text-zinc-200">8 Cenários de Certificação</span>
              {results && (
                <Pill color={results.allPassed ? "green" : "red"}>
                  {results.allPassed ? "CERTIFICADO" : `${results.failed} FALHOU`}
                </Pill>
              )}
            </div>

            {results ? (
              results.results.map(r => <TestRow key={r.id} r={r} />)
            ) : (
              <div className="p-8 text-center">
                <p className="text-zinc-500 text-sm">Pressione "Executar Testes" para certificar a EF-41.</p>
                <div className="mt-4 text-xs text-zinc-600 space-y-1 text-left max-w-sm mx-auto">
                  {[
                    "T1 — Indexação inicial",
                    "T2 — Atualização incremental",
                    "T3 — Reconstrução completa",
                    "T4 — Detecção de duplicados",
                    "T5 — Validação de checksum",
                    "T6 — Registro de versões",
                    "T7 — Relacionamentos entre documentos",
                    "T8 — Integridade do índice",
                  ].map(s => <div key={s} className="flex gap-2"><span className="text-zinc-700">—</span><span>{s}</span></div>)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Architecture */}
        {activeTab === "architecture" && !running && (
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-400 text-xs uppercase tracking-wider mb-4">Fluxo de Indexação — EF-41</p>
              <div className="flex flex-col items-center gap-0">
                {ARCH_PIPELINE.map((node, i, arr) => (
                  <React.Fragment key={node.label}>
                    <div className={`px-4 py-2 rounded-lg font-mono text-xs font-bold border w-80 ${node.color}`}>
                      <div>{node.label}</div>
                      <div className="text-xs font-normal opacity-60 mt-0.5">{node.note}</div>
                    </div>
                    {i < arr.length - 1 && <div className="text-zinc-600 text-lg leading-none my-0.5">↓</div>}
                  </React.Fragment>
                ))}
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Contratos de Dados</p>
              {[
                ["OfficialDocumentMeta (existente)", "id, name, version, authority, tags, path, deprecated, supersedes, supersededBy"],
                ["OfficialDocumentMetadata (EF-41)", "id, title, type, category, version, author, createdAt, updatedAt, status, tags, keywords, dependencies, relatedDocuments, checksum, chunkCount, tokenEstimate"],
                ["IndexQuery (EF-41)", "category?, status?, version?, tag?, keyword?, type?, limit?"],
                ["IndexIntegrityReport (EF-41)", "isIntact, totalDocuments, duplicateIds, missingChecksums, orphanRelationships, checkedAt"],
                ["RegistrySnapshot (EF-41)", "totalDocuments, categories[], versionTimeline[], relationshipEdges, builtAt"],
              ].map(([name, fields]) => (
                <div key={name} className="mb-3 border border-zinc-700/40 rounded p-3">
                  <div className="text-violet-300 font-bold text-xs mb-1">{name}</div>
                  <div className="text-zinc-500 text-xs font-mono leading-5">{fields}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab: Components */}
        {activeTab === "components" && !running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800">
              <span className="text-sm font-bold text-zinc-200">5 Componentes — src/lib/official-library/index/</span>
            </div>
            {COMPONENTS.map((c, i) => (
              <div key={i} className="px-4 py-4 border-b border-zinc-800/50 last:border-0">
                <div className="flex items-start gap-3">
                  <Pill color="violet">{c.role}</Pill>
                </div>
                <div className="text-white font-bold text-sm mt-1">{c.name}</div>
                <p className="text-zinc-400 text-xs mt-1">{c.resp}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tab: Retrieval Criteria */}
        {activeTab === "retrieval-criteria" && !running && (
          <div className="space-y-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-emerald-400 font-bold text-xs mb-3 uppercase tracking-wider">Critérios para EF-42 — Official Library Retrieval Engine</p>
              <div className="space-y-3">
                {[
                  {
                    crit: "C1 — Índice disponível via OfficialLibraryIndex singleton",
                    status: "green",
                    desc: "OfficialLibraryIndex é HMR-safe singleton. O Retrieval Engine importa diretamente sem nova instanciação.",
                  },
                  {
                    crit: "C2 — Query por categoria, status, versão, tag, keyword",
                    status: "green",
                    desc: "OfficialLibraryIndex.query(IndexQuery) já implementado e testado.",
                  },
                  {
                    crit: "C3 — Navegação por relacionamentos",
                    status: "green",
                    desc: "OfficialLibraryIndex.getRelated(id) e getReferencedBy(id) disponíveis. Registry.getRelationships(id) expõe mapa direto.",
                  },
                  {
                    crit: "C4 — Acesso a chunks (conteúdo para ranqueamento)",
                    status: "amber",
                    desc: "Os chunks residem no OfficialLibraryIndexer existente (src/lib/official-library/OfficialLibraryIndexer.ts). O Retrieval Engine deverá compor ambos os indexers: EF-41 (metadados) + existente (chunks). Não é responsabilidade da EF-41 mudar isso.",
                  },
                  {
                    crit: "C5 — Integridade verificável antes de cada query",
                    status: "green",
                    desc: "OfficialLibraryIndex.checkIntegrity() retorna IndexIntegrityReport completo. O Retrieval Engine pode chamar antes de servir resultados.",
                  },
                  {
                    crit: "C6 — Atualização incremental sem interrupção",
                    status: "green",
                    desc: "OfficialLibraryIndexerEF41.updateIncremental() atualiza apenas documentos alterados. O índice nunca fica inacessível durante atualizações.",
                  },
                  {
                    crit: "C7 — Nenhuma alteração no Planner, UCME ou Runtime",
                    status: "green",
                    desc: "Confirmado: nenhum arquivo fora de src/lib/official-library/index/ foi modificado.",
                  },
                ].map((item, i) => (
                  <div key={i} className={`border rounded p-3 ${item.status === "green" ? "border-emerald-800/30" : "border-amber-800/40"}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Pill color={item.status}>{item.status === "green" ? "PRONTO" : "PARCIAL"}</Pill>
                      <span className="text-white font-bold text-xs">{item.crit}</span>
                    </div>
                    <p className="text-zinc-400 text-xs">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-violet-950/20 border border-violet-800/40 rounded-xl p-4">
              <p className="text-violet-300 font-bold text-xs mb-2">Nota arquitetural</p>
              <p className="text-zinc-400 text-xs">
                A EF-41 cria a infraestrutura de <strong className="text-white">metadados e índice</strong>.
                A EF-42 (Retrieval Engine) será responsável por implementar ranqueamento semântico,
                pontuação de relevância e integração com o Planner via MemoryService.
                Nenhum componente da EF-41 precisa ser alterado para viabilizar a EF-42.
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}