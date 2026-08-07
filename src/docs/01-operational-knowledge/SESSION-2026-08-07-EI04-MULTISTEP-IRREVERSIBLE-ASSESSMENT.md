# SESSION-2026-08-07-EI04-MULTISTEP-IRREVERSIBLE-ASSESSMENT.md

## Contexto

EI-04 (IrreversibleCaller) fecha o caminho irreversivel **single-step** (UI cards:
GmailActionsCard, GmailAdvancedCard) — todo envio roda por
`IrreversibleCaller.execute()` → `ExecutionRuntime.processCapability()` →
`SafetyGate` → `RuntimeConfirmationEngine`. Confirmado vivo (sessao
2026-08-07-EI04-CHATPIPELINE-CONFIRMED).

Resta o **multi-step**: planos (`ExecutionPlan` com N steps) onde algum step e
irreversivel. Hoje esses steps bypassam o `SafetyGate`.

## O bypass (confirmado no codigo)

Caminho single-step (EI-04, com gate):
```
IrreversibleCaller.execute(request)
  → ExecutionRuntime.processCapability(request)
      → ConnectorRegistry.get(connectorId)
      → le reversibility do metadata.capabilityReversibility[capability]
      → ExecutionIntelligence.prepare() → PreparedExecution
      → SafetyGate.guard(prepared, reversibility)
      → se approved: build 1-step plan → ConversationRuntimeEngine.execute()
      → map → ExecutionOutcome
```

Caminho multi-step (hoje, SEM gate):
```
ConversationPipeline
  → getRealRuntimeEngine()  (ConversationRuntimeEngine)
  → engine.execute(plan, executionId, connectorCtx)
      → for each step: ExecutionDispatcher.dispatch(input)
          → this._executor.execute({ step, connectorCtx })   // direto, sem gate
          → StepResult
```

`ExecutionDispatcher.dispatch()` (src/lib/runtime-engine/ExecutionDispatcher.ts)
chama `this._executor.execute()` direto. Nenhuma consulta a
`SafetyGate`, `ConnectorRegistry` ou `RuntimeConfirmationEngine`. Qualquer
step irreversivel (ex: `gmail.sendEmail`, `github.pullRequests.merge`,
`github.files.delete`) num plano multi-step e despachado silenciosamente.

`Runtime.ts` docstring confirma: "Nenhum caller vivo usa processCapability
ainda... O caminho antigo (getRealRuntimeEngine direto, usado pelo
ConversationPipeline) segue 100% intocado."

## Por que e prematuro

1. **Nenhum plano multi-step vivo contem step irreversivel hoje.** Os planos
   gerados pelo PlanningEngine sao majoritariamente leituras (searchEmails,
   files.list, commits.get). O primeiro caso real de uso ainda nao chegou.
2. **O loop de confirmacao interativa no path multi-step nao existe.** O
   `IrreversibleCaller` resolve single-step com `onPending` (UI mostra dialog,
   usuario confirm/cancel). O `ConversationRuntimeEngine` exec steps em
   sequencia sem pausar — nao ha mecanismo de "pausar o plano, esperar
   confirmacao, retomar". Construir isso e a peca faltante, e e especulativo
   sem um uso real definindo o UX (pausar a resposta do chat? card inline?
   dialog modal bloqueante?).
3. **Risco ao path vivo.** O `ConversationPipeline` e o caminho principal do
   chat. Tocar `ExecutionDispatcher`/`ConversationRuntimeEngine` sem um caso
   de uso para validar pode quebrar a UX de streaming/resposta em producao.

## Requisitos de implementacao (futuro, quando um uso real chegar)

### 1. Resolver reversibility no Dispatcher
Hoje o `ExecutionDispatcher` nao tem acesso ao `ConnectorRegistry`. Opcao
backward-compatible: adicionar um parametro opcional no construtor:
```ts
constructor(
  private readonly _executor: ICapabilityExecutor,
  private readonly _reversibilityResolver?: (connectorId: string, capability: string) => Reversibility | undefined,
)
```
Callers existentes (tests, stubs) nao passam → resolver undefined → guard
no-op (paridade preservada). A producao (`ConversationRuntimeEngine`) injeta
um resolver que le do registry.

### 2. Status `needs_confirmation` no StepResult
`StepStatus` (RuntimeTypes.ts) hoje: pending|running|completed|failed|
cancelled|timeout. Faltam `needs_confirmation` e `blocked` (mesmo vocabulario
do `ExecutionOutcome`/`ExecutionObservation`). Adicionar requer propagar nos
mappers (`UCRBridge`, `ConnectorCapabilityExecutor`) e no `ExecutionObservation`
(ja tem `needs_confirmation`/`blocked` no enum de status — so nao chegam la).

### 3. Guard no Dispatcher
```ts
// Antes de _executor.execute():
const reversibility = this._reversibilityResolver?.(step.connector, step.capability) ?? "safe";
if (reversibility === "irreversible" && !input.confirmedByUser) {
  return StepResult { status: "needs_confirmation", error: summary, ... };  // NAO despacha
}
```
Invariant ADR-015 preservado: o dispatch continua interno; o Dispatcher so
recusa despachar irreversivel nao-confirmado.

### 4. Loop de confirmacao no ConversationRuntimeEngine
O engine, ao receber `StepResult.status === "needs_confirmation"`, deve:
- marcar `RuntimeExecutionContext.status = "waiting_confirmation"` (ja existe
  no enum `ExecutionStatus`);
- surfacear via `RuntimeConfirmationEngine.requestConfirmation(...)` com um
  handler `onPending` injetado pelo caller (ConversationPipeline → UI);
- aguardar confirm/cancel/expira;
- confirmado → re-dispatchar o step com `confirmedByUser: true`;
- cancelado/expirado → `StepResult.status = "cancelled"` (nao falha o plano;
  nao poluta failure-rate do OIE — mesmo principio do IrreversibleCaller).

### 5. Surfacing na UI do chat
O `ConversationPipeline` precisa expor o `onPending` (como GmailActionsCard faz
via `ConfirmationDialog`). O UX do chat pausado para confirmar um step e a
decisao de produto que falta — define-se quando o primeiro uso real chegar.

## Decisao

**Nao implementar agora.** Registrar o design (este doc) e manter o open todo.
Construir o loop multi-step sem um caso de uso real e exatamente o tipo de
feature especulativa que adiciona risco ao path vivo sem valor validado.

Quando o primeiro plano multi-step com step irreversivel surgir (ex: "leia o
email X e responda confirmando a reunião" → readEmail + sendEmail), os
requesitos 1-5 acima sao o plano de execucao direto.

## Status

- EI-04 single-step (UI cards): **vivo, confirmado.**
- EI-04 chat-pipeline roteamento single-step: **vivo, confirmado**
  (SESSION-2026-08-07-EI04-CHATPIPELINE-CONFIRMED).
- EI-04 multi-step: **assessado, design registrado, implementacao deferida
  ate caso de uso real.** Bypass permanece conhecido (KNOWN-ISSUES).