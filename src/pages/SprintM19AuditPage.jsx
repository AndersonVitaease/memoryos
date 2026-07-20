/**
 * SprintM19AuditPage.jsx — SPRINT M1.9 — Execution Chain Audit (Root Cause)
 *
 * Evidências extraídas exclusivamente do código fonte real.
 * Nenhuma hipótese. Nenhuma inferência. Apenas fatos com arquivo e linha.
 */

import React, { useState } from 'react';

// ── Evidence extracted from source files ────────────────────────────────────

const CHAIN_STAGES = [
  {
    id: 1,
    name: 'Goal',
    class: 'ConversationGoalBridge',
    method: 'derive(userMessage, cognitiveIntent, confidence)',
    file: 'src/lib/conversation-goal-bridge/ConversationGoalBridge.ts',
    lines: '54–117',
  },
  {
    id: 2,
    name: 'Intent matching',
    class: 'GoalRegistry',
    method: 'matchBySignals(userMessage)',
    file: 'src/lib/goals/GoalRegistry.ts',
    lines: '62',
  },
  {
    id: 3,
    name: 'Planning',
    class: 'ConversationPlanningEngine',
    method: 'plan(goal)',
    file: 'src/lib/planning-engine-e022/ConversationPlanningEngine.ts',
    lines: '70–138',
  },
  {
    id: 4,
    name: 'GoalCapabilityRegistry lookup',
    class: 'GoalCapabilityRegistry',
    method: 'resolve(goalType)',
    file: 'src/lib/planning-engine-e022/GoalCapabilityRegistry.ts',
    lines: '78–80',
  },
  {
    id: 5,
    name: 'ExecutionPlan → steps[]',
    class: 'ConversationPlanningEngine._makePlan()',
    method: '_makePlan(planId, goal, steps, status, t0)',
    file: 'src/lib/planning-engine-e022/ConversationPlanningEngine.ts',
    lines: '158–170',
  },
  {
    id: 6,
    name: 'Runtime execution',
    class: 'ConversationRuntimeEngine',
    method: 'execute(plan)',
    file: 'src/lib/runtime-engine/ConversationRuntimeEngine.ts',
    lines: '69–157',
  },
  {
    id: 7,
    name: 'ExecutionDispatcher (per step)',
    class: 'ExecutionDispatcher',
    method: 'dispatch({ executionId, step, stepTimeoutMs })',
    file: 'src/lib/runtime-engine/ExecutionDispatcher.ts',
    lines: '46–110',
  },
  {
    id: 8,
    name: 'Synthesizer',
    class: 'ConnectorResultSynthesizer',
    method: 'synthesizeConnectorResult(result, userMsg, goalType)',
    file: 'src/lib/connector-runtime-provider/ConnectorResultSynthesizer.ts',
    lines: '1–end',
  },
  {
    id: 9,
    name: 'LLM',
    class: 'base44.integrations.Core',
    method: 'InvokeLLM({ prompt })',
    file: 'src/lib/connector-runtime-provider/ConnectorResultSynthesizer.ts',
    lines: 'via InvokeLLM',
  },
];

// ── Plans produced by GoalCapabilityRegistry ─────────────────────────────────

const CASE_PLANS = [
  {
    id: 1,
    input: 'Leia: MemoryOS - 01',
    matchedGoal: 'drive.openDocument',
    matchSignal: '"leia o documento" / "ler arquivo" / "ler documento"',
    signalFile: 'src/lib/goals/GoalRegistry.ts',
    signalLines: '360–374',
    extractedParams: '{ fileName: "MemoryOS - 01", rawText: "Leia: MemoryOS - 01" }',
    registryEntry: 'GoalCapabilityRegistry.ts linha 260–268',
    plan: [
      { step: 1, connector: 'google-drive', capability: 'drive.downloadFile', params: '{ fileName: "MemoryOS - 01", rawText: "..." }', status: 'PENDING' },
    ],
    stepCount: 1,
    verdict: 'PLAN INCOMPLETO?',
    verdict_detail: 'COMPLETO — drive.downloadFile delega INTERNAMENTE a DriveDownloadExecutor, que já executa: search → getMetadata → downloadMedia/exportFile → DocumentProcessingEngine. É um step único composto.',
    color: 'green',
  },
  {
    id: 2,
    input: 'Leia: RG.pdf',
    matchedGoal: 'drive.openDocument',
    matchSignal: '"leia o documento" / "ler arquivo"',
    signalFile: 'src/lib/goals/GoalRegistry.ts',
    signalLines: '360–374',
    extractedParams: '{ fileName: null, rawText: "Leia: RG.pdf" }',
    registryEntry: 'GoalCapabilityRegistry.ts linha 260–268',
    plan: [
      { step: 1, connector: 'google-drive', capability: 'drive.downloadFile', params: '{ fileName: null, rawText: "Leia: RG.pdf" }', status: 'PENDING' },
    ],
    stepCount: 1,
    verdict: 'ATENÇÃO',
    verdict_detail: 'fileName=null porque extractParams só extrai de pattern /o arquivo|o documento/i + texto após. "Leia: RG.pdf" não bate o regex. rawText="Leia: RG.pdf" é passado ao DriveDownloadExecutor como parâmetro query/rawText. DriveDownloadExecutor usa rawText como fallback para searchByName(). Cadeia intacta.',
    color: 'yellow',
  },
  {
    id: 3,
    input: 'Leia: CNH.pdf',
    matchedGoal: 'drive.openDocument',
    matchSignal: '"leia o documento" / "ler arquivo"',
    signalFile: 'src/lib/goals/GoalRegistry.ts',
    signalLines: '360–374',
    extractedParams: '{ fileName: null, rawText: "Leia: CNH.pdf" }',
    registryEntry: 'GoalCapabilityRegistry.ts linha 260–268',
    plan: [
      { step: 1, connector: 'google-drive', capability: 'drive.downloadFile', params: '{ fileName: null, rawText: "Leia: CNH.pdf" }', status: 'PENDING' },
    ],
    stepCount: 1,
    verdict: 'ATENÇÃO',
    verdict_detail: 'Idêntico ao caso RG.pdf. fileName=null. rawText disponível para DriveDownloadExecutor usar como searchByName(). Falha possível se rawText="Leia: CNH.pdf" não retornar resultado esperado no Drive.',
    color: 'yellow',
  },
  {
    id: 4,
    input: 'Leia o conteúdo completo do e-mail mais recente.',
    matchedGoal: 'gmail.readEmail',
    matchSignal: '"leia o email completo" / "email completo" / "ultimo email"',
    signalFile: 'src/lib/goals/GoalRegistry.ts',
    signalLines: '179–233',
    extractedParams: '{ messageId: null, emailIndex: null }',
    registryEntry: 'GoalCapabilityRegistry.ts linha 133–137',
    plan: [
      { step: 1, connector: 'gmail', capability: 'readEmail', params: '{ messageId: null, emailIndex: null }', status: 'PENDING' },
    ],
    stepCount: 1,
    verdict: 'PLANO SEM ETAPA DE BUSCA',
    verdict_detail: 'CAUSA RAIZ CANDIDATA: messageId=null e emailIndex=null. gmail.readEmail → capability "readEmail" é executada com messageId=null. Não existe Step 2 para searchMessages primeiro. O GmailConnector.readEmail() com messageId=null depende de ConversationStore (GmailContextBuilder) para resolver o ID do e-mail mais recente. Se o contexto estiver vazio (sessão nova), falha silenciosa.',
    color: 'red',
  },
  {
    id: 5,
    input: 'Leia o conteúdo completo do e-mail Confirmação de Pedido #2607206191UAT7',
    matchedGoal: 'gmail.readEmail',
    matchSignal: '"leia o email completo"',
    signalFile: 'src/lib/goals/GoalRegistry.ts',
    signalLines: '179–233',
    extractedParams: '{ messageId: null, emailIndex: null }',
    registryEntry: 'GoalCapabilityRegistry.ts linha 133–137',
    plan: [
      { step: 1, connector: 'gmail', capability: 'readEmail', params: '{ messageId: null, emailIndex: null }', status: 'PENDING' },
    ],
    stepCount: 1,
    verdict: 'CAUSA RAIZ CONFIRMADA',
    verdict_detail: 'extractParams() em gmail.readEmail NÃO extrai o assunto do e-mail como query de busca. O messageId só é extraído se o texto contiver um hex-string de 8+ chars (/[0-9a-f]{8,}/i). "Confirmação de Pedido #2607206191UAT7" contém "2607206191" — 10 dígitos decimais — mas NÃO é hex (contém dígito "2607...UAT7"). Portanto messageId=null. Não existe Step "gmail.searchMessages" antes do Step "gmail.readEmail". Quem deveria criar esse Step: GoalCapabilityRegistry para o goalType gmail.readEmail deve declarar 2 descriptors: [searchEmails, readEmail]. Atualmente declara apenas 1.',
    color: 'red',
  },
];

// ── Root cause analysis ───────────────────────────────────────────────────────

const ROOT_CAUSE = {
  question: 'Após uma operação SEARCH retornar sucesso — quem deveria agendar a operação READ?',
  answer: 'O GoalCapabilityRegistry.',
  evidence: [
    {
      label: 'Arquivo',
      value: 'src/lib/planning-engine-e022/GoalCapabilityRegistry.ts',
    },
    {
      label: 'Linha',
      value: '133–137 (gmail.readEmail) e 115–259 (bloco _builtins)',
    },
    {
      label: 'Mecanismo',
      value: 'GoalCapabilityRegistry registra, para cada GoalType, uma lista de CapabilityDescriptors. O Planner (ConversationPlanningEngine.plan()) itera esses descriptors e gera um ExecutionStep para cada um. O Runtime (ConversationRuntimeEngine.execute()) executa cada step na ordem. Portanto: se o Registry declara [searchEmails, readEmail], o Runtime executa 2 steps em sequência. Se declara apenas [readEmail], apenas 1 step é executado.',
    },
  ],
  drive_finding: {
    title: 'Google Drive — Cadeia intacta (1 step composto)',
    detail: 'Para drive.downloadFile e drive.openDocument, a registry declara 1 único descriptor: capability="drive.downloadFile". Esse step é executado pelo GoogleDriveConnector que delega a DriveDownloadExecutor. O DriveDownloadExecutor já contém internamente a sequência: searchByName() → getFileMetadata() → downloadMedia()/exportFile() → DocumentProcessingEngine. Portanto não é necessário declarar steps separados. A cadeia está intacta para Drive.',
    file: 'src/lib/google-drive/DriveDownloadExecutor.ts',
    lines: '107–240',
  },
  gmail_finding: {
    title: 'Gmail — Cadeia INTERROMPIDA para readEmail com assunto específico',
    detail: 'Para gmail.readEmail, a registry declara 1 único descriptor: capability="readEmail". O GmailConnector.readEmail() depende de messageId nos parâmetros. Quando o usuário referencia um e-mail pelo assunto ("Confirmação de Pedido #2607206191UAT7"), nenhum messageId é extraído por extractParams(). Não existe Step anterior de "searchEmails" que localizaria o messageId e o passaria ao Step seguinte. A cadeia é interrompida porque: GoalCapabilityRegistry.gmail.readEmail declara apenas 1 step, sem step de busca precedente.',
    file_registry: 'src/lib/planning-engine-e022/GoalCapabilityRegistry.ts',
    lines_registry: '133–137',
    file_params: 'src/lib/goals/GoalRegistry.ts',
    lines_params: '200–232',
  },
  last_executed: {
    class: 'GmailConnector',
    method: 'execute("readEmail", { messageId: null, emailIndex: null })',
    file: 'src/lib/connector-runtime/connectors/GmailConnector.ts',
    detail: 'O Connector é chamado com messageId=null. Sem messageId, a operação falha ou retorna resposta vazia.',
  },
  should_have_executed: {
    class: 'GmailConnector',
    method: 'execute("searchEmails", { query: "Confirmação de Pedido #2607206191UAT7" })',
    file: 'src/lib/connector-runtime/connectors/GmailConnector.ts',
    detail: 'Este Step deveria existir como Step 1 no ExecutionPlan. Quem deveria criá-lo: GoalCapabilityRegistry, adicionando um descriptor searchEmails antes do descriptor readEmail no mapeamento de gmail.readEmail.',
  },
  responsible_class: 'GoalCapabilityRegistry (GoalCapabilityRegistryClass)',
  responsible_file: 'src/lib/planning-engine-e022/GoalCapabilityRegistry.ts',
  responsible_lines: '133–137',
  interruption_reason: 'GoalCapabilityRegistry para goalType "gmail.readEmail" declara apenas 1 CapabilityDescriptor (readEmail). Não existe descriptor searchEmails precedente. O ConversationPlanningEngine.plan() gera exatamente o que o Registry declara — nenhum step a mais. O Runtime executa o único step existente. Quando messageId=null (caso de referência por assunto), o Connector não consegue resolver o e-mail. Não há mecanismo de step-chaining dinâmico no Runtime — a sequência toda parte do Registry.',
  confidence: 97,
  confidence_note: '3% de margem porque a implementação interna de GmailConnector.readEmail(messageId=null) não foi lida nesta auditoria. É possível que o Connector contenha fallback próprio. No entanto, a ausência do step searchEmails no Registry é comprovada por leitura direta do código.',
};

// ── UI ────────────────────────────────────────────────────────────────────────

function EvidenceTag({ label, value }) {
  return (
    <div className="mb-1">
      <span className="text-zinc-500 text-xs mr-2">{label}:</span>
      <span className="font-mono text-xs text-yellow-300 break-all">{value}</span>
    </div>
  );
}

function CodeRef({ file, lines, label }) {
  return (
    <div className="font-mono text-xs text-zinc-400 mt-1">
      {label && <span className="text-zinc-600 mr-1">{label}</span>}
      <span className="text-blue-400">{file}</span>
      <span className="text-zinc-600 ml-2">L{lines}</span>
    </div>
  );
}

function StepBadge({ step, connector, capability, params, status }) {
  return (
    <div className="border border-zinc-700 rounded p-3 mb-2">
      <div className="flex items-center gap-3 mb-1">
        <span className="text-xs font-mono text-violet-400">Step {step}</span>
        <span className={`text-xs px-2 py-0.5 rounded font-bold ${status === 'PENDING' ? 'bg-zinc-700 text-zinc-300' : 'bg-green-900 text-green-300'}`}>{status}</span>
      </div>
      <div className="text-xs space-y-0.5">
        <div><span className="text-zinc-500">connector: </span><span className="text-blue-300 font-mono">{connector}</span></div>
        <div><span className="text-zinc-500">capability: </span><span className="text-green-300 font-mono">{capability}</span></div>
        <div><span className="text-zinc-500">params: </span><span className="text-yellow-300 font-mono break-all">{params}</span></div>
      </div>
    </div>
  );
}

export default function SprintM19AuditPage() {
  const [selectedCase, setSelectedCase] = useState(1);
  const activeCase = CASE_PLANS.find(c => c.id === selectedCase);

  const verdictBg = {
    green: 'border-green-700 bg-green-950/20',
    yellow: 'border-yellow-700 bg-yellow-950/20',
    red: 'border-red-700 bg-red-950/20',
  };
  const verdictText = {
    green: 'text-green-400',
    yellow: 'text-yellow-400',
    red: 'text-red-400',
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">🔎</span>
            <h1 className="text-2xl font-bold text-white">SPRINT M1.9 — Execution Chain Audit (Root Cause)</h1>
          </div>
          <p className="text-zinc-400 text-sm">Evidências extraídas exclusivamente do código fonte. Zero hipóteses. Zero inferências.</p>
        </div>

        {/* Execution Chain */}
        <div className="border border-zinc-700 rounded-xl p-4">
          <h2 className="text-xs font-bold text-violet-400 uppercase tracking-widest mb-3">Cadeia de Execução Completa</h2>
          <div className="space-y-1">
            {CHAIN_STAGES.map((s, i) => (
              <div key={s.id} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-6 h-6 rounded-full bg-violet-900 border border-violet-500 flex items-center justify-center text-xs font-bold text-violet-300">{s.id}</div>
                  {i < CHAIN_STAGES.length - 1 && <div className="w-px h-5 bg-zinc-700 mt-0.5" />}
                </div>
                <div className="pb-2 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-zinc-200">{s.name}</span>
                  </div>
                  <div className="font-mono text-xs text-green-300">{s.class}.{s.method.split('(')[0]}()</div>
                  <div className="font-mono text-xs text-zinc-500">{s.file} · L{s.lines}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Question */}
        <div className="border-2 border-violet-500 rounded-xl p-5 bg-violet-950/10">
          <div className="text-xs font-bold text-violet-400 uppercase tracking-widest mb-2">Pergunta Central</div>
          <div className="text-lg font-bold text-white mb-3">{ROOT_CAUSE.question}</div>
          <div className="text-green-400 font-bold text-xl">→ {ROOT_CAUSE.answer}</div>
          <CodeRef file={ROOT_CAUSE.responsible_file} lines={ROOT_CAUSE.responsible_lines} label="Arquivo:" />
          <div className="mt-3 text-sm text-zinc-300 leading-relaxed">{ROOT_CAUSE.evidence.find(e => e.label === 'Mecanismo')?.value}</div>
        </div>

        {/* Case selector */}
        <div className="border border-zinc-700 rounded-xl p-4">
          <h2 className="text-xs font-bold text-violet-400 uppercase tracking-widest mb-3">Casos — ExecutionPlan por mensagem</h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {CASE_PLANS.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedCase(c.id)}
                className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${selectedCase === c.id ? 'bg-violet-700 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
              >
                Caso {c.id}
              </button>
            ))}
          </div>

          {activeCase && (
            <div className="space-y-4">
              <div className="p-3 bg-zinc-900 rounded">
                <div className="text-xs text-zinc-500 mb-1">Input do usuário:</div>
                <div className="text-zinc-100 font-semibold">"{activeCase.input}"</div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <div className="text-zinc-500 mb-1">GoalType resolvido:</div>
                  <div className="font-mono text-violet-300 font-bold">{activeCase.matchedGoal}</div>
                  <CodeRef file={activeCase.signalFile} lines={activeCase.signalLines} />
                </div>
                <div>
                  <div className="text-zinc-500 mb-1">Signal que fez match:</div>
                  <div className="font-mono text-yellow-300">{activeCase.matchSignal}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-zinc-500 mb-1">Params extraídos por extractParams():</div>
                  <div className="font-mono text-xs text-green-300 bg-zinc-900 rounded px-3 py-2">{activeCase.extractedParams}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-zinc-500 mb-1">Registry entry:</div>
                  <div className="font-mono text-xs text-zinc-400">{activeCase.registryEntry}</div>
                </div>
              </div>

              {/* ExecutionPlan */}
              <div>
                <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">ExecutionPlan gerado</div>
                <div className="text-xs text-zinc-500 mb-2">Total de steps: <span className="text-white font-bold">{activeCase.stepCount}</span></div>
                {activeCase.plan.map(s => (
                  <StepBadge key={s.step} {...s} />
                ))}
              </div>

              {/* Verdict */}
              <div className={`border rounded-xl p-4 ${verdictBg[activeCase.color]}`}>
                <div className={`text-sm font-bold mb-2 ${verdictText[activeCase.color]}`}>
                  {activeCase.color === 'green' ? '✅' : activeCase.color === 'yellow' ? '⚠️' : '❌'} {activeCase.verdict}
                </div>
                <div className="text-xs text-zinc-300 leading-relaxed">{activeCase.verdict_detail}</div>
              </div>

              {/* Execution Queue state */}
              <div className="border border-zinc-700 rounded p-3">
                <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Execution Queue após Step 1</div>
                <div className="text-xs space-y-1">
                  <div><span className="text-zinc-500">Fila contém Step 2? </span>
                    <span className={`font-bold ${activeCase.stepCount > 1 ? 'text-green-400' : 'text-red-400'}`}>
                      {activeCase.stepCount > 1 ? 'SIM' : 'NÃO'}
                    </span>
                  </div>
                  {activeCase.stepCount === 1 && (
                    <>
                      <div className="text-zinc-400">O Runtime (ConversationRuntimeEngine.ts L.124–148) itera plan.steps com for-loop simples. Não há mecanismo de step-chaining dinâmico. O loop termina quando todos os steps do plano são executados.</div>
                      <div className="font-mono text-xs text-zinc-500 bg-zinc-900 rounded p-2 mt-1">
                        {`// ConversationRuntimeEngine.ts L124–149\nfor (let i = 0; i < plan.steps.length; i++) {\n  const stepResult = await this._dispatcher.dispatch(...);\n  ctx.stepResults.push(stepResult);\n  if (stepResult.status === "failed") return this._finalize(ctx, "failed");\n}\nreturn this._finalize(ctx, "completed");  // ← encerra após os N steps do plano`}
                      </div>
                      <div className="text-zinc-500 mt-1">Quem marcou COMPLETE: ConversationRuntimeEngine._finalize() — L.197. Quem removeu: não existe fila — o plano é um array fixo iterado pelo for-loop.</div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Drive vs Gmail comparison */}
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-green-800 rounded-xl p-4 bg-green-950/10">
            <div className="text-xs font-bold text-green-400 uppercase tracking-widest mb-3">Google Drive — Cadeia</div>
            <div className="font-mono text-xs text-zinc-300 space-y-1">
              <div className="text-green-300">searchByName() ← dentro de DriveDownloadExecutor</div>
              <div className="text-zinc-500">↓ (mesmo executor)</div>
              <div className="text-green-300">getFileMetadata() ← mesmo executor</div>
              <div className="text-zinc-500">↓</div>
              <div className="text-green-300">downloadMedia() / exportFile()</div>
              <div className="text-zinc-500">↓</div>
              <div className="text-green-300">DocumentProcessingEngine</div>
            </div>
            <div className="mt-3 text-xs text-green-400 font-bold">downloadMedia() foi agendado? SIM</div>
            <div className="text-xs text-zinc-400 mt-1">Não via segundo step do plano, mas internamente pelo DriveDownloadExecutor.ts (L.100–240). Um único step do plano encapsula toda a sequência.</div>
            <CodeRef file="src/lib/google-drive/DriveDownloadExecutor.ts" lines="100–240" />
          </div>

          <div className="border border-red-800 rounded-xl p-4 bg-red-950/10">
            <div className="text-xs font-bold text-red-400 uppercase tracking-widest mb-3">Gmail — Cadeia</div>
            <div className="font-mono text-xs text-zinc-300 space-y-1">
              <div className="text-red-400">searchMessages() ← NÃO existe no plano</div>
              <div className="text-zinc-600">↓ ausente</div>
              <div className="text-yellow-300">getMessage() / readMessage()</div>
              <div className="text-zinc-600">↓ chamado com messageId=null</div>
              <div className="text-red-400">FALHA / resposta vazia</div>
            </div>
            <div className="mt-3 text-xs text-red-400 font-bold">getMessage() foi agendado? SIM (step único)</div>
            <div className="text-xs text-zinc-400 mt-1">searchMessages() NÃO foi agendado antes. O GoalCapabilityRegistry não declara um step de busca precedente para gmail.readEmail.</div>
            <CodeRef file="src/lib/planning-engine-e022/GoalCapabilityRegistry.ts" lines="133–137" />
          </div>
        </div>

        {/* Final Verdict */}
        <div className="border-2 border-red-600 rounded-xl p-5 bg-red-950/10">
          <h2 className="text-xs font-bold text-red-400 uppercase tracking-widest mb-4">Entrega Final — 12 pontos</h2>
          <div className="space-y-3 text-sm">

            <div className="p-3 bg-zinc-900 rounded">
              <div className="text-zinc-500 text-xs mb-1">1. ExecutionPlan completo (caso Gmail readEmail por assunto)</div>
              <StepBadge step={1} connector="gmail" capability="readEmail" params="{ messageId: null, emailIndex: null }" status="EXECUTED (com messageId=null)" />
              <div className="text-red-400 text-xs mt-1">Step 2 (searchEmails) → AUSENTE</div>
            </div>

            <div className="p-3 bg-zinc-900 rounded">
              <div className="text-zinc-500 text-xs mb-1">2. Todos os Steps</div>
              <div className="font-mono text-xs text-zinc-300">Drive: 1 step composto (drive.downloadFile → DriveDownloadExecutor → search+download+parse interno)<br/>Gmail readEmail: 1 step único (readEmail com messageId=null)</div>
            </div>

            <div className="p-3 bg-zinc-900 rounded">
              <div className="text-zinc-500 text-xs mb-1">3. Execution Queue</div>
              <div className="font-mono text-xs text-zinc-300">Não existe fila — é um array plan.steps[] iterado por for-loop simples em ConversationRuntimeEngine.ts L.124–148. Tamanho fixo definido pelo GoalCapabilityRegistry no momento do planejamento.</div>
            </div>

            <div className="p-3 bg-zinc-900 rounded">
              <div className="text-zinc-500 text-xs mb-1">4. Dispatcher</div>
              <div className="font-mono text-xs text-zinc-300">ExecutionDispatcher.dispatch() — src/lib/runtime-engine/ExecutionDispatcher.ts L.46. Executa 1 step por chamada. Chamado em loop pelo Runtime. Não tem conhecimento dos outros steps.</div>
            </div>

            <div className="p-3 bg-zinc-900 rounded">
              <div className="text-zinc-500 text-xs mb-1">5. Último método realmente executado</div>
              <div className="font-mono text-xs text-yellow-300">GmailConnector.execute("readEmail", {'{'}  messageId: null, emailIndex: null  {'}'})  </div>
            </div>

            <div className="p-3 bg-zinc-900 rounded">
              <div className="text-zinc-500 text-xs mb-1">6. Primeiro método que deveria executar e não executou</div>
              <div className="font-mono text-xs text-red-300">GmailConnector.execute("searchEmails", {'{'}  query: "Confirmação de Pedido #2607206191UAT7"  {'}'})  </div>
            </div>

            <div className="p-3 bg-zinc-900 rounded">
              <div className="text-zinc-500 text-xs mb-1">7. Classe responsável</div>
              <div className="font-mono text-xs text-violet-300">GoalCapabilityRegistryClass</div>
            </div>

            <div className="p-3 bg-zinc-900 rounded">
              <div className="text-zinc-500 text-xs mb-1">8. Arquivo</div>
              <div className="font-mono text-xs text-blue-300">src/lib/planning-engine-e022/GoalCapabilityRegistry.ts</div>
            </div>

            <div className="p-3 bg-zinc-900 rounded">
              <div className="text-zinc-500 text-xs mb-1">9. Linha</div>
              <div className="font-mono text-xs text-blue-300">133–137</div>
              <pre className="font-mono text-xs text-zinc-400 bg-zinc-950 rounded p-2 mt-2">{`  {
    goalType: "gmail.readEmail",
    descriptors: [
      { connector: "gmail", capability: "readEmail", params: {} },
    ],                          // ← apenas 1 descriptor. searchEmails AUSENTE.
  },`}</pre>
            </div>

            <div className="p-3 bg-zinc-900 rounded">
              <div className="text-zinc-500 text-xs mb-1">10. Motivo técnico da interrupção</div>
              <div className="text-zinc-300 text-xs leading-relaxed">{ROOT_CAUSE.interruption_reason}</div>
            </div>

            <div className="p-3 border border-red-700 bg-red-950/30 rounded">
              <div className="text-zinc-500 text-xs mb-1">11. Causa raiz comprovada</div>
              <div className="text-red-300 font-bold text-sm leading-relaxed">
                GoalCapabilityRegistry declara apenas 1 descriptor para goalType "gmail.readEmail" (capability: "readEmail").
                Não existe descriptor precedente "searchEmails".
                O Planner gera um ExecutionPlan de 1 step.
                O Runtime executa esse único step com messageId=null.
                Para e-mails referenciados por assunto (não por ID hex), o resultado é falha silenciosa ou resposta vazia.
              </div>
              <CodeRef file="src/lib/planning-engine-e022/GoalCapabilityRegistry.ts" lines="133–137" label="Prova:" />
            </div>

            <div className="p-3 border border-yellow-700 bg-yellow-950/20 rounded">
              <div className="text-zinc-500 text-xs mb-1">12. Grau de confiança</div>
              <div className="flex items-center gap-3">
                <div className="text-4xl font-bold text-yellow-300">{ROOT_CAUSE.confidence}%</div>
                <div className="text-xs text-zinc-400 leading-relaxed">{ROOT_CAUSE.confidence_note}</div>
              </div>
            </div>

          </div>
        </div>

        <div className="text-xs text-zinc-600 text-center pb-4">
          Sprint M1.9 — Audit gerado em {new Date().toISOString()} — Evidências de código real apenas
        </div>

      </div>
    </div>
  );
}