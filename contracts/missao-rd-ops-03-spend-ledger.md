# MISSÃO RD-OPS-03 — Campo `spend` no ledger do close (fonte: RELATORIO-ORCH-TELEMETRY-01 L16; relatório RD-GUARDIAN-MT-DESIGN-01 dívida análoga)

**Componente:** mission-ops (`/opt/operator-harness/plugins/mission-ops/__init__.py`) · **Prio 3** · **Enfileirada por intent do operator 05/10 (orch-1791207371704-d0eb)**

**Problema:** o custo real da missão já é calculável (engineering.orchestrate.mission_spend / orchestrate.list), mas o ledger do close grava `cost_unmeasured` ou nada no campo `cost` — os relatórios de hoje (ex.: RD-GUARDIAN-MT-DESIGN-01, RD-PERF-VERIFY-01) fecham com warning `mission_cost_unmeasured` mesmo com transcript completo.

**Escopo (worker):**
1. No `handle_mission_close` (passo `mission_cost`, ORCH-SPEND-LEDGER-01): quando `transcript_cost_record()` retorna `cost_unmeasured` por motivo `spend_*` RECUPERÁVEL (transcript existe mas a resolução falhou — ex. `no-transcript` com sessionId presente), re-tentar com resolução por conteúdo (fallback já implementado no server-side) e gravar o `cost` REAL no ledger; só deixa `cost_unmeasured` quando o transcript genuinamente não existe.
2. Caso conhecido (RD-HERDR-OSC-01): transcript existe em `/opt/mission-supervisor/.claude-config/projects/` mas o root não está em `spendClaudeConfigDirs` — incluir propostas de fix (env `ENG_MCP_CLAUDE_CONFIG_DIRS` no deploy, OU inclusão do root no default) como parte do design da correção no relatório.
3. Suíte: testes novos (close grava spend real; cost_unmeasured só nos motivos genuínos) + suíte existente do close verde.

**Proibido:** mexer em produção/ship, restart de serviços, tocar em panes de missões em voo (w7:p2/p3/p4/p5).

**Entrega:** relatório `/opt/mission-events/relatorio-rd-ops-03-spend-ledger.md` + `verify.json` (verdict REAL) + resumo no pane com `PASS`/`FAIL` + PARE.
