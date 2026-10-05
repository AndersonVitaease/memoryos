MISSION: ledger-fix-tests-02 (30/09, ordem operator — TDD, escopo plugin mission-ops)

CONTEXTO: eng-mcp expõe engineering.mission.ledger_fix (Zod em
/opt/memoryos/eng-mcp/src/missionOps.ts:59-64 e :172) que chama
callHandler("handle_mission_ledger_fix", ...) no plugin Python
/root/.hermes/plugins/mission-ops. Esse handler NÃO existe no plugin
(perdido em reescrita interrompida de 29/09; nunca foi commitado). A tool
eng-mcp hoje aponta para um handler fantasma.

SEU CONTRATO (TDD: vermelho antes do verde; um passo por vez; NUNCA peça
conteúdo de arquivo — leia você):

1. Backup ANTES de tocar produção: `cp __init__.py __init__.py.bak-pre-ledgerfix02`
   e confirme o tamanho do backup (>100KB; se não, ABORTE e reporte).
2. Escreva PRIMEIRO os testes em test_ledger_fix_status.py (importando o
   pacote via importlib spec_from_file_location, como fazem os testes
   existentes): status válido em ledger sintético -> ok=true com
   changes.status/before.status; status inválido "FOO" -> ok=false listando
   os 8 permitidos (cancelled/closed/delivered/dispatched/failed/
   interrupted/recover/working); sem status em ledger consistente ->
   ok=true "nada a corrigir"; status inválido é REJEITADO por enum, nunca
   escrito. Rode e veja os testes FALHAREM (vermelho) — registre a saída.
3. Implemente handle_mission_ledger_fix em __init__.py: valida missionId,
   carrega o ledger do state dir, aplica status/paneId/tabId (só campos
   presentes), rejeita status fora do enum, grava updatedAt, registra
   evento ledger_fix com before/after, retorna {ok, changes, before,
   after}. NÃO toque em mais nada no arquivo (missão anterior destruiu o
   módulo com um Write truncado — edite por inserção pontual, confira com
   `python3 -c "import ..."` e NUNCA reescreva o arquivo inteiro).
4. Rode a suíte: `./venv/bin/python -m unittest test_ledger_fix_status
   test_mission_ops -q` -> tudo verde (nenhum teste antigo quebrado).
5. Escreva RELATORIO-ledger-fix-tests-02.md: saídas verbatim do vermelho e
   do verde, decisões, riscos.
6. Manifesto tipado verify-ledger-fix-tests-02.json (formato do runner
   /opt/deliver-verify/verify.py): "mission": "ledger-fix-tests-02",
   cmd: [{"run": "cd /root/.hermes/plugins/mission-ops && ./venv/bin/python -m unittest test_ledger_fix_status -q", "expect_exit": 0}], file: [{"path": "/root/.hermes/plugins/mission-ops/RELATORIO-ledger-fix-tests-02.md", "min_bytes": 800}].
   Provas REAIS — "true"/"|| true"/cheque que sempre passa = fraude e o
   supervisor rejeita.
7. Rode o runner: python3 /opt/deliver-verify/verify.py --mission
   ledger-fix-tests-02 --manifest /root/.hermes/plugins/mission-ops/verify-ledger-fix-tests-02.json
   -> pass. Aí PARE e escreva: "verify.json pass — aguardando close".

REGRAS: escopo SOMENTE o plugin (test_ledger_fix_status.py, __init__.py
com backup prévio, relatório, manifesto). Sem deploy/systemd/container.
Sem git commit (o supervisor fecha). Erro de digitação em arquivo
produção = restaurar do .bak e tentar de novo.
