# RELATÓRIO — deploy-commit-pin-01 (deploy só de commit declarado)

**Status:** código e regra ativos no runner de produção. **Deploy dogfood PENDENTE do operador** (negado pelo classificador de permissão; ver §5). Produção não foi tocada: continua em `4f4f5721` = `23fc1933`.

## 1. Entrega

Commit **`f2a6ae6f`** (`f2a6ae6ffed959de2be3cce13511adcec09a51a8`):

- **`engineering.release.pipeline` exige `commitSha`.**
  - Numa execução nova, `commitSha` (40 hex) é obrigatório. Sem ele: `DEPLOY_COMMIT_REQUIRED`, com zero chamadas ao runner.
  - O SHA é repassado a test/build/candidate/deploy.
  - O resume por `deployJobId` continua funcionando: o job já carrega o commit.
- **Runner** (`eng-mcp-release-runner.mjs`):
  - `commit` só é aceito nos estágios do pipeline e é **obrigatório** em build/candidate/deploy (400 `DEPLOY_COMMIT_REQUIRED`).
  - Fora desses estágios: `COMMIT_NOT_ALLOWED_FOR_OPERATION`.
- **Ação de release** (`eng-mcp-release.mjs`):
  - **Árvore limpa em todo estágio.** Arquivos tracked modificados, staged ou untracked não-ignorados nos caminhos do deploy (`src test scripts .claude package*.json tsconfig.json Dockerfile .dockerignore`) → `DEPLOY_DIRTY_TREE`, com a lista dos arquivos. É fail-closed: nunca "deploya mesmo assim".
  - **Árvore isolada.** O stage test extrai o SHA com `git archive` numa árvore isolada, e a imagem nasce **dela**:
    - tag `eng-mcp-candidate:commit-<sha40>`;
    - label OCI `org.opencontainers.image.revision=<sha>`;
    - uma imagem por commit: tag existente é reusada, revision divergente = `IMAGE_TAG_COMMIT_CONFLICT`.
  - **Amarração ao commit testado.** build/candidate/deploy exigem o commit+tree testados (`DEPLOY_COMMIT_STATE_MISMATCH`). O commit precisa ser o HEAD ou um ancestral (`DEPLOY_COMMIT_NOT_IN_HISTORY` / `_NOT_FOUND`). Um teste de working tree nunca amarra commit.
  - **Proveniência.** `/data/audit/deploy-provenance.jsonl` recebe `{commitSha, imageTag, imageId, treeClean, builtFrom:"commit", commitTreeSha, headSha, previousImageTag, previousCommitSha, jobId}`:
    - `deploy_started` é gravado **antes** de qualquer mutação, fail-closed: sem trilha não há deploy;
    - depois `deploy_succeeded` ou `deploy_failed`.
  - **Rollback** volta para a imagem anterior **e o SHA dela**, gravando `event:"rollback"` com os dois lados.
- **Arquivos de hash de token:** um build de commit não os carrega. O deploy aponta o runtime para a cópia do host via mount de identidade (`tokenHashFileArgs`, env `ENG_MCP_*_TOKEN_FILE`, que o runtime já lia).
- **Higiene:**
  - `tsconfig.json` passou a ser versionado. O Dockerfile faz `COPY tsconfig.json` e o arquivo estava **fora do git**, então um build de commit quebraria.
  - Novo `eng-mcp/.gitignore` com `*.token.json` (o CLAUDE.md dizia "ver .gitignore", mas **não estava ignorado**) e `.claude/skills/gitnexus-*/` (artefato do `gitnexus analyze`, que nada no container usa).
- Zero LLM no runner: só git, tar e docker.

## 2. Provas red→green (`test/deployCommitPin.test.ts`, fixture monorepo + fake docker)

| Prova | Resultado |
|---|---|
| **Red** em `0638aa1d` (código antigo, stubs para exports ausentes) | **11/11 fail** — `evidence/.../red-head-0638aa1d.txt` |
| **Green** em `f2a6ae6f` | **11/11 pass**; com os testes de release vizinhos, **74/74** — `green-f2a6ae6f.txt` |
| P1 árvore suja → recusa com lista | fixture + **produção real** (abaixo) |
| P2 commit limpo → imageTag == `commit-<sha>`, contexto = árvore isolada, label == sha, 1 build por commit | fixture |
| P3 proveniência antes da mutação; audit ilegível → recusa sem mutar | fixture |
| P4 deploy falho → rollback, e trilha + state referenciam o SHA | fixture |

Ajustes de teste feitos nesta retomada:
- `assert.rejects` com regex casa com `String(error)`, que começa com `Error: `. Corrigido.
- `mutationCalls` agora tem default para um log vazio.
- `release-smoke-grace` T7 procurava a assinatura antiga `candidateAction(config)`.

Typecheck: 41 erros antes e 41 depois, idênticos e pré-existentes; **zero novos**. GitNexus `impact` voltou `UNKNOWN` (índice storage v43 vs engine v42). Confirmei por busca textual: os únicos chamadores de build/deploy são `engineering.release.pipeline`, e `engineering.release.run` é placeholder (`echo`).

## 3. Produção (runner reiniciado, sem deploy)

`engineering.vps.runner.restart`: PLAN sem blockers → execute+approval → **RESTARTED**, pid 907387 → **1041976**, os 5 critérios true.

Recusas reais no runner de produção:

| Chamada | Resposta |
|---|---|
| `build` sem commit | 400 `DEPLOY_COMMIT_REQUIRED` |
| `deploy` sem commit | 400 `DEPLOY_COMMIT_REQUIRED` |
| `status` com commit | 400 `COMMIT_NOT_ALLOWED_FOR_OPERATION` |
| `test` com `f2a6ae6f` e probe untracked `src/__deploy_pin_probe.ts` | `DEPLOY_DIRTY_TREE: 1 file(s) … src/__deploy_pin_probe.ts` em 58 ms, sem tocar state. Probe removido. |

## 4. Compat — registros retroativos (item 3)

Foram anexados 9 `retroactive_record` (os deploys de 28/09) em `/opt/eng-mcp-release-data/production/audit/deploy-provenance.jsonl`. Nada foi re-deployado.

**Método determinístico** (`retro-provenance.mjs` + `image-vs-commit.mjs`):
1. o hash de fonte do commit bate com o sufixo da tag; **ou**
2. o conteúdo real de `/app` da imagem (package.json, tsconfig.json, src, test, .claude) coincide com o HEAD no momento do deploy.

**Resultado:**
- **8 de 9 reproduzíveis.** Produção atual `36d95f78` → **`23fc1933`**: código idêntico. Extras só untracked não-código: hashes de token, skills gitnexus, `.rg-debug.log` e o `tsconfig.json`, que é byte-idêntico ao agora versionado.
- **`bcc0f546` (GUARDIAN-SECLAYER-B, imagem `3220c552`) → `commitSha:null`, `reproducible:false`.** A imagem carregou **10 arquivos nunca commitados** em `dc7d8f66`: `src/upstreamSync.ts`, `src/tools.ts`, `src/registryScopeGrant.ts`, `src/upstream/*.json` e 6 testes. É o defeito §8.1 provado arquivo a arquivo.

## 5. O que ficou pendente — AÇÃO DO OPERADOR

O deploy dogfood (`runOfficialReleasePipeline(undefined, f2a6ae6f…)`, executado no host pelo socket oficial) foi **negado pelo classificador de permissão (Production Deploy)**. Não tentei nenhum caminho alternativo.

**Consequência operacional (importante):** o runner já exige commit, mas o MCP de produção roda o `tools.ts` antigo, sem `commitSha`. **Até `f2a6ae6f` ir para produção, `engineering.release.pipeline` recusa qualquer deploy de qualquer missão** (fail-closed, `DEPLOY_COMMIT_REQUIRED`). Seguro, mas bloqueia shipping.

Para destravar, o operador roda:
```
! cd /opt/memoryos/eng-mcp && node --import tsx evidence/deploy-commit-pin-01/dogfood.ts f2a6ae6ffed959de2be3cce13511adcec09a51a8
! cd /opt/memoryos/eng-mcp && node --import tsx evidence/deploy-commit-pin-01/dogfood.ts --resume <deployJobId devolvido>
```
Esperado: imagem `eng-mcp-candidate:commit-f2a6ae6f…`, label revision == SHA, e as linhas `deploy_started`/`deploy_succeeded` com `builtFrom:"commit"`. Daí em diante, o próprio `engineering.release.pipeline {acknowledgeRelease, commitSha}` funciona via MCP.

**Rollback da regra, se preferir não deployar agora:** `git revert f2a6ae6f`, depois restart do runner.

## 6. Gray-zones

- O **processo do runner** carrega `scripts/` da working tree canônica. A regra protege a *imagem*, não o runner. Com a árvore limpa, o runner = commit.
- `.claude/skills/gitnexus-*` e os hashes de token deixam de entrar na imagem, porque o build de commit não os carrega. Nada em `src/` usa as skills; os tokens seguem pelo mount. **Só será confirmado de fato no primeiro deploy de commit.**
- P2/P3/P4 foram provados em fixture, **não em produção**: dependem do deploy pendente.
- `verify.json` e `verify-github-app-bootstrap-01.json` estavam modificados por outra sessão e ficaram de fora dos commits. O segundo perdeu o campo `owner`; convém o dono conferir.
- Não houve push. Não mexi em gpu-watchdog, mission-ops/deliver-verify, mission-supervisor, guardian-compute nem fast/shadow-router.

Verify: `verify-deploy-commit-pin-01.json` → **11/11 PASS** (`evidence/deploy-commit-pin-01/verify-run.txt`).

## 7. Verificação (VERIFY-01)

- **Camada 0: `engineering.judge.verify`** (`judge-verify-3.json`) → `HAS_CONTRADICTIONS` (4 supported, 2 contradicted).
  - **c5 contradicted = controle proposital** ("o deploy dogfood foi feito"). O juiz pegou a falsidade, como esperado.
  - **c1 contradicted:** a claim juntava red e green, e a evidência não dizia que o red rodou em `0638aa1d`. Dividi em c1a/c1b e reenviei, mas o provedor deu `JUDGE_TIMEOUT` 3× (fail-open). Resolvido na camada 1.
- **Camada 1** (`camada1-spotcheck.txt`), feita contra o estado real:
  - red `0638aa1d` = 11 tests / 0 pass / 11 fail;
  - green `f2a6ae6f` = 11/11 pass;
  - claim `[consequência]` do runner: `MainPID=1041976 active/running`, e pre 907387 → post 1041976 com os 5 critérios true;
  - imagem de produção inalterada (`4f4f5721`), o que confirma que **não** houve deploy.
- **Camada 2:** não acionada. Os spot-checks passaram, e a única contradição restante é o controle.
