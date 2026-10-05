# MISSÃO watch-detector-fix-01 — detector needs_supervisor sem falso positivo

## Contexto

- Hoje (28/09) o detector `needs_supervisor` do plugin mission-ops misfired de novo, 2× medidas: (1) flaggeou `judge-deploy-01` como needs_supervisor DEPOIS da missão fechada (snapshot 14:33 contra close 14:29); (2) snapshots defasados contradisseram panes vivos. Isso dispara o supervisor (caro) à toa e destrói a confiança no snapshot.
- Fixes já diagnosticados e na fila do roadmap:
  1. **Snapshot não pode flaggear missão `closed`** — needs_supervisor só existe para missão `dispatched` com pane vivo.
  2. **`last_content_line` não descarta linhas separadoras** (linhas só de ─/━/═) — missão que terminou limpa com recap final é lida como "recap incompleto" e entra em loop de nudge forever.
  3. **`turn_done` + relatório final em disco + verify.json no cwd = CONCLUÍDO** — o detector deve classificar como fechável/aguardando-close, nunca needs_supervisor.
  4. **Snapshot defasado:** timestamp do evento mais antigo que a última intervenção do supervisor não pode virar flag "AGORA" — anotar `stale` em vez de needs_supervisor.

## Entregável

Fix em `/root/.hermes/plugins/mission-ops/` (código do detector + snapshot):

1. Os 4 itens acima, por patch dirigido (nunca rewrite de arquivo inteiro).
2. **Suíte red→green:** testes novos para cada caso (falso-positive 1–4) — começam vermelhos, ficam verdes com o fix. Suíte completa do plugin rodando verde ao final.
3. **CONTENÇÃO DE MEMÓRIA OBRIGATÓRIA (lição 27–28/09):** a suíte do mission-ops já vazou 4,3G+ (TestDispatch) e derrubou o herdr. Rodar a suíte FULL isolada: `systemd-run --scope --unit=watch-detector-fix-suite` com `MemoryMax` explícito (fora do cgroup herdr), como fez a ledger-hygiene-01. NUNCA rodar a suíte dentro do cgroup herdr.
4. **Carga só no boot:** código de plugin recarrega no restart do processo — declarar no relatório o que precisa de boot para valer (e provar que o plugin carrega sem erro: self-test/imports).
5. **verify.json** no cwd (`/root/.hermes/plugins/mission-ops/verify.json`) — shape canônico do runner (`cmd`/`service`/`file`; `expect_exit`).

## Regras

- Concorrência: a missão vast-volume-watch-01 roda em paralelo em componente próprio — NÃO toque nela; edite por patch dirigido e evite arquivos além do detector/snapshot.
- NÃO fechar/fechar missões no ledger a partir desta missão; NÃO alterar formato do ledger além do detector.
- Comando negado pelo classificador: reporte o comando exato e pare.

## Relatório final

`/root/.hermes/plugins/mission-ops/RELATORIO-watch-detector-fix-01.md` — red→green por caso, suíte full verde, notas de boot. Autoverifique com `engineering.judge.verify`. Feche com `memory.capture`. pt-BR; código/comandos no original.
