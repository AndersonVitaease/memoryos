# Relatório — GH-APP-TOKEN-01 (PAT de usuário → GitHub App installation token)

**Commit:** `d4ea66f9db332a93b2b3210346234f999963b0ea` (local, `main`; sem push, **sem deploy** — por contrato).
**Evidência:** `evidence/gh-app-token-01/` (red, green, erros tsc).

## 1. Arquitetura

Novo módulo `src/githubAppAuth.ts` + wiring mínimo no único consumidor HTTP do GitHub (`src/githubRead.ts → githubFetchJson`, que atende as 10 operações do `engineering.github.read` e o `fetchBranchHeadFresh` usado pelo `git.push`).

| Peça | Comportamento |
|---|---|
| Config | `GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID` (numéricos, não-secretos), `GITHUB_APP_PRIVATE_KEY_FILE` (default `/opt/eng-mcp-secrets/github-app.private-key.pem`) |
| JWT | RS256, `iss`=App ID, `iat`=agora−60s, `exp`=agora+9min (dentro do teto de 10min do GitHub), assinado com o PEM (`node:crypto`, zero dependência nova) |
| Troca | `POST /app/installations/{id}/access_tokens` → token + `expires_at` + permissões |
| Cache | só em memória do módulo; reusado enquanto restar >5min de vida; renova sozinho depois disso; single-flight (chamadas concorrentes dividem uma troca); 401 do GitHub com token do App invalida o cache |
| Precedência | nenhuma variável de App → PAT exatamente como hoje (`GITHUB_TOKEN`/`GITHUB_TOKEN_FILE`); App configurado → App vence |
| Fail-closed | configuração parcial (só um ID) → `GITHUB_APP_CONFIG_INCOMPLETE`, **nunca** cai em silêncio para a PAT; IDs não numéricos → `GITHUB_APP_CONFIG_INVALID`; PEM ilegível/não-RSA → `GITHUB_APP_KEY_UNREADABLE`/`_INVALID`; 401/403/404 da troca → `GITHUB_APP_AUTH_REJECTED`/`_FORBIDDEN`/`_INSTALLATION_NOT_FOUND` |
| Scrub | `GitHubAppAuthError` faz scrub **no construtor** (PEM, JWT `eyJ…`, `gh[pousr]_`, `github_pat_`, `Bearer …`) e guarda só o `detail` já limpo; App ID, Installation ID e caminho do PEM aparecem só como sha16 |
| Catálogo de erros | 11 códigos `GITHUB_APP_*` adicionados em `src/errorEnvelope.ts` com remediação |

Override de base só para teste/verificação (`ENG_MCP_GITHUB_APP_API_BASE`): aceita `https://…` ou `http://` **apenas em loopback**, pra um env perdido não conseguir mandar o JWT em texto claro para host remoto.

Fora de escopo, de propósito: o `git.push` continua usando o arquivo `git-credentials` do operator (o App é read-only; push via App exigiria `Contents: write`, uma decisão separada do operator).

## 2. Red → green

Suíte nova `test/githubAppAuth.test.ts` (6 testes, rede zero; chaves RSA geradas a cada execução):

| # | Teste | Sem wiring (HEAD) | Com wiring |
|---|---|---|---|
| a | JWT: header `{alg:RS256,typ:JWT}`, `iss`, `iat` backdated, `exp−iat ≤ 600`, assinatura verificada com a chave pública; o token de instalação é o usado em `/repos/…`; App vence a PAT | **not ok** | ok |
| b | cache: 2ª chamada dentro do TTL = 0 trocas novas; com <5min de vida renova sozinho; 3 chamadas concorrentes = 1 troca | **not ok** | ok |
| c | App ausente → Bearer PAT, 0 trocas | ok (guard de regressão) | ok |
| c2 | config parcial → `GITHUB_APP_CONFIG_INCOMPLETE`, 0 chamadas de rede, sem fallback para PAT | **not ok** | ok |
| d | GitHub responde 401 ecoando JWT+PEM+token → mensagem sem nenhum deles; App ID só como sha16; PEM ausente → caminho só como sha16 | **not ok** | ok |
| e | `scripts/github-app-verify.sh` contra um GitHub fake (HTTP loopback): GREEN, exit 0, 1 troca, saída sem token/PEM/`eyJ`/IDs crus; PEM com modo 0644 → RED `FAIL key file mode` | ok (script puro) | ok |

Arquivo: `evidence/gh-app-token-01/red-without-wiring.txt` (2 ok / 4 not ok) → `green.txt` (28/28 com `githubRead.test.ts`).

**Bug encontrado pelo teste (d) e corrigido antes do commit:** a 1ª versão do wiring reembrulhava `error.detail` (cru) em `GitHubReadError`, cujo redator não conhece JWT → o JWT ecoado pelo GitHub vazava na mensagem. Corrigido fazendo o scrub no construtor (`detail` nunca fica cru).

## 3. Suíte do repo + typecheck

- `npm test`: **1486 testes, 1480 pass, 1 fail, 5 skipped.** A única falha é `test/zz-proxy-live.test.ts` ("LIVE /mcp-proxy…"): chama o proxy **em produção** e recebe `403 {"error":"Forbidden"}`. Não passa por nenhum código do GitHub e nada foi deployado; é ambiental/pré-existente, não é regressão desta missão.
- `tsc --noEmit`: **41 erros**, igual ao baseline medido antes de qualquer edição nesta sessão (o contrato dizia 40; o baseline real no disco hoje é 41). Zero erros nos arquivos tocados (`evidence/gh-app-token-01/tsc-errors.txt`).

## 4. Checklist de bootstrap do operator (uma vez só)

Passo a passo exato em **`scripts/github-app-bootstrap.md`**:
1. Criar o App na UI: webhook desligado, callback vazio, OAuth desligado, instalação só nesta conta. Permissões **todas Read-only**: Contents, Metadata (obrigatória), Pull requests (`get_pr`), Actions (`list_action_runs`), Checks (checks do `get_pr`). Mínimo absoluto = Contents + Metadata; as três extras mantêm as 10 operações funcionando. Nenhuma permissão de escrita.
2. Gerar a chave privada (.pem).
3. Instalar só no repo `memoryos`; o número no fim da URL é o Installation ID.
4. Um comando `scp … && ssh … install -m 600 … && shred -u …` → `/opt/eng-mcp-secrets/github-app.private-key.pem` (0600).
5. Gravar os 2 IDs em `/opt/eng-mcp-secrets/github-app.env` (0600).
6. `scripts/github-app-verify.sh` → `RESULT GREEN` (valida config, modo 0600, chave RSA + fingerprint sha16, JWT RS256, token de instalação + permissões + menor privilégio, `GET /repos/AndersonVitaease/memoryos`). Saídas: exit 0 GREEN, 1 RED, 2 NOT_CONFIGURED. Sem App configurado hoje, dá `NOT_CONFIGURED` (verificado).

## 5. Checklist de transição (depois do bootstrap; cada item é missão/gesto separado)

1. [operator] Bootstrap §4 → `github-app-verify.sh` GREEN.
2. [missão de deploy governado] Ligar o App no container: `LoadCredential` do .pem no `eng-mcp-release-runner` → mount `-v …:/run/secrets/github-app-key:ro` + `-e GITHUB_APP_PRIVATE_KEY_FILE=/run/secrets/github-app-key` + `-e GITHUB_APP_ID/-e GITHUB_INSTALLATION_ID` (a partir de `github-app.env`) em `scripts/eng-mcp-release.mjs` (mesmo padrão já usado com `GITHUB_TOKEN_FILE`). Atenção: o PEM precisa ser legível pelo usuário do container. Depois o pipeline normal commit→test→build→candidate→deploy.
3. [smoke] `engineering.github.read get_repo` + `get_rate_limit` em produção. Prova de que passou pelo App: com `GITHUB_TOKEN_FILE` removido do candidate, `get_repo` continua 200 (sem App, daria `GITHUB_CREDENTIAL_MISSING`).
4. [operator] Revogar a PAT antiga na UI (sha16 `329ea79f…`) — **só depois do passo 3**. Não revoguei (por contrato).
5. [operator] Apagar o arquivo 0644 em `/opt/eng-mcp-secrets/` cujo **nome** contém a PAT (pendência já registrada pela security-pat-fix-deploy-01; ainda está no disco hoje) e os `github-pat`/`GITHUB_TOKEN_FILE` antigos, depois que a PAT for revogada.
6. Sweep do sha16 antigo em disco/audit = 0 (varredura da pat-hygiene-01 rodada de novo).

## 6. Coordenação

Só entraram no commit `src/githubAppAuth.ts`, `src/githubRead.ts`, `src/errorEnvelope.ts`, `test/githubAppAuth.test.ts` e `scripts/github-app-{verify.ts,verify.sh,bootstrap.md}`. Os arquivos da scope-grant-01 (provas/, relatorio-/missao- dela), o `/root/.hermes/plugins/mission-ops` e o registry não foram tocados. Nenhum PEM, JWT ou token real foi manipulado ou impresso (só fixtures sintéticas).

Índice do GitNexus inutilizável nesta sessão (storage version 43 vs 42 → impact `UNKNOWN`). Troquei pela busca textual: `githubFetchJson` é privada do módulo e só é chamada pelas ops do `githubRead.ts`.

## RESULT

**GREEN (código).** O eng-mcp aceita GitHub App installation token que se renova sozinho e fica só em memória. Fallback honesto para a PAT quando o App está ausente, fail-closed quando a configuração está parcial, scrub no construtor. Os 6 testes novos passam de red para green; suíte com 1480/1486 passando (a falha única é o teste LIVE de produção, alheio a esta missão); tsc igual ao baseline (41). O bootstrap do operator está documentado e a verificação é executável. **Pendente (fora desta missão):** o bootstrap na UI pelo operator, o deploy governado com o wiring do .pem e dos IDs no container, o smoke, a revogação da PAT e o sweep.

## 7. Autoverificação (VERIFY-01)

- Camada 0, `engineering.judge.verify` rodada 1 (`evidence/gh-app-token-01/judge-verify.json`): `HAS_CONTRADICTIONS` (3 supported, 2 contradicted). c1 (red 4/6 → green), c3 (tsc 41) e c4 (suíte 1480/1486) saíram supported; c2 e c5 saíram contradicted.
- Rodada 2, com as claims reescritas literalmente (`judge-verify-2.json`): c5 (os 7 arquivos do commit) → **supported**. c2 → **not_addressed**, mesmo com a evidência contendo a linha literal `# pass 28` / `# fail 0`.
- Camada 1, spot-check manual de c2: `evidence/gh-app-token-01/green.txt` tem 28 linhas `ok` e termina em `# pass 28` / `# fail 0`. **Claim mantida.** Zona cinzenta declarada: nessa claim o juiz não acompanhou a evidência; o veredito vem do artefato.
- `registrySha16` não foi coletado: a missão não toca o registry.
