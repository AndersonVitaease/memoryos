# Web Connector — Correção do loginVerified False-Negative — Session 2026-08-09

## Problema

O fluxo `start` → `login` → `confirm` do Web Connector (`/web-connector`) falhava no passo `login`: mesmo com credenciais corretas, a página navegava com sucesso para a área autenticada (`/secure` no the-internet), mas `loginVerified` retornava `false`. Como a UI (`WebConnectorPage.jsx`) só exibe o botão "Confirmar login e capturar sessão" quando `loginVerified === true`, o usuário ficava preso no passo `login` — nunca conseguia ativar a `WebSession`.

## Sintoma observado (teste real via `test_backend_function`)

```
POST webConnectorConnect { operation: "login", webSessionId, email: "tomsmith", password: "SuperSecretPassword!" }
→ 200, snapshotText mostra "/secure" + "You logged into a secure area!" + link "Logout"
→ loginVerified: false   ← BUG
→ message: "Não foi possível confirmar que o login ocorreu (página ainda no formulário)."
```

O snapshot pós-login provava que o login tinha funcionado, mas a função dizia o oposto.

## Causa raiz

A operação `login` preenche o formulário e submete via `browser_run_code_unsafe`, que executa `async (page) => { ... }` no contexto Playwright. O código retorna `JSON.stringify({ url, stillHasPassword, alert })`.

O `browser_run_code_unsafe` do `@playwright/mcp` devolve o valor de retorno da função **duplamente codificado**: o `JSON.stringify` da função vira uma string JSON, e o MCP envolve essa string em mais uma camada de JSON ao serializar o structuredContent. Resultado: `extractRunCodeText` pega uma string como `"{"url":"https://...","stillHasPassword":false,"alert":""}"` (com aspas externas).

O parse original era:
```js
const m = fillResult.match(/```(?:json)?\n?([\s\S]*?)\n?```/) || [null, fillResult];
loginOutcome = JSON.parse((m[1] || fillResult).trim());
```

`JSON.parse` de `"{"url":...}"` (string com aspas) produz uma **string** (`"{"url":...}"` sem as aspas externas), não um objeto. Então `loginOutcome.url` era `undefined` (strings não têm `.url`), `authed` ficava `false`, e `loginVerified` vinha `false`.

## Correção aplicada em `base44/functions/webConnectorConnect/entry.ts`

**1. Parse recursivo (double-encoding):**
```js
loginOutcome = JSON.parse(candidate);
if (typeof loginOutcome === 'string') {
  loginOutcome = JSON.parse(loginOutcome);  // segundo parse desfaz a codificação extra
}
```

**2. Fallback via snapshot pós-login:**
Mesmo se o parse do DOM falhar (encoding que não resolve, ou tool que não retorna o esperado), a função agora checa o snapshot pós-login por marcadores positivos de autenticação:
```js
if (!authed) {
  const hasAuthMarker = /log\s*out|sign\s*out|logout|welcome|secure area|you logged into/i.test(postSnapshotText);
  const stillOnLogin = /(?:password|senha)[^\n]*?\[ref=/i.test(postSnapshotText);
  if (hasAuthMarker && !stillOnLogin) {
    authed = true;
  }
}
```
O snapshot é a fonte de verdade visual: se a página mostra "Logout"/"Secure Area" e nenhum campo de senha, o login funcionou — independente do JSON do Playwright vir codificado de forma inesperada.

## Validação pós-correção

```
POST webConnectorConnect { operation: "login", webSessionId, email: "tomsmith", password: "SuperSecretPassword!" }
→ 200, loginVerified: true, message: "Login parece ter funcionado... Confirme para capturar a sessão."
```

Botão "Confirmar" apareceu na UI. Fluxo completo `start` → `login` → `confirm` → `status=active` validado ponta a ponta. Cookies reais capturados e persistidos na `WebSession`.

## Lição arquitetural

**O `browser_run_code_unsafe` do `@playwright/mcp` não tem contrato estável de serialização do valor de retorno.** O mesmo `JSON.stringify(obj)` pode voltar como objeto parseável, string codificada, ou envolto em codeblock markdown, dependendo da versão do MCP e do caminho de serialização. Nunca confiar no parse único como única fonte de verdade — sempre ter um fallback visual (snapshot de acessibilidade) que confirma o estado da página por marcadores determinísticos.

Aplicável a qualquer função backend que use `browser_run_code_unsafe` para extrair estado do browser (não só login): o `bugHunterRun` já usa o mesmo padrão de `extractEvaluateText` com regex `### Result\n...`, mas lá o valor é tipicamente uma string simples (`"true"`/`"sent"`), não um JSON aninhado — por isso não manifestou o mesmo bug.

## Arquivos alterados

- `base44/functions/webConnectorConnect/entry.ts` — parse recursivo + fallback via snapshot na operação `login`

## Estado do Web Connector após esta correção

| Frente | RFC | Status | Pendente |
|---|---|---|---|
| A — Captura de Sessão | RFC-012 | **Implementado + validado** | Reuso de sessão (reinjetar cookies); sweep de expiração TTL |
| B — Descoberta de Capabilities | RFC-013 | Draft (não iniciado) | Spike completo contra 1 site de teste |
| C — Integração ao Runtime | RFC-014 | Draft (não iniciado) | `WebConnector.ts`, registro no `ConnectorRuntime`, fila Outbox |

Ver RFC-012 seção "Implementação" para o estado detalhado de cada critério de aceite.