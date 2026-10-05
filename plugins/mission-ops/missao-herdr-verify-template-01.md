# HERDR-VERIFY-TEMPLATE-01 — VERIFY.JSON TIPADO NO CONTRATO DE DISPATCH

## Problema (flagado 29/09 ~20:30)
Missões fecham com close fail-open porque o verify.json gravado pela worker usa
formato não-tipado (ex.: "cmds"/"files" ou cmd sem campo "run") que o runner
/opt/deliver-verify/verify.py não parseia ("tipo de prova desconhecido" / "campo
run ausente" / dono com case errado). Resultado: close sai sem badge de
verificação mesmo com testes rodados de verdade no pane.

## Contrato
1. DISPATCH_TEMPLATE (mission_core.py): acrescentar cláusula de entrega que obriga
   a worker a gravar verify.json NO FORMATO TIPADO antes de parar:
   - dono: campo "mission" EXATAMENTE igual ao missionId do ledger (case idêntico)
   - provas tipadas: "cmd": [{"run": "<comando>", "expect_exit": 0}] e
     "file": [{"path": "..."}] (ver /opt/deliver-verify/verify.py proof_cmd/proof_file)
   - NÃO usar "cmds"/"files" nem campo "cmd" dentro das entradas
2. Adicionar ao template: "Antes de encerrar, rode mission_verify (ou o runner
   /opt/deliver-verify/verify.py com o seu verify.json) e só pare com verdict pass."
3. NÃO alterar handlers, watchdog, bus, engine flags nem nada além do template
   (e, se existir, teste de snapshot do template) em mission_core.py.
4. Provas: suíte do plugin verde (test_mission_ops.py 125 testes) + um teste que
   valide que o template renderizado contém as instruções do formato tipado.

## Provas obrigatórias (verify.json no FORMATO TIPADO desta vez)
- cmd: python3 test_mission_ops.py → exit 0
- cmd: grep do template contendo '"run"' e 'mission_verify'
- file: RELATORIO-herdr-verify-template-01.md

## NÃO destruir
- Zero deploy/restart; só código do plugin + teste.
- or-worker-bridge (:8103, glm) produção — não mexer.
- Outras missões em voo: engmcp-tools-fix-01 (idle) — não tocar no pane dela.
