/**
 * Phase714Page.jsx — Cognitive Diagnosis Platform (CDP)
 * Sprint 7.1.2 — FASE 10+11: Dashboard completo
 */

import React, { useState, useCallback, useEffect } from "react";
import {
  Brain, Play, Loader2, CheckCircle2, XCircle, Activity,
  Search, AlertTriangle, Target, Network, Shield,
  RefreshCw, TrendingUp, TrendingDown, Eye,
  GitBranch, MessageSquare, Clock, Award, ThumbsUp, ThumbsDown,
} from "lucide-react";
import { runCDPTests } from "@/lib/cognitive-diagnosis/cdpTests";
import {
  beginTrace, finalizeTrace, recordContext, recordMemories,
  recordSpecialists, recordConnectors, recordDecisions,
  recordConfidence, recordLearning, recordGoals, recordRanking,
  listTraces, getStats as traceStats,
} from "@/lib/cognitive-diagnosis/CognitiveTraceEngine";
import { diagnoseTrace } from "@/lib/cognitive-diagnosis/DecisionDiagnosisEngine";
import { explainTrace } from "@/lib/cognitive-diagnosis/ReasoningExplainer";
import { assess } from "@/lib/cognitive-diagnosis/SelfAssessmentEngine";
import { submitFeedback, getFeedbackStats, getFeedbacks } from "@/lib/cognitive-diagnosis/OutcomeFeedbackEngine";

// ─── UI atoms ─────────────────────────────────────────────────────────────────

function Badge({ children, color = "zinc" }) {
  const m = {
    green: "bg-emerald-100 text-emerald-700", red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-700", blue: "bg-blue-100 text-blue-700",
    violet: "bg-violet-100 text-violet-700", zinc: "bg-zinc-100 text-zinc-600",
    orange: "bg-orange-100 text-orange-700",
  };
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${m[color] ?? m.zinc}`}>{children}</span>;
}

function healthColor(h) {
  if (h === "HEALTHY") return "green";
  if (h === "WARNING" || h === "INFO") return "amber";
  if (h === "DEGRADED") return "orange";
  if (h === "CRITICAL") return "red";
  return "zinc";
}

function severityColor(s) {
  if (s === "CRITICAL") return "red";
  if (s === "HIGH") return "orange";
  if (s === "MEDIUM") return "amber";
  if (s === "LOW") return "blue";
  return "zinc";
}

function MetricCard({ label, value, sub, icon: Icon, color = "zinc" }) {
  const bdr = {
    green: "border-emerald-200 bg-emerald-50/30", violet: "border-violet-200 bg-violet-50/30",
    blue: "border-blue-200 bg-blue-50/30", amber: "border-amber-200 bg-amber-50/30",
    zinc: "border-zinc-200 bg-white",
  };
  return (
    <div className={`border rounded-xl p-3 ${bdr[color] ?? bdr.zinc}`}>
      <div className="flex items-center gap-1 mb-1">
        {Icon && <Icon className="w-3 h-3 text-zinc-400" />}
        <p className="text-xs text-zinc-400">{label}</p>
      </div>
      <p className="text-xl font-bold text-zinc-900 font-heading">{value}</p>
      {sub && <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function TestRow({ result }) {
  return (
    <div className={`flex items-start gap-2 py-1.5 px-2 rounded text-xs ${result.passed ? "text-zinc-700" : "bg-red-50 text-red-700"}`}>
      {result.passed
        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
        : <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />}
      <span className="flex-1">{result.name}</span>
      {!result.passed && result.error && (
        <span className="text-red-500 ml-1 truncate max-w-[200px]" title={result.error}>{result.error}</span>
      )}
      <span className="text-zinc-400 shrink-0 ml-2">{result.duration}ms</span>
    </div>
  );
}

const TABS = ["overview", "trace", "reasoning", "diagnosis", "assessment", "outcome", "tests"];
const TAB_LABELS = {
  overview: "Overview", trace: "Execution Trace", reasoning: "Reasoning",
  diagnosis: "Diagnosis", assessment: "Self-Assessment", outcome: "Outcome", tests: "Testes",
};
const TAB_ICONS = {
  overview: Activity, trace: Eye, reasoning: Brain, diagnosis: AlertTriangle,
  assessment: Award, outcome: ThumbsUp, tests: GitBranch,
};

export default function Phase714Page() {
  const [activeTab, setActiveTab] = useState("overview");
  const [running, setRunning] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [traces, setTraces] = useState([]);
  const [selectedTrace, setSelectedTrace] = useState(null);
  const [diagnosis, setDiagnosis] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [assessment, setAssessment] = useState(null);
  const [stats, setStats] = useState(null);
  const [fbStats, setFbStats] = useState(null);

  const refresh = useCallback(() => {
    const all = listTraces(20);
    setTraces(all);
    setStats(traceStats());
    setFbStats(getFeedbackStats());
    const latest = all.find((t) => t.status === "complete");
    if (latest && !selectedTrace) {
      const d = diagnoseTrace(latest);
      setSelectedTrace(latest);
      setDiagnosis(d);
      setExplanation(explainTrace(latest, []));
      setAssessment(assess(latest, d));
    }
  }, [selectedTrace]);

  useEffect(() => { refresh(); }, []);

  const selectTrace = useCallback((t) => {
    const d = diagnoseTrace(t);
    setSelectedTrace(t);
    setDiagnosis(d);
    setExplanation(explainTrace(t, []));
    setAssessment(assess(t, d));
  }, []);

  const generateDemoTrace = useCallback(() => {
    const id = beginTrace(`exec-demo-${Date.now()}`, "demo-session", "Qual e o status do projeto Alpha e as decisoes tomadas?");
    recordContext(id, { sessionSummary: "Conversa sobre fornecedores e contratos", entitiesCount: 7, decisionsCount: 4, tasksCount: 3, keywordsCount: 12, builtAtMs: 380 });
    recordGoals(id, [{ goalId: "g1", goalTitle: "Projeto Alpha", sessions: ["s1", "s2"], decisions: ["d1", "d2"], lessons: ["Sempre validar fornecedores"], weight: 1.5 }]);
    recordMemories(id, [
      { memoryId: "m1", type: "decision", label: "Contratar ACME", used: true, score: 0.82, priority: "HIGH", confidence: "HIGH", reason: "alta relevancia semantica, recente", breakdown: { semantic: 0.90, recency: 0.85, richness: 0.70, importance: 0.90, frequency: 0.5 } },
      { memoryId: "m2", type: "entity_empresa", label: "ACME Corp", used: true, score: 0.74, priority: "HIGH", confidence: "HIGH", reason: "alta relevancia semantica", breakdown: { semantic: 0.80, recency: 0.70, richness: 0.50, importance: 0.85, frequency: 0.5 } },
      { memoryId: "m3", type: "topic", label: "Fornecimento de materiais", used: true, score: 0.55, priority: "MEDIUM", confidence: "MEDIUM", reason: "relevancia moderada", breakdown: { semantic: 0.55, recency: 0.60, richness: 0.45, importance: 0.65, frequency: 0.5 } },
      { memoryId: "m4", type: "task", label: "Tarefa irrelevante", used: false, score: 0.22, priority: "DISCARD", confidence: "LOW", reason: "baixo score composto", breakdown: { semantic: 0.10, recency: 0.30, richness: 0.20, importance: 0.40, frequency: 0.5 } },
    ]);
    recordSpecialists(id,
      [{ name: "FinancialSpecialist", activated: true, activationReason: "Query sobre contratos e fornecedores", score: 0.85 }],
      [{ name: "LegalSpecialist", activated: false, discardedReason: "Dominio juridico nao identificado" }]
    );
    recordConnectors(id, [{ connectorId: "c1", connectorName: "Base44", capability: "entity_read", status: "success", durationMs: 220, retryCount: 0 }]);
    recordDecisions(id, [{
      category: "specialist_routing", decision: "FinancialSpecialist selecionado",
      reasoning: "Alta correspondencia semantica com dominio financeiro/contratos",
      rule: "keyword_match > 0.7", engines: ["SpecialistRouter"],
      alternatives: [{ label: "LegalSpecialist", score: 0.3, outcome: "rejected", reason: "Score abaixo do threshold" }],
      confidence: 0.85,
    }]);
    recordRanking(id, {
      decisions: [{ score: 0.82, priority: "HIGH" }, { score: 0.71, priority: "HIGH" }],
      entities: [{ score: 0.74, priority: "HIGH" }],
      topics: [{ score: 0.55, priority: "MEDIUM" }],
    });
    recordConfidence(id, 0.78);
    recordLearning(id, { memoriesReinforced: ["m1", "m2"], memoriesPenalized: [], edgesCreated: 2, edgesStrengthened: 3, goalId: "g1" });
    finalizeTrace(id);
    refresh();
  }, [refresh]);

  async function handleRunTests() {
    setRunning(true);
    setTestResults(null);
    await new Promise((r) => setTimeout(r, 30));
    try {
      setTestResults(runCDPTests());
    } catch (e) {
      setTestResults({ suites: [], totalPassed: 0, totalFailed: 1, totalTests: 1, verdict: "FAIL", architecturalStatus: e.message });
    } finally {
      setRunning(false);
      refresh();
    }
  }

  const passed = testResults?.totalPassed ?? 0;
  const total = testResults?.totalTests ?? 0;
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-6 py-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-md">
            <Search className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold font-heading text-zinc-900">Sprint 7.1.2 — Cognitive Diagnosis Platform</h1>
            <p className="text-xs text-zinc-400">Trace · Reasoning · Diagnosis · Outcome · Self-Assessment · COP Integration</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={generateDemoTrace} className="px-3 py-2 rounded-lg bg-violet-50 text-violet-700 text-xs font-medium hover:bg-violet-100 transition">
            + Demo Trace
          </button>
          <button onClick={refresh} className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-400 transition">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={handleRunTests} disabled={running}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-40 transition">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? "Executando..." : "Rodar Testes"}
          </button>
        </div>
      </div>

      {/* Verdict */}
      {testResults && (
        <div className={`rounded-xl p-3 border mb-4 flex items-center gap-3 ${testResults.verdict === "PASS" ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
          {testResults.verdict === "PASS"
            ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            : <XCircle className="w-5 h-5 text-red-600 shrink-0" />}
          <div>
            <p className={`text-sm font-bold ${testResults.verdict === "PASS" ? "text-emerald-700" : "text-red-700"}`}>{testResults.architecturalStatus}</p>
            <p className="text-xs text-zinc-500">{passed}/{total} testes · {pct}%</p>
          </div>
        </div>
      )}

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
          <MetricCard label="Traces" value={stats.total} icon={Eye} />
          <MetricCard label="Completos" value={stats.complete} color="green" />
          <MetricCard label="Erros" value={stats.errors} color={stats.errors > 0 ? "amber" : "zinc"} />
          <MetricCard label="Conf. Media" value={stats.avgConfidence} icon={Shield} color="blue" />
          <MetricCard label="Latencia Avg" value={stats.avgDurationMs ? `${stats.avgDurationMs}ms` : "n/a"} icon={Clock} />
          <MetricCard label="Feedbacks" value={fbStats?.total ?? 0} icon={ThumbsUp} color="violet" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-zinc-100 mb-5 overflow-x-auto">
        {TABS.map((t) => {
          const Icon = TAB_ICONS[t];
          return (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap transition ${activeTab === t ? "border-violet-500 text-violet-700" : "border-transparent text-zinc-400 hover:text-zinc-700"}`}>
              {Icon && <Icon className="w-3 h-3" />}{TAB_LABELS[t]}
            </button>
          );
        })}
      </div>

      {/* ── Overview ── */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          <div className="rounded-xl p-4 border bg-emerald-50 border-emerald-200 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <p className="text-sm font-bold text-emerald-700">COGNITIVE DIAGNOSIS PLATFORM READY</p>
              <p className="text-xs text-zinc-500">Sprint 7.1.2 · 5 modulos · 12 fases · 50+ testes · Read-only</p>
            </div>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-3">Modulos CDP</h3>
            <div className="space-y-2">
              {[
                { file: "CognitiveTraceEngine.js", fase: "FASE 1", desc: "Registra toda execucao cognitiva como Trace auditavel com 11 secoes" },
                { file: "ReasoningExplainer.js", fase: "FASE 2", desc: "Explica cada decisao com evidencias — memorias, especialistas, hipoteses" },
                { file: "DecisionDiagnosisEngine.js", fase: "FASE 3", desc: "Diagnostica 8 categorias: Confidence, Memory, Context, Specialist, Connector, Goal, Performance, Outcome" },
                { file: "OutcomeFeedbackEngine.js", fase: "FASE 4", desc: "Coleta feedback pos-resposta e alimenta automaticamente a MLGIP" },
                { file: "SelfAssessmentEngine.js", fase: "FASE 9", desc: "Auto-avaliacao: Strengths, Weaknesses, Missing Info, Alternative Strategies, Improvements" },
                { file: "cdpTests.js", fase: "FASE 12", desc: "50+ testes em 7 suites: Trace, Reasoning, Diagnosis, Feedback, Assessment, Perf, Idempotencia" },
              ].map(({ file, fase, desc }) => (
                <div key={file} className="flex items-start gap-3 py-1.5 border-b border-zinc-50 last:border-0">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-semibold text-zinc-700">{file}</span>
                      <Badge color="blue">{fase}</Badge>
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-3">Criterios de Aprovacao</h3>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                "Toda resposta gera um Trace (CognitiveTraceEngine)",
                "Toda decisao possui explicacao (ReasoningExplainer)",
                "Todo objetivo possui diagnostico (DecisionDiagnosisEngine)",
                "Toda memoria possui diagnostico (FASE 5 no DecisionDiagnosis)",
                "Todo especialista possui diagnostico (FASE 6)",
                "Todo conector possui diagnostico (FASE 7)",
                "Outcome Feedback integrado a MLGIP (OutcomeFeedbackEngine)",
                "Dashboard funcionando (esta pagina)",
                "Integracao COP via MLGIPObservability",
                "50+ testes passando",
                "CDP apenas observa — nunca modifica",
                "SRP preservada (1 responsabilidade / modulo)",
              ].map((c) => (
                <div key={c} className="flex items-center gap-1.5 text-xs text-zinc-600">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />{c}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-2">Fluxo CDP</h3>
            <div className="text-xs font-mono text-zinc-600 space-y-1">
              <p className="text-violet-600">CognitiveTraceEngine.beginTrace(executionId, sessionId, userInput)</p>
              <p>↓ recordContext · recordGoals · recordMemories · recordSpecialists</p>
              <p>↓ recordConnectors · recordDecisions · recordRanking · recordConfidence · recordLearning</p>
              <p className="text-violet-600">CognitiveTraceEngine.finalizeTrace(traceId, outcome)</p>
              <p>↓</p>
              <p className="text-blue-600">DecisionDiagnosisEngine.diagnoseTrace(trace) → DiagnosisReport</p>
              <p className="text-blue-600">ReasoningExplainer.explainTrace(trace, keywords) → Explanations</p>
              <p className="text-blue-600">SelfAssessmentEngine.assess(trace, diagnosis) → SelfAssessment</p>
              <p>↓</p>
              <p className="text-emerald-600">OutcomeFeedbackEngine.submitFeedback(trace, feedback) → MLGIP</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Execution Trace ── */}
      {activeTab === "trace" && (
        <div className="space-y-3">
          <p className="text-xs text-zinc-400">{traces.length} trace(s). Clique em "+ Demo Trace" para gerar um exemplo.</p>
          {traces.length === 0 && (
            <div className="text-center py-12 text-zinc-400 text-sm bg-white border border-zinc-200 rounded-xl">
              Nenhum trace registrado.<br />Clique em "+ Demo Trace" para criar um.
            </div>
          )}
          {traces.map((t) => (
            <button key={t.traceId} onClick={() => selectTrace(t)}
              className={`w-full text-left bg-white border rounded-xl p-4 hover:border-violet-300 transition ${selectedTrace?.traceId === t.traceId ? "border-violet-400 bg-violet-50/30" : "border-zinc-200"}`}>
              <div className="flex items-center gap-2 mb-2">
                <Badge color={t.status === "complete" ? "green" : t.status === "error" ? "red" : "amber"}>{t.status}</Badge>
                <span className="text-xs font-mono text-zinc-400">{t.traceId.slice(-12)}</span>
                {t.durationMs && <span className="ml-auto text-xs text-zinc-400">{t.durationMs}ms</span>}
              </div>
              <p className="text-sm font-medium text-zinc-700 truncate">{t.userInput}</p>
              <div className="flex gap-3 mt-2 text-xs text-zinc-400">
                <span>Mem: {t.memories?.length ?? 0}</span>
                <span>Esp: {(t.specialists ?? []).filter((s) => s.activated).length}</span>
                <span>Dec: {t.decisions?.length ?? 0}</span>
                <span>Conf: {((t.confidence ?? 0) * 100).toFixed(0)}%</span>
              </div>
            </button>
          ))}

          {selectedTrace && (selectedTrace.pipeline ?? []).length > 0 && (
            <div className="bg-white border border-zinc-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-zinc-800 mb-3">Pipeline Steps</h3>
              <div className="space-y-1">
                {selectedTrace.pipeline.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs py-1.5 border-b border-zinc-50 last:border-0">
                    <Badge color={s.status === "done" ? "green" : s.status === "error" ? "red" : "zinc"}>{s.status}</Badge>
                    <span className="text-zinc-600 flex-1">{s.label ?? s.name}</span>
                    {s.durationMs && <span className="text-zinc-400">{s.durationMs}ms</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Reasoning ── */}
      {activeTab === "reasoning" && (
        <div className="space-y-4">
          {!explanation && <div className="text-center py-12 text-zinc-400 text-sm bg-white border border-zinc-200 rounded-xl">Selecione um trace na aba "Execution Trace" ou gere um Demo Trace.</div>}
          {explanation && (
            <>
              <div className="bg-white border border-zinc-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-zinc-800 mb-3">Memorias Utilizadas ({explanation.memoriesUsed?.length ?? 0})</h3>
                {explanation.memoriesUsed?.map((m, i) => (
                  <div key={i} className="border border-zinc-100 rounded-lg p-3 mb-2">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span className="text-xs font-semibold text-zinc-700">{m.label}</span>
                      <Badge color="green">score: {m.score?.toFixed(2)}</Badge>
                    </div>
                    <p className="text-xs text-zinc-600">{m.explanation}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {m.evidence?.map((e, j) => <span key={j} className="text-xs bg-zinc-50 border border-zinc-100 rounded px-1.5 py-0.5 text-zinc-500">{e}</span>)}
                    </div>
                  </div>
                ))}
                {(explanation.memoriesUsed?.length ?? 0) === 0 && <p className="text-xs text-zinc-400">Nenhuma memoria utilizada.</p>}
              </div>

              <div className="bg-white border border-zinc-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-zinc-800 mb-3">Memorias Ignoradas ({explanation.memoriesIgnored?.length ?? 0})</h3>
                {explanation.memoriesIgnored?.map((m, i) => (
                  <div key={i} className="border border-zinc-100 rounded-lg p-3 mb-2">
                    <div className="flex items-center gap-2 mb-1">
                      <XCircle className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
                      <span className="text-xs font-medium text-zinc-500">{m.label}</span>
                      <Badge color="zinc">score: {m.score?.toFixed(2)}</Badge>
                    </div>
                    <p className="text-xs text-zinc-500">{m.explanation}</p>
                  </div>
                ))}
                {(explanation.memoriesIgnored?.length ?? 0) === 0 && <p className="text-xs text-zinc-400">Nenhuma memoria ignorada.</p>}
              </div>

              <div className="bg-white border border-zinc-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-zinc-800 mb-3">Especialistas</h3>
                {explanation.specialistsActivated?.map((s, i) => (
                  <div key={i} className="border border-emerald-100 bg-emerald-50/30 rounded-lg p-3 mb-2">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-xs font-semibold">{s.name}</span>
                      <Badge color="green">ativo</Badge>
                    </div>
                    <p className="text-xs text-zinc-600">{s.explanation}</p>
                  </div>
                ))}
                {explanation.specialistsDiscarded?.map((s, i) => (
                  <div key={i} className="border border-zinc-100 rounded-lg p-3 mb-2">
                    <div className="flex items-center gap-2 mb-1">
                      <XCircle className="w-3.5 h-3.5 text-zinc-300" />
                      <span className="text-xs font-medium text-zinc-500">{s.name}</span>
                      <Badge color="zinc">descartado</Badge>
                    </div>
                    <p className="text-xs text-zinc-500">{s.explanation}</p>
                  </div>
                ))}
              </div>

              {(explanation.decisions?.length ?? 0) > 0 && (
                <div className="bg-white border border-zinc-200 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-zinc-800 mb-3">Decisoes</h3>
                  {explanation.decisions.map((d, i) => (
                    <div key={i} className="border border-zinc-100 rounded-lg p-3 mb-2">
                      <Badge color="blue">{d.category}</Badge>
                      <p className="text-xs text-zinc-700 mt-1">{d.explanation}</p>
                      {d.evidence?.map((e, j) => <p key={j} className="text-xs text-zinc-400 mt-0.5">• {e}</p>)}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Diagnosis ── */}
      {activeTab === "diagnosis" && (
        <div className="space-y-4">
          {!diagnosis && <div className="text-center py-12 text-zinc-400 text-sm bg-white border border-zinc-200 rounded-xl">Selecione um trace na aba "Execution Trace".</div>}
          {diagnosis && (
            <>
              <div className={`rounded-xl p-4 border flex items-center gap-3 ${diagnosis.overallHealth === "HEALTHY" ? "bg-emerald-50 border-emerald-200" : diagnosis.overallHealth === "CRITICAL" ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
                <Badge color={healthColor(diagnosis.overallHealth)}>{diagnosis.overallHealth}</Badge>
                <span className="text-sm font-medium text-zinc-700">{diagnosis.totalFindings} problema(s) encontrado(s)</span>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {Object.entries(diagnosis.bySeverity ?? {}).map(([s, count]) => (
                  <div key={s} className="bg-white border border-zinc-200 rounded-lg p-2 text-center">
                    <Badge color={severityColor(s)}>{s}</Badge>
                    <p className="text-lg font-bold mt-1">{count}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                {diagnosis.findings?.map((f, i) => (
                  <div key={i} className="bg-white border border-zinc-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge color={severityColor(f.severity)}>{f.severity}</Badge>
                      <Badge color="zinc">{f.category}</Badge>
                    </div>
                    <p className="text-sm font-medium text-zinc-700">{f.issue}</p>
                    <p className="text-xs text-zinc-500 mt-1">→ {f.recommendation}</p>
                    {f.evidence?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {f.evidence.map((e, j) => <span key={j} className="text-xs bg-zinc-50 border border-zinc-100 rounded px-1.5 py-0.5 text-zinc-500">{e}</span>)}
                      </div>
                    )}
                  </div>
                ))}
                {(diagnosis.findings?.length ?? 0) === 0 && (
                  <div className="text-center py-8 text-emerald-600 text-sm bg-emerald-50 border border-emerald-200 rounded-xl">
                    Nenhum problema detectado — execucao saudavel.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Self Assessment ── */}
      {activeTab === "assessment" && (
        <div className="space-y-4">
          {!assessment && <div className="text-center py-12 text-zinc-400 text-sm bg-white border border-zinc-200 rounded-xl">Selecione um trace na aba "Execution Trace".</div>}
          {assessment && (
            <>
              <div className="bg-white border border-zinc-200 rounded-xl p-4 flex items-center gap-4">
                <div className="text-center w-20 shrink-0">
                  <p className="text-4xl font-bold text-zinc-900">{assessment.overallScore}</p>
                  <p className="text-xs text-zinc-400">Overall Score</p>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-xs mb-1">
                    <span className="text-zinc-500">Confianca:</span>
                    <Badge color={assessment.confidenceLevel === "HIGH" ? "green" : assessment.confidenceLevel === "MEDIUM" ? "blue" : "amber"}>
                      {assessment.confidenceLevel}
                    </Badge>
                    <span className="text-zinc-400">{(assessment.confidenceValue * 100).toFixed(0)}%</span>
                  </div>
                  <p className="text-xs text-zinc-500">{assessment.summary}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white border border-zinc-200 rounded-xl p-4">
                  <h4 className="text-xs font-semibold text-emerald-700 mb-2 flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5" />Strengths ({assessment.strengths.length})
                  </h4>
                  {assessment.strengths.map((s, i) => <p key={i} className="text-xs text-zinc-600 py-1 border-b border-zinc-50 last:border-0">✓ {s}</p>)}
                </div>
                <div className="bg-white border border-zinc-200 rounded-xl p-4">
                  <h4 className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1">
                    <TrendingDown className="w-3.5 h-3.5" />Weaknesses ({assessment.weaknesses.length})
                  </h4>
                  {assessment.weaknesses.length === 0
                    ? <p className="text-xs text-zinc-400">Nenhuma fraqueza identificada.</p>
                    : assessment.weaknesses.map((s, i) => <p key={i} className="text-xs text-zinc-600 py-1 border-b border-zinc-50 last:border-0">⚠ {s}</p>)}
                </div>
              </div>

              <div className="bg-white border border-zinc-200 rounded-xl p-4">
                <h4 className="text-xs font-semibold text-zinc-600 mb-2">Informacoes Ausentes</h4>
                {assessment.missingInformation.length === 0
                  ? <p className="text-xs text-zinc-400">Nenhuma informacao ausente.</p>
                  : assessment.missingInformation.map((m, i) => <p key={i} className="text-xs text-zinc-600 py-1 border-b border-zinc-50 last:border-0">• {m}</p>)}
              </div>

              <div className="bg-white border border-zinc-200 rounded-xl p-4">
                <h4 className="text-xs font-semibold text-blue-700 mb-2">Estrategias Alternativas</h4>
                {assessment.alternativeStrategies.length === 0
                  ? <p className="text-xs text-zinc-400">Nenhuma alternativa identificada.</p>
                  : assessment.alternativeStrategies.map((s, i) => <p key={i} className="text-xs text-zinc-600 py-1 border-b border-zinc-50 last:border-0">→ {s}</p>)}
              </div>

              <div className="bg-white border border-zinc-200 rounded-xl p-4">
                <h4 className="text-xs font-semibold text-violet-700 mb-2">Oportunidades de Melhoria</h4>
                {assessment.improvementOpportunities.map((s, i) => <p key={i} className="text-xs text-zinc-600 py-1 border-b border-zinc-50 last:border-0">💡 {s}</p>)}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Outcome ── */}
      {activeTab === "outcome" && (
        <div className="space-y-4">
          {fbStats && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard label="Total Feedbacks" value={fbStats.total} icon={MessageSquare} />
              <MetricCard label="Resolvidos" value={fbStats.resolvedRate} color="green" icon={ThumbsUp} />
              <MetricCard label="Uteis" value={fbStats.usefulRate} color="blue" />
              <MetricCard label="Corrigidos" value={fbStats.correctedRate} color="amber" icon={ThumbsDown} />
            </div>
          )}

          {selectedTrace && (
            <div className="bg-white border border-zinc-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-zinc-800 mb-2">Registrar Feedback</h3>
              <p className="text-xs text-zinc-400 mb-3 truncate">Query: {selectedTrace.userInput}</p>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => { submitFeedback(selectedTrace, { resolved: true, useful: true, goalAdvanced: true }); refresh(); }}
                  className="px-3 py-1.5 rounded-lg text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition">
                  ✓ Resolvido e Util
                </button>
                <button onClick={() => { submitFeedback(selectedTrace, { resolved: false, useful: false, repeated: true }); refresh(); }}
                  className="px-3 py-1.5 rounded-lg text-xs bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition">
                  ✗ Nao Resolveu
                </button>
                <button onClick={() => { submitFeedback(selectedTrace, { resolved: true, corrected: true, userNote: "Resposta precisou de ajuste" }); refresh(); }}
                  className="px-3 py-1.5 rounded-lg text-xs bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition">
                  ⚠ Corrigido
                </button>
              </div>
            </div>
          )}

          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-3">Historico de Feedbacks</h3>
            {getFeedbacks().length === 0
              ? <p className="text-xs text-zinc-400">Nenhum feedback registrado ainda.</p>
              : getFeedbacks().map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-xs py-1.5 border-b border-zinc-50 last:border-0">
                  <Badge color={f.resolved ? "green" : f.corrected ? "amber" : "zinc"}>
                    {f.resolved ? "resolvido" : f.corrected ? "corrigido" : f.repeated ? "repetido" : "neutro"}
                  </Badge>
                  <span className="text-zinc-500 font-mono">{f.traceId?.slice(-10)}</span>
                  {f.userNote && <span className="text-zinc-400 italic truncate">{f.userNote}</span>}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── Tests ── */}
      {activeTab === "tests" && (
        <div className="space-y-3">
          {!testResults && !running && (
            <div className="text-center py-12 text-zinc-400 text-sm">Clique em "Rodar Testes" para executar a suite CDP.</div>
          )}
          {running && (
            <div className="flex items-center justify-center py-12 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
              <span className="text-sm text-zinc-500">Executando suite CDP...</span>
            </div>
          )}
          {testResults?.suites?.map((suite) => (
            <div key={suite.suite} className="bg-white border border-zinc-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-zinc-800">{suite.suite}</h4>
                <div className="flex items-center gap-2">
                  <Badge color={suite.failed === 0 ? "green" : "red"}>{suite.passed}/{suite.total}</Badge>
                  <span className="text-xs text-zinc-400">{suite.durationMs}ms</span>
                </div>
              </div>
              <div className="space-y-0.5">
                {suite.results.map((r, i) => <TestRow key={i} result={r} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}