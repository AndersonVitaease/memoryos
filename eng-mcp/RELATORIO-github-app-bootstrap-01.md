# Relatório — GITHUB-APP-BOOTSTRAP-01 (PAT de usuário → GitHub App)

**Status: App ATIVO em produção (github.read usa o token do App; fallback para a PAT preservado). Único item pendente: E2E da rotação de chave, que precisa de uma 2ª chave gerada pelo operator na UI do GitHub (§10).**

- **Commit:** `2872e21d0ef79021f795b8385a98f01ec4423b39` (local, `main`, sem push).
- **Deploy :8787:** job `18163ded-3da7-4fe3-bcd9-f19f0feae5d3` success + smoke PASS.
  Imagem `candidate-20260928205521230-c618f7eb49e7` → `candidate-20260928212639473-a583c303ca9c`.
- **Evidência:** `evidence/github-app-bootstrap-01/`.

## 1. O que foi entregue

| Peça | Arquivo | Comportamento |
|---|---|---|
| Verbo read-only | `engineering.github.app.bootstrap` (`src/tools.ts`) | Puro: sem rede, sem segredo, sem mutação. Devolve o manifest, o `state` anti-CSRF, o `formAction`, a página launcher (HTML e `data:` URL) e 2 passos para o operator. Escopos `engineering:read` + `engineering:github:read`. Catálogo 128 → 129. |
| Manifest | `src/githubAppBootstrap.ts` | Permissões **só read**: contents, metadata, pull_requests, actions, checks. Qualquer nível diferente de `read` é recusado na construção. Webhook inativo, `redirect_url` só loopback. Observação: o manifest flow do GitHub é um **form POST**. Um link GET não carrega o manifest, então a entrega é uma página que se auto-submete. |
| Troca do código | `scripts/github-app-convert.ts` (host) | O código entra por STDIN, nunca por argv. `POST /app-manifests/{code}/conversions` → PEM 0600 em `/opt/eng-mcp-secrets/github-app.private-key.pem` (nunca sobrescreve) + `github-app.env` 0600 com os 2 IDs. Confere o `state`. Recusa App convertido com permissão de escrita. Código expirado ou já usado → `GITHUB_APP_BOOTSTRAP_CODE_EXPIRED_OR_USED`. Sem instalação ainda → `PENDING_INSTALL` (exit 3) + `--resolve-installation`. A saída só leva IDs, slug, permissões e sha16. |
| Rotação de PEM | `scripts/github-app-rotate.ts` | Prova no GitHub (`GET /app`) que a chave NOVA vale **antes** de trocar. Guarda a antiga como `.prev` (`--rollback` disponível). Imprime as fingerprints (sha16 e o formato `SHA256:` que a UI do GitHub mostra), para o operator saber qual chave antiga apagar. |
| Cache segue a chave | `src/githubAppAuth.ts` | A chave do cache agora inclui a identidade do arquivo (inode/mtime/size). Trocar o PEM derruba o token em cache, e a próxima chamada já usa a chave nova. |
| Wiring de deploy | `scripts/eng-mcp-release-runner.mjs`, `scripts/eng-mcp-release.mjs` | Os LoadCredentials `github-app-private-key` / `github-app-env` são opcionais. O runner repassa só IDs numéricos e o caminho da chave (nunca lê a chave). `githubAppDockerArgs` é tudo-ou-nada: monta a chave `ro` em `/run/secrets/github-app-key`. Config parcial ou malformada não adiciona nada, e o container segue na PAT. |
| Doc | `scripts/github-app-bootstrap.md` | Seções "Manifest flow" e "PEM rotation". |

## 2. Testes
- `test/githubAppBootstrap.test.ts`: 8 testes. Cobrem o manifest read-only, o launcher, o parse do código/state, a conversão (scrub, expirado, write recusado), o E2E do convert script contra um GitHub fake (0600, sem PEM no stdout, sem overwrite, pending install), a rotação (chave nova provada antes do swap), o cache que segue o arquivo e o wiring de deploy.
- Local: bootstrap + auth 14/14, com githubRead 36/36. Suíte: **1521 / 1515 pass / 1 fail / 5 skip**. O único fail é `LIVE /mcp-proxy`, ambiental e pré-existente (igual às missões anteriores). Detalhe em `suite.txt`.
- Pipeline test: 1521 / 1515 / 0 failed, `expectedToolCount` 129.
- tsc: nenhum erro novo nas linhas tocadas. Os erros de `tools.ts:247` e `:1309` já existiam antes.

## 3. E2E em produção (antes do App)
- `engineering.github.app.bootstrap` em produção: permissões todas `read`, hook inativo, redirect loopback, `manifestSha16` `739140c7f51dd601` (igual ao gerado no Passo 0). Arquivo: `e2e-bootstrap-prod.json`.
- O container tem 0 variáveis `GITHUB_APP*`, então o caminho PAT fica intacto. `github.read get_repo` → 200 (`e2e-pat-fallback.json`).
- `scripts/github-app-verify.sh` → `NOT_CONFIGURED`, como esperado.

## 4. Pendente: operator (consequência externa, conta GitHub)
1. Abrir o launcher, conferir que as permissões estão todas Read-only e clicar **Create GitHub App**.
2. Copiar a URL da barra (`http://127.0.0.1:65535/...?code=...&state=...`; a página dá erro de carregamento, é esperado) e colar no chat. Depois, **Install App** só no repo `memoryos`.
   - O launcher fica em `evidence/github-app-bootstrap-01/launcher-dataurl.txt` (ou `launch.html`). O `state` está em `launch-state.json`.
   - O código vale 1h e é de uso único. Se expirar, é só regenerar com `engineering.github.app.bootstrap` e pedir outro.

## 5. Pendente: missão (depois do código)
1. `printf '%s' '<URL>' | GITHUB_APP_LAUNCH_STATE_FILE=evidence/github-app-bootstrap-01/launch-state.json node --import tsx scripts/github-app-convert.ts`
2. `scripts/github-app-verify.sh` → GREEN.
3. LoadCredential `github-app-private-key` + `github-app-env` via `engineering.vps.systemd.credential`. Depois, restart do runner (a mudança no `.mjs` do runner só vale após o restart) e redeploy.
4. E2E em produção: `github.read get_repo` com o token do App (`authMode` App) e o fallback para a PAT preservado.
5. Rotação E2E: gerar uma chave nova na UI → `.pem.new` → `github-app-rotate.ts` → restart + redeploy → E2E → o operator apaga a chave antiga.

## 6. Aposentadoria da PAT (proposta; a decisão é do operator)
Consumidores mapeados da PAT (`/opt/eng-mcp-secrets/github-pat`, idêntica a `github-pat.sec`):
- Runner: `LoadCredential=github-pat` (`override.conf`) → container `GITHUB_TOKEN_FILE=/run/secrets/github-pat`.
- `src/githubRead.ts` é o **único** consumidor HTTP: as 10 operações do `github.read` e o `fetchBranchHeadFresh` do precheck do `git.push`.
- `git.push` autentica pelo `git-credentials`, que está fora de escopo.
- Referências só em scripts de evidência/higiene (`/opt/pat-hygiene-01`, `smoke-p5.sh`). Não são consumidores em runtime.

Proposta, a aplicar só depois do App validado em produção: (a) manter a PAT como fallback por um período de observação; (b) o operator revoga a PAT na UI do GitHub; (c) remover o `LoadCredential=github-pat` + o arquivo, por mudança governada. Nada disso é automático.

## 7. Gray-zones
- Não testei o launcher `data:` num navegador real daqui. Chrome/Firefox aceitam `data:` digitado na barra; se bloquear, o operator abre o `launch.html`.
- A conversão real, a instalação e a troca de token com o App real ainda não aconteceram: dependem do código do operator.
- A rotação só foi testada contra um GitHub fake. O E2E real depende do App existir.

## 8. Verificação
- **Camada 0:** `judge.verify` foi chamado 2 vezes (7 claims, das quais `c7` é um controle falso). As duas deram `JUDGE_TIMEOUT` no provider (`judge-verify.json`, `judge-verify-2.json`). Segui sem o juiz, como a convenção manda, e isso fica declarado aqui. O juiz deve ser re-rodado no fechamento.
- **Camada 1:** feita na única claim `[consequência]` (o deploy), com `docker inspect` (`post-image.txt` = `candidate-20260928212639473-a583c303ca9c`) e o resume do pipeline (status `success`, smoke `success`). **PASS.**

## 9. Progresso depois do código (18:50)
- **Conversão** (`convert.json`): App `memoryos-eng-mcp-ro`, ID 5114149, owner AndersonVitaease. Permissões todas `read`. O state bateu (`stateChecked: true`), `pemSha16` `0dcb451085b4ada6`. `/opt/eng-mcp-secrets/github-app.private-key.pem` e `github-app.env` gravados com 0600, e nada secreto saiu no stdout.
- **Chave aceita pelo GitHub** (`app-key-check.json`): `GET /app` com JWT → 200, `installations_count` 0, `events` vazio. Fingerprint da chave (SPKI) `463aef5c9d83fda7`.
- **Drop-in** `eng-mcp-release-runner.service.d/github-app.conf` com 2 LoadCredentials; `systemd-analyze verify` exit 0; `daemon-reload` feito. O runner ainda **não** foi reiniciado.
  - Por que não usei `vps.systemd.credential`: o verbo gerencia 1 credencial por unit dentro de `credentials.conf` (reescreve o arquivo) e só aceita fontes em `/opt/eng-mcp-release-data/credentials`. O contrato manda o PEM para `/opt/eng-mcp-secrets`, então segui o precedente do `override.conf` (github-pat/git-credentials).
- **Bloqueio:** `--resolve-installation` → `PENDING_INSTALL`. Sem o Installation ID, o runner não repassa a config do App (é tudo-ou-nada). Por isso o restart e o redeploy esperam o Install App.

## 10. E2E final (21:53–22:00 UTC)
- **Instalação:** `--resolve-installation` → GREEN, Installation ID 165944155 (`resolve-installation.json`).
- **`scripts/github-app-verify.sh` → RESULT GREEN** (`verify-sh-1.txt`): chave RSA com modo 600, JWT RS256, token de instalação `selection=selected`, permissões todas read, least privilege OK, `GET /repos/AndersonVitaease/memoryos` OK.
- **Restart do runner (governado):** `engineering.vps.runner.restart` PLAN → execute+approval → RESTARTED, pid 464251 → 907387 (`runner-restart-*.json`). `github-app-env` e `github-app-private-key` aparecem em `/run/credentials/eng-mcp-release-runner.service/`, e o runner ficou `active/running`.
- **Redeploy :8787:** deploy.ready READY/IN_SYNC → pipeline job `9e13cfc0-caec-442b-883f-d6669a68849a`: test/build/candidate OK, deploy success, smoke PASS. Imagem `candidate-20260928212639473-a583c303ca9c` → `candidate-20260928215521583-a583c303ca9c`. No container: `GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID` e `GITHUB_APP_PRIVATE_KEY_FILE` definidos, chave legível e `GITHUB_TOKEN_FILE` (PAT) ainda montado.
- **Produção usando o App** (`e2e-authmode-prod.json`): `resolveGithubAuth` rodado dentro do container, com o env de produção, retorna `mode: "app"` e um token diferente da PAT. O bucket do App caiu para 4998 (mesmo `resetAt` 22:53:47 que a resposta do `github.read get_repo`, `e2e-app-get_repo.json`); o bucket da PAT ficou intacto em 5000.
  - Observação: `github.read` não expõe `authMode` na resposta. A prova é o resolver do próprio módulo em produção somada aos buckets.
- **As operações do `github.read` via App** (`e2e-app-ops.txt`): get_repo, get_branch_head, list_commits, list_action_runs, list_refs, get_file e get_rate_limit, todas OK. Depois delas, a PAT continuava com `used: 0`: nenhuma chamada do servidor passou pela PAT.
- **Fallback para a PAT preservado** (`e2e-pat-fallback-prod.json`): no mesmo container, sem as 3 variáveis do App → `mode: "pat"`, e `GET /repos/...` com a PAT → 200.
- **Grant `engineering:mcp:import:approve`:** existe no registry para o subject `trueforge` (o bearer do operator). O bearer desta missão (sha16 `ff337ee621dcac23`) não tem esse escopo, então o probe em PLAN dá `REFUSED AUTHORIZATION_SCOPE_REQUIRED`. Isso é o esperado para tier-3 (`e2e-import-approve-plan.json`). Não fiz o E2E do approve com o bearer do operator.

## 11. Rotação de chave: mecanismo pronto, E2E real pendente do operator
- O mecanismo está testado contra GitHub fake (`test/githubAppBootstrap.test.ts`): a chave NOVA é provada (`GET /app`) antes do swap, a antiga fica em `.prev` (com `--rollback`), e o cache do token é invalidado quando o arquivo muda.
- **E2E real:** não existe API do GitHub para gerar chave de App, então só o operator consegue gerar a 2ª chave. Passos:
  1. [operator] https://github.com/settings/apps/memoryos-eng-mcp-ro → Private keys → **Generate a private key** (a chave atual continua válida).
  2. [operator] `scp <arquivo>.pem root@<VPS>:/opt/eng-mcp-secrets/github-app.private-key.pem.new && ssh root@<VPS> chmod 600 /opt/eng-mcp-secrets/github-app.private-key.pem.new`
  3. [missão] `node --import tsx scripts/github-app-rotate.ts` → SWAPPED → runner restart → redeploy → `github-app-verify.sh` GREEN + `github.read` em produção.
  4. [operator] apagar na UI a chave antiga, identificada pelo `oldKeyGithubFingerprint` que o script imprime. A chave atual tem SPKI sha16 `463aef5c9d83fda7`.

## 12. Aposentadoria da PAT: proposta (decisão do operator)
O App cobre hoje 100% do consumo HTTP da PAT, que é o `githubRead`. Proposta:
1. Observar alguns dias com a PAT só como fallback. O sinal de que nada depende dela é o `used` da PAT ficar em 0.
2. O operator revoga a PAT na UI do GitHub.
3. Mudança governada: remover `LoadCredential=github-pat` do `override.conf` e o arquivo `/opt/eng-mcp-secrets/github-pat` (+ `.sec`), depois restart e redeploy.

Ponto de atenção: a partir daí, falha do App = sem fallback, e isso é fail-closed (erro tipado, sem vazamento). O `git.push` continua no `git-credentials`, fora de escopo. Nada foi revogado ou removido.

## 13. Verificação final
- **Camada 0:** `judge.verify` foi chamado 3 vezes. A última tinha 7 claims, com `c7` = controle falso ("rotação executada E2E"). Todas deram `JUDGE_TIMEOUT` no provider (`judge-verify*.json`). Pela regra fail-open, isso não trava a missão: declarado aqui e **não verificado pelo juiz**.
- **Camada 1:** feita nas claims `[consequência]`:
  - **Restart do runner:** o `systemctl` mostra novo MainPID 907387, `active/running`, e as credenciais do App em `/run/credentials`.
  - **Deploy:** `docker inspect` mostra `candidate-20260928215521583-a583c303ca9c`, e o resume do pipeline, status success + smoke success.
  - **App em uso:** resolver dentro do container = `app`, e a PAT com `used: 0`.
  - Resultado: **PASS**.
- **Manifesto** `verify-github-app-bootstrap-01.json` (owner `github-app-bootstrap-01`): 8 cmds + 5 files, 13/13 PASS.
- **Varredura de segredos:** evidence, relatório, manifesto e journal do runner → 0 ocorrências de PEM, token `gh*_`/`github_pat_` ou JWT.
