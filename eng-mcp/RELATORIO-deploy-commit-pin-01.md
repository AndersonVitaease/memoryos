# RELATÓRIO — deploy-commit-pin-01 (deploy só de commit declarado)

**Status:** CONCLUÍDA. Regra ativa no runner e no MCP de produção. O primeiro deploy fixado por commit está em produção (`commit-4a209a78`, revision label == SHA, trilha `builtFrom:"commit"`, `treeClean:true`), feito pelo pipeline corrigido (ver §5).

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

## 5. Deploy com o pipeline corrigido (item 5) — FEITO

Meu deploy dogfood foi negado pelo classificador de permissão (Production Deploy), e não tentei nenhum caminho alternativo. O **primeiro deploy fixado por commit** foi feito depois, pelo pipeline corrigido, na missão seguinte (SECLAYER-IDS-LINK-01). O commit `4a209a78` contém `f2a6ae6f`. Conferi tudo por leitura (`prod-*.json/txt`, `prod-provenance-deploy-lines.jsonl`):

- **Job `a08a37f0`:** deploy `success`, exit 0, `commit=4a209a78d27b9293e45ad75052b087753015f072`.
- **Container de produção** (P2 em produção):
  - imagem `eng-mcp-candidate:commit-4a209a78d27b9293e45ad75052b087753015f072`;
  - labels `org.opencontainers.image.revision=4a209a78…` e `io.memoryos.eng-mcp.built-from=commit`;
  - portanto imageTag == SHA esperado;
  - `/mcp` sem auth → 401.
- **Trilha** (P3 em produção): `deploy_started` (23:45:08Z, **antes** da troca do container, 23:45:19Z) e depois `deploy_succeeded` (23:45:26Z, após o smoke). Ambos com `{commitSha:4a209a78…, imageTag:commit-4a209a78…, treeClean:true, builtFrom:"commit"}`.
- **Rollback continua referenciando o SHA** (P4 em produção, parte de referência): `previousImage=candidate-…4f4f5721`, `previousCommitSha=23fc1933`.
  - Esse SHA veio dos **meus registros retroativos** (§4), o que prova a compat do item 3 no primeiro uso real.
  - O `release-state` tem `currentCommitSha=4a209a78`, `deployStatus`/`smokeStatus` PASS.
- **MCP de produção:** `engineering.release.pipeline` expõe `commitSha` (catálogo 130). Sem `commitSha` → `DEPLOY_COMMIT_REQUIRED` com **zero chamadas ao runner** (`evidence: []`).
- **Fica sem prova em produção:** a *execução* de um rollback. Nenhum deploy falhou, então P4 execução segue provado só em fixture.
- **Cosmético:** o wrapper ERROR-01 não conhece `DEPLOY_COMMIT_REQUIRED` ("No typed code matched"). A mensagem e o código chegam corretos; incluir o código na taxonomia é trabalho futuro.

## 6. Gray-zones

- O **processo do runner** carrega `scripts/` da working tree canônica. A regra protege a *imagem*, não o runner. Com a árvore limpa, o runner = commit.
- `.claude/skills/gitnexus-*` e os hashes de token deixam de entrar na imagem. O primeiro deploy de commit passou no smoke, com os tokens vindo do mount.
- Em produção estão provados P1, P2, P3 e a referência de SHA do P4. A *execução* de rollback só foi provada em fixture.
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
