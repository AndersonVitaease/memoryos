# RELATORIO-judge-cred-fix-01 — Credencial morta do judge.ts corrigida (29/09/2026)

## Diagnóstico (confirmado por evidência)
- Credencial `/data/credentials/openrouter-judge` (host: `/opt/eng-mcp-release-data/credentials/openrouter-judge`, bind no container `memoryos-eng-mcp`):
  - `curl /api/v1/key` → **401** (dentro do container E no host) — inválida/rotacionada, data do arquivo 20/09.
- Chave da ponte `/opt/gpu-watchdog/.openrouter-key` (usada pelo `ORH` do gpu-bridge `proxy.mjs`, fallback do `/v1/judge` TRINDADE-HERDR-01): `curl /api/v1/key` → **200**.

## Fix aplicado: opção (a) — rotação da credencial, SEM tocar no judge.ts
1. Backup da credencial morta: `openrouter-judge.bak-dead-20260929` (0600).
2. Copiada a chave da ponte (200 provado) para `openrouter-judge`, mode 0600.
3. Prova dentro do container:
   - `/api/v1/key` → **200**
   - `POST /alpha/decisions` → **HTTP 200**, veredicto JSON com answers
     (`q1 choice=yes p=0.58 conf=0.17`, custo $0.000013272, model `typesafe/jev-1.13-20260917`).

## Não destruir — cumprido
- `src/judge.ts` **intocado** (zero diff em src/). Contrato, rubric e veredictos preservados.
- `npm test` não rodado: nenhum arquivo em src/ foi alterado.
- **NÃO houve deploy** (container roda imagem congelada). A correção é via arquivo bind-mountado
  (`/opt/eng-mcp-release-data/credentials` → `/data/credentials`), portanto **efetiva imediatamente**
  no container atual — não depende do próximo deploy. Registrado: a chave rotacionada é a MESMA da
  ponte; se a ponte rotacionar, este arquivo precisa acompanhar (ponto de atenção para o próximo PR).

## Validação de sincronização (encerramento)
- Hash16 da chave da ponte (`/opt/gpu-watchdog/.openrouter-key`) = hash16 de
  `/opt/eng-mcp-release-data/credentials/openrouter-judge` = `701a9c2b508397b3` → **sincronizadas**.
- `/opt/gpu-watchdog/config.json` referencia `api_key_file: /opt/eng-mcp-release-data/credentials/openrouter-judge`
  (nota 29/09: credencial dedicada do judge).
- **Rotação futura: NÃO há automação** — nenhum cron/script rotaciona `.openrouter-key` nem
  `openrouter-judge`. Se a chave da ponte for rotacionada manualmente, o arquivo do judge
  **precisa ser atualizado no mesmo passo** (ou apontar `ENG_MCP_JUDGE_KEY_FILE` para a mesma
  fonte única). Risco registrado, sem ação agora (escopo da missão: fix mínimo).

## Entregáveis
- `RELATORIO-judge-cred-fix-01.md` (este arquivo)
- `verify.json` (comandos + expect_exit)
- Backup da credencial morta preservado para rollback.
