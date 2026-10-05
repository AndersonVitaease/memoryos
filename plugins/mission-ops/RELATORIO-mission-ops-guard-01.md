# RELATÓRIO — mission-ops-guard-01 (01/10)

Correção dos 3 findings de sessão/cwd/input do fluxo de missões. Componente: `/root/.hermes/plugins/mission-ops/`.
Backups `.bak-mission-ops-guard-01` gravados ANTES de editar (tamanhos conferidos, `cmp` idêntico):
mission_core.py 55983 B, recipes.py 22991 B, __init__.py 144028 B, relaunch.py 9553 B,
test_mission_ops.py 121846 B, mission_resume.py 1254 B, verify.json. Todas as edições pontuais (diff contra o .bak:
3 linhas removidas no core, 8 no recipes, todas substituídas no lugar). Sem push/deploy, sem JEV, sem mudança de
args/retorno dos tools.

## Causas-raiz (confirmadas no disco)

- **F1 SESSION-SHARE-01**: dispatch/recover gravavam `resumeSessionId = latest_session_id(cwd)` = o `.jsonl` mais
  novo do project dir — de QUALQUER missão. No caso real, o ledger do watch-fp-01 tinha `resumeSessionId: null`;
  ou seja, só checar "o dono no ledger" NÃO teria barrado. Além disso o dispatch lia a sessão ANTES de entregar o
  prompt, e o claude só cria o jsonl depois do 1º turno: nesse momento a única candidata era a sessão alheia.
- **F2 RECOVER-CWD-01**: `start_claude_and_resume` / `claude --resume` rodavam `claude` puro no cwd em que o shell
  do pane estivesse (o worker tinha feito cd para o repo principal).
- **F3 PANE-INPUT-GARBAGE-01**: `deliver_prompt` só fazia ctrl+u ENTRE tentativas; o resíduo que já estava no input box
  ficava como prefixo da 1ª tentativa (`/0000SUP-…` → "Unknown command").
- **Bug latente achado no E2E**: o slug do project dir só trocava `/` por `-`. O claude troca TODO caractere
  não-alfanumérico (`/root/.hermes` → `-root--hermes`), então a sessão de qualquer cwd com ponto nunca era achada.
- **Lacuna achada no E2E**: o recover só esperava o ready e nunca passava pelos diálogos first-run (trust do worktree,
  "Security notes · Press Enter"), então morria em 180s. Agora que o relançamento vai para o cwd do ledger, isso
  passou a importar.

## Entregáveis (código)

`mission_core.py`
- `own_session_id(missionId, cwd, since, wait_s)`: a sessão própria é a mais nova cujo INÍCIO (1º `timestamp` do jsonl,
  não o mtime, que anda numa sessão viva) seja ≥ o lançamento do claude da missão, e que NÃO esteja reivindicada por
  outro ledger. Faz um polling curto e limitado (`SESSION_WAIT_S`=3s) porque o jsonl nasce ~1s depois do prompt.
- `session_owner`, `session_in_use` (heurística: claude com o id na cmdline em /proc, ou session file escrito há <60s),
  `resumable_session_id(mission)` → (id, motivo da recusa).
- `_session_dirs`: `<cwd>/.claude-config/projects/<slug>` (config dourada do dispatch) + `CLAUDE_HOME`, com slug real
  do claude + slug legado.
- `recover_cwd(mission, arg)`: o padrão é o cwd do LEDGER; o arg só prevalece se for diretório existente.
- `deliver_prompt`: `ctrl+e` + `ctrl+u` limpam o input ANTES do 1º send (nunca Esc: 2× Esc abre o rewind).
  `input_garbage_prefix` detecta, antes do Enter, prefixo antes do texto na linha `❯` (aceita NBSP), e, depois do
  Enter, `Unknown command: <lixo><texto>`. Quando detecta: clear + retry 1× (não conta como tentativa), evento
  `nudge_input_garbage` em events.jsonl + bus (`SPOOL_HOOK`). Se o lixo persistir, falha honesta sem Enter.

`recipes.py`
- `claude_launch_cmd(cwd, resume_id)`: `cd <cwd do ledger> && [env CLAUDE_CONFIG_DIR=<cwd>/.claude-config] claude [--resume id]`.
- shell_fallback: se já há claude vivo no pane, é no-op idempotente (sem 2º claude); `resumable_session_id` recusa sessão
  de outra missão ou viva em outro processo (evento `resume_refused`, sessão nova); relança no cwd do ledger.
- `start_claude_and_resume`: roda no cwd do ledger + `wait_ready_dancing` (mesmo READY_DANCE do dispatch) + sessão própria.
- ready_regex_error: `recover_cwd` (arg validado, senão ledger) + sessão própria.
- interrupted/palette não relançam o claude (esc + continue), então não há cwd envolvido. transcript400 (relaunch.py) já
  usava `cd <ledger cwd>`; agora grava a sessão própria.

`__init__.py`: dispatch marca `_launched_at` antes do `claude` e grava a sessão própria DEPOIS da entrega do prompt;
registra `mc.SPOOL_HOOK` (bus `/opt/mission-events/spool.jsonl`, resolvido na chamada, então a suíte redireciona para tmp).
`relaunch.py`: sessão própria. `mission_resume.py`: intocado, porque é stub não ligado a nenhum handler (sem uso de `mr.`).

## Testes red→green — `test_mission_ops_guard.py` (16 testes)

Fixtures com os dados reais de hoje: sessão `8329080a-…` viva no mesmo project dir com o ledger watch-fp-01
`resumeSessionId: null`; worktree `eng-mcp-wt-watch-fp-01/eng-mcp`; resíduos `/0000`, `/afaf<35;34;12M`, `db`.
- **RED** (mesmo arquivo contra os .bak, scratch `/root/.hermes/scratch/mission-ops-guard-01/red`): `FAILED (failures=11, errors=5)`.
  Os 2 "ok" são guarda/regressão que já valia no código antigo (transcript400 já no cwd do ledger). Evidência em
  `evidence/mission-ops-guard-01/red-run.txt`.
- **GREEN**: `Ran 16 tests … OK`.
- 2 asserções legadas foram atualizadas porque descreviam exatamente o bug: `runs[0][3] == "claude"` virou
  `"cd /opt/mission-x && claude"`, e "ctrl+u só entre tentativas" virou pré-clear + entre tentativas (2).
  `TempState` zera `SESSION_WAIT_S` (as fixtures já estão no disco); sem isso a suíte ia de 32s para 50s.
  Um teste novo cobre a espera explicitamente.

## Regressão (MEM-GUARD `systemd-run --scope -p MemoryMax=2G`)

test_mission_ops 139 OK (32.5s) · test_watch_detector 12/12 · test_watch_fp_operator 12/12 · guard 16/16 ·
lane2 15 · bus_guard 12 · chain_dispatch 17 · dispatch_fast03 8 · mission_batch 11 · upstream_idle 3 ·
mission_resume 4 · mission_snapshot 13 · verify_author 10 · ledger_fix_status 4. Tudo verde. A suíte não escreveu no
bus real (0 entradas `mission-ops:guard`).

## E2E real (herdr vivo, scratch isolado — nunca pane de missão em voo)

`e2e_guard.py` (cópia em `evidence/mission-ops-guard-01/`). STATE_DIR próprio; o mission-state real não foi tocado.
1. Aba scratch com o shell num cwd ERRADO (`…/e2e/wrong-cwd`); ledger scratch com cwd do worktree `…/eng-mcp-wt-guard-e2e/eng-mcp`.
2. `recover(shell_fallback)`: o recover passou sozinho pelos 3 diálogos first-run (eventos `ready_dance`), e
   `/proc/<pid>/cwd` do claude = **cwd do ledger** (`F2_cwd_ok: true`). A sessão própria foi capturada
   (`3a217904-…`, que existe no project dir do scratch).
3. Input sujo `❯ /0000`, depois `mission_nudge` real: na tela, `❯ Responda apenas: GUARD-NUDGE-CLEAN` e
   `● GUARD-NUDGE-CLEAN`. Nenhum "Unknown command" e nenhum eco `/0000Responda` (`F3_clean_ok: true`).
   A aba foi fechada e não sobrou processo.
   - Observação honesta: o nudge retornou `engage_failed`. O motivo é que o turno terminou em 2s, antes do
     `verify_s=4`, e a verificação do nudge (pré-existente) exige ver `working`. A entrega limpa foi comprovada pela tela.
- Rodadas anteriores do E2E (registradas para não esconder nada): a 1ª e a 3ª travaram no diálogo de trust e no
  "Security notes" da pasta scratch nova. Isso expôs a lacuna do recover, corrigida com `wait_ready_dancing`.
  A 2ª expôs o bug de slug (`freshSessionId: null`), corrigido em `_session_dirs`.

## Provas (verify.json)

cmd: suítes test_mission_ops (timeout 70), guard/detector/watch-fp (timeout 60), check_guard_e2e.py (lê o
e2e-result.json); file: relatório, test_mission_ops_guard.py, evidências red/E2E.

VEREDITO: PASS
