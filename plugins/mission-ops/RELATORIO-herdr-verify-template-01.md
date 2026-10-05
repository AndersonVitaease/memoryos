# RELATORIO-herdr-verify-template-01

## Problema
Missões fechavam com close fail-open: a worker gravava verify.json em formato não-tipado
("cmds"/"files", cmd sem "run", dono com case errado) e o runner /opt/deliver-verify/verify.py
não parseava — close saía sem badge de verificação mesmo com testes reais rodados no pane.

## Fix
`DISPATCH_TEMPLATE` (mission_core.py): cláusula de entrega adicionada ao contrato de dispatch.
A worker agora é obrigada, antes de encerrar, a:
- gravar verify.json NO FORMATO TIPADO do runner /opt/deliver-verify/verify.py;
- dono: campo "mission" EXATAMENTE igual ao missionId do ledger (case idêntico);
- provas tipadas: "cmd": [{"run": "<comando>", "expect_exit": 0}] e "file": [{"path": "..."}];
- NÃO usar "cmds"/"files" nem campo "cmd" dentro das entradas;
- rodar mission_verify (ou o runner com o próprio verify.json) e só parar com verdict pass.

Escopo respeitado: NENHUMA alteração em handlers, watchdog, bus ou engine flags — só o
template em mission_core.py + teste. Zero deploy/restart; or-worker-bridge (:8103) intocado;
pane de engmcp-tools-fix-01 não tocado.

## Provas
- `python3 test_mission_ops.py` → 126/126 OK (125 anteriores + novo
  `test_template_contains_typed_verify_format`, que valida o template renderizado:
  verify.py, mission_verify, verdict pass, campo mission exato, "run"/"expect_exit",
  "file": [{"path"...}, e proibição de "cmds"/"files" e "cmd" interno).
- Render do template conferido ao vivo (dispatch_prompt): cláusula tipada presente,
  sem resíduo de {prompt_file}.

## Nota de condução
Durante a edição do teste houve loop de chamadas com nome de arquivo corrompido
(aspas/vírgula no path); supervisor interveio, o arquivo sempre existiu como
test_mission_ops.py. Retomada em passos únicos, sem perda de contrato.
