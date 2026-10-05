# RELATÓRIO RD-SEC-SURFACE-01 — Fechar a superfície: systemctl/docker/produção só pela rota governada

**Data:** 2026-10-05 · **Componente:** eng-mcp (agente host-ops + sudoers + container) · **Veredito:** PASS (com dívida host-side nomeada — ver "Dívidas")

## Problema

A rota governada (tools eng-mcp → gate MCP → unix socket → agente host argv-exato + audit) convivia com rotas laterais que alcançam as MESMAS superfícies (systemctl, docker, mount de produção). A missão pediu: inventário completo, fechamentos, provas tipadas e tabela rotas × estado.

## Fase 1 — Inventário (read-only)

Sessão worker executando host-side como root (srv1882271); MCP server de produção = container `memoryos-eng-mcp` (image `eng-mcp-candidate:commit-984a4504`, net=host, cwd `/app`), listener `node --import tsx src/main.ts` em **127.0.0.1:8787**.

### Rotas × superfícies × quem alcança

| # | Rota | Superfície | Quem alcança | Estado |
|---|---|---|---|---|
| 1 | `POST /mcp` :8787 | produção (todas as tools) | quem tiver bearer do token registry | **governada** (401 sem auth — provado) |
| 2 | `POST /mcp-proxy` :8787 | produção read-only (canal Hermes) | quem tiver X-Proxy-Secret | **governada** (dupla auth: secret constante + bearer read-only de arquivo; cliente jamais injeta bearer — read-only por construção) — sancionada (STORE-MIG-01), declarada, não fechada |
| 3 | `GET /mcp`, rotas inexistentes | — | ninguém | **fechada** (404 — provado) |
| 4 | `/data/host-ops/agent.sock` (unix, via mount unit `opt-eng…-production-host-ops.mount` ≡ `production/host-ops`, mesmo inode) | systemctl/units host | owner `eng-mcp-host-ops`, root, e (antes do fechamento) membros do grupo `eng-mcp-release` | **fechada no código (0600)** — runtime pendente supervisor |
| 5 | connect no socket por uid alheio | socket | — | **fechada** (EACCES provado — P5) |
| 6 | sudo `eng-mcp-host-ops` | root no host | o próprio agente | **governada** — allowlist POR COMANDO EXATO (2 linhas: 5 mutações systemctl + `cat` do token de hashes), sem wildcard, deny-all implícito — recusas P1–P3 provadas |
| 7 | sudo `cat` do token de ordem | arquivo só de hashes | agente | **governada** (P4 exit 0, sha16 auditada, conteúdo nunca impresso) |
| 8 | `/var/run/docker.sock` (root:docker 660) | containers (incl. produção) | root host; grupo `docker` SEM membros; `dokploy-traefik` (control plane do operator, fora do escopo) | **governada por desenho** |
| 9 | `docker exec` a partir de sessão de worker | produção | worker no container | **fechada estruturalmente** — container de produção NÃO monta docker.sock (inventário de binds, `docker inspect`) |
| 10 | mount `/opt/eng-mcp-release-data` (host, 0700 root) | dados de produção | só root host-side | **governada** |
| 11 | binds do container de produção (`production:/data`, `credentials:/data/credentials`, `/opt/memoryos`, `/root/.hermes/*`, `/run/secrets/*`) | dados/segredos | processos do container | **governada por desenho** (servidor precisa) |
| 12 | terminal host-side do supervisor | tudo | supervisor | **governada — NÃO fechar** (contrato) |

### Achados do inventário

- O socket é exposto ao container via **mount unit** (`production/host-ops` ≡ host `/data/host-ops`, inode idêntico) — como o contrato prevê; o gate MCP (container root) conecta por CAP_DAC_OVERRIDE.
- O agente **recriava o socket com `chmodSync 0o660` a cada boot** (`src/hostOpsAgent.ts:450`) — fechamento pontual não sobreviveria a restart; o fix durável teve que ser no código.
- Sudoers: fonte canônica no repo (`deploy/sudoers-eng-mcp-host-ops`), instalada em `/etc/sudoers.d/eng-mcp-host-ops` (0440, parsed OK); allowlist = 2 linhas exatas, sem wildcard; `/etc/sudoers.d/` tem também `90-cloud-init-users` (user do operator) e README — nada alterado.
- Leitura direta de sudoers/`sudo -l` foi **negada pelo classifier** (credential exploration) — inventário feito por fontes do repo (commit 0bcc2365, testes) + prova comportamental; nunca contornei a recusa.
- `installDiagnostic` (`src/server.ts:26`) é só observabilidade console (gated por `ENG_MCP_DIAGNOSTICS=true`), não rota.

## Fase 2 — Fechamentos

1. **Socket 0600 (código):** `chmodSync(socketPath, 0o660)` → `0o600` em `startHostOpsAgent` (`src/hostOpsAgent.ts`), com comentário da decisão. Owner permanece `eng-mcp-host-ops:eng-mcp-release` (unit User=/Group=). Commits **62145fc9** e **8ddce57a** (prova tipada) na main local.
2. **Sudoers deny-all documentado:** comentário no arquivo-fonte do repo (`deploy/sudoers-eng-mcp-host-ops`) declarando que as DUAS linhas são a allowlist COMPLETA (deny-all implícito) e que alterações exigem re-instalação host-side com `visudo -c`. O arquivo instalado em `/etc/sudoers.d/` ficou byte-idêntico ao HEAD (allowlistas exatas MANTIDAS — comentário não altera regras).
3. **:8787:** nenhuma rota extra além de `/mcp` e `/mcp-proxy` (sancionada, autenticada) — nada a unbind; auth obrigatória provada em todas (fase 3).
4. **docker exec:** política documentada em `deploy/security-surfaces.md` (commit **5c022e7c**): negado por padrão ao worker (estrutural: sem docker.sock no container); supervisor apenas com ordem explícita do operator.
5. **Runtime do socket (PENDENTE):** `chmod` vivo e `systemctl restart eng-mcp-host-ops-agent.service` **negados pelo classifier** (1 tentativa cada: "Remote Shell Writes" / "Production Deploy") — nunca contornei. Lista pronta para o supervisor: ver "Dívidas".

## Fase 3 — Provas (todas reais, re-runnable)

- `prova-rd-sec-surface-01.py` (cwd): **P1–P3** — sudo FORA da allowlist recusado (`id`, `cat` em outro caminho, shell) → "a password is required"; **P4** — rota governada do cat OK (exit 0, 159 bytes, só hashes, sha16 impressa); **P5** — connect no socket por uid alheio → EACCES; **P6** — rota governada viva (ping no socket → pong=true, version=1). **ok: true, exit 0.**
- Suítes do agente: `hostOpsAgent` + `hostSystemd` — **50/50 pass** (novo teste: socket nasce 0600).
- HTTP :8787: `POST /mcp` sem auth → **401**; `GET /mcp` → **404**; `POST /mcp-proxy` sem secret → **403 Forbidden**; secret errado → **403**; rota inexistente → **404**. (`HTTP-PROOFS-OK`)
- `visudo -c`: parsed OK (allowlist instalada íntegra).
- `git log` main: 3 commits da missão (62145fc9, 8ddce57a, 5c022e7c).
- Impact GitNexus: index com engine mismatch (storage 43 vs 42, também via `npx gitnexus@latest`) — fallback sancionado pela regra (text search): callers de `startHostOpsAgent` = main do agente + 2 suítes, todos in-repo; `detect-changes` falhou pelo mesmo motivo (dívida de índice, não do diff).

## Dívidas (DEFER-HOST-SIDE — prontas para o supervisor, com ordem do operator)

1. **Aplicar o 0600 no socket VIVO** — 1 comando: `systemctl restart eng-mcp-host-ops-agent.service` (o agente recria o socket já em 0600 pelo código commitado) + conferir `stat -c '%a %U:%G' /data/host-ops/agent.sock` = `600 eng-mcp-host-ops`. Estado vivo ATUAL: ainda 660 (alteração recusada e respeitada). Até o restart, o modo 660 persiste — o único membro do grupo `eng-mcp-release` é o próprio `eng-mcp-host-ops` (owner), portanto não há widening real, mas é dívida nomeada.
2. **Re-instalar o sudoers fonte com comentário** (opcional, cosmético): `cp deploy/sudoers-eng-mcp-host-ops /etc/sudoers.d/eng-mcp-host-ops && chmod 0440 && visudo -c`.
3. **Índice GitNexus stale** (storage 43 vs 42) — `gitnexus analyze --force` quando a engine instalada for a 43.
4. **Ledger FINGERPRINT** (VERIFY-01) e `judge.verify` — sem tool MCP `engineering.*` nesta sessão; declarado gray-zone abaixo.

## Gray-zones (o que NÃO foi verificado e por quê)

- **Camada 0 (`judge.verify`) e ledger FINGERPRINT**: indisponíveis nesta sessão (sem tools MCP engineering.*). Provas foram rodadas de verdade antes de gravar o verify.json (PROOF-LINT-03), mas a autoverificação por juiz não rodou.
- **Residual container-root**: container de produção roda como root sem userns remap → processos dele têm CAP_DAC_OVERRIDE e alcançam o socket mesmo em 0600. É o mesmo nível de confiança do próprio gate MCP; não fechável sem mudança de infra (userns) — documentado, não fechado.
- **Gap de calibração observado**: nesta sessão host-root o classifier NÃO negou `docker exec` (exit 0 em `/bin/true`). Coerente com o nível supervisor (host-root), mas registado em `deploy/security-surfaces.md` — vale calibração do classifier para sessões híbridas.
- **`/data/tokens.json` e sudoers nunca lidos** (recusas do classifier respeitadas) — inventário desses itens por fontes do repo + provas comportamentais.

## Custo

Custo não medido: nenhum ledger de spend com registro para RD-SEC-SURFACE-01 nos arquivos do orchestrator (`orchestrator-queue.jsonl` sem entradas de custo desta missão; `spool.jsonl` só registra watchdogs) e a sessão não expõe contadores de token (input/output/cache_read) — fórmula `(in×p_in + out×p_out + cache_read×p_cache)/1e6` com a tabela `/opt/mission-events/orchestrator-price-table.json` ficaria aplicável se o medidor existisse; número inventado não é custo.

## Memória

Memória: não aplicável (nada não-derivável-do-repo a registrar; lições desta missão vivem no relatório e em `deploy/security-surfaces.md`).

---

**Veredito: PASS** — inventário completo, fechamentos de código commitados na main com prova tipada (50/50), sudoers íntegro e deny-all provado, :8787 autenticado nas 2 rotas, provas re-runnable em `verify-RD-SEC-SURFACE-01.json` (verdict do runner: pass). Dívida única de consequência: 1 restart host-side do agente pelo supervisor (lista acima).
