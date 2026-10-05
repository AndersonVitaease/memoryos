# MISSÃO verify-manifest-01 — autor de verify.json no mission_verify

## Contexto

- Hoje (28/09) duas missões de consequência fecharam como `closed_unverified_consequence` (oom-health-01, cron-doctor-01) porque não havia verify.json no cwd e o DELIVER-VERIFY inferiu bateria ERRADA (ex.: checou `oom-e2e-neighbor.service`, artefato de teste inativo por design → vermelho falso). O supervisor teve que fechar com motivo auditável na mão.
- A prática "autorar o manifesto supervisor-side" existe como receita manual (espelhar verify.json de missão verde, ex.: `/opt/gpu-watchdog/verify.json`). Queremos tool.
- O runner DELIVER-VERIFY é `/opt/deliver-verify/verify.py`; shape canônico do manifesto: chaves de topo = tipos de prova (`{"cmd":[...],"service":[...],"file":[...]}`), service spec com `unit`/`expect:"active"`, cmd spec com `expect_exit`, file spec com `path`/`min_bytes`.
- Componente: `/root/.hermes/plugins/mission-ops/` (acabou de receber a watch-detector-fix-01 — commits dc59b64/6b7397e/f3b9b86; verifique o HEAD antes de editar e trabalhe por patch dirigido).

## Entregável

Nova operação no mission_verify (ou tool irmã `mission_verify_author`) que GERA o manifesto:

1. **Entrada:** missionId. **Fontes de prova, em ordem de prioridade:** (a) blocos de prova do relatório da missão (`RELATORIO-<id>.md` / `relatorio-<id>.md` no cwd) — parsear commandos/outputs/arquivos citados; (b) declarações de aceite do prompt (`missao-<id>.md`); (c) fallback heurístico do runner atual.
2. **Saída:** `verify.json` no cwd, com cada spec preenchida de prova REAL extraída (cmd com `expect_exit`, service com `unit`+`expect`, file com `path`+`min_bytes`) e um campo `_provenance` por item (`report|prompt|inferred`) — nunca inventar spec sem fonte.
3. **Fluxo seguro:** geração NÃO sobrescreve verify.json existente sem flag explícita (`--force`); sempre mostra diff do manifesto proposto no relatório antes de gravar; `mission_verify` imediatamente após a geração para validar (red→green natural: manifest errado = checks vermelhos).
4. **Testes red→green:** casos novos — geração a partir de relatório real (use a judge-deploy-01 como fixture: relatório + verify.json já existem), sem relatório (recusa honesta), sobrescrever sem --force (recusa), provenance correto. Suíte full do plugin verde ao final.
5. **CONTENÇÃO DE MEMÓRIA OBRIGATÓRIA:** suíte full SEMPRE isolada em `systemd-run --scope --unit=verify-manifest-suite -p MemoryMax=2G` (fora do cgroup herdr). NUNCA dentro do herdr.
6. **Carga:** código de plugin carrega no boot — o supervisor reinicia o gateway na ativação (não reinicie você); prove apenas imports + self-test.

## Regras

- NÃO altere o formato do ledger nem o runner `/opt/deliver-verify/verify.py` além do que a integração exigir; prefira adapter no plugin.
- Concorrência: volume-cache-awq-01 (w5:p0) e vast-volume-watch-01 (w5:p1A) vivas — não as toque; patch dirigido só no mission-ops.
- Sem push; sem registry/tokens; comando negado pelo classificador → reporte o comando exato e pare.
- Diretriz de foco: perguntas de ESCOPO TÉCNICO são suas — decida e siga; pare só para consequência externa/credencial/orçamento.

## Relatório final

`/root/.hermes/plugins/mission-ops/RELATORIO-verify-manifest-01.md` — red→green por caso, suíte full verde isolada, exemplo real de geração (judge-deploy-01), RESULT sem placeholder. Autoverifique com `engineering.judge.verify` (judge agora aponta :8102). Feche com `memory.capture`. pt-BR; código/comandos no original.
