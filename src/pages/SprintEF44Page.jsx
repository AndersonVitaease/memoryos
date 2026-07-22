import React from "react";

const PROBLEM = {
  title: "Resposta afirmativa sem ExecutionOutcome SUCCESS",
  examples: [
    {
      trigger: "Drive connector retornou: google-drive.drive.downloadFile requires workspaceId",
      response: '"Encontrei o arquivo."',
      why: "O step retornou status=completed mas output={ error: 'requires workspaceId' }. O Synthesizer tratou como dados reais e o LLM sintetizou afirmativamente.",
    },
    {
      trigger: "Nenhum ExecutionOutcome SUCCESS existia",
      response: '"Li todos os arquivos do Drive."',
      why: "O prompt de síntese não instruía o LLM a verificar se os dados representavam erro. O LLM inferiu sucesso a partir de dados vazios.",
    },
  ],
};

const ROOT_CAUSES = [
  {
    id: "RC-1",
    file: "ConnectorResultSynthesizer.ts",
    location: "filtro de completedSteps",
    description: "completedSteps filtrava por status=completed && output!==null, mas não verificava se o output era um objeto de erro puro (apenas chaves: error, message, code). Esses steps eram tratados como dados reais.",
    fix: "Adicionado filtro EF-44: steps cujo output contém APENAS chaves error-like são excluídos de completedSteps → caem no path de erro.",
  },
  {
    id: "RC-2",
    file: "ConnectorResultSynthesizer.ts",
    location: "completedSteps.length === 0 → _buildErrorResponse(result)",
    description: "Quando todos os steps tinham outputs de erro, _buildErrorResponse usava result.errors — que pode estar vazio mesmo quando o step retornou { error: '...' }. A mensagem de erro do output era perdida.",
    fix: "Adicionado _buildErrorResponseFromMessage(): extrai a mensagem de erro do output do step e retorna resposta clara ao usuário.",
  },
  {
    id: "RC-3",
    file: "ConnectorResultSynthesizer.ts",
    location: "_buildSynthesisPrompt()",
    description: "O prompt instrui o LLM a 'apresentar os dados'. Sem regra explícita de verificação de erro, o LLM inferiu sucesso a partir de dados vazios ou ambíguos.",
    fix: "Adicionadas REGRAS OBRIGATÓRIAS (EF-44): o LLM é explicitamente proibido de afirmar sucesso quando os dados são vazios, de erro ou sem informação real.",
  },
];

const FLOW = [
  { step: "1", label: "Connector executa",      result: "output = { error: 'requires workspaceId' }",   pass: false },
  { step: "2", label: "status = completed?",     result: "SIM (o executor completou sem exceção)",        pass: false, note: "Bug anterior: passava para completedSteps" },
  { step: "3", label: "EF-44: isErrorOnly()?",   result: "SIM — keys = ['error'] apenas",                pass: true,  note: "NOVO: step rejeitado de completedSteps" },
  { step: "4", label: "completedSteps.length?",  result: "0 → path de erro",                             pass: true },
  { step: "5", label: "Extrai erro do output",   result: "'requires workspaceId'",                       pass: true,  note: "NOVO: _buildErrorResponseFromMessage()" },
  { step: "6", label: "Resposta ao usuário",     result: "\"Não foi possível acessar o arquivo...\"",    pass: true },
];

const PROMPT_RULES = [
  "NUNCA afirmar que encontrou, leu, baixou ou acessou dados se os dados estiverem vazios ou forem erro",
  "Se output contiver apenas campos 'error', 'message' ou 'reason' → reportar o problema claramente",
  "Se items/messages/files/events estiverem vazios → dizer que não foram encontrados resultados",
  "NUNCA inventar ou inferir dados que não estejam explicitamente no JSON",
  "Se os dados forem válidos → apresentar normalmente",
];

const FILES_CHANGED = [
  { file: "ConnectorResultSynthesizer.ts", changes: ["Filtro EF-44 em completedSteps", "_buildErrorResponseFromMessage()", "Prompt EF-44 com REGRAS OBRIGATÓRIAS"] },
];

const TESTS = [
  { seq: 1, scenario: "Drive sem workspaceId", expected: "Mensagem de erro clara, NÃO 'Encontrei o arquivo'" },
  { seq: 2, scenario: "Arquivo não encontrado (404)", expected: "Mensagem de não encontrado, NÃO afirmação de sucesso" },
  { seq: 3, scenario: "Lista de repositórios (sucesso real)", expected: "Listagem normal — sem regressão" },
  { seq: 4, scenario: "Gmail inbox vazio", expected: "'Não foram encontrados emails' — sem inventar mensagens" },
  { seq: 5, scenario: "Drive token expirado", expected: "Mensagem de reconexão, NÃO 'Li os arquivos'" },
  { seq: 6, scenario: "GitHub repos.list sucesso", expected: "Lista de repos — comportamento normal preservado" },
];

const CERT = [
  { ok: true,  label: "RC-1 corrigido", detail: "completedSteps filtra outputs error-only" },
  { ok: true,  label: "RC-2 corrigido", detail: "_buildErrorResponseFromMessage() extrai erro do output" },
  { ok: true,  label: "RC-3 corrigido", detail: "Prompt EF-44 proíbe afirmações sem dados reais" },
  { ok: true,  label: "Connectors intactos", detail: "Zero mudanças em GitHub/Drive/Gmail/Calendar connectors" },
  { ok: true,  label: "Pipeline intacto", detail: "Zero mudanças no ConversationPipeline" },
  { ok: true,  label: "Arbiter intacto", detail: "Zero mudanças no ResponseArbiter" },
  { ok: false, label: "Validação em runtime pendente", detail: "Executar: Drive sem config → verificar resposta" },
];

export default function SprintEF44Page() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="border border-zinc-700 rounded-xl p-6 bg-zinc-900/80">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs bg-red-800 text-red-200 px-2 py-0.5 rounded font-bold">EF-44</span>
            <span className="text-xs bg-green-800 text-green-200 px-2 py-0.5 rounded font-bold">FIXED</span>
            <span className="text-xs bg-yellow-800 text-yellow-200 px-2 py-0.5 rounded font-bold">VERIFIED EXECUTION LAYER</span>
          </div>
          <h1 className="text-2xl font-bold text-white">EF-44 — Verified Execution Layer</h1>
          <p className="text-zinc-400 text-sm mt-1">
            O sistema afirmava sucesso mesmo quando a capability retornou erro. Corrigido em 1 arquivo, 3 pontos de mudança.
          </p>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Arquivo alterado", value: "1" },
              { label: "Root causes", value: "3" },
              { label: "Connectors alterados", value: "0" },
              { label: "Pipeline alterado", value: "Não" },
            ].map(m => (
              <div key={m.label} className="bg-zinc-800 rounded-lg p-3 border border-zinc-700">
                <div className="text-zinc-400 text-xs">{m.label}</div>
                <div className="text-white font-bold text-sm mt-1">{m.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Problem */}
        <div className="border border-red-800 rounded-xl p-5 bg-red-900/10">
          <h2 className="text-red-400 font-bold text-sm uppercase mb-3">🔴 Problema Identificado</h2>
          <div className="space-y-3">
            {PROBLEM.examples.map((ex, i) => (
              <div key={i} className="bg-zinc-900/60 rounded-lg p-4 border border-red-900">
                <div className="text-xs text-zinc-500 uppercase mb-1">Trigger</div>
                <code className="text-orange-300 text-sm block mb-2">{ex.trigger}</code>
                <div className="text-xs text-zinc-500 uppercase mb-1">Resposta errada</div>
                <div className="text-red-300 text-sm mb-2">{ex.response}</div>
                <div className="text-xs text-zinc-500 uppercase mb-1">Por quê</div>
                <div className="text-zinc-400 text-xs">{ex.why}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Root Causes */}
        <div className="border border-zinc-700 rounded-xl overflow-hidden">
          <div className="px-5 py-3 bg-zinc-800/60 border-b border-zinc-700">
            <h2 className="text-white font-bold text-sm">Root Causes & Fixes</h2>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {ROOT_CAUSES.map(rc => (
              <div key={rc.id} className="px-5 py-4 bg-zinc-900/60">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-xs bg-red-900 text-red-300 px-2 py-0.5 rounded font-bold">{rc.id}</span>
                  <code className="text-zinc-300 text-sm">{rc.file}</code>
                  <span className="text-xs text-zinc-500">→ {rc.location}</span>
                </div>
                <p className="text-zinc-400 text-xs mb-2">{rc.description}</p>
                <div className="text-green-400 text-xs bg-green-900/20 rounded p-2 border border-green-900">
                  ✅ Fix: {rc.fix}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Corrected flow */}
        <div className="border border-zinc-700 rounded-xl overflow-hidden">
          <div className="px-5 py-3 bg-zinc-800/60 border-b border-zinc-700">
            <h2 className="text-white font-bold text-sm">Fluxo Corrigido — Drive workspaceId Error</h2>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {FLOW.map(f => (
              <div key={f.step} className="px-5 py-3 bg-zinc-900/60 flex items-start gap-4 hover:bg-zinc-800/40 transition-colors">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${f.pass ? "bg-green-900 border border-green-700 text-green-300" : "bg-red-900 border border-red-700 text-red-300"}`}>{f.step}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-white text-sm">{f.label}</span>
                    {f.note && <span className="text-xs bg-blue-900/40 text-blue-300 px-1.5 py-0.5 rounded">{f.note}</span>}
                  </div>
                  <code className="text-zinc-400 text-xs">{f.result}</code>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Prompt Rules */}
        <div className="border border-zinc-700 rounded-xl p-5 bg-zinc-900/60">
          <h2 className="text-zinc-300 font-bold text-sm uppercase mb-3">Regras Obrigatórias no Prompt (EF-44)</h2>
          <div className="space-y-2">
            {PROMPT_RULES.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="text-red-400 font-bold flex-shrink-0">⛔</span>
                <span className="text-zinc-300">{r}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tests */}
        <div className="border border-zinc-700 rounded-xl overflow-hidden">
          <div className="px-5 py-3 bg-zinc-800/60 border-b border-zinc-700">
            <h2 className="text-white font-bold text-sm">Testes de Regressão</h2>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {TESTS.map(t => (
              <div key={t.seq} className="px-5 py-3 bg-zinc-900/60 hover:bg-zinc-800/40 transition-colors flex items-start gap-3">
                <span className="text-xs bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-bold flex-shrink-0">#{t.seq}</span>
                <div>
                  <div className="text-white text-sm">{t.scenario}</div>
                  <div className="text-green-400 text-xs mt-0.5">→ {t.expected}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cert */}
        <div className="border border-zinc-700 rounded-xl p-5 bg-zinc-900/60">
          <h2 className="text-zinc-300 font-bold text-sm uppercase mb-3">📋 Certificação EF-44</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {CERT.map(c => (
              <div key={c.label} className={`rounded-lg p-3 border ${c.ok ? "bg-zinc-800 border-zinc-700" : "bg-yellow-900/20 border-yellow-700"}`}>
                <div className="text-base mb-1">{c.ok ? "✅" : "⏳"}</div>
                <div className="text-zinc-200 font-medium">{c.label}</div>
                <div className="text-zinc-500 mt-0.5">{c.detail}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 p-4 bg-zinc-800/60 rounded-lg border border-zinc-700 text-xs text-zinc-400">
            <strong className="text-zinc-200">Princípio EF-44 (Verified Execution Layer):</strong>{" "}
            Nenhuma resposta afirmativa pode ser gerada sem um ExecutionOutcome com dados reais.
            Output de erro é detectado antes de chegar ao LLM. O LLM é instruído explicitamente a
            reportar falhas, não a inferir sucesso. Essa camada é transparente para connectors, pipeline e arbiter.
          </div>
        </div>

      </div>
    </div>
  );
}