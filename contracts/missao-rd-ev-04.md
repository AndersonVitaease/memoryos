# MISSÃO RD-EV-04 — Rota "grave na memória" no FAST-ROUTER (3-andares)

**Componente:** eng-mcp (fast-router) + mission-ops · **Prioridade:** 3 · **Fonte:** ROADMAP RD-EV-04; doutrina "REGRA 'GRAVE NA MEMÓRIA'" (KB, operator 02/10) · **Autoria:** operator 04/10 ("todo o roadmap" + "vamos iniciar orchestrar tools com o orquestrador")

## Problema
O comando do operator "grave na memória" hoje depende do supervisor lembrar de chamar memory_capture — viola a doutrina (ferramenta nova = ferramenta USADA; comando do operator = capture no MemoryOS com projectId do tema).

## Entrega (não-quebrante)
1. Rota no catálogo FAST-ROUTER (tier-0 regex custo-zero): frases do operator ("grave na memória", "grave isso", "memoriza" + variantes pt-BR) → capture no MemoryOS via engineering.memory.capture (projectId por mapa de tema/argumento da frase).
2. Tier-2 (Jev) só para classificar o projectId/tema quando a frase não o citar explicitamente — mesma política do router (financeiro/aprovação NUNCA interceptável pela camada rápida).
3. Fail-open tipado: falha de capture NUNCA bloqueia o chat; resposta honesta "gravei" / "não gravei: <causa>".
4. Latência medida (p50 do tier-0 ~regex; tier-2 com custo por chamada no audit).

## Provas (reais)
- E2E: frase canônica do operator → 1 entrada no MemoryOS com projectId correto e conteúdo íntegro (prova de leitura de volta); frase ambígua → tier-2 Jev classificando; suítes íntegras; verify.py pass; RELATÓRIO pt-BR íntegra + ack.

## Restrições
- Só o caminho da rota de memória. Nada de veredito/gate/ship. Aprovada com política de emissão NUNCA-auto-allow herdada do desenho WOOBA (memória não é emissão, mas capture de segredos é PROIBIDO: conteúdo com padrão de credencial → recusa tipada).