# BUS-DELIVERY-GUARD-01 — CANAL DE ENTREGA DE EVENTOS COM GUARD ANTI-RESSURREIÇÃO

## Problema (decisão operator 28/09)
O event bus entregava eventos em sessões JÁ ENCERRADAS — a mensagem ressuscitava a sessão,
gerando 2+ sessões ativas simultâneas, latência e erros no chat. A entrega em sessão foi
desligada. O guard do event_bus permanece; o journal do plantão é a superfície atual.

## Autorização (29/09, operator: "sim")
Reativar a entrega em sessão COM o guard de 3 regras abaixo. Rollback trivial: desligar
a entrega de novo (backup de tudo antes).

## Contrato — 3 regras (implementar exatamente isso)
1. LEASE DE SESSÃO (TTL ~30s): subscriber registrado com lease renovado a cada atividade
   da sessão; lease expirado = subscriber removido, SEM entrega.
2. NUNCA RESSUSCITAR: entrega só injeta em sessão JÁ EM EXECUÇÃO no runtime (checar
   registro de sessões ativas antes de injetar). O bus NUNCA cria/restaura/relança sessão.
3. FALLBACK = JOURNAL: evento para sessão sem lease vivo grava no journal do plantão
   (superfície existente); nada se perde, nada acorda morto.

## Onde trabalhar
- Código do bus/delivery: localize em /root/.hermes/plugins/mission-ops/ (guard existente)
  e no gateway Hermes (/root/.hermes/ — código de sessão/eventos). NÃO toque em
  /opt/gpu-bridge, /opt/gpu-watchdog, /opt/mission-supervisor (artefatos congelados),
  NEM em /opt/memoryos/eng-mcp (produção de hoje — fora do escopo).
- Seu cwd é leve de propósito: opere por caminho absoluto.

## Aceite (E2E obrigatório)
- Teste 1: sessão VIVA registrada → evento entregue (injeção confirmada).
- Teste 2: sessão MORTA (sem lease) → evento NÃO entregue + NÃO ressuscitada +
  gravada no journal.
- Teste 3: lease expira (TTL) → mesmo comportamento do teste 2.
- Suíte existente do plugin verde (não quebrar nada — pytest /root/.hermes/plugins/mission-ops/test_mission_ops.py).

## Entregáveis
- RELATORIO-bus-delivery-guard-01.md + verify.json (com cmd executáveis) no diretório
  da missão; alterações com backup *.bak-20260929; trilha em comentários.

## Protocolo de condução
- PARALELISMO: sempre que as próximas ações forem independentes (ler vários arquivos, varios greps, varios comandos), emita TODAS as tool calls numa ÚNICA resposta — o runtime executa em paralelo. Uma chamada por vez só quando houver dependência.
- TRIAGEM: dúvida de ESCOPO/arquitetura → tool ask_advisor; verificação determinística (fato no disco/estado) → tool ask_judge; ficou travado/terminou um passo/sem contexto → tool ask_supervisor (ele decide o próximo passo — NÃO pare "done" sem pousar entregáveis); consequência externa/credencial → pare e espere o operator.
- Resposta vazia / Invalid tool parameters = REPITA a ação (retry é política).
- Trabalho = testes rodando verde + arquivos pousados. Narrar plano não é trabalho.
- Pare esperando operator SOMENTE para consequência externa (ex.: restart do gateway
  se necessário para ativar — autorizado desde que com backup e rollback documentado).