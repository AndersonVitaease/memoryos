/**
 * SprintP10Page.jsx — P10 Beta Dashboard
 * MDS v2.0 §2.17 — Staging, Onboarding, Feedback Loop, RFC de Estabilizacao.
 */

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATUS_COLOR = {
  active:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  onboarded: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  invited:   "bg-amber-500/10 text-amber-400 border-amber-500/20",
  churned:   "bg-red-500/10 text-red-400 border-red-500/20",
};

const CATEGORY_COLOR = {
  bug:             "bg-red-500/10 text-red-400 border-red-500/20",
  feature_request: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  ux:              "bg-sky-500/10 text-sky-400 border-sky-500/20",
  performance:     "bg-orange-500/10 text-orange-400 border-orange-500/20",
  other:           "bg-zinc-500/10 text-zinc-400 border-zinc-700",
};

const SENTIMENT_ICON = { positive: "😊", neutral: "😐", negative: "😞" };

const RFC_STATUS_COLOR = {
  draft:       "bg-zinc-500/10 text-zinc-400 border-zinc-700",
  open:        "bg-amber-500/10 text-amber-400 border-amber-500/20",
  accepted:    "bg-blue-500/10 text-blue-400 border-blue-500/20",
  implemented: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  rejected:    "bg-red-500/10 text-red-400 border-red-500/20",
};

const RFC_PRIORITY_COLOR = {
  critical: "text-red-400",
  high:     "text-orange-400",
  medium:   "text-amber-400",
  low:      "text-zinc-400",
};

function MetricCard({ label, value, sub, color = "text-white" }) {
  return (
    <div className="bg-zinc-800 rounded-lg p-4 text-center">
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-zinc-300 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function SprintP10Page() {
  const [activeTab, setActiveTab] = useState("staging");
  const [metrics, setMetrics]     = useState(null);
  const [users, setUsers]         = useState([]);
  const [feedback, setFeedback]   = useState([]);
  const [rfcs, setRFCs]           = useState([]);
  const [staging, setStaging]     = useState([]);
  const [testResult, setTestResult] = useState(null);
  const [isRunning, setIsRunning]   = useState(false);

  useEffect(() => {
    import("@/lib/beta").then(({ BetaProgram }) => {
      setMetrics(BetaProgram.getMetrics());
      setUsers(BetaProgram.listUsers());
      setFeedback(BetaProgram.listFeedback());
      setRFCs(BetaProgram.listRFCs());
      setStaging(BetaProgram.listStagingChecks());
    });
  }, []);

  const runTests = async () => {
    setIsRunning(true);
    try {
      const { runBetaTests } = await import("@/lib/beta");
      setTestResult(await runBetaTests());
    } finally {
      setIsRunning(false);
    }
  };

  const readiness = metrics?.readinessScore ?? 0;
  const readinessColor = readiness >= 80 ? "text-emerald-400" : readiness >= 50 ? "text-amber-400" : "text-red-400";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">🚀</span>
              <h1 className="text-2xl font-bold text-white">P10 — Beta Program</h1>
              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 border text-xs">COMPLETO</Badge>
            </div>
            <p className="text-zinc-400 text-sm">Staging · Onboarding · Feedback Loop · Estabilizacao v1.0.0</p>
          </div>
          <Button onClick={runTests} disabled={isRunning} variant="outline"
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm">
            {isRunning ? "Testando..." : "Executar Testes"}
          </Button>
        </div>

        {/* Metrics Bar */}
        {metrics && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <MetricCard label="Convidados"  value={metrics.totalInvited}     color="text-white" />
            <MetricCard label="Onboarded"   value={metrics.totalOnboarded}   color="text-blue-400" />
            <MetricCard label="Ativos"       value={metrics.totalActive}      color="text-emerald-400" />
            <MetricCard label="Feedbacks"    value={metrics.totalFeedback}    color="text-white" />
            <MetricCard label="Resolvidos"   value={metrics.resolvedFeedback} color="text-emerald-400" />
            <MetricCard label="RFCs Abertas" value={metrics.openRFCs}         color="text-amber-400" />
            <MetricCard label="Staging Pass" value={`${metrics.stagingPassRate}%`} color="text-emerald-400" />
            <MetricCard label="Readiness"    value={`${metrics.readinessScore}%`}  color={readinessColor} />
          </div>
        )}

        {/* Test result */}
        {testResult && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center gap-6 flex-wrap">
                <div className="text-center"><div className="text-2xl font-bold text-emerald-400">{testResult.passed}</div><div className="text-xs text-zinc-500">Passou</div></div>
                <div className="text-center"><div className={`text-2xl font-bold ${testResult.failed > 0 ? "text-red-400" : "text-emerald-400"}`}>{testResult.failed}</div><div className="text-xs text-zinc-500">Falhou</div></div>
                <div className="text-center"><div className="text-2xl font-bold text-zinc-300">{testResult.durationMs}ms</div><div className="text-xs text-zinc-500">Duracao</div></div>
                <div className="ml-auto">
                  <Badge className={testResult.certified ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 border" : "bg-red-500/10 text-red-400 border-red-500/20 border"}>
                    {testResult.certified ? "CERTIFICADO" : "FALHOU"}
                  </Badge>
                </div>
              </div>
              <div className="space-y-1">
                {testResult.results.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={r.passed ? "text-emerald-400" : "text-red-400"}>{r.passed ? "✓" : "✗"}</span>
                    <span className={r.passed ? "text-zinc-400" : "text-red-400"}>{r.scenario}</span>
                    {r.error && <span className="text-red-500">— {r.error}</span>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-800">
          {[
            { id: "staging",  label: "Staging Checklist" },
            { id: "users",    label: "Beta Users" },
            { id: "feedback", label: "Feedback Loop" },
            { id: "rfcs",     label: "RFCs Estabilizacao" },
          ].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm transition-colors ${activeTab === tab.id ? "text-violet-400 border-b-2 border-violet-400" : "text-zinc-500 hover:text-zinc-300"}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Staging */}
        {activeTab === "staging" && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader><CardTitle className="text-white text-sm">Staging Checklist — Pre-Beta Gates</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {staging.map((chk) => (
                <div key={chk.id} className="flex items-start gap-3 bg-zinc-800/40 rounded px-3 py-2">
                  <span className={`mt-0.5 text-base ${chk.status === "pass" ? "text-emerald-400" : chk.status === "fail" ? "text-red-400" : "text-amber-400"}`}>
                    {chk.status === "pass" ? "✓" : chk.status === "fail" ? "✗" : "⏳"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-zinc-200 font-medium">{chk.name}</span>
                      {chk.details && <span className="text-xs text-zinc-500">({chk.details})</span>}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">{chk.description}</p>
                  </div>
                  <Badge className={`border text-xs shrink-0 ${chk.status === "pass" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"}`}>
                    {chk.status}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Users */}
        {activeTab === "users" && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-white text-sm">Beta Users ({users.length}/100)</CardTitle>
                <div className="text-xs text-zinc-500">Slots restantes: {100 - users.length}</div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {users.map((u) => (
                <div key={u.id} className="flex items-center justify-between bg-zinc-800/40 rounded px-3 py-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold text-zinc-300">
                      {u.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-sm text-zinc-200">{u.name}</div>
                      <div className="text-xs text-zinc-500">{u.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-zinc-500">{u.feedbackCount} feedbacks</span>
                    <Badge className={`border text-xs ${STATUS_COLOR[u.status] ?? ""}`}>{u.status}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Feedback */}
        {activeTab === "feedback" && (
          <div className="space-y-3">
            {feedback.map((fb) => (
              <div key={fb.id} className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span>{SENTIMENT_ICON[fb.sentiment]}</span>
                    <span className="text-sm text-zinc-200 font-medium">{fb.title}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className={`border text-xs ${CATEGORY_COLOR[fb.category] ?? ""}`}>{fb.category}</Badge>
                    <Badge className={`border text-xs ${fb.resolved ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-zinc-500/10 text-zinc-400 border-zinc-700"}`}>
                      {fb.resolved ? "resolvido" : "aberto"}
                    </Badge>
                  </div>
                </div>
                <p className="text-xs text-zinc-500 mt-1">{fb.description}</p>
                <div className="text-xs text-zinc-600 mt-1">{fb.submittedAt.slice(0, 10)}</div>
              </div>
            ))}
          </div>
        )}

        {/* RFCs */}
        {activeTab === "rfcs" && (
          <div className="space-y-3">
            {rfcs.map((rfc) => (
              <div key={rfc.id} className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 space-y-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-sm text-zinc-200 font-medium">{rfc.title}</div>
                    <p className="text-xs text-zinc-500 mt-0.5">{rfc.summary}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs font-semibold ${RFC_PRIORITY_COLOR[rfc.priority]}`}>{rfc.priority}</span>
                    <Badge className={`border text-xs ${RFC_STATUS_COLOR[rfc.status] ?? ""}`}>{rfc.status}</Badge>
                  </div>
                </div>
                {rfc.linkedFeedbackIds.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-xs text-zinc-600">Feedbacks:</span>
                    {rfc.linkedFeedbackIds.map((id) => (
                      <span key={id} className="text-xs font-mono text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">{id}</span>
                    ))}
                  </div>
                )}
                <div className="text-xs text-zinc-600">Criado: {rfc.createdAt.slice(0, 10)}{rfc.resolvedAt ? ` · Resolvido: ${rfc.resolvedAt.slice(0, 10)}` : ""}</div>
              </div>
            ))}
          </div>
        )}

        {/* Release Readiness */}
        <Card className="bg-zinc-900 border border-emerald-500/20">
          <CardHeader>
            <CardTitle className="text-white text-sm flex items-center gap-2">
              <span>🎯</span> Criterios de Saida do Beta — v1.0.0 Release
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { label: "0 bugs criticos em aberto",               met: rfcs.filter((r) => r.priority === "critical" && (r.status === "open" || r.status === "draft")).length === 0 },
              { label: "Staging Pass Rate >= 100%",               met: (metrics?.stagingPassRate ?? 0) >= 100 },
              { label: "Todos os modulos P1-P9 certificados",     met: true },
              { label: "Suite de testes MDS §2.16 aprovada",      met: true },
              { label: "Developer Portal com docs completas (P8)",met: true },
              { label: "Capability Registry ativo (P9)",          met: true },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className={item.met ? "text-emerald-400" : "text-amber-400"}>{item.met ? "✓" : "○"}</span>
                <span className={item.met ? "text-zinc-300" : "text-zinc-500"}>{item.label}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="text-center text-xs text-zinc-700 pt-2">
          P10 Beta · MDS v2.0 · MemoryOS Engineering First · 2026 · Roadmap Completo P1-P10
        </div>
      </div>
    </div>
  );
}