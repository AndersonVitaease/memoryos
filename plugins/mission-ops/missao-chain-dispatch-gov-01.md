# MISSÃO chain-dispatch-gov-01 — governança de despacho em cadeia (spawned_by + limite de profundidade)

## Contexto

- Incidente medido 27/09 (roadmap): o worker do retry-pane da model-swap-01 (w4:p11) despachou 2 sub-missões por conta própria (gpu-bridge-e2e-fix-01, load-ledger-fix-01) para destravar o próprio E2E. Ambas legítimas, mas sem rastro: o ledger não registra QUEM despachou, não há limite de profundidade, e um worker pode despachar worker em cadeia sem badge — brecha de governança (benigna na época, brecha ao mesmo tempo).
- Componente: `/root/.hermes/plugins/mission-ops/`. Estado: HEAD com os commits de hoje (watch-detector-fix-01: dc59b64/6b7397e/f3b9b86; verify-manifest-01: 6307881/7857646/8edc0d9). Confirme `git status`/HEAD antes de editar; **patch dirigido, nunca rewrite de arquivo inteiro**.

## Entregáveis

1. **`spawned_by` no ledger:** toda missão gravada carrega o missionId do despachante (worker→worker) ou `operator`/`supervisor:hermes` conforme o emissor. Ledger existente: campo opcional, retrocompatível (ausente = despacho normal).
2. **Limite de profundidade:** cadeia worker→worker→worker bloqueada por padrão (profundidade máx. 1, configurável em config.yaml: `mission.chain_depth_max`). Excedeu → recusa determinística com mensagem clara (tier-1, zero LLM).
3. **Recusa worker→worker sem badge:** worker só despacha sub-missão se a missão dele declarar a permissão no prompt (chave `allow_chain_dispatch: true`); sem ela, `mission_dispatch` recusa citando a missão de origem. Despachos do supervisor e do operator nunca são afetados.
4. **Trilha:** todo despacho (aceito ou recusado por cadeia) grava evento no bus/spool com `spawned_by`, profundidade e veredito.
5. **Provas red→green:** (a) worker sem badge despacha → recusa com trilha; (b) worker com badge despacha → aceito, spawned_by no ledger; (c) neto (profundidade 2) → recusa; (d) supervisor despacha normalmente (regressão zero); (e) ledger antigo sem campo carrega sem erro (regressão do loader).
6. **Suíte full ISOLADA (regra MEM-GUARD, obrigatória):** `systemd-run --scope --unit=chain-dispatch-suite -p MemoryMax=2G` — NUNCA no cgroup herdr. Verde ao final (hoje: 171/171).
7. **verify.json** no cwd — shape canônico do runner (`cmd`/`service`/`file`, `expect_exit`). Se preferir, gere com a tool nova `mission_verify_author` (dogfood — ela acabou de entrar em produção) e revise o diff antes de gravar.

## Regras

- Restart do gateway para ativar = SUPERVISOR na ativação; prove imports + self-test e deixe o boot declarado.
- Concorrência: volume-cache-awq-01 (w5:p0) e health-sentinel-fix-02 (w5:p1D) vivas — NÃO as toque; NÃO edite /opt/gpu-watchdog nem /opt/vast-volume-watch.
- A tool cost fix do mission_close está na fila DEPOIS desta missão — não pegue esse trabalho (evite entulhar os mesmos arquivos).
- Sem push; sem registry/tokens; comando negado pelo classificador → reporte o comando exato e pare.
- Diretriz de foco: escopo técnico é seu — decida e siga; pare só para consequência/credencial/orçamento. Se perder o contrato: `cat /root/.hermes/plugins/mission-ops/missao-chain-dispatch-gov-01.md` via Bash.

## Relatório final

`/root/.hermes/plugins/mission-ops/RELATORIO-chain-dispatch-gov-01.md` — red→green por caso, suíte full isolada verde, RESULT real sem placeholder. Autoverifique com `engineering.judge.verify`. Feche com `engineering.memory.capture`. pt-BR; código/comandos no original.