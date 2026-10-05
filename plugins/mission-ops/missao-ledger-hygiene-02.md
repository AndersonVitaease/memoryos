# LEDGER-HYGIENE-02 — LIMPEZA DE FANTASMAS/ZUMBIS (regime OpenRouter; artefatos GPU intocados)

Contexto 29/09: dia gerou resíduos de despachos abortados/degenerados. A tool nova engineering.mission.status (eng-mcp v137) já classifica FANTASMA e auto-cancela; esta missão usa ela e fecha o que resta, COM EXCEÇÕES.

## Entregáveis
1. Rodar `engineering.mission.status` sem argumento (todas as ativas) e registrar o diagnóstico completo no relatório.
2. Fechar (mission_close acceptUnverified com motivo) os FANTASMAS confirmados: ledgers dispatching/failed/interrupted com pane morto SEM trabalho. Conhecidos: zumbis de sessões degeneradas de hoje.
3. ZUMBIS DE ABA: aba aberta com label MISSION:<id> de missão já closed (ex.: w6:tG do despacho degenerado das 12:36) → fechar a aba (herdr tab close) e registrar.
4. **EXCEÇÕES INEGOCIÁVEIS (não fechar, não tocar)**:
   - volume-cache-awq-01 (artefato GPU — AS-IS por ordem do operator 29/09);
   - watchdog02-detectores-02 e qualquer missão-*wd*/gpu* fechada (histórico);
   - missões ACTIVE com pane vivo (nunca fechar as que estão working).
5. Relatório RELATORIO-ledger-hygiene-02.md no cwd: tabela {id, status antes, verdict do snapshot, ação, resultado} + contagem de abas/ledgers antes/depois.
6. verify.json com cmd executáveis (contagens antes/depois, checagem de que as exceções seguem intocadas).

## Guardas
- Zero LLM no trabalho de limpeza (tudo via tools determinísticas); se um caso for AMBÍGUO (pane em estado desconhecido), NÃO mexer — listar no relatório para decisão do supervisor.
- Zero mutação fora de /root/.hermes/mission-state + abas herdr.
- Zero GPU/vast/systemd/gateway restart; judge JEV intocado; or-worker-bridge 8103 produção.
- Prova do trabalho: relatório com diffs de contagem + verify verde.
## Protocolo de condução (obrigatório)
- TRIAGEM: dúvida de ESCOPO/arquitetura → tool ask_advisor; verificação determinística (fato no disco/estado) → tool ask_judge; consequência externa/credencial → pare e espere o operator. Não decida sozinho o que tem dono.
- PARALELISMO: sempre que as próximas ações forem independentes (ler vários arquivos, varios greps, varios comandos), emita TODAS as tool calls numa ÚNICA resposta — o runtime executa em paralelo. Uma chamada por vez só quando houver dependência.
- Seu cwd é leve de propósito: opere em /root/.hermes/mission-state e abas herdr por caminho absoluto; NÃO leia /opt/memoryos/CLAUDE.md.
- A tool correta para o snapshot é o wrapper do disco: `cd /opt/memoryos/eng-mcp && node --import tsx -e "import {runMissionStatus} from './src/missionOps.ts'; console.log(JSON.stringify(await runMissionStatus({all:true})))"` — via tool Bash.
- SE uma resposta vier vazia ou "Invalid tool parameters": NÃOnarre, NÃO desista — REPITA a mesma ação com um tool_use simples de Bash. Falha de modelo é transiente; retry é a política.
- Trabalho = tool calls executados (arquivos pousados, comandos rodados). Narrar plano NÃO é trabalho.
