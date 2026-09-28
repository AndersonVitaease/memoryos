# RELATÓRIO — seclayer-ids-link-01 (trilha da seclayer ligada ao IDS e ao bus)

Fecha a gray-zone #3 da guardian-seclayer-b-01: `/data/audit/security-response.jsonl` não alimentava o IDS nem o bus.

- **Commit:** `4a209a78` (código + testes + mount). Relatório/evidência em commit separado.
- **Produção:** `eng-mcp-candidate:commit-4a209a78…`, com label revision igual ao SHA. Deploy job `a08a37f0-52dd-4b1a-b799-fffb7abebfcf`: test (1590 pass / 0 fail) → build → candidate → deploy → smoke PASS. Foi o **primeiro deploy compilado de commit** do pipeline da deploy-commit-pin-01 (dogfood do pin realizado).
- **Verify:** `verify-seclayer-ids-link-01.json` → **12/12 PASS** (`evidence/seclayer-ids-link-01/verify-run.txt`).

## 1. O que foi entregue

**Hook no writer** (`src/securityResponseBus.ts`, novo; chamado de dentro de `writeSecurityResponseAudit`):
- `verdict=BLOCK` (SR-L0-009/010) gera um finding **imediato** no bus: `{ts, event:"finding", kind:"security_response_block", level:"warn", source:"eng-mcp:security-response", tool, rules[], blockRules[], sha16, msg}`. O mesmo response repetido (tool+sha16) na mesma hora conta uma vez. Teto de 40/h.
- `verdict=REVIEW` é **agregado**: `kind:"security_response_review"`, 1 finding por tool por hora UTC, com teto global de 40/h (mesma forma do `permdialog_auto_max_per_hour` do watchdog). Os REVIEWs seguintes continuam só na trilha.
- `ALLOW` não gera nada.
- Sai só hash, ids de regra e nome da tool. **Nunca** sai conteúdo cru, até porque o registro de entrada não o carrega.
- Não há LLM nesse caminho. O módulo é folha: só importa `node:fs` e `node:path` (guarda estrutural no teste).
- **Fail-open silencioso:** o módulo só faz append num spool que **já existe** como arquivo regular e nunca cria um spool fantasma. Se o spool faltar ou der erro, o finding fica na trilha local `/data/audit/security-findings.jsonl`, que também guarda cópia durável de todo finding. Fica ainda **1** evento `bus_unavailable` por hora. Nunca lança exceção no caminho `tools/call`.
- Sob `node --test`, o spool real nunca é o alvo default.

**IDS** (`src/securityIds.ts`):
- Alarmes novos `SECURITY_RESPONSE_BLOCK` (1 por linha BLOCK) e `SECURITY_RESPONSE_REVIEW` (1 por tool/hora).
- São determinísticos e não chamam o juiz. Entram no mesmo canal `alarms`/`alarmCount` e no `ids.jsonl`, junto com `result.securityResponse {block, review, note}`.
- Trilha ausente: zero alarmes e `note: security_response_trail_absent`, que fica fora do `alarmsNote`.
- Trilha ilegível: zero alarmes e `alarmsNote` recebe `security_response_trail_unreadable:<code>`.

**Ligação física ao bus:**
- O container de produção não montava `/opt/mission-events`. O bus não tem ingress HTTP; ele faz tail do spool.
- Novo `production.busSpoolMount` no `release-config.json`, emitido por `busSpoolMountArgs`: bind de **um arquivo só**, `/opt/mission-events/spool.jsonl → /run/mission-bus/spool.jsonl`.
- O destino é fixo. A origem precisa já existir como arquivo regular e não pode ter `..`. Qualquer outra spec não emite nada.
- `bus-state.json` e `subscribers.json` não são montados.
- Motivo do bind ser seguro: o spool nunca é rotacionado nem trocado (a rotação é do journal do plantão). O inode é estável.
- O runner faz spawn do pipeline por job, então **não foi preciso reiniciar o runner**.

## 2. Provas red → green

| Prova | Red (HEAD `f4a5b2e8`) | Green (`4a209a78`) |
|---|---|---|
| Probe comportamental (`probe.mts`, mesmas chamadas nas duas árvores): 1 BLOCK, 20 REVIEW, 1 limpa | `busFindings: []`, `idsSecurityResponseAlarms: []` | 1 `security_response_block` (SR-L0-010), 1 `security_response_review` (SR-L0-001), alarmes BLOCK+REVIEW, `leakedSecret:false` |
| `test/securityResponseBus.test.ts` | falha (módulo inexistente) | **13/13** |

Os 13 testes:
- **P1:** BLOCK por SR-L0-009 e por SR-L0-010 geram o finding com a regra correta. O segredo e a URL não aparecem nem no bus nem na trilha local. Dois BLOCKs distintos geram 2 findings; o mesmo response repetido gera 1.
- **P2:** 50 REVIEWs da mesma tool/hora geram **1** finding, e os 50 continuam na trilha. Outra tool ou a hora seguinte geram finding novo. Com o teto global, 55 tools distintas geram 40 findings e 15 suprimidos.
- **P3:** resposta limpa passa como ALLOW byte-idêntico, com zero finding e sem trilha local.
- **P4:**
  - spool ausente: nenhum crash, veredito intacto, finding local e 1 `bus_unavailable`; o spool não é criado;
  - spool que é diretório, ou trilha num caminho inutilizável: silencioso;
  - registro malformado: `none` ou `bus-unavailable`, nunca exceção;
  - IDS com trilha ausente ou ilegível: sem crash, com nota.
- **Mount:** exatamente um bind com destino fixo; `:ro`, diretório, `bus-state.json`, destino diferente, `..` e origem ausente geram `[]`.

**Regressão:** a suíte completa dá 1590 pass e 1 fail, `zz-proxy-live` (403 live). Ele **falha igual no HEAD sem as minhas mudanças**, então não tem relação com esta missão. O teste estrutural do `securityResponse.test.ts` teve a allowlist de imports estendida de propósito com `securityResponseBus`, e ganhou uma guarda leaf-only para o módulo novo. O pipeline de release rodou a mesma suíte: 1590/0 fail.

## 3. E2E em produção (`evidence/seclayer-ids-link-01/e2e-*`)

Chamadas reais no `:8787` via MCP (`engineering.file.read` nos fixtures já versionados da seclayer-b):
- `e2e-planted-exfil.md`: BLOCK, com 1 finding `security_response_block` no bus, `blockRules:["SR-L0-009"]`, sha16 `cca9f3348c29b70a`.
- `e2e-planted-payload.md` lido 3 vezes: 3 REVIEW na trilha e **1** finding `security_response_review`.
- `package.json`: ALLOW, sem finding.
- O bus consumiu: `spool_offset` ficou igual ao tamanho do spool.
- A **trilha do plantão** (`/opt/plantao/journal-20260928-001.jsonl`) contém os 2 findings.
- `engineering.security.ids {windowHours:1}` em produção devolveu `securityResponse {block:1, review:1}` e os dois alarmes `SECURITY_RESPONSE_*`.
- Nenhum `ghp_` ou `collector.example.net` apareceu no spool nem na trilha local.

## 4. § engine: NÃO CUMPRIDO

O contrato pedia que este despacho rodasse com engine=gpu (ponte Qwen). **Não rodou.** O processo deste worker (pid 1090864) tem `ANTHROPIC_BASE_URL=https://openrouter.ai/api`, e o modelo é Claude Opus 5.5.

No `/opt/gpu-bridge/audit.jsonl`, desde o despacho, só há `proxy_call` de 32/2 tokens (probes periódicos) e `jev_decisions`. Não há turnos de worker. Um worker não troca o próprio engine de dentro da sessão. A prova E2E do workers-qwen **fica pendente** de um despacho que realmente suba no Qwen: isso é do supervisor/dispatcher, fora deste componente.

## 5. Gray-zones declaradas

1. **Dedupe em memória:** o estado tool/hora vive no processo. Um restart do container dentro da mesma hora pode repetir 1 finding REVIEW por tool. Aceito: fica no máximo 1 a mais por tool.
2. **Escrita do container no spool do bus:** o container passou a poder fazer append em **um** arquivo do bus, e com isso poderia forjar evento de qualquer kind. O container já tinha `/opt/memoryos` rw, então o risco não é novo em escala. Mesmo assim é superfície nova, e está declarada.
3. **Subscribers do bus desligados** (ordem do operador, 28/09). O finding chega ao bus.log e ao journal do plantão; não chega a nenhuma sessão de chat. "O supervisor ver no watch" acontece via IDS (alarmes) e via journal, não por push.
4. **Os findings E2E de hoje ficaram no bus real.** São identificáveis pelos nomes de fixture (`sha16 cca9f334…`/`3d819e28…`) e são o próprio objetivo da prova.
5. **GitNexus indisponível:** `impact`/`detect-changes` devolvem UNKNOWN por incompatibilidade de storage do índice (v43 vs v42). Os chamadores foram confirmados por busca textual: `writeSecurityResponseAudit` só é usado dentro de `securityResponse.ts`, e `computeManifestAlarms` manteve a assinatura.
6. **Typecheck:** os erros do `tsc` são todos pré-existentes, em outros arquivos. São zero em `securityResponse*`/`securityIds`.

## 6. Não tocados

mission-supervisor, gpu-watchdog, mission-ops, guardian-compute, event_bus.py, subscribers.json. Não houve push.

## 7. Verificação (VERIFY-01)

- **Camada 0:** `engineering.judge.verify`, 6 claims × artefatos (`evidence/seclayer-ids-link-01/selfcheck-*`).
  - A 1ª chamada estourou `JUDGE_TIMEOUT`. A 2ª, com evidência enxuta, deu `HAS_CONTRADICTIONS` com 4 supported, 1 not_addressed e 1 contradicted. A **contradita é c6 ("rodou no Qwen")**, a claim de controle, e confirma o § 4 (NÃO cumprido).
  - c2 veio not_addressed por falta do TAP do arquivo novo. Com essa evidência, a re-verificação deu `ALL_SUPPORTED` (1/1).
- **Camada 1:** as claims `[consequência]` (imagem de produção e bind) foram conferidas contra o estado vivo via `docker inspect` (verify #6 e #7, PASS).
- **Camada 2:** não disparada. O spot-check passou e a única contradição é a claim de controle já declarada.
