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