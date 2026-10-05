# MISSION-BATCH-01 — DESPACHO EM LOTE DETERMINÍSTICO + READY FAIL-FAST

Problema provado ao vivo (29/09): despachar N missões pelo supervisor Hermes = N×(turno LLM + 1-2min de handler síncrono) + cancelamentos no meio (operator) deixam fantasmas `dispatching` sem pane (3 casos hoje). Todo o caminho do dispatch/recover/close/watch é I/O puro — ZERO motivo para LLM no loop.

## Contexto técnico (o que já existe)
- `/root/.hermes/plugins/mission-ops/__init__.py`: handlers são funções importáveis puras (`handle_mission_dispatch(args)` etc.) — PROVADO: canário despachado via `python3 -c "...handle_mission_dispatch({...})"` sem LLM no caminho.
- Fix do dia (dispatch-fast-03, já no disco): sonda E2E `_qwen_bridge_alive()` (health + upstream /v1/models, 2s), fallback 8103, worker_model da unit systemd. Suíte 236/236 verde.
- O ready-loop do dispatch ainda espera 180s (`_deadline = time.time() + 180`) mesmo com a ponte morta detectada em 0,16s.
- O gateway hermes roda o plugin em memória — mudanças no disco só valem pós-restart do gateway (consequência externa: NÃO restartar neste escopo; a ativação fica com o operator/supervisor no close).

## Entregáveis (em /root/.hermes/plugins/mission-ops, branch de missão)
1. **`mission_batch`** — novo handler + registro no catálogo:
   - Entrada: manifesto JSON/YAML com lista `{missionId, promptFile, cwd, consequence?}` (2-6 missões).
   - Executa `handle_mission_dispatch` para cada um, SEQUENCIAL (o herdr é single-writer) mas em UMA chamada; tolera falha individual (continua a lista; resultado por item: ok/erro/fantasma-limpo).
   - Anti-fantasma embutido: se o ledger do missionId já está em `dispatching`/`failed`/`interrupted` com pane morto (pane_exists=False), marca `cancelled` (reason automática) e re-despacha no mesmo lote — o que hoje eu faço à mão em 3 turnos.
   - Saída: JSON resumo {despachadas, falhas, tempo total, tempo por missão}.
2. **Ready fail-fast no dispatch**: se `_qwen_bridge_alive()` == False, o deadline do ready-loop cai de 180s para 45s (claude local não tem ponte para esperar) — missão no caminho OpenRouter fica pronta em <60s provado.
3. **Provas red→green**:
   - Unit: lote de 3 missões fake (TempState, sem herdr real) → 3 despachos sequenciais, tolerância a 1 falha, anti-fantasma convertendo 1 ledger morto; saída resumo correta.
   - E2E real: 1 lote com 2 canários descartáveis (prompts triviais de 1 linha em /tmp) — provar tempo total e que os 2 panes ficaram vivos/working; fechar os canários com acceptUnverified ao fim.
   - Suíte completa do plugin continua verde (236+ novos).
4. **Relatório**: RELATORIO-mission-batch-01.md no cwd — tabela {caminho, antes (turnos LLM × tempo), depois (1 chamada)} + instrução de ativação (restart do gateway no close, pelo supervisor Hermes).

## Guardas ineguiáveis
- Zero restart do gateway Hermes (ativação pós-close é do supervisor/operator).
- Judge do gpu-watchdog = JEV (intocado); or-worker-bridge 8103 = produção (nunca stop/disable).
- Zero create/destroy vast; zero push/merge.
- O lote NÃO paraleliza writes no herdr (sequencial dentro da chamada) — governança do single-writer mantida.
- Custos: zero (tudo local); gpt-oss-120b nos canários = centavos; registrar credits ANTES/DEPOIS.

## Provas obrigatórias no verify.json (padrão MANIFEST_META_KEYS + cmd)
- unit suite do batch verde; suite completa verde; E2E lote real provado (tempos no resumo).