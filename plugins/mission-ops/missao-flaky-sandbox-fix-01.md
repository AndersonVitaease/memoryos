# flaky-sandbox-fix-01 — TESTES DO GPU-DOWN NUNCA MAIS BATEM NO VASTAI REAL

Defeito provado 28/09 em 2 rodadas (supervisor, suíte mission-ops fora do sandbox):
`test_mission_ops.TestGpuDownFix01` — 4 testes (test_green_destroy_unverified_exit4_ledgers_extra,
test_green_full_path_mixed_types, test_green_garfo_skips_own_recent_mission, test_green_missing_and_none_fields)
falham INTERMITENTEMENTE com o vastai REAL: "[gpu-down] ERRO: destroy NÃO emitido (vastai exit 5) — instância
52953260 segue de pé e COBRANDO". O subconjunto de falha varia por rodada (classe flaky anotada pela lane2:
"sandbox bash com timeout — subconjunto diferente a cada rodada"). Causa: os testes dependem do fake CLI /
sandbox bash que só o runner isolado (run_suites.py / systemd-run MEM-GUARD) monta — fora dele, o vastai real
é chamado (e pode: (a) cobrar, (b) variar com auth 2FA, (c) sujar estado real).

## Entrega
1. **Isolamento determinístico**: os 4 testes (e qualquer teste que toque vastai/gpu-down/gpu-up) rodam
   SEMPRE com o fake CLI (fakes/ existente ou equivalente) — nunca o binário real, independente de quem
   invoca (unittest direto, runner, CI, supervisor à mão). Mecanismo: fixture/conftest que injeta o PATH do
   fake + bloqueia resolução do binário real (assert no teste se o real for resolvido = falha com motivo claro).
2. **Guard de segurança no teste**: nenhum teste de suíte pode emitir comando vastai que NÃO seja o fake —
   teste que flagra isso falha com mensagem honesta ("teste tentou vastai real").
3. **Prova**: (a) red→green — rodar a suíte N vezes (≥5) direto, fora do sandbox: 4/4 estável, 0 flaky;
   (b) subconjunto com auth real variando não muda o resultado.
4. **Suítes**: test_mission_ops inteira verde (110 testes), run_suites.py verde (regressão zero).

## Restrições
- Só testes/infra de teste — NÃO tocar em código de produção do plugin (mission_core/__init__).
- NÃO tocar nos outros componentes (eng-mcp tem missão ativa hoje — drift-redact fechou; gpu-watchdog tem
  permdialog-01b em voo — NÃO ABRIR esses diretórios para editar).
- Repos local-only, sem push. Relatório: /root/.hermes/plugins/mission-ops/relatorio-flaky-sandbox-fix-01.md
  (+ verify.json executável se a entrega pedir).
