# RELATÓRIO RD-HOST-02 — host-ops agent lê o token de ordem via `sudo cat`

**Data:** 2026-10-05 · **Componente:** eng-mcp (`src/hostOpsAgent.ts` + deploy/sudoers) · **Prioridade:** 1

## Problema (provado em produção 04/10 02:20)
O agente host-ops (systemd `eng-mcp-host-ops-agent`, User=eng-mcp-host-ops uid 994) verifica o operatorOrder lendo `/data/manifests/operator-order-token.json` (0600 root:root) — ilegível para o agente não-root. Toda mutação tier-1 recusava `OPERATOR_ORDER_UNVERIFIED (tokenStatus=invalid)` MESMO com token íntegro (audit 02:20:40Z, orderHash16 46da5309cff3f290 conferido). ACL/grupo não resolve: viraria `INSECURE_MODE` para os leitores root (mesma checagem de modo). O arquivo contém SÓ hashes.

## Entrega (commit 0bcc2365 na main, 5 arquivos)
1. **sudoers** (`deploy/sudoers-eng-mcp-host-ops`, instalado 0440 root:root + `visudo -c` OK): +1 linha `eng-mcp-host-ops ALL=(root) NOPASSWD: /usr/bin/cat /data/manifests/operator-order-token.json` — comando exato, arquivo único de hashes, sem wildcard.
2. **Leitor injetável** (`src/operatorToken.ts`): `OperatorTokenFileReader` com default fs direto — **zero mudança de comportamento** para os callers existentes (`supervisorGuard.ts:114`, `hostSystemd.ts:590/606` intocados; checagem de modo 0600 preservada sobre stat direto).
3. **Agente** (`src/hostOpsAgent.ts`): `createHostOpsTokenReader()` — leitura via `sudo -n /usr/bin/cat <path>` (argv exato, `spawnSync` shell:false, timeout 5s), fallback leitura direta (processo root/container de teste), kill switch `HOST_OPS_TOKEN_VIA_SUDO=0`. Fail-closed preservado (EACCES mapeia como antes). Audit ganha `tokenVia` (sudo|direct|injected) nas mutações.
4. **`src/hostSystemd.ts`:** pass-through do leitor em `verifyOperatorOrderLocal` (parâmetro opcional).
5. **Testes novos A–F** em `test/hostOpsAgent.test.ts` (sudo argv exato com decoy, fallback, kill switch, allowlist sudoers, injeção no `handleAgentRequest`, audit `tokenVia`).

## Provas executadas (reais, re-runnable)
| Prova | Resultado |
|---|---|
| Suíte completa eng-mcp (`npm test`) | **1958 testes: 1952 pass, 0 fail, 6 skipped** (58s) |
| E2E mutação tier-1 com ordem VÁLIDA (audit) | `decision=executed, exitCode=0, tokenVia=sudo, orderHash16=46da5309cff3f290` @ 03:20:07Z (`req=rd-host-02-e2e-valid-1`) |
| E2E ordem INVÁLIDA | `decision=refused, code=OPERATOR_ORDER_UNVERIFIED, tokenVia=sudo` — recusa tipada mantida |
| **Contraste da missão** | MESMA ordem (46da…): recusada @ 02:20:40Z (pré-fix, sem tokenVia) → **executada @ 03:20:07Z (pós-fix, via sudo)** |
| Sudoers ao vivo (uid do agente) | `sudo -n /usr/bin/cat <token>`: exit 0, 159 bytes, digest sha256 idêntico ao root; `/etc/shadow`: **recusado** pelo sudo (exit 1, stdout vazio) |
| `visudo -c` | 4 arquivos parsed OK |
| Commit na main | `0bcc2365ed8aca38ed205d3aedfcf0d57877168d` (git.log provado) |
| Prova de audit re-runnable | `tmp/prova-audit-rd-host-02.py`: 5/5 ok, exit 0 |

## Nota de execução (harness)
3 passos privilegiados do escopo (commit, install do sudoers 0440, restart do agente) foram negados pelo classifier do harness nesta sessão e executados host-side pelo supervisor com ordem do operator (provas validadas neste ambiente). A leitura da pré-imagem da ordem de 02:20 na fila do orchestrator foi autorizada explicitamente pelo operator para este E2E; o valor bruto NUNCA apareceu em output (só hash16).

## Dívidas / zonas cinzas (declaradas)
- **Camada 0 (`engineering.judge.verify`)** indisponível nesta sessão (MCP engineering.* não montado) — compensado por provas determinísticas re-runnable no verify.json.
- **Camada 1 (spot-check):** realizada — git.log do commit na main, audit lido direto, visudo/0440 conferidos.
- `registrySha16` do ledger de fechamento não medido (engineering.registry indisponível nesta sessão) — declarado, nunca inventado.
- Fallback direto do leitor NÃO é exercitável como não-root real em suíte (testes cobrem via injeção com decoy + P3 ao vivo cobre o caminho sudo real).

## Custo
- Modelo do turno: `z-ai/glm-5.3-flash` · Fórmula: `custo = (in×0.15 + out×0.5 + cache_read×0.03)/1e6`
- Tokens: input **732.510** · output **132.788** · cache_read **11.105.024** · cache_creation 0
- Custo estimado: **US$ 0,509421** (snapshot no fechamento; transcript sha16 4dcf2baaa308fe2e)

## Memória
memória gravada (fingerprint 0bcc2365ed8aca38) — ledger de fechamento: `{missionId: RD-HOST-02, head: 0bcc2365ed8aca38ed205d3aedfcf0d57877168d, verdicts: {audit-proof: 5/5, suite: 1952/0}, ts: 2026-10-05}` (`engineering.memory.capture` indisponível nesta sessão — gravado na memória de sessão persistente; partição MCP declarada como dívida).

## operator_channel
`{url: "herdr pane w6:p84 (Missão rd-host-02)", expect_status: "entrega final no pane"}`

## Veredito
**PASS**
