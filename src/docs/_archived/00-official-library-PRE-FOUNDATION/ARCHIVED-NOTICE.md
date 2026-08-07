# ⚠️ ARQUIVADO — Não é mais a fonte canônica

**Esta pasta foi movida de `src/docs/00-official-library/` para `src/docs/_archived/00-official-library-PRE-FOUNDATION/` em 2026-08-07.**

## Por quê

Esta era a árvore de documentação oficial do MemoryOS entre **2026-07-05 e 2026-08-03**. Em **2026-07-11**, o projeto declarou formalmente a transição para uma nova fase ("Engineering First") e uma nova árvore canônica em `src/docs/foundation/` — ver `src/docs/foundation/TRANSITION-DECLARATION.md` e `src/docs/foundation/CANONICAL-SOURCE.md`, ambos datados dessa mesma data.

A árvore antiga nunca foi removida do repositório, apenas parou de ser atualizada (último commit real: 2026-08-03). As duas conviveram por quase um mês, criando risco real de uma sessão futura (IA ou humana) ler a especificação errada.

## Verificação de segurança feita antes de arquivar (2026-08-07)

Antes de mover, foi confirmado que **nenhum código vivo lê estes arquivos em runtime**:

- `src/lib/knowledge-reconstruction/sources/OfficialLibrarySource.ts` referencia o caminho só em comentário — o `load()` real retorna um catálogo estático hardcoded, não lê arquivos do disco.
- O mecanismo que leria de verdade (`ViteDocumentDiscovery.ts`, descrito em `src/pages/OfficialLibraryFlowPage.jsx`) **não existe** no repositório — é uma página explicativa de um design, não implementação real.
- O caminho realmente conectado em produção é `src/lib/officialLibraryManager.js`, que usa `EMBEDDED_DOCS` — 5 documentos embutidos como strings JS nativas no próprio arquivo, não lidos de `00-official-library/`. Confirmado por auditoria anterior do próprio projeto (`SprintEF403Page.jsx`, `SprintEF404Page.jsx`).

## O que fazer se você chegou aqui

- **Procurando a especificação atual?** Vá para `src/docs/foundation/`.
- **Precisa de contexto histórico** (por que uma decisão foi tomada em julho/2026, antes da consolidação)? Os arquivos aqui continuam válidos como registro histórico — só não são mais atualizados nem são a referência ativa.

*Arquivado por Claude, sessão 2026-08-07, a pedido do usuário, após auditoria de consistência arquitetural.*
