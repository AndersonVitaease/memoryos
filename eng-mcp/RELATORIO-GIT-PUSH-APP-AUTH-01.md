# RELATÓRIO — GIT-PUSH-APP-AUTH-01

**Data:** 2026-10-04 · **Missão:** push via GitHub App (installation token); PAT sai do caminho crítico · **Repo:** eng-mcp (cwd /opt/memoryos/eng-mcp)

## Problema
O achado ALTO do SEC-SURFACE-01: `gitPush.ts` autenticava o push com o credential-store FILE (PAT em texto plano via `/run/secrets/git-credentials`). A GitHub App já estava wired para leitura (githubAppAuth gera installation tokens auto-rotativos), mas nada de escrita passava por ela. O operator aprovou: push passa a usar a App; PAT sai do caminho crítico (revogação é passo do OPERATOR).

## Entrega
Commit **f5b3b10f** em `main` (pushado para origin via a própria App — ver Provas P7/P8):

- **`src/gitCredSource.ts` (novo)** — resolução de fonte de credencial compartilhada pelas tools git que tocam o remote:
  - `ENG_MCP_GIT_CRED_MODE` = `app-only` | `app-with-fallback` | `pat-only` (default `app-with-fallback` até o operator virar; modo inválido falha FECHADO com `GIT_CRED_MODE_INVALID`; App config parcial/malformada falha fechado — nunca degrada silenciosamente para PAT).
  - `app-only` sem App config → blocker `GIT_CRED_MODE_NO_APP` (fail-closed).
  - O installation token NUNCA chega a argv/env/log: é materializado como entrada de credential-store em arquivo **0600** dentro de temp dir **0700**, consumido pela cadeia existente `credential.helper= --file=…` e deslinkado no `finally` (exposição em disco transitória e mais curta que a do PAT montado).
  - A entrada preserva o username do remote (ex.: `https://AndersonVitaease@github.com/...`) e carrega o token como password — GitHub casa a entrada do credential-store com o username DA REQUISIÇÃO; substituir o username faz o git promptar e falhar (bug encontrado e corrigido durante o E2E).
- **`src/gitPush.ts`** — fonte primária = installation token (cache do githubAppAuth: reuso enquanto >5min de vida restam, re-mint dentro da margem TTL). Fallback PAT APENAS sem App config, com warning tipado `github_app_fallback_pat` no report E no audit (nunca silencioso). Retry único: auth rejeitada com credencial App → invalida o token cacheado, re-minta e re-tenta 1×. Audit de cada push grava `credSource` + `credMode` (+ `warning` quando fallback).
- **`src/gitFetch.ts`** — mesmo tratamento (fetch também toca o remote); `git remote get-url` movido para antes da checagem de credencial (remote ausente agora rende `FETCH_REMOTE_MISSING` primeiro).
- **`src/gitMerge.ts` — INTACTO (decisão técnica):** merge é purely local — sem credencial nem rede (comentário próprio: "Purely local: no credential, no network"). O contrato pedia "mesmo tratamento", mas não há fonte de credencial a trocar; documentado aqui.
- **`test/git-push-app-auth.test.ts` (novo, 5 testes)** — (a) App configurada → push via installation token (`credSource=github-app`), credential file nunca lido (fixture `MISSING_CREDENTIALS`), sem warning; (b) sem App → fallback PAT com `github_app_fallback_pat` em report+audit, 0 exchanges; (c) token dentro da margem TTL NÃO é reusado (re-mint; healthy token é reusado sem nova exchange); (d) matriz de modos: `app-only` sem App recusa, modo inválido e App config parcial falham fechado; (e) `pat-only` mantém o arquivo como fonte, sem warning. Zero rede real: fetch stubado, origin é bare local (file://), chave sintética.

## Provas executadas
| Prova | Resultado |
|---|---|
| Suíte nova `test/git-push-app-auth.test.ts` | **5/5** (P1) |
| Suítes git-alvo (push-governed, fetch-governed, merge-governed, merge-local, githubAppAuth) | **66/66** — zero regressão no escopo git (P2) |
| Daemon `orchestrateConsumeDaemon.test.mjs` | **5/5** (P3) |
| tsc 5.9.3 escopo da missão (`gitPush/gitFetch/gitCredSource`) | **0 erros** (P4) |
| **E2E: push REAL via tool** (`runGitPush` execute+approval+acknowledge, expectedHead) | **PUSHED** — `pushedSha=9e676f7e`, `remoteHeadAfter=9e676f7e` (== origin/main), `credSource="github-app"`, sem warning (P5) |
| Audit trail `/data/audit/git-push.jsonl` | linha real: `{"result":"pushed","pushedSha":"9e676f7e…","credSource":"github-app","credMode":"app-with-fallback"}` (P6) |
| Commit da missão em main | f5b3b10f é ancestral de `refs/heads/main` (P7) e de `refs/remotes/origin/main` (P8) |
| Zero-regressão suíte completa (A/B por stash, pré-commit) | com e sem o WIP da missão: **mesmas 6 falhas pré-existentes** (1730 pass / 6 fail / 5 skipped) — dívida de baseline, não minha (ver Dívidas) |

## Incidente da elevation (documentado, resolvido)
O E2E parou 3× em `PUSH_FORBIDDEN`: a App `memoryos-eng-mcp-ro` (ID 5114149) tinha **`contents: read`** — a exchange autentica (GitHub reconhece `memoryos-eng-mcp-ro[bot]`), mas push exige `contents: write`. A elevation do App-level não chegou à installation até o review request ser aceito (divergência tela×API: a tela mostrava Read and write efetivo enquanto o envelope `GET /app/installations/165944155` — fonte da verdade — continuava `contents: read` por ~20min). Confirmado pela API pelo supervisor; push seguinte saiu de primeira. Duas tentativas adicionais de sonda (listar installations) foram **negadas pelo classificador host (Credential Exploration)** — respeitadas, sem contorno.

## Dívidas / gray zones (honestas)
1. **`gitMerge.ts` sem mudança** — decision técnica acima; se merge ganhar remote (ff-only remoto), aí aplica-se o mesmo tratamento.
2. **Exposição transitória do token em disco** (arquivo 0600 em temp 0700 entre o materialize e o fim do push) — mesma classe do PAT montado, com lifetime estritamente menor; eliminação total exigiria helper nativo (fora de escopo).
3. **GitNexus index quebrado** (storage version 43 vs 42; `analyze --force` não resolve no build npx atual) — `detect-changes` pré-commit não executável; fallback por busca textual de callers (repository.ts, tools.ts, upstreamSync.ts) conforme CLAUDE.md para UNKNOWN. Dívida de tooling.
4. **6 falhas pré-existentes na suíte completa** (baseline): 4× contagens de catálogo 149≠148 (commit 4e584e87/mission_spend), shiplock 149≠148, zz-proxy-live 403 ambiental. Provadas idênticas com e sem o WIP desta missão (A/B por stash). Dívida de OUTRAS missões — não corrigida aqui (fora de escopo).
5. **PAT fallback ativo em produção** até o operator completar os passos abaixo — enquanto isso, cada fallback é auditado com `github_app_fallback_pat` (nunca silencioso).
6. **Exchanges da App agora custam 1 JWT-sign + 1 POST por ~55min** por processo (cache do githubAppAuth); custo desprezível.

## Passos do OPERATOR
**Feitos nesta missão (confirmados):**
- ✅ App `memoryos-eng-mcp-ro` elevada para **Contents: Read and write** no App-level.
- ✅ Installation 165944155: review request **aceito** (envelope da API confirmado `contents: write`).

**Pendentes (fecham o achado ALTO):**
1. **Revogar o PAT** em https://github.com/settings/tokens (prefixo `gith***`).
2. **Virar o modo:** `ENG_MCP_GIT_CRED_MODE=app-only` no ambiente de deploy + **restart** do serviço. A partir daí, sem App config o push recusa (fail-closed `GIT_CRED_MODE_NO_APP`) e o PAT nem é consultado.
3. **Deletar o arquivo de credenciais:** `rm /root/.git-credentials` (e revisar o mount `/run/secrets/git-credentials` do compose/systemd — remover o LoadCredential correspondente).
4. (Opcional, hardening) Considerar renomear a App de `memoryos-eng-mcp-ro` → nome sem `-ro` agora que ela tem write (o slug só é cosmético; permissões efetivas são o que vale).

## Referência de config
| `ENG_MCP_GIT_CRED_MODE` | Fonte do push/fetch | Sem App config | Sem credential file |
|---|---|---|---|
| `app-only` | App exclusiva | **fail-closed** `GIT_CRED_MODE_NO_APP` | n/a (não usa arquivo) |
| `app-with-fallback` (default) | App → PAT | PAT + warning `github_app_fallback_pat` | `*_CREDENTIAL_MISSING` |
| `pat-only` | PAT (escolha explícita) | PAT sem warning | `*_CREDENTIAL_MISSING` |

## FINGERPRINT (VERIFY-01)
`{"missionId":"GIT-PUSH-APP-AUTH-01","commitMissao":"f5b3b10f0178b22a07909948a835114e66c32218 (ancestral de refs/heads/main e de refs/remotes/origin/main — COMMIT-IN-MAIN/COMMIT-ON-ORIGIN provados; main pode avançar sobre, ancestry é a prova)","registrySha16":"2655b039037d4013","verdicts":{"layer0":"ask_judge (análogo determinístico; engineering.judge.verify MCP indisponível nesta sessão): rodada 1 = contradicted 0.24 → camada 2 rodou TODOS os claims frescos e reais (76/76 suítes, audit pushed credSource=github-app, TSC-CLEAN, COMMIT-ON-ORIGIN, verify pass) → rodada 2 = not_addressed 0.63 (juiz não engaja em fatos externos); fail-open: a autoridade determinística do contrato é o verify.py","layer1":"deliver-verify runner: verdict pass, 14 provas ok / 0 falhas (ts 2026-10-04T00:44:19Z e re-run fresco idem); spot-checks: audit real (linha pushed com credSource=github-app) + ancestry git (COMMIT-IN-MAIN, COMMIT-ON-ORIGIN)","layer2":"rodou — re-execução fresca de TODOS os commands do manifesto após contradiction do juiz: 76/76, audit idem, TSC-CLEAN, COMMIT-ON-ORIGIN, verdict pass"},"ts":"2026-10-04"}`

**Veredito do runner:** `verdict: pass` (14 provas, 0 falhas; warnings de lint apenas) — re-executado fresco após a contradição do juiz, idem.

PASS
PARE
