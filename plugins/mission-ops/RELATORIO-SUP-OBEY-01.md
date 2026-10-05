# RELATORIO-SUP-OBEY-01 — Guardas de obediência: as ordens do operator viram tool que recusa

## Problema
A obediência do supervisor aos 5 pontos do operator (relatório integral no chat,
ship via missão, despacho só pelo orquestrador, eng-mcp primeiro, pergunta
conceitual = não executar) dependia de memória de conversa — falha sob
truncamento. Contrato: /opt/mission-events/missao-sup-obey-01.md (03/10).

## Contexto da reexecução
A 1ª tentativa (sessão anterior) teve hunks de integração em `__init__.py`
DESTRUÍDOS por revert externo (2x hoje — ver commit `05019ec`/`29e374c`).
Sobreviveram como untracked `obedience.py`, `OBRIGACOES.md` e este RELATORIO
(versão antiga, com "Prova: PENDENTE"). Esta execução reconstituiu a integração,
alinhou os códigos tipados ao contrato e rodou TODAS as provas.

## Entrega (commit `ffc7c30`)
- **OBRIGACOES.md** — fonte única versionada com as 5 ordens + origem + data (do
  residuo protegido; sem mudança nesta fase).
- **obedience.py** — guardas zero-LLM, fail-open, nunca levantam, agora ALINHADOS
  AO CONTRATO:
  - `boot_context()` — OBRIGACOES.md integral dentro de `<obrigacoes-operator>`.
  - `relatorio_pendente_guard()` — warning tipado `relatorio_nao_entregado_chat`
    (antes: `relatorio_nao_lido`, fora do contrato).
  - `detect_ship_direct()` — código `direct_ship_violation` (antes:
    `ship_direct_violation`); padrão `engineering_release_pipeline` acrescentado.
  - `scan_day_direct_ship()` / `new_direct_ship_findings()` — NOVO: varre o
    `events.jsonl` DO DIA (path do estado do plugin, dedupe por fingerprint),
    ignora missões `SHIP-<alvo>` (caminho correto) e o próprio registro do finding.
  - `dispatch_owner_guard()` — warning `dispatch_not_orchestrator` com
    `pendingIntents`; fila configurável por env (testes não tocam a fila real).
- **__init__.py** — integração reconstituída, 4 pontos:
  1. Boot (`register()`): OBRIGACOES.md carregado e injetado no bus como
     `obrigacoes_boot` com o bloco INTEGRAL (spool próprio, sem cap de 400);
     fail-open.
  2. `handle_mission_close` (fim): payload ganha `chatDeliverable`
     (missionId/path/content INTEGRAL do `RELATORIO-<id>.md` do cwd do close);
     ausente → warning `relatorio_nao_entregado_chat`; + `directShipViolations`
     (violações do dia listadas no fecho). Fail-open — nunca derruba o close.
  3. `handle_mission_watch` (all/snapshot e single): warnings de `_obedience_warnings()`
     — `dispatch_not_orchestrator` quando a fila tem intents pendentes e o chamador
     não é o daemon (`ORCH_DAEMON_APPROVED=1` silencia).
  4. Ciclo de snapshot: `_announce_direct_ship()` registra `direct_ship_violation`
     no bus + trilha de eventos (1x por ciclo, dedupe).
- **test_sup_obey_01.py** (novo, 14 testes) — G1 boot (conteúdo integral no spool,
  >400 chars), G2 E2E close→chatDeliverable integral + warning tipado quando
  ausente, G3 detecção/scan/dedupe/E2E fecho lista violações, G4 guard + helper
  com daemon-flag, G5 robustez contra lixo.
- **test_mission_ops.py / test_close_verify_path.py** — 4 asserções legadas
  (`assertNotIn("warnings", out)`) atualizadas para esperar o warning tipado novo
  (mudança INTENCIONAL de contrato do close).

## Prova (rodada de verdade, evidência no verify-SUP-OBEY-01.json)
- `python3 -m unittest test_mission_ops` (systemd-run --scope isolado):
  **Ran 139 tests — OK** (32.6s).
- `python3 -m unittest test_sup_obey_01 test_close_verify_path test_close_ship`
  (systemd-run --scope): **Ran 40 tests — OK**.
- Suítes irmãs verdes: close_commit_guard 16, snapshot 13, watch_detector 12,
  bus_guard 12, chain_dispatch 17, lane2 15, orch_autoclose 19, trinity_wire 22,
  proof_lint03 7, verify_author 10 (2 skip), demais OK.
- E2E do contrato: close de missão de teste → `chatDeliverable` presente no
  payload com conteúdo integral (test_close_returns_chat_deliverable_integral).

## Dívidas
1. `test_contract_recover.py` falha no HEAD limpo TAMBÉM (falhas=8, erros=6
   pré-existentes, provado com stash antes do meu commit) — resíduo
   ORCH-CONTRACT-RECOVER-01, fora do escopo desta missão.
2. `test_batch_e2e.py` é script E2E REAL (despacha panes vivos) — não faz parte
   da suíte unitária; não rodado nesta fase.
3. `detect_conceptual_question` é detector pronto/testado, sem wiring em handler
   de texto (a ordem 5 vive no OBRIGACOES.md injetado no boot).
4. Ship do commit `ffc7c30` via missão SHIP-<alvo> quando o operator mandar
   (nunca push direto — OBRIGACOES item 2).

**PASS**
