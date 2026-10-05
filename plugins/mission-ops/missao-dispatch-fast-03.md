# DISPATCH-FAST-03 — REGRESSÃO DO FAIL-FAST DO DISPATCH NA ERA SEM-GPU (fix 29/09 já pousado, faltam provas)

Contexto: GPU vast encerrada por ordem do operator 29/09 (cobrança). O dispatch padrão virou caminho morto:
gpu-up tentava 720s, claude nascia apontado na ponte Qwen 8102 MORTA, loop de ready esperava 180s e o pane
morria (caso real: models-roles-01b, 3 despachos perdidos). FIX já aplicado no plugin
(/root/.hermes/plugins/mission-ops/__init__.py, 29/09 ~11:12, por ordem "conserte" do operator):
1. Fail-fast: 8102 /health com timeout 2s → morta = PULA gpu-up (evento gpu_up_skipped no spool), sem os 720s.
2. Fallback sem-GPU (openrouter-fallback): claude da missão nasce apontado no 8103 (OpenRouter) — antes
   nascia SEM base URL (claude caro direto, sem proxy/barreira).
3. worker_model lido da unit /etc/systemd/system/or-worker-bridge.service (fonte única) — era 20b hardcoded.
4. Serviço or-worker-bridge (:8103, gpt-oss-120b) ATIVO como produção (ordem operator: worker = gpt-oss-120b).
Suíte unit do plugin: OK (pós-patch). FALTAM: regressão completa + prova E2E de despacho rápido.

## Entregáveis
1. REGRESSÃO COMPLETA do plugin: python3 -m unittest discover no /root/.hermes/plugins/mission-ops
   (test_mission_ops + test_chain_dispatch + test_ledger_hygiene + test_watch_detector +
   test_mission_resume + test_verify_author + test_verify_json_ghost) — tudo verde; se algo quebrar
   pelo patch do fail-fast, corrigir no patch (não reverter).
2. PROVA E2E de despacho: 1 missão canário descartável (wd02-t9 ou similar, prompt trivial de 1 linha:
   "escreva <data-hora> em /tmp/dispatch-fast03-prova.txt e nada mais") despachada SEM engine declarado
   — provar no ledger/spool: (a) gpu_up_skipped no spool (fail-fast), (b) engine=openrouter-fallback,
   (c) tempo despacho→ready < 60s (comparar createdAt vs dispatchedAt do ledger — a prova da otimização),
   (d) canário completa o arquivo. Fechar a canário depois (verify dispensável — é descartável,
   acceptUnverified com o apontamento das provas).
3. Documentar em relatório: tabela {caminho, antes, depois} dos tempos de despacho e o que fazer
   QUANDO A GPU VOLTAR (o fail-fast não pode esconder a ponte viva: health 2s positivo → gpu-up normal).

## Guardas ineguiáveis
- NÃO reverter o patch do fail-fast (é ordem do operator "conserte").
- or-worker-bridge (:8103) é PRODUÇÃO agora: pode startar se cair, NUNCA stop/disable.
- Zero create/destroy vast; zero restart de gpu-recover/gpu-watchdog (parados por ordem); zero push/deploy;
  zero toque em /opt/memoryos/eng-mcp.
- Judge do gpu-watchdog = JEV (typesafe/jev-1.13 via /alpha/decisions) — NÃO MEXER.
- Custos: centavos (gpt-oss-120b ~$0,1/M); registrar créditos OR antes/depois.

## Provas (red→green)
- Suíte completa do plugin verde (regressão).
- Canário E2E: gpu_up_skipped no spool + engine=openrouter-fallback no ledger + tempo <60s + arquivo criado.
- verify.json no cwd (padrão MANIFEST_META_KEYS: mission/date/owner/note + cmd executáveis).
- Relatório: RELATORIO-dispatch-fast-03.md no cwd.