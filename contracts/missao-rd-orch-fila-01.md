# MISSÃO RD-ORCH-FILA-01 — ROADMAP.md como fonte de fila do orquestrador (roadmap→fila determinística)

**Componente:** eng-mcp (orchestrator consume) + mission-ops · **Prioridade:** 1 · **Autoria:** operator 04/10 ("sim") ao desenho no chat

## Problema (fonte: conversa operator 04/10; ROADMAP.md v1.1; ORCH-QUEUE-PROMOTE-01/QUEUE-CONSUMER-01)

O ROADMAP.md é dado rico (23+ linhas RD-* com ID, escopo, dependências, prioridade, estado) mas o orquestrador só consome `orchestrator-queue.jsonl`. A ponte é manual: supervisor lê roadmap e enfileira com contrato. Resultado: fila órfã de demanda ("não está enviando missões") com backlog cheio.

## Entrega (desenho aprovado pelo operator)

1. **Schema no ROADMAP.md**: cada linha RD-* ganha campo `fila: sim|nao|gate-operator` + `dependsOn:` (IDs). Política padrão APROVADA: P1/P2 de código e telemetria = `fila: sim`; itens que tocam credencial/repo externo/produção/ship = `gate-operator`; dívidas de conduta (DT-*) = `fila: sim` (viram guards em código); `aguarda-operator` continua estado legítimo (WOOBA-02 pattern). Regra de fronteira: mutação de consequência NUNCA sai do roadmap sem `gate-operator`.
2. **Consumer roadmap no ciclo do daemon (zero-LLM, determinístico)**: a cada ciclo, o consume varre ROADMAP.md como fonte secundária de fila: promove `fila: sim` + `estado: pendente` + dependências satisfeitas, respeitando prioridade e serialização por componente (mesma fila, mesmos guards). Dedupe por ID contra o ledger — RD-* com ledger closed/cancelled/dispatched NUNCA re-despacha (idempotência já existente).
3. **Promoção gera intent com contrato gerado por template determinístico**: para linha RD-* sem contrato próprio, o template do consumer gera prompt a partir do escopo citado na linha (fonte obrigatória), worktree do componente, e marca `spawnedBy: roadmap-fila`. Linha COM contrato existente (missao-rd-*.md) usa o contrato direto.
4. **Retroalimentação no close**: mission_close atualiza a linha RD-* correspondente (estado → resolvido + commit + fonte) — manter compatível com a prova P5 do ROADMAP-CONSOLIDADO-01 (estado↔disco). Se a linha não existir, registrar `unmapped-rd` tipado (sem falhar o close).
5. **Fail-safe**: `fila: gate-operator` entra APENAS por intent explícita (ordem operator via token/chat_id ou comando direto); `aguarda-operator` nunca é tratado como bug; kill switch `ROADMAP_QUEUE=off`; telemetria: cada promoção da fonte roadmap tipada no spool (origem, linha, dedupe result).

## Provas (reais, antes de gravar)

- Prova determinística: ROADMAP fixture com 5 linhas (2 fila:sim pendentes, 1 gate-operator, 1 fechada, 1 aguarda-operator) → 1 ciclo promove exatamente 2, na ordem de prioridade; re-ciclo = 0 promoção (dedupe idempotente).
- Prova de fronteira: linha gate-operator nunca gera intent sem ordem explícita (prova negativa).
- Prova E2E: enfileirar de fato 1 item P1 pendente existente (RD-SEC-01) via o novo caminho e vê-lo working — primeiro item da história "roadmap = fila".
- Suítes do eng-mcp íntegras + verify.json tipado + verify.py pass + RELATÓRIO pt-BR íntegra (RELATÓRIO-INTEGRA + mission_report_ack).

## Restrições

- Só o caminho roadmap→fila + close↔roadmap. Nada de execução de missões pelo supervisor. Ship via missão SHIP própria (janela de deploy respeitada).
- O consumer é zero-LLM: parser + regras determinísticas (regex/JSON), nada de julgamento de conteúdo no ciclo.
- Dif de código pequeno e honesto; se o parser de markdown provar frágil, migrar o roadmap para `ROADMAP.json` com MD gerado — decisão do worker com justificativa, registre como dívida RD-* se adiar.