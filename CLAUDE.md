# See AGENTS.md

Follow the instructions in `AGENTS.md`.

---

## Session Notes

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