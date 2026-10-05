# missao-rd-dispo-01 — Isolamento estrutural de missões (worktree + lease + scheduler)

**Prioridade:** P1 (na frente da fila — habilita o despacho automático seguro)
**Data:** 05/10/2026 · **Componente:** mission-ops (dispatch/close) + orchestrator-consumer
**Fonte:** operator 05/10 — "isso não vai funcionar, precisamos de algo mais robusto" (após colisão de edição concorrente OBEY-02 × MOPS-RED-01 no mesmo plugin)

## Problema

Missões concorrentes editam os MESMOS arquivos (cwd compartilhado = o repo do
plugin). Hoje a contenção é manual (pausa ordenada pelo supervisor) — curativo,
não mecanismo. O despacho automático (consumer reativado) amplifica o risco.

## Entregas

1. **Worktree obrigatório no dispatch**: toda missão despachada (plugin e
   consumer) roda em `git worktree` PRÓPRIO (caminho por missão, registrado no
   ledger); cwd do trabalho = worktree; main intocada durante a execução.
   Fecho com merge worker→main.
2. **Lease de componente**: registry `component-leases.json` (state dir) —
   componente → {missionId, acquiredAt, TTL 6h, heartbeat no watch}. Dispatch
   com componente em lease ativo de OUTRA missão = recusa tipada
   `COMPONENT_LEASED` + reenfileiramento automático (staggering). Lease
   expira sem heartbeat (crash-safe).
3. **Merge gate no fecho**: close só integra com (a) suíte COMPLETA verde no
   worktree, (b) rebase fresco de main sem conflito, (c) verify REAL. Conflito
   de merge = missão reaberta com evento tipado `merge_conflict` — nunca
   auto-resolve, nunca force.
4. **Scheduler por componente**: consumer agrupa intents por componente
   (campo `component` do contrato); dentro do grupo despacha em SÉRIE
   (próxima só após fecho/liberação do lease); entre grupos, paralelo.

## Regras

- Nada bloqueia operação além do necessário: recusa é TIPADA e a fila reage
  sozinha (reenfileira) — o operator não precisa intervir para "dar prioridade".
- Worktree é limpo no fecho (só se commitado — nada se perde).
- Suíte do plugin + consumer verde ANTES de qualquer go-live.
- **Soak obrigatório** (regra do CLAUDE.md): shadow do scheduler+lease ≥2h em
  paralelo com o despacho atual antes de assumir.

## Provas

- E2E: duas missões com o mesmo componente despachadas juntas → a 2ª recebe
  `COMPONENT_LEASED` e é reenfileirada; com componentes distintos → paralelo.
- Crash-test: worker morre com lease ativo → TTL expira → próximo despacha.
- Merge com conflito simulado → reabertura tipada, main intocada.

## Achado 05/10 16:41 (crash-loop real do consumer — 2 defeitos estruturais)

5. **Promoção só após pane confirmado + timeout em TUDO que chama fora**:
   o consumer gravava o ledger `dispatching` ANTES de criar o pane; a criação
   de pane travava, o watchdog systemd (120s) matava o processo, systemd
   reiniciava — **crash-loop** (restart counter 9) criando 5 ledgers-ghost.
   Correção: (a) subprocess com timeout em TODA chamada externa (herdr, plugin);
   (b) ledger só grava `dispatching` APÓS pane existir (verificação
   `pane list` pós-criação); falha → recusa tipada `PANE_CREATE_TIMEOUT` +
   reenfileira, nunca ledger-ghost.
6. **Calibração do loop breaker contra falso-positivo**: catch-up legítimo
   (5 promoções em 15min após fila parada) re-armou o breaker logo após o
   reset. Correção: breaker só arma com **3 janelas consecutivas** acima do
   limiar E promoções sem consumo correspondente da fila (progresso real),
   não por burst isolado.

## Dívida que resolve

- Colisão de edição concorrente (observada 05/10) — fecha a classe.
- Scheduler por componente organiza a fila atual (~13 intents).
