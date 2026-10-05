# RELATÓRIO — WATCHDOG-LANE2-01: AUTO-RECUPERAÇÃO DETERMINÍSTICA (LANE 2)

Data: 2026-09-28. Branches:
- watchdog: `/opt/gpu-watchdog-lane2`, branch `watchdog-lane2-01`
- mission-ops: `/root/.hermes/worktrees/mission-ops-lane2`, branch `watchdog-lane2-01`

## Resumo

A Lane 1 (watchdog 02/02b) DETECTA os 4 modos de parada observados em 27/09 e
escalada ao supervisor, que intervence à mão. Esta missão entrega a **Lane 2:
intervenção determinística, zero LLM**, como código:

| Modo de parada | Intervenção |
|---|---|
| 502/API-error (transcript envenenado) | receita `transcript400` reescrita: `/exit` → polling-ready (`❯`/`auto mode on`) → `claude` novo com `CLAUDE_CONFIG_DIR` → prompt de retomada por estado no disco — padrão provado 4x em 27/09. NUNCA ctrl+c (receita quebrada), NUNCA `--resume` |
| Diálogo de permissão parado | Enter determinístico (default "Yes"); persistindo após N Enters = escalada honesta |
| Shell pós-morte / OOM (agente ausente) | escalada honesta após N ciclos — nada é digitado às cegas |
| stopask / cat-loop persistidos | continuam escalando (Lane 1) e agora também entram na pipeline mission-notify |

`test_only` passou a **False** no default: intervenção real, não simulação.

## Arquitetura (o que mudou onde)

**mission-ops** (worktree `mission-ops-lane2`; mudanças = módulo novo + AST-adendo,
nenhum arquivo reescrito):
- `relaunch.py` (novo): a receita de relaunch completa — `exit_to_shell`,
  `claude_command`, `launch_until_ready`, `resume_prompt`, `relaunch`. Liveness
  honesta: `recovered` só com ready visto no pane; never-ready = falha honesta
  com `elapsed_s` e motivo.
- `recipes.py`: `recover("transcript400")` delega ao relaunch (`exit_first=True`)
  — o ctrl+c antigo morreu.
- `__init__.py`: modo compacto em `mission_list`/`mission_status` (`compact=true`
  opt-in; só não-closed + contadores; default intacto).
- `smoke_mission_ops.py` (novo): sanity pós-turno (import + unittest-smoke de
  mission-ops e gpu-watchdog). Vermelho = rollback no ato (`git checkout HEAD
  -- .`, só tracked; untracked nunca tocado) + eventos `smoke_red`/
  `smoke_red_rollback` no spool — rollback ≤ 1 ciclo do watchdog.
- `herdr_stub.py` (novo): pane sintético (máquina de estados shell/first_run/
  ready/working/api_error/permission) + FakeClock — fixtures dos testes, zero
  produção.

**watchdog** (worktree `gpu-watchdog-lane2`; mudanças = AST-adendos em
`watchdog.py` + arquivo de testes novo):
- Detectores: `detect_api_error` (API Error parado no pane, guard contra eco do
  próprio supervisor), `detect_dialog` (PERM_DIALOG_RE na cauda), contadores de
  absent por missão no state (`api_error_cycles`, `dialog_enters`, `absent_cycles`).
- `decide_actions`: api_error e dialog ANTES do ladder idle/stopask (nudge
  educado não resolve transcript envenenado); absent após N ciclos.
- `run_cycle`: ramo `recover` chama `mission-ops.recipes.recover(pane,
  "transcript400", ledger)` por importlib — **a receita vive uma vez só** (no
  plugin); falha do recover = escalada honesta + stage 3 (não re-tenta, não
  trava em loop); sucesso zera o episódio.
- `notify_emit`: escalada também entra na pipeline mission-notify (spool, dedupe
  por assinatura) — ver nota do item 4 abaixo.
- `run_smoke_post_cycle` + wiring no `daemon()`: smoke roda após cada ciclo;
  vermelho vira finding `smoke_red` (o rollback é do próprio smoke).

## PROVA RED → GREEN por receita

Fixtures de pane sintético (herdr stub) em ambos os lados; provas red capturadas
ANTES da implementação:

| Prova | Arquivo | Antes (red) | Depois (green) |
|---|---|---|---|
| mission-ops relaunch/compact/smoke | `provas/red-mission-ops-test_lane2.txt` (nos 2 repos) | 15 testes: **6 falhas + 8 erros** | 15/15 OK (0.4s) |
| watchdog lane2 (detectores, decide, notify, ciclos, smoke) | `provas/red-watchdog-test_watchdog_lane2.txt` | 23 testes: **6 falhas + 17 erros** | 27/27 OK (0.04s) — 4 testes de smoke wiring adicionados após o red |

Suítes finais (run_suites.py):
- watchdog combinada (test_watchdog_02 + 02b + d9 + lane2): **70/70 OK**
- mission-ops completa (test_mission_ops + test_lane2): **124/124 OK, 32.8s**
  (o fix do teste 19 eliminou o spin oculto de 180s — antes a mesma suíte
  levava 400–720s)

## Tempo de recuperação simulado (elapsed_s com o FakeClock)

Medido executando a receita real contra o pane sintético (mesmos cenários dos
testes; tempo simulado, não wall-clock):

| Cenário | Resultado | elapsed_s simulado |
|---|---|---|
| API Error 502 (caminho completo: `/exit` → polling-ready → claude novo com `CLAUDE_CONFIG_DIR` → prompt de retomada) | `recovered=True`, prompt só depois de `ready_seen_at`; ledger → `dispatched` | **10.0s** |
| Shell pós-morte/OOM (launch sem `/exit`) | `recovered=True` | **6.7s** |
| Never-ready (claude não sinaliza ready) | falha honesta: `err="claude não sinalizou ready (❯/auto mode on) em 120s"`, **zero prompts entregues às cegas**, ledger NÃO vai a dispatched | **120.0s** (timeout, gasto honesto) |

No watchdog, o limiar de observação antes de agir é `lane2_api_error_after=1`
ciclo (o detector é específico — API Error parado não é ambíguo como idle) e a
falha do recover vai a escalada com stage 3, sem re-tentativa em loop.

## Custo: 0 LLM

Toda a Lane 2 é determinística: detectores por regex/estado, escada por
contadores no state, receita por sequência fixa de teclas/comandos com polling
de ready. O watchdog NUNCA decide por LLM; o judge só entra onde já entrava
(D4 turno longo), fora da lane.

## Notas honestas

1. **Item 4 (escalada no chat) sob a ordem do operator de 28/09**: a entrega
   chat in-session foi banida (cada entrega custava ~172k tokens). A escalada
   entra no spool canônico via `notify.emit_event` (dedupe) e é consumida pelo
   journal do plantão. O spool de produção foi poluído por 2 linhas de teste
   durante o desenvolvimento — removidas (linhas 6848 e 6847, missions "m1")
   e as assinaturas de teste apagadas (43→42); os testes foram reescritos
   para patchar o spool (verificação final: 48 linhas mission-ops:notify,
   todas de produção; zero `mission-ops:smoke`).
2. **test_gpu_watchdog tem 2 falhas PRÉ-EXISTENTES** (detector_idle,
   detector_error_repetition): referenciam módulos que não existem no master.
   Confirmado no baseline limpo (git stash) — não é quebra desta missão. Fora
   da lista do run_suites.
3. **Exclusão de teste**: test_mission_ops.TestDispatch.test_start_timeout_
   records_state (spin 180s, ~5GB RSS) segue excluído no runner, como antes.
4. **O smoke wiring pegou um bug real**: subprocess.run sem `text=True`
   devolvia bytes e quebrava o tail do finding — corrigido antes do green.
5. **MemoryError/timeouts na suíte mission-ops — causa raiz encontrada e CORRIGIDA
   (teste pré-existente, não é dos módulos lane2)**: test_ready_error_detected
   (TestDispatch) usa mocks instantâneos (`return_value=(None, "timeout")`); com
   isso o loop do ready-dance (`deadline` de 180s REAL em handle_mission_dispatch)
   gira **~46 milhões de iterações** em 180s (medido: waits=46074767), e cada
   chamada grava na call-history do MagicMock — a memória cresce até estourar o
   RLIMIT_AS de 6GB do runner (VmSize estável em 33MB até a explosão; medido
   passo a passo com instrumento). Verde em rodadas anteriores era navalha
   dependente da taxa de iteração da máquina. **Fix (AST-adendo no teste,
   semântica intacta)**: clock acelerado (`itertools.count(time.time(), 10.0)`
   no `time.time` do módulo) — ~19 rodadas, timeout → READY_REGEX_ERROR igual;
   o teste caiu de 180s+GBs para 0.004s. Timeout 60s do TestGpuDownFix01 sob
   carga de outra sessão continua sendo flakiness documentada (nota 7).
6. **Deploy/restart dos serviços não é desta missão** (janela do supervisor):
   o watchdog roda local; nada em produção foi reiniciado. O smoke pré-deploy
   é fail-open (SMOKE_PATH ausente = skip silencioso) para o caso do plugin
   ainda não mergeado.
7. **Flakiness residual do TestGpuDownFix01**: os testes de sandbox bash dessa
   classe estouram o timeout de 60s sob carga (subconjunto variável por
   rodada); isolados, os 9 passam em 3.4s. Numa rodada desta missão a carga
   veio de OUTRA sessão Claude (vast-tfa-fix) rodando simultaneamente o teste
   spin excluído (~5GB RSS) no plugin de produção. Documentado, não
   "corrigido".
   o watchdog roda local; nada em produção foi reiniciado. O smoke pré-deploy
   é fail-open (SMOKE_PATH ausente = skip silencioso) para o caso do plugin
   ainda não mergeado.
