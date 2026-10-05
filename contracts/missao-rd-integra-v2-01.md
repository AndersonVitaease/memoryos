# MISSÃO RD-INTEGRA-V2-01 — Critério de close v2 (RELATÓRIO-INTEGRA) + bloco chatIntegra formalizado no plugin

**Fonte:** dívida do fecho RD-PERF-VERIFY-01 (`relatorio_integra_missing`/`mission_cost_unmeasured` — critério antigo) + ordem do operator 05/10 ("grave no harness para obedecer sempre")
**Componente:** mission-ops (`/opt/operator-harness/plugins/mission-ops/`)

**Contexto:** o supervisor aplicou host-side (05/10) um patch que faz o close devolver o bloco `chatIntegra` (resumo 1-linha + caminhos + custo + dívidas + template pronto para colar no chat). Esta missão FORMALIZA esse comportamento: teste, suíte, e o critério do guard atualizado da doutrina antiga (colagem integral) para a v2 (resumo no chat + arquivo + ack).

**Escopo (worker):**
1. Conferir/normalizar o patch `chatIntegra` (aplicado host-side em 05/10) — se ausente na cópia do plugin, reaplicar conforme o design; suíte nova: todo close devolve `chatIntegra` com template_chat preenchido (fail-open tipado).
2. Atualizar o critério do `relatorio_integra_guard` para v2: relatório na íntegra em ARQUIVO + resumo/caminho/custo no chat (bloco chatIntegra) + ack (`mission_report_ack`) — elimina o falso-positivo `relatorio_integra_missing` nos closes v2.
3. Custo no fecho (converge com RD-OPS-03): quando o resolver de spend não cobre o root do transcript (ex. `/opt/mission-supervisor`), registrar a fórmula + fallback de cálculo direto do transcript.
4. Suíte existente do close verde.

**Proibido:** tocar em produção eng-mcp, panes em voo, remover guardas existentes.
**Entrega:** relatório + verify.json (verdict REAL) + resumo no pane com PASS/FAIL + PARE.
