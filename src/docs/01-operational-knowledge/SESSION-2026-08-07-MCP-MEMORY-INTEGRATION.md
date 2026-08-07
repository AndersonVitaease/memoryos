# SESSION 2026-08-07 — MCP Memory Integration (Notion MCP + Mem0 Project)

**Data:** 2026-08-07
**Topico:** Integracao de servidores MCP externos para expandir a memoria e capacidades do MemoryOS
**Status:** Notion MCP CONCLUIDO | Mem0 EM PLANO

---

## 1. Resumo Executivo

O MemoryOS agora suporta servidores MCP externos atraves de um conector generico
(`MCPConnector`) que chama a backend function `mcpClientCall`. Cada servidor MCP
externo e registrado na entidade `MCPServerConfig`, que guarda URL, tipo de
autenticacao e cache das ferramentas descobertas.

Nesta sessao:
1. **Notion MCP** foi integrado com sucesso (servidor self-hosted na VPS, exposto via
   Caddy + TLS nip.io, autenticacao por bearer token). Teste `tools/list` retornou
   a API completa do Notion.
2. **Mem0** e o proximo alvo: um servidor MCP de memoria permanente que extrai fatos
   das conversas automaticamente e recupera por relevancia contextual. Plano de
   implantacao nesta sessao.

---

## 2. Integracao Notion MCP (CONCLUIDO)

### 2.1 Arquitetura

```
[MemoryOS Frontend/Chat]
        |
        v
[MCPConnector.ts]  (src/lib/connector-runtime/connectors/)
        |
        v
[mcpClientCall (backend function)]  (base44/functions/mcpClientCall/entry.ts)
        |
        v  (StreamableHTTPClientTransport / SSE fallback, @modelcontextprotocol/client)
        |
[https://2-25-96-245.nip.io/mcp]  (Caddy reverse proxy, TLS automatico via nip.io)
        |
        v
[127.0.0.1:3000]  (Notion MCP server, Node.js, --transport http)
```

### 2.2 Infraestrutura na VPS (srv1882271)

**Servidor Notion MCP:**
- Diretorio: `~/notion-mcp`
- Entry point: `bin/cli.mjs` com flag `--transport http`
- Porta: `3000` (localhost)
- Autenticacao: bearer token fixo
- Processo: background (nohup / systemd / pm2 - verificar persistencia apos reboot)

**Caddy (reverse proxy + TLS):**
- Versao: v2.11.4
- Caddyfile configurado para `2-25-96-245.nip.io` -> `127.0.0.1:3000`
- TLS automatico via Let's Encrypt (nip.io resolve para o IP da VPS)
- Domain: `https://2-25-96-245.nip.io`

### 2.3 Configuracao no MemoryOS

**Secret registrada (Settings -> Secrets):**
- `NOTION_MCP_TOKEN` = `<bearer token do servidor Notion MCP>`

**Registro MCPServerConfig (entidade):**
```
id:         6a75dd415e1f118a7b29164c
name:       notion
server_url: https://2-25-96-245.nip.io/mcp
transport:  json (streamable-http; fallback sse automatico)
auth_type:  api_key
api_key_secret_name: NOTION_MCP_TOKEN
auth_header_name: Authorization (envia como "Bearer <token>")
enabled:    true
```

### 2.4 Validacao

Teste `mcpClientCall` com `action: "list"`:
- Status: 200 OK
- Resultado: lista completa de ferramentas da API do Notion (API-get-user,
  API-create-page, API-query-database, API-search, etc.)
- Latencia: ~1.5s (handshake + tools/list)

### 2.5 Como usar no chat

Frases que ativam o conector MCP generico:
- `"liste as ferramentas do mcp notion"` -> mcp.listTools (serverName=notion)
- `"chame a ferramenta API-search do mcp notion"` -> mcp.callTool

Os Goals `mcp.listTools` e `mcp.callTool` ja estao registrados em
`src/lib/goals/GoalRegistry.ts` e mapeados em
`src/lib/planning-engine-e022/GoalCapabilityRegistry.ts`.

### 2.6 Licoes aprendidas

1. **Path do endpoint importa:** o SDK `@modelcontextprotocol/client` faz POST
   para a `server_url` informada. O Notion MCP serve o JSON-RPC em `/mcp`, nao na
   raiz `/`. Registrar `server_url` sem o path causa "Cannot POST /" (HTML de
   erro 404). Sintoma: erro vem como HTML embutido na mensagem do SDK.

2. **Header Accept obrigatorio:** o servidor exige `Accept: application/json,
   text/event-stream`. O curl de validacao manual falha com 406 se nao enviar
   ambos — o SDK envia automaticamente. Nao usar o 406 do curl como indicador de
   quebra; e so restricao do teste manual.

3. **Token no secret:** o `NOTION_MCP_TOKEN` no painel de secrets do Base44 deve
   ter o valor exato (sem espacos/quebras). Um valor errado devolve
   `{"code":-32002,"message":"Forbidden: Invalid bearer token"}` dentro do JSON
   de erro do SDK. Sintoma de token errado, nao de URL errada.

4. **Bug conhecido do SDK recuperado:** `mcpClientCall` ja tem `tryRecoverResultFromError()`
   para tratar o bug do SDK que lanca erro mesmo quando a resposta JSON-RPC e
   sucesso. Nao precisa de workaround no lado do caller.

---

## 3. Projeto Mem0 (EM PLANO)

### 3.1 Objetivo

Adicionar uma camada de **memoria permanente externa** ao MemoryOS, acessivel via
MCP, que:
- Extrai fatos/preferencias automaticamente das conversas (LLM-driven extraction)
- Armazena em vetor (embeddings) para recuperacao semantica
- E compartilhada entre qualquer cliente MCP (MemoryOS, Claude Desktop, ChatGPT,
  etc.) — eliminando silos de memoria por ferramenta

### 3.2 Por que Mem0 (e nao usar so a memoria interna do MemoryOS)

O MemoryOS ja tem memoria interna (`ChatSession`, `Message`, `KnowledgeEntity`,
`Decision`, `KnowledgeObservation` + Memori Cloud). O ganho do Mem0 e
**portabilidade**: a mesma memoria do projeto fica acessivel por qualquer cliente
MCP, nao so dentro do MemoryOS. Para workflows que envolvem outras ferramentas
(debugando com Claude Desktop, planejando com ChatGPT), isso elimina a
repeticao de contexto manual.

### 3.3 Escolha de implantacao: self-hosted (VPS) vs cloud

**Recomendado: self-hosted na mesma VPS do Notion MCP.**

Motivos:
- Mesmo padrao arquitetural (Caddy + nip.io + bearer token) ja validado
- Controle total dos dados (memoria de projeto e sensivel)
- Sem dependencia de mais um SaaS
- Custo incremental ~0 (ja pagamos a VPS)

Trade-off:
- Mem0 self-hosted precisa de `OPENAI_API_KEY` para extracao de fatos e
  embeddings (nao tem modelo local por default). Considerar Ollama local se quiser
  zero dependencia externa — mas isso e fora do escopo desta sessao.

### 3.4 Plano de implantacao (passos na VPS)

#### 3.4.1 Instalar o servidor Mem0 MCP

Opcao A — via npx (mais simples, nao persiste sozinho apos reboot):
```bash
# Na VPS, como o mesmo usuario do notion-mcp
mkdir ~/mem0-mcp && cd ~/mem0-mcp
# Gerar bearer token
TOKEN_MEM0=$(openssl rand -hex 32)
echo "MEM0 token: $TOKEN_MEM0"

# Mem0 precisa de OPENAI_API_KEY para extracao + embeddings
export OPENAI_API_KEY=<sua-key>

# Iniciar (teste manual primeiro)
npx -y mem0-mcp \
  --transport http \
  --port 3001 \
  --api-key "$TOKEN_MEM0"
```

Opcao B — via Docker (persistente, recomendado para producao):
```bash
# docker-compose.yml em ~/mem0-mcp/
# (ver docs do mem0 para a imagem oficial)
```

#### 3.4.2 Configurar Caddy para o Mem0

Adicionar bloco no Caddyfile (mesmo dominio nip.io, path `/mem0`):
```
2-25-96-245.nip.io {
    # Notion MCP (existente)
    handle /mcp {
        reverse_proxy 127.0.0.1:3000
    }
    # Mem0 MCP (novo)
    handle /mem0 {
        reverse_proxy 127.0.0.1:3001
    }
}
```

Recarregar Caddy: `systemctl reload caddy` (ou `caddy reload --config Caddyfile`).

#### 3.4.3 Registrar no MemoryOS

**Secret:** `MEM0_MCP_TOKEN` = `<token gerado no passo 3.4.1>`

**Registro MCPServerConfig:**
```
name:               mem0
server_url:         https://2-25-96-245.nip.io/mcp
auth_type:          api_key
api_key_secret_name: MEM0_MCP_TOKEN
auth_header_name:   Authorization
enabled:            true
```

#### 3.4.4 Validar

Testar `mcpClientCall` com `serverId` do mem0, `action: "list"`. Deve retornar
as ferramentas do Mem0 (tipicamente `add`, `search`, `get_all`, `delete`).

#### 3.4.5 Integrar no pipeline cognitivo

Mem0 e uma memoria, nao so um conector. Para aproveitar a extracao automatica,
considerar (fase 2, pos-implantacao):
- Hook no `ConversationPipeline` pos-resposta: enviar o par (user, assistant)
  para `mem0.add` — o Mem0 extrai fatos com LLM e guarda so o relevante.
- Hook no `memoryReasoningPlanner` pre-resposta: chamar `mem0.search` com a
  mensagem atual e injetar os fatos recuperados no contexto do planner.
- Isolar por `user_id` / `project_id` nas calls (Mem0 suporta `user_id`,
  `agent_id`, `run_id` como filtros).

### 3.5 Consideracoes

- **Custo OpenAI:** cada turno de conversa enviado ao Mem0 gera uma chamada
  LLM para extracao. Considerar enviar so a cada N mensagens ou so em turnos
  marcados como "grave isto" (sinal `memori.remember` ja existe no GoalRegistry).
- **Persistencia do processo:** se usar `npx` (Opcao A), configurar systemd ou
  pm2 para reiniciar apos reboot. Docker (Opcao B) resolve nativamente.
- **Isolamento:** Mem0 armazena tudo junto por default. Passar `user_id` e
  `agent_id` em toda call para nao vazar memoria entre projetos/usuarios.
- **Portabilidade:** uma vez rodando, qualquer cliente MCP (Claude Desktop,
  ChatGPT com MCP) pode apontar para a mesma URL e ler a mesma memoria.

---

## 4. Arquivos relevantes

- `base44/functions/mcpClientCall/entry.ts` — proxy generico para qualquer MCP server
- `base44/entities/MCPServerConfig.jsonc` — schema do registro de servidores
- `src/lib/connector-runtime/connectors/MCPConnector.ts` — conector que chama mcpClientCall
- `src/lib/goals/GoalRegistry.ts` — Goals `mcp.listTools` / `mcp.callTool`
- `src/lib/planning-engine-e022/GoalCapabilityRegistry.ts` — mapeamento Goal -> capability

## 5. Proximos passos

1. [ ] Usuario instala Mem0 MCP na VPS (passo 3.4.1)
2. [ ] Usuario configura Caddy para `/mem0` (passo 3.4.2)
3. [ ] Usuario seta secret `MEM0_MCP_TOKEN` no painel do Base44
4. [ ] Criar registro MCPServerConfig para mem0 (passo 3.4.3)
5. [ ] Validar `tools/list` contra o Mem0 (passo 3.4.4)
6. [ ] (Fase 2) Integrar extracao/recuperacao automatica no ConversationPipeline

---

## 6. Historico de teste desta sessao

| Tentativa | server_url | Resultado | Causa |
|-----------|------------|-----------|-------|
| 1 | `https://2-25-96-245.nip.io` (sem path) | 502 — "Cannot POST /" | Endpoint raiz nao serve JSON-RPC |
| 2 | `https://2-25-96-245.nip.io/mcp` | 502 — "Forbidden: Invalid bearer token" | Secret `NOTION_MCP_TOKEN` com valor errado |
| 3 | `https://2-25-96-245.nip.io/mcp` (apos corrigir secret) | 200 — tools/list OK | Sucesso |