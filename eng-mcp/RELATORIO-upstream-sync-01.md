# RELATÓRIO upstream-sync-01: supertool de sincronização de dependências externas

**RESULT: PASS, com gray-zones declaradas no §8.**

Em produção (`:8787`), via pipeline oficial:
- **Tool nova:** `engineering.upstream`, com 4 verbos de sync (`check` / `plan` / `apply` / `rollback`) mais o gerenciador de registry `targets`.
- **Catálogo:** 129 → **130**.
- **Commit do código:** `23fc1933`.
- **Deploy:** job `36d95f78-8898-46af-b5ed-aa5bd3d5cffc`, `success`, smoke PASS. Imagem `candidate-20260928223337572-4f4f57219a50`.

## 1. O que foi construído (design do operator, à carta)

| Verbo | Implementação (`src/upstreamSync.ts`) |
|---|---|
| `check` | **Read-only e cron-ável** (`target=<id>` ou `all`); só reporta, nunca aplica.<br>**git:** faz o fetch num **repo-cache privado** (`/data/upstream/cache/<id>.git`) com `objects/info/alternates` apontando para o object store do alvo e com suporte a partial clone (hermes é `tree:0`). O alvo **só é lido**; a prova é o snapshot antes/depois de HEAD, `status` e `for-each-ref`. Devolve heads, ahead/behind, commits novos (neutralizados) e diff de lockfiles/manifests.<br>**docker:** compara o digest local (porta docker) com o digest do registry (HEAD do manifest via fluxo anônimo de bearer challenge). Saída: `{target, current, available, commits\|digests, riskNotes}`. |
| `plan` | **Card tier-3**, com estes componentes:<br>**Diff:** diff completo.<br>**Detector de rug-pull:** regras determinísticas como **config** (`src/upstream/rugpull-rules.json`: permissão, credencial, telemetria, rede nova, install hook, self-update, ofuscação) sobre as linhas adicionadas, mais o **diff de contrato** do `adapter.contractRef` (tool removida, renomeada por schema idêntico, schema ou descrição mudados).<br>**Juiz:** `judge.verify` com 4 claims (anúncio × comportamento). É advisory e fail-open, e **não entra no planHash**.<br>**Impacto:** layer de merge previsto (AUTO_FF/NATIVE/ASSISTED/BLOCKED), rebuild, restart e janela.<br>**Rollback e hash:** plano de rollback e `planHash`. |
| `apply` | **Tier-3 sempre.** Exige o scope novo `engineering:upstream:apply` (operator-issued, fora de `engineering:write`) e sujeito `operator-*`.<br>Sem `execute`, devolve PLAN. Com `execute`, exige `approval.approved` e `expectedPlanHash` = hash recomputado (TOCTOU).<br>**Lock** por alvo; alvos distintos rodam em paralelo.<br>**Sequência:** snapshot **primeiro** (tag anotada + digest do worktree, mais tar opcional; ou tag de snapshot docker), depois `runGitMerge` na forma local-merge (GIT-MERGE-02) sobre o root do alvo, depois rebuild, restart via adaptador e smoke (comandos, health, contrato estável). **Falha em qualquer fase dispara rollback automático.**<br>**Recusas sem mutar nada:** adaptadores `systemd` (host) e `pipeline` são recusados antes de qualquer mutação (`HOST_ADAPTER_REQUIRED`, `PIPELINE_ADAPTER`), e um localPath read-only dá `LOCALPATH_READ_ONLY`. |
| `rollback` | **Tier-3.** Restaura o último snapshot aplicado com prova de **byte-identidade**: head, tree, status e digest do worktree. |
| `targets` | **Registry = config**, com arquivo `/data/upstream-targets.json` e bootstrap versionado em `src/upstream/targets.bootstrap.json`.<br>`list` é read-only. `upsert` e `remove` são tier-3, com PLAN/approval e `expectedRegistrySha16`: registrar um alvo registra os comandos que o apply vai rodar, então tem o mesmo privilégio do apply. |

**Alvos do bootstrap:**
1. **`hermes-agent`:** git, `/usr/local/lib/hermes-agent`, restart systemd `hermes-gateway.service`, smoke `hermes --version`.
2. **`engmcp`:** git, `/opt/memoryos`, adaptador `pipeline`, health `:8787/mcp` → 401.

**Infra:** o release script ganhou `production.readOnlyMounts`, que é config. Só emite specs absolutas terminadas em `:ro` cuja origem existe (o que mata o modo de falha "diretório vazio criado pelo docker"). O hermes-agent agora é montado **read-only** no container; confirmado `RW=false`. Por construção, apply nele é impossível a partir do container.

**Audit:** `/data/audit/upstream-sync.jsonl`, uma linha por fase (a ordem snapshot → merge fica provada no audit). Os merges também gravam em `git-merge.jsonl`.

## 2. Red → green
- `test/upstreamSync.test.ts` roda **15/15** (`green.txt`). A fixture é um upstream bare mais um clone local, com `file://` e sem rede.
- **Red por mutação** (código restaurado byte-idêntico depois de cada uma):

| Mutante | Resultado | Arquivo |
|---|---|---|
| M1 gate tier-3 desligado | 3 falhas (#4 apply, #5 rollback sem scope, #11 targets) | `red-m1-tier3.txt` |
| M2 detector cego | 1 falha (#3 plan) | `red-m2-detector.txt` |
| M3 sem snapshot antes do merge | 1 falha (#5 rollback) | `red-m3-snapshot.txt` |

- **Contratos pedidos:**
  - **Alvo com update pendente:** o check detecta (commits + lockfile) sem mutação.
  - **Apply sem approval:** recusa tier-3. Os casos cobertos são sem scope, não-operator, sem execute (PLAN), sem approval, sem planHash e planHash velho; em todos, o alvo não é tocado e o restart nunca roda.
  - **Apply com approval:** a ordem das fases é exatamente `snapshot-created → fetched → merged:AUTO_FF → restarted → smoke-pass → applied`.
  - **Rollback:** volta byte-idêntico (head + digest do worktree).
- **Extras:**
  - NATIVE com commit local carregado, com `git-tag+tar`;
  - ASSISTED nunca faz merge;
  - smoke falho gera rollback automático;
  - systemd e pipeline são recusados sem mutação;
  - lock por alvo em paralelo;
  - registry com precondição de sha e entrada inválida recusada;
  - docker (bearer challenge, apply/rollback via porta);
  - `readOnlyMountArgs`;
  - neutralização de code points ocultos em subject de commit.

## 3. Suíte, typecheck, impacto
- **Suíte local:** 1572 testes, 1566 pass, 1 fail, 5 skip. O fail é `LIVE /mcp-proxy` (zz-proxy-live, ambiental, a mesma paridade das missões anteriores).
- **Pipeline:** `tests 1572 / passed 1566 / failed 0`, `expectedToolCount 130`.
- **Typecheck:** 41 erros, igual à main; 0 nos arquivos novos.
- **GitNexus:** `impact` deu `risk: UNKNOWN` (índice v43 × engine v42, a mesma situação das missões anteriores); não reconstruí. **Confirmação por texto:**
  - `runGitMerge` não foi alterado; ganhou 1 caller novo além do `repository.ts`.
  - `KNOWN_REGISTRY_SCOPES`: append.
  - `registerEngineeringTools`: registro aditivo.
  - `docker run` de produção: args aditivos e opcionais.
  - **Desvio declarado:** fiz o impact depois de editar, não antes.

## 4. Deploy
- **Estado antes:** `deploy.ready` READY / IN_SYNC.
- **Pipeline próprio a partir do HEAD `23fc1933`:** test PASS, depois build, candidate e deploy. Job `36d95f78` (22:33:40 → 22:33:59Z), exit 0, smoke PASS.
- **Colisão observada:** uma missão concorrente (GUARDIAN-SECLAYER-B-01) rodou o pipeline às 22:30:54Z, **antes** do meu commit. Como o pipeline builda da árvore canônica, a imagem dela (`candidate-…3220c552…`) já levou meu código ainda não commitado. Conferi os 6 arquivos: byte-idênticos ao commit. Mesmo assim rodei o meu próprio pipeline para que produção seja rastreável ao SHA commitado. Fica o registro, porque é um risco de processo: o pipeline builda working tree, não commit.
- **Camada 1** (`camada1-inspect.txt`): a imagem rodando é a do job, `upstreamSync.ts` e `tools.ts` em `/app` têm o mesmo sha que o commit, o mount do hermes tem `RW=false` e o runner está `active`.
- Não houve push. Não mexi em gpu-watchdog, guardian-compute, mission-ops, deliver-verify nem fast-router/shadow-router. Não fiz grant: o sha16 do registry de tokens é `885b121e1151e6d4`, só lido.

## 5. E2E pelo caminho do operador (produção)
- **`tools/list`:** 130 tools, incluindo `engineering.upstream`.
- **`upstream.check hermes-agent`** (REAL, 2,4 s): `UPDATE_AVAILABLE`.
  - current `ece8a96c` na branch `session-attach-01`, com 2 tracked sujos;
  - available `b9df1ccc` (upstream/main);
  - **behind 2268, ahead 2**, mergeBase `59004a62`. Bate com o `hermes --version`: "upstream 59004a62 · local ece8a96c (+2 carried commits)".
  - lockfiles mudados: `uv.lock`, `pyproject.toml`, `ui-tui/package.json`, `apps/desktop/package.json`.
  - riskNotes: TARGET_DIRTY, TARGET_ON_OTHER_BRANCH, LOCAL_CARRIED_COMMITS, LARGE_UPDATE, DEPENDENCY_CHANGE.
- **Zero mutação:** snapshot do host antes e depois (`e2e-hermes-before/after.txt`) é **idêntico** (HEAD, status sha16 `dddb488b…`, refs sha16 `de712232…`), e a própria tool reporta head, status e refs unchanged.
- **`apply hermes-agent` com execute+approval:** **REFUSED `AUTHORIZATION_SCOPE_REQUIRED`**. O sujeito `operator-2026-09-20` não tem o scope tier-3. Mesmo com ele, cairia em `HOST_ADAPTER_REQUIRED`/`LOCALPATH_READ_ONLY`.
- **`check engmcp`:** `UP_TO_DATE` (behind 0, ahead 35 = commits locais nunca pushados, coerente com "sem push").
- **`targets list`:** fonte bootstrap, com os 2 alvos.

## 6. Verificação em 3 camadas
- **Camada 0:**
  - **Lote 1:** c1–c3 supported. **c4 contradicted**, porque a redação "ran 1572 tests with 0 failures" omitia os 1566 pass e os skip. Reescrevi como c4b com os números exatos, e o lote 3 deu **ALL_SUPPORTED**.
  - **Lote 2:** c5–c7 supported. **c8** é o **controle falso plantado** ("mount read-write") e deu **contradicted**: o juiz pegou o controle.
- **Camada 1:** feita na claim `[consequência]` de deploy (§4): PASS.
- **Camada 2:** não disparada. A camada 1 passou, a única contradição real foi de redação e já está resolvida, e c8 é controle.

## 7. Registry de alvos
Os alvos vivem em `/data/upstream-targets.json` (override `ENG_MCP_UPSTREAM_TARGETS_FILE`). Enquanto esse arquivo não existe, vale o bootstrap versionado. O primeiro `targets upsert` executado materializa o arquivo a partir do bootstrap.

## 8. Gray-zones (declaradas)
1. **Registry fora de `~/.hermes/`.** O container não monta `~/.hermes`, e o runner tem `ProtectHome=true`; a decisão é a mesma da MCP-IMPORT-GATE-01. Não criei o symlink `~/.hermes/upstream-targets.json`, porque o arquivo `/data` só nasce com um upsert tier-3 e um symlink pendente seria ruído. Quando o operador materializar o registry, o symlink é 1 comando.
2. **O adaptador systemd (hermes) não é executável a partir do container.** Apply real do hermes-agent exige um executor de host, que não existe e é trabalho futuro. Hoje o apply dele é recusado por design, em duas camadas: `HOST_ADAPTER_REQUIRED` e mount `:ro`.
3. **`plan` não foi rodado no hermes real.** O contrato só pede o check. Num partial clone `tree:0`, o diff de 2268 commits faz lazy-fetch de árvores sem teto de tempo. O `plan` está provado nas fixtures.
4. **Docker:** não há porta docker no container de produção. O lado registry do check funciona ao vivo; o digest local e o apply só com executor injetado (provado com porta fake).
5. **Grant do scope tier-3 `engineering:upstream:apply` não feito.** É consequência do operador. Sem ele, nenhum apply, rollback ou upsert real é possível, e isso é o esperado.
6. **"Notifica" do check:** hoje é a trilha de audit mais o sumário (`updateAvailable`). Ainda não há cron agendado nem ligação com IDS/notify-hermes; o verbo é cron-ável.
7. **Colisão de pipeline** com a missão concorrente (§4).
8. **Rug-pull:** as regras são heurísticas determinísticas sobre linhas adicionadas, com um cap de 4 MB de patch (`patchTruncated` quando excede). O juiz é advisory.

## 9. Artefatos
`evidence/upstream-sync-01/`:
- red-m1/m2/m3, green, suite;
- pipeline-call-1 e resume-1, pre/post-image, pre-deploy-ready;
- e2e-tools-list, e2e-check-hermes, e2e-hermes-before/after, e2e-apply-hermes-refused, e2e-check-engmcp, e2e-targets-list;
- selfcheck-payload/response 1-3, camada1-inspect, camada1-mount, mcpcall.mjs.

O manifesto da missão é `verify-upstream-sync-01.json`.
