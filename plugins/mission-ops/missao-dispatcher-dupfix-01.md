# DISPATCHER-DUPFIX-01 — FECHAR ABA ÓRFÃ NO DESPACHO (FIM DAS DUPLICATAS)

## Problema (flagrado 4x hoje)
runMissionDispatch chama closeDuplicateTabs(missionId), mas abas órfãs continuam
abrindo quando o ledger anterior está cancelled/start_timeout/done: o casamento
não pega esses status e/ou não mapeia tab↔pane corretamente. O operator ficou
apontando "existe missão duplicada" a cada ciclo.

## Contrato
1. Ler closeDuplicateTabs em /opt/memoryos/eng-mcp/src/missionOps.ts + o helper
   de tab list/close (linhas ~60-80): entender POR QUE não fecha (status do ledger?
   match por label? pane_id?).
2. Fix determinístico: ao despachar missão X, fechar TODA aba com label contendo
   "MISSION:<X>" cujo pane_id NÃO seja o pane recém-criado — independente do
   status do ledger (a aba antiga é órfã por definição quando a missão é
   re-despachada). Manter o registro no retorno (zombiesClosed).
3. Teste: unit test em /opt/memoryos/eng-mcp/src/ (padrão dos 4 testes existentes)
   cobrindo: ledger cancelled, done e start_timeout.
4. Prova: npm test PASS (número atual + novos) + RELATORIO-dispatcher-dupfix-01.md
   + verify.json (comandos + expect_exit) em /opt/memoryos/eng-mcp/.

## Não destruir
- NÃO mexer em judge.ts (missão paralela judge-cred-fix-01 está lá).
- NÃO fazer deploy (container congelado; vale para próximo release — registre).
- Se tocar em src/: npm test obrigatório e número reportado.

## Protocolo de condução (obrigatório)
- TRIAGEM: escopo/arquitetura → ask_advisor; verificação determinística → ask_judge;
  travado/fim de passo → ask_supervisor; consequência externa → operator.
- PARALELISMO: ações independentes = tool calls na mesma resposta.
- Trabalho = entregáveis pousados. Narrar plano NÃO é trabalho.