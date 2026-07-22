import React from "react";

const PROBLEM = {
  title: "Duas Fontes de Verdade",
  description:
    "Perguntas sobre estado operacional (Qual connector está ativo? GitHub está conectado?) " +
    "escapavam do RuntimeIntrospectionRouter e chegavam ao LLM. " +
    "O LLM respondia por inferência conversacional — não pelo RuntimeContext. " +
    "Resultado: divergência entre RuntimeContext.currentConnector=null e resposta='GitHub conectado.'",
  sequences: [
    { q: "Qual Connector está ativo?",   a: '"Nenhum connector registrado."', source: "RuntimeContext ✅", correct: true },
    { q: "GitHub?",                      a: '"O GitHub está conectado."',     source: "LLM (inferência) ❌", correct: false },
    { q: "Qual Connector está ativo?",   a: '"Nenhum connector registrado."', source: "RuntimeContext ✅", correct: true },
    { q: "→ DIVERGÊNCIA",               a: "Duas respostas diferentes para o mesmo estado", source: "Arquiteturalmente proibido", correct: false },
  ],
};

const FIXES = [
  {
    file: "RuntimeCapabilityRegistry.ts",
    title: "FIX 1 — Nova capability + sinais de status",
    changes: [
      "Adicionado tipo RuntimeCapabilityId: 'runtime.connector.status'",
      "Adicionada definição DEFINITIONS com 30+ sinais para perguntas de status de conector",
      "Sinais cobrem: GitHub, Drive, Gmail, Calendar em PT-BR e EN",
      "Exemplos: 'github está conectado', 'drive conectado', 'quais conectores', 'status dos conectores'",
    ],
  },
  {
    file: "RuntimeCapabilityExecutor.ts",
    title: "FIX 2 — Execução da capability de status",
    changes: [
      "Import de conversationStore adicionado para leitura dos slots de conector",
      "Case 'runtime.connector.status' implementado",
      "Lê ConversationStore.getConnectorContext(id) para cada conector registrado",
      "Fallback: verifica RuntimeContext.currentConnector quando slot ausente",
      "Resposta inclui nota explícita: '(fonte: RuntimeContext — EF-43B)'",
      "Nunca infere estado — responde apenas com dados reais dos slots",
    ],
  },
];

const FLOW = [
  { step: "1", label: "GitHub está conectado?",         component: "User input",                    ok: true  },
  { step: "2", label: "RuntimeIntrospectionRouter.intercept()", component: "EF-42 intercept",       ok: true  },
  { step: "3", label: "runtimeCapabilityRegistry.detect()",     component: "Signal match",          ok: true  },
  { step: "4", label: "Sinal: 'github está conectado'",         component: "runtime.connector.status", ok: true },
  { step: "5", label: "runtimeCapabilityExecutor.execute('runtime.connector.status')", component: "Executor", ok: true },
  { step: "6", label: "conversationStore.getConnectorContext('github')",               component: "ConversationStore read", ok: true },
  { step: "7", label: "RuntimeContext.currentConnector verificado",                    component: "RuntimeContextLayer.get()", ok: true },
  { step: "8", label: "Resposta construída a partir dos dados reais",                  component: "Executor", ok: true },
  { step: "9", label: "ResponseCandidate (confidence: 1.0, domain: general)",          component: "ExecutionOutcomeAdapterFactory", ok: true },
  { step: "10", label: "ResponseArbiter seleciona (score máximo)",                     component: "ResponseArbiter", ok: true },
  { step: "11", label: "Resposta entregue — fonte: RuntimeContext",                    component: "User output", ok: true },
];

const RULES = [
  { rule: "runtime.connector.status",  trigger: "GitHub está conectado?",         never: "LLM → 'Sim, GitHub conectado' (sem base)" },
  { rule: "runtime.connector.get",     trigger: "Qual Connector está ativo?",      never: "LLM → nome qualquer de connector" },
  { rule: "runtime.goal.get",          trigger: "Qual Goal está ativo?",           never: "LLM → goalType inferido" },
  { rule: "runtime.execution.get",     trigger: "Qual ExecutionId está ativo?",    never: "LLM → ID inventado" },
  { rule: "runtime.capability.get",    trigger: "Qual Capability está ativa?",     never: "LLM → capability inventada" },
  { rule: "runtime.intent.get",        trigger: "Existe um ExecutionIntent?",      never: "LLM → 'Sim, existe intent'" },
  { rule: "runtime.resultset.get",     trigger: "Existe um ResultSet?",            never: "LLM → 'Sim, há resultados'" },
  { rule: "runtime.artifact.get",      trigger: "Qual Artifact está ativo?",       never: "LLM → owner/repo inventado" },
];

const CERT = [
  { ok: true,  label: "runtime.connector.status capability implementada",           detail: "Executor + Registry" },
  { ok: true,  label: "Sinais para GitHub/Drive/Gmail/Calendar registrados",        detail: "30+ signals PT-BR + EN" },
  { ok: true,  label: "Lê ConversationStore slots (fonte real)",                    detail: "Não infere — lê estado real" },
  { ok: true,  label: "Fallback: RuntimeContext.currentConnector",                  detail: "Quando slot ausente" },
  { ok: true,  label: "Resposta indica fonte explícita (EF-43B)",                  detail: "Rastreável pelo usuário" },
  { ok: true,  label: "Arquivos proibidos não alterados",                           detail: "Pipeline/Planner/GoalBridge intactos" },
  { ok: true,  label: "RuntimeIntrospectionRouter não alterado",                    detail: "Extensão via Registry + Executor" },
  { ok: false, label: "Validação em runtime pendente",                              detail: "Executar sequência de testes abaixo" },
];

const TESTS = [
  { seq: 1, msg: "Qual Connector está ativo?",    expected: "Nenhum connector registrado nesta sessão",    path: "RuntimeContext.currentConnector = null" },
  { seq: 2, msg: "GitHub está conectado?",         expected: "Status real do slot 'github' no ConversationStore", path: "runtime.connector.status → ConversationStore" },
  { seq: 3, msg: "Mostre o RuntimeContext",        expected: "RuntimeContext.currentConnector deve ser igual à resposta anterior", path: "runtime.context.dump" },
  { seq: 4, msg: "Qual Connector está ativo?",     expected: "Idêntico ao resultado do item 3",            path: "Consistência obrigatória" },
  { seq: 5, msg: "Liste meus repositórios GitHub", expected: "Executar github.repos.list → RuntimeContext atualizado", path: "Execução real" },
  { seq: 6, msg: "GitHub está conectado?",         expected: "✅ GitHub: Conectado — Último uso: [timestamp]", path: "ConversationStore slot 'github' atualizado" },
  { seq: 7, msg: "Qual Connector está ativo?",     expected: "`github` (idêntico ao RuntimeContext.currentConnector)", path: "Consistência pós-execução" },
];

export default function SprintEF43BPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="border border-zinc-700 rounded-xl p-6 bg-zinc-900/80">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs bg-violet-800 text-violet-200 px-2 py-0.5 rounded font-bold">EF-43B</span>
            <span className="text-xs bg-orange-800 text-orange-200 px-2 py-0.5 rounded font-bold">Runtime Truth Enforcement</span>
            <span className="text-xs bg-green-800 text-green-200 px-2 py-0.5 rounded font-bold">FIXED</span>
          </div>
          <h1 className="text-2xl font-bold text-white">EF-43B — Runtime Truth Enforcement</h1>
          <p className="text-zinc-400 text-sm mt-1">
            RuntimeContext torna-se a ÚNICA fonte oficial de verdade sobre o estado operacional.
            Nenhuma resposta pode divergir do estado real persistido.
          </p>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Arquivos alterados",         value: "2" },
              { label: "Arquivos proibidos alterados", value: "0" },
              { label: "Nova capability",            value: "runtime.connector.status" },
              { label: "Sinais adicionados",         value: "30+" },
            ].map(m => (
              <div key={m.label} className="bg-zinc-800 rounded-lg p-3 border border-zinc-700">
                <div className="text-zinc-400 text-xs">{m.label}</div>
                <div className="text-white font-bold text-sm mt-1">{m.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Problem */}
        <div className="border border-red-700 rounded-xl p-5 bg-red-900/10">
          <h2 className="text-red-400 font-bold text-sm uppercase mb-3">🔴 Problema: {PROBLEM.title}</h2>
          <p className="text-zinc-400 text-sm mb-4">{PROBLEM.description}</p>
          <div className="space-y-2">
            {PROBLEM.sequences.map((s, i) => (
              <div key={i} className={`flex items-start gap-3 rounded-lg p-3 border ${s.correct ? "bg-zinc-900 border-zinc-700" : "bg-red-900/20 border-red-800"}`}>
                <div className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 font-bold ${s.correct ? "bg-zinc-700 text-zinc-300" : "bg-red-800 text-red-200"}`}>{i + 1}</div>
                <div className="flex-1">
                  <div className="text-white text-sm">❓ {s.q}</div>
                  <div className={`text-sm mt-0.5 ${s.correct ? "text-green-400" : "text-red-400"}`}>💬 {s.a}</div>
                  <div className="text-zinc-500 text-xs mt-0.5">fonte: {s.source}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Fixes */}
        <div className="space-y-4">
          {FIXES.map(fix => (
            <div key={fix.file} className="border border-green-700 rounded-xl overflow-hidden">
              <div className="px-5 py-3 bg-green-900/30 border-b border-green-800 flex items-center gap-3">
                <span className="text-green-400 font-bold text-sm">✅ {fix.title}</span>
                <span className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded">{fix.file}</span>
              </div>
              <ul className="px-5 py-4 bg-zinc-900/60 space-y-1.5">
                {fix.changes.map((c, i) => (
                  <li key={i} className="text-zinc-300 text-sm flex items-start gap-2">
                    <span className="text-green-500 flex-shrink-0">•</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Flow */}
        <div className="border border-zinc-700 rounded-xl overflow-hidden">
          <div className="px-5 py-3 bg-zinc-800/60 border-b border-zinc-700">
            <h2 className="text-white font-bold text-sm">Fluxo: "GitHub está conectado?" pós EF-43B</h2>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {FLOW.map(f => (
              <div key={f.step} className={`px-5 py-3 flex items-start gap-4 ${f.ok ? "bg-zinc-900/60" : "bg-red-900/20"}`}>
                <div className="w-7 h-7 rounded-full bg-violet-900 border border-violet-700 flex items-center justify-center text-xs font-bold text-violet-300 flex-shrink-0">{f.step}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-medium">{f.label}</div>
                  <div className="text-zinc-500 text-xs">{f.component}</div>
                </div>
                <div className="text-lg flex-shrink-0">{f.ok ? "✅" : "❌"}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Rules */}
        <div className="border border-blue-700 rounded-xl p-5 bg-blue-900/10">
          <h2 className="text-blue-400 font-bold text-sm uppercase mb-3">Tabela de Rotas EF-43B</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-700">
                  <th className="text-left py-2 pr-4">Capability</th>
                  <th className="text-left py-2 pr-4">Pergunta capturada</th>
                  <th className="text-left py-2 text-red-400">NUNCA (proibido)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {RULES.map(r => (
                  <tr key={r.rule} className="hover:bg-zinc-800/40">
                    <td className="py-2 pr-4 text-violet-400 font-mono">{r.rule}</td>
                    <td className="py-2 pr-4 text-zinc-300">{r.trigger}</td>
                    <td className="py-2 text-red-400">{r.never}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tests */}
        <div className="border border-zinc-700 rounded-xl overflow-hidden">
          <div className="px-5 py-3 bg-zinc-800/60 border-b border-zinc-700">
            <h2 className="text-white font-bold text-sm">Testes de Regressão Obrigatórios</h2>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {TESTS.map(t => (
              <div key={t.seq} className="px-5 py-3 bg-zinc-900/60 hover:bg-zinc-800/40 transition-colors">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-bold">#{t.seq}</span>
                  <span className="text-white text-sm">❓ {t.msg}</span>
                </div>
                <div className="text-green-400 text-xs ml-6">→ {t.expected}</div>
                <div className="text-zinc-600 text-xs ml-6 mt-0.5">caminho: {t.path}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Certification */}
        <div className="border border-zinc-700 rounded-xl p-5 bg-zinc-900/60">
          <h2 className="text-zinc-300 font-bold text-sm uppercase mb-3">📋 Certificação EF-43B</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {CERT.map(c => (
              <div key={c.label} className={`rounded-lg p-3 border ${c.ok ? "bg-zinc-800 border-zinc-700" : "bg-yellow-900/20 border-yellow-700"}`}>
                <div className="text-base mb-1">{c.ok ? "✅" : "⏳"}</div>
                <div className="text-zinc-200 font-medium">{c.label}</div>
                <div className="text-zinc-500 mt-0.5">{c.detail}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 p-4 bg-zinc-800/60 rounded-lg border border-zinc-700 text-xs text-zinc-400">
            <strong className="text-zinc-200">Princípio arquitetural (EF-43B):</strong>{" "}
            Toda resposta sobre estado operacional do MemoryOS deve ser derivada exclusivamente do RuntimeContext
            ou de uma capability realmente executada. Nunca por inferência conversacional.
            O RuntimeContext é a única fonte oficial de verdade.
          </div>
        </div>

      </div>
    </div>
  );
}