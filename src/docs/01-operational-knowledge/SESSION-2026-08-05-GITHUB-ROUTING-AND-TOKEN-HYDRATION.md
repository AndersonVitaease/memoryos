# SESSION 2026-08-05 — GitHub: Roteamento de Leitura de Arquivo + Hidratação de Token

**Data:** 2026-08-05
**Status:** CONCLUIDO
**Escopo:** `src/lib/goals/GoalRegistry.ts`, `src/lib/connector-runtime/connectors/GitHubConnector.ts`

---

## 1. Contexto

Usuario conectou GitHub via OAuth multi-conta (token persistido na entidade
`GitHubOAuthToken`) e pediu no chat: "leia o arquivo README.md do repositorio
donno/repo". Dois bugs encadeados impediram a leitura, um escondendo o proximo:

1. **Roteamento errado** — a frase casava com sinais do Google Drive
   (`drive.openDocument`/`drive.downloadFile`) em vez de `github.getFile`, entao
   o conector Drive tentava baixar "readme.md do repositorio..." como se fosse um
   arquivo do Drive.
2. **Token em memoria perdido** — apos corrigir o roteamento, o GitHubConnector
   declarava `NOT_CONFIGURED` ("GitHub token not configured. Set GITHUB_TOKEN
   in environment.") porque o mapa de tokens OAuth em memoria
   (`GitHubAuthSession._tokenStore`) e volatil e se perde no reload/HMR, mesmo
   com o token persistido no backend.

## 2. Roteamento: GitHub acima do Drive no GoalRegistry

**Arquivo:** `src/lib/goals/GoalRegistry.ts`

### 2.1 Problema

`matchBySignals()` percorre `_definitions` na ordem de registro e retorna a
primeira definicao cujo sinal casa (first-match-wins). Os goals do GitHub
(`github.getFile`, `github.listFiles`) estavam registrados DEPOIS dos goals do
Drive. A frase "leia o arquivo X do repositorio Y" contem o sinal generico
"leia o arquivo" de `drive.openDocument` — como Drive vinha antes, ele vencia
e roubava a intencao.

### 2.2 Correcao

1. **Reordenacao** — os blocos `github.listFiles` e `github.getFile` foram
   movidos para ANTES de todos os goals do Drive no array `_builtins`.
   `github.listFiles` vem antes de `github.getFile` para que "listar arquivos
   do repositorio" (verbo de listagem) case em `listFiles` e nao em `getFile`.
2. **Sinais discriminadores de repositorio** — adicionados a `github.getFile`:
   `"do repositorio"`, `"do repo"`, `"no repositorio"`, `"no repo"`. Esses
   trechos estaveis vencem o sinal generico "leia o arquivo" do
   `drive.openDocument` (registrado depois) porque o GitHub agora e testado
   primeiro.
3. **Normalizacao NFD em `matchBySignals`** — a entrada do usuario e
   normalizada com `toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")`
   antes do matching. Os sinais sao escritos em ASCII puro ("repositorio" sem
   acento); a normalizacao torna o casamento insensivel a acentos, entao
   "repositorio" (sinal) casa com "repositorio" (input do usuario).
4. **Fronteira de palavra Unicode** — o regex de matching usa
   `(^|[^\p{L}\p{N}])` ... `([^\p{L}\p{N}]|$)` com flag `u`, evitando
   colisoes por substring ("baixo" em "preco baixo" nao casa como comando).

### 2.3 Antipadraao corrigido (acented string literals em TS)

String literals TS com caracteres acentuados causam erros de build no ambiente
Vite. Todos os sinais novos do bloco GitHub sao ASCII puro; a normalizacao NFD
em runtime torna o casamento insensivel a acentos sem precisar de acentos nos
literals. Licao: **sinais em ASCII puro + normalizacao NFD na entrada > sinais
acentuados que quebram o build.**

### 2.4 Validacao

Simulado via `exec_tool` (replica exata de `matchBySignals` com os sinais
atuais): "leia o arquivo README.md do repositorio donno/repo" e "leia o
arquivo README.md do repositorio Anderson/repo" ambas roteiam para
`github.getFile` (sinal "do repositorio" casa), nao para Drive.

## 3. Hidratacao de Token: GitHubConnector._dispatch

**Arquivo:** `src/lib/connector-runtime/connectors/GitHubConnector.ts`

### 3.1 Problema

`getToken()` (linha ~530) e sincrono e so le o mapa em memoria
(`_getGitHubActiveAccessToken(workspaceId)` de `GitHubAuthSession`), com
fallback para `globalThis.__GITHUB_TOKEN__` (PAT legacy). Apos um reload de
pagina ou HMR do build, o `_tokenStore` (Map em memoria) e esvaziado — o token
OAuth existe no backend (`GitHubOAuthToken` entity) e a metadata da conexao
existe no `localStorage`, mas o mapa em memoria esta vazio. Resultado:
`getToken()` retorna null → `notConfigured()` → erro "GitHub token not
configured" mesmo com o usuario autenticado.

### 3.2 Correcao

Em `_dispatch`, antes de declarar `NOT_CONFIGURED`, se `getToken()` retornar
null, tenta hidratar do backend:

```typescript
let token = this.getToken();
if (!token) {
  try {
    const activeWs = _getActiveGitHubWs();
    const { hydrateToken } = await import("@/lib/github-auth/GitHubAuthSession");
    const hydrated = await hydrateToken(activeWs);
    if (hydrated) token = this.getToken();
  } catch { /* fall through to notConfigured */ }
}
if (!token) { return notConfigured(...); }
```

`hydrateToken(workspaceId)` (ja existente em `GitHubAuthSession.js`, linha 201)
verifica a conexao no `localStorage` (persiste entre reloads), chama a backend
function `githubRefreshToken` que le `GitHubOAuthToken` filtrando por
`user_id` + `workspace_id` e retorna o `access_token`, e repovoa o `_tokenStore`
em memoria. Apos a hidratacao, `getToken()` retorna o token e o dispatch
prossegue.

### 3.3 Por que no _dispatch e nao no getToken

`getToken()` e sincrono (chamado tambem por `validateAsync`/`health`/`initialize`,
que nao estao na critical path de execucao de uma capability). A hidratacao e
async (chamada de backend function). `_dispatch` ja e async, entao e o lugar
correto para a hidratacao sob demanda. Isso garante que toda execucao de
capability GitHub tenta hidratar antes de falhar com NOT_CONFIGURED, sem
exigir hidratacao eager no boot (que seria mais uma fonte de latencia).

### 3.4 Backend `githubRefreshToken`

**Arquivo:** `base44/functions/githubRefreshToken/entry.ts` (pre-existente)

Confirma que retorna `{ accessToken, accountLogin, scopes }` lendo
`GitHubOAuthToken.filter({ user_id, workspace_id })`. Tokens GitHub (OAuth
App classico) nao expiram por padrao, entao "refresh" aqui e so re-entregar o
token ja armazenado — nao ha chamada ao GitHub.

## 4. Nao-quebra

- **Roteamento** — apenas a ordem de registro e os sinais mudaram. Nenhuma
  logica de execucao, nenhum conector, nenhum planner alterado. Frases sem
  "do repositorio"/"do repo" continuam caindo no Drive como antes (o sinal
  generico "leia o arquivo" do `drive.openDocument` nao foi removido).
- **Hidratacao** — aditiva e sob demanda. Se a hidratacao falhar (sem conexao
  no localStorage, ou backend indisponivel), cai no `notConfigured` original
  (comportamento anterior preservado). Se o token em memoria ja existir, a
  hidratacao e pulada (`if (!token)`).
- **`getToken()`/`validateAsync`/`health`/`initialize`** nao foram tocados —
  continuam sincronos. Esses sao caminhos de diagnostico/boot, nao a critical
  path de execucao de capability. Se necessario no futuro, pode-se propagar a
  hidratacao para eles tambem.

## 5. Licoes

1. **Ordem de registro em registries first-match-wins importa** — quando dois
   goals compartilham um sinal generico, o mais especifico DEVE ser registrado
   primeiro. Mover blocos e adicionar sinais discriminadores e mais robusto
   que tentar tornar o sinal generico menos generico.
2. **Sinais em ASCII puro + normalizacao NFD na entrada > sinais acentuados em
   literals TS** — acentos em string literals quebram o build Vite; normalizar
   a entrada resolve o casamento sem risco de build.
3. **Tokens OAuth em memoria sao volateis por design** — `localStorage` guarda
   so metadata; o token nunca sai do backend. Hidratacao sob demanda (na critical
   path async) e o padrao correto, nao hidratacao eager no boot.
4. **Hidratacao ja existia mas nao era chamada** — `hydrateToken`/`ensureValidToken`
   ja estavam implementados em `GitHubAuthSession`, mas o conector nao os usava.
   Antes de criar logica nova, verificar se o utilitario ja existe.