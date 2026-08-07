# SESSION 2026-08-07 — EI-04 chat-pipeline CONFIRMADO VIVO (correção do registro "deferido")

**Para quem está lendo isto:** este documento CORRIGE o registro anterior (`SESSION-2026-08-07-EI04-IRREVERSIBLE-CALLER-MIGRATION.md`, seção 2 "NÃO existe") e a seção "continuação 7" do `CLAUDE.md`, que afirmavam que o roteamento de irreversíveis do chat-pipeline pelo `processCapability` estava "deferido" e que o `ConversationPipeline` seguia "100% intocado". **Isso estava incorreto.** A migração single-step do chat-pipeline está **viva em produção**, confirmada pelo usuário no preview ("atualmente ele já informa que é uma ação irreversível").

**Leia também:**
- `SESSION-2026-08-07-EI04-IRREVERSIBLE-CALLER-MIGRATION.md` — os cards Gmail (compose/reply/forward) via `IrreversibleCaller`. Ainda válido para aquela frente; só a seção "próxima fronteira" deste doc está obsoleta.
- `src/docs/foundation/rfc/RFC-008-Execution-Intelligence-Engine.md` e `ADR-015.md` — a RFC e a decisão arquitetural.

---

## 1. Estado real confirmado (código + usuário)

O `ConversationPipeline.ts` **já roteia planos single-step** (a maioria absoluta dos goals de connector) pela cadeia Execution Intelligence:

```
Planner → plan.steps.length === 1
        → getExecutionRuntime().processCapability(req)
        → SafetyGate.guard()
            ├ safe/reversible     → approved → dispatch direto
            └ irreversible sem confirmedByUser
                                    → needs_confirmation
                                    → requestConfirmation (RuntimeConfirmationEngine)
                                    → ConfirmationProvider poll-bridge surfaceia dialog na UI
                                    → usuário confirma → 2ª chamada processCapability({confirmedByUser:true}) → dispatch
                                    → usuário cancela → short-circuit "Ação cancelada pelo usuário"
        → outcomeToExecutionResult / outcomeToFailedResult (outcomeAdapter.ts, compartilhado)
```

- **Local exato:** `src/lib/conversation-platform/ConversationPipeline.ts`, linhas ~917-1015 (bloco "EI-04 (main pipeline): single-step plans passam pela cadeia Execution Intelligence + Safety Gate").
- **Falha honesta:** se o dispatch irreversível confirmado FALHA, o erro real é streamado direto e o LLM (Producer C) NÃO pode alucinar "enviado" por cima do erro (linhas ~1001-1015). Causa raiz de "email enviado sem chegar" eliminada.
- **Fallback defensivo:** se o outcome do EI for `failed` com `/Unknown connector/` (registry do EI não populado / race de bootstrap), nulifica e cai no `_realEngine.execute` provado (linhas ~965-968) — nunca hard-fala por bug de infraestrutura.
- **Multi-step e exceptions:** caem no `_realEngine.execute(plan)` original (linha ~992).

**Caminho multi-intent** (`ConnectorGoalIntentExecutor.ts`, linhas ~117-172): mesmo padrão, já migrado — single-step roda por `processCapability` + `requestConfirmation` + re-dispatch `confirmedByUser`.

**Validação do usuário (preview, 2026-08-07 ~18:09):** ao acionar uma capability irreversível pelo chat, o dialog de confirmação aparece ("atualmente ele já informa que é uma ação irreversível"). Ponta a ponta confirmado.

## 2. Por que o registro anterior estava errado

A seção "continuação 7" do `CLAUDE.md` e a seção 2 do session doc anterior foram escritas na janela da migração dos **cards Gmail**. Naquele momento o chat-pipeline estava, de fato, intocado. A migração do chat-pipeline single-step foi implementada numa janela **posterior** (entre a "continuação 8" e agora) que não atualizou o CLAUDE.md nem o session doc — daí o registro defasado. Este doc corrige o histórico.

## 3. O único gap real restante

**Planos multi-step com steps irreversíveis** caem no `_realEngine.execute(plan)` direto (linha ~992), bypassando o SafetyGate. Cenário raro: exige um goal cujo Planner produza 2+ steps encadeados onde pelo menos um é irreversível (ex hipotético: "busque os emails não lidos e me envie um resumo" = `searchEmails` + `sendEmail`). A maioria dos goals de connector é single-step (uma capability = um step). Composite `deepResearch` tem handling próprio (linhas ~1024+) e não é irreversível.

**Semântica delicada:** confirmar um plano multi-step inteiro vs. confirmar cada step irreversível individualmente antes da execução — decisão de produto ainda aberta. Nenhum caso real de uso levantado até agora; atacar sem caso real é prematuro.

**NÃO é gap (correto por design):** Watch/scheduled/agendamento despacha direto, sem dialog. O Watch foi explicitamente autorizado pelo usuário ao criá-lo; automação não pode abrir dialog interativo.

## 4. Nenhum código alterado nesta sessão

Apenas documentação. A funcionalidade já estava viva. Mudar código seria retrabalho desnecessário e arriscado. O registro foi corrigido para que agentes futuros não reinventem o que já existe.

## 5. Recomendação para o próximo agente

- Antes de "implementar EI-04 do chat-pipeline", **verifique `ConversationPipeline.ts` linhas ~917-1015** — provavelmente já está lá.
- Se for estender a planos multi-step, abra um caso de uso real primeiro (sem caso real, a semântica de confirmação parcial é especulação).
- Mantenha o fallback defensivo (`Unknown connector` → `realEngine`) — o registry do EI pode não estar populado em races de bootstrap.