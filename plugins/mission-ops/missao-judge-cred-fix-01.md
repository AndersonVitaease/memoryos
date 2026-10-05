# JUDGE-CRED-FIX-01 — CORRIGIR CREDENCIAL MORTA DO JUDGE.TS (ENG-MCP)

## Problema (flagrado 29/09 ~16:56)
A credencial openrouter-judge (container eng-mcp: /data/credentials/openrouter-judge)
responde 401 em /alpha/decisions E em /api/v1/key = INVÁLIDA/rotacionada.
Consequência: o gate de close (judge.ts → /alpha/decisions) falha silenciosamente.
O fallback equivalente já existe no or-worker-bridge (/v1/judge faz fallback para a
chave da ponte) — PROVADO hoje (veredicto supported 79%, custo $0.0000157).

## Contrato

### 1. Diagnóstico honesto primeiro
- Confirmar dentro do container que a credencial está 401 (curl /api/v1/key com a
  chave lida do arquivo — NUNCA imprimir a chave, só status).
- Verificar onde a credencial pode ser ROTACIONADA (quem a gerou: procurar referências
  em /opt/memoryos/eng-mcp (deploy, secrets, engmcp) e no histórico do release data).

### 2. Fix mínimo (escolha pela evidência, nesta ordem)
- (a) Se existir forma determinística de rotacionar a credencial do container
  (secret write, arquivo, env) → rotacione e prove 200 no /alpha/decisions;
- (b) Se não → fallback no judge.ts: ler ENG_MCP_JUDGE_KEY_FILE; em 401, retry com
  a chave da ponte (mesma da rota /v1/judge do bridge — ver proxy.mjs /v1/judge,
  bloco TRINDADE-HERDR-01) + audit "judge-key 401, fallback bridge-key".
  Padrão do judge.ts: não vazar credencial em log (sanitização já existe).

### 3. Prova
- Chamada real ao /alpha/decisions (via judge.ts OU curl equivalente) → veredicto
  JSON com answers (status 200).
- Relatório RELATORIO-judge-cred-fix-01.md + verify.json (comandos + expect_exit)
  em /opt/memoryos/eng-mcp/.

## Não destruir
- judge.ts só na função de credencial/fetch — NADA de contrato, rubric, veredictos.
- Se tocar em src/: rodar npm test do eng-mcp e reportar o número (deve continuar
  na faixa 1590+). NÃO fazer deploy (o container roda imagem congelada; a correção
  vale para o PRÓXIMO deploy — registre isso no relatório).

## Protocolo de condução (obrigatório)
- TRIAGEM: dúvida de ESCOPO/arquitetura → tool ask_advisor; verificação determinística
  (fato no disco/estado) → tool ask_judge; ficou travado/terminou um passo/sem contexto →
  tool ask_supervisor (ele decide o próximo passo — NÃO pare "done" sem pousar entregáveis);
  consequência externa/credencial → pare e espere o operator.
- PARALELISMO: ações independentes = todas as tool calls numa única resposta.
- Trabalho = tool calls executados + entregáveis pousados. Narrar plano NÃO é trabalho.