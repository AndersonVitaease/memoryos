# RELATORIO — ORCH-PREAUTH-ARTIFACT-01 (2026-10-04)

## Problema
O gate de despacho do orquestrador (ciclo `orch-daemon-consume.timer`, 2min) dependia do env `ORCH_DAEMON_APPROVED=1` — um toggle estático, sem TTL, sem revogação auditável e sem integridade verificável: enquanto a variável estiver no ambiente do daemon, TODOS os ciclos futuros executam, mesmo meses depois da decisão original. O operador não tinha como conceder aprovação por janela de tempo nem revogar sem tocar no serviço.

## Entrega
Gate de despacho passou de env para **artefato preauth** com hash de autointegridade, TTL e revogação — read-only para o daemon:

- **`src/orchPreauthArtifact.ts` (novo)** — leitor puramente read-only do artefato em `ORCH_PREAUTH_PATH` (default `/data/manifests/orch-daemon-consume.json`). Nunca lança; estados tipados: `valid | absent | expired | revoked | hash_mismatch | invalid` (fail-closed em tudo que não é `valid`). Aceita **duas formas operator-concedidas**: (A) forma do contrato `{issuer, subject:"orch-daemon-consume", grantedAt, expiresAt, scope, hash}` com hash16 = sha256 dos 16 primeiros hex do corpo canônico (sorted-keys, sem o campo `hash`); (B) forma de manifesto do `engineering.mission.preauth` (`validateManifest`/`manifestHash16` de `missionManifest.ts`, exigindo `mission === "orch-daemon-consume"`). Guarda **ANTI-SELF-APPROVE** no módulo dono do caminho: `assertPreauthArtifactAccess` lança `ANTI_SELF_APPROVE` para qualquer operação ≠ `read` — o daemon NÃO cria, NÃO edita, NÃO remove o artefato.
- **`src/orchestrateConsumeDaemon.mjs`** — `resolveCycleApproval`: artefato válido → execute com `approvalSource:"artifact"`; artefato ausente/expirado/revogado/hash divergente → `awaiting_approval` fail-closed (modo plan, exit 0, nada despachado); `ORCH_DAEMON_APPROVED=1` continua como **fallback compatível** com log honesto. Todo resultado de ciclo carrega `{approvalSource, preauth:{status,hash16,expiresAt,source}}` — inclusive ciclos sem promovíveis (validação a cada ciclo, auditável). Precedência: artefato válido > env > none.
- **Achado e corrigido (`src/orchestrate.ts`)**: requeue de despacho era rotulado `dead_letter` no JSON auditável (os contadores já estavam certos; a trilha que mentia). Agora `action:"requeued"` tipado.
- **Revogação**: `{"revoked":true}` (ou `revokedAt`) no artefato → estado `revoked`, fail-closed imediato (checado antes do TTL).

**Concessão/revogação (OPERATOR)**: via `engineering.mission.preauth` (forma B, `mission:"orch-daemon-consume"`) — ou escrevendo a forma A em `/data/manifests/orch-daemon-consume.json` com `hash = hash16` do corpo. **NÃO criamos artefato em produção** — a concessão é do operador (anti-self-approve); até lá o ciclo segue fail-closed (ou no fallback do env, se o operador mantiver `ORCH_DAEMON_APPROVED=1`).

## Prova (comandos reais, saída no verify-ORCH-PREAUTH-ARTIFACT-01.json)
- `test/orchPreauthArtifact.test.ts` → **13/13** (4 estados + forma B + env override + anti-self-approve + bytes read-only).
- `test/orchestratePreauthCycle.test.ts` → **11/11** (R1–R7 resolveCycleApproval; C1 ciclo válido→execute com despacho recusado INVALID_CWD no audit; C2 expirado→plan; C3 bytes idênticos pós-ciclo; C4 sem promovíveis→preauth ainda auditado).
- `test/orchestrateConsumeDaemon.test.mjs` → **6/6**; consume+toolcall → **37/37**.
- **E2E no runner** (`e2e-ORCH-PREAUTH-ARTIFACT-01.mjs`): ciclo REAL do daemon com artefato de teste em caminho override → **10/10 checks, verdict PASS** (valid→execute+`approvalSource:artifact`; expirado→plan fail-closed; expirado+env→execute com `approvalSource:env` e `preauth.status:expired` no log honesto; precedência do artefato sobre o env; bytes do artefato inalterados pós-ciclo).
- **Suíte completa**: 1802 testes, **1796 pass / 1 fail / 5 skip** — a única falha é `test/zz-proxy-live.test.ts` (probe HTTP viva 127.0.0.1:8787, **ambiental e pré-existente** ao baseline 114e7688), declarada estruturalmente na prova (grep das linhas `not ok` = só zz-proxy-live → exit 0).
- Commits em `main`: `aab478cf` (leitor) → `22a32f9c` (gate no ciclo) → `3171bb85` (determinismo das provas). Deploy paths limpos. **Sem push, sem deploy.**

## Dívidas
- **GitNexus indisponível**: DB storage v43 vs reader v42 (`impact`/`detect-changes` falham mesmo com `analyze --index-only --force` e npx latest). Confirmação de callers feita por text-search (regra UNKNOWN do CLAUDE.md). Reparo do índice é dívida de infra, não desta missão.
- **Artefato de produção não criado** (por design): o operador concede/revoga via `engineering.mission.preauth`; enquanto isso o gate segue fail-closed (env fallback até revogação explícita).
- Callers diretos de `resolveCycleApproval` fora do daemon: nenhum identificado (text-search); superfície é aditiva — assinaturas das 15 capabilities e do `IProductionConnector` intocadas.

**Memória**: capture tentado e INDISPONÍVEL nesta sessão — `engineering.memory.capture` (endpoint de produção) respondeu `AUTHENTICATION_REQUIRED` com a credencial acessível aqui; ídem `engineering.judge.verify` (camada 0 fail-open, convenção JUDGE-HOOKS-01). FINGERPRINT declarado aqui e no verify.json: `{"missionId":"ORCH-PREAUTH-ARTIFACT-01","head":"dab245c3","registrySha16":"n/a (sem credencial de registry nesta sessão)","verdicts":"verify.py:pass; E2E:PASS 10/10; camada1:spot-check-ok (commits em main confirmados; /data/manifests inexistente); camada0:fail-open","ts":"2026-10-04T12:41:12Z"}`. Gravação do ledger fica como dívida para uma sessão com credencial válida.

**operator_channel**: pane da missão (herdr w6:p6G) — fechamento entregue via send-text.

PASS
PARE