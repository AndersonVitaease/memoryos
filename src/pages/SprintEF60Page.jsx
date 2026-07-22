/**
 * SprintEF60Page.jsx — Runtime Architecture Introspection Dashboard
 *
 * Exibe a arquitetura descoberta automaticamente via IntrospectionAPI.
 * Nenhuma lista declarada aqui.
 */

import React, { useMemo } from "react";
import { IntrospectionAPI } from "@/lib/architecture-registry/IntrospectionAPI";

const STAGE_COLORS = {
  goal_runtime:"text-orange-400", planning_engine:"text-yellow-400", execution_dispatcher:"text-pink-400",
  episode_engine:"text-sky-400", learning_engine:"text-emerald-400", knowledge_store:"text-teal-400",
  reasoning_engine:"text-violet-400", optimization_engine:"text-amber-400",
  meta_cognition_engine:"text-blue-400", reflection_engine:"text-rose-400",
};

function Badge({ label, color = "zinc" }) {
  const map = { green:"bg-emerald-900/40 text-emerald-300 border-emerald-700", amber:"bg-amber-900/40 text-amber-300 border-amber-700", red:"bg-red-900/40 text-red-300 border-red-700", violet:"bg-violet-900/40 text-violet-300 border-violet-700", sky:"bg-sky-900/40 text-sky-300 border-sky-700", teal:"bg-teal-900/40 text-teal-300 border-teal-700", gold:"bg-yellow-900/40 text-yellow-300 border-yellow-700", zinc:"bg-zinc-800 text-zinc-400 border-zinc-700" };
  return <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${map[color] ?? map.zinc}`}>{label}</span>;
}

export default function SprintEF60Page() {
  const intro           = useMemo(() => IntrospectionAPI.discover(), []);
  const pipeline        = useMemo(() => IntrospectionAPI.getPipeline(), []);
  const ownershipMatrix = useMemo(() => IntrospectionAPI.getOwnershipMatrix(), []);
  const contracts       = useMemo(() => IntrospectionAPI.getContractRegistry(), []);
  const depGraph        = useMemo(() => IntrospectionAPI.getDependencyGraph(), []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="bg-gradient-to-r from-sky-950/50 to-violet-950/30 border border-sky-800/40 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 mb-3">
            <Badge label="EF-60" color="gold" />
            <Badge label="RUNTIME ARCHITECTURE INTROSPECTION" color="sky" />
            <Badge label="Single Source of Truth" color="violet" />
            <Badge label={`${intro.summary.pipelineStages} stages auto-discovered`} color="teal" />
            <Badge label={intro.summary.illegalDeps === 0 ? "NO VIOLATIONS" : `${intro.summary.illegalDeps} ILLEGAL DEPS`} color={intro.summary.illegalDeps === 0 ? "green" : "red"} />
          </div>
          <h1 className="text-xl font-bold text-white mb-1">EF-60 — Architecture Introspection API</h1>
          <p className="text-zinc-400 text-sm">
            Toda informacao arquitetural e descoberta automaticamente do ArchitectureRegistry.
            Nenhuma lista declarada neste dashboard.
            Descoberto em: <span className="font-mono text-zinc-300">{intro.summary.discoveredAt}</span>
          </p>
        </div>

        {/* Summary Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { l:"Engines",          v: intro.summary.totalEngines,         c:"violet" },
            { l:"Pipeline Stages",  v: intro.summary.pipelineStages,       c:"sky"    },
            { l:"Ctx Fields",       v: intro.summary.ctxFieldsExpected,    c:"teal"   },
            { l:"Dep. Edges",       v: intro.snapshot.dependencyGraph.length, c:"amber" },
            { l:"Illegal Deps",     v: intro.summary.illegalDeps,          c: intro.summary.illegalDeps === 0 ? "green" : "red" },
            { l:"Circular Deps",    v: intro.summary.circularDeps,         c: intro.summary.circularDeps === 0 ? "green" : "red" },
          ].map(({ l, v, c }) => (
            <div key={l} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
              <div className="text-zinc-500 text-xs">{l}</div>
              <div className={`font-mono font-bold text-lg mt-0.5 ${c === "red" ? "text-red-300" : c === "green" ? "text-emerald-300" : c === "violet" ? "text-violet-300" : c === "sky" ? "text-sky-300" : c === "teal" ? "text-teal-300" : "text-amber-300"}`}>{v}</div>
            </div>
          ))}
        </div>

        {/* Pipeline Registry */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <p className="text-zinc-300 text-sm font-bold mb-4">Pipeline Registry — {pipeline.length} stages (auto-descobertos)</p>
          <div className="flex flex-col items-start gap-0 w-full">
            {pipeline.map((engine, i) => {
              const col = STAGE_COLORS[engine.id] ?? "text-zinc-400";
              return (
                <React.Fragment key={engine.id}>
                  <div className="border border-zinc-700/30 bg-zinc-800/20 rounded-lg p-3 w-full">
                    <div className="flex items-center gap-3 flex-wrap mb-1">
                      <span className={`font-mono text-sm font-bold ${col}`}>{engine.name}</span>
                      <Badge label={`v${engine.version}`} color="zinc" />
                      <Badge label={`stage:${engine.pipelineStage}`} color="zinc" />
                      <span className="text-zinc-600 text-xs ml-auto">{engine.owner}</span>
                    </div>
                    <p className="text-zinc-500 text-xs mb-1">{engine.responsibility}</p>
                    <div className="flex gap-4 text-xs font-mono flex-wrap">
                      <span className="text-zinc-700">in: <span className="text-zinc-500">{engine.contract.input.slice(0,50)}</span></span>
                      <span className="text-zinc-700">out: <span className="text-zinc-500">{engine.contract.output.slice(0,40)}</span></span>
                    </div>
                    <div className="text-xs font-mono text-zinc-700 mt-0.5">ctx→ {engine.contract.ctxFields.join(", ") || "—"}</div>
                  </div>
                  {i < pipeline.length - 1 && <div className="text-zinc-700 leading-none ml-6 my-0.5">↓</div>}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Ownership Matrix */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <p className="text-zinc-300 text-sm font-bold mb-3">Ownership Registry — {ownershipMatrix.length} engines</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800">
                  {["Engine","Cria","Modifica","Consome","Publica","Persiste"].map(h => <td key={h} className="py-1 pr-3 font-bold">{h}</td>)}
                </tr>
              </thead>
              <tbody>
                {ownershipMatrix.map(row => (
                  <tr key={row.engineId} className="border-b border-zinc-800/30 hover:bg-zinc-800/20">
                    <td className={`py-1.5 pr-3 font-bold ${STAGE_COLORS[row.engineId] ?? "text-zinc-300"}`}>{row.engine}</td>
                    <td className="py-1.5 pr-3 text-emerald-400">{row.creates.join(", ") || "—"}</td>
                    <td className="py-1.5 pr-3 text-amber-400">{row.modifies.join(", ") || "—"}</td>
                    <td className="py-1.5 pr-3 text-sky-400">{row.consumes.slice(0,2).join(", ")}{row.consumes.length > 2 ? "..." : ""}</td>
                    <td className="py-1.5 pr-3 text-teal-400">{row.publishes.join(", ") || "—"}</td>
                    <td className="py-1.5 pr-3 text-rose-400">{row.persists.join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Contract Registry */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <p className="text-zinc-300 text-sm font-bold mb-3">Contract Registry — {contracts.length} contratos</p>
          {contracts.map(({ engineId, name, contract }) => {
            const col = STAGE_COLORS[engineId] ?? "text-zinc-400";
            return (
              <div key={engineId} className="mb-3 pb-3 border-b border-zinc-800/30 last:border-0">
                <div className="flex gap-2 flex-wrap mb-1">
                  <span className={`font-mono text-sm font-bold ${col}`}>{name}</span>
                  <Badge label={contract.execution} color="zinc" />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono text-zinc-500">
                  <div>in: <span className="text-zinc-300">{contract.input}</span></div>
                  <div>out: <span className="text-zinc-300">{contract.output}</span></div>
                  <div>ctx→ <span className="text-teal-400">{contract.ctxFields.join(", ") || "—"}</span></div>
                  <div>ctx← <span className="text-sky-400">{contract.ctxReads?.join(", ") || "—"}</span></div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Dependency Graph */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <p className="text-zinc-300 text-sm font-bold mb-3">Dependency Registry — {depGraph.length} edges</p>
          {depGraph.map((edge, i) => (
            <div key={i} className="flex items-center gap-2 mb-1.5 text-xs">
              <Badge label={edge.legal ? "LEGAL" : "ILLEGAL"} color={edge.legal ? "green" : "red"} />
              <span className={`font-mono ${STAGE_COLORS[edge.from] ?? "text-zinc-400"}`}>{edge.from}</span>
              <span className="text-zinc-600">—{edge.type}→</span>
              <span className={`font-mono ${STAGE_COLORS[edge.to] ?? "text-zinc-500"}`}>{edge.to}</span>
            </div>
          ))}
        </div>

        {/* Introspection API surface */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <p className="text-zinc-300 text-sm font-bold mb-3">Introspection API — Endpoints Oficiais</p>
          {[
            { method:"discover()",          returns:"IntrospectionResult",  desc:"Full architecture discovery + violation detection" },
            { method:"getPipeline()",        returns:"EngineMetadata[]",     desc:"Pipeline ordenada auto-descoberta" },
            { method:"getOwnershipMatrix()", returns:"OwnershipRow[]",       desc:"Matrix de ownership dos engines" },
            { method:"getContractRegistry()",returns:"ContractRow[]",        desc:"Todos os contratos de entrada/saida" },
            { method:"getDependencyGraph()", returns:"DependencyEdge[]",     desc:"Grafo de dependencias com classificacao legal/illegal" },
            { method:"validateContext(ctx)", returns:"ValidationResult",     desc:"Valida ExecutionContext contra contratos declarados" },
            { method:"validateRun(run)",     returns:"ViolationReport[]",    desc:"Valida um run completo contra a pipeline descoberta" },
          ].map(({ method, returns, desc }) => (
            <div key={method} className="flex items-start gap-3 mb-2 text-xs">
              <span className="text-emerald-400 font-mono w-36 shrink-0">{method}</span>
              <span className="text-violet-300 font-mono w-32 shrink-0">→ {returns}</span>
              <span className="text-zinc-500">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}