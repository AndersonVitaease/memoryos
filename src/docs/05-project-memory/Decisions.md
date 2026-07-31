# Decisions

**Status:** Vivo
**Tipo:** Memória do Projeto

---

> Registros de decisões recentes. Decisões permanentes devem ser promovidas a ADR.

## Sessão 2026-07-30 — Performance, limpeza de código morto, multi-provider de IA, MCP, documentos

**Duração:** sessão de um dia inteiro, uso extensivo de acesso real ao repositório (`Base44:run_command` — Node, npm, git, esbuild, vite build).

> **Para uma nova sessão de Claude lendo isto:** cada item abaixo tem o commit/arquivo relevante. Se precisar de detalhe além do resumo, use `git log --oneline --all | grep <termo>` ou leia o ADR referenciado.

### 1. Performance — reduções medidas em produção

| Componente | Antes | Depois | Como |
|---|---|---|---|
| Busca web | 26.000-43.000ms | 1.500-2.900ms | Substituição de `InvokeLLM+grounding` por Serper API. Ver **ADR-010**. |
| `SearchEngine` esperando provider lento | Sim (`Promise.all`) | Não (resolve no primeiro provider bom) | `SearchEngine.ts` |
| Interpretação de intenção de memória | Sempre via LLM | Atalho por regex pra perguntas simples ("quais são minhas tarefas") | `memoryPipeline.js` → `quickIntentGuess()` |
| Checagem semântica de busca | Sem timeout, rodava sempre que sem palavra-chave | Timeout 8s + só roda se memória insuficiente | `capabilityDetector.js` |
| Resposta final do chat (ETAPA 6) | Só `InvokeLLM` (~2-3s) | OpenRouter primeiro (~600-900ms), fallback Base44 | Ver **ADR-011**. |
| Desvio de serviço de IA (tradução/resumo/etc) | No fim do pipeline, depois de gastar tempo com memória/capacidades | Movido pro início (ETAPA 0) | `memoryReasoningPlanner.js` |

**Achado não resolvido:** bloco fixo de instruções de sistema (~16KB, regras anti-confabulação) é reenviado em toda mensagem — maior fatia do prompt final (34-42k chars totais). Cache de prompt resolveria, mas não é exposto pela API gerenciada do Base44 (`InvokeLLM`). Migrar pra provider com cache nativo (Anthropic/OpenAI via OpenRouter) é o próximo passo lógico, não implementado.

### 2. Limpeza de código morto — números finais

- **103 pastas de `src/lib`** removidas (183 → 91 restantes), confirmadas via análise de alcançabilidade real (forward reachability a partir das páginas reais, não regex ingênuo).
- **121+ páginas de `src/pages`** removidas (269 → ~148), todas com import quebrado confirmado via `esbuild` real (não regex).
- **Lição de metodologia importante:** análise por regex teve falso positivo e falso negativo reais ao longo do dia (import relativo não capturado; texto de string literal confundido com import de código; quase apagou `Connections.jsx` — página real — por engano). **Qualquer limpeza futura deve partir de `esbuild`/`vite build` reais, nunca de busca textual isolada.**
- **Regressão causada e corrigida:** `Phase570Page.jsx` (renomeada `ConnectorAuthCenter.jsx`) foi apagada por engano — tinha função real (autenticação GitHub via PAT, diagnóstico Base44), só não tinha nenhum `import` apontando pra ela (só era alcançada por URL direta, um ponto cego da análise de alcançabilidade que só rastreia imports, não links de React Router). Restaurada e agora linkada de verdade a partir de `Connections.jsx`.

### 3. Registro de Providers de IA — ver ADR-011

`src/lib/ai-provider-registry/` — extensível, mesmo padrão do `ConnectorRegistry`. Hoje só `text-generation` (Base44 + OpenRouter). Visão computacional e transcrição dedicada seguiriam o mesmo molde, não implementadas.

### 4. Cliente MCP genérico + Google Workspace MCP

- `base44/functions/mcpClientCall/entry.ts` — proxy genérico pra qualquer servidor MCP, usando SDK oficial (`@modelcontextprotocol/client`), Streamable HTTP + fallback SSE.
- Testado com sucesso contra o **servidor MCP oficial do Google (Gmail)**, reaproveitando o token OAuth já usado pelos conectores nativos (sem novo consentimento do usuário) — prova de conceito completa: `tools/list` retornou 13 ferramentas reais.
- **Bug de terceiros contornado:** o SDK oficial as vezes lança erro mesmo em resposta de sucesso (issues conhecidas #804/#340 do repo oficial `modelcontextprotocol/typescript-sdk`) — `mcpClientCall` tem lógica de recuperação (`tryRecoverResultFromError`) que extrai o resultado real de dentro da mensagem de erro quando isso acontece.
- **Execução real de ferramenta (`tools/call`, ex: `list_labels`) ainda falha** com erro de credencial inválida do lado do Google — hipótese não confirmada: possivelmente exige registro formal do cliente OAuth no programa de Developer Preview do Google. Não resolvido.
- **MemoryOS como cliente MCP:** funcional (esta sessão). **MemoryOS como servidor MCP** (outros sistemas se conectando nele): nunca implementado, só desenhado.

### 5. Document Processing — parsers DOCX/XLSX

- `base44/functions/documentParser/entry.ts` (mammoth pra DOCX, xlsx/SheetJS pra Excel) + `DocxDocumentParser.ts`/`XlsxDocumentParser.ts`, plugados no `ParserRegistry` já existente (preenchendo gap documentado como "planejado, Sprint M2.x, nunca implementado").
- **Bug pré-existente corrigido:** o upload de anexo no chat (`knowledgeIngestionPipeline.js`) já anunciava aceitar `.docx`/`.xlsx` na interface, mas sempre falhava (`Core.ExtractDataFromUploadedFile` do Base44 não suporta esses formatos) — corrigido redirecionando pra `documentParser`.
- **Nova capacidade:** "mostrar conteúdo completo do documento" — antes o contexto de memória cortava em 500-800 caracteres (deliberado, pra não inflar o prompt). Agora, quando o pedido é explicitamente por conteúdo integral (detectado por padrão, testado com 11 casos), o texto completo salvo é retornado direto, sem passar pela LLM. `FullDocumentContentDetector.js`.

### 6. Bug de roteamento corrigido

`CalendarSemanticProvider.ts` dava peso alto demais (0.45, acima do limiar de disparo 0.20) pra palavras genéricas de tempo sozinhas ("hoje", "semana") — sequestrava mensagens sem relação com calendário. Peso reduzido pra 0.15 (abaixo do limiar sozinho, ainda dispara combinado com sinal real de evento/agenda).

### 7. Metodologia — lições para sessões futuras

1. **Commit ≠ Publish.** Toda mudança feita via `Base44:run_command` é auto-commitada, mas só vale no app real depois que o usuário clica em "Publicar" no editor Base44.
2. **`vite build` real > regex** para qualquer análise de "isso é usado?" ou "isso está quebrado?".
3. **Reachability por import ≠ reachability por rota.** Uma página pode ter uma `<Route>` real e nenhum `import` apontando pra ela (só navegação via link/URL) — análise de import sozinha vai marcar como "morta" incorretamente.
4. **Sandbox do `run_command` é efêmero** — pode reiniciar entre chamadas (scripts em `/tmp` podem sumir). Preferir salvar scripts de verificação reutilizáveis em local que sobrevive, ou aceitar recriar quando necessário.

### 8. Pendências conhecidas, não resolvidas

- Cache de prompt (bloco fixo de 16KB) — ver seção 1.
- `tools/call` no MCP do Google Workspace — ver seção 4.
- Auditoria do Planning Engine (suspeita de duplicação `planning-engine` vs `planning-engine-e022`, não investigada a fundo).
- Tier 4 do mapeamento de código morto (97 pastas não classificadas na primeira passada, pode haver mais dívida técnica não descoberta).


## Sessao 2026-07-31 -- Conectores nativos: Microsoft Graph + Travellink (base)

### Microsoft Graph (Outlook Mail, Calendar, OneDrive)
Conector nativo completo (nao MCP) -- 8 arquivos: entity + 3 functions de OAuth
(init/exchange/refresh) + MicrosoftAuthSession.js (espelha GoogleAuthSession.js)
+ pagina de callback + MicrosoftGraphConnector.ts (8 capacidades: mail.list,
mail.search, mail.read, mail.send, calendar.list, calendar.create, files.list,
files.download). Build validado, registrado no ConnectorBootstrap.
**Pendente:** usuario precisa criar App Registration no Azure Portal
(MICROSOFT_CLIENT_ID) para o fluxo OAuth funcionar de ponta a ponta.

### Travellink Web API (Aereo) -- base construida, aguardando credenciais
Function generica travellinkCall -- cuida da parte dificil uma vez so
(criptografia RSA-PKCS1 do Developer Access Code + Base64, testada
isoladamente e confirmada) para qualquer servico da API (Disponibilidade,
Tarifar, Reservar, etc. viriam depois, reaproveitando essa mesma function).
**Achado tecnico real:** RSA_PKCS1_PADDING funciona para encrypt (nosso
lado), mas Node/Deno recentes bloqueiam decrypt com esse padding por
seguranca (CVE-2023-46809) -- irrelevante pro nosso caso, decrypt e
trabalho da Travellink, nao nosso.
**Pendente:** aguardando 3 credenciais do usuario (Developer Token,
Developer Access Code, chave publica RSA) + estrutura exata do endpoint
Disponibilidade (paths/campos ainda nao confirmados).
