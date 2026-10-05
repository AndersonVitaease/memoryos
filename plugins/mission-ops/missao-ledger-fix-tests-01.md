MISSION: ledger-fix-tests-01 (30/09, teste do worker qwen3-235b — ordem do operator)

CONTEXTO: o tool engineering.mission.ledger_fix ganhou o campo opcional `status`
(Zod: /opt/memoryos/eng-mcp/src/missionOps.ts:59-64; handler Python:
/root/.hermes/plugins/mission-ops/__init__.py:1490-1523, enum válido:
cancelled/closed/delivered/dispatched/failed/interrupted/recover/working).
O tab_close idempotente está em __init__.py:1771-1777 (tab_not_found -> step ok=true
"aba já fechada — idempotente"). Nenhum dos dois tem teste.

SEU CONTRATO (um passo por vez; NUNCA pida conteúdo de arquivo — leia você):

1. Crie testes novos em /root/.hermes/plugins/mission-ops/test_ledger_fix_status.py:
   - handle_mission_ledger_fix com status válido em ledger SINTÉTICO (crie ledger
     temporário apontando mc para um state dir de teste ou use monkeypatch) ->
     ok=true, changes.status, before.status;
   - status inválido ("FOO") -> ok=false com erro listando os permitidos;
   - sem status -> ok=true, "nada a corrigir" quando ledger consistente;
   - steps do close com tab_not_found -> step ok=true com nota idempotente
     (extraia/mock a função de close se necessário; NÃO rode close real).
2. Rode: cd /root/.hermes/plugins/mission-ops && python3 -m pytest test_ledger_fix_status.py -x -q
   -> deve ficar verde. NÃO modifique produção (__init__.py, missionOps.ts) a menos
   que um teste revele bug real — aí reporte no relatório, não "conserte" sem prova.
3. Escreva RELATORIO-ledger-fix-tests-01.md no cwd: o que testou, saída do pytest
   verbatim, bugs encontrados (se houver).
4. Gere o manifesto de provas em verify-ledger-fix-tests-01.json no FORMATO do runner
   (/opt/deliver-verify/verify.py): campo "mission": "ledger-fix-tests-01", "cmd": [
   {"run": "cd /root/.hermes/plugins/mission-ops && python3 -m pytest test_ledger_fix_status.py -q", "expect_exit": 0, "timeout": 120000} ],
   "file": [{"path": ".../RELATORIO-ledger-fix-tests-01.md", "min_bytes": 800}].
   IMPORTANTE: provas reais — NUNCA use "true", "|| true", porta errada ou cheque
   que sempre passa. Isso é fraude e o supervisor rejeita.
5. Rode o runner: python3 /opt/deliver-verify/verify.py --mission ledger-fix-tests-01
   --manifest /root/.hermes/plugins/mission-ops/verify-ledger-fix-tests-01.json
   -> veredicto pass. Aí PARE e escreva no pane: "verify.json pass — aguardando close".

Escopo: somente o plugin mission-ops (testes + relatório + manifesto). Sem deploy,
sem systemd, sem eng-mcp container, sem troca de modelo.
