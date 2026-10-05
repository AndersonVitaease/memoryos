# RELATORIO — RD-PERF-GATE-01

**Data:** 2026-10-05 · **Missão:** RD-PERF-GATE-01 · **Contrato:** `/opt/mission-events/missao-rd-perf-gate-01.md` (CONTRATO OK ecoado no pane no início)
**Commits:** eng-mcp `7ea4e384` (código + testes) e `e7928b8e` (prova E2E), na **main local**; plugin fast-router `8e1b889` (repo próprio). Deploy/registry: **DEFER para SHIP** (cláusula do contrato).

## Problema

O gate MEMORY-GATE-01 re-ler a ponte Base44 (`memory.context`, ~2.6s) a cada capture; capture p50 medido ao vivo **3469ms** (baseline `prova-rd-perf-gate-01-baseline.json`). O plugin fast-router re-classifica o projectId via Jev (tier-2) a cada frase de memória sem tema.

## Entrega

**1. Batch Jev — premissa do contrato corrigida com prova.** O judge do gate **já é batch único** (1 chamada HTTP, `evaluate` n=3 com exatamente as questões `durable_substance`/`claims_supported`/`no_injection`, p50 ~200ms medido no audit de produção). A premissa "3 chamadas" era falsa. Entregável adaptado (escopo técnico meu, decidido conforme contrato): p-valores **individuais** agora vão para o audit do gate (`p:{...}`), junto de `judge_ms` e `dedupe_cached` — mesma política de recusa, decisões idênticas.

**2. Cache TTL do context de dedupe (o gargolo real).** `cachedRecentContext(projectId, fetcher, {ttlMs=600s})` em `src/memoryGate.ts`, em memória do processo (sem estado em disco), fiação nos DOIS callers (`memory.capture` tool e fecho server-side `missionMemoryCapture.ts`):
- **append-on-capture** (`noteGateCapturePayload`): repetição imediata continua **recusada VIA CACHE, antes do judge** — recusa byte-a-byte idêntica ao caminho com leitura fresca;
- falha de leitura **nunca** cacheada (re-tenta o vivo); shape desconhecido invalida a entrada;
- kill switch `ENG_MCP_GATE_CONTEXT_CACHE=off` restaura leitura sempre fresca;
- audit declara `dedupe_cached` (true/false) — observabilidade do que foi servido do snapshot.

**3. Cache de projectId por sessão no fast-router** (entrega 2 do contrato). `_PID_SESSION_CACHE` (memória do processo, TTL 600s, chave = session_id) em `/root/.hermes/plugins/fast-router/__init__.py` (backup íntegro `__init__.py.bak-RD-PERF-GATE-01`, 74781 bytes, cmp ok): só classificação Jev **bem-sucedida** entra; **tema explícito (tier-0) e fallback NUNCA cacheados**; mudança de sessão resolve direto; trilha declara `cached:true`; kill switch `FAST_ROUTER_PID_CACHE=off`.

## Provas (verify-RD-PERF-GATE-01.json — **verdict: pass REAL** do runner)

- **Suíte eng-mcp completa:** 1771 ok / 0 fail (`npm test`, ~52s).
- **Plugin:** `test_rd_perf_gate01.py` NOVA (13 checks: hit sem Jev, trilha `cached:true`, tier-0 intocado, sessão nova, fallback nunca cacheado, TTL, kill switch) + `test_rd_ev04.py` verde (regressão da rota) + guard01/mobile02/phase23 verdes.
- **E2E hermético fresh-vs-cacheado** (`prova-rd-perf-gate-01-e2e.mjs`, contra ponte e Jev REAIS via servidor de produção, modo stateless 1-POST; store nunca chamado in-process):
  - p50 **fresca 1945ms → cacheada 1095ms** — queda **43.7% ≥ 40% ✓**; p50 cacheada **< 1.5s ✓** (e inclui ~0.7s de overhead fixo do adaptador — produção in-process é mais rápida);
  - **MESMO input:** decisão idêntica fresh vs cacheada (admit/screened, Δscore 0.004 — tolerância 0.05 declarada para variância probabilística do Jev);
  - **MESMO repeat:** recusa byte-a-byte idêntica fresh vs cacheada (dedupe contra conteúdo REAL gravado no KB do projeto isolado `rd-perf-gate-01-e2e`).

## Dívidas / achados

1. **`test_queue01.py` RED pré-existente (ambiental, NÃO é regressão desta missão):** 3 checks do Q3 falham porque a fila viva rotacionou (intents `SEC-SURFACE-01`/`ORCH-V2-CGROUPS-01` não estão mais no `orchestrator-queue.jsonl`). **Prova:** falha idêntica rodando o módulo BACKUP pré-alteração (`__init__.py.bak-RD-PERF-GATE-01`) — o teste E2E live lê dados que mudaram. Reparo sugerido: fixture sintética em vez de fila viva.
2. **Transporte MCP: `buildMcpHandler` construído POR request** (~108 tools re-registradas; custo fixo ~0.7–0.85s por POST, medido com curl/python/node idênticos) — dominante no caminho via-MCP, pré-existente e fora do escopo do gate. Caminho in-process (fecho server-side) não paga. Candidato a missão própria (handler por subject cacheado).
3. **Deploy/registry em DEFER (SHIP):** produção segue na imagem 984a4504; os alvos finais em produção (<1.5s p50 end-to-end) se confirmam no E2E pós-deploy da SHIP. O cache do plugin só entra em produção com reload do gateway Hermes (host-side).
4. **Judge via servidor vs direto:** produção chama o Jev direto (OpenRouter); o adaptador da prova desvia via `engineering.judge.evaluate` do servidor (credencial nunca sai do servidor — stub `sk-or-v1-` no formato exigido). Overhead do adaptador declarado acima.

## Custo

| Categoria | Tokens |
|---|---|
| input | 2.468.894 |
| output | 256.364 |
| cache_read | 36.061.184 |

**Custo estimado: USD 1.5804** — fórmula RD-OPS-03-SPEND-01 `(in*0.15 + out*0.5 + (cache_read+cache_write)*0.03)/1e6` com a tabela `orchestrator-price-table.json` (2026-10-01, z-ai/glm-5.3-flash), medido dos transcripts desta sessão (`custo-RD-PERF-GATE-01.py` → `custo-RD-PERF-GATE-01.json`). Custo Jev induzido pelas provas: ~18 chamadas × ~$0.000012 ≈ $0.0002 (audit de produção).

## Memória

- **Auto-memory local gravada** (entrada `rd-perf-gate-01-delivered` no MEMORY.md com as lições da missão).
- **Capture no KB:** o capture automático server-side (`missionMemoryCapture`) roda no **fecho** da missão (ledger `status: dispatched` — fecho pelo operator/supervisor); ao fechar, o dedupe do gate funciona já otimizado no código novo.

**Memória: gravada localmente (auto-memory); capture do KB pendente do fecho server-side.**

PASS
