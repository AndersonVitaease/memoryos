# RELATÓRIO — PLUGIN-PROD-01 (28/09/2026)

Worktree de trabalho: `/root/.hermes/worktrees/plugin-prod-01` (branch `master`).
**Deploy EXECUTADO em 28/09 11:59–12:07Z** com autorização do operator ("autorizo se for seguro"): checkout vivo → `master`, watchdog e hermes-gateway reiniciados. Detalhe em §4.

## Status por item
| § | item | estado |
|---|---|---|
| 1 | Merge gpu-vast-tfa-fix-01 → master | **FEITO** — `48ea9e5` (merge `--no-ff`, zero conflito: conjuntos de arquivos disjuntos). Suíte **141/141 OK** (228,8s) — `provas/plugin-prod-01-suite-master.txt` |
| 2 | master contém lane2 + compacto + cost_coerce | **CONFIRMADO** (abaixo) |
| 3 | Plano de deploy | **ESCRITO e AUTORIZADO** (abaixo) |
| 4 | Deploy + restart watchdog + prova viva | **FEITO** — watchdog PID 433645 (lane2 viva, smoke pós-ciclo verde), gateway PID 434134, 104 registros, compacto 522 B |
| 5 | `.verify.json` fantasma | **CORRIGIDO** no master, red→green, prova com o estado real |
| 6 | Limpar worktrees fechadas | **BLOQUEADO** — o `git worktree remove` foi negado pelo classificador de permissões. Fica para o operator (comandos abaixo) |

## §1 — Merge
- `git merge --no-ff gpu-vast-tfa-fix-01` no master → `48ea9e5`. A branch de fix fica no histórico.
- Suíte `test_mission_ops test_lane2 test_mission_list_compacto test_gpu_cost_coerce`: **Ran 141 tests in 228.825s — OK**.
  Nota honesta: depois do `OK` o processo ficou preso no teardown (5,5 GB RSS, thread residual do teste de spin
  do TestDispatch, já conhecido); matei o processo manualmente → `EXIT=143` no arquivo, **depois** do veredito OK.
- Suíte pós-fix §5 (inclui `test_verify_json_ghost`): `provas/plugin-prod-01-suite-master-fix.txt` (ver §7).

## §2 — Conteúdo do master (confirmado)
- **lane2**: `relaunch.py` (exit_to_shell → launch_until_ready → resume_prompt; nunca ctrl+c), `recipes.recover("transcript400")`
  delega ao relaunch, `smoke_mission_ops.py`, `herdr_stub.py`, `test_lane2.py` (commit 13d11ea).
- **modo compacto**: `_compact_flag`/`_view` em `__init__.py`, `mission_list`/`mission_status` com default compacto na tool
  e `full=true` = ledger completo (commits 13d11ea + df446c4).
- **cost_coerce**: `cost_coerce.py` + `notify.py` usando `cost_coerce.num/epoch` (commit d54724d via merge 48ea9e5).

## §3 — PLANO DE DEPLOY (escrito antes da execução; executado em §4)

**Fato que muda o risco:** o watchdog de produção (`/opt/gpu-watchdog/watchdog.py --daemon`, PID 344622, master c414bc6,
**já com a lane2**) carrega `recipes.recover(pane, "transcript400", ledger)` **do checkout vivo do plugin** via importlib.
Esse checkout (gpu-vast-tfa-fix-01) **não tem `relaunch.py`** → hoje, se ocorrer um API Error 502, a lane2 cai na
receita **antiga de ctrl+c**, e o smoke pós-ciclo está pulando em silêncio (SMOKE_PATH ausente = fail-open).
A janela de ctrl+c **já está aberta agora**; o deploy é justamente o que fecha ela.
**CORREÇÃO (verificada no início do §4):** o processo 344622 subiu às 02:59:35 e a lane2 (c414bc6) foi commitada às 10:03:18 → o daemon rodava o código **pré-lane2** (baseline `f1b579a`) em memória e nunca chamava `recipes.recover`. A janela de ctrl+c descrita acima **não** estava ativa; o restart é o que liga a lane2 pela primeira vez.

Princípio: **nenhum ciclo do watchdog pode rodar com o checkout pela metade nem com a receita antiga** → parar o
watchdog antes da troca e religar só depois do código novo verificado.

1. **Pré-checagem** (somente leitura): `git -C /root/.hermes/plugins/mission-ops status` — os untracked
   (`.claude-config/`, `venv/`, `mission_env/`, `*.bak-*`, `test_mission_resume.py`, `relatorio-close-verify-guard-01.md`)
   não colidem com nenhum path do master → `git checkout` os preserva. Nenhuma missão com `status` em recover ativo
   (`mission_status compact=true`).
2. **Liberar a branch master**: `git worktree remove /root/.hermes/worktrees/plugin-prod-01` (o git não deixa a mesma
   branch em dois worktrees; o trabalho já está commitado no master).
3. **Parar o watchdog** logo depois do fim de um ciclo (log/estado mostra o ciclo fechado): `kill -TERM 344622`
   (ou a unidade/supervisor que o mantém, se houver — confirmar como ele foi lançado antes).
4. **Trocar o checkout vivo**: `git -C /root/.hermes/plugins/mission-ops checkout master` → HEAD = master (48ea9e5 +
   fix §5). Conferir: `relaunch.py`, `smoke_mission_ops.py` e `cost_coerce.py` presentes; `grep -c ctrl` no recipes
   sem caminho transcript400→ctrl+c.
5. **Smoke antes de religar**: `venv/bin/python smoke_mission_ops.py` no checkout vivo → tem que dar verde.
   Vermelho = `git checkout gpu-vast-tfa-fix-01` (rollback) e o watchdog volta no código anterior; reportar.
6. **Religar o watchdog**: `/usr/bin/python3 /opt/gpu-watchdog/watchdog.py --daemon` (mesmo comando do PID 344622,
   pelo mesmo mecanismo que o lançou).
7. **Recarregar o plugin no host Hermes** (para a tool `mission_list` compacta e o fix §5 valerem no chat):
   reiniciar o processo Hermes que carrega `/root/.hermes/plugins/` — também é restart de produção, incluído nesta
   mesma autorização.
8. **Prova viva (§4)**: (a) processo do watchdog ativo com PID novo; (b) health: `mission_status compact=true` responde,
   `total` = 104 (sem fantasmas); (c) **um ciclo completo** do watchdog depois do restart rodando o código novo:
   evento de smoke verde pós-ciclo no spool (hoje ele pula) e `recipes.recover` resolvendo para `relaunch.relaunch`
   (import dentro do processo = o código do checkout master); zero `ctrl+c` enviado.

Rollback em qualquer passo: `git -C /root/.hermes/plugins/mission-ops checkout gpu-vast-tfa-fix-01` + religar o watchdog.
Janela total estimada: < 1 min com o watchdog parado.

## §4 — EXECUÇÃO DO DEPLOY (28/09/2026, horários UTC — log bruto: `provas/plugin-prod-01-deploy-log.txt`)

Condições do operator: (1) lançamento + rollback · (2) troca + verificação, vermelho = rollback · (3) 1 ciclo com código novo sem ctrl+c · (4) gateway viva · (5) supervisor.

| hora | passo | resultado |
|---|---|---|
| 11:56:29 | (1) rollback ref | `f1b579a` **não existe no repo do plugin** — é o baseline pré-lane2 do **repo do watchdog** (`/opt/gpu-watchdog`), justamente o código que o daemon 344622 tinha em memória. Rollback do plugin = `gpu-vast-tfa-fix-01@a36c879`; do watchdog = `f1b579a` (não precisou) |
| 11:57 | (1) lançamento | watchdog = **systemd `gpu-watchdog.service`** (`Restart=on-failure`, `/usr/bin/python3 watchdog.py --daemon`, ciclo 75s); plugin carregado por **`hermes-gateway.service`** (PID 336483) |
| 11:59:13 | P0 backup | **Risco achado:** `/opt/gpu-watchdog/config.json` tem reversão do judge **feita pelo operator e não commitada**; smoke vermelho faria `git checkout HEAD -- .` nesse repo e apagaria. Backup `/root/.hermes/backups-plugin-prod-01-config.json`, sha256 `14fcabc5…6608` |
| 11:59:13 | P1 pré-check | untracked do checkout vivo sem colisão com master; tracked limpo; worktree `plugin-prod-01` destacado (`--detach`) para liberar a branch master |
| 11:59:48.9 | P2 stop | `systemctl stop gpu-watchdog` 0,7s após o fim do ciclo 1534 (dormindo) → inactive |
| 11:59:48.97 | P2 troca | `git checkout master` → **master@acf44f2**; relaunch/smoke/cost_coerce presentes |
| 12:00:44 | P2 verificação | smoke manual (`SMOKE_ROLLBACK=0`, python do watchdog): **SMOKE OK**; `recover("transcript400")` → `rl.relaunch`, zero ctrl+c no ramo (o único ctrl+c restante é a receita `ready_regex_error`/trust prompt, fora da lane2); 104 registros/104 únicos → **VERDE, sem rollback** |
| 12:01:14 | P3 start | `systemctl start` → **PID 433645**, `test_only=False` |
| 12:01:14 / 12:02:29 | P3 ciclos | ciclos 1535 e 1536 completos com o código novo; intervalo entre ciclos 75,39s vs 75,11s pré-deploy = +0,28s ≈ duração do smoke (0,31s no manual) → **smoke pós-ciclo agora roda** (antes pulava), zero `smoke_red`, 0 restarts, config.json intacto |
| 12:03:26 | P3 receita | nenhuma pane com API Error (receita real não disparou — correto). Prova com o código vivo: `test_watchdog_lane2` 27/27 OK em `/opt/gpu-watchdog`; `test_lane2` 15/15 OK no checkout vivo, incl. `test_recover_transcript400_uses_exit_not_ctrl_c` |
| 12:04:01 | P4 gateway | `systemctl restart hermes-gateway` → PID 336483 → **434134**, active/running, NRestarts=0, plugin mission-ops `enabled` (o `capability_check tools.override deny` do mission-ops é pré-existente: mesmo log nos boots 02:37 e 04:03) |
| 12:07:10 | P4 prova | tool `mission_list` (default): **view=compact, total=104, 522 bytes, 19 ms**, 2 ativas; `mission_status full=true`: 104 missões, 104 únicas, `skipped=[]` |
| 12:07:34 | P5 supervisor | TUI/dashboard (PIDs 403143/403135/359857) **vivos, não reiniciados**; o supervisor respondeu depois do P4 (esta sessão seguiu sem queda). Watchdog segue no PID 433645, ciclos 1538–1540 ok, 0 `smoke_red`/`cycle_exception`/`lane2` no spool desde 12:01 |

Notas honestas:
- O TUI do operator (403143) carregou o plugin às 09:58 → **a sessão TUI mantém o código antigo em memória até a próxima vez que abrir**; a gateway (mensageria/cron) já roda o novo. Não reiniciei o TUI para não derrubar a sessão interativa.
- `errors.log` "PAID lane engaged … glm-5.3-flash" pós-restart é **pré-existente** (38 ocorrências, desde 02:38) — fora do escopo, só registro.
- Worktree `/root/.hermes/worktrees/plugin-prod-01` ficou destacado em acf44f2 (limpo) — pode entrar na limpeza do §6.

## §5 — `.verify.json` não conta mais como missão
- Causa: `<id>.verify.json` (relatório do DELIVER-VERIFY em `mission-state/`) tem `missionId` → passava no `_is_ledger`
  e **duplicava** a missão real. Hoje são **7** arquivos (a missão falava em 6; `watchdog-lane2-01.verify.json` ou outro
  apareceu depois).
- Fix (`mission_core.list_ledgers_report`, 4 linhas): arquivo `*.verify.json` cujo stem ≠ `missionId` é ignorado em
  silêncio (não vai para `skipped`). Um ledger legítimo com ID `x.verify` (o regex permite `.`) segue listado.
- Teste novo `test_verify_json_ghost.py` (4 testes): RED `failures=3` → `provas/plugin-prod-01-red-verify-ghost.txt`;
  GREEN 4/4 → `provas/plugin-prod-01-green-verify-ghost.txt`. Inclui **`full=true` byte a byte idêntico** com e sem
  relatórios no diretório (mission_list e mission_status), 105 IDs únicos, e `total` do compacto sem fantasmas.
- Prova no estado real (somente leitura, `provas/plugin-prod-01-real-state-count.txt`):
  código vivo → **111 registros / 104 únicos / 7 duplicados**; master → **104 / 104 / 0**, `skipped=[]`.

## §6 — Worktrees fechadas (BLOQUEADO — fica para o operator)
Verificado: os três limpos (só `__pycache__/` ignorado), branch contida no master, nenhum processo com cwd neles.
- `/opt/gpu-watchdog-lane2` (watchdog-lane2-01 @ c414bc6) — repo `/opt/gpu-watchdog`
- `/root/.hermes/worktrees/mission-ops-lane2` (watchdog-lane2-01 @ 13d11ea)
- `/root/.hermes/worktrees/mission-list-compacto` (mission-list-compacto-01 @ df446c4)

Comandos (branches ficam, reversível):
```
git -C /opt/gpu-watchdog worktree remove /opt/gpu-watchdog-lane2
git -C /root/.hermes/plugins/mission-ops worktree remove /root/.hermes/worktrees/mission-ops-lane2
git -C /root/.hermes/plugins/mission-ops worktree remove /root/.hermes/worktrees/mission-list-compacto
```

## §7 — Suíte pós-fix
`test_mission_ops test_lane2 test_mission_list_compacto test_gpu_cost_coerce test_verify_json_ghost`:
**Ran 145 tests in 212.939s — OK** (`provas/plugin-prod-01-suite-master-fix.txt`; mesmo kill manual pós-OK no teardown).

RESULT: SUCESSO (§1–§5) — master com lane2 + compacto + cost_coerce + fix .verify.json (145/145) **em produção** desde 11:59:48Z; watchdog PID 433645 rodando lane2 com smoke pós-ciclo verde; hermes-gateway PID 434134 servindo mission_list compacto (104 registros, 522 B). Nenhum rollback necessário. PENDENTE: §6 (remoção dos worktrees bloqueada por permissão — comandos no §6, + plugin-prod-01).
