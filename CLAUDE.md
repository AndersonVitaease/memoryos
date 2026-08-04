# See AGENTS.md

Follow the instructions in `AGENTS.md`.

---

## Session Notes

### 2026-07-30 a 2026-07-31 — Performance, limpeza de codigo morto, multi-provider de IA, MCP, documentos, conectores nativos

**Doc completa:** `src/docs/05-project-memory/Decisions.md` (secao "Sessao 2026-07-30") + `src/docs/foundation/adr/ADR-010.md` + `ADR-011.md`

**Sessao de um dia inteiro, com acesso real ao repositorio via ferramenta de terminal (Node, npm, git, esbuild, vite build) -- toda mudanca validada com build real antes de commit, nao so sintaxe.**

**1. Performance (numeros medidos em producao):**
- Busca web: 26.000-43.000ms -> 1.500-2.900ms (substituicao de `InvokeLLM+grounding` por Serper API -- ver ADR-010)
- `SearchEngine` parou de esperar o provider mais lento (`Promise.all` -> resolve no primeiro provider bom)
- `memoryPipeline.js`: atalho por regex pra perguntas simples de memoria (pula chamada de LLM)
- `capabilityDetector.js`: timeout de 8s na checagem semantica (antes sem limite, contribuia pros timeouts globais de 90s)
- ETAPA 6 (resposta final) migrada pra registro de providers de IA (OpenRouter primeiro, ~600-900ms, fallback Base44) -- ver ADR-011
- Desvio de "servico de IA direto" (traducao/resumo/transcricao) corrigido e movido pro inicio do pipeline (ETAPA 0)

**2. Limpeza de codigo morto:**
- 103 pastas de `src/lib` removidas (183 -> 91), 121+ paginas de `src/pages` removidas (269 -> ~148)
- Metodologia corrigida no meio do processo: regex teve falso positivo/negativo reais (quase apagou `Connections.jsx`, pagina real, por engano) -- toda analise final usou `esbuild`/`vite build` reais
- **Regressao causada e corrigida:** `Phase570Page.jsx` (autenticacao GitHub/Base44) foi apagada por engano -- so era alcancada por URL direta (rota real sem nenhum `import` apontando pra ela, ponto cego da analise por import). Restaurada como `ConnectorAuthCenter.jsx`, agora linkada de verdade em `Connections.jsx`.

**3. Registro de Providers de IA:** `src/lib/ai-provider-registry/` -- extensivel, mesmo padrao do `ConnectorRegistry`. Hoje: Base44 + OpenRouter (text-generation).

**4. Cliente MCP generico + Google Workspace MCP:** `base44/functions/mcpClientCall/entry.ts` (SDK oficial, Streamable HTTP + SSE fallback). Testado com sucesso contra o Gmail MCP oficial do Google, reaproveitando token OAuth ja existente (13 ferramentas retornadas). Bug do SDK oficial contornado (`tryRecoverResultFromError` -- issues #804/#340 do repo oficial). `tools/call` (execucao real) ainda falha por credencial -- nao resolvido.

**5. Document Processing:** `base44/functions/documentParser/entry.ts` (mammoth + xlsx/SheetJS) preenche gap de DOCX/XLSX documentado como "planejado, nunca implementado". Corrigido bug pre-existente: upload de anexo no chat anunciava aceitar .docx/.xlsx mas sempre falhava. Nova capacidade: conteudo completo de documento sem o corte de 500/800 chars do contexto normal (`FullDocumentContentDetector.js`).

**6. Bug de roteamento:** `CalendarSemanticProvider.ts` sequestrava mensagens com palavra generica de tempo ("hoje", "semana") sozinha -- peso ajustado de 0.45 pra 0.15 (abaixo do limiar sozinho).

**7. Conectores nativos novos (base construida, aguardando credenciais do usuario):**
- **Microsoft Graph** (Outlook/Calendar/OneDrive) -- OAuth completo espelhando GoogleAuthSession.js, `MicrosoftGraphConnector.ts` com 8 capacidades. Falta: usuario criar App Registration no Azure Portal.
- **Travellink Web API (Aereo)** -- function `travellinkCall` com criptografia RSA-PKCS1 do Developer Access Code (testada isoladamente, confirmada — RSA_PKCS1_PADDING funciona pra encrypt, decrypt e bloqueado por CVE-2023-46809 mas irrelevante, decrypt e do lado da Travellink).
  - **Credenciais necessarias (usuario nao tem nenhuma ainda):** Developer Token, Developer Access Code, chave publica RSA (formato PEM) — pedir pro suporte, nao existe forma de conseguir sozinho.
  - **Contatos confirmados da Wooba/Travellink:** email `api.travellink@wooba.com.br` (dev/API), WhatsApp +55 61 9148-0799 (comercial/service), telefone +55 (61) 3435-0420, portal suportewooba.com.br. Email de pedido de credencial sandbox ja foi redigido e enviado (ver historico da conversa se precisar reenviar).
  - **ARMADILHA achada, nao repetir:** existe uma API Swagger/REST mais nova em `wooba-sandbox.travellink.com.br/TravellinkWebApi` (categorias Bus/Car/Cruise/Hotels/Insurance/Sales/Ota/Services) — **NAO tem busca/disponibilidade de voo**, so 2 webhooks em "Air". Nao e substituta da API antiga (`AereoNoSession.svc`) que o usuario realmente precisa. Ache o endpoint `Disponibilidade` exato SO na doc original do Postman, nao nessa API nova.
  - Endpoint `/api/help/generatedeveloperaccesscode` dessa API nova poderia ajudar a testar a criptografia com credencial real, mas exige `AccessCredentials` (Company.Identifier + Password) — outra credencial que o usuario tambem nao tem ainda.

**Licoes de metodologia (relevantes pra qualquer sessao futura):**
- Commit (via ferramenta de terminal) != Publish -- so vale no app real apos o usuario clicar "Publicar"
- `vite build`/`esbuild` reais > regex, sempre, pra qualquer analise de "isso e usado?" ou "isso esta quebrado?"
- Reachability por import != reachability por rota (React Router) -- pagina pode ter `<Route>` real sem nenhum `import` apontando pra ela
- Sandbox da ferramenta de terminal e efemero -- pode reiniciar entre chamadas

---


### 2026-08-02 — Watch Engine: Email Agendado via Gmail OAuth

**Doc completa:** `src/docs/01-operational-knowledge/SESSION-2026-08-02-WATCH-ENGINE-EMAIL.md`

**Resumo do que foi feito:**

1. **`base44/functions/watchSchedulerTick/entry.ts`**
   - Gmail OAuth promovido a caminho **principal** para envio de email (antes era fallback)
   - `Core.SendEmail` (Base44 relay) mantido apenas como fallback real
   - Encoding RFC 2047 (`=?UTF-8?B?...?=`) implementado no `Subject` para suportar acentos/UTF-8
   - Body convertido via `TextEncoder → Uint8Array → base64url` para preservar UTF-8
   - `getGoogleAccessToken()` aceita `preferEmail` para buscar token da conta específica do remetente

2. **`src/lib/watch-engine/WatchPlannerBridge.ts`**
   - `PROVIDER_HINTS`: `clock` movido para primeira posição (antes de `gmail`) — mensagens com horário + email agora são corretamente detectadas como envio agendado
   - `TIME_REGEX` expandido para cobrir `15:22hrs`, `15h22`, `às 15:22`, `15:22h`
   - `processMessage()` agora aceita `historyMessages` — extrai email payload das últimas 10 mensagens do histórico se não encontrar na mensagem atual
   - `INTENT_PATTERNS` expandido com padrões de envio agendado: `às HH:MM envie/mande...`

3. **`src/lib/reasoning/memoryReasoningPlanner.js`**
   - Comentário corrigido na pré-etapa Watch (o bridge sempre é invocado — `hasMonitoringIntent()` decide)

4. **`src/pages/ChatPage.jsx`**
   - Polling de notificações Watch simplificado: busca **apenas `pending`**
   - Removida busca de `dispatched` recentes que causava re-exibição das notificações após reload de página
   - Ao processar uma ação `pending`, marca imediatamente como `dispatched` — nunca mais aparece

**Problema principal resolvido:** Emails saíam via `no-reply@base44-apps.com` em vez da conta Gmail real do usuário. Agora saem via Gmail API OAuth com remetente correto.

**Limitação remanescente:** Scheduler tem latência de até ~4min (cron de 5min com 5 sub-iterações). Email pode chegar alguns minutos após o horário pedido.

---

### 2026-08-02 — Watch Engine: Interceptor de Agendamento no ConversationManager

**Doc completa:** `src/docs/01-operational-knowledge/SESSION-2026-08-02-WATCH-ENGINE-SCHEDULER-INTERCEPTOR.md`

**Problema:** O interceptor em `memoryReasoningPlanner.js` (v4–v7) nunca funcionava em produção por causa de browser module caching — o singleton `globalThis.__CXP_MANAGER__` usava a instância antiga do bundle.

**Solução:** Interceptor movido para `ConversationManager.send()`, o único ponto de entrada imune a HMR.

**Mudanças em `ConversationManager.ts`:**

1. **`tryScheduleEmail()`** — função no topo do arquivo, detecta horário + email via regex antes de qualquer pipeline
2. **Watch de aviso simples** — "me avise as HH:MM" → `on_trigger_type: notify_user`, sem email
3. **Confirmação dupla** — quando mensagem tem "me avise" + email, resposta lista as 2 ações ("1. avisar no chat 2. enviar email")
4. **Bypass do pipeline** — se interceptado, persiste mensagens via `Message.create()` direto, nunca chama `conversationPipeline.send()`
5. **Singleton versionado** — `_currentVer = "cxp-sched-v1"` força recriação em novo deploy

**Comportamentos validados:**
- `me avise as 17:05hrs` → Watch notify_user → "Vou te avisar às 17:05"
- `as 17:05hrs envie email Para: x@x.com` → Watch emit_event → "Email para x@x.com às 17:05"
- `me avise + as 17:05hrs envie email Para: x@x.com` → Watch emit_event → confirmação com 2 ações
- Mensagens sem horário → pipeline cognitivo normal (sem impacto)

**Testes validados:** Emails de 17:02 e 17:03 BRT chegaram na caixa correta, notificações apareceram no chat no horário exato, Watch marcado como `completed`.

---

### 2026-08-02 — Watch Engine: Gerenciamento via Chat + Proteção contra Horários Passados (cxp-sched-v2)

**Doc completa:** `src/docs/01-operational-knowledge/SESSION-2026-08-02-WATCH-ENGINE-SCHEDULER-INTERCEPTOR.md`

**Problemas resolvidos:**
1. Watches com horário passado continuavam `active` e geravam notificações inúteis.
2. Não havia forma conversacional de deletar/cancelar avisos já criados.

**Mudanças em `ConversationManager.ts`:**

1. **`isPast(targetTime)`** — verifica se o horário já passou há >6 min (BRT). Aplicado antes de criar qualquer Watch; recusa criação e retorna mensagem explicativa.

2. **`tryManageWatches()`** — novo interceptor antes do scheduler. Detecta comandos de gerenciamento:
   - `"cancelar todos"` / `"deletar todos"` → marca todos os Watches como `completed`
   - `"deletar todos os outros"` / `"manter apenas o das HH:MM"` → remove todos exceto o especificado
   - `"remover o das HH:MM"` → remove Watch específico por horário
   - Usa `Watch.update({ status: "completed" })` (preserva histórico, não deleta)

3. **Singleton incrementado para `cxp-sched-v2`** — força recriação com os novos interceptores.

**Comportamento:** Interceptores rodam na ordem: `tryManageWatches` → `tryScheduleEmail` → pipeline cognitivo.

---

### 2026-08-02 — PDF Automation: Email via Backend Function `sendPdfReport`

**Doc completa:** `src/docs/01-operational-knowledge/SESSION-2026-08-02-WATCH-ENGINE-EMAIL.md` (seção 10)

**Problema:** `knowledgeIngestionPipeline.js` usava `base44.integrations.Core.SendEmail` para enviar o resumo do PDF processado, mas esse relay rejeita destinatários externos (não registrados no app). O erro era engolido silenciosamente pelo `catch`.

**Solução:**
1. **`base44/shared/gmailSend.ts`** — módulo compartilhado extraído com `getGoogleOAuthToken()` e `sendGmailOAuth()`, reutilizável por `watchSchedulerTick` e `sendPdfReport`.
2. **`base44/functions/sendPdfReport/entry.ts`** — nova backend function que envia email via Gmail OAuth; fallback para `Core.SendEmail` se OAuth não disponível.
3. **`src/lib/knowledgeIngestionPipeline.js`** — substituído `Core.SendEmail` por `base44.functions.invoke("sendPdfReport", {...})`.

**Validado:** `sendPdfReport` retornou `{ ok: true, method: "gmail_oauth", to: "borecomba@gmail.com" }` em 595ms.

---

### 2026-08-03 — Fix: Perda de contexto ao fechar e reabrir a aba

**Problema:** Ao fechar e reabrir a aba, o contexto da conversa se perdia — o sistema não lembrava de informações discutidas anteriormente (ex: "Hermes Agent").

**Causa raiz (3 pontos):**
1. `globalThis` é limpo quando a aba fecha — o estado em memória não sobrevive.
2. Histórico passado ao LLM era limitado a apenas 4 mensagens para "conversas simples" — qualquer tópico sem busca web/docs era truncado.
3. `memoryPipeline.interpretIntent` não incluía `"messages"` para perguntas do tipo "me fale sobre X" — informações de sessões anteriores não eram buscadas.

**Correções:**

1. **`ConversationPersistence.ts`** — `getOrCreateActiveSession()` agora salva o ID da sessão ativa no `localStorage` (`memoryos_last_session_id`) e o restaura ao reabrir a aba, antes de qualquer fallback.

2. **`ConversationSessionManager.ts`** — `createNewSession()` e `switchSession()` agora chamam `saveLastSessionId()` para manter o `localStorage` sempre atualizado.

3. **`memoryReasoningPlanner.js`** — Limite de histórico aumentado: conversas simples passam 12 mensagens/6000 chars ao LLM (era 4/3000); conversas complexas passam 16/10000 (era 8/6000).

4. **`memoryPipeline.js`** — Busca cross-session aumentada de 50 para 100 mensagens no fallback; prompt de `interpretIntent` agora instrui explicitamente que "me fale sobre X" sempre inclui `"messages"` nos `query_types`; fallback de erro também inclui `"messages"` por padrão.

---

### 2026-08-02 — Gmail messageId exibido no chat como confirmação de envio

**Motivação:** Usuário queria ver o hash/ID real do Gmail como prova de entrega do email agendado.

**Mudanças:**

1. **`base44/shared/gmailSend.ts`** — `sendGmailOAuth()` agora retorna `string | null` com o `id` da mensagem (campo retornado pela Gmail API no corpo da resposta).

2. **`base44/functions/sendPdfReport/entry.ts`** — captura o `messageId` retornado por `sendGmailOAuth` e inclui na resposta JSON: `{ ok: true, method: "gmail_oauth", to, messageId }`.

3. **`src/lib/knowledgeIngestionPipeline.js`** — `emailSent` agora inclui `messageId: res?.data?.messageId`.

4. **`src/pages/ChatPage.jsx`** — linha de confirmação no chat exibe o ID: `ID Gmail: \`18f3a2c1d4b5e6f7\`` quando disponível.

**Resultado no chat:**
```
📧 Email enviado para borecomba@gmail.com
Assunto: resumo do pdf
ID Gmail: `18f3a2c1d4b5e6f7`
```

**Validado:** messageId real do Gmail apareceu no chat após envio do resumo do PDF.

---

### 2026-08-02 — Fix: Conteúdo de PDF salvo na memória não era exibido ao pedir "abrir pdf X"

**Problema:** Ao pedir "abrir pdf glicina 250g", o `_classifyDriveAction()` retornava `action: "read_content"`. A trava IA-040 bloqueava imediatamente com a mensagem "não tenho leitura real", **sem nem verificar se o documento já estava salvo na memória** (ingestão anterior via pipeline).

**Causa raiz:** O guard `!_hasRealDocRead` usava apenas `officialLibrary` (biblioteca de código) como sinal de "leitura real" — nunca consultava `Document.extracted_text` do banco.

**Fix em `memoryReasoningPlanner.js`** (ETAPA 5.4):
- Antes de disparar a trava, busca `Document.filter({ session_id, processing_status: "completed" })`
- Localiza o doc por nome similar ao `target` (ou o mais recente com `extracted_text`)
- Se encontrar conteúdo salvo → retorna direto com `📄 **nome** (fonte: memória, conteúdo salvo)`
- Só dispara o erro de "não tenho leitura real" se não encontrar nada na memória

**Validado:** "abrir pdf glicina 250g" → exibiu conteúdo completo do PDF já processado.
### 2026-08-02+ (planejamento) — WhatsApp Connector: arquitetura de 4 camadas, verificacao completa do que ja existe

**Contexto:** Usuario pediu WhatsApp Connector seguindo arquitetura especifica de 4 camadas (Provider/Capability/Event/Observation), com Planner NUNCA conhecendo WhatsApp diretamente, so Goals/Capabilities. Pediu verificacao explicita do que ja existe antes de construir, pra nao duplicar.

**METODO DE VERIFICACAO USADO (reutilizar antes de qualquer nova alteracao arquitetural):**
1. `find`/`grep` por nome de arquivo candidato em `src/lib/` E `src/runtime/` E `src/sdk/` (existem 3 arvores de pastas paralelas no projeto — busca em uma so pode dar falso negativo).
2. Rodar o script de forward-reachability (a partir das paginas reais: Login/Register/Home/ChatPage/Memory/Projects/ProjectDetail/SearchPage/Connections/GoogleDrivePage/GoogleCalendarPage/MultiConnectorPage/MissionsPage/GoogleOAuthCallback + AppLayout.jsx/AuthContext.jsx/ProtectedRoute.jsx como roots) pra confirmar se o arquivo candidato esta genuinamente no caminho vivo, nao so existe no disco.
3. Ler o arquivo de verdade (nao confiar so no nome) — varios arquivos com nome parecido podem ser versoes duplicadas/mortas de sprints antigos.
4. Conferir `git diff <primeiro-commit-do-periodo>^ <ultimo-commit-do-periodo> -- <arquivo>` pra saber exatamente o que mudou num periodo, sem depender de resumo em prosa.

**RESULTADO DA VERIFICACAO (2026-08-02, confirmado no codigo real, nao suposicao):**

| Camada | Status | Arquivo real | Evidencia |
|---|---|---|---|
| 2. Capability Layer | ✅ VIVA, em uso hoje por Gmail/Calendar/Drive | `src/lib/planning-engine-e022/GoalCapabilityRegistry.ts` | Docstring literal: "Open/Closed: novos Connectors registram suas proprias capabilities via GoalCapabilityRegistry.register() — o Planner nao muda." Padrao de nome ja usado: `connector: "gmail"`, `capability: "searchEmails"` etc. |
| 3. Event Layer | ⚠️ EXISTE, bem construida, mas ORFA (nao ligada ao ConnectorBootstrap real) | `src/runtime/connectors/RuntimeEventBus.ts` | 15 tipos de evento de conector (ConnectorExecutionStarted/Completed/Failed/Retry/Timeout/etc) + 6 tipos cognitivos adicionados em 02/08 (so union type, sem uso real). `grep -c "RuntimeEventBus" src/lib/connector-runtime/ConnectorBootstrap.ts` = 0 — confirmado NUNCA importado la. Quem usa hoje: paginas mortas (EF31APage/EF31BPage) e uma arvore paralela `src/sdk/connectors/` que NAO e a usada em producao (a real e `src/lib/connector-runtime/connectors/`). |
| 4. Observation Layer | ✅ VIVA hoje, ja tem exemplo funcionando pro pipeline principal | `src/lib/knowledge-registry/KnowledgeRegistry.ts` + `PipelineObservationBridge.ts` | Aceita `ObservationInput` (Evidence/Inference/Hypothesis — exatamente a nomenclatura pedida). RESSALVA: proprio codigo se declara "FASE 1 (Shadow Mode) — apenas persiste, nada ainda le essas observacoes". Nao e limitacao especifica do WhatsApp, e do sistema inteiro hoje. |

**Catalogo Oficial de Eventos** (`src/docs/00-official-library/EVENT-CATALOG.md`, status `OFFICIAL · FROZEN`) ja define o dominio "Capability" com `capability.registered.v1`, `capability.executed.v1`, `capability.failed.v1` seguindo convencao `{dominio}.{entidade}.{acao}.v{N}`. Se formalizar eventos de WhatsApp no catalogo oficial (nao so uso interno), esse e o formato a seguir — MAS o catalogo esta FROZEN, mudanca requer processo de governanca (ver RFC-004.md como exemplo do processo Draft->Accepted). Ate la, tratar eventos de WhatsApp como internos ao RuntimeEventBus, nao oficiais.

**CONFIRMADO (git log completo, 140 commits, 01/08-02/08): ZERO arquivos relacionados a WhatsApp existem em qualquer lugar do repositorio.** Nao ha nada pronto pra reaproveitar especificamente de WhatsApp — a estrutura reaproveitavel e generica (Capability Registry, Event Bus, Knowledge Registry), nao especifica do WhatsApp.

**O que MAIS foi adicionado em 01/08-02/08 (nao relacionado a WhatsApp, registrar pra nao redescobrir depois):**
- Watch Engine completo (`src/lib/watch-engine/*`, 12 arquivos) — agendamento de emails/avisos, ver secao anterior deste arquivo.
- 3 conectores novos E JA LIGADOS de verdade no ConnectorBootstrap: `EmailConnector`, `FileSystemConnector`, `DatabaseConnector`.
- Bootstrap de conectores paralelizado (`Promise.allSettled` em vez de loop sequencial) — deve ter reduzido o tempo de boot medido hoje (3-8s).
- Volume grande de arquitetura nova AINDA NAO VERIFICADA se esta viva: `src/lib/marketplace/`, `src/lib/specialists/`, `src/lib/knowledge-packages/`, `src/lib/developer-portal/`, `src/lib/beta/`, e as mesmas pastas espelhadas em `src/sdk/`. Dado o padrao ja visto hoje (codigo construido sem ser ligado), NAO assumir que esta em uso sem rodar o metodo de verificacao acima primeiro.
- Novas paginas Sprint (`SprintP5-10Page.jsx`, `SprintWE01Page.jsx`) — seguem o mesmo padrao de paginas de auditoria interna ja mapeado, provavelmente candidatas a limpeza futura, nao verificado ainda.

**PLANO DE IMPLEMENTACAO (proximos passos, no momento em que este documento foi escrito, nada abaixo foi feito ainda):**

1. **Religar RuntimeEventBus no ConnectorBootstrap.ts real:**
   - Instanciar um singleton do `RuntimeEventBus` (HMR-safe via globalThis, mesmo padrao do `CognitiveEventBus`/`KnowledgeRegistry`).
   - Em `src/lib/connector-runtime/ConnectorBootstrap.ts`, apos cada `registry.register(connector)`, emitir `runtimeEventBus.emit('ConnectorRegistered', connector.id, {...})`.
   - Em `UCRBridge`/`ExecutionDispatcher` (onde `execute()` de qualquer conector e chamado), emitir `ConnectorExecutionStarted`/`ConnectorExecutionCompleted`/`ConnectorExecutionFailed` ao redor da chamada.
   - Validar com o mesmo rigor de hoje: esbuild por arquivo + `vite build` completo antes de considerar pronto.

2. **WhatsApp Connector — Camada 1 (Provider) + Camada 2 (Capability):**
   - Decidir provider tecnico ainda pendente — usuario NAO decidiu entre API oficial (Meta Cloud API, zero risco, exige Business Manager + verificacao + templates) ou nao-oficial (Baileys/whatsmeow, risco real de banimento — usuario ja recusou essa opcao numa conversa anterior no mesmo dia). Assumir API oficial exclusivamente ate segunda ordem.
   - Seguir exatamente o molde de `src/lib/connector-runtime/connectors/MicrosoftGraphConnector.ts` (construido hoje) — IConnector, capabilities como metodo, sem estado.
   - Registrar capabilities no `GoalCapabilityRegistry` com nomes `whatsapp.sendMessage`, `whatsapp.readConversation`, etc — mesma convencao ja usada por gmail/calendar/drive.

3. **Camada 4 (Observation) para WhatsApp:**
   - Espelhar `PipelineObservationBridge.ts` — criar bridge equivalente que transforma execucoes do WhatsApp Connector em `ObservationInput` e chama `knowledgeRegistry.commit()` (fire-and-forget, nunca lanca excecao, mesmo padrao).

**IMPORTANTE PRA QUALQUER SESSAO FUTURA LENDO ISTO:** antes de assumir que qualquer peca acima ja foi implementada, rodar o metodo de verificacao descrito no topo desta secao — nao confiar so nesta descricao, o codigo pode ter mudado depois desta data.

---

### 2026-08-03 — WhatsApp Connector: Arquitetura de 5 Camadas Completa (scaffold)

**Doc completa:** `src/docs/01-operational-knowledge/SESSION-2026-08-03-WHATSAPP-CONNECTOR-5-LAYERS.md`

**Contexto:** Usuario pediu WhatsApp Connector seguindo arquitetura explicita de 5 camadas (Capability / Provider / Event / Observation / Watch), com Provider Layer abstraindo multiplos provedores (Meta Cloud oficial + Evolution API + Baileys como stubs futuros). O Planner NUNCA conhece o provedor ativo — so chama capabilities.

**METODO DE VERIFICACAO USADO antes de codar (reutilizar sempre):**
1. Leu `PipelineObservationBridge.ts` + `KnowledgeRegistry.ts` + `KnowledgeRegistryTypes.ts` para confirmar o padrao exato da Observation Layer (payload types FROZEN, singleton HMR-safe via globalThis, fire-and-forget).
2. Leu `ConnectorGateway.ts` + `WatchTypes.ts` para confirmar como o Watch Engine registra providers (`connectorGateway.registerProvider(id, handler)` — handler recebe `action` + `params`).
3. Leu `openrouterChat/entry.ts` para confirmar o padrao real do backend function em producao (`Deno.serve` + `Deno.env.get()` + `createClientFromRequest` — NAO usa `export default async function` nem `secrets.get()` do base44:runtime, apesar do guia dizer isso).

**DECISAO CRITICA — Observation Layer:** `KnowledgeRegistryTypes.ts` tem `REGISTERED_SCOPES` e `REGISTERED_PAYLOAD_TYPES` como sets FROZEN. NAO existem "whatsapp" scope nem payload type whatsapp-specific. Em vez de modificar tipos frozen (risco de quebrar validacao existente), usei:
- `payloadType: "connector_result"` (ja registrado, usado pela Pipeline para resultados de connectors)
- `contextScope: "session"` (ja registrado)
- `producerId: "WhatsAppConnector"` (identifica a origem no campo `data`)

**Arquivos criados (9 novos) + 2 edicoes em arquivos existentes:**

| Camada | Arquivo | Funcao |
|---|---|---|
| **Tipos** | `src/lib/whatsapp/WhatsAppProviderTypes.ts` | Interface `WhatsAppProvider` que todo provedor implementa (sendMessage, sendTemplate, getMessageStatus, isAvailable). Sem imports de runtime. |
| **Provider** | `src/lib/whatsapp/providers/MetaCloudProvider.ts` | Provedor oficial via Meta Cloud API. Delega para backend function `whatsappApi`. `isOfficial=true`. |
| **Provider** | `src/lib/whatsapp/providers/EvolutionAPIProvider.ts` | STUB. Self-hosted, nao exige Business Manager, risco de banimento. `isAvailable()=false`. |
| **Provider** | `src/lib/whatsapp/providers/BaileysProvider.ts` | STUB. Biblioteca que emula WhatsApp Web. `isAvailable()=false`. |
| **Provider** | `src/lib/whatsapp/WhatsAppProviderRegistry.ts` | Singleton HMR-safe. Registra os 3 provedores no load. Default ativo: `meta-cloud`. `setActive(id)` para trocar. |
| **Capability** | `src/lib/connector-runtime/connectors/WhatsAppConnector.ts` | Implementa `IConnector`. Delega ao `whatsappProviderRegistry.getActive()`. Chama `whatsAppObservationBridge.observe()` fire-and-forget apos cada execucao (sucesso OU falha). Import side-effect de `WhatsAppWatchProvider`. |
| **Observation** | `src/lib/whatsapp/WhatsAppObservationBridge.ts` | Singleton HMR-safe. Transforma resultado de execucao em `ObservationInput` e commita no `KnowledgeRegistry` (fire-and-forget, nunca lanca excecao). |
| **Watch** | `src/lib/whatsapp/WhatsAppWatchProvider.ts` | Self-registra no module load: `connectorGateway.registerProvider("whatsapp", handler)`. Handler retorna stubs (`count_new_messages: 0`) ate webhook inbound ser implementado. |
| **Backend** | `base44/functions/whatsappApi/entry.ts` | Backend function Deno. Chama Meta Graph API v21.0. Secret-gated: retorna 503 se `WHATSAPP_ACCESS_TOKEN` ou `WHATSAPP_PHONE_NUMBER_ID` nao definidos. |
| **Edicao 1** | `src/lib/connector-runtime/ConnectorBootstrap.ts` | Adicionada factory `WhatsAppConnector` no `OFFICIAL_FACTORIES` (apos DatabaseConnector). Bootstrap paralelizado (`Promise.allSettled`) ja existia. |
| **Edicao 2** | `src/lib/planning-engine-e022/GoalCapabilityRegistry.ts` | Adicionados 3 mappings: `whatsapp.sendMessage`, `whatsapp.sendTemplate`, `whatsapp.getMessageStatus` — todos `{ connector: "whatsapp", capability: "whatsapp.*", params: {} }`. Inseridos ANTES do bloco `general.conversation`/`unknown` no final do `_builtins`. |

**Event Layer (Camada 3) — ZERO codigo novo:**
A `UCRBridge.ts` (que envolve TODO connector no runtime) ja emite `ConnectorExecutionStarted` / `ConnectorExecutionCompleted` / `ConnectorExecutionFailed` no `RuntimeEventBus` para qualquer connector, inclusive WhatsApp. O `ConnectorBootstrap.ts` tambem emite `ConnectorRegistered` no registro (religado em 2026-08-02+). Nada a instrumentar do lado do WhatsApp.

**O que esta FUNCIONANDO agora (sem secrets):**
- Bootstrap carrega `WhatsAppConnector` junto com os outros 11 connectors — `validateConnector()` passa, `registry.register()` executa, `runtimeEventBus.emit("ConnectorRegistered", "whatsapp", ...)` dispara.
- `GoalCapabilityRegistry` tem os 3 mappings de WhatsApp — o Planner pode resolver goals `whatsapp.*` para capabilities.
- `ConnectorGateway` tem o provider "whatsapp" registrado — Watches com `provider: "whatsapp"` podem ser criados e o `WatchEvaluator` chama o handler (retorna `count: 0`).
- `WhatsAppObservationBridge` commita no `KnowledgeRegistry` apos cada `execute()` — observacoes aparecem na entidade `KnowledgeObservation` com `producer_id: "WhatsAppConnector"`.
- Backend function `whatsappApi` deployado e validando — retorna 503 gracioso se secrets faltam, nao quebra o app.

**O que PRECISA para funcionar de verdade (pendente do usuario):**
1. **Secrets (Settings > Environment Variables):**
   - `WHATSAPP_ACCESS_TOKEN` — token permanente do System User no Meta Business Manager
   - `WHATSAPP_PHONE_NUMBER_ID` — ID do numero verificado no WhatsApp Manager > Phone Numbers
2. **Verificar numero de teste:** no WhatsApp Manager, adicionar o numero de teste aos recipients (sem isso, Meta rejeita mesmo com token valido na sandbox).
3. **Templates aprovados:** para `sendTemplate`, o template precisa estar criado e aprovado no WhatsApp Manager (pode levar horas para aprovacao).

**O que ficou como STUB para o futuro (nao quebra nada hoje):**
- `EvolutionAPIProvider` e `BaileysProvider`: `isAvailable()=false`, metodos `throw`. Para ativar: implementar chamadas reais (provavelmente novas backend functions `whatsappEvolutionApi` / `whatsappBaileysApi`) e `whatsappProviderRegistry.setActive("evolution-api")`.
- `WhatsAppWatchProvider` handler inbound: retorna `count: 0`. Para ativar: configurar webhook no Meta Business Suite (`POST` para uma URL publica), criar backend function `whatsappWebhook` para receber e armazenar mensagens inbound em uma nova entidade, e o handler do Watch ler essa entidade.
- Observation Layer: ainda em Shadow Mode (Fase 1) — persiste mas nada le as observacoes ainda (limitacao do sistema inteiro, nao so do WhatsApp — ver `KnowledgeRegistry.ts` docstring).

**Teste de validacao rodado:**
- `test_backend_function("whatsappApi", { operation: "sendMessage", to: "5511999999999", message: "teste" })` → retornou erro esperado "missing required secrets: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID" — confirma que a funcao esta deployada e valida secrets corretamente.

**NAO foi feito (explicitamente fora do escopo desta sessao):**
- Nenhum teste de envio real de mensagem (sem secrets).
- Nenhuma UI de chat/Connections para WhatsApp (o Connector e registrou, mas `Connections.jsx` e `ChatPage.jsx` nao foram tocados — se o usuario pedir "enviar WhatsApp para X" no chat, o Planner pode resolver o goal, mas o backend vai retornar 503 ate ter secrets).
- Nenhum webhook inbound (requer URL publica + Meta Business Suite config).
- Nenhuma documentacao no `EVENT-CATALOG.md` oficial (catalogo FROZEN — eventos de WhatsApp sao internos ao RuntimeEventBus por enquanto).

---

### 2026-08-03 — Migracao do Chat de Projeto para CXP v2 (Implementacao Detalhada — APROVADO)

**Doc completa:** `src/docs/01-operational-knowledge/SESSION-2026-08-03-CHAT-PROJECT-MIGRATION-IMPLEMENTATION.md`

**Status:** APROVADO em 2026-08-03 17:24 BRT. Documento linha-a-linha pronto. Nenhum codigo alterado ainda.

**Objetivo:** Migrar a aba de chat de `ProjectDetail.jsx` da pipeline antiga (`ChatInterface` + `conversationEngine` + `contextRetrieval`) para a CXP v2 (`ChatPage` + `useConversation`), adicionando escopo de projeto na CXP, sem quebrar o chat global nem perder dados.

**Snapshot do estado atual (antes da migracao):**
- `ConversationPersistence.ts`: `getOrCreateActiveSession()`, `createSession(title)`, `loadActiveSession()`, `saveLastSessionId(id)`, `getLastSessionId()` — todos sem escopo de projeto. Filtro global `{ status: "active" }` retorna sessoes de projeto tambem (vazamento).
- `ConversationSessionManager.ts`: `initializeSession()`, `createNewSession(title)` — sem param de projeto.
- `ConversationManager.ts`: `initialize()`, `newSession(title)` — sem param de projeto.
- `useConversation.js`: `useConversation()` — sem opcoes.
- `ChatPage.jsx`: `ChatPage()` — sem props.
- `ProjectDetail.jsx` linha 11: `import ChatInterface`; linhas 124-126: `<ChatInterface projectId={id} projectName={project.name} />`.

**Plano em 5 fases (cada fase aditiva e reversivel):**

- **Fase 0 — Adicionar escopo de projeto na CXP (aditivo, backward compatible):**
  - `ConversationPersistence.ts`: `saveLastSessionId(id, projectId?)`/`getLastSessionId(projectId?)` com chaves por escopo (`memoryos_last_session_id` global, `memoryos_last_session_id__proj_${id}` projeto); `loadActiveSession(projectId?)` com filtro `{ project_id: projectId }` (projeto) ou `{ project_id: null }` (global, exclui projeto); `createSession(title?, projectId?)`; `getOrCreateActiveSession(projectId?)`.
  - `ConversationSessionManager.ts`: `initializeSession(projectId?)`, `createNewSession(title?, projectId?)`.
  - `ConversationManager.ts`: `initialize(projectId?)`, `newSession(title?, projectId?)`.
  - `useConversation.js`: `useConversation({ projectId })`, init com `useEffect([projectId])`.
  - `ChatPage.jsx`: `ChatPage({ projectId })`.
  - Risco: filtro `{ project_id: null }` — validar com query real; fallback `$exists: false` / `$or`.

- **Fase 1 — Isolar sessao por escopo (validacao):** confirma filtro `project_id: null` + chaves localStorage separadas + isolamento manual cruzando global/projeto A/projeto B.

- **Fase 2 — Reusar ChatPage no ProjectDetail (swap, revertivel):** `ProjectDetail.jsx` linha 11 troca `import ChatInterface` por `import ChatPage`; linhas 124-126 trocam `<ChatInterface projectId={id} projectName={project.name} />` por `<ChatPage projectId={id} />`.

- **Fase 3 — Verificar paridade (checklist):** extracao de conhecimento (`processConversationBatch` roda igual), resumo (`syncSessionMetadata`), historico antigo (sessoes com `project_id` lidas), isolamento (A nao vaza em global/B), re-init ao trocar escopo, voice/anexos/watch/scroll na aba de projeto.

- **Fase 4 — Delecao segura (so apos Fase 3 100% verde):** deleta `ChatInterface.jsx` + `contextRetrieval.js`; remove `getOrCreateActiveSession` + `shouldProcessBatch` do `conversationEngine.js` (MANTem `processConversationBatch` — compartilhado com CXP); remove import `X` morto do `ChatPage.jsx`; build final.

**Riscos principais:** (1) filtro `project_id: null` suportado pelo backend Base44; (2) guard `isInitialized` bloqueia re-init ao trocar escopo; (3) sessoes orfas sem `project_id` do ChatInterface antigo viram "globais" se nao houver atribuicao retroativa; (4) `ConversationBackgroundProcessor` ja passa `session.project_id` para `processConversationBatch` (linha 131) — confirmar.

**Estado final esperado:** unico motor de chat (CXP v2), chat global e de projeto diferenciados apenas por `projectId`, `conversationEngine.js` mantem so `processConversationBatch`, `ChatInterface` + `contextRetrieval` deletados, zero perda de dados.

**Ordem de execucao:** Fase 0 (batch unico de 5 arquivos) -> build -> Fase 1 (validacao) -> Fase 2 (2 linhas) -> build + preview -> Fase 3 (checklist) -> Fase 4 (delecoes + limpeza) -> build final.

---

### 2026-08-03 — Chat: Limpeza de Timeline Legada + Auditoria de Pipeline Antigo

**Doc completa:** `src/docs/01-operational-knowledge/SESSION-2026-08-03-CHAT-LEGACY-CLEANUP-AUDIT.md`

**Resumo do que foi feito (executado):**

1. **Limpeza de timeline orfaos (7 arquivos deletados):** `MessageBubble.jsx`, `TimelineEventRenderer.jsx`, `EventShell.jsx`, `WatchEventCard.jsx`, `KnowledgeEventCard.jsx`, `ConnectorEventCard.jsx`, `CognitiveEventCard.jsx` — cluster fechado, nenhum consumidor vivo apos a remocao do "Modo Timeline" do ChatPage.
2. **Metodo removido do ConversationManager:** `getTimeline(sessionId?, limit?, beforeTimestamp?)` — API nova opcional (merge Message + SystemEvent), nunca consumida pelo hook ou ChatPage. Zero impacto.
3. **Preservado:** `src/components/timeline/formatTime.js` — ainda importado por ChatPage para timestamps BRT dos bubbles.

**Auditoria de codigo morto/legado no caminho do chat:**

- **ChatPage (CXP v2):** limpo. Unico morto: import do icone `X` sem uso no JSX (pendente remocao de 1 token).
- **Pipeline antiga AINDA VIVA** (legado, nao morto): `ChatInterface.jsx` + `contextRetrieval.js` + `conversationEngine.js` usados pela aba de chat de `ProjectDetail.jsx` (linha 11). Dois motores de chat coexistem: ChatPage usa CXP v2 (arbiter + execution outcomes), ProjectDetail usa pipeline antiga (InvokeLLM direto + conversationEngine).
- **Descoberta critica:** `conversationEngine.processConversationBatch` e **COMPARTILHADO** — o `ConversationBackgroundProcessor.ts` (linha 130) da propria CXP o importa e chama a cada 5 mensagens. NAO e deletavel; so `getOrCreateActiveSession`/`shouldProcessBatch`/`ChatInterface`/`contextRetrieval` sao removiveis apos migracao.
- **Bloqueador:** `ProjectDetail` importa `ChatInterface` para a aba de chat do projeto. Nao e limpeza, e migracao.

**Plano de migracao segura (5 fases aditivas, aguardando autorizacao):**
- Fase 0: adicionar escopo de projeto na CXP (getOrCreateActiveSession/createSession/loadActiveSession com `projectId?` — backward compatible).
- Fase 1: isolar sessao por escopo (chave localStorage por projeto: `memoryos_last_session_id__proj_${id}`).
- Fase 2: reusar `<ChatPage projectId={id} />` no ProjectDetail (swap de 1 linha).
- Fase 3: verificar paridade (extracao de conhecimento, resumo, historico, isolamento).
- Fase 4: delecao segura (ChatInterface + contextRetrieval + 2 exports do conversationEngine; mantem `processConversationBatch`).

---

### 2026-08-03 — Arquitetura Event-Driven Timeline (Planejamento — Opcao B)

**Doc completa:** `src/docs/01-operational-knowledge/SESSION-2026-08-03-EVENT-DRIVEN-TIMELINE-ARCHITECTURE.md`

**Status:** APENAS PLANEJAMENTO. Nenhum codigo implementado nesta sessao.

**Contexto:** Decisao arquitetural de migrar da arquitetura Message-based (todas ocorrencias do sistema como `Message` no banco) para Event-Driven Timeline (ocorrencias de sistema publicadas como `SystemEvent` via Event Bus). O chat passa a ser apenas um tipo de evento dentro da timeline.

**Verificacao feita antes de planejar (mapeamento do estado real):**
- `CognitiveEventBus.ts` — VIVO, singleton HMR-safe, 6 tipos de evento, em memoria apenas (200 historico), `onAny()` disponivel. Base ideal para plugar persistence bridge.
- `RuntimeEventBus.ts` — VIVO mas PARALELO (barramento separado, nao compartilha historia com CognitiveEventBus). 15 tipos de conector + 6 cognitive.
- `ConversationStore.ts` — VIVO, tem seu PROPRIO event system interno (independente dos dois buses acima).
- `CXPTypes.ts` (linhas 185-191) — JA define interface `ConversationEvent` (in-memory, 13 tipos, NAO persistida).

**Conflito de nomenclatura detectado (CRITICO):** A interface `ConversationEvent` em CXPTypes ja existe para eventos in-memory do pipeline. A nova entidade persistida NAO pode se chamar `ConversationEvent`. Nome proposto: **`SystemEvent`**.

**Schema proposto (`SystemEvent`):** schema-agnostic via `payload` + `metadata` (type: object), com `correlationId`, `parentId`, `timestamp`, `type`, `source`, `actor`, `status`. Extensivel sem alteracao de schema para futuros tipos de evento.

**Plano em 4 fases (sem quebras):**
1. **Fundacao:** Criar entidade `SystemEvent` + `EventPersistenceBridge` (escuta `cognitiveEventBus.onAny`, persiste fire-and-forget) + `getTimeline()` no ConversationManager (merge Message + SystemEvent ordenados por timestamp).
2. **Instrumentacao passiva:** Estender bridge para escutar `RuntimeEventBus` tambem. Render polimorfico no ChatPage (card generico para eventos, ChatBubble para messages).
3. **Migracao das fontes:** Watch Engine, Connector Runtime e Knowledge Ingestion param de criar `Message` para confirmacoes de sistema e passam a publicar `SystemEvent`. `Message` fica exclusiva para role user/assistant.
4. **Modo Timeline:** Switcher no ChatPage ("Conversacao" vs "Linha do Tempo") + cards ricos (EmailEventCard, WatchEventCard).

**Mapa de risco documentado:**
- VIVO (extensivel): CognitiveEventBus, ConversationManager, ConversationStore, ChatPage, Message.
- PARALELO (precaucao): RuntimeEventBus (fonte independente), CXPTypes `ConversationEvent` (nao confundir com nova entidade).
- LEGADO (apos Fase 3): `PendingWatchAction.jsonc` (torna-se redundante), injecao de `Message` para confirmacoes de sistema.
- A CRIAR: `SystemEvent.jsonc`, `EventPersistenceBridge.ts`, `src/components/timeline/*`.

**Principios de nao-quebra:** aditivo (nunca destrutivo), merge no frontend, fallback para chat, bridge fire-and-forget, render com default seguro, modo default = Conversacao.

---

### 2026-08-03 — Inspecao de Codigo Morto: 85 arquivos removidos com seguranca

**Objetivo:** Auditoria sistematica de modulos orfaos no repositorio, removendo apenas o que tem certeza de nao quebrar nada (regra do usuario: "so deleta se for certeza que nao teremos problemas").

**Metodologia de verificacao (em 2 passos, para evitar falsos positivos):**
1. **Grafo de import 1-passo:** varre todos os arquivos `src/` + `base44/`, extrai specifiers de import/export via regex, resolve cada um (alias `@/`, relativo `../`, extensoes `.ts/.tsx/.js/.jsx` + `index.ts` para barrels). Um arquivo com zero importadores-resolvidos e candidato a morto.
2. **Classificador de mencionadores (anti-falso-positivo):** para cada candidato, separa mencionadores em `importLine` (linha e `import`/`export...from` contendo o token) vs `stringMention` (mencao em string/comentario). So deleta se `importLine === 0` (a mencao e so string/doc, nao import real). Arquivos com imports reais confirmados = VIVOS, nunca deletar.

**Bug de metodologia descoberto e corrigido no meio:** o classificador de barrels (`index.ts`) conta falsos positivos — `import { X } from '@/lib/dir/Sibling'` contem "dir" como substring do path mas importa o SIBLING, nao o barrel. Decisao: barrels com sinal conflitante (zero importadores resolvidos no grafo, mas aparecem no classificador) ficam de fora por incerteza. Nao deletar.

**Remocoes executadas (85 arquivos total):**

1. **Libs orfaos (12 arquivos):** providers defuntos (`OpenAI*.js`, `Anthropic*.js`), audit stores antigos, modulos de reason/providers sem nenhum importador. Zero refs em codigo.
2. **UI components/hooks orfaos (65 arquivos):** cluster `ef40` de certificacao (defunto), test runners de UI, componentes de timeline mortos (`MessageBubble`, `TimelineEventRenderer`, `EventShell`, `*EventCard`), hooks sem uso. Verificacao: cada um tinha zero imports confirmados.
3. **Arquivos com mencao so em string (5 arquivos):** `RKBInstrumented.ts`, `WebSearchProvider.ts`, `GmailAdapter.ts` (ucr), `CertificationMetrics.jsx`, `LearningTestRunner.jsx` — mencionados apenas em strings/docs, nunca importados.
4. **Funcao de backend orfa (1 arquivo):** `base44/functions/cleanupContaminatedRecords/entry.ts` — zero referencias em codigo, workflows e agentes. Script one-off de limpeza, nunca invocado.
5. **Entidades legacy sem uso (2 arquivos):** `base44/entities/ChatMessage.jsonc` + `base44/entities/Conversation.jsonc` — zero chamadas `base44.entities.X` no codigo, zero acesso dinamico (`entities[...]`), zero referencias em workflows/agentes, **zero registros salvos** (confirmado via SDK: ambas as colecoes estavam vazias). Superseded por `Message` (ChatMessage) e `ChatSession` (Conversation).

**Verificacao pre-delecao de entidades (modelo a repetir):** antes de afirmar "seguro" em entidades, checar 4 coisas — (a) contagem de registros via `base44.entities.X.list()`, (b) `entities.X` estatico em codigo, (c) `entities[X]` dinamico, (d) nome em workflows/agentes `.jsonc`. So deletar se todos 4 = zero.

**Nao deletado (decisao explicita):**
- 21 barrels `index.ts` com sinal conflitante (grafo diz morto, classificador conta paths de siblings como "importers"). Incerteza > risco. Preservados.
- 133 arquivos de teste sem runner (`*.test.ts`, `*Tests.ts`, `*.spec.ts`) — decisao de produto, nao de codigo. Sem runner configurado, mas podem ser revividos. Preservados ate decisao do usuario.
- ~50 arquivos de raiz (`test_*.mjs`, `*_FINAL.md`, `AUDITORIA_*.md`, `MATRIZ_*.md`) — scripts de teste manual e relatorios pontuais da raiz do projeto. Decisao de produto. Preservados.

**Build verificado:** apos cada batch de delecao, nenhum WARNING de import nao resolvido. App continua compilando.

**Licao de metodologia (reutilizar):** regex de import-resolve tem dois modos de falhar — falsos negativos (nao pegou um import real, marca vivo como morto) e falsos positivos (pega path de sibling como import do barrel, marca morto como vivo). Para limpeza, o classificador de mencionadores e o freio de seguranca: ele confirma com evidencia direta (a linha e um import contendo o token) antes de deletar. Sempre rodar os dois juntos; nunca deletar com base em um so.

---


### 2026-08-03 — [ROADMAP] Evolucao da Interface: UX Multi-Contexto (Sprint 8.1)

**Doc oficial:** `src/docs/00-official-library/MIP-MemoryOS-Master-Implementation-Plan.md` (Capitulo 11 — UX Evolution Layer)

**Objetivo:** Transicionar do Chat Monolitico para Interface Multi-Contexto (Transparencia Cognitiva + Context Switching + Feedback Visual), sem quebrar o motor de processamento existente.

**Principio arquitetural:** aditivo e nao-destrutivo. Novos componentes apenas "escutam" EventBuses ja existentes (CognitiveEventBus, RuntimeEventBus) — nunca interrompem ou reescrevem o fluxo do `useConversation` ou do `ConversationPipeline`.

**Plano de Implementacao (4 Fases):**

- **Fase 1 — Observabilidade "Shadow" (zero risco):**
  - Criar `MemoryActivityIndicator.jsx` (escuta `cognitiveEventBus.onAny` — exibe atividade cognitiva recente: planning, llm_response, knowledge_observation).
  - Criar `GlobalSyncStatus.jsx` (escuta `runtimeEventBus.onAny` — reflete estado de sincronizacao de conectores).
  - Integrar ao `AppLayout.jsx` como stubs passivos (fixed top-right, overlay — nao shifta layout). Se falharem, apenas somem.

- **Fase 2 — Sidebar Contextual (risco baixo):**
  - Extrair `Sidebar` atual para `ContextAwareSidebar.jsx`.
  - Hook `useNavigationContext` decide conteudo: Global (projetos) vs Projeto (docs/tags locais).
  - `Home.jsx`/`ProjectDetail.jsx` continuam recebendo as mesmas props; apenas o que a sidebar exibe muda.

- **Fase 3 — Feedback Ativo / Notificacoes (risco baixo/medio):**
  - `knowledgeIngestionPipeline.js` passa a emitir `SystemEvent` em vez de injetar `Message` de confirmacao no chat.
  - `NotificationHub.jsx` (no `AppLayout`) converte `SystemEvents` de sucesso em Toasts via `sonner`.
  - Chat fica limpo; feedback visual rapido valida o que a IA aprendeu.

- **Fase 4 — Visualizacao Hibrida / Timeline Drawer (risco medio):**
  - Adicionar botao "Linha do Tempo" no ChatPage que abre `TimelineDrawer` (via `vaul`).
  - Drawer carrega `SystemEvents` da sessao (merge com `Messages`), sincronizado com o chat.
  - Chat intocado; nova visualizacao apenas consome a mesma fonte de dados.

**Riscos e mitigacao documentados:**
- HMR/state loss em `ChatPage`: desenvolver componentes isolados primeiro (so leem, nunca interrompem `useConversation`).
- CSS/mobile: usar overlay fixed para indicadores — nao alterar containers do `AppLayout`.

**Estado:** Fase 1 iniciada em 2026-08-03. Componentes criados: `MemoryActivityIndicator.jsx`, `GlobalSyncStatus.jsx` (integração ao `AppLayout.jsx`).

---

### 2026-08-03 — Otimizacoes de Performance do Pipeline de Conversa

**Doc completa:** `src/docs/01-operational-knowledge/SESSION-2026-08-03-CHAT-PERFORMANCE-OPTIMIZATIONS.md`

**Contexto:** Usuario reportou lentidao recorrente nas respostas do chat. Inspecionada a critical path (mensagem normal entre `persistMessage` do usuario e a chamada do LLM) — identificados pontos de latencia pre-LLM. O LLM principal (`google/gemini-2.5-flash`, ~2-4s) e o custo dominante e **nao foi tocado**; todas as otimizacoes visam reduzir o overhead pre-LLM sem alterar a qualidade da resposta.

**5 otimizacoes aplicadas (todas na critical path, build verde):**

1. **`buildConversationContext` fire-and-forget** (`ConversationPipeline.ts`) — antes `await`-ado, so alimentava RCL/observabilidade; `memoryService.retrieve` ja fornece memoria ao LLM. Remove ~200-400ms de leitura de memoria da critical path.

2. **`stateViewEngine.buildForSession` paralelizado com `orchestrateCapabilities`** (`memoryReasoningPlanner.js`) — rodavam em serie (ETAPA 2 e 3); agora `Promise.all`. Reduz pela duracao da menor (~150-300ms).

3. **Gatilho do classificador de Drive restrito a substantivos fortes** (`memoryReasoningPlanner.js`, `_driveHeuristicCheck`) — antes disparava LLM auxiliar (~1-2s) pra verbos genericos ("abrir", "ler", "conteudo"); agora so com substantivos de arquivo (drive/pasta/arquivo/pdf/docx/planilha/baixar/download/upload). Corta ~1-2s na maioria das mensagens comuns.

4. **`unifiedContextBuilder.build` (+ KFE + Knowledge Graph) fire-and-forget** (`ConversationPipeline.ts`) — refazia as mesmas 5 queries de memoria so pra enriquecer prompt (kfmContext) e persistir grafo; para chat normal (0 entidades) nao muda nada. `memoryService.retrieve` ja fornece memoria. Remove ~300ms de DB redundante de TODAS as mensagens.

5. **Timeout do `semanticWebSearchCheck` capado de 8s pra 2s** (`capabilityDetector.js`) — chamada de LLM (`InvokeLLM`) que so decide "precisa busca web?" podia segurar a resposta por 8s; agora cap em 2s. Se nao responder a tempo, fallback gracioso (sem web search, LLM responde com o que tem).

**Resultado:** ~500-900ms removidos da critical path pre-LLM. LLM continua sendo o custo dominante restante.

**Trade-offs documentados:** perda do enriquecimento kfmContext (suplementar — memoriaService.retrieve supre) para sessoes com entidades; mensagens com sinal externo podem perder web search se classificacao semantica >2s (fallback gracioso). Nenhum desses afeta conversas normais.

**Nao alterado (explicitamente):** modelo do LLM, tamanho do prompt, `memoryService.retrieve`, `classifyIntent` (regex puro, ja rapido).

  ---

### 2026-08-03 — Microsoft Graph Connector Expansion: Planejamento (RFC-006 + ADR-013)

**Doc oficial:** `src/docs/foundation/rfc/RFC-006-Microsoft-Graph-Provider-Expansion.md` + `src/docs/foundation/adr/ADR-013.md`

**Status:** APENAS PLANEJAMENTO. Nenhum codigo implementado nesta sessao.

**Contexto:** Usuario pediu expansao do conector Microsoft Graph para cobrir 11 servicos do Microsoft 365 (Outlook, Calendar, OneDrive ja existem; adicionar Contacts, To Do, OneNote, Teams, SharePoint, Excel/Word/PowerPoint Online). Discutiu-se se seria "provider" ou "conector" e qual a melhor forma de construir.

**Decisao arquitetural (Caminho 2 — Capability Executors):**
- O `MicrosoftGraphConnector` atual tem 8 capacidades num unico `switch` monolitico em `execute()`.
- Adotar o padrao de **Capability Executors** (shell fino + 1 executor por servico em arquivo isolado), alinhando com o padrao JA vivo dos conectores Google (`GmailCapabilityExecutor`, `GoogleDriveCapabilityExecutor`, `GoogleCalendarCapabilityExecutor`).
- **Nao** replicar a arquitetura 5-camadas do WhatsApp — o Microsoft Graph e provedor unico oficial, nao ha concorrentes a abstrair (indirecao sem beneficio).

**Por que "conector" e nao "provider" (no sentido WhatsApp):**
- WhatsApp precisou de camada de Provider porque existiam 3 provedores concorrentes (Meta oficial, Evolution, Baileys). A camada abstrai QUAL backend usar.
- Microsoft Graph e a unica API oficial — nao ha o que abstrair. E somente um Connector (expoe capacidades ao Planner).
- O Microsoft pode se tornar um **Watch provider** (no sentido do Watch Engine) se houver demanda de monitoramento proativo de email/Teams — mas isso e opcional e fase futura.

**Caveat critico — Excel/Word/PowerPoint "Online":** o Graph da acesso a arquivo + leitura/criacao de conteudo programatico (getRange, updateRange, getText, listSlides), mas NAO e edicao colaborativa estilo Office Online. Esse limite e da propria API Microsoft, nao da arquitetura.

**Escopos OAuth a adicionar (7 novos):** `Contacts.ReadWrite`, `Tasks.ReadWrite`, `Notes.ReadWrite`, `Chat.Read`, `ChatMessage.Send`, `Sites.ReadWrite.All`, `Files.ReadWrite`. Observacao: Teams/SharePoint exigem tenant corporativo — contas pessoais (@outlook.com) podem nao ter acesso.

**Fases de implementacao (aditivas e reversiveis):**
- Fase 0 — Extracao: mover 8 cases existentes para 3 executors + helper, sem mudar comportamento.
- Fase 1 — Registry: criar `MicrosoftCapabilityRegistry`, shell delega via mapa.
- Fase 2 — Contacts + To Do.
- Fase 3 — OneNote + Teams + SharePoint.
- Fase 4 — Excel/Word/PowerPoint Online.
- Fase 5 (opcional) — MicrosoftWatchProvider para monitoramento proativo.

**Camadas existentes (nenhuma acao necessaria):** Event Layer (UCRBridge) e Observation Layer (PipelineObservationBridge) ja cobrem qualquer conector automaticamente. Capability Layer so precisa de novos mappings no GoalCapabilityRegistry.

**Proximo passo:** aguardar autorizacao para iniciar Fase 0 (extracao puramente mecanica, zero comportamento novo).

  ---

### 2026-08-03 — Microsoft Graph Connector Fase 0 (MS-EXP-01): Extracao Concluida

**RFC/ADR:** `RFC-006` + `ADR-013`

**Status:** Fase 0 EXECUTADA. Extracao puramente mecanica — ZERO comportamento novo. As mesmas 8 capacidades (`mail.list`, `mail.search`, `mail.read`, `mail.send`, `calendar.list`, `calendar.create`, `files.list`, `files.download`) continuam funcionando, agora delegadas a executors isolados em vez de um switch monolitico.

**Arquivos novos (6) em `src/lib/connector-runtime/connectors/microsoft/`:**
- `MicrosoftGraphHelper.ts` — `graphFetch`, `ok`, `fail`, `GRAPH_BASE`, `MS_CONNECTOR_ID` extraidos do conector original. Compartilhado por todos os executors.
- `MicrosoftCapabilityTypes.ts` — interface `MicrosoftCapability` (id, operations, execute) + `MicrosoftCapabilityContext`.
- `MicrosoftCapabilityRegistry.ts` — mapa `operation -> executor` + `listAllOperations()` (alimenta `metadata.capabilities`).
- `OutlookMailCapability.ts` — 4 cases de mail extraidos.
- `OutlookCalendarCapability.ts` — 2 cases de calendar extraidos.
- `OneDriveCapability.ts` — 2 cases de files extraidos.

**Arquivo reescrito (1):**
- `MicrosoftGraphConnector.ts` — agora SHELL FINO. Mantem apenas `metadata`, `health`, `validate`, `initialize`, `shutdown` e `execute` (token + roteamento via `resolveCapability`). Logica de servico removida. `metadata.version` mantido `1.0.0` (zero comportamento novo). `metadata.capabilities` agora vem de `listAllOperations()` (mesmas 8 operations, mesma ordem de registro).

**Verificacao de nao-quebra feita:**
- Os helpers `ok`/`fail`/`graphFetch`/`GRAPH_BASE`/`CAPABILITIES` do conector original eram **privados de modulo** (sem `export`) — nenhum importador externo quebrado.
- `ConnectorBootstrap.ts` registra o conector pela classe `MicrosoftGraphConnector` — import inalterado, classe mantida, mesmo `id`.
- `UCRBridge` (Event Layer) e `PipelineObservationBridge` (Observation Layer) envolvem qualquer conector automaticamente — nenhuma acao necessaria.
- Ordem de operacoes em `metadata.capabilities` preservada (mail.* -> calendar.* -> files.*), mesma sequencia do `CAPABILITIES` original.

**Cuidados tomados (criterios do usuario):**
- Nenhum codigo morto/legado/paralelo criado — os executors sao o unico caminho vivo; o switch antigo foi removido (nao deixado como legado).
- Nenhum `require()`/`module.exports` — ESM puro com `import`/`export`.
- Imports via caminho relativo `../../ConnectorTypes` (contado corretamente: `connectors/microsoft/` -> `connector-runtime/` = 2 niveis).
- Cada executor e testavel isoladamente (recebe `accessToken` + `ctx`, sem estado global).

**Proximo passo:** Fase 2 (MS-EXP-02) — Contacts + To Do. Aguarda autorizacao.

  ---

### 2026-08-03 — Microsoft Graph Connector Fase 2 (MS-EXP-02): Contacts + To Do

**RFC/ADR:** `RFC-006` + `ADR-013`

**Status:** Fase 2 EXECUTADA. Adicionados 2 servicos do Microsoft 365 (Contacts + To Do) seguindo o padrao Capability Executors estabelecido na Fase 0. O shell `MicrosoftGraphConnector` NAO foi tocado — so o Registry cresceu.

**Arquivos novos (2) em `src/lib/connector-runtime/connectors/microsoft/`:**
- `ContactsCapability.ts` — 3 capacidades: `contacts.list`, `contacts.search`, `contacts.create` (Graph `/me/contacts`). Escopo: `Contacts.ReadWrite`.
- `ToDoCapability.ts` — 4 capacidades: `todo.listLists`, `todo.listTasks`, `todo.createTask`, `todo.completeTask` (Graph `/me/todo/lists`). Escopo: `Tasks.ReadWrite`.

**Arquivos editados (3):**
- `MicrosoftCapabilityRegistry.ts` — adicionados `ContactsCapability` + `ToDoCapability` ao array `CAPABILITIES`. Nenhuma logica nova, so registro.
- `GoalCapabilityRegistry.ts` — adicionados 7 mappings (`ms.contacts.list/search/create`, `ms.todo.listLists/listTasks/createTask/completeTask`) com `connector: "microsoft-graph"`. Inseridos ANTES do bloco WhatsApp, mesma convencao dos mappings Google.
- `MicrosoftAuthSession.js` — adicionados `Contacts.ReadWrite` e `Tasks.ReadWrite` ao `WORKSPACE_SCOPES`. Escopos anteriores preservados (Mail/Calendar/Files).

**Nao-quebra verificada:**
- O shell nao muda — `resolveCapability(operation)` agora cobre 7 operations a mais automaticamente.
- `metadata.capabilities` (via `listAllOperations()`) agora retorna 15 operations (8 originais + 7 novas) sem mudanca de versao do conector (ainda 1.0.0 — adicao de capability e extensao, nao mudanca de comportamento existente).
- Event Layer (UCRBridge) e Observation Layer envolvem automaticamente — nenhuma acao necessaria.
- Escopos OAuth: novo consent exigira re-autorizacao do usuario em `/connections` (escopos adicionados, nao substituidos).

**Dependencia externa:** usuario precisa re-conectar Microsoft 365 em `/connections` para conceder os 2 novos escopos (Contacts.ReadWrite + Tasks.ReadWrite). Sem isso, Graph retorna 403 ao chamar `/me/contacts` ou `/me/todo/*`.

**Proximo passo:** Fase 3 (MS-EXP-03) — OneNote + Teams + SharePoint. Aguarda autorizacao (atencao: Teams/SharePoint exigem tenant corporativo — contas pessoais @outlook.com podem nao ter acesso).

  ---

### 2026-08-03 — Microsoft Graph Connector Fase 3 (MS-EXP-03): OneNote + Teams + SharePoint

**RFC/ADR:** `RFC-006` + `ADR-013`

**Status:** Fase 3 EXECUTADA. Adicionados 3 servicos do Microsoft 365 seguindo o padrao Capability Executors. O shell `MicrosoftGraphConnector` NAO foi tocado — so o Registry cresceu.

**Arquivos novos (3) em `src/lib/connector-runtime/connectors/microsoft/`:**
- `OneNoteCapability.ts` — 3 capacidades: `onenote.listNotebooks`, `onenote.listPages`, `onenote.createPage` (Graph `/me/onenote/*`). Escopo: `Notes.ReadWrite`. CreatePage envia HTML (`application/xhtml+xml`).
- `TeamsCapability.ts` — 3 capacidades: `teams.listChats`, `teams.listMessages`, `teams.sendMessage` (Graph `/me/chats` + `/chats/{id}/messages`). Escopos: `Chat.Read` + `ChatMessage.Send`.
- `SharePointCapability.ts` — 4 capacidades: `sharepoint.listSites`, `sharepoint.listLists`, `sharepoint.listItems`, `sharepoint.createItem` (Graph `/sites/*`). Escopo: `Sites.ReadWrite.All`.

**Arquivos editados (3):**
- `MicrosoftCapabilityRegistry.ts` — adicionados os 3 executores ao array `CAPABILITIES`.
- `GoalCapabilityRegistry.ts` — adicionados 10 mappings (`ms.onenote.*`, `ms.teams.*`, `ms.sharepoint.*`) com `connector: "microsoft-graph"`. Inseridos ANTES do bloco WhatsApp, mesma convencao.
- `MicrosoftAuthSession.js` — adicionados 4 escopos ao `WORKSPACE_SCOPES`: `Notes.ReadWrite`, `Chat.Read`, `ChatMessage.Send`, `Sites.ReadWrite.All`. Escopos anteriores preservados.

**CAVEAT critico (documentado no proprio codigo dos executores):** Teams e SharePoint exigem tenant corporativo. Contas pessoais @outlook.com podem receber 403/404 do Graph ao chamar `/me/chats` ou `/sites?search=*` — nao e bug, e limite da conta Microsoft. OneNote funciona em contas pessoais.

**Nao-quebra verificada:**
- O shell nao muda — `resolveCapability(operation)` agora cobre 10 operations a mais automaticamente.
- `metadata.capabilities` agora retorna 25 operations (15 da Fase 2 + 10 novas) sem mudanca de versao do conector.
- Event Layer (UCRBridge) e Observation Layer envolvem automaticamente.
- Escopos OAuth: novo consent exigira re-autorizacao em `/connections`.

**Dependencia externa:** usuario precisa re-conectar Microsoft 365 em `/connections` para conceder os 4 novos escopos. Teams/SharePoint so funcionam se a conta for corporativa (work/school).

**Proximo passo:** Fase 4 (MS-EXP-04) — Excel + Word + PowerPoint Online. Aguarda autorizacao.

  ---

### 2026-08-03 — Microsoft Graph Connector Fase 4 (MS-EXP-04): Excel + Word + PowerPoint Online

**RFC/ADR:** `RFC-006` + `ADR-013`

**Status:** Fase 4 EXECUTADA — ultima fase obrigatoria do RFC-006. Adicionados 3 servicos "Office Online" seguindo o padrao Capability Executors. O shell `MicrosoftGraphConnector` NAO foi tocado — so o Registry cresceu.

**Arquivos novos (3) em `src/lib/connector-runtime/connectors/microsoft/`:**
- `ExcelCapability.ts` — 3 capacidades: `excel.listWorksheets`, `excel.getRange`, `excel.updateRange` (Graph Workbook API `/me/drive/items/{id}/workbook/*`). Workbook API e a UNICA via REST real do Graph para Office — le/escrive intervalos programaticamente (nao e edicao colaborativa estilo Excel Online). Escopo: `Files.ReadWrite` (para updateRange).
- `WordCapability.ts` — 2 capacidades: `word.listDocuments`, `word.getDocumentText`. Graph REST nao expoe texto de Word (so binario .docx); `getDocumentText` baixa o binario via URL pre-autenticada `@microsoft.graph.downloadUrl`, converte para base64 e REUTILIZA o backend `documentParser` (mammoth) para extrair texto — mesmo parser do pipeline de ingestao. Escopo: `Files.Read`.
- `PowerPointCapability.ts` — 2 capacidades: `pptx.listDocuments`, `pptx.getDocumentDownload`. CAVEAT: Graph REST nao expoe texto de slides (sem Workbook API equivalente) e o `documentParser` nao suporta .pptx hoje. `getDocumentDownload` retorna a URL pre-autenticada + nome para download manual; extracao de texto de slides fica como limitacao explicita documentada no header do arquivo. Escopo: `Files.Read`.

**Arquivos editados (3):**
- `MicrosoftCapabilityRegistry.ts` — adicionados `ExcelCapability`, `WordCapability`, `PowerPointCapability` ao array `CAPABILITIES`.
- `GoalCapabilityRegistry.ts` — adicionados 7 mappings (`ms.excel.*`, `ms.word.*`, `ms.pptx.*`) com `connector: "microsoft-graph"`. Inseridos ANTES do bloco WhatsApp.
- `MicrosoftAuthSession.js` — adicionado `Files.ReadWrite` ao `WORKSPACE_SCOPES` (necessario para `excel.updateRange` PATCH). `Files.Read.All` ja cobre Word/PowerPoint read.

**Honestidade tecnica (limites reais da API Microsoft, documentados no proprio codigo):**
- Excel: Workbook API REST real — leitura/escrita de intervalos funciona de verdade.
- Word: texto extraivel via documentParser (mammoth) apos baixar binario — funciona.
- PowerPoint: Graph REST NAO tem API de slides; documentParser nao suporta .pptx. So metadata + downloadUrl. Extracao de texto de slides e limitacao real, nao bug da arquitetura.
- Nenhum dos tres e edicao colaborativa estilo Office Online (limite da propria API Graph).

**Nao-quebra verificada:**
- O shell nao muda — `resolveCapability(operation)` agora cobre 7 operations a mais.
- `metadata.capabilities` agora retorna 32 operations (25 da Fase 3 + 7 novas) sem mudanca de versao do conector.
- Event Layer (UCRBridge) e Observation Layer envolvem automaticamente.
- WordCapability importa `base44` de `@/api/base44Client` (pre-inicializado) — mesmo padrao ja usado por KnowledgeIngestionPipeline e outros executors do frontend.

**Dependencia externa:** usuario precisa re-conectar Microsoft 365 em `/connections` para conceder `Files.ReadWrite` (escopo novo). Excel updateRange falha com 403 sem ele.

**Estado final do RFC-006 (fases obrigatorias):** CONCLUIDO. 11 servicos do Microsoft 365 cobertos (Mail, Calendar, OneDrive, Contacts, To Do, OneNote, Teams, SharePoint, Excel, Word, PowerPoint) por 11 Capability Executors isolados, 1 shell fino, 1 helper compartilhado, 1 registry. Fase 5 (MicrosoftWatchProvider, monitoramento proativo) fica como opcional futura.

  ---

### 2026-08-04 — Microsoft Graph Provider Router: Planejamento (RFC-007 + ADR-014)

**Doc oficial:** `src/docs/foundation/rfc/RFC-007-Microsoft-Graph-Provider-Router.md` + `src/docs/foundation/adr/ADR-014.md`

**Status:** APENAS PLANEJAMENTO. Nenhum codigo implementado nesta sessao. Apenas documentacao escrita.

**Contexto:** Ao configurar o redirect URI do Microsoft App Registration (ver secao anterior sobre `https://ever-mind-core.base44.app`), descobriu-se que existem DOIS fluxos OAuth viaveis e concorrentes para acessar o mesmo Microsoft Graph:

1. **Flow 1 — OAuth proprio** (ja existe): `microsoftOAuthInit`/`Exchange` + entidade `MicrosoftOAuthToken`, redirect URI na rota do app (`/oauth/microsoft/callback`), refresh no backend, multi-conta via `workspaceId`.
2. **Flow 2 — Base44 App-User Connector** (descoberto 2026-08-04): `register_workspace_connector` (integration_type `outlook`) + `base44.connectors.connectAppUser(connectorId)`, redirect URI gerenciada pelo Base44 (unica por app, ambientes Live + Preview + Custom domain, visivel em Workspace Settings > Integrations > Connectors > "View redirect URIs for your apps"), gestao de token delegada a plataforma (`getCurrentAppUserConnection`).

Sem um Provider Router, escolher entre os dois fluxos exigiria `if` espalhado pelo codigo — padrao rejeitado pelo projeto. O usuario pediu adicionalmente multi-conta simultanea (ja existente no Google Workspace) como requisito de primeira classe.

**DECISAO CRITICA — Emenda a ADR-013 (circunscrita, NAO revogacao):**

O ADR-013 (escrito 2026-08-03) rejeitou explicitamente a alternativa C (Provider Registry estilo WhatsApp) com a justificativa: "o Microsoft Graph e uma unica API oficial — nao ha provedores concorrentes a abstrair. Criar MicrosoftProviderRegistry com um unico GraphProvider seria indirecao sem beneficio."

Essa justificativa **continua correta para o Graph como API**, mas o **contexto evoluiu**: hoje existem dois fluxos OAuth viaveis para a mesma API. O ADR-014 **emenda** a rejeicao sem revogar o restante do ADR-013:

- **O que permanece valido em ADR-013:** o padrao Capability Executors (shell fino + 11 executors isolados), o `MicrosoftCapabilityRegistry`, o `MicrosoftGraphHelper`, os escopos OAuth incrementais. Os 11 executors e o registry de executors NAO SAO TOCADOS — viram internos do `OfficialGraphProvider`.
- **O que e emendado:** a rejeicao da camada de Provider. A indirecao agora traz valor (resolve o dilema OAuth sem `if`s espalhados + suporta multi-conta de primeira classe).
- **Escopo da emenda:** exclusivamente a introducao da camada de Provider Router.

**Diferenca sutil vs. WhatsApp (importante pra qualquer sessao futura):** No WhatsApp, o Provider abstrai QUAL backend chamar (APIs diferentes: Meta, Evolution, Baileys). No Microsoft, o Provider abstrai QUAL CREDENCIAL usar para chamar a MESMA API (Graph). Os providers nao sao APIs concorrentes; sao ESTRATEGIAS DE ACESSO a mesma API. Sutil, mas fundamental — e o por que a rejeicao original de ADR-013 nao estava "errada", apenas o contexto mudou.

**Arquitetura proposta:**

```
Planner > GoalCapabilityRegistry (ms.* -> "microsoft-graph", INALTERADO)
  > MicrosoftGraphConnector (shell fino, id INALTERADO)
    > MicrosoftProviderRegistry (NOVO, singleton HMR-safe, workspaceId-aware)
      > resolveProvider(operation, workspaceId) -> MicrosoftProvider
        - OfficialGraphProvider (re-home do shell atual, Flow 1)
        - Base44OutlookProvider (NOVO opcional, Flow 2)
        - McpMicrosoftProvider (stub, Softeria descartado)
        - RestSdkProvider (stub)
```

Para FORA do conector: nada muda. `id`, `execute`, `metadata`, `health`, `validate` continuam identicos. `UCRBridge` (Event Layer), `PipelineObservationBridge` (Observation Layer), `ConnectorBootstrap`, `GoalCapabilityRegistry` — todos intocados.

**Multi-conta (requisito de primeira classe):**

O `MicrosoftAuthSession.js` JA suporta multi-conta via `workspaceId` (`connect({ workspaceId })`, `_storeToken(workspaceId, ...)`, `getConnection(workspaceId)`). O que falta e SUBIR o `workspaceId` ao router, porque hoje o shell pega sempre `"default"`. Mudancas:

1. `MicrosoftProviderContext` ganha `workspaceId` — repassado pelo shell em `execute()`, igual Gmail/Drive ja fazem com `accountEmail`/`workspaceId`.
2. `OfficialGraphProvider` extrai token por `workspaceId` — `ensureValidToken(workspaceId)` + `getAccessToken(workspaceId)` ja existem; so parametrizar.
3. UI de multi-conta no `/connections` — switcher "Conta Microsoft 1 / 2 / 3" (espelha switcher do Google). Cada conta = 1 linha em `MicrosoftOAuthToken` + 1 entrada de `localStorage` (metadata so, sem token — token nunca sai do backend).
4. Watch Engine — `MicrosoftWatchProvider` ja recebe `action` + `params`; basta incluir `workspaceId` nos params ao criar um Watch.

**Interface do Provider (workspaceId-aware, espelha WhatsApp mas com workspaceId):**

```typescript
interface MicrosoftProviderContext { workspaceId: string; start: number; eid: string; logs: ConnectorLog[]; }
interface MicrosoftProvider {
  readonly id: string;
  readonly displayName: string;
  readonly isOfficial: boolean;
  readonly operations: readonly string[];
  isAvailable(workspaceId: string): Promise<boolean>;
  execute(operation, payload, ctx: MicrosoftProviderContext): Promise<ConnectorResult>;
}
```

**Localizacao dos arquivos (cuidado contra arvore paralela — dead end recorrente):**

```
src/lib/connector-runtime/connectors/
  MicrosoftGraphConnector.ts            # shell (edicao Fase 2)
  microsoft/                            # INALTERADO (vira interno do OfficialGraphProvider)
    MicrosoftGraphHelper.ts
    MicrosoftCapabilityTypes.ts
    MicrosoftCapabilityRegistry.ts
    *Capability.ts (11 executors)
    MicrosoftWatchProvider.ts
  microsoft-providers/                   # NOVO (irmao de microsoft/, DENTRO de connectors/)
    MicrosoftProviderTypes.ts             # NOVO
    MicrosoftProviderRegistry.ts         # NOVO (singleton HMR-safe)
    OfficialGraphProvider.ts             # NOVO (re-home da logica atual do shell)
    Base44OutlookProvider.ts              # NOVO (Fase 4, opcional)
    McpMicrosoftProvider.ts               # NOVO stub (Fase 3)
    RestSdkProvider.ts                    # NOVO stub (Fase 3)
```

`microsoft-providers/` fica DENTRO de `connectors/` (irmao de `microsoft/`), NAO em `src/lib/` raiz. Motivo: o router e interno ao conector Microsoft Graph, nao e camada global do runtime. Evita criar arvore paralela (dead end recorrente: `src/sdk/` vs `src/lib/` vs `src/runtime/`).

**Softeria MCP — PERMANECE DESCARTADO:**

O Softeria MS-365 MCP Server ja esta na lista de becos-sem-saida (incompativel com sandbox Deno, exige stdio/WAM local, risco de provisioning tenant-wide de Dataverse). O slot `McpMicrosoftProvider` e STUB interface-conforme (`isAvailable()=false` sempre), NAO implementacao ativa. O slot fica reservado para um MCP compativel no futuro, sem reescrever nada quando ele surgir. NAO reanimar o Softeria.

**Fases de implementacao (aditivas, reversiveis, nada quebra):**

- **Fase 0 — Documentacao (esta secao + RFC-007 + ADR-014):** so documento, zero codigo. CONCLUIDO nesta sessao.
- **Fase 1 — Tipos + Registry:** `MicrosoftProviderTypes.ts` + `MicrosoftProviderRegistry.ts` (singleton HMR-safe), 0 providers ativos. Build verde, nada muda em producao.
- **Fase 2 — OfficialGraphProvider (refator, comportamento identico):** extrai logica atual do `MicrosoftGraphConnector.execute()` (token + `resolveCapability` + delegacao) para dentro de `OfficialGraphProvider`. Shell vira fino: delega ao `microsoftProviderRegistry.resolveProvider(op, workspaceId)`. Mesmo `id`, mesma assinatura `execute`, mesmo `metadata` → `UCRBridge`/`GoalCapabilityRegistry`/`ConnectorBootstrap` intocados. Build verde = paridade confirmada. Os 11 executors e o `MicrosoftCapabilityRegistry` NAO SAO TOCADOS — viram internos do OfficialGraphProvider.
- **Fase 3 — Stubs MCP + REST/SDK (aditivo, isAvailable=false):** `McpMicrosoftProvider` + `RestSdkProvider` interface-conformes, registrados mas nunca ativos. Arquitetura pronta, zero impacto em runtime.
- **Fase 4 — Base44OutlookProvider (opcional, valor real):** segundo provider de verdade. Usa `base44.asServiceRole.connectors.getCurrentAppUserConnection(connectorId)` para pegar token e chama Graph com ele. Exige `register_workspace_connector` (integration_type `outlook`) + UI de connect via `connectAppUser`. E aqui que o dilema OAuth se resolve de verdade.
- **Fase 5 (opcional) — Watch:** `MicrosoftWatchProvider` ja e stub. O router poderia alimenta-lo no futuro, mas fica fora deste escopo. MS-EXP-05 desvinculado do MS-PR.

**Por que NAO quebra (verificacao):**

- Conector continua registrado como `"microsoft-graph"` no `ConnectorBootstrap` — router e interno, invisivel pro resto do runtime.
- `GoalCapabilityRegistry` continua mapeando `ms.*` → `connector: "microsoft-graph"` — zero mudanca.
- `UCRBridge` (Event Layer) e `PipelineObservationBridge` (Observation Layer) envolvem o conector automaticamente — nada a instrumentar.
- Side-effect import do `MicrosoftWatchProvider` no shell e preservado.
- Fases 1-3 nao adicionam comportamento; so Fase 4 traz capacidade nova, e OPCIONAL.

**Escalabilidade (milhares de usuarios):**

- Sem estado no router — mapa em memoria + lookup por operation/workspaceId. O(1).
- Token por usuario/conta, nunca por app — cada provider pega token do `workspaceId` corrente. Mil usuarios = mil tokens isolados.
- Provider e stateless — instancia unica compartilhada (singleton), nao guarda nada entre chamadas. Escala horizontal sem nada.
- Custo marginal de novo usuario e zero no router; so cresce o backend de tokens (que ja escala sozinho no Base44).
- `isAvailable(workspaceId)` e chamada so na resolucao, nao em todo request — e barata.

**Atualizabilidade (futuro):**

Tudo e slot. Novo provider = 1 arquivo + 1 linha no registry. Nova capability = adicionar a `operations` do provider. Trocar provider padrao = `registry.setPreferred(op, "base44-outlook")`. Deprecar provider = `isAvailable()=false`. A/B ou rollback = registrar dois providers para mesma operation. Softeria descartado vira stub interface-conforme, nao codigo morto.

**Documentacao escrita nesta sessao (Fase 0):**

1. `src/docs/foundation/rfc/RFC-007-Microsoft-Graph-Provider-Router.md` — NOVO (RFC completo, espelha estrutura do RFC-006).
2. `src/docs/foundation/adr/ADR-014.md` — NOVO (ADR completa, espelha estrutura do ADR-013, declara emenda circunscrita).
3. `src/docs/foundation/adr/ADR-MASTER-INDEX.md` — EDITADO (entrada ADR-014 adicionada, footer atualizado com data 2026-08-04).
4. `src/docs/foundation/journey/SPRINTS.md` — EDITADO (secao "Microsoft Graph Provider Router (MS-PR-01 a MS-PR-04)" adicionada).
5. `src/docs/foundation/MEB-MemoryOS-Engineering-Backlog.md` — EDITADO (EPIC-018 "Microsoft Graph Provider Router" adicionado a tabela de Epics, RFC-007/ADR-014, sprint MS-PR-01 a MS-PR-04).
6. `CLAUDE.md` — EDITADO (esta secao).

**NAO foi feito (explicitamente fora do escopo desta sessao):**

- Nenhum codigo TypeScript/JavaScript alterado ou criado (Fase 0 e so documentacao).
- Nenhum `register_workspace_connector` chamado (isso seria Fase 4, apos autorizacao).
- Nenhuma UI de `/connections` tocada (multi-conta switcher seria Fase 2/4).
- Nenhum teste de paridade executado (seria Fase 2 apos o refator).
- Nenhuma mudanca no `MicrosoftGraphConnector.ts` atual (Fase 2).

**Proximo passo:** aguardar autorizacao para iniciar **Fase 1 (Tipos + Registry)** — arquivo novo `microsoft-providers/MicrosoftProviderTypes.ts` + `MicrosoftProviderRegistry.ts`, 0 providers ativos, build verde, zero impacto em runtime.

---

### 2026-08-04 — Microsoft Graph Provider Router: Fases 1-3 Implementadas (MS-PR-01 a MS-PR-03)

**Doc oficial:** `src/docs/foundation/rfc/RFC-007-Microsoft-Graph-Provider-Router.md` + `src/docs/foundation/adr/ADR-014.md`

**Status:** Fases 1-3 EXECUTADAS. A Fase 4 (Base44OutlookProvider, opcional) permanece pendente de autorizacao. Nenhum codigo morto/legado/paralelo criado.

**Arquivos novos (5) em `src/lib/connector-runtime/connectors/microsoft-providers/` (NOVO diretorio, irmao de `microsoft/`, DENTRO de `connectors/`):**

- `MicrosoftProviderTypes.ts` — interfaces `MicrosoftProvider` (id, displayName, isOfficial, operations, isAvailable, execute), `MicrosoftProviderContext` (workspaceId, start, eid, logs), `MicrosoftAccountInfo`. workspaceId-aware. Espelha `WhatsAppProvider` mas com `workspaceId` em toda chamada que toca credencial.
- `MicrosoftProviderRegistry.ts` — singleton HMR-safe via `globalThis.__MICROSOFT_PROVIDER_REGISTRY__` (mesmo padrao do `WhatsAppProviderRegistry`). Registra OfficialGraph + Mcp + RestSdk no load. `resolveProvider(operation, workspaceId)` async com politica de 4 passos: (1) preferido declarado, (2) primeiro disponivel que cobre a op, (3) fallback: primeiro que cobre a op mesmo indisponivel (preserva paridade — provider emite "nao conectado" em vez de router devolver "Unknown operation"), (4) null → "Unknown operation". `setPreferred`, `list`, `listAccounts` (stub para UI futura).
- `OfficialGraphProvider.ts` — re-home EXATO da logica que vivia em `MicrosoftGraphConnector.execute()` (ADR-013): `ensureValidToken(workspaceId)` + `getAccessToken(workspaceId)` + `resolveCapability(operation)` + delegacao ao executor. Mensagens de erro identicas ("Microsoft 365 nao conectado. Conecte em /connections." e "Unknown operation"). `operations` = `listAllOperations()` via getter (reflete mudancas no registry sem reinstanciar). `isAvailable` = `isConnected(workspaceId)`. Export auxiliar `listOfficialAccounts()` para UI de switcher.
- `McpMicrosoftProvider.ts` — STUB interface-conforme. `operations: []`, `isAvailable()=false` sempre. Nunca cobre nenhuma operation, nunca e selecionado pelo router. Slot reservado para MCP compativel (Softeria PERMANECE DESCARTADO).
- `RestSdkProvider.ts` — STUB interface-conforme. `operations: []`, `isAvailable()=false` sempre. Slot reservado para Graph JS SDK / REST alternativo.

**Arquivo editado (1):**

- `MicrosoftGraphConnector.ts` (shell):
  - Imports: removidos `ensureValidToken`, `getAccessToken`, `resolveCapability` (movidos para OfficialGraphProvider). Adicionado `microsoftProviderRegistry` de `./microsoft-providers/MicrosoftProviderRegistry`. Mantidos `isConnected`/`getConnection` (health), `fail` (Unknown operation + catch), `listAllOperations` (metadata), side-effect import do `MicrosoftWatchProvider`.
  - `execute()`: agora extrai `workspaceId` de `context.identityContext?.microsoftWorkspaceId` (default `"default"` — preserva comportamento anterior) e delega ao `microsoftProviderRegistry.resolveProvider(operation, workspaceId)`. Top-level try/catch e mensagem "Unknown operation" preservados.
  - Cabecalho atualizado: menciona ADR-014/RFC-007 e descreve a nova camada (operation -> provider -> executor).
  - `metadata.capabilities` continua `listAllOperations()` (mesmas 32 operations). `id` continua `"microsoft-graph"`. `health()` intocado.

**Paridade verificada (comportamento identico ao shell antigo):**

- Operacao conhecida + conectado: router passo 2 retorna OfficialGraph (disponivel) → mesmo fluxo de token + executor → mesmo resultado.
- Operacao conhecida + NAO conectado: router passo 2 pula OfficialGraph (isAvailable=false), passo 3 retorna OfficialGraph mesmo assim → `ensureValidToken` lanca → mesma mensagem "Microsoft 365 nao conectado. Conecte em /connections." (NAO vira "Unknown operation").
- Operacao desconhecida: nenhum provider cobre → router passo 4 null → mesma mensagem `Unknown operation: "..."`.
- Erro inesperado no executor: top-level catch do shell preservado → mesma mensagem `(e as Error).message`.

**Nao-quebra verificada:**

- `ConnectorBootstrap.ts` registra o conector pela classe `MicrosoftGraphConnector` — import inalterado, mesmo `id`.
- `GoalCapabilityRegistry` continua mapeando `ms.*` → `connector: "microsoft-graph"` — zero mudanca.
- `UCRBridge` (Event Layer) e `PipelineObservationBridge` (Observation Layer) envolvem o conector automaticamente — nada a instrumentar.
- Side-effect import do `MicrosoftWatchProvider` no shell preservado.
- Os 11 Capability Executors e o `MicrosoftCapabilityRegistry` (ADR-013) NAO foram tocados — viram internos do OfficialGraphProvider.
- `microsoft-providers/` fica DENTRO de `connectors/` (irmao de `microsoft/`), nao em `src/lib/` raiz — evita arvore paralela (dead end recorrente).

**Cuidados tomados:**

- Nenhum codigo morto/legado/paralelo criado. Os stubs sao interface-conformes (`operations: []` + `isAvailable()=false`) — slots reservados, nunca codigo morto (remocao segura se o slot for reusado por outro MCP/SDK).
- Nenhum `require()`/`module.exports` — ESM puro com `import`/`export`.
- Imports via `@/` alias (MicrosoftAuthSession) e caminho relativo `../../ConnectorTypes` e `../microsoft/*` (contado corretamente: `microsoft-providers/` -> `connectors/` -> `connector-runtime/`).
- `operations` como getter no OfficialGraphProvider (reflece `listAllOperations()` ao vivo, nao snapshot no load).
- `listAccounts()` no registry e stub honesto (retorna contas do OfficialGraph via MicrosoftAuthSession.listConnections) — interface-conforme, sem consumidor ativo hoje (UI de switcher e Fase 2/4).

**Estado final apos Fases 1-3:** Provider Router vivo e workspaceId-aware. O shell delega ao registry; OfficialGraph cobre as 32 operations com paridade total; MCP e REST/SDK sao stubs registrados mas inativos. Tudo pronto para a Fase 4 (Base44OutlookProvider) adicionar o segundo provider de verdade sem tocar o shell.

**NAO foi feito (explicitamente fora do escopo desta sessao):**

- Fase 4 (Base44OutlookProvider) — opcional, exige `register_workspace_connector` (integration_type `outlook`) + UI de connect via `connectAppUser`. Aguarda autorizacao.
- UI de switcher multi-conta no `/connections` (espelhar Google) — Fase 2/4, aguarda autorizacao.
- Nenhum teste de paridade automatizado executado (nao ha runner configurado no projeto — ver secao 2026-08-03 "Inspecao de Codigo Morto"). Paridade verificada por inspecao manual da logica do shell antigo vs OfficialGraphProvider.

**Proximo passo:** aguardar autorizacao para iniciar **Fase 4 (Base44OutlookProvider, opcional)** — segundo provider de verdade via App-User Connector; e onde o dilema OAuth (Flow 1 vs Flow 2) se resolve de fato. Alternativamente, UI de switcher multi-conta no `/connections` para validar o `workspaceId` fluindo ponta a ponta.

---

## Sessao 2026-08-04 -- Microsoft 365 OAuth: 4 causas raiz encontradas e corrigidas (App User Connector customizado)

**Contexto:** Usuario configurou Microsoft 365 pela primeira vez, seguindo o conector nativo customizado
(nao o App User Connector oficial do Base44 -- ver ADR anterior sobre a diferenca). Erro persistente por
varias horas de troubleshooting ate isolar 4 causas raiz distintas, uma escondendo a proxima.

**Causa 1 -- Client ID mal copiado:** dois caracteres transpostos (`046f` em vez de `04f6` no final do GUID).
Sintoma: AADSTS700016 "Application not found in directory" com o MESMO valor aparecendo como app ID e tenant ID
(coincidencia -- na verdade eram dois valores DIFERENTES, o do erro nao correspondia a nenhum app real).
Fix: recopiar usando o botao de copiar do Azure, nunca selecao manual de texto.

**Causa 2 -- MICROSOFT_TENANT_ID configurado incorretamente:** o app tem
`signInAudience: "AzureADandPersonalMicrosoftAccount"` (multi-tenant + contas pessoais) -- esse tipo de app
DEVE usar o endpoint `/common/`, nunca um tenant especifico. Configurar MICROSOFT_TENANT_ID pra esse tipo de
app causa o MESMO erro AADSTS700016. Fix: manter MICROSOFT_TENANT_ID ausente (nao configurado) pra esse app.
**Isso e o oposto do que a documentacao interna do codigo sugeria** ("Se MICROSOFT_TENANT_ID estiver definido,
evita AADSTS700016") -- aquele comentario assume um app single-tenant, nao e universal. Adicionado aviso no
codigo sobre isso (ver microsoftOAuthInit/entry.ts).

**Causa 3 -- Redirect URI do preview nao cadastrada:** erro AADSTS50011 especificamente no ambiente de
PREVIEW do Base44 (`https://preview--ever-mind-core.base44.app/oauth/microsoft/callback`), nao afeta o app
publicado. Nao corrigido (usuario so usa o app publicado) -- se precisar testar em preview no futuro, cadastrar
essa URI adicional no Azure.

**Causa 4 -- Client Secret: Value vs Secret ID:** a tela "Certificados e segredos" do Azure mostra DUAS
colunas parecidas ao criar um secret -- "Value" (o segredo de verdade) e "Secret ID" (so um identificador do
registro). Copiar a coluna errada causa AADSTS7000215 ("Invalid client secret provided... not the client
secret ID"), SO detectavel na etapa de troca de codigo por token (microsoftOAuthExchange), nao na etapa de
autorizacao inicial -- por isso o erro so aparecia depois do usuario completar o login inteiro.

**Metodologia que funcionou -- reutilizar em problemas de OAuth futuros:**
1. Erros de autenticacao raramente tem mensagem completa na tela do navegador -- sempre pegar o JSON de
   `Response` (nao `Headers`) da requisicao que falhou, via aba Network do DevTools, com "Preserve log"
   marcado (senao a lista some no redirect do OAuth).
2. Testar com `code: 'teste'` (valor falso) SO serve pra confirmar que a function responde -- a Microsoft
   rejeita qualquer codigo malformado antes de checar credenciais, entao esse teste NAO isola bugs de
   client_secret/tenant. So um fluxo real (login completo) revela esses erros.
3. GUIDs parecidos (Client ID vs Tenant ID vs Secret Value vs Secret ID) sao a fonte de erro mais comum --
   sempre usar o botao de copiar da interface do Azure, nunca seleção manual de texto.

**Resultado final confirmado:** Microsoft 365 conectado (memoryos1@outlook.com), 12 escopos, Outlook Mail +
Calendar + OneDrive + Contacts + To Do disponiveis.

---

### 2026-08-04 — Microsoft 365 OAuth: Tenant-Specific Authority end-to-end (login confirmado pelo usuario)

**Contexto:** Continuacao da sessao anterior (4 causas raiz). O `microsoftOAuthInit` ja usava `MICROSOFT_TENANT_ID` (com fallback `common`), mas `microsoftOAuthExchange` e `microsoftOAuthRefresh` ainda batiam hardcoded em `https://login.microsoftonline.com/common/oauth2/v2.0/token`. Isso podia causar mismatch de authority entre autorizacao (tenant-specific) e troca de codigo (sempre common) — a Microsoft rejeita troca de codigo se o authority da requisicao de token nao bater com o da autorizacao.

**Mudanca feita (3 backend functions,一致性 end-to-end):**

1. **`base44/functions/microsoftOAuthInit/entry.ts`** (ja estava pronto da sessao anterior):
   - `const tenant = Deno.env.get('MICROSOFT_TENANT_ID') || 'common';`
   - `authUrl = https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?...`

2. **`base44/functions/microsoftOAuthExchange/entry.ts`** (EDITADO nesta sessao):
   - Antes: `fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', ...)`
   - Depois: `const tenant = Deno.env.get('MICROSOFT_TENANT_ID') || 'common'; fetch(\`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token\`, ...)`
   - Garante que a troca do code por tokens use o MESMO authority da URL de autorizacao gerada pelo Init.

3. **`base44/functions/microsoftOAuthRefresh/entry.ts`** (EDITADO nesta sessao):
   - Antes: `fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', ...)`
   - Depois: `const tenant = Deno.env.get('MICROSOFT_TENANT_ID') || 'common'; fetch(\`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token\`, ...)`
   - Garante que a renovacao do access_token tambem use o mesmo authority. Microsoft as vezes rejeita refresh se o authority divergir do usado na emissao original.

**Estado final dos secrets (confirmado pelo painel):**

`MICROSOFT_TENANT_ID` esta **AUSENTE** (nao configurado). Razao (documentada na sessao anterior, Causa 2): o App Registration tem `signInAudience: "AzureADandPersonalMicrosoftAccount"` (multi-tenant + contas pessoais). Esse tipo de app **DEVE** usar o endpoint `/common/` — nunca um tenant especifico. Configurar `MICROSOFT_TENANT_ID` pra esse app causa o MESMO erro `AADSTS700016`. O fallback `|| 'common'` no codigo garante que, com o secret ausente, as 3 functions batem todas em `common` — consistente ponta a ponta.

**Resultado final confirmado pelo usuario (2026-08-04 ~14:28 BRT):** "chat consegui fazer login na conta microsoft." Login Microsoft 365 funcionando.

**Licao arquitetural (reutilizar):**

- Authority de OAuth **DEVE ser consistente em TODAS as etapas** que falam com o endpoint da Microsoft: autorizacao (Init), troca de code (Exchange) e renovacao (Refresh). Se uma das tres divergir, a Microsoft pode rejeitar com erros obscuros (`AADSTS700016`, `AADSTS50011`, `invalid_grant`).
- O padrao `Deno.env.get('MICROSOFT_TENANT_ID') || 'common'` e a forma correta de suportar os dois casos (single-tenant com tenant-specific vs multi-tenant com common) sem precisar mudar codigo — so mudar a presenca/ausencia do secret.
- Para apps multi-tenant (`AzureADandPersonalMicrosoftAccount`): manter `MICROSOFT_TENANT_ID` **ausente**.
- Para apps single-tenant (`AzureADMyOrg`): configurar `MICROSOFT_TENANT_ID` com o Tenant ID do diretorio.
- **NAO assumir** que um tenant-specific authority resolve sempre — depende do `signInAudience` do App Registration. O comentario original no codigo ("Se MICROSOFT_TENANT_ID estiver definido, evita AADSTS700016") so e verdade pra single-tenant; e falso (e piora) pra multi-tenant.

**Mapa completo do fluxo OAuth Microsoft (apos todas as sessoes):**

```
Frontend (MicrosoftAuthSession.js)
  ├─ connect() → invokeFn('microsoftOAuthInit', { scopes, redirectUri })
  │    └─ Backend microsoftOAuthInit → authUrl (tenant = MICROSOFT_TENANT_ID || 'common')
  ├─ Popup Microsoft login → redirect /oauth/microsoft/callback
  ├─ Callback page → postMessage { code, state }
  ├─ handleMessage → invokeFn('microsoftOAuthExchange', { code, codeVerifier, redirectUri, workspaceId })
  │    └─ Backend microsoftOAuthExchange → POST token endpoint (mesmo tenant) → access_token + refresh_token
  │         └─ refresh_token salvo em MicrosoftOAuthToken (backend, nunca exposto)
  │         └─ access_token retornado ao frontend (memoria, nunca localStorage)
  └─ Conectado. getAccessToken(workspaceId) usado pelos connectors.
  └─ ensureValidToken() → invokeFn('microsoftOAuthRefresh') quando expira
       └─ Backend microsoftOAuthRefresh → POST token endpoint (mesmo tenant) → novo access_token
```

**Componentes vivos no fluxo (NAO mexer sem revalidar):**

- `src/lib/microsoft-auth/MicrosoftAuthSession.js` — session manager frontend, PKCE, multi-workspace, token em memoria.
- `src/lib/microsoft-auth/MicrosoftMultiAccount.js` — multi-conta (espelha Google).
- `src/pages/MicrosoftOAuthCallback.jsx` — recebe redirect da Microsoft, faz postMessage pra janela opener.
- `src/components/connections/MicrosoftWorkspaceSection.jsx` — card UI de conexao no /connections.
- `base44/functions/microsoftOAuthInit/entry.ts` — gera authUrl + state + codeVerifier (PKCE).
- `base44/functions/microsoftOAuthExchange/entry.ts` — troca code por tokens, salva refresh_token.
- `base44/functions/microsoftOAuthRefresh/entry.ts` — renova access_token via refresh_token.
- `base44/entities/MicrosoftOAuthToken.jsonc` — armazena refresh_token por user_id + workspace_id (backend only).
- `src/lib/connector-runtime/connectors/MicrosoftGraphConnector.ts` — shell fino (Provider Router ADR-014).
- `src/lib/connector-runtime/connectors/microsoft-providers/OfficialGraphProvider.ts` — provider que chama Graph via token do workspaceId ativo.

---

### 2026-08-04 — Execution Intelligence Engine: Arquitetura Aprovada (RFC-008 + ADR-015)

**Doc oficial:** `src/docs/foundation/rfc/RFC-008-Execution-Intelligence-Engine.md` + `src/docs/foundation/adr/ADR-015.md`

**Status:** APENAS DOCUMENTACAO. Nenhum codigo TypeScript/JavaScript alterado ou criado nesta sessao. Sera implementado em 7 sprints (EI-01 a EI-07), cada um aditivo e reversivel.

**Contexto:** O MemoryOS fara emissoes na vida real (passagem aerea via Travellink, envio de email via Gmail/Microsoft, futuros PIX). A protecao de acoes irreversiveis e um requisito de primeira classe. Hoje toda execucao de capability passa por `Planner → Capability Registry → RuntimeEngine → ExecutionDispatcher → UCRBridge → Connector` sem nenhuma camada que investigue, enriqueca ou proteja a execucao antes de despachar.

**Arquitetura aprovada (cadeia nova):**

```
Intent Layer
  ↓
Planner
  ↓
Capability Registry
  ↓
Runtime.processCapability()         (Facade publica unica)
  ↓
Execution Intelligence               (enriquece — 7 modulos internos encapsulados)
  ↓ PreparedExecution
Safety Gate                          (freia o irreversivel)
  ↓ ApprovedExecution
Execution Dispatcher (privado)       (so despacha — igual ao atual, intocados)
  ↓
Connector
```

**Decisoes arquiteturais (8):**

1. **Componente encapsulado** entre Capability Registry e Execution Dispatcher. Nao e novo Engine, nao e novo Runtime. Externamente 1 novo componente; internamente 7 modulos.
2. **Separacao Intelligence × Safety Gate** — camadas distintas, eixos de mudanca ortogonais (dominio, risco, infraestrutura). Intelligence produz a melhor execucao possivel; Safety freia o irreversivel.
3. **Runtime como Facade publica unica** — `Runtime.processCapability()`. Dispatcher deixa de ser API publica, vira implementacao interna. Bypass impossibilitado por construcao (closure-local, nunca exportado), nao por convencao.
4. **Contrato uniforme dos 3 componentes** desde EI-02 — assinatura compativel com Pipeline futura. Extracao para Pipeline generica sera plug-in, nao refatoracao profunda.
5. **Cadeia direta hoje, Pipeline so quando necessario** — regra de disparo: 4º estagio concreto, ou mesmo interceptor em 2+ estagios, ou ordem muda por config. Ate la, cadeia direta. Evita over-engineering (3 estagios nao justificam framework).
6. **Reversibility Classification** — toda capability declara `safe` / `reversible` / `irreversible` no metadata. Safety so freia `irreversible`.
7. **3 travas de balanceamento** (Convergence Budget, API/LLM Budget, Dependency Graph aciclico) — controles internos do Execution Intelligence, aplicados a partir de EI-07.
8. **Renomeacao do metodo publico** — `processCapability`, nao `executeCapability`. A capability pode nunca chegar a execucao (Intelligence pode descobrir info faltante e so responder ao usuario).

**Alternativas rejeitadas (documentadas em ADR-015):**
- (A) Execution Intelligence Engine independente — rejeitada: quebra SRP do Dispatcher, cria "dois runtimes", 2 novas entidades externas.
- (B) Safety Gate embutido no Dispatcher — rejeitada: Dispatcher volta a acumular responsabilidades (God Component).
- (C) Pipeline generica desde o inicio — rejeitada: over-engineering, 3 estagios nao justificam framework.
- (D) Dispatcher publicamente callable — rejeitada: protecao vira convencao, nao garantia; bypass possivel.

**Invariants arquiteturais (nao-negociaveis):**
1. Bypass impossivel por construcao — Dispatcher e closure-local, nunca exportado.
2. Nenhum exempt caller — unica forma de executar capability e pela cadeia completa, sem excecoes.
3. `processCapability` e puro wiring — 3 chamadas, zero logica.
4. Contrato uniforme desde EI-02.
5. Aditivo apenas — nada apagado ate EI-04 conclusiva; caminho antigo intocado ate callers migrarem.

**Reuso de padrao ja vivo:**
- `MicrosoftGraphConnector` (shell) + 11 Capability Executors em `microsoft/`
- `WhatsAppConnector` (shell) + 3 providers + observation bridge
- `GoalCapabilityRegistry` (registry + mappings registrados no load)
A Execution Intelligence segue o mesmo padrao: shell fino que orquestra 7 modulos internos, cada um testavel isoladamente, cada um registravel/desativavel (Open/Closed). Nao inventa padrao novo.

**Localizacao dos arquivos (futuro):**
```
src/lib/execution-intelligence/                 (NOVO diretorio — em src/lib/, NAO em src/runtime/ ou src/sdk/)
  ExecutionTypes.ts
  Runtime.ts
  ExecutionIntelligence.ts
  SafetyGate.ts
  investigators/
    InvestigatorRegistry.ts
    GenericFieldValidator.ts                     (EI-06)
    DateFormatValidator.ts                       (EI-06)
    TravelInvestigator.ts                        (EI-07, futuro)
    EmailInvestigator.ts                          (EI-07, futuro)
  policies/
    PolicyRegistry.ts
    ReversibilityPolicy.ts                       (EI-03)
    MandatoryFieldsPolicy.ts                     (EI-03, opcional)
```

**Fases de implementacao (7 sprints):**
- EI-01: Reversibility Metadata (zero risco)
- EI-02: Tipos + Runtime Facade (zero risco, nenhum caller)
- EI-03: Safety Gate (baixo risco, so ativa para quem migra)
- EI-04: Migracao gradual de callers (baixo risco, 1 caller por vez, reversivel)
- EI-05: Execution Intelligence pass-through (zero risco)
- EI-06: Investigators genericos (baixo risco, registravel/desativavel)
- EI-07: Investigators de dominio + iteracao balanceada (medio risco — gatilho: EI-06 em producao sem incidentes)

EI-07 e onde o valor diferencial real aparece. EI-01 a EI-06 sao fundacao incremental.

**Nao-quebra verificada:**
- `ExecutionDispatcher` existente e per-step e continua intocado. O "Dispatcher" da nova cadeia e o RuntimeEngine + Dispatcher existentes, que viram privado por convencao de chamada apos EI-04. Zero renomeacao, zero reescrita.
- `UCRBridge` (Event Layer), `PipelineObservationBridge` (Observation Layer), `ConnectorBootstrap`, `GoalCapabilityRegistry` — todos intocados.
- Caminho antigo (RuntimeEngine direto) segue 100% intocado ate EI-04.
- Cada migracao de caller (EI-04) e independente e reversivel.

**NAO foi feito (explicitamente fora do escopo desta sessao):**
- Nenhum codigo TypeScript/JavaScript alterado ou criado (esta sessao e so documentacao).
- Nenhuma UI de chat/Connections tocada.
- Nenhum teste de paridade executado (seria EI-02+).
- Pipeline generica (so quando 4º estagio concreto aparecer).
- Interceptors (so quando mesmo interceptor precisar rodar em 2+ estagios).

**Proximo passo:** aguardar autorizacao para iniciar **EI-01 (Reversibility Metadata)** — campo `reversibility` no metadata de cada connector existente. Zero risco, fundacao para Safety Gate.

---

### 2026-08-04 — Execution Intelligence EI-01 (Reversibility Metadata): Implementado

**RFC/ADR:** `RFC-008` + `ADR-015` (Sprint EI-01)

**Status:** EI-01 EXECUTADA. Zero comportamento novo — apenas metadata. Nenhum codigo le o campo `capabilityReversibility` ainda (Safety Gate que le vem em EI-03). Build verde por construcao: campo opcional, connectors que nao declaram continuam funcionando.

**Decisao de design (por que mapa per-capability e nao campo no connector):**
O `ConnectorMetadata.capabilities` e `string[]` (contrato existente, validado no `ConnectorBootstrap.validateConnector`). Trocar para `Array<string | { id; reversibility }>` quebraria o contrato e exigiria mudar a validacao + todos os consumers. Em vez disso, adicionou-se um campo **opcional** `capabilityReversibility?: Record<string, Reversibility>` ao lado de `capabilities`. O array `string[]` fica intacto; o mapa e so uma anotacao. Connectors 100% read-only (Calendar, GitHub, OpenRouter) nem declaram o campo — o default `safe` ja cobre todas as suas capabilities. Mudanca aditiva, zero quebra.

**Tipo adicionado (1 arquivo):**
- `src/lib/connector-runtime/ConnectorTypes.ts` — `export type Reversibility = "safe" | "reversible" | "irreversible"` + campo `capabilityReversibility?: Record<string, Reversibility>` em `ConnectorMetadata`.

**Connectors editados (8 com capabilities nao-safe):**

| Connector | irreversible | reversible | safe (implicitos) |
|---|---|---|---|
| GmailConnector | sendEmail | createDraft | readInbox, searchEmails, readMessage, readEmail, getThread, getAttachment, listLabels |
| GoogleDriveConnector | drive.deleteFile | createFolder, uploadFile, moveFile, renameFile, copyFile | files.list, files.get, files.search, about.get, downloadFile, summarizeDocument, extractSections, connectivity.ping, health.full |
| MemoriConnector | — | memori.remember | memori.recall |
| EmailConnector | email.send | email.createDraft | listInbox, read, search, connectivity.ping |
| FileSystemConnector | fs.delete | fs.upload, fs.createFolder | list, read, search, connectivity.ping |
| DatabaseConnector | db.delete | db.create, db.update | query, get, count, connectivity.ping |
| WhatsAppConnector | sendMessage, sendTemplate | — | getMessageStatus |
| MicrosoftGraphConnector | mail.send, teams.sendMessage | calendar.create, contacts.create, todo.createTask, todo.completeTask, onenote.createPage, sharepoint.createItem, excel.updateRange | todas as demais (list/read/search/download) |

**Connectores NAO editados (3 — 100% read-only, default `safe` cobre):**
- GoogleCalendarConnector — descricao literal "Read-only."; todas as 5 capabilities sao leitura.
- GitHubConnector — todas as ~40 capabilities sao GET (read-only). Nenhuma escrita.
- OpenRouterConnector — chatCompletion e listModels sao inferencia LLM read-only (sem efeito colateral).

**Classificacoes de juicio (documentadas no proprio codigo):**
- `drive.deleteFile` = `irreversible`: Drive move para trash (restauravel por 30 dias), mas a intencao do usuario ao pedir "deletar" e remocao; confiar no restore da trash e fragil. Conservador = `irreversible` (Safety Gate vai pedir confirmacao). Reversivel tecnicamente, mas irreversivel na pratica de UX.
- `mail.send` / `email.send` / `whatsapp.sendMessage` / `whatsapp.sendTemplate` / `teams.sendMessage` = `irreversible`: mensagens enviadas nao podem ser "desenviadas".
- `db.delete` = `irreversible`: remocao de registro no banco; tecnicamente restauravel por backup, mas da perspectiva do app e irreversivel.
- `memori.remember` = `reversible`: fatos gravados no Memori Cloud podem ser esquecidos/deletados.
- Create/upload/move/rename/copy/update = `reversible`: podem ser desfeitos (deletar o criado, reverter o update).

**Nao-quebra verificada:**
- `ConnectorBootstrap.validateConnector` so checa `capabilities` (array) — o novo campo opcional nao e validado, nao quebra bootstrap.
- `UCRBridge.capabilities()` mapeia `metadata().capabilities` (array) — nao le `capabilityReversibility`. Intocado.
- `ConnectorRegistry`, `GoalCapabilityRegistry`, `PipelineObservationBridge` — nenhum le o novo campo. Todos intocados.
- Os 3 connectors sem o campo (Calendar, GitHub, OpenRouter) compilam e funcionam identico ao antes.
- Nenhum `require()`/`module.exports` — ESM puro.
- Tipo `Reversibility` exportado de `ConnectorTypes.ts` (mesmo arquivo dos outros tipos de connector).

**Cuidados tomados (criterios do usuario):**
- Metodo de verificacao aplicado: lido o `ConnectorBootstrap.ts` (arvore viva — `src/lib/connector-runtime/`), confirmados os 11 factories. Nao mexido em `src/runtime/` nem `src/sdk/` (arvores paralelas mortas — dead end recorrente).
- Lidos os 11 connectors reais (nao confiar no nome) para classificar as capabilities com precisao.
- Nenhum codigo morto/legado/paralelo criado — o campo e opcional e os 3 read-only simplesmente nao o declaram.
- Mudanca aditiva apenas — nada apagado, nenhum contrato quebrado.

**NAO foi feito (explicitamente fora do escopo de EI-01):**
- Nenhum reader/helper que le `capabilityReversibility` (vem em EI-03, Safety Gate). O campo existe mas nada o consome.
- Nenhum caller migrado (EI-04).
- Nenhuma UI tocada.
- Nenhum teste de paridade executado (nao ha behavior novo para testar — e so metadata).

**Proximo passo:** aguardar autorizacao para iniciar **EI-02 (Tipos + Runtime Facade)** — `ExecutionTypes.ts` (contratos uniformes) + `Runtime.ts` com `processCapability` que hoje so delega ao RuntimeEngine existente. Nenhum caller o chama. Zero risco.

---

### 2026-08-04 — Execution Intelligence EI-02 (Tipos + Runtime Facade): Implementado

**RFC/ADR:** `RFC-008` + `ADR-015` (Sprint EI-02)

**Status:** EI-02 EXECUTADA. Novo diretorio `src/lib/execution-intelligence/` com 2 arquivos. Nenhum caller invoca `processCapability` ainda — a classe existe, compila, e esta pronta para EI-04 (migracao gradual de callers). Zero risco em producao: nada importa estes arquivos hoje.

**Arquitetura estudada antes de codar (metodo de verificacao do usuario):**
- Lido `src/lib/runtime-engine/ConversationRuntimeEngine.ts` — o engine atual executa `ExecutionPlan` (multi-step) via `ExecutionDispatcher.dispatch()` → `ICapabilityExecutor.execute()` → UCRBridge → connector. E plan-based.
- Lido `src/lib/runtime-engine/ExecutionDispatcher.ts` — intermediary per-step com timeout via Promise.race, metricas via `connectorMetrics.record()`. Nao e capability-based.
- Lido `src/lib/connector-runtime/ConnectorRegistry.ts` — `get(id)` retorna o `IConnector` vivo; `connector.execute(capability, params, context)` e o caminho direto para uma capability unica.
- **Decisao:** a Facade `processCapability` e capability-based (1 capability por chamada — o que o Planner produz por goal via GoalCapabilityRegistry), nao plan-based. Delega via `ConnectorRegistry.get(id).execute()` — o caminho direto. Nao acopla a `ExecutionPlan`/`ExecutionDispatcher` (que sao multi-step). Quando callers migrarem em EI-04, a Facade substitui o que faziam chamando o registry/engine direto.

**Arquivos criados (2) em `src/lib/execution-intelligence/` (NOVO diretorio, em `src/lib/`, NAO em `src/runtime/` nem `src/sdk/` — arvores paralelas mortas, dead end recorrente):**

1. **`ExecutionTypes.ts`** — contratos uniformes da cadeia:
   - `ExecutionRequest` — entrada: `{ connectorId, capability, params, context, confirmedByUser? }`.
   - `PreparedExecution` — saida da Intelligence (EI-05+): `{ request, enrichedParams, gaps, risks }`.
   - `ExecutionGap` — info faltante detectada: `{ field, reason }`.
   - `SafetyDecision` — decisao do Safety Gate (EI-03+): `approved | needs_confirmation | blocked`.
   - `ExecutionOutcome` — terminal: `{ status, connectorId, capability, result, error, reversibility }`. Status: `success | failed | needs_confirmation | blocked`.
   - `ExecutionContext` — contrato uniforme: `{ request, prepared, safety, outcome }` (todos nullable exceto request).
   - `ExecutionStage` — `{ id, process(ctx): Promise<ExecutionContext> }`. Os 3 componentes (Intelligence, SafetyGate, Dispatcher) vao implementar isto em EI-03/EI-05. Pipeline-ready desde EI-02: extracao futura e plug-in.

2. **`Runtime.ts`** — Facade publica:
   - Classe `ExecutionRuntime` com constructor `(registry: ConnectorRegistry)` (dependency injection).
   - Unico metodo publico: `processCapability(request: ExecutionRequest): Promise<ExecutionOutcome>`.
   - Hoje (EI-02): pass-through puro — resolve connector no registry, le `reversibility` do `metadata.capabilityReversibility` (campo adicionado em EI-01), chama `connector.execute(capability, params, context)`, mapeia `ConnectorResult` → `ExecutionOutcome`.
   - Helper privado `_buildOutcome()` — constroi o `ExecutionOutcome` imutavel (Object.freeze).
   - **Nenhum singleton criado** — nao exporta instancia. Zero side-effect em import. Callers (EI-04) criaram/injetarao a instancia com o registry real.

**Invariants arquiteturais honrados desde EI-02:**
1. **Bypass impossivel por construcao** — o dispatch (`connector.execute`) e interno a `processCapability`. Nenhum metodo `dispatch` publico e exportado de arquivo algum. O simbolo `dispatch` nao existe fora do metodo.
2. **Nenhum exempt caller** — so existe `processCapability` como entrada publica.
3. **`processCapability` e puro wiring** — hoje 1 chamada (dispatch) + 1 leitura de metadata + mapeamento. Zero logica de negocio. Em EI-03 vira `Intelligence → Safety → dispatch` (3 chamadas), ainda zero logica (logica vive nos componentes).
4. **Contrato uniforme desde EI-02** — `ExecutionStage` define a assinatura que EI-03 (SafetyGate) e EI-05 (Intelligence) vao implementar. Extracao para Pipeline generica sera plug-in.

**Nao-quebra verificada:**
- Nenhum arquivo existente foi editado. Apenas 2 novos arquivos criados.
- Nenhum import adicionado a arquivos vivos. Nada importa `ExecutionTypes.ts` ou `Runtime.ts` hoje.
- `ConnectorRegistry` importado como `type` only (sem side-effect em runtime).
- `ConnectorResult`, `ConnectorMetadata`, `Reversibility`, `ConnectorContext` importados como `type` de `ConnectorTypes.ts` (ja existentes, Reversibility adicionado em EI-01).
- Build verde por construcao: arquivos novos nao importados nao quebram nada.

**NAO foi feito (explicitamente fora do escopo de EI-02):**
- Nenhum SafetyGate (EI-03) — `processCapability` hoje nao checa reversibility para bloquear; apenas a inclui no outcome.
- Nenhum ExecutionIntelligence (EI-05) — sem enriquecimento.
- Nenhum caller migrado (EI-04) — nada chama `processCapability`.
- Nenhum singleton/factory exportado — a classe existe mas nao e instanciada em lugar nenhum.
- Nenhuma UI tocada.

**Proximo passo:** aguardar autorizacao para iniciar **EI-03 (Safety Gate)** — `SafetyGate.ts` que le `reversibility` do metadata: se `irreversible` e sem `confirmedByUser` → retorna `NeedsConfirmation` com resumo; `safe`/`reversible` passam direto. `Runtime.processCapability` passa a chamar `SafetyGate.guard()` antes do dispatch. So ativa para quem chama `processCapability` (nenhum caller migrou ainda em EI-03).

---

### 2026-08-04 — Execution Intelligence EI-03 (Safety Gate): Implementado

**RFC/ADR:** `RFC-008` + `ADR-015` (Sprint EI-03)

**Status:** EI-03 EXECUTADA. Safety Gate vivo e integrado ao Runtime. So ativa para quem chama `processCapability` — nenhum caller migrou ainda (isso e EI-04), entao zero impacto em producao. O caminho antigo (ConnectorRegistry direto) segue 100% intocado.

**Arquivo novo (1) em `src/lib/execution-intelligence/`:**

- **`SafetyGate.ts`** — classe `SafetyGate`, stateless, sem dependencias:
  - Metodo `guard(request: ExecutionRequest, reversibility: Reversibility): SafetyDecision`.
  - Regra: `safe`/`reversible` → `approved`; `irreversible` + `confirmedByUser` → `approved`; `irreversible` sem confirmacao → `needs_confirmation` (reason + summary).
  - `summary` generico hoje: `connectorId.capability` + preview dos primeiros 5 params (strings truncadas a 60 chars). Investigadores de dominio (resumos ricos por capability) vêm em EI-07.
  - Nao ha `blocked` hardcoded — polices obrigatorias vêm com o PolicyRegistry futuro. Hoje so freia por reversibility.
  - Invariant ADR-015: o SafetyGate NUNCA despacha — so decide. O dispatch continua interno e exclusivo do `Runtime.processCapability()`.

**Arquivos editados (2):**

1. **`ExecutionTypes.ts`** — `ExecutionOutcome.error` renomeado para `message` (semantico: carrega texto humano para qualquer status nao-success). Nenhum consumidor do tipo existia (EI-02), rename seguro.

2. **`Runtime.ts`** — `processCapability` agora executa a cadeia EI-03: resolve connector → le reversibility → **`SafetyGate.guard()`** → se `approved`, dispatch; se `needs_confirmation`/`blocked`, retorna sem despachar. `SafetyGate` instanciado internamente no constructor (stateless, sem DI). Invariants mantidos: dispatch interno (bypass impossivel); `processCapability` e puro wiring (3 chamadas, zero logica).

**Paridade / nao-quebra:**
- `safe`/`reversible` (maioria): comportamento identico ao EI-02 — `guard()` aprova e dispatch prossegue.
- `irreversible` sem `confirmedByUser`: agora retorna `needs_confirmation` em vez de despachar. **Comportamento esperado** — e a protecao que o Safety Gate existe para fornecer. Quem chama `processCapability` deve inspecionar `outcome.status` e, se `needs_confirmation`, pedir confirmacao ao usuario e re-chamar com `confirmedByUser: true`.
- Nenhum caller migrou (EI-04), entao nenhuma capability irreversivel e despachada via `processCapability` hoje. O caminho antigo (ConnectorRegistry direto / ConversationRuntimeEngine) nao passa pelo Safety Gate — intocado.
- `SafetyGate` e stateless; nenhum arquivo vivo o importa. Build verde por construcao.

**Cuidados tomados:**
- Componente puro: `guard()` e funcao sobre `(request, reversibility)` — sem estado, sem side-effects, sem dependencias. Testavel isoladamente.
- A leitura de `reversibility` do metadata ficou no Runtime (que ja o fazia); o SafetyGate recebe o valor pronto — desacoplado do `ConnectorRegistry` (SRP: so decide, nao resolve).
- Resumo generico marcado como temporario (EI-07 trara investigadores de dominio). YAGNI: nao inventar resumos ricos por capability agora.
- Nenhum `blocked` hardcoded — so `needs_confirmation`. Polices obrigatorias ficam para o PolicyRegistry futuro.

**NAO foi feito:**
- Nenhum PolicyRegistry / hard policy (futuro).
- Nenhum investigador de dominio (EI-07).
- Nenhum caller migrado (EI-04) — o Safety Gate nao freia nada em producao ainda.
- Nenhuma UI de confirmacao (precisa de EI-04 para ter um caller que produza `needs_confirmation` para a UI consumir).
- Nenhum teste automatizado (nao ha runner no projeto). Paridade por inspecao da logica.

**Proximo passo:** aguardar autorizacao para iniciar **EI-04 (Migracao gradual de callers)** — substituir, 1 caller por vez (reversivel), as chamadas diretas a `ConnectorRegistry.get(id).execute()` por `runtime.processCapability()`. Cada migracao independente e reversivel. E aqui que o Safety Gate comeca a freiar irreversiveis de verdade em producao. Ate la, EI-03 e morto (existe mas nao e exercitado).

---

### 2026-08-04 — Execution Intelligence EI-04 (Option C — Wiring + Refactor): Implementado

**RFC/ADR:** `RFC-008` + `ADR-015` (Sprint EI-04, Option C)

**Status:** EI-04 EXECUTADA na modalidade Option C (wiring + refactor, ZERO callers vivos migrados). Decisao de produto: a primeira migracao de caller vivo fica deferida para apos EI-05/EI-07, quando o Safety Gate tiver contexto real (Execution Intelligence + Investigators) para decidir irreversiveis sem quebrar automation (Watch Engine / email agendado). Razo: o gate hoje (EI-03) decide so com `confirmedByUser` (boolean do Planner); migrar o chat irreversivel agora colocaria uma rede de segurança ingênua sobre envio de email — exatamente a regressao que o MemoryOS quer evitar. E o MemoryOS nao tem irreversivel urgente em producao (Travellink/passagens pendente de credenciais).

**Grafo de dispatch estudado antes do refactor (metodo de verificacao do usuario):**
- Lido `src/lib/conversation-platform/ConversationPipeline.ts` (linhas 778-803): o path de producao e `getRealRuntimeEngine()` + `getRealConnectorRegistry()` de `@/lib/connector-runtime-provider/ConnectorRuntimeProvider`, depois `_realEngine.execute(plan, executionId, connectorCtx)`.
- Lido `src/lib/connector-runtime-provider/ConnectorRuntimeProvider.ts`: `getRealRuntimeEngine()`/`getRealConnectorRegistry()` expoe o engine real (wired com `ConnectorCapabilityExecutor` → `UniversalConnectorRouter` → `UCRBridge` → connectors) e o registry populado. Bootstrap dispara eager no module load; HMR-safe via globalThis.
- Lido `src/lib/connector-runtime/UCRBridge.ts`: o leaf que envolve cada `connector.execute()` com eventos do `RuntimeEventBus` (ConnectorExecutionStarted/Completed/Failed) + mapeamento de status runtime→UCR. Chamar `connector.execute()` direto (como o EI-02/EI-03 fazia) bypassa tudo isso.
- Lido `src/lib/runtime-engine/ConversationRuntimeEngine.ts` + `ExecutionDispatcher.ts`: o engine executa `ExecutionPlan` (multi-step) via `ExecutionDispatcher.dispatch()` → `ICapabilityExecutor` → UCRBridge, com timeout (Promise.race), metricas (`connectorMetrics.record()`), observabilidade (`runtimeObsStore`) e eventos.
- Lido `src/lib/planning-engine-e022/ExecutionPlanTypes.ts`: `ExecutionStep = { id, connector, capability, parameters }`, `ExecutionPlan = { id, goalId, goalType, status, steps, createdAt, durationMs, mode? }`, factories `makePlanId()`/`makeStepId(n)`.
- Lido `src/lib/runtime-engine/RuntimeTypes.ts`: `ConnectorExecutionContext = { userId, workspaceId, sessionId, goalId?, requestId?, origin? }`, `ExecutionResult = { executionId, planId, goalId, status, steps: StepResult[], durationMs, errors }`, `ExecutionWithReport = { executionResult, executionReport }`.
- Lido `src/lib/connector-runtime/ConnectorTypes.ts`: `ConnectorContext = { executionId, userId, projectId, sessionId, goalId?, ... }` — NAO tem `workspaceId`. Por isso `ExecutionRequest.context` foi trocado de `ConnectorContext` para `ConnectorExecutionContext` (que tem `workspaceId`, essencial p/ multi-conta Microsoft/Google).

**Decisao arquitetural (Option C):** `processCapability` nao chama `connector.execute()` direto. Em vez disso, builda um `ExecutionPlan` de 1 step a partir do `ExecutionRequest` e delega ao `ConversationRuntimeEngine` existente. Assim herda TODA a observabilidade de producao (eventos, metricas, timeout, mapeamento de status) — nao reimplementation. O "Dispatcher" da cadeia ADR-015 e o engine existente, exatamente como o ADR previa.

**Arquivo novo (1) em `src/lib/execution-intelligence/`:**

- **`index.ts`** — wiring. Exporta `getExecutionRuntime(): Promise<ExecutionRuntime>` — instancia wired ao REAL `ConversationRuntimeEngine` + `ConnectorRegistry` (via dynamic import de `ConnectorRuntimeProvider`). Lazy: primeira chamada aguarda o bootstrap do engine/registry real (que o ConnectorRuntimeProvider ja dispara eager). Idempotente (cache em `_runtime`; chamadas concorrentes compartilham `_runtimePromise`; reset em caso de falha). Re-exports `ExecutionRuntime`, `SafetyGate` e os tipos de `ExecutionTypes`.

**Arquivos editados (2):**

1. **`ExecutionTypes.ts`**:
   - `ExecutionRequest.context`: `ConnectorContext` → `ConnectorExecutionContext` (de RuntimeTypes — tem `workspaceId`, essencial p/ multi-conta). Adicionado `executionId?: string` (vira o `pipelineExecutionId` do engine). Import ajustado: removido `ConnectorContext`, adicionado `ConnectorExecutionContext` de RuntimeTypes.
   - `ExecutionOutcome`: `result: ConnectorResult | null` → `output: unknown | null` (o `StepResult.output` do engine). Adicionados `executionId: string | null` e `durationMs: number | null` (correlacao com metricas/eventos do engine). Removido import nao-mais-usado de `ConnectorResult`.

2. **`Runtime.ts`** (refactor EI-04):
   - Constructor agora recebe `(registry: ConnectorRegistry, engine: ConversationRuntimeEngine)` — DI do engine real (wiring via `index.ts`).
   - `processCapability` cadeia: resolve connector → le reversibility → `SafetyGate.guard()` → (se approved) build 1-step `ExecutionPlan` (`makePlanId()`/`makeStepId(1)`, `goalType: "execution_intelligence"`, `mode: "live"`) → build `ConnectorExecutionContext` do `request.context` → `engine.execute(plan, request.executionId, connectorCtx)` → map `ExecutionWithReport` → `ExecutionOutcome`.
   - Map: `executionResult.status === "completed"` → outcome "success" + `output = stepResult.output`; senao "failed" + `message = errors[0] ?? stepResult.error`. `executionId`/`durationMs` do `executionResult`.
   - `SafetyGate` instanciado internamente (stateless). Invariants ADR-015 mantidos: dispatch (`engine.execute`) interno a `processCapability` (bypass impossivel); puro wiring (zero logica de negocio).

**Nao-quebra verificada:**
- Nenhum caller vivo importa `index.ts` ou chama `processCapability` — zero impacto em producao. O `ConversationPipeline` segue chamando `getRealRuntimeEngine()` direto (intocado).
- Os tipos mudaram (`ExecutionRequest.context`, `ExecutionOutcome.output/executionId/durationMs`) mas nenhum consumidor existia (EI-02/EI-03 nao tinham callers), entao rename e seguro.
- `Runtime.ts` importa `ConversationRuntimeEngine` e `ConnectorExecutionContext`/`ExecutionWithReport` como `type` only; `makePlanId`/`makeStepId` como valores (pure functions).
- Build verde por construcao: arquivos novos/nao-importados nao quebram nada; os edits de tipo sao autoconsistentes.

**Cuidados tomados (criterios do usuario):**
- Option C escolhida por seguranca (sistema de segurança com heuristica frágil e pior que nenhum). Decisao documentada e justificada.
- Refactor delega ao engine existente em vez de reimplementar observabilidade — alinha com "Dispatcher = engine existente" do ADR-015 e evita duplicar UCRBridge/ExecutionDispatcher.
- `ConnectorExecutionContext` (nao `ConnectorContext`) para preservar `workspaceId` (multi-conta) — bug de tipo pegado antes de commit lendo `ConnectorTypes.ts`.
- ZERO callers migrados — a primeira migracao de caller vivo exige o gate com contexto real (EI-05/EI-07). Nao quebrar automation (Watch Engine/email agendado) e prioridade do projeto.
- Aditivo apenas: nada apagado que estivesse em uso; o caminho antigo segue intocado.

**NAO foi feito (fora do escopo de EI-04 Option C):**
- Nenhuma migracao de caller vivo (deferida para apos EI-05/EI-07). EI-04 "prep" nao exercita o gate em producao.
- Nenhum ExecutionIntelligence (EI-05) — `processCapability` ainda nao enriquece antes do Safety Gate.
- Nenhum investigador de dominio (EI-07) — resumos do SafetyGate continuam genericos.
- Nenhuma UI de confirmacao (sem caller produzindo `needs_confirmation` para consumir).
- Nenhum teste automatizado (nao ha runner no projeto). Corretude verificada por inspecao + leitura dos tipos reais.

**Proximo passo:** aguardar autorizacao para iniciar **EI-05 (Execution Intelligence pass-through)** — `ExecutionIntelligence.ts` pass-through puro (recebe `ExecutionRequest`, devolve `PreparedExecution` identico, so loga/instrumenta). `Runtime.processCapability` passa a chamar Intelligence antes do Safety Gate. Continua zero impacto em producao (nenhum caller vivo). Apos EI-05 + EI-07 (Investigators com contexto real), reabrir a decisao de qual caller vivo migrar primeiro.

---

### 2026-08-04 — Execution Intelligence EI-05 (Execution Intelligence pass-through): Implementado

**RFC/ADR:** `RFC-008` + `ADR-015` (Sprint EI-05)

**Status:** EI-05 EXECUTADA. A cadeia ADR-015 esta completa na sua forma pass-through: `processCapability` agora executa `Intelligence.prepare → SafetyGate.guard → dispatch`. A Intelligence ainda nao enriquece (pass-through puro), mas o SLOT esta ocupado com contratos uniformes — quando os investigators chegarem (EI-06/EI-07), o Runtime ja chama prepare() no lugar certo. Zero impacto em producao: nenhum caller vivo.

**Arquivo novo (1) em `src/lib/execution-intelligence/`:**
- **`ExecutionIntelligence.ts`** — stateless, `prepare(request) → PreparedExecution` identico (`enrichedParams=request.params`, `gaps=[]`, `risks=[]`); contador de instrumentation; invariants ADR-015 (nao despacha, nao bloqueia).

**Arquivos editados (3):** `SafetyGate.ts` (guard consome `PreparedExecution`), `Runtime.ts` (wiring Intelligence antes do gate; plan usa `prepared.enrichedParams`), `index.ts` (re-export).

**Nao-quebra:** pass-through identico; nenhum caller vivo; build verde por construcao.

**Proximo passo:** EI-06 (Investigators genericos).

---

### 2026-08-04 — Execution Intelligence EI-06 (Investigators genericos): Implementado

**RFC/ADR:** `RFC-008` + `ADR-015` (Sprint EI-06)

**Status:** EI-06 EXECUTADA. Investigators genericos vivos: registry + 2 validators + wiring no `prepare()`. Restricoes honradas: sem iteracao (single pass), sem LLM, sem chamadas cross-connector. Cada investigator registravel/desativavel (Open/Closed). Zero impacto em producao (nenhum caller vivo; registry vazio por design).

**Arquivos novos (4) em `src/lib/execution-intelligence/investigators/`:**

- **`InvestigatorTypes.ts`** — interface `Investigator` (id, description, appliesTo?, investigate) + `InvestigationFinding` (gaps + risks). Puro: mesma request → mesmos findings, sem side effects. `appliesTo` opcional limita a quais requests roda (undefined = sempre).
- **`InvestigatorRegistry.ts`** — singleton HMR-safe via `globalThis.__EI_INVESTIGATOR_REGISTRY__` (mesmo padrao dos outros registries do projeto). `register/deactivate/activate/list/active/resolve(request)`. `resolve` filtra ativos por `appliesTo`. Ordem de registro preservada (Map insertion order). **Nasce VAZIO** — validators genericos sao as CLASSES; registros concretos (com requiredFields/dateFields por connector+capability) sao de dominio (EI-07) ou callers.
- **`GenericFieldValidator.ts`** — `Investigator` generico: valida campos obrigatorios PRESENTES e nao-vazios (null/undefined/""/[]). Configuravel: `{ id, description, requiredFields, appliesTo? }`. Nao valida formato. Nao enriquece params.
- **`DateFormatValidator.ts`** — `Investigator` generico: valida campos de data em formato aceito. Formatos conhecidos: YYYY-MM-DD, DD/MM/YYYY, YYYY-MM-DDTHH:mm, HH:mm (regex). `acceptedFormats?` configuravel (default: todos). `Date` objects aceitos. Nao valida presenca (papel do GenericFieldValidator). Configuravel: `{ id, description, dateFields, acceptedFormats?, appliesTo? }`.

**Arquivos editados (3):**

1. **`ExecutionIntelligence.ts`** — `prepare()` agora resolve `investigatorRegistry.resolve(request)`, executa cada investigator (single pass, sync), agrega gaps + risks no `PreparedExecution`. `enrichedParams` continua `request.params` (EI-06 nao enriquece — so sinaliza). Import adicionado: `investigatorRegistry`. Header + docstring atualizados de EI-05 → EI-06. Com registry vazio, behavior == EI-05 (gaps=[], risks=[]) — paridade preservada.

2. **`SafetyGate.ts`** — `_summarize()` anexa `prepared.gaps` ao resumo de `needs_confirmation` (se houver gaps, lista "Campos pendentes" abaixo do preview). Nao muda a decisao (ainda so reversibility decide) — so torna os findings dos investigators observaveis ao usuario na confirmacao.

3. **`index.ts`** — re-exporta `investigatorRegistry`, `GenericFieldValidator`, `DateFormatValidator`, tipos `Investigator`/`InvestigationFinding`. Header EI-05 → EI-06.

**Paridade / nao-quebra:**
- Registry vazio → `resolve(request)` retorna [] → `prepare()` devolve `{ request, enrichedParams: request.params, gaps: [], risks: [] }` (identico ao EI-05). Logo:
  - `safe`/`reversible`: `guard` aprova → dispatch com enrichedParams (=== params) → mesmo resultado.
  - `irreversible` sem confirmacao: `guard` devolve `needs_confirmation` com resumo (sem gaps p/ anexar) → mesmo resumo do EI-05.
  - `irreversible` + `confirmedByUser`: aprova e despacha.
- Nenhum caller vivo chama `processCapability` — zero impacto em producao. O `ConversationPipeline` segue chamando `getRealRuntimeEngine()` direto (intocado).
- Investigators sao puros (stateless, sem side effects) — registro/desativacao nao afeta chamadas em andamento.
- Build verde por construcao: arquivos novos nao importados por nada vivo; edits de `ExecutionIntelligence`/`SafetyGate`/`index` sao autoconsistentes (imports ajustados).

**Cuidados tomados (criterios do usuario):**
- Registry vazio por design — nao acoplar EI-06 a connectors especificos (isso e EI-07, domain investigators). As CLASSES sao genericas; registros concretos sao de dominio.
- Sem iteracao: cada investigator roda 1x (single pass). Convergence/API/LLM Budget e Dependency Graph ficam para EI-07 (gatilho: EI-06 em producao sem incidentes — mas EI-06 nao tem callers, entao "producao sem incidentes" e trivialmente verdade; decisao de gatilho EI-07 fica com o usuario).
- Sem LLM, sem chamadas cross-connector: validators sao regex + presence checks puros.
- Open/Closed: novos investigators via `register()` sem mexer em codigo existente; `deactivate()`/`activate()` controla quem roda sem remover.
- Invariants ADR-015 mantidos: investigators so produzem informacao (nao despacham, nao bloqueiam); SafetyGate so decide (nao despacha); dispatch continua interno e exclusivo do `processCapability`.
- Aditivo apenas: nada apagado que estivesse em uso; caminho antigo (getRealRuntimeEngine direto) segue intocado.

**NAO foi feito (fora do escopo de EI-06):**
- Nenhum registro concreto de investigator (registry vazio). Registros de dominio (gmail.sendEmail.required, travel.date.format, etc.) sao EI-07.
- Nenhum investigador de dominio (EI-07) — TravelInvestigator, EmailInvestigator com resumos ricos.
- Nenhuma iteracao balanceada (EI-07) — Convergence/API/LLM Budget, Dependency Graph aciclico.
- Nenhuma policy que transforme gaps em `blocked` (PolicyRegistry futuro).
- Nenhuma migracao de caller vivo (deferida apos EI-07).
- Nenhum teste automatizado (nao ha runner no projeto). Corretude verificada por inspecao da cadeia + tipos.

**Proximo passo:** aguardar autorizacao para iniciar **EI-07 (Investigators de dominio + iteracao balanceada)** — TravelInvestigator, EmailInvestigator (resumos ricos por capability + enriquecimento real de params); Convergence Budget (max N iteracoes), API/LLM Budget, Dependency Graph aciclico. E o sprint onde o valor diferencial real aparece. Apos EI-07, reabrir a decisao de qual caller vivo migrar primeiro (o Safety Gate tera contexto real para decidir irreversiveis sem quebrar automation).

---

### 2026-08-04 — Execution Intelligence EI-07 (Investigators de dominio + iteracao balanceada): Implementado

**RFC/ADR:** `RFC-008` + `ADR-015` (Sprint EI-07 — final do EPIC-019)

**Status:** EI-07 EXECUTADA. Sprint final. Cadeia ADR-015 completa com iteracao balanceada: `processCapability` → `Intelligence.prepare (iteracao com 3 travas)` → `SafetyGate.guard` → dispatch. `prepare()` async. Investigators de dominio (Travel, Email) auto-registrados no load do wiring. Zero impacto em producao (nenhum caller vivo).

**Arquivos novos (3) em `investigators/`:** `TravelInvestigator.ts` (passagem aerea: valida campos, normaliza DD/MM/YYYY→YYYY-MM-DD, default passengerType; dorme ate connector Travellink), `EmailInvestigator.ts` (envio: valida to/subject/body, detecta "to" sem "@", trim), `registerDefaults.ts` (side-effect import em index.ts; registra Travel+Email).

**Reescritos (2):** `InvestigatorTypes.ts` (paramPatches, cost, provides/requires, investigate async), `InvestigatorRegistry.ts` (topo-sort Kahn + deteccao de ciclo; resolve em ordem topologica), `ExecutionIntelligence.ts` (`prepare` async com iteracao balanceada + 3 travas: Convergence Budget 5, API/LLM Budget 3/4, Dependency Graph aciclico; finalGaps = ultima iteracao).

**Editados (3):** `ExecutionTypes.ts` (`IntelligenceBudget` + `DEFAULT_BUDGET`), `Runtime.ts` (await prepare), `index.ts` (side-effect import registerDefaults + re-exports).

**Paridade:** registry vazio → pass-through (paridade EI-06). Investigators deterministicos (sem LLM/cross-connector) → budget nunca esgota. Auto-registro so dispara quando index.ts e importado (nenhum vivo hoje). Topo-sort: Travel/Email sem requires → indegree 0, sem ciclo.

**Cuidados:** 3 travas como controles internos (nao Pipeline generica; cadeia direta mantida). Domain investigators deterministicos — enriquecimento real via LLM/connector fica pos-migracao (exigiria injetar ConnectorRegistry no Intelligence). Dependency Graph declarado por provides/requires, ciclo rejeitado no register (fail-fast). Budgets conservadores 5/3/4 configuraveis. Open/Closed. Aditivo; invariants ADR-015 mantidos.

**NAO feito:** enriquecimento real via LLM/cross-connector (pos-migracao); PolicyRegistry (gaps→blocked); migracao de caller vivo (deferida — EI-07 entregou o contexto que o Safety Gate precisava); testes automatizados (sem runner).

**Estado final EPIC-019:** CONCLUIDO. 7 sprints (EI-01 a EI-07) entregues incrementalmente, caminho antigo intocado. Proximo pos-EI-07: migrar o primeiro caller vivo (EI-04 sub-step) — `gmail.sendEmail` e candidato natural (irreversivel + EmailInvestigator ativo).

---

### 2026-08-04 — EI-04 sub-step: primeira migracao de caller vivo (reversible-first)

**Status:** Primeiro caller vivo migrado para `processCapability`. Escolhido `ConnectorGoalIntentExecutor` (path multi-intent) — isolado, com fallback ao `runReasoningPlan`. Decisao: **reversible-first** (nao `gmail.sendEmail` irreversivel) para nao quebrar automacao no primeiro movimento.

**Mudanca (`src/lib/multi-intent/ConnectorGoalIntentExecutor.ts`):** para planos de 1 step, tenta `getExecutionRuntime().processCapability(...)` primeiro. Se `outcome.status === "success"` (safe/reversible despachados pelo SafetyGate), mapeia `ExecutionOutcome` → `ExecutionResult` (helper `_outcomeToExecutionResult`) e alimenta o `synthesizeConnectorResult` (comportamento identico + enriquecimento da Intelligence). Se `needs_confirmation`/`blocked`/`failed` (irreversivel sem `confirmedByUser` — ex.: `mail.send`), cai no `realEngine.execute` original → **automacao irreversivel preservada**. try/catch: erro na cadeia EI cai no realEngine (zero regressao). Planos multi-step: caminho antigo.

**Por que reversible-first:** `reversible`/`safe` passam direto pelo SafetyGate (`approved`) → dispatch identico, so ganham enriquecimento. `irreversible` sem confirmacao → `needs_confirmation` → fallback → comportamento original. Capabilities reversiveis validam a cadeia EI em producao sem risco a fluxos automaticos.

**Nao-quebra:** multi-intent path so ativa em mensagens multi-clausula que mapeiam a goal de connector. Path principal (ConversationPipeline) intocado. `realEngine.execute` 100% disponivel como fallback.

**Proximo:** quando estavel, migrar `gmail.sendEmail` (irreversivel) — exigira definir como `confirmedByUser` chega do usuario.

---

### 2026-08-04 — EI-04 Main Pipeline + Gmail multi-intent: correcoes de parsing e decomposicao

**Contexto:** Usuario testou envio de email com sintaxe multi-linha (Assunto/corpo em linhas separadas) + segunda intencao ("liste meus arquivos") na mesma mensagem. 3 bugs encadeados foram corrigidos, um escondendo o proximo.

**Bug 1 — Assunto em linha separada chegava vazio ("Assunto e obrigatorio"):**
- Sintaxe usada: `Assunto: Ola.` numa linha, corpo nas linhas seguintes (sem marcador `corpo:`).
- Causa: o regex do assunto em `GoalRegistry.ts` (`gmail.sendEmail.extractParams`) usava `[^"'\n]+?(?=...|$)` — excluia newlines e o `$` sem flag `m` so bater no fim da string. Como o assunto estava numa linha e o corpo vinha depois (newline), o lookahead `$` nunca era alcancado pelo captura que nao cruzava newline → subjectMatch = null → assunto vazio.
- Fix: regex trocado para `(.+?)(?=\s+(?:corpo|body|mensagem)[:\s]|$)` com flag `m` (multiline) — `$` agora = fim da linha. Captura "Ola." na linha do "Assunto:".
- Alem disso: o corpo (`body`) agora e extraido via `msg.slice(subjectEndIndex)` (tudo apos a linha do assunto), e o `_cleanBody` ganhou uma 2a regra `.replace` que remove uma segunda intenção no final apos linha em branco (`\n\s*\n(?:<verbo de comando>)\b.*$`).

**Bug 2 — "liste meus arquivos" (2a intencao) ficava no corpo do email:**
- Causa: o `MessageDecomposer.ts` so separava " e <verbo>" / ", <verbo>" / ponto+maiuscula generico. Nao separava um verbo de comando no inicio de uma nova linha apos linha em branco.
- Alem disso, a regra "ponto + maiuscula" (`\.\s+(?=[A-ZÀ-Ú])`) era generica demais — quebrava o corpo do email: "Assunto: Ola.\n\nOlá, tudo bem" virava 2 fragmentos, separando o corpo do comando de email.
- Fix em `MessageDecomposer.ts` (SEPARATOR_RE):
  - Regra "ponto + maiuscula" restrita para so separar se a proxima palavra for um verbo de comando: `\.\s+(?=(?:${COMMAND_VERBS})\b)`.
  - Nova regra: verbo de comando apos linha em branco separa: `\n\s*\n(?=(?:${COMMAND_VERBS})\b)`.
- Resultado: "Anderson Pires\n\nliste meus arquivos" → splita "liste meus arquivos" como 2o fragmento; "Assunto: Ola.\n\nOlá, tudo bem" NAO splita mais (corpo fica junto com o comando de email).

**Bug 3 — Decompositor multi-intento nunca rodava (mensagem nao disparava o gatilho):**
- Causa: o `ConversationPipeline.ts` so ativava o bloco multi-intent se `_mightBeMultiIntent` fosse true, e esse check so olhava `/\btambém\b|\be mais\b|,.*e /`. A mensagem do usuario (separada por linhas em branco) nao continha nenhum desses → decompositor nunca rodava → "liste meus arquivos" nunca era separado e executado.
- Fix: `_mightBeMultiIntent` agora tambem dispara quando a mensagem tem linha em branco: `(/\btambém\b|\be mais\b|,.*e |\n\s*\n/.test(userMessage)) && userMessage.length > 30`.
- Resultado: o decompositor roda, separa [comando de email + corpo] e [liste meus arquivos], cada fragmento e executado pela `MultiIntentEngine`.

**Arquivos editados (3):**
1. `src/lib/goals/GoalRegistry.ts` — regex do assunto (flag `m`) + 2a regra de limpeza de corpo (`\n\s*\n<cmd>`).
2. `src/lib/multi-intent/MessageDecomposer.ts` — SEPARATOR_RE: regra ponto+maiuscula restrita a verbo de comando + nova regra verboapos-linha-em-branco.
3. `src/lib/conversation-platform/ConversationPipeline.ts` — `_mightBeMultiIntent` expandido para incluir `\n\s*\n`.

**Validado pelo usuario (2026-08-04 18:53 BRT):**
- Email enviado com sucesso (ID: 19fcec355919d2bb), assunto "Ola.", corpo "Olá, tudo bem ? Ass, Anderson Pires" intacto.
- Arquivos do Google Drive listados como segunda intenção (arquivos + pastas recentes retornados).

**Licoes:**
- Regex de captura multi-linha precisa de flag `m` quando o marcador (`Assunto:`) fica numa linha e o limite e o fim da linha, nao da string.
- Decompositores de multi-intento por heuristica precisam cobrir separacao por newline + verbo de comando, nao so conectivos explicitos (" e ", ", ").
- O gatilho do decompositor no pipeline precisa ser tao permissivo quanto o decompositor — senao o decompositor correto nunca roda. Linha em branco e um sinal forte o suficiente pra tentar (o decompositor e barato e idempotente: se nao splita, cai no fluxo normal).

---