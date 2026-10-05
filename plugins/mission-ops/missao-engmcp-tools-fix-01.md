# ENGMCP-TOOLS-FIX-01 — MISSION.* DO ENG-MCP QUEBRADAS EM PRODUÇÃO (spawn python3 ENOENT)

## Problema (provado 29/09 ~18:40 pelo supervisor)
As 7 tools mission-* do eng-mcp (commit 05902e0a) spawnam python3 com
PLUGIN_DIR = "/root/.hermes/plugins/mission-ops" (src/missionOps.ts, hardcoded).
No container memoryos-eng-mcp esse diretório NÃO EXISTE (Dockerfile não copia o
plugin, nenhum mount o expõe) → spawn com cwd inexistente → "spawn python3 ENOENT".
Prova: engineering.mission.status falha idêntica nas 2 superfícies (mcp__engmcp e
mcp__engmcp_local); docker exec ls /root/.hermes → No such file; python3 EXISTE no
container (/usr/bin/python3). O bug foi congelado na imagem no deploy das 10:43
(commit 7cfbe891). O E2E original das wrappers rodou fora do container.

## Contrato (2 itens, nesta ordem)

### 1. Fix do ambiente (1 linha de config + tratamento do teste quebrado)
a. /opt/memoryos/eng-mcp/scripts/release-config.json → production.readOnlyMounts:
   adicionar "/root/.hermes/plugins/mission-ops:/root/.hermes/plugins/mission-ops:ro"
   (mecanismo existente, readOnlyMountArgs aceita spec "/src:dest:ro", emite só se a
   origem existe — nunca write). Mantém fonte única: o handler lê o plugin do host a cada chamada.
b. test/dispatcherDupfix.test.ts"," — arquivo de teste nasceu com aspas no nome
   (criado pela missão dispatcher-dupfix-01). Renomeie para
   test/dispatcherDupfix.test.ts (aspas fora), confira o conteúdo (unit tests do
   closeDuplicateTabs) e garanta que a suíte roda verde com ele incluído.
c. Não toque em src/missionOps.ts nem em src/tools.ts — já têm a EDIÇÃO DA NUDGE
   (engineering.mission.nudge, schema + runMissionNudge + registro + asserções
   137→138 nos 4 testes) pendente de commit pelo supervisor. PRESERVE essa edição.

### 2. Commit + release + verificação
a. Commit de TODOS os arquivos pendentes em eng-mcp via tools governadas
   (engineering.git.status → stage com expectedHashes → commit): src/missionOps.ts,
   src/tools.ts, os 4 testes com asserções 137→138, test/dispatcherDupfix.test.ts,
   scripts/release-config.json, verify-judge-cred-fix-01.json, e os RELATORIO/verify
   sujos pré-existentes se o deploy DEPLOY_DIRTY_TREE barrar (liste o que stagear).
b. Engineering release pipeline (engineering.release.pipeline, acknowledgeRelease=true)
   do commit declarado: build → candidate → deploy. AGUARDE o deploy concluir
   (engineering.release status do deployJobId) — nunca trate queued como success.
c. Health check (engineering.app.health) + PROVA das tools: engineering.mission.status
   de uma missão ativa → HTTP 200 sem ENOENT. Depois: engineering.mission.read
   (bus-delivery-guard-01) e engineering.mission.nudge com verifySeconds baixo EM UMA
   missão de canário — NÃO nudge em missão real do operator.
d. Se qualquer etapa falhar: PARE, registre o erro e o estado exato, não invente.

## Provas obrigatórias (verify.json, provas tipadas cmd/file — formato de
/opt/deliver-verify/verify.py: cmd = [{"run": "...", "expect_exit": N}], file = [{"path": "..."}])
1. cmd: engineering.mission.status OK via HTTP (curl :8787/tools/list contém
   engineering.mission.nudge)
2. cmd: docker exec memoryos-eng-mcp ls /root/.hermes/plugins/mission-ops/__init__.py → exit 0
3. cmd: suíte eng-mcp verde (npm test — falha pré-existente do baseline zz-proxy-live
   tolerada, nenhuma NOVA falha)
4. file: RELATORIO-engmcp-tools-fix-01.md com diagnosis + fix + provas

## NÃO destruir
- NÃO reverta a edição da nudge em src/.
- NÃO faça push/merge remoto.
- or-worker-bridge (:8103, MODEL=z-ai/glm-5.3-flash) é produção — não mexer.
- Judge credencial /data/credentials/openrouter-judge = chave da ponte (200 provado) — não mexer.
- Zero custo OR além do seu próprio runtime.
