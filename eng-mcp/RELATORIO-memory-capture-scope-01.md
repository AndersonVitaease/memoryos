# RELATÓRIO memory-capture-scope-01: scope granular `engineering:memory:capture` (código + deploy)

**RESULT: PASS, com uma pendência declarada:** o smoke do resume do deploy 2 não foi coletado (ver §4).
O bearer `hermes-2026-09` agora grava `engineering.memory.capture` sem ter `engineering:write`. O `judge.verify` continua JUDGED.

## 1. Código (commit `62e086ea8f38b32604729446988019a85ca6766e`, main local, sem push)
- `src/registryScopeGrant.ts`: `engineering:memory:capture` entrou em `KNOWN_REGISTRY_SCOPES`. Com isso o grant passa a aceitar o scope, e o drift-guard fica coerente.
- `src/tools.ts`: novo predicado puro exportado, `canCaptureMemory(scopes)`, que aceita `engineering:memory:capture` **ou** `engineering:write` (compat). O handler de `engineering.memory.capture` trocou `requireWrite()` por `requireMemoryCaptureOrWrite()`. Nenhum outro gate mudou. `requireJudgeRead` e o grant `engineering:judge:read` ficaram intocados.
- Self-grant continua recusado. O guard `REGISTRY_SELF_GRANT_REFUSED` é genérico no `runRegistryScopeGrant` e não foi alterado; o grant seguiu pela tool governada, com o authorizer operator sha16 `ff337ee621dcac23` e o target `hermes-2026-09`.
- A tool continua catalogada como `access: "write"`, então o catálogo e as 124 tools não mudaram.

## 2. Testes (`test/memoryCaptureScope.test.ts`, 6 testes)
- **Red** (`evidence/memory-capture-scope-01/red.txt`): `does not provide an export named 'canCaptureMemory'`.
- **Green** (`green.txt`): memoryCaptureScope + registryScopeGrant + imageEditScope + tools.integration + securityIds = 80/80 pass.
- Casos cobertos: scope no catálogo; predicado com 7 casos (nada, read, read+judge:read → false; write, memory:capture → true; sem casamento por prefixo); recusa na fronteira `tools/call` com `AUTHORIZATION_SCOPE_REQUIRED` para read-only e para read+judge:read; pin estrutural do handler.
- O caminho positivo não roda no unit test porque tocaria o store real. Ele foi provado E2E (§5).
- **Suíte completa** (`suite.txt`), isolada via `systemd-run --scope -p MemoryMax=2G npm test`: 1491 testes, 1485 pass, 5 skip, 1 fail. A falha é `zz-proxy-live` (403 no `/mcp-proxy` live), ambiental: falha igual sem a mudança (stash). Dentro do pipeline (container) o resultado foi PASS, 1485 passed, 0 failed.
- Typecheck: 41 erros, igual ao main sem a mudança.

## 3. Deploy 1 (código) pelo pipeline oficial
- `deploy.ready` READY (Doctor HEALTHY, IN_SYNC). Imagem anterior: `candidate-20260928142849307-7ae70943a081`.
- `engineering.release.pipeline`: test PASS (1491/1485/0, 124 tools), build, candidate e deploy (202). No resume, o job `3cbc913b-3f73-4e80-9b85-7555984a0630` terminou `success` (17:15:45 → 17:16:03Z, exit 0) e o smoke deu PASS.
- Imagem em produção: `candidate-20260928171542102-47f9965d60ea` (sourceHash `47f9965d60ea…`).

## 4. Grant + deploy 2 (reload do registry)
- `registry.scope.grant` PLAN: subject `hermes-2026-09` (entry 22), scopesAdded `engineering:memory:capture`, `engineering:judge:read` preservado, sha16 `edf5b504a6937a6c` → `65b52f52c998ba91`, sem blockers.
- EXECUTE: `GRANTED`, mutationPerformed true, sha16 After `65b52f52c998ba91` (igual ao PLAN), backup `/data/tokens.json.bak-registry-grant-20260928T171648Z`, audit `written`.
- Deploy 2 (`engineering.release.pipeline`): test, build e candidate PASS, deploy 202, job `dfb4cd47-3522-4fcf-8cea-c01c28df362f`. Às 17:17:11Z o container subiu na imagem `candidate-20260928171657168-47f9965d60ea` (mesmo sourceHash). Na leitura com `docker inspect` estava Running.
- **Pendência:** o classificador do Claude Code negou ("[Production Deploy]") a chamada de *resume* desse job (poll de status + smoke). Não repeti nem contornei. O status final do job e o smoke do deploy 2 **não foram coletados por mim**. Para fechar: `engineering.release.pipeline {"acknowledgeRelease":true,"deployJobId":"dfb4cd47-3522-4fcf-8cea-c01c28df362f"}` (operador/supervisor).

## 5. Prova E2E pós-deploy (bearer hermes, via `mcp_call.py` do mission-ops)
- `engineering.memory.capture`: `stored:true`, memoryId **`31bd34f9-65c9-4f69-9117-1636de386b04`**, gate admit 0.86 (`e2e-capture-response.json`). Antes do grant, esse mesmo bearer recebia `AUTHORIZATION_SCOPE_REQUIRED` (relatorio-scope-grant-01 §5/§8).
- `engineering.judge.verify`: `JUDGED` (Jev Qwen, custo 0), sem regressão do grant `judge:read` (`e2e-judge-response.json`).

## 6. verify.json (`/opt/memoryos/eng-mcp/verify.json`)
Cinco cmd, todos ok na execução local:
1. suíte do pipeline PASS com 0 failed;
2. container rodando exatamente a imagem `candidate-20260928171657168-47f9965d60ea`;
3. código novo presente em `/app/src` do container;
4. resposta E2E do capture com `stored:true` e o memoryId acima, checada no arquivo gravado (re-executar o capture a cada verify gravaria de novo e o dedupe recusaria);
5. `judge.verify` live pelo bearer hermes retorna JUDGED.

Service: `eng-mcp-release-runner` active. Três files.

## 7. Gray-zones
- Smoke do deploy 2 não coletado (§4). O que prova que o registry recarregou é o próprio E2E: o capture passou pelo bearer hermes, que antes era recusado.
- Não conferi `sha256sum /data/tokens.json` de forma independente; os sha16 são os que a tool reporta (postvalidation + TOCTOU embutidos).
- Nenhum PAT ou bearer foi impresso. Não houve push. Guardian, bridge, sentinel e gpu-watchdog não foram tocados.
- O `requireWrite` do `memory.migrate`, `memory.merge` e demais tools de memória continua amplo, fora do escopo.

## 8. Verificação
- **Camada 0** (`selfcheck-response.json`): `judge.verify` com 6 claims contra os artefatos deu JUDGED ALL_SUPPORTED 6/6. **Mas a c6 era um controle falso proposital** ("smoke do deploy 2 verificado PASS"), e a evidência dizia explicitamente "not collected". O juiz a marcou supported, então esse veredito **não vale como aceitação sozinho** neste caso: falso-positivo do juiz, que merece calibração.
- **Camada 1** (claims de consequência, checagem direta): `docker inspect memoryos-eng-mcp` retornou `true 2026-09-28T17:17:11Z eng-mcp-candidate:candidate-20260928171657168-47f9965d60ea`. O grant carregado em produção está provado pelo E2E: o capture do bearer hermes, antes recusado, foi aceito com o memoryId `31bd34f9…`.
