# SESSION 2026-08-03 — Migracao do Chat de Projeto para a CXP v2 (Implementacao Detalhada)

> **Status:** APROVADO — documento de implementacao linha-a-linha. Nenhum codigo alterado ainda.
> **Data:** 2026-08-03 (America/Sao_Paulo, 17:24 BRT)
> **Escopo:** Migrar a aba de chat de `ProjectDetail.jsx` da pipeline antiga (`ChatInterface` + `conversationEngine` + `contextRetrieval`) para a CXP v2 (`ChatPage` + `useConversation`), adicionando escopo de projeto na CXP, sem quebrar o chat global nem perder dados.

**Plano de origem:** `src/docs/01-operational-knowledge/SESSION-2026-08-03-CHAT-LEGACY-CLEANUP-AUDIT.md` (secao 4).
**Aprovado em:** 2026-08-03 17:24 BRT.

---

## 0. Estado Atual (snapshot — assinaturas vivas ANTES da migracao)

### 0.1 `src/lib/conversation-platform/ConversationPersistence.ts`

```typescript
const LAST_SESSION_KEY = "memoryos_last_session_id";

export function saveLastSessionId(sessionId: string): void {
  try { localStorage.setItem(LAST_SESSION_KEY, sessionId); } catch {}
}
export function getLastSessionId(): string | null {
  try { return localStorage.getItem(LAST_SESSION_KEY); } catch { return null; }
}

export async function loadActiveSession(): Promise<ConversationSession | null> {
  const sessions = await base44.entities.ChatSession.filter(
    { status: "active" }, "-last_message_at", 1
  );
  return sessions.length > 0 ? (sessions[0] as ConversationSession) : null;
}

export async function createSession(title = "Nova conversa"): Promise<ConversationSession> {
  const session = await base44.entities.ChatSession.create({
    title, status: "active", message_count: 0,
  });
  return session as ConversationSession;
}

export async function getOrCreateActiveSession(): Promise<ConversationSession> {
  const lastId = getLastSessionId();
  if (lastId) {
    try {
      const session = await base44.entities.ChatSession.get(lastId) as ConversationSession;
      if (session && session.status === "active") return session;
    } catch {}
  }
  const sessions = await base44.entities.ChatSession.filter(
    { status: "active" }, "-last_message_at", 10
  );
  const withMessages = (sessions as ConversationSession[]).filter(
    (s) => s.message_count && s.message_count > 0 && s.last_message_at
  );
  if (withMessages.length > 0) {
    saveLastSessionId(withMessages[0].id);
    return withMessages[0];
  }
  if (sessions.length > 0) {
    saveLastSessionId((sessions[0] as ConversationSession).id);
    return sessions[0] as ConversationSession;
  }
  const newSession = await createSession();
  saveLastSessionId(newSession.id);
  return newSession;
}
```

### 0.2 `src/lib/conversation-platform/ConversationSessionManager.ts`

```typescript
async initializeSession(): Promise<ConversationSession> {
  // ... restaura ou chama getOrCreateActiveSession() (sem param)
  const session = await getOrCreateActiveSession();
  // ...
}
async createNewSession(title?: string): Promise<ConversationSession> {
  const session = await createSession(title);
  saveLastSessionId(session.id);
  // ...
}
```

### 0.3 `src/lib/conversation-platform/ConversationManager.ts`

```typescript
async initialize(): Promise<void> {
  if (conversationStore.state.isInitialized) return;
  await sessionManager.initializeSession();
}
async newSession(title?: string) {
  return sessionManager.createNewSession(title);
}
```

### 0.4 `src/lib/conversation-platform/useConversation.js`

```javascript
export function useConversation() {
  // ...
  useEffect(() => {
    conversationManager.initialize().catch(console.error);
  }, []);
  // ...
  newSession: (title) => conversationManager.newSession(title),
}
```

### 0.5 `src/pages/ChatPage.jsx`

```jsx
export default function ChatPage() {
  const conversation = useConversation();
  // ... (nao recebe props hoje)
}
```

### 0.6 `src/pages/ProjectDetail.jsx` (pontos relevantes)

```jsx
// Linha 11
import ChatInterface from "@/components/chat/ChatInterface";
// ...
// Linhas 124-126
<TabsContent value="chat" className="flex-1 overflow-hidden m-0">
  <ChatInterface projectId={id} projectName={project.name} />
</TabsContent>
```

### 0.7 Risco conhecido do snapshot

O filtro global atual `{ status: "active" }` retorna TODAS as sessoes ativas, inclusive as que tem `project_id` (criadas pelo `ChatInterface` legado). Hoje o chat global pode "roubar" uma sessao de projeto. A migracao precisa isolar bidirecionalmente (Fase 1).

---

## Fase 0 — Adicionar escopo de projeto na CXP (aditivo, backward compatible)

**Principio:** todo parametro `projectId` e OPCIONAL. Sem `projectId` => comportamento atual (global). Com `projectId` => escopo de projeto. Zero impacto no chat global existente.

### 0.F0.1 — `ConversationPersistence.ts`

**1. Chaves de localStorage por escopo:**

Substituir:
```typescript
const LAST_SESSION_KEY = "memoryos_last_session_id";

export function saveLastSessionId(sessionId: string): void {
  try { localStorage.setItem(LAST_SESSION_KEY, sessionId); } catch {}
}
export function getLastSessionId(): string | null {
  try { return localStorage.getItem(LAST_SESSION_KEY); } catch { return null; }
}
```
Por:
```typescript
const LAST_SESSION_KEY_GLOBAL = "memoryos_last_session_id";

function lastSessionKey(projectId?: string): string {
  return projectId
    ? `memoryos_last_session_id__proj_${projectId}`
    : LAST_SESSION_KEY_GLOBAL;
}

export function saveLastSessionId(sessionId: string, projectId?: string): void {
  try { localStorage.setItem(lastSessionKey(projectId), sessionId); } catch {}
}
export function getLastSessionId(projectId?: string): string | null {
  try { return localStorage.getItem(lastSessionKey(projectId)); } catch { return null; }
}
```

**2. `loadActiveSession` com filtro por escopo:**

Substituir:
```typescript
export async function loadActiveSession(): Promise<ConversationSession | null> {
  const sessions = await base44.entities.ChatSession.filter(
    { status: "active" }, "-last_message_at", 1
  );
  return sessions.length > 0 ? (sessions[0] as ConversationSession) : null;
}
```
Por:
```typescript
export async function loadActiveSession(projectId?: string): Promise<ConversationSession | null> {
  // Escopo global exclui sessoes de projeto (project_id nulo/ausente).
  // Escopo de projeto filtra exatamente pelo project_id.
  const filter = projectId
    ? { project_id: projectId, status: "active" }
    : { project_id: null, status: "active" };
  const sessions = await base44.entities.ChatSession.filter(
    filter, "-last_message_at", 1
  );
  return sessions.length > 0 ? (sessions[0] as ConversationSession) : null;
}
```

> **RISCO (validar na Fase 3):** filtro `{ project_id: null }` deve casar sessoes sem `project_id` no backend Base44 (sintaxe MongoDB). Se o backend nao suportar `null` direto, usar `{ project_id: { $exists: false } }` ou `{ $or: [{ project_id: null }, { project_id: { $exists: false } }] }`. Testar com `read_entities`/`filter` real antes de confiar.

**3. `createSession` com `projectId`:**

Substituir:
```typescript
export async function createSession(title = "Nova conversa"): Promise<ConversationSession> {
  const session = await base44.entities.ChatSession.create({
    title, status: "active", message_count: 0,
  });
  return session as ConversationSession;
}
```
Por:
```typescript
export async function createSession(
  title = "Nova conversa",
  projectId?: string
): Promise<ConversationSession> {
  const session = await base44.entities.ChatSession.create({
    title,
    status: "active",
    message_count: 0,
    ...(projectId ? { project_id: projectId } : {}),
  });
  return session as ConversationSession;
}
```

**4. `getOrCreateActiveSession` com `projectId`:**

Substituir o corpo inteiro por:
```typescript
export async function getOrCreateActiveSession(projectId?: string): Promise<ConversationSession> {
  // 1. Tenta restaurar a ultima sessao do ESCOPO (chave por projeto ou global)
  const lastId = getLastSessionId(projectId);
  if (lastId) {
    try {
      const session = await base44.entities.ChatSession.get(lastId) as ConversationSession;
      if (session && session.status === "active") return session;
    } catch {}
  }

  // 2. Fallback: busca a sessao ativa do escopo com mensagens mais recente
  const filter = projectId
    ? { project_id: projectId, status: "active" }
    : { project_id: null, status: "active" };
  const sessions = await base44.entities.ChatSession.filter(
    filter, "-last_message_at", 10
  );
  const withMessages = (sessions as ConversationSession[]).filter(
    (s) => s.message_count && s.message_count > 0 && s.last_message_at
  );
  if (withMessages.length > 0) {
    saveLastSessionId(withMessages[0].id, projectId);
    return withMessages[0];
  }
  if (sessions.length > 0) {
    saveLastSessionId((sessions[0] as ConversationSession).id, projectId);
    return sessions[0] as ConversationSession;
  }

  // 3. Cria nova sessao no escopo
  const newSession = await createSession("Nova conversa", projectId);
  saveLastSessionId(newSession.id, projectId);
  return newSession;
}
```

### 0.F0.2 — `ConversationSessionManager.ts`

**1. `initializeSession(projectId?)`:**

Substituir:
```typescript
async initializeSession(): Promise<ConversationSession> {
  const existing = conversationStore.session;
  if (existing && conversationStore.messages.length > 0) {
    return existing;
  }
  const session = await getOrCreateActiveSession();
  // ... resto identico
}
```
Por:
```typescript
async initializeSession(projectId?: string): Promise<ConversationSession> {
  const existing = conversationStore.session;
  if (existing && conversationStore.messages.length > 0) {
    return existing;
  }
  const session = await getOrCreateActiveSession(projectId);
  // ... resto identico (setSession, loadMessages, setMessages, emit)
}
```

**2. `createNewSession(title?, projectId?)`:**

Substituir:
```typescript
async createNewSession(title?: string): Promise<ConversationSession> {
  const session = await createSession(title);
  saveLastSessionId(session.id);
  // ... resto identico (runtimeContextLayer.clear, setSession, setMessages, emit)
}
```
Por:
```typescript
async createNewSession(title?: string, projectId?: string): Promise<ConversationSession> {
  const session = await createSession(title, projectId);
  saveLastSessionId(session.id, projectId);
  // ... resto identico
}
```

### 0.F0.3 — `ConversationManager.ts`

**1. `initialize(projectId?)`:**

Substituir:
```typescript
async initialize(): Promise<void> {
  if (conversationStore.state.isInitialized) return;
  await sessionManager.initializeSession();
}
```
Por:
```typescript
async initialize(projectId?: string): Promise<void> {
  if (conversationStore.state.isInitialized) return;
  await sessionManager.initializeSession(projectId);
}
```

**2. `newSession(title?, projectId?)`:**

Substituir:
```typescript
async newSession(title?: string) {
  return sessionManager.createNewSession(title);
}
```
Por:
```typescript
async newSession(title?: string, projectId?: string) {
  return sessionManager.createNewSession(title, projectId);
}
```

### 0.F0.4 — `useConversation.js`

Substituir:
```javascript
export function useConversation() {
  const [state, setState] = useState(() => conversationManager.state);
  useEffect(() => {
    const unsub = conversationManager.subscribe((s) => setState({ ...s }));
    return unsub;
  }, []);
  useEffect(() => {
    conversationManager.initialize().catch(console.error);
  }, []);
  // ...
  newSession: (title) => conversationManager.newSession(title),
  // ...
}
```
Por:
```javascript
export function useConversation({ projectId } = {}) {
  const [state, setState] = useState(() => conversationManager.state);
  useEffect(() => {
    const unsub = conversationManager.subscribe((s) => setState({ ...s }));
    return unsub;
  }, []);
  useEffect(() => {
    conversationManager.initialize(projectId).catch(console.error);
  }, [projectId]);
  // ...
  newSession: (title) => conversationManager.newSession(title, projectId),
  // ...
}
```

> **Cuidado:** o `useEffect` de init agora depende de `[projectId]` — se `projectId` mudar (raro, mas em troca de projeto na mesma montagem), re-inicializa. O guard `isInitialized` no `ConversationManager.initialize` evita re-init desnecessario, mas ao trocar de escopo e preciso forcar. **Decisao:** remover o guard `isInitialized` apenas quando `projectId` mudar, ou expor `conversationManager.resetAndInit(projectId)`. Validar na Fase 3.

### 0.F0.5 — `ChatPage.jsx`

Substituir:
```jsx
export default function ChatPage() {
  const conversation = useConversation();
  // ...
}
```
Por:
```jsx
export default function ChatPage({ projectId } = {}) {
  const conversation = useConversation({ projectId });
  // ...
}
```

**Fase 0 concluida:** CXP aceita escopo de projeto. Chat global continua funcionando (`projectId` undefined). Nenhuma pagina existente quebrada. Nenhum arquivo legado tocado.

---

## Fase 1 — Isolar sessao por escopo (validacao)

A Fase 0 ja implementou o isolamento (chaves localStorage por escopo + filtros bidirecionais). A Fase 1 e **apenas validacao**:

1. Abrir chat global (`/chat`) — deve criar/restaurar sessao sem `project_id`. localStorage: `memoryos_last_session_id`.
2. Abrir chat de projeto A (`/projects/A?tab=chat`) — deve criar/restaurar sessao com `project_id=A`. localStorage: `memoryos_last_session_id__proj_A`.
3. Abrir chat de projeto B — sessao independente, `memoryos_last_session_id__proj_B`.
4. Voltar ao chat global — NAO deve mostrar mensagens de nenhum projeto.
5. Validar filtro `{ project_id: null }` com query real (ver risco em 0.F0.1 item 2).

**Se o filtro `null` falhar:** ajustar para `{ project_id: { $exists: false } }` ou `{ $or: [{ project_id: null }, { project_id: { $exists: false } }] }` em `loadActiveSession` e `getOrCreateActiveSession`.

---

## Fase 2 — Reusar ChatPage no ProjectDetail (swap, revertivel)

### 0.F2.1 — `src/pages/ProjectDetail.jsx`

**Troca de import (linha 11):**

Substituir:
```jsx
import ChatInterface from "@/components/chat/ChatInterface";
```
Por:
```jsx
import ChatPage from "@/pages/ChatPage";
```

**Troca de uso (linhas 124-126):**

Substituir:
```jsx
<TabsContent value="chat" className="flex-1 overflow-hidden m-0">
  <ChatInterface projectId={id} projectName={project.name} />
</TabsContent>
```
Por:
```jsx
<TabsContent value="chat" className="flex-1 overflow-hidden m-0">
  <ChatPage projectId={id} />
</TabsContent>
```

> `projectName` nao e mais necessario — o `ChatPage`/CXP nao usa o nome do projeto como prompt (a pipeline v2 constroi contexto via `buildConversationContext` + `unifiedContextBuilder`, nao via prompt fixo de "memoria do projeto X"). Se houver dependencia oculta de `projectName`, revisar; mas a auditoria mostrou que a CXP nao o usa.

**Fase 2 concluida:** aba de chat do projeto agora roda na CXP v2. Reversivel: basta reverter as 2 linhas de ProjectDetail.

---

## Fase 3 — Verificar paridade (checklist antes de deletar)

### 0.F3.1 — Extracao de conhecimento

- [ ] Enviar 5+ mensagens no chat de projeto A.
- [ ] Confirmar que `processConversationBatch` roda (ver `ConversationBackgroundProcessor.ts` linha 130) e cria `KnowledgeEntity`/`Decision`/`Task`/`Topic`/`Keyword` com `project_id` correto.
- [ ] Confirmar `ChatSession.summary` atualizado para a sessao do projeto.

### 0.F3.2 — Resumo de sessao

- [ ] Confirmar `syncSessionMetadata` atualiza `summary` da sessao do projeto (nao da global).

### 0.F3.3 — Historico antigo

- [ ] Sessoes `ChatSession` com `project_id` criadas pelo `ChatInterface` legado aparecem ao abrir `/projects/X?tab=chat` (lidas por `getOrCreateActiveSession(projectId)`).
- [ ] Zero perda de dados: comparar contagem de `Message` com `project_id=X` antes/depois.

### 0.F3.4 — Isolamento

- [ ] Mensagens do projeto A nao aparecem no chat global (`/chat`).
- [ ] Mensagens do projeto A nao aparecem no projeto B.
- [ ] Sessao global nao e "roubada" por projeto (chave localStorage separada).

### 0.F3.5 — Re-inicializacao ao trocar escopo

- [ ] Navegar global -> projeto A -> projeto B -> global sem reload: cada escopo carrega sua sessao. Se o guard `isInitialized` impedir, ajustar `useConversation` (Fase 0, 0.F0.4).

### 0.F3.6 — Funcionalidades do ChatPage no contexto de projeto

- [ ] Voice (VXP) funciona na aba de projeto.
- [ ] Anexos (PDF/imagem/audio/texto/link) funcionam e salvam com `project_id`.
- [ ] Watch polling (PendingWatchAction) funciona — nao depende de escopo, mas validar.
- [ ] Smart auto-scroll funciona dentro da aba (overflow-hidden do TabsContent).

**Se qualquer item falhar:** NAO prosseguir para Fase 4. Corrigir ou reverter a Fase 2.

---

## Fase 4 — Delecao segura (so apos Fase 3 100% verde)

### 0.F4.1 — Deletar arquivos legados

- [ ] `delete_file("src/components/chat/ChatInterface.jsx")`
- [ ] `delete_file("src/lib/contextRetrieval.js")`

### 0.F4.2 — Limpar exports legados do `conversationEngine.js`

Remover de `src/lib/conversationEngine.js`:
- `export function shouldProcessBatch(messageCount)` (so usado por ChatInterface)
- `export async function getOrCreateActiveSession(projectId)` (CXP tem o seu em ConversationPersistence; ChatInterface era o unico consumidor desta versao)

**MANTER:**
- `export async function processConversationBatch(session, messages, projectId)` — COMPARTILHADO com `ConversationBackgroundProcessor.ts` (linha 130). NAO remover.

> **Verificacao pre-delecao:** antes de remover `getOrCreateActiveSession`/`shouldProcessBatch`, confirmar via busca que nenhum outro arquivo os importa. Se houver outro consumidor, abortar e migrar tambem.

### 0.F4.3 — Remover import morto do ChatPage

Em `src/pages/ChatPage.jsx`, remover `X` da lista de imports do lucide-react:
```jsx
// Antes
import {
  Send, Brain, Sparkles, ChevronDown, ChevronUp,
  Radio, Volume2, X, Paperclip, RotateCcw, Square,
} from "lucide-react";
// Depois
import {
  Send, Brain, Sparkles, ChevronDown, ChevronUp,
  Radio, Volume2, Paperclip, RotateCcw, Square,
} from "lucide-react";
```

### 0.F4.4 — Build final

- [ ] `vite build` sem erros.
- [ ] Sem warnings de import nao resolvido.

---

## Mapa de Arquivos por Fase

| Fase | Arquivo | Acao |
|------|---------|------|
| 0 | `ConversationPersistence.ts` | 4 funcoes ganham `projectId?` + chaves localStorage por escopo |
| 0 | `ConversationSessionManager.ts` | `initializeSession(projectId?)`, `createNewSession(title?, projectId?)` |
| 0 | `ConversationManager.ts` | `initialize(projectId?)`, `newSession(title?, projectId?)` |
| 0 | `useConversation.js` | `useConversation({ projectId })`, init com `[projectId]` |
| 0 | `ChatPage.jsx` | `ChatPage({ projectId })` |
| 1 | (validacao) | query real do filtro `project_id: null` + isolamento manual |
| 2 | `ProjectDetail.jsx` | import + uso trocam `ChatInterface` por `ChatPage` |
| 3 | (validacao) | checklist de paridade |
| 4 | `ChatInterface.jsx` | DELETE |
| 4 | `contextRetrieval.js` | DELETE |
| 4 | `conversationEngine.js` | remove `getOrCreateActiveSession` + `shouldProcessBatch` |
| 4 | `ChatPage.jsx` | remove import `X` |

---

## Ordem de Execucao (sequencia recomendada)

1. **Fase 0** — todos os 5 arquivos em um unico batch de edicoes (aditivo, backward compatible).
2. **Build** — `vite build` deve passar sem mudanca de comportamento.
3. **Fase 1** — validacao manual do filtro `project_id: null` + isolamento de localStorage.
4. **Fase 2** — swap em `ProjectDetail.jsx` (2 linhas).
5. **Build + preview** — chat de projeto agora roda na CXP.
6. **Fase 3** — checklist completo de paridade.
7. **Fase 4** — delecoes + limpeza do import `X` + build final.

---

## Riscos e Mitigacoes

| Risco | Probabilidade | Mitigacao |
|-------|---------------|-----------|
| Filtro `{ project_id: null }` nao suportado pelo backend | Media | Validar na Fase 1 com `read_entities`; fallback `$exists: false` / `$or` |
| Guard `isInitialized` bloqueia re-init ao trocar escopo | Media | Ajustar `useConversation` para forcar init quando `projectId` mudar |
| `projectName` usado em algum ponto oculto da CXP | Baixa | Auditoria mostrou que CXP nao o usa; se Fase 3 falhar, investigar |
| Sessoes orfas sem `project_id` do ChatInterface antigo viram "globais" | Media | Fase 1 decide: atribuir `project_id` retroativo ou deixar globais |
| `ConversationBackgroundProcessor` herda `session.project_id` corretamente | Alta (ja funciona) | Ja passa `session.project_id` para `processConversationBatch` (linha 131) — confirmar na Fase 3 |

---

## Estado Final Esperado (pos-Fase 4)

- Unico motor de chat: CXP v2 (`ChatPage` + `useConversation` + `ConversationPipeline`).
- Chat global (`/chat`, `/`) e chat de projeto (`/projects/:id?tab=chat`) usam a mesma pipeline, diferenciados apenas por `projectId`.
- `conversationEngine.js` mantem SO `processConversationBatch` (nucleo de extracao compartilhado).
- `ChatInterface.jsx` e `contextRetrieval.js` deletados.
- Import `X` removido do `ChatPage.jsx`.
- Zero perda de dados: sessoes e mensagens existentes preservadas (filtragem por `project_id`).

---

## Referencias Cruzadas

- **Plano de origem:** `src/docs/01-operational-knowledge/SESSION-2026-08-03-CHAT-LEGACY-CLEANUP-AUDIT.md` (secao 4)
- **ConversationPersistence (a editar):** `src/lib/conversation-platform/ConversationPersistence.ts`
- **ConversationSessionManager (a editar):** `src/lib/conversation-platform/ConversationSessionManager.ts`
- **ConversationManager (a editar):** `src/lib/conversation-platform/ConversationManager.ts`
- **useConversation (a editar):** `src/lib/conversation-platform/useConversation.js`
- **ChatPage (a editar):** `src/pages/ChatPage.jsx`
- **ProjectDetail (a editar — swap):** `src/pages/ProjectDetail.jsx`
- **ChatInterface (a DELETAR):** `src/components/chat/ChatInterface.jsx`
- **contextRetrieval (a DELETAR):** `src/lib/contextRetrieval.js`
- **conversationEngine (parcial):** `src/lib/conversationEngine.js`
- **ConversationBackgroundProcessor (reusa conversationEngine):** `src/lib/conversation-platform/ConversationBackgroundProcessor.ts