# RELATORIO — ENG-MCP-MISSION-01/02 (fusão: 7 tools mission-* no eng-mcp + gate JEV)

Data: 29/09/2026 · Owner: supervisor Hermes (execução direta — workers despachados 2x falharam:
mission-01 request >32MB com CLAUDE.md de 241k; mission-02 narrou pseudo-tool-calls 2x sem executar).
Operator autorizou execução direta pelo supervisor (padrão do dia). Zero custo OR (só gate JEV: $0,00006 em 3 decisões).

## O que foi entregue (os 2 contratos em 1 passe)
**Fonte única de verdade**: as tools eng-mcp NÃO duplicam a lógica — cada chamada é um subprocesso
python que carrega o plugin mission-ops do disco e invoca o handler puro (JSON in/out). O plugin
continua sendo a implementação; o eng-mcp é a superfície governada.

| Tool eng-mcp | Handler do plugin | Escopo |
|---|---|---|
| engineering.mission.dispatch | handle_mission_dispatch / handle_mission_batch | lote 2-6 numa chamada; anti-zumbi (fecha abas MISSION:<id> duplicadas antes de criar); fail-fast 45s; gate de cadeia |
| engineering.mission.status | handle_mission_snapshot | verdict OK/PANEID_OBSOLETO/FANTASMA/INTERROMPIDA/etc + auto-correção de ledger; typo-tolerante (difflib ≥0.8) |
| engineering.mission.read | handle_mission_read | I/O puro |
| engineering.mission.watch | handle_mission_watch | 8 detectores de evento |
| engineering.mission.recover | handle_mission_recover | escada enter→nudge→redeliver |
| engineering.mission.close | handle_mission_close + **GATE JEV** | ver §Gate |
| engineering.mission.ledger_fix | handle_mission_ledger_fix | correção manual de ledger |

Arquivos: `src/missionOps.ts` (wrapper + schemas zod + gate), `src/tools.ts` (registro, 7 tools,
scopes read/write), `scripts/jev_gate.py` (helper JEV). Nenhum handler do plugin alterado.

## O Gate JEV (ENG-MCP-MISSION-02 — fim do fail-open)
- Trigga quando o close sai fail-open (verify estoura o budget) ou reabre por prova vermelha.
- **Lê o RESULTADO já gravado** pelo deliver_verify (nunca re-executa checks — lição: 1ª versão
  executava e um check de 40s estourava o timeout do gate).
- Pergunta ao JEV (typesafe/jev-1.13, /alpha/decisions, contrato decisions com questions/criteria
  idêntico ao do watchdog): "provas suficientes?" → SIM fecha com badge jev-verificado;
  NAO → verify_required honesto (fail-CLOSED); JEV indisponível → fail-open atual (degraded).
- JEV decide APENAS suficiência de provas — nunca autoriza consequência externa.
- **Provas ao vivo**: SIM 213ms (relatório 3/3 verde) · NAO 357ms (check com exit 124) ·
  credencial só hash16 (b4df7f0929438dd8) no output, nunca o valor.
- Correção honesta no caminho: 1ª evidência tinha o sinal "executados: false" que confundia o
  JEV (votava NAO com relatório verde) — removido; evidência agora é o relatório do close.

## Provas (red→green e E2E)
- tsc: **0 erros novos** (107 pre-existentes do repo — idênticos no stash e com as mudanças).
- Suíte eng-mcp: **1590 pass / 1 fail = idêntico ao baseline** (a 1 fail é a LIVE /mcp-proxy
  pre-existente, dependente de ambiente). 5 asserções de catálogo atualizadas (130→137: base44Tools,
  alias-compat 3x, shiplock gate, integration list+counts) — mudança intencional de catálogo.
- E2E real via wrappers: dispatch do canário **engmcp-gate-canario** (13,0s tool_latency) +
  status OK na mesma chamada (total 13,4s para dispatch+status); worker executou de verdade
  (/tmp/engmcp-gate-prova.txt = ok); close com verify 2/2 verde → badge, gate "not-needed".
- Caminho NAO (fail-closed): canario2 (prova verde mas lenta) → gate devolveu verify_required
  honesto em 357ms.
- Caminho degradado: JEV indisponível → fail-open atual mantido (testado por contrução do código).

## Latência (a medida que importa)
| Operação | Antes (turnos LLM) | Agora (1 chamada) |
|---|---|---|
| Despachar 1 missão | 1-2min + risco de fantasma | 6,9-13s |
| Despachar 2 missões | 2 turnos × 2min | 25,5s (lote) |
| "Verificar missão" | 5-6 turnos, 2-3min | 1 chamada ~5s (0,06s sem herdr lento) |
| Fechar com provas | turno + fail-open silencioso | badge honesto (pass ou JEV) |

## Ativação
- O serviço eng-mcp (8787) roda código em memória — restart necessário para as 7 tools
  aparecerem no catálogo. Feito pelo supervisor no fim desta missão + health check.
- Rollback: git checkout dos 3 arquivos (tools.ts, missionOps.ts novo, tests) — zero
  handler de plugin alterado; sem migration; sem credencial nova.

## Lições registradas
- workers gpt-oss-120b via claude-CLI: 2/2 sessões degeneradas nesta dupla (request>32MB com
  CLAUDE.md gigante; narração sem execução) — custo do resgate > custo da execução direta.
- CLAUDE.md de /opt/memoryos com 241,8k chars (>150k) infla toda missão nesse cwd — cortar.