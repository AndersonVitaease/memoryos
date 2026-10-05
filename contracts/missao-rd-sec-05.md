# MISSÃO RD-SEC-05 — Hardening de identidade do enqueue (anti-spoof/anti-replay)

**Fonte:** 3 fontes dedupe (RELATORIO-ORCH-CHAIN-CWD-01 L45–46; RELATORIO-GUARD-SUPERVISOR-READONLY-01 L41; RELATORIO-SEC-OPERATOR-IDENTITY-01 L54) · ROADMAP P3 · **Intent do operator 05/10; desbloqueado (SEC-02: token ativo)**
**Componente:** eng-mcp (`src/orchestrate.ts`) + mission-ops

**Escopo (worker):**
1. Assinar o enqueue do orquestrador: identidade do chamador no ENVELOPE (não no payload) — HMAC com o token de ordem ativo (hash no audit, material nunca em log).
2. Anti-replay: janela/nonce por intent (estado de consumo tipado no consumer).
3. Recusas tipadas: `ENVELOPE_SIGNATURE_INVALID`, `ENVELOPE_REPLAY`.
4. Suítes novas (spoof recusado; replay recusado; envelope legítimo passa) + suítes existentes verdes.

**Proibido:** quebrar o enqueue legado sem período de compatibilidade (dual-accept com warning tipado até o deploy seguinte).
**Entrega:** relatório + verify.json (verdict REAL) + resumo no pane com PASS/FAIL + PARE.
