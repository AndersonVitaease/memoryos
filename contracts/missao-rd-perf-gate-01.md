# MISSÃO RD-PERF-GATE-01 — Gate de memória: 1 chamada Jev em vez de 3 + cache de projectId por sessão

**Componente:** eng-mcp (`src/missionMemoryCapture.ts` / gate MEMORY-GATE-01) · **Prioridade:** 2 · **Autoria:** operator 05/10 ("sim autorizo") · **Fonte:** RELATORIO-RD-EV-04 (p50 capture ≈ 2,5–3s = preço do gate, não do router)

## Problema
Cada "grave na memória" paga o gate server-side com **3 chamadas Jev** (≈2,5–3s e ~3× custo por capture). O projectId classificado por sessão é estável — recalcular a cada capture é desperdício.

## Escopo
1. **Batch Jev:** as 3 questões do gate (dedupe/credencial/no_injection) consolidadas em **1 chamada única** (payload estruturado, p-valores individuais mantidos na resposta e no audit) — mesma política de recusa, MESMAS decisões, menos latência (alvo <1,5s p50). Fail-open e recusas tipadas idênticas.
2. **Cache de projectId por sessão:** projectId resolvido (tier-2 Jev) cacheado na sessão com TTL curto (ex. 10min); frases seguintes sem tema reusam; mudança de sessão ou `tema explícito` sempre resolve direto (tier-0). Cache em memória do processo (sem estado em disco), audit declara `cached:true`.
3. **Suítes:** testes novos (batch único com p-valores; cache hit/miss/expiry; recusas idênticas) + suítes existentes do gate verdes (missionMemoryCapture.test.ts etc.).
4. **Provas:** E2E capture antes/depois medindo p50 (alvo: queda ≥40%); decisão idêntica para o MESMO input pré/pós-batch (comparação gravada).

## Restrições
- NUNCA pular o gate (MEMORY-GATE-01 é fronteira); dedupe e CREDENTIAL_PATTERN mantidos server-side (pré-check barato fica).
- Backup `.bak-RD-PERF-GATE-01`; commit na main local; deploy/registro pende SHIP (DEFER ok).

**RELATÓRIO pt-BR + PARE no pane.**