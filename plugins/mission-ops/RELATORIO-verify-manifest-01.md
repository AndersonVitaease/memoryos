# RELATÓRIO verify-manifest-01: autor de verify.json no mission_verify

**RESULT: PASS.** A tool irmã `mission_verify_author` está no plugin mission-ops, commits `6307881` + fix do dogfood sobre o HEAD `f3b9b86`. Ela gera o `verify.json` a partir de prova REAL: primeiro o relatório, depois o prompt, por último o fallback do runner. Cada item leva `_provenance` e `_source`. Nos testes, red 10/10 virou green 10/10. A suíte full deu 171/171 OK, isolada em `verify-manifest-suite.scope` com MemoryMax=2G e pico de 27 MB. Na geração real sobre a judge-deploy-01, o runner deu pass 19/19. O runner `/opt/deliver-verify/verify.py` e o formato do ledger não foram alterados.

## 1. O que foi entregue
- `verify_author.py` (novo módulo, zero LLM) + handler `handle_mission_verify_author` e registro da tool em `__init__.py`. O runner fica intocado: o adapter vive no plugin, e o runner já ignora chaves `_*`.
- Entrada: `missionId`, com `force`, `dryRun` e `cwd` opcionais. O cwd e o promptFile vêm do ledger.
- Fontes, com dedupe em que a primeira vence:
  - **report**: `RELATORIO-<id>.md` ou `relatorio-<id>.md` no cwd.
    - Comandos em code span só entram se forem read-only da allowlist (docker inspect/ps, systemctl is-active/status/show, git log/status/rev-parse, grep, test, ls, stat, curl GET…) ou um script executável da própria missão em `evidence/<id>/`.
    - Um par `` `cmd` → `saída` `` vira um grep de cada token da saída.
    - Arquivos citados só entram se EXISTEM, com `min_bytes = min(tamanho, 500)`. Nomes nus são resolvidos no cwd e nos diretórios citados.
    - Units só entram com `LoadState=loaded` e estado declarado no trecho da própria menção: `active`/`inactive`. Sem estado declarado, a unit é descartada.
  - **prompt**: `missao-<id>.md`, só nas seções Tarefas/Entrega/Aceite/Relatório final. Linhas com negação ("NÃO", "nunca") são ignoradas.
  - **inferred**: o próprio relatório, `min_bytes 500`, igual à bateria "relatorio" do runner. Só entra se o relatório não foi citado por outra fonte.
- Todo candidato descartado vai para `skipped` com o motivo: unit inexistente, arquivo inexistente, segredo, arquivo 0600, efeito colateral ou falta de estado declarado. Segredos (`token`, `secret`, `.claude.json`, `.env`) e comandos com `rm`, `;`, `$(`, redirect, `sudo`, `curl -X/-d` nunca viram spec. Fragmentos de prosa também são descartados: comando de leitura sem arquivo (leria stdin) ou com operando relativo que não existe no cwd.
- Fluxo seguro:
  - O diff unificado do proposto contra o existente vem SEMPRE na resposta e é calculado antes de gravar.
  - Se `verify.json` já existe e não há `force`, a tool recusa com `VERIFY_JSON_EXISTS` e o arquivo fica intocado.
  - `dryRun` não grava.
  - A gravação é atômica (tmp + `os.replace`), registra o evento `verify_manifest_authored` e roda `mission_verify` imediatamente sobre o manifesto novo. Manifesto errado dá checks vermelhos.
- Sem relatório: recusa honesta `NO_REPORT`, nada é gravado. Sem ledger e sem `cwd`: `NO_LEDGER`.

## 2. Red → green por caso (`test_verify_author.py`)
Red: HEAD pré-patch (`__init__.py` do `f3b9b86`, sem `verify_author.py`) em cópia em `/tmp/vm-red`. Resultado em `provas/verify-manifest-01/red.txt`.
Green: com o patch. Resultado em `provas/verify-manifest-01/green.txt`. O caso 10 tem red próprio contra `6307881` em `provas/verify-manifest-01/red-fragments.txt`.

| Caso | Red | Green |
|---|---|---|
| judge-deploy-01: verify.json existente sem force → `VERIFY_JSON_EXISTS`, sha256 intocado, diff mostrado | ERROR (KeyError tool) | ok |
| judge-deploy-01: geração reencontra o manifesto feito à mão (smoke-judge.sh, docker inspect da imagem exata, unit `eng-mcp-release-runner` active, smoke-response/pipeline-call-resume-1/relatório); `engmcp` (inexistente), `.claude.json` e `post-release-state.json` (0600) fora | ERROR | ok |
| sem relatório → `NO_REPORT`, nada gravado | ERROR | ok |
| sem ledger/cwd → `NO_LEDGER` | ERROR | ok |
| sobrescrever sem force → recusa (bytes iguais); com `force` → grava + verify pass | ERROR | ok |
| dryRun não grava, diff vs `/dev/null` | ERROR | ok |
| provenance: só relatório → report; em ambos → report; só prompt → prompt; relatório citado só no prompt → prompt; Contexto/Regras/negação ausentes; segredo/inexistente/`rm -rf`/tool MCP ausentes; 2 units na mesma linha com estados distintos → `active` e `inactive` (lição oom-e2e-neighbor); unit sem estado → skip | ERROR | ok |
| relatório sem citações → só o fallback `inferred` (`runner:relatorio`) | ERROR | ok |
| red natural: prova falsa (grep de string ausente em arquivo real) → verify `fail`, só o check cmd vermelho + evento `verify_manifest_authored` | ERROR | ok |
| fragmentos de prosa (achado do dogfood §7): `curl -X/-d`, `curl -s -o`, grep sem arquivo, `sha256sum -c` sem arquivo, operando alheio → skip; comando real mantido | FAIL em `6307881` | ok |

No primeiro green real, 2 falhas mostraram coisas verdadeiras:
- **Bug de código.** O estado da unit era lido da linha inteira. Corrigi para usar o trecho entre a menção e a próxima unit.
- **Fixture rasa.** Um relatório de 36 bytes ficou vermelho pelo check `inferred` de 500 bytes. Isso é comportamento correto; a fixture foi ajustada.

## 3. Suíte full (contenção obrigatória)
Este pane roda em `0::/system.slice/herdr-server.service`. A suíte rodou FORA desse cgroup:
```
systemd-run --scope --unit=verify-manifest-suite -p MemoryMax=2G -p MemorySwapMax=0 \
  --working-directory=/root/.hermes/plugins/mission-ops bash -c 'cat /proc/self/cgroup; /usr/bin/time -v python3 -m unittest \
  test_mission_ops test_lane2 test_mission_list_compacto test_gpu_cost_coerce test_verify_json_ghost \
  test_ledger_hygiene test_watch_detector test_verify_author ...'
```
Resultado: `0::/system.slice/verify-manifest-suite.scope`, **Ran 171 tests OK** (161 anteriores + 10 novos), 33,2s, RSS máximo 27108 KB, Exit status 0. Arquivo: `/root/.hermes/plugins/mission-ops/provas/verify-manifest-01/suite-full.txt`.

**Achado fora do escopo:** `test_mission_resume.py` não é rastreado e já existia antes desta missão (estava no `git status` inicial). Ele usa `from .mission_resume import` e quebra como módulo solto (ImportError). A suíte anterior de 161 testes também não o incluía. Não toquei nele.

## 4. Exemplo real de geração (judge-deploy-01)
- Tool real com ledger real, sem force: `{"ok": false, "error": "VERIFY_JSON_EXISTS", "written": false, "provenance": {"report": 16, "prompt": 3}}`. O `/opt/memoryos/eng-mcp/verify.json`, feito à mão pela missão, ficou **intocado** (`sha256sum -c` OK). Arquivos: `provas/verify-manifest-01/live-refusal.json` e `live-diff-vs-hand.diff`.
- Manifesto proposto, 19 specs (`provas/verify-manifest-01/judge-deploy-01.verify.generated.json`):
  - 5 cmd: git log, `smoke-judge.sh`, `docker inspect memoryos-eng-mcp` com grep de `true` e `eng-mcp-candidate:candidate-20260928142849307-7ae70943a081`, e git log/status vindos do prompt.
  - 1 service: `eng-mcp-release-runner` active.
  - 13 file: evidências e `src/judge.ts`.
- Descartes auditáveis: `engmcp`, `cmd`, `service`, `memoryos-eng-mcp` (units inexistentes), `/root/.claude.json` (segredo), `pre-release-state.json` e `post-release-state.json` (0600), `smokeJudgeModel …` (fora da allowlist).
- `mission_verify` sobre o manifesto gerado deu **verdict pass, 19/19** (`provas/verify-manifest-01/live-verify-generated.json`). O manifesto não foi gravado no cwd da judge-deploy-01: esse artefato é alheio, então a validação usou `--manifest`, que é o mesmo caminho que o handler usa depois de gravar.
- Diferença honesta contra o manifesto feito à mão: o `grep -q '127.0.0.1:8102/alpha/decisions' src/judge.ts` NÃO é gerado. O relatório não traz esse comando nem essa afirmação como prova, e o autor não inventa. O arquivo `src/judge.ts` entra como file porque está citado.

## 5. Carga
O código do plugin carrega no boot. **Não reiniciei o gateway**: o supervisor faz isso na ativação. O que provei:
- O import do pacote pelo loader (`tools.register_tools`) registra 12 tools, incluindo `mission_verify_author` (`required: ["missionId"]`).
- O self-test `cwd=/tmp` retorna `NO_REPORT` (`provas/verify-manifest-01/selftest-load.txt`).
- `smoke_mission_ops.py` deu `SMOKE OK`.

## 6. Regras respeitadas
- Nada de push, registry ou tokens.
- Runner e formato do ledger não foram alterados.
- As missões volume-cache-awq-01 e vast-volume-watch-01 não foram tocadas.
- O patch foi dirigido só a mission-ops: `verify_author.py` (novo), `test_verify_author.py` (novo) e `__init__.py` (import, handler, registro e docstring).
- Nenhum comando foi negado.
- O aviso do SUPERVISOR-WATCHDOG sobre ler arquivos da judge-deploy-01 era falso positivo: o contrato manda usá-la como fixture. O acesso foi só de leitura e o trabalho voltou ao entregável.

## 7. Dogfood: esta missão fecha com manifesto gerado pela própria tool
A verify-manifest-01 é `consequence: true`, e o cwd dela (`/root/.hermes/plugins/mission-ops`) tinha o verify.json da watch-detector-fix-01, que continua rastreado no git (`f3b9b86`).

1. Sem `force` a tool recusou com `VERIFY_JSON_EXISTS`, como esperado.
2. Com `force`, a 1ª geração sobre ESTE relatório deu **fail 18/22**. Foi o red natural funcionando: 4 menções em prosa tinham virado cmd.
   - `curl -X/-d`: o filtro de curl exigia espaço depois do `-X`.
   - `grep -q SUCESSO` e `sha256sum -c`: sem arquivo, leriam stdin.
   - `grep … src/judge.ts`: operando relativo de outro cwd.
3. Fix no `verify_author.py`:
   - Comandos de leitura (grep/cat/sha256sum/test…) precisam de operando de arquivo.
   - Operando relativo precisa existir a partir do cwd.
   - O filtro de curl agora pega `-X`, `-d`, `-T`, `-F`, `-o` em qualquer posição.
   - Regressão: o caso 10 da tabela, red → green.
4. A regeneração com `force` e o `mission_verify` logo depois estão em `provas/verify-manifest-01/dogfood-author.json`.
5. Resultado da regeneração sobre este relatório final: `written: true`, provenance `{"report": 19, "prompt": 1}`, **verdict pass 20/20**. O `verify.json` do cwd agora é o da verify-manifest-01.

## 8. Autoverificação (`engineering.judge.verify`, judge em :8102)
Chamei `engineering.judge.verify` com 6 claims deste relatório contra as provas em disco: red, red-fragments, green, suite-full, recusa ao vivo + `sha256sum -c`, verify gerado 19/19 e dogfood 20/20.
- Resultado: **JUDGED, ALL_SUPPORTED (6/6)**.
- Provider: `typesafe/jev-1.13/compatible:Qwen/Qwen2.5-Coder-32B-Instruct-AWQ`, round-trip de 10406 ms.
- Arquivos: `provas/verify-manifest-01/judge-payload.json` e `judge-response.json`.

## 9. Pendências para o supervisor
- A tool só passa a valer no gateway depois do **restart na ativação**, a cargo do supervisor. Não executei esse restart.
- O `plugin.yaml` `provides_tools` já não listava as tools desde antes desta missão (só 4 de 11). O registro real é feito por `register()`, então deixei como estava.

## 10. memory.capture
`engineering.memory.capture` → stored=true, memoryId `e24847a6-928e-49f7-ba38-e8883dab773b` (gate admit 0.895). Arquivos: `provas/verify-manifest-01/capture-payload.json` e `capture-response.json`.
