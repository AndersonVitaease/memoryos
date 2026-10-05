# MISSÃO RD-HOST-02 — host-ops agent lê o token de ordem via `sudo cat` (fecha a perna de aprovação E2E)

**Componente:** eng-mcp (`src/hostOpsAgent.ts` + deploy/sudoers) · **Prioridade:** 1 · **Autoria:** operator 04/10 ("faça como vc recomendou") · **Fonte:** E2E real de 04/10 02:20 (perna de aprovação ORCH-TOOLS-E2E-01 recusada com token ÍNTEGRO)

## Problema (provado em produção, 04/10)
O agente host-ops (systemd `eng-mcp-host-ops-agent`, User=eng-mcp-host-ops, Group=eng-mcp-release, ativo) verifica o operatorOrder lendo `/data/manifests/operator-order-token.json` (`hostOpsAgent.ts:283`, `verifyOperatorOrderLocal`) — o arquivo é `0600 root:root` (exigência dos leitores root: `(mode & 0o077)==0`), **ilegível para o agente não-root** → toda mutação tier-1 recusa `OPERATOR_ORDER_UNVERIFIED (tokenStatus=invalid)` MESMO com token válido (audit 02:20:40Z, orderHash16 46da5309cff3f290 conferido). ACL/grupo NÃO resolvem: viraria `INSECURE_MODE` para os leitores root (mesma checagem de modo). O arquivo contém SÓ hashes (nunca o valor bruto do token).

## Escopo (mínimo cirúrgico)
1. **sudoers** (`deploy/sudoers-eng-mcp-host-ops` + instalar com 0440 + `visudo -c`): +1 linha `eng-mcp-host-ops ALL=(root) NOPASSWD: /usr/bin/cat /data/manifests/operator-order-token.json` — comando exato, arquivo único de hashes.
2. **`src/hostOpsAgent.ts`:** `verifyOperatorOrderLocal` (ou o deps.fileReader injetado) lê o arquivo via `sudo -n /usr/bin/cat <path>` com argv exato (zero shell), fallback: leitura direta (para ambientes onde o processo é root — container de teste) e kill switch `HOST_OPS_TOKEN_VIA_SUDO=0`. Trilha de audit mantida.
3. **Suítes:** testes novos (A: leitura via sudo cat em modo não-root simulado; B: fallback direto como root; C: kill switch; D: comando fora da allowlist do sudoers recusado) + suítes existentes do agente verdes.
4. **Restart:** `sudo systemctl restart eng-mcp-host-ops-agent` (o sudoers já permite ao próprio agente) + reload do runner se necessário.
5. **Backup** `.bak-RD-HOST-02` antes de editar; commit na main local com a decisão no corpo.

## Provas mínimas (verify-<missionId>.json tipado)
- E2E REAL: requisição de mutação tier-1 (restart eng-mcp-host-ops-probe.service) com operatorOrder válido → `decision: executed` no audit `/data/audit/host-ops.jsonl` (agora o agente lê o hash e confere); com order inválido → recusa tipada mantida.
- `visudo -c` OK; suítes verdes; commit provado por git.log.

**operator_channel:** declare no resultado final.