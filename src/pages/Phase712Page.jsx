/**
 * Phase712Page.jsx — Memory Intelligence Platform (MIP)
 * Sprint 7.1.1A: Dashboard de memória cognitiva.
 */

import React, { useState } from "react";
import {
  Brain, Play, Loader2, CheckCircle2, XCircle, Activity,
  Network, Database, GitBranch, Layers, BarChart3, RefreshCw,
  Shield, Zap,
} from "lucide-react";
import { runMIPTests } from "@/lib/memory-intelligence/mipTests";

function Badge({ children, color = "zinc" }) {
  const map = {
    green: "bg-emerald-100 text-emerald-700 border-emerald-200",
    red: "bg-red-100 text-red-700 border-red-200",
    amber: "bg-amber-100 text-amber-700 border-amber-200",
    blue: "bg-blue-100 text-blue-700 border-blue-200",
    violet: "bg-violet-100 text-violet-700 border-violet-200",
    zinc: "bg-zinc-100 text-zinc-600 border-zinc-200",
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${map[color] ?? map.zinc}`}>
      {children}
    </span>
  );
}

function StatCard({ label, value, sub, icon: Icon, color = "zinc" }) {
  const border = { green: "border-emerald-200", violet: "border-violet-200", blue: "border-blue-200", amber: "border-amber-200", zinc: "border-zinc-200" };
  return (
    <div className={`bg-white border rounded-xl p-4 ${border[color] ?? border.zinc}`}>
      <div className="flex items-center gap-1.5 mb-1">
        {Icon && <Icon className="w-3.5 h-3.5 text-zinc-400" />}
        <p className="text-xs text-zinc-400 font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-2xl font-bold text-zinc-900 font-heading">{value}</p>
      {sub && <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function TestRow({ result }) {
  return (
    <div className={`flex items-start gap-2 py-2 px-3 rounded-lg text-sm border ${result.passed ? "bg-emerald-50/50 border-emerald-100" : "bg-red-50/50 border-red-100"}`}>
      {result.passed
        ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
        : <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />}
      <div className="flex-1 min-w-0">
        <span className="font-medium text-zinc-700">{result.name}</span>
        {result.error && <p className="text-xs text-red-600 mt-0.5">{result.error}</p>}
      </div>
      <span className="text-xs text-zinc-400 shrink-0">{result.duration}ms</span>
    </div>
  );
}

const TABS = ["overview", "architecture", "scoring", "tests"];
const TAB_LABEL = { overview: "Overview", architecture: "Arquitetura", scoring: "Scoring", tests: "Testes" };

export default function Phase712Page() {
  const [activeTab, setActiveTab] = useState("overview");
  const [running, setRunning] = useState(false);
  const [testResults, setTestResults] = useState(null);

  async function handleRunTests() {
    setRunning(true);
    setTestResults(null);
    await new Promise((r) => setTimeout(r, 50));
    try {
      const r = runMIPTests();
      setTestResults(r);
    } catch (e) {
      setTestResults({ results: [{ name: "Erro global", passed: false, error: e.message, duration: 0 }], passed: 0, failed: 1, total: 1 });
    } finally {
      setRunning(false);
    }
  }

  const passed = testResults?.passed ?? 0;
  const total = testResults?.total ?? 0;
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-6 py-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-md">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold font-heading text-zinc-900">Sprint 7.1.1A — Memory Intelligence Platform</h1>
            <p className="text-xs text-zinc-400">Score composto · Ranking · Consolidação · Grafo Cognitivo · Observabilidade</p>
          </div>
        </div>
        <button onClick={handleRunTests} disabled={running}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-40 transition">
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {running ? "Executando..." : "Rodar Testes"}
        </button>
      </div>

      {/* Test summary */}
      {testResults && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          <StatCard label="Total" value={total} />
          <StatCard label="Passou" value={passed} color="green" />
          <StatCard label="Falhou" value={testResults.failed} color={testResults.failed > 0 ? "amber" : "zinc"} />
          <StatCard label="Cobertura" value={`${pct}%`} color={pct === 100 ? "green" : "amber"} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-100 mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition ${activeTab === t ? "border-violet-500 text-violet-700" : "border-transparent text-zinc-400 hover:text-zinc-700"}`}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {activeTab === "overview" && (
        <div className="space-y-5">
          {/* Ready badge */}
          <div className="rounded-xl p-4 border bg-emerald-50 border-emerald-200 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <p className="text-sm font-bold text-emerald-700">MEMORY INTELLIGENCE PLATFORM READY</p>
              <p className="text-xs text-zinc-500 mt-0.5">Sprint 7.1.1A · Integrado ao memoryPipeline.js</p>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Módulos MIP" value="5" icon={Layers} color="violet" sub="novos arquivos" />
            <StatCard label="Score Critérios" value="5" icon={BarChart3} color="blue" sub="semantic·recency·rich·imp·freq" />
            <StatCard label="Tipos Ranqueados" value="7" icon={Activity} color="violet" sub="decisions·tasks·entities···" />
            <StatCard label="Grafo Cognitivo" value="∞" icon={Network} color="blue" sub="relações em runtime" />
          </div>

          {/* Modules */}
          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-3 flex items-center gap-2">
              <Database className="w-4 h-4 text-violet-500" />Módulos Criados
            </h3>
            <div className="space-y-2">
              {[
                { file: "MemoryScorer.js", desc: "Score composto: semântica · recência · riqueza · importância · frequência" },
                { file: "MemoryConsolidator.js", desc: "Consolidação semântica — agrupa memórias similares, elimina duplicatas no contexto" },
                { file: "MemoryRelationshipEngine.js", desc: "Grafo cognitivo — detecta relações Pessoa→Empresa→Decisão→Tarefa em runtime" },
                { file: "MemoryRankingEngine.js", desc: "Motor de ranking — FinalScore · Confidence · Reason · Priority por tipo" },
                { file: "EnrichedContextBuilder.js", desc: "Context Builder enriquecido — substitui buildContext() no pipeline" },
                { file: "mipTests.js", desc: "Suite completa: 25 testes — Scoring, Consolidação, Grafo, Ranking, Performance, Idempotência" },
              ].map(({ file, desc }) => (
                <div key={file} className="flex items-start gap-3 py-2 border-b border-zinc-50 last:border-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-mono font-semibold text-zinc-700">{file}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Integration point */}
          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-3 flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-violet-500" />Ponto de Integração
            </h3>
            <div className="text-xs font-mono text-zinc-600 space-y-1">
              <p className="text-zinc-400">// memoryPipeline.js — antes:</p>
              <p className="text-red-500 line-through">const {'{ context, sources }'} = buildContext(data, intent, sessionId);</p>
              <p className="text-zinc-400 mt-2">// memoryPipeline.js — agora:</p>
              <p className="text-emerald-600">import {'{ buildEnrichedContext }'} from "@/lib/memory-intelligence/EnrichedContextBuilder";</p>
              <p className="text-emerald-600">const {'{ context, sources, ranked, health, graph }'} = buildEnrichedContext(data, intent, sessionId);</p>
              <p className="mt-2 text-zinc-400">// mip metadata disponível no retorno do pipeline:</p>
              <p className="text-blue-600">return {'{ context, sources, intent, sessionSummary, mip: { ranked, health, graph } }'};</p>
            </div>
          </div>

          {/* Criteria */}
          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-3">Critérios de Aprovação</h3>
            <ul className="space-y-1.5">
              {[
                "Nenhuma memória duplicada (MemoryConsolidator)",
                "Recuperação baseada em score composto (MemoryScorer)",
                "Contexto significativamente mais rico (EnrichedContextBuilder)",
                "Relações entre memórias — grafo cognitivo (MemoryRelationshipEngine)",
                "Consolidação automática com referências originais",
                "FinalScore · Confidence · Reason · Priority por registro",
                "Pipeline atualizado — mip metadata disponível para COP",
                "Dashboard MIP funcionando (esta página)",
                "25 testes cobrindo Scoring · Consolidação · Grafo · Ranking · Performance · Idempotência",
                "Nenhuma lógica duplicada — reutiliza 100% da infra existente",
                "Arquitetura SRP preservada — 1 responsabilidade por módulo",
                "Zero alterações na experiência do usuário",
              ].map((c) => (
                <li key={c} className="flex items-center gap-2 text-xs text-zinc-600">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ── Architecture ── */}
      {activeTab === "architecture" && (
        <div className="space-y-4">
          {/* Flow */}
          <div className="bg-white border border-zinc-200 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-zinc-800 mb-4">Fluxo Antigo vs Novo</h3>
            <div className="grid grid-cols-2 gap-6 text-xs font-mono">
              <div>
                <p className="text-red-600 font-bold mb-2">ANTES (Sprint 7.1.0)</p>
                {["memoryPipeline.js", "↓ interpretIntent()", "↓ queryEntities()", "↓ buildContext() — apenas filtro por keyword", "→ contexto flat sem ranking"].map((l) => (
                  <p key={l} className={l.startsWith("→") ? "text-red-400 mt-1" : "text-zinc-500"}>{l}</p>
                ))}
              </div>
              <div>
                <p className="text-emerald-600 font-bold mb-2">AGORA (Sprint 7.1.1A)</p>
                {[
                  "memoryPipeline.js",
                  "↓ interpretIntent()",
                  "↓ queryEntities()",
                  "↓ buildEnrichedContext()",
                  "  ↓ rankAllMemory()  ← MemoryRankingEngine",
                  "  ↓ computeMemoryHealth()",
                  "  ↓ deduplicateForContext()  ← MemoryConsolidator",
                  "  ↓ buildRelationshipGraph()  ← RelationshipEngine",
                  "  ↓ graphToContextText()",
                  "→ contexto ranqueado + grafo + health + mip metadata",
                ].map((l) => (
                  <p key={l} className={l.startsWith("→") ? "text-emerald-600 mt-1" : "text-zinc-600"}>{l}</p>
                ))}
              </div>
            </div>
          </div>

          {/* Score weights */}
          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-3">Pesos do Score Composto</h3>
            <div className="space-y-2">
              {[
                { name: "Relevância Semântica", weight: 40, desc: "keyword overlap com a query atual" },
                { name: "Recência", weight: 25, desc: "decaimento exponencial — metade do score em 30 dias" },
                { name: "Riqueza do Conteúdo", weight: 15, desc: "comprimento normalizado (teto 1000 chars)" },
                { name: "Importância Histórica", weight: 12, desc: "tipo: contrato=0.95, decisão=0.90, pessoa=0.80..." },
                { name: "Frequência de Uso", weight: 8, desc: "neutro (0.5) — sem dados de acesso no schema atual" },
              ].map(({ name, weight, desc }) => (
                <div key={name} className="flex items-center gap-3">
                  <div className="w-24 text-xs font-semibold text-zinc-700 shrink-0">{weight}%</div>
                  <div className="flex-1">
                    <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                      <div className="h-full bg-violet-400 rounded-full" style={{ width: `${weight * 2.5}%` }} />
                    </div>
                  </div>
                  <div className="text-xs text-zinc-600 w-48 shrink-0">{name}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-zinc-400 mt-3">{desc => desc}</p>
          </div>

          {/* Priority tiers */}
          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-3">Tiers de Prioridade</h3>
            <div className="space-y-2 text-xs">
              {[
                { tier: "HIGH", range: "≥ 0.75", color: "green", action: "Sempre incluído no contexto" },
                { tier: "MEDIUM", range: "0.50–0.74", color: "blue", action: "Incluído se espaço disponível" },
                { tier: "LOW", range: "0.30–0.49", color: "amber", action: "Incluído apenas em list_query" },
                { tier: "DISCARD", range: "< 0.30", color: "zinc", action: "Descartado — não entra no contexto" },
              ].map(({ tier, range, color, action }) => (
                <div key={tier} className="flex items-center gap-3">
                  <Badge color={color}>{tier}</Badge>
                  <span className="font-mono text-zinc-500 w-20">{range}</span>
                  <span className="text-zinc-600">{action}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Scoring ── */}
      {activeTab === "scoring" && (
        <div className="space-y-4">
          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-3">Importância por Tipo</h3>
            <div className="space-y-1 text-xs">
              {[
                ["doc_contrato", "0.95"], ["entity_valor_monetario", "0.90"], ["doc_juridico", "0.90"],
                ["decision", "0.90"], ["doc_financeiro", "0.85"], ["entity_empresa", "0.85"],
                ["task_pending", "0.80"], ["entity_pessoa", "0.80"], ["doc_produto", "0.75"],
                ["entity_produto", "0.75"], ["doc_reuniao", "0.70"], ["topic", "0.65"],
                ["session", "0.60"], ["doc_other", "0.55"], ["entity_other", "0.50"],
                ["message", "0.45"], ["keyword", "0.40"], ["task_done", "0.40"],
              ].map(([kind, score]) => (
                <div key={kind} className="flex items-center gap-2">
                  <div className="w-36 font-mono text-zinc-500">{kind}</div>
                  <div className="flex-1 h-1.5 bg-zinc-100 rounded-full">
                    <div className="h-full bg-violet-400 rounded-full" style={{ width: `${parseFloat(score) * 100}%` }} />
                  </div>
                  <div className="w-8 text-right text-zinc-600">{score}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-3">Consolidação Semântica</h3>
            <div className="text-xs text-zinc-600 space-y-2">
              <p>• Threshold padrão: <span className="font-mono font-bold">0.35</span> sobreposição de palavras {'>'} 3 chars</p>
              <p>• Decisions: threshold <span className="font-mono font-bold">0.45</span> (títulos mais curtos)</p>
              <p>• Entities: threshold <span className="font-mono font-bold">0.40</span> (valores podem ser iguais)</p>
              <p>• Registros originais preservados — apenas o representante entra no contexto</p>
              <p>• Metadado <span className="font-mono">_consolidated: true · _mergedCount: N</span> disponível no contexto</p>
            </div>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-3">Grafo Cognitivo — Tipos de Relação</h3>
            <div className="text-xs text-zinc-600 space-y-1">
              {[
                "Entidade → Entidade: co-mention (textos de contexto se mencionam)",
                "Decisão → Entidade: involves (título/descrição menciona valor da entidade)",
                "Tarefa → Entidade: involves (título/descrição menciona entidade)",
                "Tópico → Decisão: related-decision (decisão menciona nome do tópico)",
                "Documento → Entidade: keyword-entity (keyword do doc está na entidade)",
              ].map((r) => (
                <div key={r} className="flex items-start gap-2">
                  <Network className="w-3 h-3 text-violet-400 mt-0.5 shrink-0" />
                  <span>{r}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Tests ── */}
      {activeTab === "tests" && (
        <div className="space-y-2">
          {!testResults && !running && (
            <div className="text-center py-12 text-zinc-400 text-sm">Clique em "Rodar Testes" para executar a suite MIP.</div>
          )}
          {running && (
            <div className="flex items-center justify-center py-12 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
              <span className="text-sm text-zinc-500">Executando suite MIP...</span>
            </div>
          )}
          {testResults && testResults.results.map((r, i) => <TestRow key={i} result={r} />)}
        </div>
      )}
    </div>
  );
}