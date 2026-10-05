# RELATÓRIO — SHIP-ENG-MCP-8D9EC634-01

**Data:** 2026-10-05 · **Pane:** w7:p2 · **Pipeline executado host-side pelo supervisor** (opção 2 aprovada pelo operator no menu do worker)

## Sumário

SHIP do eng-mcp concluída: push + pipeline oficial completo (test → build → candidate → deploy → poll → smoke) com **todas as etapas PASS** e **produção promovida**.

## Sequência real (provas em /opt/mission-events/)

1. **Push host-side** do origin/main: `357ad749..8d9ec634` (ls-remote provou `8d9ec634…` antes do fix; depois `004fa846`).
2. **Gate honesto funcionou:** 3 primeiras execuções do pipeline abortaram no estágio test — 1 falha estável em 1966 (1958 pass). NÃO deployou com prova vermelha.
3. **RD-SHIPGATE-FIX-01** (worker, PASS): causa raiz = ENOENT de fixture `deploy/sudoers-eng-mcp-host-ops` na imagem de teste (Dockerfile sem COPY deploy/); falha idêntica no commit de produção 357ad749 → não-regressão dos commits shippados. Fix de 1 linha no Dockerfile — commit `004fa846` em main. Test do runner: **1966/1959/0 falhas** pelo caminho oficial (socket release-runner).
4. **Pin atualizado** `8d9ec634 → 004fa846` (mesmos 16 commits + fix do gate) — justificado no relatório do FIX-01 ("a SHIP deve despachar o pipeline com commit 004fa846").
5. **Pipeline completo (host-side, por estágio, com provas JSON):**
   - test: HTTP 200, 74s, success=true, exitCode=0 → `ship-8d9ec634-test.json`
   - build: HTTP 200, 0.25s (cache), success=true → `ship-8d9ec634-build.json`
   - candidate: HTTP 200, PASS, 152 tools, imagem `sha256:2713a9f6…`, catálogo `97e962fd…` → `ship-8d9ec634-candidate.json`
   - deploy: HTTP 202 accepted, jobId `72977906-42cb-4ce5-aa5d-f8475296b688` → `ship-8d9ec634-deploy.json`
   - poll: running→**success exitCode=0** (3 polls) → `ship-8d9ec634-status.json`
   - smoke: HTTP 200, **deployStatus PASS, smokeStatus PASS, rollbackRequired=false**, produção `eng-mcp-candidate:commit-004fa846…` → `ship-8d9ec634-smoke.json`
6. **Container de produção:** `memoryos-eng-mcp` UP com `commit-004fa8466e318da09b39de60baf17367fcd7d5e1` (docker ps, 19s após deploy). Production catalog hash == candidate hash (`97e962fd…`).
7. Paperwork commitado em main: `7cf00c0e` (relatórios/provas de missões fechadas).

## Efeitos colaterais

- Cache do gate da SHIP (redução de latência do capture, objetivo declarado do roadmap) **agora em produção** em `004fa846`.
- Estágio test de commits futuros depende de `deploy/` commitado (regra documentada no relatório do FIX-01).

## Custo

- Parcial medido antes: US$0,19; medição final pendente do resolver de spend (RD-OPS-03 na fila).

## Dívidas herdadas

- Push do paperwork `7cf00c0e` para origin (host-side) — pendente no momento do close.
- Medição de custo final da SHIP (RD-OPS-03).

## Veredito

**PASS** — produção em `004fa846`, smoke PASS, catálogo validado, rollback não requerido.
