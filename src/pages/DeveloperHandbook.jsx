import React, { useState, useMemo } from "react";
import { Search, BookOpen, Code, Shield, Cpu, Zap, Bug, CheckSquare, ChevronRight, Copy, Check } from "lucide-react";

const CHAPTERS = [
  {
    id: 1, title: "Visão Geral", icon: "👁", tag: "intro",
    sections: [
      { title: "O que é o MemoryOS", content: "O MemoryOS é uma camada de memória permanente e inteligente projetada para preservar o conhecimento de longo prazo do usuário — permitindo que ele converse naturalmente com sua própria história, sem precisar gerenciar arquivos, chats ou resumos manuais.\n\nÉ o sistema operacional da memória humana." },
      { title: "Filosofia", content: "**Permanência** — Nenhum conhecimento é perdido\n**Continuidade** — Toda sessão conhece o passado\n**Transparência** — Toda decisão é rastreável\n**Segurança** — Nenhuma ação de alto risco sem aprovação\n**Evolução** — A arquitetura cresce por RFC, nunca por impulso" },
      { title: "Engineering First", content: "A partir da Foundation v1.0, o projeto entra na fase Engineering First.\n\nAntes: definição arquitetural, especificações, governança\nAgora: implementação real, validação pelo MRI, certificação pelo MQCCS\n\nToda feature nova começa com uma RFC. Toda RFC aprovada gera um ADR. Todo ADR implementado passa pelo MRI e pelo MQCCS antes de entrar em release." },
    ]
  },
  {
    id: 2, title: "Estrutura do Repositório", icon: "📁", tag: "structure",
    sections: [
      { title: "Diretórios Principais", content: "foundation/ — Documentação oficial (imutável sem RFC)\ncore/ — Engines centrais (TypeScript)\nruntime/ — Ciclo de vida de execução (MRS)\nsdk/ — SDKs oficiais (MDPS)\nconnectors/ — Conectores externos\nspecialists/ — Especialistas de domínio\nknowledge/ — Knowledge Packages\nmri/ — Reference Implementation + testes\nmqccs/ — Pipeline de certificação\nexamples/ — Exemplos completos end-to-end" },
      { title: "Responsabilidades", content: "foundation/ → Documentação imutável → Via RFC aprovada\ncore/ → Engines centrais → Via RFC + ADR\nruntime/ → Ciclo de vida → Via RFC + ADR\nsdk/ → SDKs públicos → Via RFC + ADR\nconnectors/ → Conectores externos → Contributor + RFC\nspecialists/ → Especialistas de domínio → Contributor + RFC\nmri/ → Validação de referência → Core Team apenas\nmqccs/ → Certificação → Core Team apenas" },
    ]
  },
  {
    id: 3, title: "Como Desenvolver", icon: "⚙️", tag: "workflow",
    sections: [
      { title: "Fluxo Oficial", content: "1. Identificar necessidade\n2. Verificar RFC/ADR existente\n3. Abrir RFC (se necessário)\n4. Aguardar discussão (14d mínimo)\n5. RFC aprovada → criar ADR\n6. Implementar seguindo ADR\n7. Escrever testes no MRI\n8. Validar com MRI (100% pass)\n9. Certificar com MQCCS (≥85%)\n10. Pull Request → Code Review → Merge" },
      { title: "Como Abrir uma RFC", content: "1. Copie foundation/templates/RFC_TEMPLATE.md\n2. Nomeie como RFC-NNN-titulo-da-rfc.md\n3. Preencha todos os campos obrigatórios\n4. Abra issue com prefixo [RFC]\n5. Aguarde mínimo 14 dias de discussão\n6. Votação pelo Core Team" },
    ]
  },
  {
    id: 4, title: "Padrões de Código", icon: "📐", tag: "standards",
    sections: [
      { title: "Naming Conventions", content: "Interfaces: prefixo I, PascalCase → IConnector, ISpecialist\nClasses: PascalCase → HttpConnector, WorkingMemoryEngine\nEngines: sufixo Engine → ExecutionEngine, JourneyManager\nIDs: kebab-case → 'http-connector', 'general-specialist'\nEventos: domínio.entidade.ação → 'execution.step.completed'\nArquivos TS: PascalCase → WorkingMemoryEngine.ts" },
      { title: "Interfaces First", content: "Sempre exporte interfaces, nunca implementações concretas no SDK público.\n\n✅ export interface IConnector { ... }\n❌ export class HttpConnector { ... }" },
      { title: "Errors", content: "Nunca engolir erros silenciosamente. Propague com contexto suficiente.\n\nPara falhas controladas, use ConnectorResult com status 'failure' e errorCode.\nPara erros inesperados, lance com mensagem descritiva." },
    ]
  },
  {
    id: 5, title: "Testes", icon: "🧪", tag: "testing",
    sections: [
      { title: "Tipos de Teste", content: "Unitário → mri/tests/ → MRI Test Runner → mínimo 3 por componente\nIntegração → mri/journeys/ → Journey Runner → mínimo 1 por feature\nPerformance → mqccs/performance/ → Benchmark Runner → p95 < 500ms\nSegurança → mri/tests/ → SecurityGate Tests → 100% pass\nContrato → mqccs/compliance/ → Compliance Validator → 100% pass" },
      { title: "MRI — Validação de Referência", content: "Execute: npm run mri:validate\n\nScore esperado: 100% (25/25 testes)\nQualquer falha bloqueia o release.\n\nTodo componente deve ter ao menos 3 testes no MRI cobrindo: caminho feliz, edge case, e falha controlada." },
      { title: "MQCCS — Certificação", content: "Execute: npm run mqccs:certify\n\nScore mínimo para release: 85%\nScore para status 'Certified': 85%\nScore para status 'Official': 95%\n\nO pipeline tem 5 estágios: Contrato, Segurança, Performance, Arquitetura, Certificação." },
    ]
  },
  {
    id: 6, title: "Observabilidade", icon: "📊", tag: "observability",
    sections: [
      { title: "AuditTrail", content: "Registre toda ação significativa com audit.record().\n\nO AuditTrail é IMUTÁVEL — append-only.\nNunca modifique ou delete registros.\nCampos obrigatórios: action, userId, sessionId, outcome." },
      { title: "EventBus", content: "Toda comunicação entre engines ocorre via EventBus.\nPrioridades: CRITICAL > HIGH > NORMAL > LOW.\n\nSubscribe com wildcards: eventBus.subscribe('execution.*', handler)" },
      { title: "Métricas Target", content: "WorkingMemory store: p50 <5ms, p95 <10ms\nEventBus publish: p50 <2ms, p95 <5ms\nConnector execute: p50 <200ms, p95 <500ms\nSpecialist process: p50 <100ms, p95 <300ms" },
    ]
  },
  {
    id: 7, title: "Segurança", icon: "🔒", tag: "security",
    sections: [
      { title: "SecurityGate — Obrigatório", content: "Sempre avalie pelo SecurityGate antes de executar ação externa.\n\nse gate.authorized === false → bloquear execução\nse gate.requiresApproval === true → pausar e aguardar humano\nSó executa após gate.authorized === true sem requiresApproval" },
      { title: "Níveis de Risco", content: "LOW → Leitura de dados → Aprovação: Não\nMEDIUM → Escrita reversível → Aprovação: Não (auditado)\nHIGH → Escrita irreversível → Aprovação: Sim\nCRITICAL → Exclusão permanente → Aprovação: Sim + confirmação" },
      { title: "Least Privilege", content: "Connector deve solicitar apenas as permissões mínimas necessárias.\n\n✅ requiredPermissions: ['read:contacts']\n❌ requiredPermissions: ['read:*', 'write:*']" },
    ]
  },
  {
    id: 8, title: "Connectors", icon: "🔌", tag: "connectors",
    sections: [
      { title: "Checklist", content: "□ Implementa IConnector completamente\n□ Valida input antes de chamar serviço externo\n□ Tem timeout em todas as chamadas externas\n□ rollback implementado (se isReversible=true)\n□ healthCheck funcional\n□ getMetadata() completo\n□ 3+ testes no MRI\n□ Score MQCCS ≥ 85%\n□ RFC aprovada (se connector oficial)\n□ README com exemplos de uso" },
      { title: "Erros Comuns", content: "❌ Chamar serviço externo sem timeout → use AbortController\n❌ Lançar exceção direto → retorne ConnectorResult com status failure\n❌ riskLevel sempre LOW → avalie corretamente o impacto\n❌ isReversible=true sem rollback implementado" },
    ]
  },
  {
    id: 9, title: "Specialists", icon: "🧠", tag: "specialists",
    sections: [
      { title: "Quando Criar", content: "Crie um Specialist quando:\n• O domínio tem vocabulário especializado\n• A lógica de processamento é diferente do GeneralSpecialist\n• Há fontes de conhecimento específicas\n• O canHandle() pode ser determinístico\n\nReutilize GeneralSpecialist para queries genéricas." },
      { title: "canHandle()", content: "O método canHandle() deve ser determinístico e rápido.\nNunca faça chamadas externas dentro de canHandle().\n\n✅ return keywords.some(k => query.toLowerCase().includes(k))\n❌ return await this.llm.classify(query)" },
    ]
  },
  {
    id: 10, title: "Knowledge Packages", icon: "📚", tag: "knowledge",
    sections: [
      { title: "Estrutura", content: "Mínimo 10 nodes por pacote.\nConfidence ≥ 0.8 para todos os nodes.\nRelations mapeadas entre nodes relacionados.\nSempre inclua source (de onde veio o conhecimento)." },
      { title: "Versionamento", content: "MAJOR: schema de um node muda\nMINOR: novos nodes são adicionados\nPATCH: conteúdo de um node é corrigido" },
    ]
  },
  {
    id: 11, title: "Performance", icon: "⚡", tag: "performance",
    sections: [
      { title: "Cache com WorkingMemory", content: "Use WorkingMemory como cache de sessão.\nTTL recomendado: 30 minutos para dados de usuário.\nSempre verifique cache antes de chamar Connectors externos." },
      { title: "Timeouts por Tipo", content: "memory: 1s\nspecialist: 5s\nconnector: 30s\njourney: 2min\n\nSempre use ctx.timeoutMs (vem do PlanStep configurado)" },
      { title: "Paralelismo", content: "Execute steps independentes em paralelo com Promise.all.\nUse PlanStep.parallel = true no ExecutionEngine.\nEvite await em loop — use Promise.all ou bulkCreate." },
    ]
  },
  {
    id: 12, title: "Debugging", icon: "🐛", tag: "debugging",
    sections: [
      { title: "Journey", content: "Verifique: journey.status, journey.events, journey.context\n\nStatus possíveis: active, paused, blocked, completed, archived\nEvents contém o histórico completo de transições." },
      { title: "AuditTrail", content: "Consulte o AuditTrail com audit.query({ sessionId, executionId })\n\nCada record tem: action, outcome, timestamp, details\nÉ a fonte de verdade para o que aconteceu no sistema." },
      { title: "Connector", content: "1. Verifique connector.healthCheck()\n2. Verifique result.auditLog\n3. Verifique result.errorCode e errorMsg\n4. Verifique se SecurityGate autorizou antes da execução" },
    ]
  },
  {
    id: 13, title: "Common Mistakes", icon: "⚠️", tag: "mistakes",
    sections: [
      { title: "Anti-patterns Críticos", content: "❌ Core conhecendo implementação concreta → injete IConnector\n❌ Ação de alto risco sem SecurityGate → sempre gate antes\n❌ Modificar AuditTrail → é imutável por design\n❌ Compartilhar contexto entre usuários → use identityContext\n❌ RFC retroativa → RFC vem ANTES da implementação\n❌ Criar spec sem necessidade de implementação → Foundation está encerrada" },
      { title: "Naming Errado", content: "❌ class manage_http {} → snake_case\n❌ class httpconnector {} → lowercase\n❌ const ConnectorId = 'x' → variável com maiúscula\n❌ interface Connector {} → falta prefixo I\n\n✅ class HttpConnector implements IConnector {}" },
    ]
  },
  {
    id: 14, title: "Engineering Principles", icon: "🏛️", tag: "principles",
    sections: [
      { title: "Princípios Oficiais", content: "**Interfaces First** — Exporte interfaces, não implementações\n**Composition over Inheritance** — Prefira composição; Engine injeta deps\n**Event Driven** — Comunicação via EventBus, não chamadas diretas\n**Small Components** — 1 arquivo = 1 responsabilidade\n**Low Coupling** — Core não conhece Connectors\n**High Cohesion** — Agrupe por domínio, não por tipo\n**Security First** — SecurityGate é obrigatório\n**Audit Everything** — AuditTrail em todo Engine\n**Human in the Loop** — Alto risco = aprovação humana" },
    ]
  },
  {
    id: 15, title: "Getting Started", icon: "🚀", tag: "start",
    sections: [
      { title: "0–5 min: Entender o Projeto", content: "Leia nesta ordem:\n1. foundation/README.md — Visão geral\n2. foundation/FOUNDATION.md — Declaração oficial\n3. foundation/adr/ADR-INDEX.md — Decisões tomadas" },
      { title: "5–10 min: Executar Localmente", content: "git clone https://github.com/memoryos/memoryos\ncd memoryos && npm install\nnpm run mri:validate\n→ Esperado: 25/25 tests passing" },
      { title: "10–18 min: Criar um Connector", content: "1. Implemente IConnector em connectors/my-connector/index.ts\n2. Métodos obrigatórios: execute(), healthCheck(), getMetadata()\n3. Opcional: rollback() se isReversible=true\n4. Teste: npm run mri:validate" },
      { title: "18–24 min: Criar um Specialist", content: "1. Implemente ISpecialist em specialists/my-specialist/index.ts\n2. Métodos: canHandle(), process(), getMetadata()\n3. canHandle() deve ser determinístico e rápido\n4. Teste com queries do domínio" },
      { title: "24–30 min: RFC + Testes", content: "npm run mri:validate       → 100% pass esperado\nnpm run mqccs:certify      → ≥85% score esperado\n\nPara abrir uma RFC:\ncp foundation/templates/RFC_TEMPLATE.md foundation/rfc/RFC-NNN-titulo.md\n# Preencha os campos\n# Abra issue com [RFC] no título" },
    ]
  },
  {
    id: 16, title: "PR Checklist", icon: "✅", tag: "checklist",
    sections: [
      { title: "Pré-implementação", content: "□ Existe RFC aprovada para esta mudança?\n□ Existe ADR correspondente?\n□ A mudança está dentro do escopo da RFC?" },
      { title: "Código", content: "□ Naming conventions seguidas?\n□ Interfaces exportadas (não classes concretas)?\n□ Nenhuma dependência circular?\n□ SecurityGate usado para ações externas?\n□ AuditTrail registrado para ações significativas?" },
      { title: "Testes", content: "□ Testes unitários no MRI (mínimo 3)?\n□ MRI suite: 100% passing?\n□ MQCCS score ≥ 85%?\n□ Testes de performance dentro dos targets?" },
      { title: "Segurança", content: "□ SecurityGate avaliado para risco?\n□ Identity Context respeitado?\n□ Nenhuma credencial hardcoded?\n□ Permissões mínimas (least privilege)?" },
      { title: "Documentação", content: "□ README atualizado?\n□ CHANGELOG atualizado?\n□ Exemplos incluídos?\n□ Tipos TypeScript documentados?" },
      { title: "Compatibilidade", content: "□ Retrocompatível com versão anterior?\n□ Se breaking change: RFC crítica aprovada?\n□ Grace period de depreciação definido (≥6 meses)?" },
    ]
  },
];

const CODE_SNIPPETS = [
  {
    label: "IConnector básico",
    tag: "connectors",
    code: `export class MyConnector implements IConnector {
  readonly connectorId = "my-connector";
  readonly version     = "1.0.0";

  async execute(input: unknown, ctx: ExecutionContext): Promise<ConnectorResult> {
    // 1. Validar input
    if (!input) return { status: "failure", errorMsg: "input required", auditLog: [] };
    
    // 2. Executar com timeout
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ctx.timeoutMs);
    
    const data = await fetch(url, { signal: controller.signal });
    
    return {
      status:      "success",
      outputData:  await data.json(),
      auditLog:    [\`executed at \${new Date().toISOString()}\`],
      resourceRef: \`ref:\${ctx.executionId}:\${ctx.stepId}\`,
    };
  }

  async healthCheck() { return { status: "healthy" as const }; }
  getMetadata() { return { connectorId: this.connectorId, version: this.version, capabilities: [], riskLevel: "LOW" as const, isReversible: true }; }
}`,
  },
  {
    label: "SecurityGate",
    tag: "security",
    code: `const gate = security.evaluate({
  userId:          ctx.userId,
  sessionId:       ctx.sessionId,
  action:          "connector.execute",
  resource:        connectorId,
  estimatedImpact: "HIGH",
  isReversible:    false,
});

if (!gate.authorized) {
  throw new Error(gate.reason);
}

if (gate.requiresApproval) {
  return { requiresApproval: true, riskLevel: gate.riskLevel };
}

// Seguro executar aqui
await connector.execute(input, ctx);`,
  },
  {
    label: "AuditTrail",
    tag: "observability",
    code: `await audit.record({
  action:    "step.completed",   // domínio.entidade.ação
  userId:    ctx.userId,
  sessionId: ctx.sessionId,
  journeyId: ctx.journeyId,
  stepId:    ctx.stepId,
  outcome:   "success",          // success | failure | blocked
  details:   { stepId: step.stepId, duration: 120 },
});

// AuditTrail é IMUTÁVEL — append-only
// Nunca modifique ou delete registros`,
  },
  {
    label: "ISpecialist básico",
    tag: "specialists",
    code: `export class FinancialSpecialist implements ISpecialist {
  readonly specialistId = "financial-specialist";
  readonly domain       = "financial";
  readonly capabilities = ["tax", "investment", "budget"];

  canHandle(query: string): boolean {
    const keywords = ["imposto", "investimento", "orçamento"];
    return keywords.some(k => query.toLowerCase().includes(k));
  }

  async process(query: string, ctx: KnowledgeContext): Promise<SpecialistResult> {
    return {
      specialistId: this.specialistId,
      response:     "Análise financeira processada",
      confidence:   0.90,
      reasoning:    ["Intent financeiro detectado"],
      sources:      [],
      recommendations: [],
    };
  }

  getMetadata() {
    return { specialistId: this.specialistId, domain: this.domain,
             version: "1.0.0", languages: ["pt-BR"], expertise: { tax: 0.9 } };
  }
}`,
  },
  {
    label: "Retry com backoff",
    tag: "performance",
    code: `async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 100));
      // Espera: 100ms, 200ms, 400ms
    }
  }
  throw new Error("unreachable");
}`,
  },
  {
    label: "WorkingMemory cache",
    tag: "performance",
    code: `// Sempre verifique cache antes de chamar serviço externo
const cacheKey = \`user:\${userId}:preferences\`;
const cached = memory.get(cacheKey, identityContext);
if (cached) return cached;

// Buscar e cachear
const fresh = await connector.execute({ userId }, ctx);
await memory.store({
  key:             cacheKey,
  value:           fresh,
  ttl:             30 * 60 * 1000,  // 30 minutos
  identityContext: identityContext,
});
return fresh;`,
  },
];

function CodeBlock({ code, label }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-700 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-700 bg-zinc-800">
        <span className="text-xs text-zinc-400 font-mono">{label}</span>
        <button onClick={copy} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <pre className="p-3 text-xs text-zinc-300 font-mono overflow-x-auto leading-relaxed whitespace-pre">{code}</pre>
    </div>
  );
}

function ChapterContent({ chapter }) {
  return (
    <div className="space-y-4">
      {chapter.sections.map((sec, i) => (
        <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-white font-semibold mb-3 text-sm">{sec.title}</h3>
          <div className="text-zinc-400 text-sm leading-relaxed whitespace-pre-line">{sec.content}</div>
        </div>
      ))}
      {/* Snippets relacionados */}
      {CODE_SNIPPETS.filter(s => s.tag === chapter.tag).length > 0 && (
        <div className="space-y-3">
          <h3 className="text-zinc-500 text-xs uppercase tracking-wider font-semibold">Snippets</h3>
          {CODE_SNIPPETS.filter(s => s.tag === chapter.tag).map((s, i) => (
            <CodeBlock key={i} code={s.code} label={s.label} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DeveloperHandbook() {
  const [activeChapter, setActiveChapter] = useState(1);
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return CHAPTERS;
    const q = search.toLowerCase();
    return CHAPTERS.filter(c =>
      c.title.toLowerCase().includes(q) ||
      c.sections.some(s => s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q))
    );
  }, [search]);

  const current = CHAPTERS.find(c => c.id === activeChapter);

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0 fixed md:relative z-30 transition-transform duration-300 w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col h-full shrink-0`}>
        <div className="p-4 border-b border-zinc-800">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen size={16} className="text-violet-400" />
            <span className="text-sm font-bold text-white">Developer Handbook</span>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-8 pr-3 py-2 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-violet-600"
            />
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {filtered.map(ch => (
            <button
              key={ch.id}
              onClick={() => { setActiveChapter(ch.id); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-left mb-0.5 transition-colors ${
                activeChapter === ch.id
                  ? "bg-violet-700/40 text-violet-300"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              }`}
            >
              <span className="text-base leading-none">{ch.icon}</span>
              <span className="flex-1 truncate text-xs font-medium">{`${ch.id}. ${ch.title}`}</span>
              {activeChapter === ch.id && <ChevronRight size={12} className="text-violet-400 shrink-0" />}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-zinc-800">
          <div className="text-xs text-zinc-600 text-center">MDH v1.0 · Foundation v1.0.0</div>
        </div>
      </div>

      {/* Overlay mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 md:px-6 py-3 flex items-center gap-3 shrink-0">
          <button
            className="md:hidden p-1.5 rounded-lg bg-zinc-800 text-zinc-400"
            onClick={() => setSidebarOpen(true)}
          >
            <BookOpen size={16} />
          </button>
          <div className="flex-1 min-w-0">
            {current && (
              <div className="flex items-center gap-2">
                <span className="text-lg">{current.icon}</span>
                <div>
                  <h1 className="text-white font-bold text-sm truncate">
                    Capítulo {current.id} — {current.title}
                  </h1>
                  <p className="text-zinc-500 text-xs">{current.sections.length} seções · {CODE_SNIPPETS.filter(s => s.tag === current.tag).length} snippets</p>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs bg-green-900/50 text-green-400 px-2 py-1 rounded border border-green-800 font-medium hidden sm:block">
              Official
            </span>
            <span className="text-xs text-zinc-500 hidden sm:block">v1.0</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-3xl mx-auto">
            {search && filtered.length === 0 && (
              <div className="text-center text-zinc-500 py-16">
                <Search size={32} className="mx-auto mb-3 opacity-30" />
                <p>Nenhum resultado para "{search}"</p>
              </div>
            )}
            {search && filtered.length > 0 ? (
              <div className="space-y-6">
                {filtered.map(ch => (
                  <div key={ch.id}>
                    <div className="flex items-center gap-2 mb-3">
                      <span>{ch.icon}</span>
                      <h2 className="text-white font-bold">{ch.id}. {ch.title}</h2>
                    </div>
                    <ChapterContent chapter={ch} />
                  </div>
                ))}
              </div>
            ) : current ? (
              <ChapterContent chapter={current} />
            ) : null}
          </div>
        </div>

        {/* Footer nav */}
        <div className="border-t border-zinc-800 px-4 md:px-6 py-3 flex items-center justify-between bg-zinc-900 shrink-0">
          <button
            onClick={() => setActiveChapter(Math.max(1, activeChapter - 1))}
            disabled={activeChapter === 1}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ← Anterior
          </button>
          <div className="flex gap-1">
            {CHAPTERS.map(ch => (
              <button
                key={ch.id}
                onClick={() => setActiveChapter(ch.id)}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${activeChapter === ch.id ? "bg-violet-500" : "bg-zinc-700 hover:bg-zinc-500"}`}
              />
            ))}
          </div>
          <button
            onClick={() => setActiveChapter(Math.min(CHAPTERS.length, activeChapter + 1))}
            disabled={activeChapter === CHAPTERS.length}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Próximo →
          </button>
        </div>
      </div>
    </div>
  );
}