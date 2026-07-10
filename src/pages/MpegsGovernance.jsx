import React, { useState } from "react";
import { GitBranch, FileText, Tag, Package, CheckCircle, Clock, XCircle, ChevronDown, ChevronRight, BarChart2, ArrowRight } from "lucide-react";
import { RFC_REGISTRY, ADR_REGISTRY, RELEASE_REGISTRY, REGISTRY_STATS, FOUNDATION_V1 } from "@/lib/mpegs/registries";

// ─── Constants ────────────────────────────────────────────────────────────

const RFC_STATUS_STYLE = {
  Implemented:     "bg-green-900 text-green-400",
  Approved:        "bg-blue-900 text-blue-400",
  "Under Discussion": "bg-yellow-900 text-yellow-400",
  Draft:           "bg-zinc-800 text-zinc-400",
  Rejected:        "bg-red-900 text-red-400",
  Withdrawn:       "bg-zinc-800 text-zinc-500",
};

const ADR_STATUS_STYLE = {
  Accepted:   "bg-green-900 text-green-400",
  Proposed:   "bg-yellow-900 text-yellow-400",
  Deprecated: "bg-zinc-800 text-zinc-500",
  Superseded: "bg-orange-900 text-orange-400",
};

const STAGE_STYLE = {
  "Release Candidate": "bg-violet-900 text-violet-300",
  Beta:                "bg-blue-900 text-blue-300",
  "Developer Preview": "bg-yellow-900 text-yellow-300",
  Alpha:               "bg-zinc-800 text-zinc-400",
  Stable:              "bg-green-900 text-green-400",
  LTS:                 "bg-emerald-900 text-emerald-400",
};

const IMPACT_STYLE = {
  CRITICAL: "text-red-400",
  HIGH:     "text-orange-400",
  MEDIUM:   "text-yellow-400",
  LOW:      "text-green-400",
};

const TABS = ["Visão Geral", "RFCs", "ADRs", "Releases"];

// ─── Sub-components ───────────────────────────────────────────────────────

function StatCard({ label, value, color = "violet" }) {
  const colors = { violet: "text-violet-400", green: "text-green-400", blue: "text-blue-400", yellow: "text-yellow-400" };
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
      <div className={`text-3xl font-bold ${colors[color]}`}>{value}</div>
      <div className="text-zinc-400 text-xs mt-1">{label}</div>
    </div>
  );
}

function RfcCard({ rfc }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800 transition-colors text-left">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-zinc-500 font-mono text-xs shrink-0">{rfc.id}</span>
          <span className="text-zinc-200 text-sm font-medium truncate">{rfc.title}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RFC_STATUS_STYLE[rfc.status] ?? "bg-zinc-800 text-zinc-400"}`}>{rfc.status}</span>
          <span className={`text-xs font-bold ${IMPACT_STYLE[rfc.impact] ?? "text-zinc-400"}`}>{rfc.impact}</span>
          {open ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-zinc-800 px-4 py-3 space-y-3 text-sm">
          <div className="flex gap-6 text-xs text-zinc-500">
            <span>Autor: <span className="text-zinc-300">{rfc.author}</span></span>
            <span>Data: <span className="text-zinc-300">{rfc.date}</span></span>
            <span>Categoria: <span className="text-zinc-300">{rfc.category}</span></span>
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-1">Motivação</p>
            <p className="text-zinc-300 text-sm">{rfc.motivation}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-1">Decisão</p>
            <p className="text-zinc-300 text-sm">{rfc.decision}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {rfc.components.map(c => (
              <span key={c} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono">{c}</span>
            ))}
          </div>
          {rfc.adrs.length > 0 && (
            <div className="text-xs text-zinc-500">ADRs: {rfc.adrs.map(a => <span key={a} className="text-violet-400 ml-1">{a}</span>)}</div>
          )}
        </div>
      )}
    </div>
  );
}

function AdrCard({ adr }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800 transition-colors text-left">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-zinc-500 font-mono text-xs shrink-0">{adr.id}</span>
          <span className="text-zinc-200 text-sm font-medium truncate">{adr.title}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ADR_STATUS_STYLE[adr.status] ?? "bg-zinc-800 text-zinc-400"}`}>{adr.status}</span>
          {open ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-zinc-800 px-4 py-3 space-y-3 text-sm">
          <div className="flex gap-6 text-xs text-zinc-500">
            <span>Autor: <span className="text-zinc-300">{adr.author}</span></span>
            <span>Data: <span className="text-zinc-300">{adr.date}</span></span>
            {adr.rfc && <span>RFC: <span className="text-violet-400">{adr.rfc}</span></span>}
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-1">Decisão</p>
            <p className="text-zinc-300 text-sm">{adr.decision}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-1">Consequências</p>
            <ul className="space-y-0.5">
              {adr.consequences.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-zinc-400 text-xs">
                  <CheckCircle className="w-3 h-3 text-green-500 mt-0.5 shrink-0" />{c}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap gap-2">
            <div>
              <p className="text-xs text-zinc-500 mb-1">Docs</p>
              <div className="flex gap-1 flex-wrap">{adr.docsAffected.map(d => <span key={d} className="text-xs bg-blue-950 text-blue-300 px-2 py-0.5 rounded font-mono">{d}</span>)}</div>
            </div>
            <div className="ml-4">
              <p className="text-xs text-zinc-500 mb-1">Componentes</p>
              <div className="flex gap-1 flex-wrap">{adr.componentsAffected.map(c => <span key={c} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono">{c}</span>)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReleaseCard({ release }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800 transition-colors text-left">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-violet-400 font-mono text-sm font-bold shrink-0">{release.version}</span>
          <span className="text-zinc-200 text-sm truncate">{release.title}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STAGE_STYLE[release.stage] ?? "bg-zinc-800 text-zinc-400"}`}>{release.stage}</span>
          <span className="text-zinc-600 text-xs">{release.date}</span>
          {open ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-zinc-800 px-4 py-3 space-y-3">
          <ul className="space-y-1">
            {release.highlights.map((h, i) => (
              <li key={i} className="flex items-start gap-2 text-zinc-300 text-sm">
                <ArrowRight className="w-3 h-3 text-violet-400 mt-1 shrink-0" />{h}
              </li>
            ))}
          </ul>
          {release.breaking.length > 0 && (
            <div>
              <p className="text-xs text-red-400 font-medium mb-1">Breaking Changes</p>
              {release.breaking.map((b, i) => <p key={i} className="text-xs text-red-300">{b}</p>)}
            </div>
          )}
          {release.rfcs.length > 0 && (
            <div className="text-xs text-zinc-500">RFCs: {release.rfcs.map(r => <span key={r} className="text-violet-400 ml-1">{r}</span>)}</div>
          )}
        </div>
      )}
    </div>
  );
}

function OverviewPanel() {
  const lifecycle = ["Research", "Prototype", "Alpha", "Developer Preview", "Beta", "Release Candidate", "Stable", "LTS", "Deprecated", "End of Life"];
  const currentStage = "Release Candidate";
  const rfcFlow = ["Ideia", "RFC", "Discussão", "Análise Técnica", "Análise Arquitetural", "Análise de Segurança", "Aprovação", "ADR", "Implementação", "MQCCS", "Release", "Monitoramento", "Encerramento"];

  return (
    <div className="space-y-6">
      {/* Foundation v1.0 Banner */}
      <div className="bg-gradient-to-r from-violet-950 to-blue-950 border border-violet-700 rounded-xl p-4 mb-2">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-violet-300 text-xs font-mono mb-0.5">RFC-000 — Aprovada</p>
            <p className="text-white font-bold text-lg">MemoryOS Foundation v{FOUNDATION_V1.version}</p>
            <p className="text-violet-300 text-sm">Baseline oficial · {FOUNDATION_V1.documents.length} especificações · Fase: {FOUNDATION_V1.phase}</p>
          </div>
          <div className="text-right">
            <span className="inline-block bg-green-900 text-green-400 text-xs font-bold px-3 py-1 rounded-full border border-green-700">STABLE</span>
            <p className="text-zinc-500 text-xs mt-1">{FOUNDATION_V1.declaredAt}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          {FOUNDATION_V1.documents.map(d => (
            <span key={d} className="text-xs bg-violet-900/50 text-violet-300 px-2 py-0.5 rounded font-mono border border-violet-800">{d}</span>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="RFCs Totais"      value={REGISTRY_STATS.rfcs}           color="violet" />
        <StatCard label="Implementadas"    value={REGISTRY_STATS.implemented}    color="green"  />
        <StatCard label="ADRs Aceitos"     value={REGISTRY_STATS.acceptedAdrs}   color="blue"   />
        <StatCard label="Releases"         value={REGISTRY_STATS.releases}       color="yellow" />
      </div>

      {/* RFC Flow */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4 text-violet-400" /> Fluxo Oficial de RFC
        </h3>
        <div className="flex flex-wrap gap-1 items-center">
          {rfcFlow.map((step, i) => (
            <React.Fragment key={step}>
              <span className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded">{step}</span>
              {i < rfcFlow.length - 1 && <ArrowRight className="w-3 h-3 text-zinc-600 shrink-0" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Release Lifecycle */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
          <Package className="w-4 h-4 text-yellow-400" /> Release Lifecycle
        </h3>
        <div className="flex flex-wrap gap-2 items-center">
          {lifecycle.map((stage, i) => (
            <React.Fragment key={stage}>
              <span className={`text-xs px-2 py-1 rounded font-medium ${stage === currentStage ? STAGE_STYLE[stage] : "bg-zinc-800 text-zinc-500"}`}>{stage}</span>
              {i < lifecycle.length - 1 && <ArrowRight className="w-3 h-3 text-zinc-700 shrink-0" />}
            </React.Fragment>
          ))}
        </div>
        <p className="text-xs text-zinc-500 mt-2">Posição atual: <span className={`font-medium ${STAGE_STYLE[currentStage]}`}>{currentStage}</span></p>
      </div>

      {/* Architecture Preservation */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-red-400" /> Invariantes Invioláveis (Cap. 13)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {[
            "Nunca aumentar acoplamento Core ↔ domínio externo",
            "Nunca quebrar interfaces IConnector, ISpecialist, IMemoryProvider, IEventBus",
            "Nunca remover ou contornar AuditTrail",
            "Nunca remover Human Approval gate",
            "Nunca reduzir nível de segurança do Security Gate",
            "Nunca reduzir observabilidade ou transparência",
            "Nunca violar princípios do MCS, MRS ou MDIS",
          ].map((rule, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-zinc-400">
              <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />{rule}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────

export default function MpegsGovernance() {
  const [activeTab, setActiveTab] = useState("Visão Geral");
  const [rfcFilter, setRfcFilter] = useState("All");
  const rfcStatuses = ["All", "Implemented", "Approved", "Under Discussion", "Draft", "Rejected"];

  const filteredRfcs = rfcFilter === "All" ? RFC_REGISTRY : RFC_REGISTRY.filter(r => r.status === rfcFilter);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-blue-700 flex items-center justify-center">
              <GitBranch className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">MPEGS — Evolution Governance</h1>
              <p className="text-zinc-400 text-sm">Platform Evolution Governance Specification v1.0</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-zinc-900 rounded-xl p-1 border border-zinc-800">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 text-sm py-2 rounded-lg font-medium transition-colors ${activeTab === tab ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Panels */}
        {activeTab === "Visão Geral" && <OverviewPanel />}

        {activeTab === "RFCs" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 mb-4">
              {rfcStatuses.map(s => (
                <button key={s} onClick={() => setRfcFilter(s)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${rfcFilter === s ? "border-violet-500 text-violet-300 bg-violet-950" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
                  {s}
                </button>
              ))}
            </div>
            {filteredRfcs.map(rfc => <RfcCard key={rfc.id} rfc={rfc} />)}
          </div>
        )}

        {activeTab === "ADRs" && (
          <div className="space-y-3">
            {ADR_REGISTRY.map(adr => <AdrCard key={adr.id} adr={adr} />)}
          </div>
        )}

        {activeTab === "Releases" && (
          <div className="space-y-3">
            {[...RELEASE_REGISTRY].reverse().map(r => <ReleaseCard key={r.version} release={r} />)}
          </div>
        )}
      </div>
    </div>
  );
}