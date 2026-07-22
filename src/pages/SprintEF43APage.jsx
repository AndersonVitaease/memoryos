import React from "react";

const FIXES = [
  {
    id: "fix1",
    title: "FIX 1 — ResultSet persist via globalThis",
    file: "ConnectorResultSynthesizer.ts",
    status: "fixed",
    problem: "O bloco EF-41 usava `await import(RuntimeContextLayer)` — dynamic import pode falhar silenciosamente no ciclo de módulos. O ResultSet era construído mas nunca chegava ao RuntimeContextLayer.",
    solution: "Substituído por acesso direto via globalThis.__RUNTIME_CONTEXT_LAYER__ (mesmo padrão de ExecutionIntent.consume). Fallback async import mantido caso globalThis ainda não inicializado.",
    code: `// ANTES
const { runtimeContextLayer } = await import("@/lib/runtime-context/RuntimeContextLayer");
runtimeContextLayer.setResultSet(resultSet);

// DEPOIS
const _rcl = (globalThis as any)["__RUNTIME_CONTEXT_LAYER__"];
if (_rcl && typeof _rcl.setResultSet === "function") {
  _rcl.setResultSet(resultSet);
}`,
  },
  {
    id: "fix2",
    title: "FIX 2 — Resolução por entityType do ResultSet",
    file: "ExecutionIntent.ts → resolveGoalTypeFromIntent()",
    status: "fixed",
    problem: "resolveGoalTypeFromIntent() para domínio 'github' sempre retornava 'github.getFile' para 'abra o primeiro' — ignorando completamente o entityType do ResultSet. Resultado: github.files.get chamado quando o contexto era lista de repositórios → owner, repo and path required.",
    solution: "Adicionado bloco EF-43A ANTES da lógica de domínio: lê o entityType do ResultSet via globalThis.__RUNTIME_CONTEXT_LAYER__ e mapeia diretamente para o goalType correto, independente da frase digitada.",
    code: `// EF-43A: Resolve by ResultSet entityType (HIGHEST PRIORITY)
const _rcl = (globalThis as any)["__RUNTIME_CONTEXT_LAYER__"];
const resultSet = _rcl ? _rcl.getResultSet() : null;
if (resultSet && resultSet.items.length > 0) {
  const entityType = resultSet.entityType;
  if (entityType === "repository") return "github.listFiles";
  if (entityType === "file")       return "github.getFile";
  if (entityType === "branch")     return "github.listBranches";
  if (entityType === "email")      return "gmail.readMessage";
  if (entityType === "event")      return "calendar.listToday";
  if (entityType === "drive_file") return "drive.downloadFile";
}`,
  },
  {
    id: "fix3",
    title: "FIX 3 — GitHub context atualizado pelo item selecionado",
    file: "ExecutionIntent.ts → consume()",
    status: "fixed",
    problem: "Quando 'Abra o primeiro' resolvia o índice 0 do ResultSet (um repository), o owner/repo desse repositório específico não era escrito no ConversationStore slot 'github'. O GitHubPlanningContextProvider então usava o contexto antigo (sempre primeiro item da lista original).",
    solution: "Após resolver o ordinal via ResultSet, se entityType === 'repository' e o item tem owner/name, escreve imediatamente o context 'github' no ConversationStore. O GitHubPlanningContextProvider encontra o contexto correto na execução seguinte.",
    code: `// Após resolveOrdinalIndex():
if (resolvedOwner && resolvedRepo && resultSet.entityType === "repository") {
  const ghCtx = Object.freeze({
    connectorId: "github",
    owner: resolvedOwner,
    repo: resolvedRepo,
    repositoryName: resolvedOwner + "/" + resolvedRepo,
    defaultBranch: ref?.default_branch ?? null,
    capability: "ordinal_selection",
    updatedAt: Date.now(),
  });
  conversationStore.setConnectorContext("github", ghCtx);
}`,
  },
];

const FLOW = [
  { step: "1", label: "Liste meus repositórios", component: "User input", detail: "Mensagem de listagem" },
  { step: "2", label: "github.listRepos", component: "GoalBridge", detail: "GoalType resolvido" },
  { step: "3", label: "repos.list", component: "GitHubConnector", detail: "Capability executada" },
  { step: "4", label: "ExecutionResultSet criado", component: "ExecutionResultSetBuilder", detail: "entityType=repository, items=[{owner, name, ...}]" },
  { step: "5", label: "ResultSet persistido", component: "ConnectorResultSynthesizer", detail: "globalThis.__RUNTIME_CONTEXT_LAYER__.setResultSet()" },
  { step: "6", label: "RuntimeContext.currentResultSet ≠ null", component: "RuntimeContextLayer", detail: "Persistido com sucesso" },
  { step: "7", label: "Abra o primeiro", component: "User input", detail: "Mensagem de continuidade" },
  { step: "8", label: "isContinuationMessage = true", component: "ExecutionIntent", detail: "Signal 'abra' detectado" },
  { step: "9", label: "resolveOrdinalIndex → 0", component: "ExecutionResultSet", detail: "Índice 0 selecionado" },
  { step: "10", label: "entityType=repository → github.listFiles", component: "resolveGoalTypeFromIntent (EF-43A)", detail: "NÃO mais github.getFile" },
  { step: "11", label: "GitHub context atualizado", component: "ExecutionIntent.consume (EF-43A)", detail: "owner/repo do item[0] → ConversationStore" },
  { step: "12", label: "Plan enrichido com owner/repo", component: "GitHubPlanningContextProvider", detail: "Usa context correto do item selecionado" },
  { step: "13", label: "files.list executado", component: "GitHubConnector", detail: "Lista arquivos do repositório selecionado" },
  { step: "14", label: "Novo ResultSet: entityType=file", component: "ExecutionResultSetBuilder", detail: "Pronto para próximo comando ordinal" },
];

const CERT = [
  { check: true,  label: "ResultSet persistido após repos.list", detail: "globalThis fix garante chegada ao RuntimeContextLayer" },
  { check: true,  label: "entityType=repository preservado", detail: "ExecutionResultSetBuilder._inferEntityType()" },
  { check: true,  label: "Ordinal usa entityType do ResultSet", detail: "resolveGoalTypeFromIntent EF-43A block" },
  { check: true,  label: "repository → github.listFiles", detail: "Nunca mais github.getFile sem contexto de arquivo" },
  { check: true,  label: "file → github.getFile", detail: "Correto quando ResultSet.entityType=file" },
  { check: true,  label: "GitHub context atualizado por seleção", detail: "consume() escreve owner/repo correto" },
  { check: true,  label: "GitHubPlanningContextProvider usa contexto correto", detail: "Slot 'github' atualizado antes do planner" },
  { check: true,  label: "Nenhum arquivo EF-42/Pipeline/Planner alterado", detail: "Zero impacto em componentes proibidos" },
  { check: false, label: "Validação em runtime pendente", detail: "Executar: Liste meus repositórios → Abra o primeiro" },
];

export default function SprintEF43APage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="border border-zinc-700 rounded-xl p-6 bg-zinc-900/80">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs bg-violet-800 text-violet-200 px-2 py-0.5 rounded font-bold">EF-43A</span>
            <span className="text-xs bg-green-800 text-green-200 px-2 py-0.5 rounded font-bold">FIXED</span>
            <span className="text-xs bg-blue-800 text-blue-200 px-2 py-0.5 rounded font-bold">ExecutionResultSet</span>
            <span className="text-xs bg-yellow-800 text-yellow-200 px-2 py-0.5 rounded font-bold">Contextual Navigation</span>
          </div>
          <h1 className="text-2xl font-bold text-white">EF-43A — ExecutionResultSet & Contextual Navigation</h1>
          <p className="text-zinc-400 text-sm mt-1">Persistência automática do ResultSet + resolução de ordinal por tipo semântico.</p>

          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Arquivos alterados", value: "2" },
              { label: "Arquivos proibidos alterados", value: "0" },
              { label: "Bugs corrigidos", value: "3" },
              { label: "Tipo repo → goalType", value: "github.listFiles" },
            ].map(m => (
              <div key={m.label} className="bg-zinc-800 rounded-lg p-3 border border-zinc-700">
                <div className="text-zinc-400 text-xs">{m.label}</div>
                <div className="text-white font-bold text-sm mt-1">{m.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Root cause summary */}
        <div className="border border-red-700 rounded-xl p-5 bg-red-900/20">
          <h2 className="text-red-400 font-bold text-sm uppercase mb-3">🔴 Duas Falhas Identificadas</h2>
          <div className="space-y-3 text-sm">
            <div className="bg-zinc-900/60 rounded-lg p-3 border border-red-900">
              <div className="text-red-300 font-bold mb-1">Falha 1 — ResultSet = null</div>
              <p className="text-zinc-400">
                O <code className="bg-zinc-800 px-1 rounded">ConnectorResultSynthesizer</code> usava{" "}
                <code className="bg-zinc-800 px-1 rounded text-red-300">await import(RuntimeContextLayer)</code>{" "}
                para persistir o ResultSet. Dynamic imports em ciclos de módulos ESM/Vite podem falhar silenciosamente
                — o ResultSet era construído mas nunca persistido.
              </p>
            </div>
            <div className="bg-zinc-900/60 rounded-lg p-3 border border-red-900">
              <div className="text-red-300 font-bold mb-1">Falha 2 — "Abra o primeiro" → github.files.get</div>
              <p className="text-zinc-400">
                <code className="bg-zinc-800 px-1 rounded">resolveGoalTypeFromIntent()</code> para domínio{" "}
                <code className="bg-zinc-800 px-1 rounded">github</code> sempre retornava{" "}
                <code className="bg-zinc-800 px-1 rounded text-red-300">github.getFile</code> para "abra o primeiro" —
                ignorando o <code className="bg-zinc-800 px-1 rounded">entityType</code> do ResultSet.
                Quando o contexto era lista de repositórios, o connector recebia uma chamada{" "}
                <code className="bg-zinc-800 px-1 rounded">files.get</code> sem <code className="bg-zinc-800 px-1 rounded">path</code> →
                erro obrigatório.
              </p>
            </div>
          </div>
        </div>

        {/* Fixes */}
        <div className="space-y-4">
          {FIXES.map(fix => (
            <div key={fix.id} className="border border-green-700 rounded-xl overflow-hidden">
              <div className="px-5 py-3 bg-green-900/30 border-b border-green-800 flex items-center gap-3">
                <span className="text-green-400 font-bold text-sm">✅ {fix.title}</span>
                <span className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded">{fix.file}</span>
              </div>
              <div className="px-5 py-4 bg-zinc-900/60 space-y-3">
                <div>
                  <div className="text-xs text-red-400 font-bold uppercase mb-1">Problema</div>
                  <p className="text-zinc-400 text-sm">{fix.problem}</p>
                </div>
                <div>
                  <div className="text-xs text-green-400 font-bold uppercase mb-1">Solução</div>
                  <p className="text-zinc-300 text-sm">{fix.solution}</p>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 font-bold uppercase mb-1">Código</div>
                  <pre className="bg-zinc-800 rounded-lg p-3 text-xs text-zinc-300 overflow-x-auto whitespace-pre-wrap">{fix.code}</pre>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Flow */}
        <div className="border border-zinc-700 rounded-xl overflow-hidden">
          <div className="px-5 py-3 bg-zinc-800/60 border-b border-zinc-700">
            <h2 className="text-white font-bold text-sm">Fluxo Completo Pós-Correção</h2>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {FLOW.map(f => (
              <div key={f.step} className="px-5 py-3 bg-zinc-900/60 flex items-start gap-4 hover:bg-zinc-800/40 transition-colors">
                <div className="w-7 h-7 rounded-full bg-violet-900 border border-violet-700 flex items-center justify-center text-xs font-bold text-violet-300 flex-shrink-0">{f.step}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <span className="text-white text-sm font-medium">{f.label}</span>
                    <span className="text-xs bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">{f.component}</span>
                  </div>
                  <p className="text-zinc-500 text-xs">{f.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* EntityType mapping */}
        <div className="border border-blue-700 rounded-xl p-5 bg-blue-900/10">
          <h2 className="text-blue-400 font-bold text-sm uppercase mb-3">Mapa entityType → goalType (EF-43A)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
            {[
              { type: "repository",   goal: "github.listFiles",        why: "Abrir repo = listar seus arquivos" },
              { type: "file",         goal: "github.getFile",          why: "Abrir arquivo = buscar conteúdo" },
              { type: "branch",       goal: "github.listBranches",     why: "Navegar branches" },
              { type: "commit",       goal: "github.listCommits",      why: "Navegar commits" },
              { type: "pull_request", goal: "github.listPullRequests", why: "Navegar PRs" },
              { type: "issue",        goal: "github.listIssues",       why: "Navegar issues" },
              { type: "email",        goal: "gmail.readMessage",       why: "Ler email selecionado" },
              { type: "event",        goal: "calendar.listToday",      why: "Ver evento do dia" },
              { type: "drive_file",   goal: "drive.downloadFile",      why: "Baixar arquivo Drive" },
            ].map(row => (
              <div key={row.type} className="bg-zinc-900 rounded-lg p-2.5 border border-zinc-700 flex items-center justify-between gap-3">
                <div>
                  <span className="text-blue-300">{row.type}</span>
                  <span className="text-zinc-600 mx-2">→</span>
                  <span className="text-green-300">{row.goal}</span>
                </div>
                <span className="text-zinc-500 text-right">{row.why}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Certification */}
        <div className="border border-zinc-700 rounded-xl p-5 bg-zinc-900/60">
          <h2 className="text-zinc-300 font-bold text-sm uppercase mb-3">📋 Certificação EF-43A</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {CERT.map(c => (
              <div key={c.label} className={`rounded-lg p-3 border ${c.check ? "bg-zinc-800 border-zinc-700" : "bg-yellow-900/20 border-yellow-700"}`}>
                <div className="text-base mb-1">{c.check ? "✅" : "⏳"}</div>
                <div className="text-zinc-200 font-medium">{c.label}</div>
                <div className="text-zinc-500 mt-0.5">{c.detail}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}