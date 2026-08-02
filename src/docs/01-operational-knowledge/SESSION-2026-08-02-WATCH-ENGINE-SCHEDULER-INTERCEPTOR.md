# SESSION 2026-08-02 — Watch Engine: Interceptor de Agendamento no ConversationManager

## Contexto

Após resolver o envio de email via Gmail OAuth (sessão anterior), o sistema ainda apresentava
dois problemas críticos de UX:

1. **Mensagens mistas não eram interceptadas** — quando o usuário enviava "me avise + envie email
   às HH:MM", o pipeline cognitivo (LLM) era acionado em vez do Watch Engine, causando respostas
   de busca Gmail em vez de criação do Watch.
2. **Aviso de chat não aparecia separado** — o Watch de email disparava a notificação corretamente,
   mas a confirmação inicial não deixava claro que o aviso no chat *também* seria enviado.

---

## Diagnóstico

### Causa Raiz: Browser Module Caching (HMR)

O interceptor estava em `memoryReasoningPlanner.js` (v4 a v7), mas o Vite não recarregava o módulo
porque o singleton do pipeline (`conversationPipeline`) já estava instanciado em `globalThis`.
Qualquer modificação no planner não tinha efeito na sessão ativa do browser.

### Causa Secundária: Singleton `globalThis.__CXP_MANAGER__`

O `ConversationManager` era um singleton sem versionamento — mesmo com o bundle recompilado,
a instância antiga em `globalThis` era reutilizada e nunca pegava as mudanças nos módulos internos.

---

## Solução Implementada

### Arquivo: `src/lib/conversation-platform/ConversationManager.ts`

#### 1. Interceptor `tryScheduleEmail()` no topo do arquivo

Função pura que detecta horário + email *antes* de qualquer pipeline cognitivo:

```typescript
// Detecta: hora HH:MM (qualquer formato) + "Para: email@..."
const toMatch = /^para\s*:?\s*([^\s@]+@[^\s@]+\.[^\s@]+)/im.exec(userMessage);
const timeMatch = /\b(\d{1,2})[h:](\d{2})h?r?s?\b/i.exec(userMessage);
```

- Se ambos presentes → cria Watch de email + retorna confirmação imediata
- Se só horário + "me avise" → cria Watch de notificação simples
- Se nenhum → retorna `null` → pipeline cognitivo normal

#### 2. Watch de notificação simples

```typescript
// on_trigger_type: "notify_user" — sem email payload
await base44.entities.Watch.create({
  name: `Aviso as ${targetTime}`,
  on_trigger_type: "notify_user",
  on_trigger_payload: null,
  ...
});
return `Ok! Vou te avisar aqui no chat as **${targetTime}**.`;
```

#### 3. Watch de email com confirmação dupla

Quando a mensagem contém "me avise" + "Para: email":

```typescript
const hasNotifyRequest = /\bme\s+avis[ea]\b/i.test(userMessage);
if (hasNotifyRequest) {
  return `Agendado! As **${targetTime}** vou:\n1. Te avisar aqui no chat\n2. Enviar o email para \`${to}\``;
}
```

#### 4. Versionamento do singleton

```typescript
const _currentVer = "cxp-sched-v1";
if (!_g[_key] || _g[_ver] !== _currentVer) {
  _g[_key] = new ConversationManager();
  _g[_ver] = _currentVer;
}
```

Incrementar `_currentVer` força recriação do `ConversationManager` no próximo reload do browser,
sem precisar limpar cache manualmente.

#### 5. Persistência direta (bypass do pipeline)

Quando o interceptor captura a mensagem, persiste user + assistant direto via `base44.entities.Message.create()`,
sem passar por `conversationPipeline.send()`:

```typescript
if (schedResponse) {
  const userMsg = await b44.entities.Message.create({ role: "user", content: msg, ... });
  conversationStore.appendMessage(userMsg);
  const assistantMsg = await b44.entities.Message.create({ role: "assistant", content: schedResponse, ... });
  conversationStore.appendMessage(assistantMsg);
  return; // nunca chama conversationPipeline.send()
}
```

---

## Comportamentos Finais

| Mensagem | Watch Criado | Resposta |
|---|---|---|
| `me avise as 17:05hrs` | `notify_user` | "Vou te avisar às 17:05" |
| `as 17:05hrs envie email Para: x@x.com ...` | `emit_event + send_email` | "Email para x@x.com às 17:05" |
| `me avise\nas 17:05hrs envie email Para: x@x.com ...` | `emit_event + send_email` | "Às 17:05: 1. aviso no chat 2. email para x@x.com" |
| Qualquer outra mensagem | — | pipeline cognitivo normal |

---

## Fluxo de Execução (após fix)

```
ChatPage.sendMessage(text)
  → useConversation.send(text)
    → ConversationManager.send(text)           ← INTERCEPTOR AQUI
      → tryScheduleEmail(text)                 ← detecta horário + email
        → se detectado: Watch.create() + Message.create() × 2 → return
        → se não: conversationPipeline.send()  ← pipeline cognitivo normal
```

---

## Arquivos Modificados

| Arquivo | Mudança |
|---|---|
| `src/lib/conversation-platform/ConversationManager.ts` | Interceptor `tryScheduleEmail()`, versionamento do singleton, bypass do pipeline |

---

## Atualização — Gerenciamento de Watches e Proteção contra Horários Passados (cxp-sched-v2)

### Problemas resolvidos nesta iteração

1. **Watches com horário passado continuavam ativos** — o scheduler disparava alertas de horas anteriores, gerando notificações inúteis ou duplicadas.
2. **Impossível deletar watches via chat** — não havia nenhuma forma conversacional de cancelar avisos já criados.

### Soluções implementadas

#### `isPast(targetTime)` — Proteção contra horários passados

```typescript
function isPast(targetTime: string): boolean {
  // Converte horário atual para BRT e compara com targetTime
  // Retorna true se targetTime já passou há mais de 6 minutos
}
```

- Aplicado tanto em `tryScheduleEmail` quanto no Watch de aviso simples.
- Se o horário já passou → Watch não é criado; resposta imediata explicando.

#### `tryManageWatches()` — Gerenciamento conversacional

Interceptor novo chamado antes do scheduler. Detecta comandos como:
- `"deletar todos os outros"` → mantém apenas o especificado, remove os demais
- `"cancelar todos"` → marca todos os Watches ativos como `completed`
- `"remover o das 17:10"` → remove Watch específico por horário
- `"manter apenas o das 17:10"` → remove todos exceto o do horário informado

Watches removidos são marcados como `completed` (não deletados), preservando histórico.

#### Singleton incrementado para `cxp-sched-v2`

Força recriação do ConversationManager com os novos interceptores.

### Comportamentos adicionados

| Mensagem | Ação |
|---|---|
| `cancelar todos os avisos` | Marca todos os Watches ativos como `completed` |
| `deletar todos os outros` | Remove todos exceto o mais recente |
| `manter apenas o das 17:10` | Remove todos exceto o Watch das 17:10 |
| `remover o das 16:00` | Remove Watch específico das 16:00 |
| `me avise as 16:00` (passado) | Recusa criação, avisa que horário já passou |

---

## Testes Validados (17:02 / 17:03 BRT)

- ✅ Email chegou na caixa do destinatário via Gmail OAuth (remetente correto)
- ✅ Notificação apareceu no chat no horário correto
- ✅ Watch marcado como `completed` após disparo
- ✅ "me avise + envie email" na mesma mensagem: confirmação com 2 ações listadas
- ✅ Mensagens normais (sem horário) continuam indo pelo pipeline cognitivo

---

## Decisões de Design

- **Interceptor no ConversationManager, não no planner** — o CM é o único ponto de entrada
  garantido, imune a HMR/module caching do browser.
- **Padrão mínimo (horário + email)** — sem LLM para parsing; regex determinístico, zero latência.
- **Um Watch, duas ações** — o Watch de email já cria `PendingWatchAction` para notificação no chat;
  não é necessário criar dois Watches separados.
- **Singleton versionado** — permite forçar recriação sem limpar cache do browser manualmente.