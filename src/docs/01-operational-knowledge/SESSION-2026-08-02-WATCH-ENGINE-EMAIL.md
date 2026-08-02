# SESSION-2026-08-02 — Watch Engine: Email Agendado via Gmail OAuth

**Data:** 2026-08-02  
**Horário:** ~13:00 → 15:25 BRT  
**Status Geral:** ✅ Funcional com ressalvas conhecidas

---

## 1. CONTEXTO DA SESSÃO

O usuário relatou que emails agendados via Watch Engine estavam sendo enviados pelo relay interno do Base44 (`no-reply@base44-apps.com`) em vez da conta Gmail pessoal do usuário (`amazonnoconta01@gmail.com`). Além disso, caracteres especiais (acentos) estavam quebrados nos cabeçalhos, e o sistema não conseguia detectar/criar Watches a partir de mensagens do tipo "às 15:22hrs envie um email...".

---

## 2. PROBLEMAS IDENTIFICADOS

### 2.1 Email saindo via Base44 em vez de Gmail OAuth
- **Causa:** O scheduler `watchSchedulerTick` usava `Core.SendEmail` (relay Base44) como caminho principal. Gmail OAuth era apenas fallback.
- **Sintoma:** Emails chegavam de `no-reply@base44-apps.com`, não do remetente real.

### 2.2 Encoding quebrado em cabeçalhos de email
- **Causa:** Cabeçalhos RFC 2822 não suportam UTF-8 diretamente. O `Subject` com acentos era enviado como bytes raw.
- **Sintoma:** Assuntos como "Olá tudo bem?" apareciam corrompidos em clientes de email.

### 2.3 WatchPlannerBridge não detectava "às 15:22hrs envie um email"
- **Causa 1:** `PROVIDER_HINTS` avaliava `gmail` antes de `clock` — mensagens com horário + email eram classificadas como monitoramento de Gmail, não como envio agendado.
- **Causa 2:** `TIME_REGEX` não cobria o formato `15:22hrs` (sufixo `hrs`).
- **Causa 3:** Email payload não era extraído do histórico de conversa — se o usuário dava os dados do email em mensagens anteriores, o bridge não encontrava.
- **Sintoma:** Watch não era criado; o LLM respondia como se fosse uma pergunta normal.

### 2.4 Notificação no chat disparando repetidamente após reload
- **Causa:** O polling do `ChatPage` buscava `dispatched` dos últimos 10 minutos + `pending`. O `useRef(shownActionIds)` era resetado ao recarregar a página, fazendo o sistema re-exibir notificações já processadas.
- **Sintoma:** A mensagem "⏰ Chegou a hora! 15:11" aparecia múltiplas vezes no chat.

---

## 3. CORREÇÕES IMPLEMENTADAS

### 3.1 `base44/functions/watchSchedulerTick/entry.ts`
**Mudanças:**
- Gmail OAuth promovido para caminho **principal** (não fallback)
- `Core.SendEmail` mantido apenas como fallback real se OAuth falhar
- Implementado encoding RFC 2047 (`=?UTF-8?B?...?=`) para cabeçalhos `Subject`
- Corpo do email convertido para `Uint8Array` antes do base64url (preserva UTF-8)
- `getGoogleAccessToken()` aceita `preferEmail` para buscar token da conta específica

```typescript
// Encoding RFC 2047 para Subject
const encodeHeader = (str: string) => {
  const b64 = btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, ...));
  return `=?UTF-8?B?${b64}?=`;
};

// Body com Uint8Array para preservar UTF-8
const encoder = new TextEncoder();
const bytes = encoder.encode(emailLines);
// ... base64url
```

### 3.2 `src/lib/watch-engine/WatchPlannerBridge.ts`
**Mudanças:**
- `PROVIDER_HINTS`: `clock` movido para **primeira posição** (antes de `gmail`)
- `TIME_REGEX` atualizado para cobrir `15:22hrs`, `15h22`, `às 15:22`, `15:22h`
- `processMessage()` aceita `historyMessages` — extrai email payload do histórico recente (últimas 10 mensagens) se não encontrar na mensagem atual
- `extractEmailPayload()` com regex robusto cobrindo `Para:`, `para email@...`, `De:`, `Assunto:`
- `INTENT_PATTERNS` expandido com padrões de envio agendado: `às HH:MM envie/mande...`

```typescript
// PROVIDER_HINTS — clock primeiro
const PROVIDER_HINTS = [
  { pattern: /[àa]s\s+\d{1,2}[h:]\d{2}|..., provider: "clock", ... },
  // gmail só depois
  { pattern: /e.?mail|gmail|..., provider: "gmail", ... },
];
```

### 3.3 `src/lib/reasoning/memoryReasoningPlanner.js`
**Mudança:** Comentário corrigido na pré-etapa Watch para refletir que o bridge é invocado sempre (não apenas para palavras-chave específicas) — `hasMonitoringIntent()` é quem decide.

### 3.4 `src/pages/ChatPage.jsx`
**Mudança:** Polling de notificações do Watch Engine simplificado:
- Removida busca de `dispatched` recentes (causava re-exibição após reload)
- Agora busca **apenas `pending`** — ao processar, marca como `dispatched` imediatamente
- `shownActionIds` (useRef) serve apenas como deduplicação intra-sessão (mesma aba)

```javascript
// ANTES: buscava pending + dispatched dos últimos 10min
const [pendingActions, recentDispatched] = await Promise.all([...]);

// DEPOIS: apenas pending
const pendingActions = await base44.entities.PendingWatchAction.filter({ status: 'pending' });
```

---

## 4. ESTADO ATUAL DOS WATCHES (15:25 BRT)

| Watch | Horário | Status | Disparos | Email |
|-------|---------|--------|----------|-------|
| Envio de email às 15:22 — Manual | 15:22 | completed | 1 | ✅ via OAuth |
| Monitorar aviso às 15:11 | 15:11 | completed | 1 | via Base44 (antes do fix) |
| Monitorar aviso às 16:16 | 16:16 | active | 0 | aguardando |
| Monitorar novidades (Gmail) | — | active | 1 | n/a |

---

## 5. FLUXO COMPLETO DE EMAIL AGENDADO (ESTADO ATUAL)

```
Usuário digita: "às 15:22hrs envie um email para borecomba@gmail.com
                 Assunto: Olá tudo bem? ..."
        ↓
memoryReasoningPlanner.js
  → PRÉ-ETAPA WATCH
  → watchPlannerBridge.hasMonitoringIntent() → true
  → watchPlannerBridge.processMessage(msg, sessionId, projectId, historyMessages)
        ↓
WatchPlannerBridge.ts
  → detectWatchIntent() → provider=clock, target_time=15:22
  → extractEmailPayload() → { to, from, subject, body }
  → watchDeduplicator.check() → não duplicado
  → watchRegistry.create({ ... on_trigger: { type: "emit_event", payload: { type: "send_email", email: {...} } } })
        ↓
Watch criado no DB com next_execution_at = agora (clock watches são imediatos)
        ↓
[Scheduler roda a cada ~1min via cron]
watchSchedulerTick/entry.ts
  → evaluateClock() → diff entre agora e target_time ≤ 2min → true
  → wasTriggered = true (transição null→true)
  → getGoogleAccessToken(userId, preferEmail="amazonnoconta01@gmail.com")
  → sendGmailOAuth(token, fromEmail, to, subject, body)
        ↓
Email enviado via Gmail API OAuth com remetente real
        ↓
PendingWatchAction criado com status="pending"
Watch atualizado para status="completed"
        ↓
[ChatPage polling a cada 15s]
→ busca PendingWatchAction { status: "pending" }
→ marca como dispatched
→ exibe notificação no chat
```

---

## 6. LIMITAÇÕES CONHECIDAS

| # | Limitação | Impacto | Workaround |
|---|-----------|---------|------------|
| L1 | Scheduler cron roda a cada 5min (5 sub-iterações de 1min) — janela máxima de atraso: ~4min | Email pode chegar até 4min depois do horário pedido | Informar usuário na confirmação |
| L2 | Gmail OAuth requer `gmail.send` scope explícito no token armazenado | Se token antigo não tiver o scope, fallback para Base44 relay | Reconectar Google na página /connections |
| L3 | WatchDeduplicator usa Jaccard por provider+action+params — dois watches para o mesmo horário são considerados duplicados | Não permite criar dois emails diferentes pro mesmo horário | Pausar o watch existente antes de criar novo |
| L4 | `extractEmailPayload()` requer formato semi-estruturado (Para:/Assunto:) | Mensagens muito informais podem não capturar destinatário | Bridge cria watch sem email; usuário é informado |
| L5 | `shownActionIds` (useRef) reseta ao recarregar a página | Notificações `pending` do período offline são mostradas 1x ao reabrir | Comportamento correto — `dispatched` nunca é re-exibido |

---

## 7. ARQUIVOS MODIFICADOS

```
base44/functions/watchSchedulerTick/entry.ts     → Gmail OAuth principal, encoding RFC 2047
src/lib/watch-engine/WatchPlannerBridge.ts       → clock primeiro, TIME_REGEX, historyMessages
src/lib/reasoning/memoryReasoningPlanner.js      → comentário corrigido na pré-etapa Watch
src/pages/ChatPage.jsx                           → polling apenas pending, sem re-exibição
```

---

## 8. TESTES REALIZADOS

- ✅ Watch criado manualmente para 15:22 e disparado pelo scheduler
- ✅ Email enviado via Gmail OAuth (remetente: `amazonnoconta01@gmail.com`)
- ✅ Encoding UTF-8 funcionando (Olá, tudo, Att com acentos corretos)
- ✅ `PendingWatchAction` marcado como `dispatched` após exibição
- ✅ Notificação no chat exibida uma única vez
- ⚠️ Email chegou via Base44 relay (`no-reply@base44-apps.com`) no watch das 15:11 (antes do fix de OAuth)
- ⚠️ Subject apareceu truncado ("[Mensagem cortada]") — corpo com ~200 chars está dentro do limite do Gmail, investigar se é formatação do cliente

---

## 10. PDF AUTOMATION — EMAIL VIA BACKEND FUNCTION (2026-08-02 ~17:57 BRT)

### Problema
`knowledgeIngestionPipeline.js` usava `base44.integrations.Core.SendEmail` diretamente do frontend para enviar o resumo do PDF processado. Esse relay **rejeita endereços externos** (não registrados no app). O `catch` silencioso engolia o erro — a automação aparecia como concluída no chat mas o email nunca chegava.

### Solução

**1. `base44/shared/gmailSend.ts`** — módulo shared extraído com:
- `getGoogleOAuthToken(base44, fromEmail)` — busca token pelo email do remetente, fallback para qualquer token com `gmail.send`
- `sendGmailOAuth(accessToken, fromEmail, to, subject, body)` — envia via Gmail API com encoding RFC 2047 + UTF-8

**2. `base44/functions/sendPdfReport/entry.ts`** — nova backend function:
- Recebe `{ to, from, subject, body }`
- Tenta Gmail OAuth primeiro; fallback para `Core.SendEmail`
- Retorna `{ ok, method, to }`

**3. `src/lib/knowledgeIngestionPipeline.js`** — substituição:
```js
// ANTES (falha silenciosa para externos)
await base44.integrations.Core.SendEmail({ to, subject, body });

// DEPOIS (Gmail OAuth via backend)
const res = await base44.functions.invoke("sendPdfReport", { to, from, subject, body });
```

### Resultado validado
```json
{ "ok": true, "method": "gmail_oauth", "to": "borecomba@gmail.com" }
```
Tempo de resposta: 595ms. Email enviado via conta `amazonnoconta01@gmail.com`.

---

## 9. PRÓXIMOS PASSOS SUGERIDOS

1. **Testar encoding completo** — criar watch com acentos no assunto e corpo, confirmar chegada correta
2. **Confirmar scope gmail.send** — verificar via `/connections` que o token OAuth tem o scope necessário
3. **UI de confirmação** — ao criar watch de email, exibir preview do que será enviado antes de confirmar
4. **Cancelamento de watch** — permitir usuário cancelar/deletar watch ativo diretamente pelo chat ("cancele o alerta das 16:16")
5. **Histórico de emails enviados** — registrar no WatchExecution.provider_results os detalhes do envio