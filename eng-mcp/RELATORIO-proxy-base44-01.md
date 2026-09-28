# RELATÓRIO proxy-base44-01 — 2026-09-28

## Veredito
**O proxy base44 NÃO estava morto nem precisa de reconstrução.** O "000" de 02:37 foi um sintoma transitório da cascata OOM (herdr+docker+gateway derrubados — ver MEMORY.md do Hermes). O próprio Hermes registrou `engmcp: revived … parked → connected` às 02:46:18/02:46:28 (errors.log L4503/4505). Nenhum unit, serviço ou substituto foi criado, religado ou alterado.

## 1. Diagnóstico — o que é o proxy
- NÃO é unit/serviço local. É a backend function **Base44 `engMcpProxy`** (`base44/functions/engMcpProxy/entry.ts`, commits 7dd28f33/8889b9fa), hospedada em `https://ever-mind-core.base44.app/functions/engMcpProxy`.
- Cadeia: Hermes (`mcp_servers.engmcp`, `/root/.hermes/config.yaml:204`) → Base44 engMcpProxy (gate `X-Proxy-Secret` = secret Base44 `ENG_MCP_PROXY_SECRET`, injeta `ENG_MCP_BEARER_TOKEN`) → `https://memoryos-engmcp.2-25-96-245.nip.io/mcp` → Caddy (`reverse_proxy 127.0.0.1:8787`) → ENG-MCP 8787.
- Consumidor: canal Hermes `engmcp`. Existe também o substituto local já construído em STORE-MIG-01 (`POST /mcp-proxy` em `src/memoryProxy.ts`, secret próprio) — não usado pelo `engmcp` hoje; não tocado.

## 2. Liveness por salto (medido, 10:5x UTC)
| Salto | Resultado |
|---|---|
| Base44 engMcpProxy sem secret | 403 `{"error":"Forbidden"}` (0.33s) — gate vivo |
| Upstream público nip.io/mcp sem auth | 401 `AUTHENTICATION_REQUIRED` (0.34s) — Caddy→8787 vivo |
| 8787/mcp local sem auth | 401 (0.001s) |

Observação honesta: meus testes curl manuais com o header do config deram 403 porque o valor em `config.yaml` é uma referência `${…}` (placeholder, não o secret literal) — o 403 era do teste, não do proxy. A leitura do valor resolvido foi negada pelo classificador (Credential Exploration) e NÃO foi contornada.

## 3. Prova e2e (resposta viva, não fabricada)
`hermes mcp test engmcp` — o Hermes resolve sua própria credencial, nenhum secret passou por este agente:
```
2026-09-28T10:58:13Z
  Testing 'engmcp'...
  Transport: HTTP → https://ever-mind-core.base44.app/functions/engMcpProxy
  ✓ Connected (6140ms)
  ✓ Tools discovered: 124
    engineering.supervised_mission, engineering.repo.structure, engineering.file.read, … (lista completa na saída)
```
Controle `hermes mcp test engmcp-local` (8787 direto): `✓ Connected (3544ms)`, `✓ Tools discovered: 124` — mesmo catálogo pelos dois caminhos.

## 4. ENG-MCP 8787 intocado
PID 339584 (`node --import tsx src/main.ts`) com etime 08:17:17 → 08:20:06 ao longo da missão = sem restart; 124 tools em ambos os canais. Nenhuma escrita em 8787, Caddy, units, config Hermes ou `/root/.hermes/plugins/mission-ops`.

## Gray-zones (não verificado)
- Valor de `ENG_MCP_PROXY_SECRET` no painel Base44 vs secret do Hermes: não comparado (credencial). Evidência indireta de que batem: conexão e2e ok.
- Latência base44 6.1s vs 3.5s local — não investigada (fora do escopo).
- "Registrar como dado no catálogo": registrado neste relatório + FINGERPRINT abaixo; nenhuma entrada de catálogo/registry foi mutada (seria mutação governada, não necessária — nada mudou).

FINGERPRINT {"missionId":"proxy-base44-01","head":"8c8e422a81f9db1b646d175e0362a743185f0234","verdicts":{"base44_e2e":"connected_124","local_e2e":"connected_124","eng8787":"untouched_pid339584"},"ts":"2026-09-28T10:59:00Z"}
