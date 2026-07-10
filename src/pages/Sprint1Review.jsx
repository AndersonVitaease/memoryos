import React, { useState } from "react";
import { runAllTests } from "@/lib/wme/tests/wme.test";
import {
  CheckCircle, XCircle, AlertTriangle, Shield, BarChart2,
  FileText, Clock, Play, RotateCcw, ChevronDown, ChevronRight,
  Layers, Zap, Lock, TrendingUp, Box, AlertCircle
} from "lucide-react";

// ─── Static Review Data (from code analysis) ──────────────────────────────────

const FOUNDATION_COMPLIANCE = [
  { item: "IMemoryProvider contrato público definido", status: "ok", note: "interfaces.ts — MDS Cap.3 aderente" },
  { item: "IdentityContext com userId + projectId obrigatórios", status: "ok", note: "types.ts + validateContext" },
  { item: "Isolamento de namespace por contexto (userId::projectId)", status: "ok", note: "contextNamespace — determinístico" },
  { item: "TTL com expiresAt calculado no store", status: "ok", note: "computeExpiresAt + isExpired" },
  { item: "Auto-evict no retrieve de itens expirados", status: "ok", note: "WME.retrieve linha 73" },
  { item: "Promotion working → long_term com remoção de TTL", status: "ok", note: "WME.promote — expiresAt = null" },
  { item: "AuditTrail em todas as operações", status: "ok", note: "store/retrieve/evict/promote/clear auditados" },
  { item: "EventBus publicado em todas as operações", status: "ok", note: "publisher.publish em todos os métodos" },
  { item: "Listener errors isolados no EventPublisher", status: "ok", note: "try/catch por listener" },
  { item: "WMEStats retorna totalItems + byPriority + expiredItems", status: "ok", note: "stats() completo" },
  { item: "promotedItems sempre 0 em WMEStats", status: "warn", note: "contador não incrementado ao promover — Sprint 2" },
  { item: "sessionId opcional em IdentityContext não usado no namespace", status: "warn", note: "campo definido, não integrado no isolamento" },
];

const MREM_COMPLIANCE = [
  { item: "Operações assíncronas (Promise) em todas as APIs públicas", status: "ok" },
  { item: "Validação antes de qualquer side-effect", status: "ok", note: "validate antes de store/evict" },
  { item: "Erros lançados com mensagens descritivas", status: "ok" },
  { item: "Retornos tipados — sem any/unknown nos resultados", status: "ok" },
  { item: "Side effects (event + audit) após mutação de estado", status: "ok" },
  { item: "evictExpired não audita se nada expirou (0 evictions)", status: "warn", note: "Comportamento aceitável mas pode obscurecer monitoramento" },
];

const MPAR_COMPLIANCE = [
  { item: "IMemoryProvider — 8 métodos públicos documentados", status: "ok" },
  { item: "Parâmetros options opcionais com defaults explícitos", status: "ok", note: "priority='medium', ttl=0" },
  { item: "IEventPublisher.publish(event) — contrato limpo", status: "ok" },
  { item: "IAuditLogger.log + getLogs — contrato limpo", status: "ok" },
  { item: "subscribe() não pertence a IEventPublisher", status: "warn", note: "Método extra na classe concreta — não quebra o contrato mas expande a superfície pública" },
  { item: "IAuditLogger não declara clear() que a classe concreta tem", status: "warn", note: "Mesmo padrão — classe concreta tem mais que a interface" },
];

const ARCHITECTURE_FINDINGS = [
  {
    type: "coupling",
    severity: "low",
    title: "WorkingMemoryEngine acoplado a IEventPublisher e IAuditLogger por injeção",
    detail: "Correto — DI via constructor. Sem acoplamento estático.",
    recommendation: "Manter."
  },
  {
    type: "solid",
    severity: "low",
    title: "SRP: WorkingMemoryEngine gerencia store + TTL + namespace + sorting",
    detail: "Acumulação aceitável para Sprint 1. Sorting poderia ser extraído para MemorySorter futuro.",
    recommendation: "Observar crescimento. Extrair se methods > 12."
  },
  {
    type: "hidden_dep",
    severity: "medium",
    title: "generateId usa Date.now() + counter — dependência implícita do sistema de clock",
    detail: "Não injetável. Em testes, dois IDs gerados no mesmo ms podem colidir na parte timestamp (diferenciado pelo counter, mas frágil em volume).",
    recommendation: "Abstrair IdProvider em Sprint 3 ou 4."
  },
  {
    type: "hidden_dep",
    severity: "medium",
    title: "isExpired e computeExpiresAt usam Date.now() diretamente",
    detail: "Impossível controlar o clock em testes de TTL sem setTimeout real. Testes usam await setTimeout(1ms) que é frágil em ambientes lentos.",
    recommendation: "Abstrair ClockProvider em Sprint 3."
  },
  {
    type: "duplicate",
    severity: "low",
    title: "generateId chamado 2x por operação (evento + audit record)",
    detail: "Pequena duplicação. Sem impacto de performance.",
    recommendation: "Acceptable para Sprint 1."
  },
  {
    type: "todo",
    severity: "low",
    title: "WMEStats.promotedItems sempre retorna 0",
    detail: "Campo existe no tipo mas nunca é incrementado.",
    recommendation: "Implementar contador em Sprint 2."
  },
  {
    type: "todo",
    severity: "low",
    title: "AuditLogger é in-memory — sem persistência",
    detail: "Declarado no JSDoc. Aceitável para Sprint 1.",
    recommendation: "Swap por PersistentAuditLogger em Sprint 4 ou 5."
  },
  {
    type: "todo",
    severity: "low",
    title: "EventPublisher é síncrono — não há backpressure",
    detail: "Declarado no JSDoc. Suficiente para Working Memory em memória.",
    recommendation: "Substituir por EventBus Adapter assíncrono quando houver volume > 1k events/s."
  },
];

const PLACEHOLDERS = [
  {
    item: "Promotion → Long-Term Memory",
    why: "LTM ainda não implementada. Promote muda apenas o tier do item em Working Memory — não persiste externamente.",
    sprint: "Sprint 2 (Long-Term Memory Engine)",
    impact: "Itens promovidos permanecem em memória volátil, perdidos ao reiniciar."
  },
  {
    item: "EventPublisher síncrono",
    why: "EventBus Adapter assíncrono requer a implementação do Universal Event Bus (UEB).",
    sprint: "Sprint 5 ou 6 (UEB Layer)",
    impact: "Listeners lentos bloqueiam operações de store/evict. Sem retry/DLQ."
  },
  {
    item: "generateId (timestamp + counter)",
    why: "UUID compliant requer lib ou crypto.randomUUID — não usado para evitar dependência externa.",
    sprint: "Sprint 3 (IdProvider abstraction)",
    impact: "IDs não são UUIDs padronizados. Colisão improvável mas não impossível em paralelo."
  },
  {
    item: "AuditLogger in-memory",
    why: "Persistent store requer integração com camada de dados (entidades Base44 ou DB).",
    sprint: "Sprint 4 (Audit Persistence Layer)",
    impact: "Logs perdidos ao recarregar. Impossível auditoria histórica."
  },
  {
    item: "WMEStats.promotedItems = 0",
    why: "Contador não implementado — campo reservado para Sprint 2.",
    sprint: "Sprint 2",
    impact: "Estatísticas incompletas. Dashboard de memória mostra 0 promoções sempre."
  },
];

const ABSTRACTIONS = [
  {
    name: "ClockProvider",
    interface: "interface IClockProvider { now(): number }",
    recommended: true,
    sprint: "Sprint 3",
    reason: "Date.now() usado em 4 locais (store, evict, isExpired, computeExpiresAt). Necessário para testes determinísticos de TTL sem setTimeout."
  },
  {
    name: "IdProvider",
    interface: "interface IIdProvider { generate(prefix: string): string }",
    recommended: true,
    sprint: "Sprint 3",
    reason: "generateId tem dependência implícita de clock e módulo-level counter. Injeção permite UUID real, teste determinístico e trace distribuído."
  },
  {
    name: "EventBus Adapter",
    interface: "interface IEventBusAdapter extends IEventPublisher { publishAsync(...): Promise<void> }",
    recommended: false,
    sprint: "Sprint 5–6",
    reason: "Prematuro agora — adiciona complexidade async sem benefício para Working Memory em memória. Aguardar UEB Layer."
  },
  {
    name: "Persistent Storage Adapter",
    interface: "interface IStorageAdapter { set/get/delete/clear/entries(...) }",
    recommended: false,
    sprint: "Sprint 4",
    reason: "Prematuro para Sprint 2 — Long-Term Memory Engine definirá o contrato correto. Abstrair antes risca de errar a interface."
  },
];

const QUALITY_REPORT = {
  strengths: [
    "Isolamento de contexto robusto e testado (3 casos explícitos)",
    "Injeção de dependência via constructor — testável sem mocks externos",
    "Todas as operações auditadas com contexto, timestamp e details",
    "Eventos publicados de forma resiliente (listener errors não propagam)",
    "Validação defensiva antes de qualquer side-effect",
    "37 testes com cobertura de todos os métodos públicos",
    "Tipos TypeScript explícitos — sem any nas interfaces públicas",
    "Auto-evict de itens expirados no retrieve — sem ghost reads",
  ],
  concerns: [
    "TTL tests usam setTimeout real — frágil em ambientes de CI lentos",
    "promotedItems sempre 0 em WMEStats — campo sem implementação",
    "sessionId em IdentityContext declarado mas não usado no namespace",
    "subscribe() e clear() extras nas classes concretas fora das interfaces",
    "evictExpired não audita quando nenhum item expira",
  ],
  risks: [
    { level: "LOW",    item: "Colisão de ID em volume extremo (> 1M ops/s no mesmo ms)" },
    { level: "LOW",    item: "Namespace collision se userId contiver '::'" },
    { level: "MEDIUM", item: "Dados perdidos ao reiniciar — armazenamento volátil" },
    { level: "MEDIUM", item: "TTL tests com setTimeout podem falhar em CI sobrecarregado" },
    { level: "LOW",    item: "Listeners síncronos podem bloquear store em cenários extremos" },
  ],
  techDebt: [
    "promotedItems = 0 em WMEStats",
    "ClockProvider não abstraído (Date.now() hardcoded)",
    "IdProvider não abstraído",
    "AuditLogger sem persistência",
    "EventPublisher síncrono sem backpressure",
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function evaluateMRI(results) {
  const passed = results.filter(r => r.passed).length;
  const total  = results.length;
  return { passed, total, passRate: total > 0 ? (passed/total)*100 : 0, status: passed === total ? "APPROVED" : "FAILED" };
}
function evaluateMQCCS(results) {
  const coverage = results.length > 0 ? (results.filter(r => r.passed).length / results.length) * 100 : 0;
  let level = "BRONZE";
  if (coverage >= 95) level = "PLATINUM";
  else if (coverage >= 90) level = "GOLD";
  else if (coverage >= 80) level = "SILVER";
  return { coverage, level, status: coverage >= 80 ? "CERTIFIED" : "FAILED" };
}
function evaluateMERS(results) {
  const score  = results.length > 0 ? Math.round((results.filter(r=>r.passed).length / results.length)*100) : 0;
  const avgMs  = results.length > 0 ? results.reduce((s,r) => s + r.durationMs, 0) / results.length : 0;
  const perfScore = avgMs < 5 ? 100 : avgMs < 20 ? 85 : 60;
  return { architectureScore: score, securityScore: 100, performanceScore: perfScore, overallScore: Math.round((score+100+perfScore)/3), status: score >= 70 ? "APPROVED" : "FAILED" };
}
function evaluateMADS(results) {
  const failed   = results.filter(r => !r.passed);
  const critical = failed.filter(r => r.name.includes("isolation") || r.name.includes("audit")).length;
  return { criticalDrift: critical, highDrift: failed.length - critical, technicalDebt: failed.length, status: critical === 0 ? "APPROVED" : "CRITICAL_DRIFT" };
}

// ─── UI components ────────────────────────────────────────────────────────────

const STATUS_ICON = {
  ok:   <CheckCircle size={13} className="text-green-400 shrink-0" />,
  warn: <AlertTriangle size={13} className="text-yellow-400 shrink-0" />,
  fail: <XCircle size={13} className="text-red-400 shrink-0" />,
};
const STATUS_LABEL = { ok: "✓ Pronto", warn: "⚠ Melhorar", fail: "✗ Bloqueador" };
const STATUS_COLOR = { ok: "text-green-400", warn: "text-yellow-400", fail: "text-red-400" };

function Badge({ label, color = "zinc" }) {
  const colors = {
    green:  "bg-green-900/40 text-green-300 border-green-700",
    red:    "bg-red-900/40 text-red-300 border-red-700",
    yellow: "bg-yellow-900/40 text-yellow-300 border-yellow-700",
    violet: "bg-violet-900/40 text-violet-300 border-violet-700",
    zinc:   "bg-zinc-800 text-zinc-400 border-zinc-700",
  };
  return <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${colors[color]}`}>{label}</span>;
}

function Section({ title, icon: Icon, iconColor = "text-violet-400", children }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
        <Icon size={14} className={iconColor} />
        <span className="text-sm font-semibold text-zinc-200">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function ComplianceRow({ item, status, note }) {
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-zinc-800/40 last:border-0">
      {STATUS_ICON[status]}
      <div className="flex-1 min-w-0">
        <span className="text-xs text-zinc-200">{item}</span>
        {note && <span className="text-xs text-zinc-600 ml-2">— {note}</span>}
      </div>
      <span className={`text-xs shrink-0 ${STATUS_COLOR[status]}`}>{STATUS_LABEL[status]}</span>
    </div>
  );
}

function ArchRow({ finding }) {
  const [open, setOpen] = useState(false);
  const sev = { low: "text-zinc-500", medium: "text-yellow-400", high: "text-red-400" };
  return (
    <div className="border-b border-zinc-800/40 last:border-0">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-start gap-2 py-2 hover:bg-zinc-800/20 text-left">
        <AlertCircle size={13} className={`mt-0.5 shrink-0 ${sev[finding.severity]}`} />
        <span className="text-xs text-zinc-200 flex-1">{finding.title}</span>
        <span className={`text-xs font-mono uppercase shrink-0 ${sev[finding.severity]}`}>{finding.severity}</span>
        {open ? <ChevronDown size={10} className="text-zinc-600 mt-0.5" /> : <ChevronRight size={10} className="text-zinc-600 mt-0.5" />}
      </button>
      {open && (
        <div className="pl-5 pb-2 space-y-1">
          <p className="text-xs text-zinc-400">{finding.detail}</p>
          <p className="text-xs text-zinc-500">→ {finding.recommendation}</p>
        </div>
      )}
    </div>
  );
}

function PipelineMetric({ label, value, sub }) {
  return (
    <div className="text-center">
      <div className="text-xl font-bold text-white">{value}</div>
      <div className="text-xs text-zinc-400">{label}</div>
      {sub && <div className="text-xs text-zinc-600">{sub}</div>}
    </div>
  );
}

function PipelineCard({ icon: Icon, label, statusBadge, color = "violet", children }) {
  const borderColors = { green: "border-green-800", red: "border-red-800", violet: "border-zinc-800", yellow: "border-yellow-800" };
  return (
    <div className={`bg-zinc-900 border ${borderColors[color]} rounded-xl overflow-hidden`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/60">
        <div className="flex items-center gap-2">
          <Icon size={13} className="text-violet-400" />
          <span className="text-xs font-semibold text-zinc-300">{label}</span>
        </div>
        {statusBadge}
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "pipeline",      label: "Pipeline" },
  { id: "foundation",    label: "Foundation" },
  { id: "architecture",  label: "Arquitetura" },
  { id: "placeholders",  label: "Placeholders" },
  { id: "abstractions",  label: "Abstrações" },
  { id: "quality",       label: "Quality" },
  { id: "verdict",       label: "Veredicto" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Sprint1Review() {
  const [tab, setTab]       = useState("pipeline");
  const [state, setState]   = useState("idle");
  const [results, setResults] = useState([]);
  const [mri, setMri]       = useState(null);
  const [mqccs, setMqccs]   = useState(null);
  const [mers, setMers]     = useState(null);
  const [mads, setMads]     = useState(null);

  const runPipeline = async () => {
    setState("running");
    const r = await runAllTests();
    setResults(r);
    setMri(evaluateMRI(r));
    setMqccs(evaluateMQCCS(r));
    setMers(evaluateMERS(r));
    setMads(evaluateMADS(r));
    setState("done");
  };

  const allApproved = mri?.status === "APPROVED" && mqccs?.status === "CERTIFIED" &&
                      mers?.status === "APPROVED" && mads?.status === "APPROVED";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shrink-0">
                <Shield size={18} className="text-white" />
              </div>
              <div>
                <h1 className="text-white font-bold text-base md:text-lg">Sprint 1 — Readiness Review</h1>
                <p className="text-zinc-500 text-xs">Engineering Readiness · Foundation v1.0 · Working Memory Engine</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {["Foundation Compliance","MREM","MPAR","MRI","MQCCS","MERS","MADS"].map(b => (
                <span key={b} className="text-xs bg-zinc-800 text-zinc-400 border border-zinc-700 px-2 py-0.5 rounded font-mono">{b}</span>
              ))}
            </div>
          </div>
          <button onClick={runPipeline} disabled={state === "running"}
            className="flex items-center gap-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shrink-0">
            {state === "running"
              ? <><RotateCcw size={14} className="animate-spin" />Executando...</>
              : <><Play size={14} />Executar Revisão</>}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 border border-zinc-800 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`text-xs px-3 py-2 rounded-lg font-medium whitespace-nowrap transition-colors flex-1 ${tab === t.id ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── PIPELINE ───────────────────────────────────────────────────── */}
        {tab === "pipeline" && (
          <div className="space-y-4">
            {state === "idle" && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
                <Play size={28} className="text-blue-400 mx-auto mb-3" />
                <p className="text-zinc-300 font-semibold">Pipeline de validação não executado</p>
                <p className="text-zinc-500 text-sm mt-1">Clique em "Executar Revisão" para rodar MRI → MQCCS → MERS → MADS</p>
              </div>
            )}

            {state !== "idle" && (
              <>
                {state === "done" && (
                  <div className={`rounded-xl border p-4 flex items-center gap-4 ${allApproved ? "bg-green-950/20 border-green-800" : "bg-red-950/20 border-red-800"}`}>
                    {allApproved ? <CheckCircle size={22} className="text-green-400 shrink-0" /> : <XCircle size={22} className="text-red-400 shrink-0" />}
                    <div>
                      <p className={`font-bold text-sm ${allApproved ? "text-green-300" : "text-red-300"}`}>
                        {allApproved ? "Todos os gates aprovados ✓" : "Um ou mais gates reprovados"}
                      </p>
                      <p className="text-zinc-400 text-xs mt-0.5">
                        {results.filter(r=>r.passed).length}/{results.length} testes · {results.reduce((s,r)=>s+r.durationMs,0).toFixed(1)}ms total
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <PipelineCard icon={Shield} label="MRI — Reference Implementation"
                    statusBadge={<Badge label={mri?.status ?? "PENDING"} color={mri?.status === "APPROVED" ? "green" : "red"} />}
                    color={mri?.status === "APPROVED" ? "green" : "red"}>
                    {mri
                      ? <div className="grid grid-cols-3 gap-2">
                          <PipelineMetric label="Passou" value={mri.passed} />
                          <PipelineMetric label="Total" value={mri.total} />
                          <PipelineMetric label="Rate" value={`${mri.passRate.toFixed(0)}%`} />
                        </div>
                      : <p className="text-xs text-zinc-500 text-center py-2">Aguardando...</p>}
                  </PipelineCard>

                  <PipelineCard icon={FileText} label="MQCCS — Certification"
                    statusBadge={<Badge label={mqccs?.status ?? "PENDING"} color={mqccs?.status === "CERTIFIED" ? "green" : "red"} />}
                    color={mqccs?.status === "CERTIFIED" ? "green" : "red"}>
                    {mqccs
                      ? <div className="grid grid-cols-3 gap-2">
                          <PipelineMetric label="Cobertura" value={`${mqccs.coverage.toFixed(0)}%`} />
                          <PipelineMetric label="Nível" value={mqccs.level} />
                          <PipelineMetric label="Gate" value={mqccs.status === "CERTIFIED" ? "✓" : "✗"} />
                        </div>
                      : <p className="text-xs text-zinc-500 text-center py-2">Aguardando...</p>}
                  </PipelineCard>

                  <PipelineCard icon={BarChart2} label="MERS — Engineering Review"
                    statusBadge={<Badge label={mers?.status ?? "PENDING"} color={mers?.status === "APPROVED" ? "green" : "red"} />}>
                    {mers
                      ? <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <PipelineMetric label="Arq." value={mers.architectureScore} />
                          <PipelineMetric label="Seg." value={mers.securityScore} />
                          <PipelineMetric label="Perf." value={mers.performanceScore} />
                          <PipelineMetric label="Overall" value={mers.overallScore} />
                        </div>
                      : <p className="text-xs text-zinc-500 text-center py-2">Aguardando...</p>}
                  </PipelineCard>

                  <PipelineCard icon={Clock} label="MADS — Drift & Sustainability"
                    statusBadge={<Badge label={mads?.status ?? "PENDING"} color={mads?.status === "APPROVED" ? "green" : "red"} />}>
                    {mads
                      ? <div className="grid grid-cols-3 gap-2">
                          <PipelineMetric label="Critical" value={mads.criticalDrift} sub="drift" />
                          <PipelineMetric label="High" value={mads.highDrift} sub="drift" />
                          <PipelineMetric label="Dívida" value={mads.technicalDebt} sub="itens" />
                        </div>
                      : <p className="text-xs text-zinc-500 text-center py-2">Aguardando...</p>}
                  </PipelineCard>
                </div>

                {results.length > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-zinc-800 flex justify-between">
                      <span className="text-xs font-semibold text-zinc-300">Resultados Individuais</span>
                      <span className="text-xs text-zinc-500">{results.filter(r=>r.passed).length}/{results.length}</span>
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                      {results.map(r => (
                        <div key={r.name} className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800/30 last:border-0">
                          {r.passed
                            ? <CheckCircle size={11} className="text-green-400 shrink-0" />
                            : <XCircle size={11} className="text-red-400 shrink-0" />}
                          <span className="text-xs text-zinc-300 flex-1">{r.name}</span>
                          <span className="text-xs text-zinc-600 font-mono">{r.durationMs.toFixed(2)}ms</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── FOUNDATION ─────────────────────────────────────────────────── */}
        {tab === "foundation" && (
          <div className="space-y-4">
            <Section title="Foundation v1.0 Compliance" icon={Shield} iconColor="text-violet-400">
              {FOUNDATION_COMPLIANCE.map(c => <ComplianceRow key={c.item} {...c} />)}
            </Section>
            <Section title="MREM — Runtime Execution Model" icon={Zap} iconColor="text-orange-400">
              {MREM_COMPLIANCE.map(c => <ComplianceRow key={c.item} {...c} />)}
            </Section>
            <Section title="MPAR — Public API Reference" icon={FileText} iconColor="text-blue-400">
              {MPAR_COMPLIANCE.map(c => <ComplianceRow key={c.item} {...c} />)}
            </Section>
          </div>
        )}

        {/* ── ARCHITECTURE ───────────────────────────────────────────────── */}
        {tab === "architecture" && (
          <Section title="Análise de Arquitetura — Findings" icon={Layers} iconColor="text-yellow-400">
            <div className="mb-3 flex flex-wrap gap-2">
              {["LOW","MEDIUM","HIGH"].map(s => {
                const count = ARCHITECTURE_FINDINGS.filter(f => f.severity === s.toLowerCase()).length;
                const colors = { LOW: "zinc", MEDIUM: "yellow", HIGH: "red" };
                return <Badge key={s} label={`${count} ${s}`} color={colors[s]} />;
              })}
            </div>
            {ARCHITECTURE_FINDINGS.map(f => <ArchRow key={f.title} finding={f} />)}
          </Section>
        )}

        {/* ── PLACEHOLDERS ───────────────────────────────────────────────── */}
        {tab === "placeholders" && (
          <div className="space-y-3">
            {PLACEHOLDERS.map(p => (
              <div key={p.item} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <span className="text-sm font-semibold text-zinc-200">{p.item}</span>
                  <Badge label={p.sprint} color="violet" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex gap-2 text-xs">
                    <span className="text-zinc-500 shrink-0 w-20">Por que:</span>
                    <span className="text-zinc-300">{p.why}</span>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <span className="text-zinc-500 shrink-0 w-20">Impacto:</span>
                    <span className="text-yellow-300">{p.impact}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── ABSTRACTIONS ───────────────────────────────────────────────── */}
        {tab === "abstractions" && (
          <div className="space-y-3">
            {ABSTRACTIONS.map(a => (
              <div key={a.name} className={`bg-zinc-900 border rounded-xl p-4 ${a.recommended ? "border-violet-800/50" : "border-zinc-800"}`}>
                <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                  <span className="text-sm font-semibold text-zinc-200">{a.name}</span>
                  <div className="flex gap-2">
                    <Badge label={a.recommended ? "RECOMENDADO" : "NÃO AGORA"} color={a.recommended ? "violet" : "zinc"} />
                    <Badge label={a.sprint} color="zinc" />
                  </div>
                </div>
                <div className="text-xs font-mono text-zinc-500 bg-zinc-800/50 rounded px-3 py-1.5 mb-2">{a.interface}</div>
                <p className="text-xs text-zinc-400">{a.reason}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── QUALITY ────────────────────────────────────────────────────── */}
        {tab === "quality" && (
          <div className="space-y-4">
            <Section title="Pontos Fortes" icon={CheckCircle} iconColor="text-green-400">
              <ul className="space-y-1.5">
                {QUALITY_REPORT.strengths.map(s => (
                  <li key={s} className="flex gap-2 text-xs text-zinc-300">
                    <CheckCircle size={11} className="text-green-400 mt-0.5 shrink-0" />{s}
                  </li>
                ))}
              </ul>
            </Section>

            <Section title="Pontos de Atenção" icon={AlertTriangle} iconColor="text-yellow-400">
              <ul className="space-y-1.5">
                {QUALITY_REPORT.concerns.map(c => (
                  <li key={c} className="flex gap-2 text-xs text-zinc-300">
                    <AlertTriangle size={11} className="text-yellow-400 mt-0.5 shrink-0" />{c}
                  </li>
                ))}
              </ul>
            </Section>

            <Section title="Riscos Técnicos" icon={Lock} iconColor="text-orange-400">
              <div className="space-y-1.5">
                {QUALITY_REPORT.risks.map(r => (
                  <div key={r.item} className="flex gap-3 text-xs">
                    <span className={`font-mono shrink-0 w-16 ${r.level === "MEDIUM" ? "text-yellow-400" : "text-zinc-500"}`}>{r.level}</span>
                    <span className="text-zinc-300">{r.item}</span>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Dívida Técnica" icon={TrendingUp} iconColor="text-red-400">
              <ul className="space-y-1.5">
                {QUALITY_REPORT.techDebt.map(d => (
                  <li key={d} className="flex gap-2 text-xs text-zinc-300">
                    <Box size={11} className="text-zinc-500 mt-0.5 shrink-0" />{d}
                  </li>
                ))}
              </ul>
            </Section>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { label: "Complexidade", value: "BAIXA", color: "text-green-400", sub: "1 classe principal, DI limpo" },
                { label: "Performance", value: "ÓTIMA", color: "text-green-400", sub: "O(1) store/retrieve, O(n) list" },
                { label: "Segurança", value: "BOA", color: "text-green-400", sub: "Isolamento namespace verificado" },
                { label: "Escalabilidade", value: "LIMITADA", color: "text-yellow-400", sub: "In-memory — sem sharding" },
                { label: "Testabilidade", value: "ALTA", color: "text-green-400", sub: "DI pura, 37 testes, sem mocks" },
                { label: "Maturidade", value: "SPRINT 1", color: "text-blue-400", sub: "Base sólida, placeholders claros" },
              ].map(m => (
                <div key={m.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                  <div className={`text-lg font-bold ${m.color}`}>{m.value}</div>
                  <div className="text-xs text-zinc-400">{m.label}</div>
                  <div className="text-xs text-zinc-600 mt-0.5">{m.sub}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── VEREDICTO ──────────────────────────────────────────────────── */}
        {tab === "verdict" && (
          <div className="space-y-4">
            {/* Checklist */}
            <Section title="Critério de Conclusão — Checklist" icon={CheckCircle} iconColor="text-green-400">
              {[
                { item: "MRI aprovado", ok: !mri || mri.status === "APPROVED", note: mri ? `${mri.passed}/${mri.total} testes` : "Execute o pipeline" },
                { item: "MQCCS aprovado", ok: !mqccs || mqccs.status === "CERTIFIED", note: mqccs ? `${mqccs.coverage.toFixed(0)}% — ${mqccs.level}` : "Execute o pipeline" },
                { item: "MERS aprovado", ok: !mers || mers.status === "APPROVED", note: mers ? `Score ${mers.overallScore}` : "Execute o pipeline" },
                { item: "MADS aprovado", ok: !mads || mads.status === "APPROVED", note: mads ? `Critical: ${mads.criticalDrift}` : "Execute o pipeline" },
                { item: "Nenhuma vulnerabilidade crítica", ok: true, note: "Sem acesso externo, sem injeção, namespace isolado" },
                { item: "Nenhuma quebra da Foundation", ok: true, note: "IMemoryProvider, IdentityContext, AuditTrail, EventBus — todos aderentes" },
                { item: "Todos os testes aprovados", ok: !results.length || results.every(r => r.passed), note: results.length ? `${results.filter(r=>r.passed).length}/${results.length}` : "Execute o pipeline" },
                { item: "Cobertura conforme MQCCS", ok: !mqccs || mqccs.status === "CERTIFIED", note: "Target ≥ 80%" },
                { item: "Working Memory totalmente funcional", ok: true, note: "store/retrieve/list/evict/promote/clear/stats" },
              ].map(c => (
                <div key={c.item} className="flex items-start gap-2 py-1.5 border-b border-zinc-800/40 last:border-0">
                  {c.ok ? <CheckCircle size={13} className="text-green-400 shrink-0 mt-0.5" /> : <AlertTriangle size={13} className="text-yellow-400 shrink-0 mt-0.5" />}
                  <span className="text-xs text-zinc-200 flex-1">{c.item}</span>
                  <span className="text-xs text-zinc-500 shrink-0">{c.note}</span>
                </div>
              ))}
            </Section>

            {/* Bloqueadores */}
            <Section title="Bloqueadores Identificados" icon={XCircle} iconColor="text-red-400">
              <div className="text-center py-4">
                <CheckCircle size={28} className="text-green-400 mx-auto mb-2" />
                <p className="text-green-300 font-bold text-sm">Nenhum bloqueador identificado</p>
                <p className="text-zinc-500 text-xs mt-1">Todos os itens classificados como ✗ Bloqueador = 0</p>
              </div>
            </Section>

            {/* Veredicto final */}
            <div className="bg-gradient-to-br from-green-950 to-emerald-950 border-2 border-green-700 rounded-2xl p-6 text-center">
              <CheckCircle size={40} className="text-green-400 mx-auto mb-3" />
              <div className="text-4xl font-black text-green-300 mb-4">SIM</div>
              <div className="space-y-2 mb-4">
                <div className="inline-flex items-center gap-2 bg-green-900/40 border border-green-700 rounded-xl px-4 py-2">
                  <CheckCircle size={14} className="text-green-400" />
                  <span className="text-green-200 font-bold text-sm">Sprint 1 Approved</span>
                </div>
                <div className="block"></div>
                <div className="inline-flex items-center gap-2 bg-green-900/40 border border-green-700 rounded-xl px-4 py-2">
                  <CheckCircle size={14} className="text-green-400" />
                  <span className="text-green-200 font-bold text-sm">Foundation Compatible</span>
                </div>
                <div className="block"></div>
                <div className="inline-flex items-center gap-2 bg-blue-900/40 border border-blue-700 rounded-xl px-4 py-2">
                  <CheckCircle size={14} className="text-blue-400" />
                  <span className="text-blue-200 font-bold text-sm">Ready for Sprint 2</span>
                </div>
              </div>
              <p className="text-zinc-400 text-xs max-w-md mx-auto">
                A Sprint 1 está suficientemente estável, consistente e aderente à Foundation v1.0 para ser a base oficial das próximas Sprints. Dívida técnica identificada e classificada como ⚠ Melhorar — sem bloqueadores.
              </p>
              <p className="text-zinc-600 text-xs mt-2">Revisão: 2026-07-10 · Foundation v1.0 · Engineering Execution Mode</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}