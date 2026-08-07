# SESSION 2026-08-07 — EI-04 sub-step: IrreversibleCaller + Migração dos Cards Gmail (compose/reply/forward)

**Para quem está lendo isto:** este documento existe pra que QUALQUER agente (Claude, a IA builder do Base44, ou um humano) consiga continuar este trabalho exatamente de onde parou. Leia este arquivo inteiro antes de escrever qualquer código relacionado a capabilities irreversíveis ou gates de confirmação de UI.

**Onde estamos agora:** os dois únicos gates ad-hoc de UI (`GmailActionsCard` e `GmailAdvancedCard`) foram migrados ao caminho arquitetural `IrreversibleCaller → ExecutionRuntime.processCapability → SafetyGate → RuntimeConfirmationEngine`. O `IrreversibleCaller` é a ponte canônica reutilizável. O sub-step EI-04 do chat-pipeline (rotear irreversíveis do Planner pelo `processCapability`) permanece deferido — é a próxima fronteira.

**Docs relacionados (leia também):**
- `src/docs/foundation/rfc/RFC-008-Execution-Intelligence-Engine.md` — a RFC da cadeia EI (Intelligence → SafetyGate → Dispatcher).
- `src/docs/foundation/adr/ADR-015.md` — a decisão arquitetural (bypass impossível por construção, `processCapability` como facade pública única).
- `CLAUDE.md`, seções "2026-08-04 — Execution Intelligence EI-04 (Option C)" e "2026-08-07 (continuação 7)" — histórico completo da decisão de deferir a migração do chat irreversível e da migração dos cards manuais.
- `src/lib/runtime/RuntimeConfirmationEngine.js` — o motor de confirmação universal (criar/confirmar/cancelar/expirar/auditar).

---

## 1. O que é isto (resumo de 30 segundos)

O MemoryOS emite ações na vida real (e-mails, rascunhos, replies, forwards, e futuramente passagens aéreas/PIX). Capabilities irreversíveis (`sendEmail`, `sendDraft`, `replyEmail`, `replyAll`, `forwardEmail`) exigem confirmação do usuário antes do dispatch. O `SafetyGate` (EI-03, ADR-015) freia irreversíveis sem `confirmedByUser=true`, mas até esta sessão os cards de UI do Gmail usavam gates ad-hoc (`withConfirmation` / `ConfirmationProvider.useConfirmation().requestAction`) + chamadas diretas a funções legacy (`GmailActions` / `GmailAdvanced`), **bypassando** o SafetyGate e o engine de produção (sem observabilidade, sem métricas, sem trava arquitetural).

Esta sessão padronizou o caminho: toda UI que dispara capability irreversível passa pelo **`IrreversibleCaller`**, que orquestra o ciclo `1ª chamada → needs_confirmation → dialog → confirm → 2ª chamada com confirmedByUser → dispatch`. Rascunhos (reversíveis) seguem diretos. O chat-pipeline (Planner → `engine.execute` direto) permanece intocado — essa é a sub-step EI-04 deferida.

## 2. Estado exato do repositório AGORA

**Existe (vivo, em uso pelos cards Gmail):**
- `src/lib/execution-intelligence/IrreversibleCaller.ts` — ponte reutilizável (criado na janela anterior, consumido nesta).
- `src/lib/execution-intelligence/irreversibleUi.js` — helpers compartilhados (`outcomeToResult`, `makePendingHandler`).
- `src/lib/execution-intelligence/ExecutionTypes.ts` — `ExecutionOutcome.status` com `cancelled` e `expired`.
- `src/lib/execution-intelligence/SafetyGate.ts` — sumários ricos para `sendDraft`/`replyEmail`/`replyAll`/`forwardEmail`.
- `src/lib/connector-runtime/connectors/GmailConnector.ts` — `sendDraft`, `replyEmail`, `replyAll`, `forwardEmail` como capabilities irreversíveis + dispatch cases.
- `src/components/connections/GmailActionsCard.jsx` — `sendEmail`/`sendDraft` via `IrreversibleCaller`.
- `src/components/connections/GmailAdvancedCard.jsx` — `replyEmail`/`replyAll`/`forwardEmail` via `IrreversibleCaller`.
- `src/lib/gmail/GmailActions.js` — `createDraft`, `sendDraft`, `sendEmail` (legacy functions, delegados pelo connector).
- `src/lib/gmail/GmailAdvanced.js` — `replyEmail`, `replyAll`, `forwardEmail`, `createReplyDraft`, `createForwardDraft` (legacy functions, delegados).
- `src/lib/runtime/RuntimeConfirmationEngine.js` — motor de confirmação (intocado, reusado).

**NÃO existe (a próxima fronteira):**
- Roteamento de irreversíveis do chat-pipeline pelo `processCapability`. Hoje o `ConversationPipeline` despacha via `getRealRuntimeEngine().execute(plan)` direto — irreversíveis do chat (WhatsApp `sendMessage`/`sendTemplate`, GitHub `pullRequests.merge`/`files.delete`, Calendar `createEvent`, Drive `deleteFile`/`moveFile`) bypassam o SafetyGate.
- Modo "automation-safe" para distinguir origem interativa (chat, pede confirmação) de automação (Watch/scheduled, despacha direto — não pode abrir dialog).
- Migrar write ops de outros cards (Calendar/Drive/GitHub) — verificação de gates ad-hoc só achou os dois cards Gmail; demais write ops são chat-driven.

## 3. O que mudou exatamente (6 arquivos)

### 3.1 `IrreversibleCaller.ts` (ponte reutilizável)

- **Responsabilidade:** orquestrar o ciclo de confirmação para capabilities irreversíveis vindas de UI.
- **Fluxo:** 1ª chamada `processCapability(request)` → se `outcome.status === "needs_confirmation"`, cria `ConfirmationRequest` no `RuntimeConfirmationEngine` e notifica via `onPending(pendingReq)` callback (UI surfaceia dialog). Usuário confirma/cancela → `confirm(id)`/`cancel(id)` no engine → 2ª chamada `processCapability({...request, confirmedByUser: true})` → dispatch.
- **Outcomes sintetizados:** se o usuário cancela ou a confirmação expira (timeout 120s), o `IrreversibleCaller` sintetiza um `ExecutionOutcome` com `status: "cancelled"` ou `"expired"` **sem disparar o connector** — é decisão do usuário/timeout, não falha do connector.
- **Resolução de context:** resolve `workspaceId`/`userId`/`sessionId` do estado ativo (WorkspaceContext + AuthContext) e gera `executionId` para correlação.

### 3.2 `ExecutionTypes.ts` + `SafetyGate.ts`

- `ExecutionOutcome.status` agora inclui `"cancelled"` e `"expired"` (além de `success`/`failed`/`needs_confirmation`/`blocked`). Isso permite que o `ResultBanner` da UI distinga:
  - `success` → verde (enviado/rascunho criado).
  - `cancelled`/`expired` → âmbar (decisão do usuário ou timeout — **não é falha**).
  - `failed`/`blocked` → vermelho (falha real do connector ou política obrigatória).
- `SafetyGate._summarize()` ganhou sumários ricos por capability (legíveis no dialog de confirmação):
  - `sendEmail`/`createDraft`: De / Para / Assunto / Corpo (corpo truncado a 120 chars).
  - `sendDraft`: ID do rascunho.
  - `replyEmail`/`replyAll`: Mensagem original / Resposta.
  - `forwardEmail`: Mensagem original / Para (destinatários).
  - Genérico (demais capabilities): `connectorId.capability` + preview dos primeiros 5 params.

### 3.3 `GmailConnector.ts` (capabilities irreversíveis + dispatch)

- `CAPABILITIES` agora inclui `replyEmail`, `replyAll`, `forwardEmail` (além de `sendDraft`, `sendEmail`, `createDraft`, e os reads).
- `capabilityReversibility` marca `sendDraft`, `replyEmail`, `replyAll`, `forwardEmail` como `"irreversible"` (junto a `sendEmail`).
- Dispatch cases novos delegam às funções legacy `GmailAdvanced`:
  - `replyEmail` → `GmailAdvanced.replyEmail({ messageId, body, replyAll })`.
  - `replyAll` → `GmailAdvanced.replyAll({ messageId, body })`.
  - `forwardEmail` → `GmailAdvanced.forwardEmail({ messageId, recipients, body })`.
- `sendDraft` (janela anterior) → `GmailActions.sendDraft({ draftId, workspaceId })`.
- Antes esses envios eram chamadas diretas a `GmailActions`/`GmailAdvanced` a partir da UI — bypassando SafetyGate e engine. Agora roteados pela cadeia EI (observabilidade do engine + trava do SafetyGate).

### 3.4 `irreversibleUi.js` (helpers compartilhados, DRY)

- `outcomeToResult(outcome)` — normaliza `ExecutionOutcome` → shape que o `ResultBanner` consome:
  - `success` → `{ ok, data }` (data = inner data do connector, ex: `{ id, status }`).
  - `cancelled`/`expired` → `{ ok: false, cancelled|expired: true, error }`.
  - `failed`/`blocked` → `{ ok: false, error }`.
- `makePendingHandler(setPendingConfirm)` — factory do handler `onPending` para o `IrreversibleCaller`: surfaceia o dialog (via `setPendingConfirm`) e resolve a solicitação no `RuntimeConfirmationEngine` ao confirmar/cancelar (`confirm(id)`/`cancel(id)`).
- Extraído de `GmailActionsCard` (onde era local) para reuso por `GmailAdvancedCard` e futuros cards de write ops.

### 3.5 `GmailActionsCard.jsx` (migração sendEmail + sendDraft)

- `sendEmail` e `sendDraft` rodam pelo `IrreversibleCaller` (antes `sendDraft` usava gate ad-hoc `withConfirmation` + chamada direta a `GmailActions.sendDraft`).
- `createDraft` (reversível) segue direto via `createDraft(req)` de `GmailActions`.
- `ResultBanner` distingue `cancelled`/`expired` (âmbar) de `failed` (vermelho).
- Imports locais de `confirm`/`cancel` removidos → `irreversibleUi.js`.

### 3.6 `GmailAdvancedCard.jsx` (migração reply/replyAll/forward)

- `replyEmail`/`replyAll`/`forwardEmail` rodam pelo `IrreversibleCaller` (antes usavam gate ad-hoc `ConfirmationProvider` + `useConfirmation().requestAction` + chamada direta a `GmailAdvanced`).
- `createReplyDraft`/`createForwardDraft` (reversíveis) seguem diretos.
- O `ConfirmationProvider`/`useConfirmation`/`requestAction` foi **removido**. O `ConfirmationDialog` local (mesmo componente do `GmailActionsCard`) + `makePendingHandler` são o único adapter de UI.
- `ResultBanner` com branch `cancelled`/`expired` (âmbar).

## 4. Mapeamento dos gates ad-hoc (verificação)

Grep por `useConfirmation` / `requestAction` / `requestConfirmation` em `src/components` + `src/pages` achou **exatamente dois callers**:
1. `src/components/connections/GmailActionsCard.jsx` — migrado.
2. `src/components/connections/GmailAdvancedCard.jsx` — migrado.

Não há mais gates ad-hoc de UI. Os demais irreversíveis (WhatsApp `sendMessage`/`sendTemplate`, GitHub `pullRequests.merge`/`files.delete`, Calendar `createEvent`, Drive `deleteFile`/`moveFile`) são **chat-driven** (invocados via Planner → pipeline), não UI-card-driven. O bypass deles é a sub-step EI-04 deferida (ver seção 5).

## 5. A próxima fronteira (sub-step EI-04 do chat-pipeline)

**O problema:** quando o usuário pede ao chat "envie um e-mail ao João" / "mergeie a PR #42" / "envie no WhatsApp", o `ConversationPipeline` despacha via `getRealRuntimeEngine().execute(plan)` direto, **bypassando** `processCapability` → `SafetyGate`. Então irreversíveis do chat nunca pedem confirmação.

**Por que não foi feito agora:** migrar exige um modo "automation-safe". O Watch Engine e o agendamento (scheduled tasks) despacham capabilities irreversíveis automaticamente (ex: envio de e-mail agendado, merge de PR por watch) — esses caminhos **não podem abrir um dialog de confirmação** (não há usuário interagindo). Se o `processCapability` sempre exigisse `confirmedByUser` para irreversíveis, quebraria toda a automação.

**O que falta:**
1. Distinguir origem interativa (chat) de automação (Watch/scheduled) no ponto de dispatch.
2. Para origem interativa, rotear irreversíveis pelo `processCapability`; ao receber `needs_confirmation`, criar `ConfirmationRequest` no `RuntimeConfirmationEngine` (o `ConfirmationProvider` já tem poll-bridge que surfaceia o dialog automaticamente).
3. Para automação, despachar direto (ou com `confirmedByUser: true` implícito, já que o Watch foi explicitamente autorizado pelo usuário ao criá-lo).

**Onde mexer:** `src/lib/connector-router/ConnectorCapabilityExecutor.ts` e/ou `src/lib/conversation-platform/ConversationPipeline.ts` — pontos onde o `engine.execute(plan)` é chamado. O `ConnectorGoalIntentExecutor` (multi-intent path) já faz a migração reversível-first (janela EI-04 Option C) e pode ser estendido.

**O `ConfirmationProvider` já está pronto:** ele tem um poll-bridge que renderiza dialogs para confirmações criadas EXTERNAMENTE pelo pipeline (não só pelo `IrreversibleCaller`). Então a UI não precisa ser tocada — só o pipeline precisa passar a pedir confirmação para irreversíveis interativos.

## 6. Padrão a seguir para futuros cards de write ops

Qualquer UI que dispara capability irreversível DEVE seguir o padrão:

```jsx
import { IrreversibleCaller } from "@/lib/execution-intelligence/IrreversibleCaller";
import { outcomeToResult, makePendingHandler } from "@/lib/execution-intelligence/irreversibleUi";

const [pendingConfirm, setPendingConfirm] = useState(null);

const handleSend = async (req) => {
  setLoading(true); setResult(null);
  try {
    const { outcome } = await IrreversibleCaller.execute(
      { connectorId: "<connector>", capability: "<capability>", params: req },
      { onPending: makePendingHandler(setPendingConfirm) },
    );
    setResult(outcomeToResult(outcome));
  } catch (e) {
    setResult({ ok: false, error: e?.message ?? "Envio falhou." });
  } finally {
    setLoading(false);
  }
};

// Render: <ConfirmationDialog request={pendingConfirm?.request} onConfirm={pendingConfirm?.onConfirm} onCancel={pendingConfirm?.onCancel} />
// ResultBanner: success (verde) | cancelled/expired (âmbar) | failed (vermelho)
```

Rascunhos/criações reversíveis seguem diretos (sem `IrreversibleCaller`). NUNCA reintroduzir gates ad-hoc (`withConfirmation`/`requestAction` + chamada direta a função legacy).

## 7. Lições reutilizáveis

1. **Gates ad-hoc vs camada arquitetural:** gates ad-hoc (`withConfirmation` + chamada direta) bypassam o SafetyGate e o engine — sem observabilidade, sem métricas, sem trava. A camada arquitetural (`IrreversibleCaller` → `processCapability` → `SafetyGate`) centraliza a proteção e herda toda a observabilidade de produção.
2. **`cancelled`/`expired` não são falhas:** distinguir decisão do usuário/timeout de falha real do connector é essencial para UX (banner âmbar vs vermelho) e telemetria (não inflar taxa de falha com cancelamentos).
3. **Helpers compartilhados (DRY):** extrair `outcomeToResult`/`makePendingHandler` para módulo compartilhado evita duplicação entre cards e garante que futuros write ops sigam o mesmo padrão.
4. **Sumários ricos por capability no SafetyGate:** o dialog de confirmação precisa ser legível (De/Para/Assunto/Corpo), não `connectorId.capability` genérico. Investigadores de domínio (EI-07) poderiam gerar resumos dinâmicos, mas para capabilities de UI conhecidas, sumários estáticos no `_summarize` são suficientes e determinísticos.
5. **Sub-step EI-04 do chat é a fronteira real:** os cards manuais (compose/reply/forward) são seguros porque o usuário está explicitamente interagindo. O chat-pipeline é onde o usuário Natural Language dispara irreversíveis sem clicar em um botão — esse caminho exige o modo automation-safe para não quebrar Watch/agendamento.
6. **Verificação de gates ad-hoc antes de assumir pronto:** grep por `useConfirmation`/`requestAction`/`requestConfirmation` em `src/components` + `src/pages` confirma que não há gates ad-hoc restantes. Repetir essa verificação ao adicionar novos write ops.