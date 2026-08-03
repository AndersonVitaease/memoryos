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
- **Travellink Web API (Aereo)** -- function `travellinkCall` com criptografia RSA-PKCS1 do Developer Access Code (testada isoladamente, confirmada). Falta: usuario aguardando 3 credenciais do suporte da Travellink (api.travellink@wooba.com.br) + estrutura exata do endpoint Disponibilidade.

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