# CLAUDE-DIET-01 — CLAUDE.md DO /opt/memoryos SOB DIETA (241,8k chars > limite 150k)

Problema provado 29/09: o eng-mcp carrega /opt/memoryos/CLAUDE.md em TODA sessão de worker nesse cwd — com 241,8k chars (>150k do claude) e, com o histórico da sessão, estoura "Request too large (max 32MB)" e mata a missão (engmcp-mission-01 morreu assim).

## Entregáveis
1. Medir: tamanho atual, estrutura (headers/h2), datas das seções (git log/mtimes de referência), o que referencia GPU era.
2. Dieta determinística e REVERSÍVEL (backup primeiro — regra do operator: nunca destruir o que funciona sem caminho de volta):
   - cp CLAUDE.md CLAUDE.md.bak-241k-20260929 (full backup);
   - Nova CLAUDE.md só com o que é VIVO e ATUAL (diretrizes vigentes; regime 100% OpenRouter explícito; NADA de instruções da era GPU/vast).
   - Conteúdo morto (GPU era, missões encerradas, artefatos extintos) vai para docs/CLAUDE-archive-20260929.md (preservado, referenciado por link).
3. Alvo: < 100k chars (margem sob o limite 150k). Se não der sem perder diretriz viva, parar em < 140k e reportar o que impediu.
4. Prova: nova sessão claude no cwd /opt/memoryos/eng-mcp NÃO mostra o warning "over the 150k limit" (plantar 1 sessão rápida de teste e capturar a tela — o warning some).
5. Relatório RELATORIO-claude-diet-01.md: tamanho antes/depois, o que foi arquivado (seções), como reverter (1 cp).
6. verify.json com cmd (tamanhos, backup existe, warning sumiu).

## Guardas
- ZERO perda de diretriz VIVA: qualquer dúvida sobre se algo ainda vale → mantém.
- Zero push/merge; zero GPU/vast/systemd/gateway; judge/8103 intocados.
- O arquivo é lido por TODAS as sessões claude no cwd — mudança de comportamento global: reversibilidade é obrigatória e vai no relatório.
## Protocolo de condução (obrigatório)
- Seu cwd é leve de propósito (/root/.hermes/plugins/mission-ops): opere em /opt/memoryos/CLAUDE.md por caminho ABSOLUTO (Read/Bash com path completo); NÃO deixe o claude carregar o CLAUDE.md gigante na sua sessão.
- SE uma resposta vier vazia ou "Invalid tool parameters": REPITA a mesma ação com um tool_use simples de Bash (cat, wc -c, cp). Retry é a política; narrar não é.
- Trabalho = arquivos pousados + medições rodadas.
