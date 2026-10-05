# relatorio-flaky-sandbox-fix-01 — testes do gpu-down nunca mais batem no vastai real

**Status: ENTREGUE.** Só infra de teste foi tocada (`test_mission_ops.py` + o novo `vast_sandbox.py`).
Zero mudança em `mission_core.py`/`__init__.py`. Zero edição em `/opt/gpu-orchestrator`, `/opt/gpu-watchdog` e eng-mcp:
só li esses diretórios, e o `run_suites.py` foi apenas executado.

## Diagnóstico: não era flaky, era determinístico (e pior do que parecia)
Red medido em 5/5 rodadas diretas: **os mesmos 4 testes falham sempre** (`provas/flaky-sandbox-fix-01/red-run{1..5}.txt`).
A premissa de "subconjunto variando" não se reproduziu. Causa raiz:

1. **gpu-orch-pin-01 (28/09 13:27)** mudou o `gpu-down.sh` de produção para `. "$ORCH/lib-vastai.sh"` e `. "$ORCH/ports.env"`.
   O sandbox do teste reescreve `ORCH` para o tmp, onde esses arquivos não existiam. Resultado: `resolve_vastai` indefinida,
   `VAST_FAIL=5` e a mensagem "destroy NÃO emitido (vastai exit 5)". O regex `^VAST=` que apontava para o fake não
   casava mais nada, porque essa linha deixou de existir.
2. **Risco latente de vastai real:** bastava copiar a lib crua para o `resolve_vastai` achar
   `/opt/guardian-compute/venv/bin/vastai`, o binário REAL (prova: `red-lib-resolve-real.txt`).
   Chamar o vastai real significaria handshake, `destroy` e `show instances` com a auth real.
3. **Risco latente de pkill real:** a troca `pkill -f '[s]sh -N -L 8100' → true` não casa mais a linha nova
   (`pkill -f "ssh -N -L ${ORCH_LOCAL_PORT}:..."`). Os caminhos green matariam o túnel REAL do gpu-orchestrator na 8101
   (`red-pkill-not-neutralized.txt`).

## Entrega
### 1. Isolamento determinístico: `vast_sandbox.OrchSandbox`
- Copia `lib-vastai.sh` e `ports.env` para `tmp/orch`, com todos os caminhos reais reescritos.
- Força o fake nos três passos do resolvedor: `VASTAI_TARGETS=(fake)` na lib, `VASTAI_BIN=fake` no env
  (sempre sobrescreve o que o invocador exportar) e o diretório do fake primeiro no PATH.
- O fake responde `show user` com JSON válido (o handshake passa), `show instances` com `GPU_FAKE_VAST_ROWS` e `destroy` com ok.
- Toda linha `pkill`/`ssh` vira `true`, e `sleep 5` vira `sleep 0`.
- **Assert estático** (`assert_sealed`): falha se sobrar qualquer caminho real (orch, mission-state, mission-events,
  gpu-bridge, vastai real) ou qualquer `pkill`/`ssh`.
- **Assert em runtime**: se a linha `[gpu-down] vastai: X` do script não apontar para o fake, levanta `RealVastaiError`.

### 2. Guard da suíte: `vast_sandbox.install_guard()`
Chamado no import de `test_mission_ops`. Como `test_lane2`, `test_gpu_cost_coerce` e `test_gpu_cost_trail` importam
esse módulo, o guard vale em qualquer forma de invocação.
- `VASTAI_BIN` do processo passa a ser um **tripwire** (exit 97, "teste tentou vastai real", com log próprio).
- O PATH perde todo diretório que resolva um vastai real.
- `subprocess.Popen` fica guardado: levanta `RealVastaiError("teste tentou vastai real: …")` **antes do exec** nestes casos:
  - argv resolve um vastai não-fake (caminho absoluto, nome nu ou string com `shell=True`);
  - `bash script` cita um caminho real de vastai;
  - o env passado traz `VASTAI_BIN` não-fake.
- `tearDownModule` falha se o tripwire tiver disparado.
- Meta-teste: todo `test_*.py` que cita vastai/gpu-down/gpu-up precisa importar `vast_sandbox` ou `test_mission_ops`.
- Os 8 testes novos estão em `TestVastSandboxGuard`. Nenhum deles executa o binário real.

## Prova
| item | resultado |
|---|---|
| red (código de teste antigo), 5 rodadas diretas | 4/4 FAIL em todas (determinístico) |
| (a) green, 10 rodadas diretas fora do sandbox (`TestGpuDownFix01` + guard) | 17/17 OK em 10/10, 0 flaky |
| (b) `VASTAI_BIN` real exportado | OK |
| (b) venv real no início do PATH | OK |
| (b) HOME sem credencial vast + `VAST_API_KEY=bogus` | OK |
| (b) todas as condições hostis juntas | OK |
| estado real (hash do `state.json`, linhas gpu-orchestrator no spool, `gpu_down` no audit, `/root/.config/vastai`, túneis ssh) antes e depois de 6 rodadas | idêntico |
| `test_mission_ops` inteira | **118/118 OK** (110 antigos + 8 novos), RSS 25MB |
| `run_suites.py mission-ops` | **RESULT 132 run, 0 failures, 0 errors** (exclusão padrão do runner mantida) |
| todos os `test_*.py` rastreados | 213/213 OK |

Para reproduzir: `evidence/flaky-sandbox-fix-01/check-flaky-sandbox.sh` (rc=0). Os logs estão em `provas/flaky-sandbox-fix-01/`.
Não gerei `verify.json`: a entrega não pediu, e o script de checagem cumpre esse papel.

## Achados fora do escopo (NÃO corrigidos, são de outros componentes)
1. **O spool real `/opt/mission-events/spool.jsonl` tem 4 findings `gpu_destroy_unverified` com o CID de TESTE 52953260**
   (ts 1790514902–1790520168, 27/09). Muito provavelmente foram escritos por uma versão antiga do teste que vazava para o
   spool real. Não apaguei nada, porque o arquivo pertence ao bus. O operator decide se limpa.
2. **Bug de expansão no `gpu-down.sh` de produção:** o texto `US$$EXTRA` dentro de aspas duplas vira PID+`EXTRA`
   (ex.: "US44374EXTRA") nas mensagens dos findings `gpu_destroy_unverified` e `gpu_down` (`US\$$COST` está correto,
   `US$$EXTRA` não). A correção fica com a lane do gpu-orchestrator.
3. **`test_mission_resume.py` (untracked, anterior a esta missão)** quebra no import: `from .mission_resume` é um
   import relativo sem pacote. Ficou fora da contagem 213/213.
4. **`mission_core.py` já estava modificado** no working tree antes desta missão. Não toquei nem commitei.

---
## REPROVAÇÃO 28/09 (supervisor) e correção

**O que o supervisor viu:** 7 falhas estáveis em 5 rodadas diretas, com
`RealVastaiError: teste tentou vastai real: sandbox cita /bin/vastai`. Reproduzi com o HEAD `eb14e45` e PATH contendo `/bin`:
`FAILED (failures=7)` (`provas/flaky-sandbox-fix-01/reprova-01/red-supervisor-path.txt`). Minha prova anterior passou
porque o PATH da minha sessão não tinha `/bin`. Esse foi o erro de prova: a validação dependia do PATH.

**Causa exata:** um falso positivo do meu guard. Não houve escape de resolução.
- `/bin/vastai` **não existe**. `lib-vastai.sh` resolve só por `VASTAI_BIN`, `VASTAI_TARGETS=(/opt/guardian-compute/venv/bin/vastai)` e `command -v`.
  `ports.env` não cita vastai.
- `real_vastai_paths()` colocava `<dir>/vastai` de **todo** diretório do PATH do invocador, mesmo inexistente.
- `assert_sealed` casava por **substring**, e `/bin/vastai` aparecia dentro do comentário
  `# ... /root/.hermes/tools/python-3.14.7+.../bin/vastai` (gpu-down.sh:16, lib-vastai.sh:10).
  Os 7 testes que chamam `_script()` morriam no selo antes de rodar.

**Correção (só `vast_sandbox.py`):**
- Candidatos do PATH só entram se o `vastai` **existir** de fato. Os caminhos explícitos (hardcode antigo + `VASTAI_TARGETS`) continuam valendo sempre.
- A varredura de texto (`cites_real_vastai`) ignora linhas de comentário e exige fronteira de caminho: `/bin/vastai` não casa dentro de `.../venv/bin/vastai`.
- A resolução por nome nu segue coberta pelo `check_argv` (via `which`) e pelo assert em runtime da linha `[gpu-down] vastai:`.
- Dois testes novos de regressão:
  - `test_seal_path_independent_no_false_positive_on_comment`: com um PATH padrão contendo `/bin`, sela os dois scripts sem erro.
  - `test_seal_catches_existing_vastai_on_invoker_path`: um vastai que existe no PATH, citado em código, é recusado; citado em comentário, não.

**Prova (comando do supervisor: `python3 -m unittest test_mission_ops.TestGpuDownFix01`, direto, 5 rodadas por variante):**
| variante | resultado |
|---|---|
| PATH padrão com `/bin` (o do supervisor) | 5/5 OK (9/9) |
| PATH mínimo `/usr/bin:/bin` | 5/5 OK |
| PATH da sessão | 5/5 OK |
| venv real do vastai no início do PATH | 5/5 OK |
| `env -i` + HOME sem credencial + `VASTAI_BIN` real exportado | 5/5 OK |
| estado real antes e depois (state.json, spool, audit, `/root/.config/vastai`, túneis) | idêntico |
| `test_mission_ops` inteira (PATH do supervisor) | **120/120 OK** |
| todos os `test_*.py` rastreados | 215/215 OK |
| `run_suites.py mission-ops` | 134 run, 0 failures, 0 errors |
| `evidence/flaky-sandbox-fix-01/check-flaky-sandbox.sh` (agora inclui a rodada com o PATH do supervisor) | rc=0 |

Logs em `provas/flaky-sandbox-fix-01/reprova-01/`. `mission_core`/`__init__` continuam intocados.
