# seclayer-ids-link-01 — TRILHA DA SECLAYER LIGADA AO IDS (gray-zone #3 da seclayer-b)

A guardian-seclayer-b-01 (fechada VERDE hoje) deixou declarado: a trilha nova
`/data/audit/security-response.jsonl` não alimenta o IDS. Com a mission-supervisor e o
import-gate (drift → rebaixamento a sandbox) já em produção, o elo que falta é simples:
verdicts BLOCK/REVIEW da security-response viram findings no bus com kind próprio,
consumíveis pelo supervisor e pela trilha do plantão.

## Entrega
1. Hook de leitura no writer da trilha security-response (ou tail no fim de cada ciclo):
   `verdict=BLOCK` (regras 009/010) → finding imediato no bus: {kind: "security_response_block",
   tool, rules[], sha16, ts} — NUNCA conteúdo cru da resposta (só hashes, padrão da trilha).
   `verdict=REVIEW` → agregado (não spamma: 1 finding por tool/hora, teto como permdialog).
2. Registro do kind novo no IDS (securityIds) para o supervisor Hermes ver no watch.
3. **Provas red→green**: (P1) resposta BLOCK sintética → finding no bus com regra correta;
   (P2) REVIEW agressivo → 1 finding só (dedupe por tool/hora); (P3) resposta limpa → zero
   finding; (P4) fail-open: trilha ausente/ilegível = sem crash, silencioso com evento.
4. Deploy :8787. Relatório RELATORIO-seclayer-ids-link-01.md + verify-<missionId>.json (dono).
5. Nota do supervisor: este despacho roda com **engine=gpu** (ponte Qwen) como prova E2E
   do workers-qwen — o worker DEVE subir no Qwen (header do pane + audit.jsonl do bridge
   registrando os tokens). Provar isso no relatório (§ engine).

## Restrições
- Componente eng-mcp (livre). Missão CURTA por desenho (é um hook pequeno). Não tocar:
  mission-supervisor (em voo), gpu-watchdog, mission-ops, guardian-compute (volume ~23h).
- Zero LLM no caminho do hook (determinístico); fail-open silencioso; sem push.