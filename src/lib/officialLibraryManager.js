/**
 * Official Library Manager (MAS §4.4 — Interface Única)
 *
 * v3.0 — Engineering First · Zero Boot Dependencies
 *
 * Os imports estáticos e dinâmicos de arquivos .md foram removidos completamente.
 * O conteúdo dos documentos está embutido como strings JavaScript nativas.
 * Nenhum arquivo Markdown e nenhum import ?raw é carregado durante o boot.
 *
 * Interface oficial (preservada):
 *   OfficialLibraryManager.load()        — Promise<void>  (inicialização)
 *   OfficialLibraryManager.isReady()     — boolean
 *   OfficialLibraryManager.getDocs()     — Record<name, content>
 *   OfficialLibraryManager.getDoc(name)  — string | null
 *   OfficialLibraryManager.getDocNames() — string[]
 *   OfficialLibraryManager.loadDoc(name) — Promise<string | null>
 */

// Conteudo da Biblioteca Oficial embutido como strings nativas.
// Sem imports de arquivos .md. Sem ?raw. Zero dependencias de boot.
const EMBEDDED_DOCS = {
  "MV-MemoryOS-Vision": `# MemoryOS Vision (MV)

**Versao:** 1.0
**Status:** Oficial
**Tipo:** Documento Estrategico

---

## 1. Introducao

O MemoryOS nasceu da percepcao de que a forma atual de interacao entre pessoas e inteligencias artificiais esta fragmentada.

Os usuarios precisam iniciar novas conversas constantemente, repetir informacoes, reapresentar contexto e reaprender diferentes softwares para executar tarefas simples.

Embora os modelos de IA tenham evoluido significativamente, a experiencia do usuario continua limitada por sessoes isoladas, memorias temporarias e integracoes fragmentadas.

O MemoryOS existe para eliminar essa limitacao.

## 2. Visao

Criar o primeiro Sistema Operacional Cognitivo capaz de acompanhar uma pessoa durante toda a sua vida digital, preservando memoria permanente, compreendendo contexto continuamente e coordenando inteligentemente qualquer tecnologia necessaria para ajuda-la.

## 3. Missao

Permitir que qualquer pessoa converse naturalmente com uma unica inteligencia durante toda a vida.

Essa inteligencia deve:

- lembrar permanentemente do usuario;
- compreender seu contexto;
- aprender continuamente padroes de resolucao de problemas;
- coordenar especialistas;
- utilizar diferentes inteligencias artificiais;
- conversar com qualquer sistema atraves de conectores;
- preservar sempre a memoria do usuario.

## 4. O Problema

Hoje o usuario precisa:

- abrir varios aplicativos;
- aprender dezenas de interfaces;
- repetir informacoes;
- recomecar conversas;
- lembrar onde cada informacao esta armazenada;
- adaptar-se constantemente a tecnologia.

A tecnologia exige esforco do usuario.

Essa logica esta invertida.

## 5. A Nova Proposta

No MemoryOS o usuario nao aprende softwares.

Os softwares passam a trabalhar para o usuario.

O usuario apenas informa seu objetivo.

O MemoryOS:

- interpreta a intencao.
- planeja.
- coordena.
- executa.
- retorna o resultado.

## 6. Definicao Oficial

O MemoryOS e um Sistema Operacional Cognitivo.

- Nao e um chatbot.
- Nao e apenas uma IA.
- Nao e uma aplicacao de memoria.

E uma camada inteligente capaz de interpretar intencoes humanas e coordenar automaticamente modelos de IA, especialistas, capacidades, servicos e conectores.

## 7. Principios Fundamentais

- O usuario conversa apenas com o MemoryOS.
- Nunca conversa diretamente com: ChatGPT; Gemini; Claude; Gmail; Shopify; Word; Banco; ERP; WhatsApp.
- O Core aprende resolver problemas. Nunca aprende APIs. Nunca aprende tecnologias. Nunca aprende integracoes.
- Os conectores aprendem linguagens. Cada conector conhece apenas um sistema especifico.
- A memoria pertence ao usuario. Nunca pertence ao modelo de IA. Nunca depende de um fornecedor especifico.
- A conversa nunca termina. Nao existem multiplos chats. Existe apenas uma conversa continua.

## 8. Filosofia

O cerebro aprende de todas as formas.

So muda a linguagem.

O que muda e a integracao.

A resolucao continua sendo a mesma.

## 9. Confianca

O maior desafio do MemoryOS nao e tecnologico.

E conquistar a confianca do usuario.

Por esse motivo:

- integracoes sao opcionais;
- permissoes sao controladas pelo usuario;
- a memoria pertence ao usuario;
- o usuario nunca e obrigado a conectar servicos.

A confianca vem antes da automacao.

## 10. Evolucao Natural

O usuario inicia utilizando apenas:

- memoria;
- documentos;
- internet.

Depois: Gmail. Depois: Agenda. Depois: WhatsApp. Depois: Drive. Depois: ERP. Depois: Shopify.

Cada usuario constroi seu proprio MemoryOS.

## 11. Aprendizado

Existem quatro niveis de aprendizado.

1. Memoria Individual — Conhecimento privado do usuario.
2. Biblioteca Oficial — Conhecimento institucional do MemoryOS.
3. Especialistas — Conhecimento especializado validado.
4. Core — Aprende apenas padroes de resolucao. Nunca aprende informacoes privadas.

## 12. Independencia

A memoria deve sobreviver a evolucao tecnologica.

Se surgir um modelo de IA melhor, o usuario apenas troca o modelo.

Sua memoria permanece intacta.

## 13. Continuidade

O MemoryOS nao possui inicio e fim.

Possui continuidade.

Cada nova conversa e uma continuacao da anterior.

## 16. Declaracao Oficial

O MemoryOS e um Sistema Operacional Cognitivo criado para preservar a memoria permanente do usuario, compreender continuamente seu contexto e coordenar inteligentemente especialistas, capacidades, servicos e conectores, permitindo que qualquer pessoa converse naturalmente com uma unica inteligencia ao longo de toda a vida, sem precisar recomecar conversas, reaprender tecnologias ou perder conhecimento acumulado.

---

Documento Oficial: MV — MemoryOS Vision | Versao: 1.0 | Status: Aprovado`,

  "MPS-MemoryOS-Product-Specification": `# MPS — MemoryOS Product Specification

Versao: 1.0 | Status: Documento Oficial do Produto — Aprovado | Tipo: Especificacao de Produto

---

## 1. Visao do Produto

O MemoryOS e uma plataforma de Inteligencia Contextual capaz de acompanhar pessoas e organizacoes durante jornadas completas, preservando contexto, conhecimento, memoria, decisoes e progresso ate que seus objetivos sejam alcancados.

O foco da plataforma nao e responder perguntas. O foco da plataforma e ajudar pessoas a concluir objetivos.

## 2. Missao

Reduzir a complexidade do mundo digital. Transformar processos complexos em jornadas simples. Ajudar pessoas e organizacoes a tomarem melhores decisoes. Automatizar tarefas repetitivas. Preservar conhecimento. Nunca perder contexto.

## 3. Visao de Longo Prazo

Ser a principal plataforma mundial de Inteligencia Contextual. Uma plataforma capaz de integrar pessoas, empresas, governos e sistemas utilizando memoria, contexto, conhecimento e execucao inteligente.

## 6. Filosofia do Produto

O MemoryOS nao existe para substituir pessoas. Existe para potencializar pessoas.

Principios inegociaveis: Controle humano — o usuario sempre permanece no controle. Permissoes — toda operacao respeita as permissoes configuradas. Transparencia — o sistema sempre explica o que esta fazendo. Fontes oficiais — priorizadas quando disponiveis. Explicabilidade — o sistema sempre explica suas decisoes.

## 10. Papel da IA

A IA nao substitui a decisao humana. Ela organiza, interpreta, contextualiza, planeja, automatiza, acompanha e aprende.

Acao de baixo impacto — Automacao total permitida. Acao de medio impacto — Notificacao ao usuario. Acao de alto impacto — Confirmacao humana obrigatoria. Acao irreversivel — Confirmacao + justificativa obrigatoria.

A decisao final permanece sob controle humano sempre que houver impacto relevante.

---

Documento Oficial: MPS — MemoryOS Product Specification | Versao: 1.0 | Status: Aprovado`,

  "MAS-MemoryOS-Architecture-Specification": `# MemoryOS Architecture Specification (MAS)

Versao: 1.0 | Status: Oficial | Tipo: Documento de Arquitetura

---

## 1. Objetivo

Este documento define oficialmente a arquitetura do MemoryOS. O MAS e a Constituicao Tecnica do MemoryOS. Nenhum componente podera violar suas regras sem uma revisao arquitetural formal.

## 2. Definicao da Arquitetura

O MemoryOS e um Sistema Operacional Cognitivo composto por modulos especializados que cooperam para interpretar intencoes humanas, preservar memoria permanente e coordenar automaticamente especialistas, capacidades, servicos e conectores.

## 3. Principios Arquiteturais

3.1 Separacao entre Pensamento e Execucao — O Core pensa. Os Connectors executam.
3.2 Separacao entre Conhecimento e Integracao — Especialistas fornecem conhecimento. Connectors comunicam-se com sistemas.
3.3 Separacao entre Objetivo e Tecnologia — O Core identifica objetivos, nunca tecnologias.
3.4 Memoria Independente — A memoria nunca pertence ao modelo de IA.
3.5 Conversa Continua — Existe apenas uma conversa permanente.
3.6 Evolucao Continua — Novos componentes sem modificar o Core.

## 4. Camadas Oficiais

4.1 MemoryOS Core — Cerebro do sistema. Compreende intencoes, interpreta contexto, decide estrategias, coordena execucao, responde ao usuario. Nunca conhece APIs, bancos de dados, tecnologias especificas.
4.2 Memory Layer — Memoria permanente, documentos, PDFs, imagens, videos, audios, preferencias, historico, decisoes. A memoria pertence ao usuario.
4.3 Specialists — Representam conhecimento. Nunca executam integracoes.
4.4 Capability Layer — Habilidades cognitivas reutilizaveis. Nunca conhecem sistemas externos.
4.5 Service Layer — Dominios funcionais. Responde: O que precisa ser feito? Nunca: Como sera feito?
4.6 Policy Engine — Governanca. Verifica permissoes, privacidade, plano, limites, seguranca, autorizacao. Nenhuma execucao ocorre sem passar pelo Policy Engine.
4.7 Execution Planner — Transforma objetivos em planos executaveis.
4.8 Connector Manager — Descobre, seleciona, verifica conectores. Nunca interpreta intencao.
4.9 Connectors — Cada Connector comunica-se com apenas um sistema. Nunca tomam decisoes.
4.10 Providers — Fornecem inteligencia artificial. O Core nunca conhece fornecedores especificos.

## 6. Responsabilidades

Core — Interpreta intencoes — Nunca executa integracoes.
Memory — Preserva contexto — Nunca interpreta intencoes.
Specialists — Fornecem conhecimento — Nunca executam acoes.
Capabilities — Executam operacoes cognitivas — Nunca acessam sistemas externos.
Services — Representam dominios funcionais — Nunca executam integracoes.
Policy Engine — Autoriza ou bloqueia — Nunca interpreta intencoes.
Execution Planner — Organiza execucao — Nunca conversa com sistemas externos.
Connector Manager — Seleciona conectores — Nunca toma decisoes de negocio.
Connectors — Executam integracoes — Nunca interpretam intencoes.
Providers — Fornecem IA — Nunca armazenam memoria do usuario.

---

Documento Oficial: MAS — MemoryOS Architecture Specification | Versao: 1.0 | Status: Aprovado`,

  "MES-MemoryOS-Engineering-Specification": `# MemoryOS Engineering Specification (MES)

Versao: 1.0 | Status: Oficial | Tipo: Documento de Engenharia

---

## 1. Objetivo

Este documento define como a arquitetura oficial do MemoryOS deve ser implementada. Toda implementacao devera obedecer obrigatoriamente aos principios estabelecidos pelo MAS.

## 2. Principios de Engenharia

2.1 Responsabilidade Unica — Cada modulo possui apenas uma responsabilidade.
2.2 Baixo Acoplamento — Os modulos comunicam-se apenas atraves de contratos publicos.
2.3 Alta Coesao — Cada componente resolve apenas um tipo de problema.
2.4 Interfaces Estaveis — Toda comunicacao ocorre atraves de interfaces oficiais.
2.5 Independencia Tecnologica — O Core nunca depende de modelos, APIs, bancos ou provedores especificos.
2.6 Evolucao Continua — Novos modulos podem ser adicionados sem alterar o Core.

## 5. Contrato Oficial de Requisicao

Toda requisicao interna deve possuir: requestId, conversationId, userId, goal, context, memory, metadata.

## 6. Contrato Oficial de Resposta

Toda resposta deve possuir: status, result, events, logs, memoryUpdates.

## 12. Policy Engine

Responsavel por: autorizacao, permissoes, plano contratado, limites, privacidade, seguranca. Toda execucao passa obrigatoriamente por esta camada.

## 15. Interface Oficial dos Connectors

interface Connector { connect(); disconnect(); status(); execute(); capabilities(); }

## 17. Interface Oficial dos Providers

interface Provider { chat(); embeddings(); summarize(); }

## 18. Interface Oficial dos Specialists

interface Specialist { analyze(); advise(); confidence(); }

## 19. Interface Oficial das Capabilities

interface Capability { execute(); validate(); }

## 24. Seguranca

Toda integracao exige autorizacao. Toda autorizacao possui escopo. Toda permissao pode ser revogada. Nenhum dado privado pode ser utilizado para treinar o Core.

## 33. Criterios de Qualidade

Uma implementacao somente sera considerada concluida quando: respeitar o MV, MPS, MAS, MES; possuir testes; gerar eventos; produzir logs; possuir documentacao.

---

Documento Oficial: MES — MemoryOS Engineering Specification | Versao: 1.0 | Status: Aprovado`,

  "CONNECTOR-BUILD-GUIDE": `# Guia Oficial: Como Construir um Conector do MemoryOS

Versao: 1.0 | Status: Oficial | Tipo: Guia Tecnico de Implementacao

---

## 1. Fonte

Este guia e o resumo autoritativo da arquitetura REAL dos conectores do MemoryOS, extraido do codigo vivo em src/lib/connector-runtime/, das ADRs (ADR-013, ADR-014, ADR-015, ADR-017) e do CLAUDE.md (memoria de projeto do builder). Use-o como molda ao criar qualquer novo conector. Tudo aqui e verificavel no codigo.

## 2. O que NAO existe (nunca afirme o contrario)

Os seguintes elementos NAO existem no MemoryOS. Qualquer resposta que os cite e FABRICACAO:
- NAO existe classe "BaseProvider". Conectores implementam a interface IConnector (composicao), nao herdam de uma base.
- NAO existe "AuthHandler centralizado". A autenticacao e por-conector, em arquivos *AuthSession.js separados.
- NAO existe "Manifest.json" por provider. Capabilities sao declaradas via metodo metadata() que retorna ConnectorMetadata.
- NAO existe "RequestClient" central com exponential backoff. Rate limit e por-conector (ex: GitHubRateLimiter, token bucket).
- NAO existe "Vault". Secrets ficam em Base44 Settings > Environment Variables (lidos no backend via Deno.env.get). Tokens OAuth sao persistidos em entidades de backend (GoogleOAuthToken, MicrosoftOAuthToken, GitHubOAuthToken) - nunca expostos ao frontend, nunca em localStorage.

## 3. Interface real (IConnector)

Todo conector implementa src/lib/connector-runtime/IConnector.ts:
\`\`\`
interface IConnector {
  readonly id: string;
  metadata(): ConnectorMetadata;
  initialize(context): Promise<void>;
  shutdown(): Promise<void>;
  health(): Promise<ConnectorHealthReport>;
  execute(operation, payload, context): Promise<ConnectorResult>;
  validate(): boolean;
}
\`\`\`
Nao ha base class. O conector e uma classe que implementa essa interface.

## 4. Padrao Shell Fino + Capability Executors (ADR-013)

Para um provedor unico (uma so API oficial): shell fino + 1 executor por servico em arquivo isolado. Molde: src/lib/connector-runtime/connectors/MicrosoftGraphConnector.ts (shell) + src/lib/connector-runtime/connectors/microsoft/ (MicrosoftCapabilityRegistry, *Capability.ts por servico, MicrosoftGraphHelper compartilhado).
- O shell so tem: metadata, health, validate, initialize, shutdown, execute (token + roteamento via resolveCapability).
- Cada executor e testavel isoladamente, recebe accessToken + ctx, sem estado global.
- metadata.capabilities vem de listAllOperations() do registry.

## 5. Padrao Provider Registry (ADR-014) - para provedores concorrentes

So use quando ha APIs/credenciais CONCORRENTES pro mesmo dominio (ex: Travelport GDS vs Travellink/Wooba; ou OAuth proprio vs App-User Connector). Molde: src/lib/connector-runtime/connectors/microsoft-providers/ (MicrosoftProviderRegistry singleton HMR-safe, OfficialGraphProvider, etc.). O shell delega a microsoftProviderRegistry.resolveProvider(operation, workspaceId). Se so ha uma API oficial, NAO crie provider registry - e indirecao sem beneficio (use so o padrao 4).

## 6. Autenticacao real (por-conector)

Cada familia de conector tem seu *AuthSession.js: src/lib/google-auth/GoogleAuthSession.js, src/lib/microsoft-auth/MicrosoftAuthSession.js, src/lib/github-auth/GitHubAuthSession.js. Padrao:
- Frontend: AuthSession gerencia PKCE, popup OAuth, token em memoria (nunca localStorage).
- Backend: backend function proxy (ex: base44/functions/microsoftGraphProxy/entry.ts, base44/functions/travelportProxy/entry.ts) le secrets via Deno.env.get(), cacheia o access_token em memoria de modulo (nunca gera token por request), e expoe passthrough generico.
- Refresh token / credenciais permanentes persistem em entidade de backend (*OAuthToken), acessadas só pelo backend.

## 7. Registro de Capabilities (GoalCapabilityRegistry)

Capabilities sao mapeadas em src/lib/planning-engine-e022/GoalCapabilityRegistry.ts antes do bloco general.*. Convencao de nome: connector: "microsoft-graph", capability: "ms.mail.list". O Planner resolve goals -> capabilities; nunca conhece o conector diretamente (Open/Closed).

## 8. Reversibilidade e Safety Gate (ADR-015 / EI-01..EI-07)

Todo conector declara capabilityReversibility?: Record<string, Reversibility> no metadata (ConnectorTypes.ts). Reversibility = "safe" | "reversible" | "irreversible". Exemplos: mail.send/email.send/whatsapp.sendMessage = irreversible; create/upload/move/rename = reversible; list/read/search/download = safe. O Safety Gate (src/lib/execution-intelligence/SafetyGate.ts) freia irreversible sem confirmedByUser. O Runtime.processCapability (src/lib/execution-intelligence/Runtime.ts) e a facade unica: Intelligence.prepare -> SafetyGate.guard -> dispatch. Bypass impossivel por construcao.

## 9. Camadas que envolvem TODO conector automaticamente

Nao instrumente manualmente:
- Event Layer: src/lib/connector-runtime/UCRBridge.ts envolve cada execute() com eventos do RuntimeEventBus (ConnectorExecutionStarted/Completed/Failed).
- Observation Layer: PipelineObservationBridge committa observacoes no KnowledgeRegistry apos cada execucao (fire-and-forget).
- Bootstrap: src/lib/connector-runtime/ConnectorBootstrap.ts registra todos via OFFICIAL_FACTORIES (Promise.allSettled paralelo).

## 10. Molde recomendado para um novo conector

1. Criar *Connector.ts (shell implementando IConnector) em src/lib/connector-runtime/connectors/.
2. Para provedor unico: criar subpasta com *CapabilityRegistry.ts + *Helper.ts + 1 *Capability.ts por servico (ADR-013). Para concorrentes: subpasta *-providers/ com *ProviderRegistry.ts + *Provider.ts (ADR-014).
3. Criar *AuthSession.js (PKCE + multi-workspace, espelhar GoogleAuthSession.js).
4. Criar backend function proxy em base44/functions/*Proxy/entry.ts (Deno.env.get secrets + cache de token + passthrough).
5. Registrar capabilities em GoalCapabilityRegistry.ts (antes do bloco general.*).
6. Declarar capabilityReversibility no metadata (irreversible para envios/emissao).
7. Registrar factory em ConnectorBootstrap.ts OFFICIAL_FACTORIES.
8. Documentar decisao em ADR + CLAUDE.md.

## 11. Caminho de leitura recomendado

Antes de responder sobre conectores, LEIA no codigo real: src/lib/connector-runtime/IConnector.ts, src/lib/connector-runtime/ConnectorTypes.ts, src/lib/connector-runtime/connectors/MicrosoftGraphConnector.ts, src/lib/connector-runtime/connectors/GitHubConnector.ts. Se uma afirmacao sobre a arquitetura nao for suportada por esses arquivos, ela e fabricacao - diga que nao sabe em vez de inventar.

## 12. Sobre o CLAUDE.md

CLAUDE.md e a memoria de projeto do builder (decisoes arquiteturais por sessao, dead-ends, padroes). Ele NAO e carregado automaticamente no chat do app. Para cita-lo como fonte, o conteudo relevante deve estar explicitamente no prompt agora (bloco BIBLIOTECA OFICIAL). Sem isso, citar "segundo o claude.md" e fabricacao de rastreabilidade.

---

Documento Oficial: CONNECTOR-BUILD-GUIDE - Como Construir um Conector do MemoryOS | Versao: 1.0 | Status: Aprovado`,

  "Architecture-Auditor-Specialist": `# Architecture Auditor Specialist

Versao: 3.1 | Status: Aprovado | Conformidade: CONFORME | Situacao: Estavel | Tipo: Especialista Oficial

---

## 1. Objetivo

Este documento define oficialmente o Especialista Architecture Auditor. Ele e o primeiro Especialista Oficial do MemoryOS, considerado estavel. Sua missao e auditar automaticamente o projeto utilizando como referencia a Biblioteca Oficial.

## 2. Definicao

O Architecture Auditor e um Specialist. Como todo Specialist do MemoryOS (MAS §4.3, MES §18), ele: interpreta, coordena, compara, recomenda. Ele nunca: le arquivos, chama APIs, acessa filesystem, gera relatorios, conhece Providers.

## 3. Separacao de Responsabilidades

O Specialist NAO acessa diretamente: filesystem, fs, glob, path, diretorios, arquivos, a Biblioteca Oficial, AI Providers.

Toda leitura ocorre exclusivamente atraves das Capabilities oficiais (MAS §4.4).

## 4. Capabilities Oficiais

4.1 ProjectReaderCapability (v1.0) — Responsavel por ler o projeto.
4.2 OfficialLibraryReaderCapability (v1.0) — Responsavel por carregar a Biblioteca Oficial.
4.3 CodeAnalyzerCapability (v1.0) — Responsavel pela analise arquitetural.
4.4 ReportBuilderCapability (v1.0) — Responsavel pela construcao do MACR.

## 8. Interface Oficial do Specialist

interface Specialist { analyze(); advise(); confidence(); }

## 14. MACR — Formato Oficial (v3.1)

O MACR nao utiliza pontuacoes numericas. Apenas classificacoes objetivas: CONFORME, PARCIALMENTE CONFORME, NAO CONFORME.

## 18. Declaracao Oficial

O Architecture Auditor e o primeiro Especialista Oficial estavel do MemoryOS. Ele audita o projeto contra a Biblioteca Oficial, orquestrando quatro Capabilities oficiais. O Specialist implementa apenas analyze(), advise() e confidence(), nunca acessando arquivos, Providers ou filesystem diretamente.

---

Documento Oficial: Architecture Auditor Specialist | Versao: 3.1 | Status: Aprovado | Conformidade: CONFORME | Situacao: Estavel`,
};

const _state = {
  loaded: false,
  docs: {},
  errors: [],
};

/**
 * Carrega todos os documentos da Biblioteca Oficial.
 * Idempotente. Os documentos estao embutidos — nenhum I/O ocorre.
 */
async function load() {
  if (_state.loaded) return;
  const docs = {};
  const errors = [];
  for (const [name, content] of Object.entries(EMBEDDED_DOCS)) {
    if (typeof content === "string" && content.length > 0) {
      docs[name] = content;
    } else {
      errors.push(`Documento vazio ou invalido: ${name}`);
    }
  }
  _state.docs = docs;
  _state.errors = errors;
  _state.loaded = true;
}

/**
 * Retorna um documento pelo nome (com cache).
 * Nao exige que load() tenha sido chamado antes.
 */
async function loadDoc(name) {
  if (_state.docs[name]) return _state.docs[name];
  const content = EMBEDDED_DOCS[name];
  if (typeof content === "string" && content.length > 0) {
    _state.docs[name] = content;
    return content;
  }
  return null;
}

function isReady() {
  return _state.loaded;
}

function getDocs() {
  if (!_state.loaded) {
    throw new Error(
      "OfficialLibraryManager nao foi inicializado. Chame OfficialLibraryManager.load() antes de acessar os documentos."
    );
  }
  return { ..._state.docs };
}

function getDoc(name) {
  if (!_state.loaded) {
    throw new Error(
      "OfficialLibraryManager nao foi inicializado. Chame OfficialLibraryManager.load() antes de acessar os documentos."
    );
  }
  return _state.docs[name] || null;
}

function getDocNames() {
  if (!_state.loaded) return [];
  return Object.keys(_state.docs);
}

export const OfficialLibraryManager = {
  id: "official-library-manager",
  version: "3.0",
  load,
  loadDoc,
  isReady,
  getDocs,
  getDoc,
  getDocNames,
};

export default OfficialLibraryManager;