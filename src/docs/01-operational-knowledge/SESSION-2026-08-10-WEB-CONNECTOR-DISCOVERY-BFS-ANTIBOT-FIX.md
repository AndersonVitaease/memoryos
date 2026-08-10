# SESSION 2026-08-10 — Web Connector: Motor de Descoberta (RFC-013) — Anti-bot, Bugs de Navegação e Reescrita para Exploração Automática (BFS)

**ID:** SESSION-2026-08-10-WEB-CONNECTOR-DISCOVERY-BFS-ANTIBOT-FIX
**Category:** SESSION_KNOWLEDGE
**Status:** IMPLEMENTED (validado parcialmente — ver Limitações)
**Last Updated:** 2026-08-10
**Authority:** ENGINEERING

---

## Contexto

Sessão de continuação direta da `SESSION-2026-08-10-WEB-CONNECTOR-LIVE-LOGIN.md`
(RFC-015). Depois de validar o login com CAPTCHA/2FA real (Mercado Livre, via
Selenium/noVNC), o usuário testou o **motor de descoberta de capabilities**
(RFC-013, `webConnectorDiscover`) contra a mesma sessão autenticada e obteve
consistentemente **0 candidatos descobertos**. Esta sessão documenta o
processo de debug ao vivo (com dados reais do Mercado Livre) que revelou
**5 bugs distintos e sobrepostos** — cada um mascarando o próximo — e termina
com uma reescrita arquitetural do motor.

---

## Bugs Encontrados e Corrigidos (em ordem de descoberta)

### Bug 1 — Seletor `[ref=X]` nunca casa com o DOM real

O código original tentava extrair o `href` do link sugerido pela IA assim:
```js
page.$("[ref=" + ref + "], a")
```
O `ref` (ex: `s1e5`) é um **ID interno do snapshot de acessibilidade do
Playwright**, não um atributo HTML real. O seletor `[ref=...]` nunca casava
com nada, e o fallback `, a` sempre pegava o **primeiro `<a>` da página
inteira** — geralmente irrelevante (logo, link de topo).

**Fix:** extrai todos os links da página (`$$eval("a[href]")`, texto + href)
numa única chamada e casa pelo **texto do label** sugerido pela IA
(case-insensitive, substring nos dois sentidos), sem depender de refs
inexistentes.

### Bug 2 — Loop entre domínios via seletor de país/idioma

Com o Bug 1 corrigido, o motor passou a seguir links de verdade — mas caiu
num loop entre `mercadolivre.com.br` e `mercadolibre.com` (seletor de
país/idioma no rodapé). O texto desses links (nomes de país, bandeiras) às
vezes casava por acidente com o label sugerido pela IA, consumindo todo o
orçamento de páginas sem nunca chegar a uma área útil.

**Fix:** restringe navegação ao mesmo domínio da sessão (comparação de
hostname).

### Bug 3 — Comparação de domínio exata demais

O fix do Bug 2, com comparação de hostname **exata**, começou a retornar
"0 links brutos" — o filtro descartava **todos** os links da página, porque
sites grandes usam subdomínios diferentes para áreas de conta (ex:
`myaccount.mercadolivre.com.br`). Isso não gerava erro, só silenciosamente
zerava os candidatos, o que consumiu bastante tempo de debug até ficar claro.

**Fix:** aceita qualquer subdomínio do mesmo domínio raiz (comparação por
sufixo: `hostname === base || hostname.endsWith('.' + base)`), não só
hostname idêntico.

### Bug 4 — WAF/anti-bot bloqueando o motor de descoberta (HTTP 403)

Com os filtros de domínio corretos, "links brutos" continuava em **2** (uma
página real do Mercado Livre logada tem centenas). Instrumentação de debug
(preview do snapshot da página) revelou a causa real:
```
HTTP status: 403
"Hubo un error accediendo a esta pagina..."
```
O Mercado Livre estava bloqueando o motor de descoberta — que usa
**Playwright headless** via container MCP dedicado (`playwright-web-connector`,
porta 8932) — **mesmo com cookies de sessão válidos**. Este motor é uma
infraestrutura **separada** do Selenium usado no login ao vivo (RFC-015, já
tinha patch anti-detecção); o Playwright não tinha proteção nenhuma.

**Fix (duas camadas):**
1. **Código** (`webConnectorDiscover/entry.ts`): `page.context().addInitScript()`
   mascarando `navigator.webdriver`, `window.chrome`, `navigator.plugins`,
   `navigator.languages` antes de qualquer script da página rodar.
2. **Infraestrutura VPS** (`docker-compose.yml` do `playwright-web-connector`):
   - `--browser chromium` explícito na linha de comando (o campo `browserName`
     no arquivo de config JSON não estava sendo respeitado pela versão
     instalada do `@playwright/mcp`).
   - Config JSON (`/root/playwright-mcp/config/web-connector-config.json`)
     com `launchOptions.args: ["--disable-blink-features=AutomationControlled",
     "--disable-infobars"]` e `contextOptions.userAgent` atualizado para
     **Chrome 151** (versão real de agosto/2026 — o primeiro user-agent que
     tentamos, Chrome/126, era de 2024 e seria ele mesmo um sinal de suspeita).

### Bug 5 — Container quebrado após recriação (`chrome-for-testing` ausente)

Ao recriar o container com o novo `docker-compose.yml`, o `npx
@playwright/mcp@latest` resolveu para a versão `0.0.79`, que por padrão
espera um binário `chrome-for-testing` não presente na imagem Docker antiga
(`mcr.microsoft.com/playwright:v1.49.0-jammy`). Erro:
```
Browser "chrome-for-testing" is not installed; expected executable at
/ms-playwright/chromium-1237/chrome-linux64/chrome
```
**Fix:** `docker compose exec playwright-web-connector npx @playwright/mcp
install-browser chrome-for-testing` — baixa o Chrome for Testing 152.0.7977.8
direto dentro do container já rodando.

**Risco conhecido não resolvido:** esse binário baixado **não está em um
volume persistente** — se o container for recriado do zero novamente (ex:
`docker compose up -d --force-recreate` sem volume de `/ms-playwright`), o
erro do Bug 5 volta e o `install-browser` precisa ser rodado de novo.
Candidato a ADR/fix futuro: montar `/ms-playwright` como volume nomeado.

---

## Reescrita Arquitetural: de Trilha Linear para Exploração em Fila (BFS)

Mesmo com todos os bugs acima corrigidos, o motor original só seguia **um
link por página** (`nextUrl` único por iteração) — uma trilha linear. Isso
significava que, para descobrir capabilities em áreas diferentes (compras,
vendas, anúncios, perguntas), era necessário **reapontar manualmente**
`WebSession.site_url` no banco entre cada rodada de descoberta — inviável
para o usuário final.

**Redesenho (fila BFS):** o motor agora mantém uma fila (`queue`) e um
conjunto de já-visitados/já-enfileirados. Em cada página:
1. Extrai todos os links (mesmo domínio raiz).
2. Enfileira **todos** os que casam com `navigation_links` sugeridos pela IA
   **e todos** os que casam com uma lista de palavras-chave de área de conta
   (`compra|pedido|venda|anuncio|publica|conta|account|central.?do.?vendedor|
   seller|historico|extrato|fatura|nota|pergunta|financeiro|reputa`).
3. Se nada foi enfileirado, revela menus escondidos via hover
   (`mouseover/mouseenter/pointerover/pointerenter` disparados via JS —
   leitura pura, não é um clique) e tenta de novo.
4. Continua até a fila esvaziar ou atingir o limite de páginas.

**Limites:** `DEFAULT_MAX_PAGES` subiu de 3 para **10**; hard cap de segurança
subiu de 5 para **20** (protege tempo de execução e custo de chamadas LLM —
cada página visitada custa 1 chamada ao `InvokeLLM`). O frontend
(`WebConnectorPage.jsx`) agora passa `maxPages: 15` explicitamente na chamada
de "Descobrir capabilities".

**Efeito esperado:** uma única chamada de "Descobrir capabilities", partindo
da home, deve ramificar sozinha para várias áreas funcionais do site (compras,
vendas, anúncios, perguntas) sem intervenção manual entre rodadas — esse era
o requisito explícito do usuário ("preciso que isso seja feito de forma
automática sem a sua intervenção").

---

## Outros Fixes na Mesma Sessão

### `WebConnectorPage.jsx` — retomada automática de sessão ativa

A página não tinha nenhuma forma de recuperar uma `WebSession` já ativa após
um F5 — o estado (`webSessionId`, `status`) vivia só em `useState` local,
zerado a cada reload, mesmo com a sessão continuando válida no banco. Um
`useEffect` no mount agora busca a `WebSession` mais recente com
`status: 'active'` e retoma a UI diretamente na tela de sessão ativa.

### Instrumentação de debug temporária em `webConnectorDiscover`

Para diagnosticar os Bugs 3 e 4 sem tentativa-e-erro às cegas, a função passou
a devolver um campo `debug` (só quando `candidates_discovered === 0`) com:
`raw_links_found_before_domain_filter`, `hover_triggered_on_elements`,
`error` (mensagens de exceção nos passos de navegação/snapshot/extração), e
`snapshot_preview` (primeiros 500 caracteres do snapshot real da página —
foi isso que revelou o HTTP 403 do Bug 4). Exposto na UI via `<details>`
colapsável "Debug: por que 0 candidatos?".

**Nota:** essa instrumentação é útil para qualquer site novo que apresente o
mesmo sintoma (0 candidatos) — recomenda-se manter, não é só descartável.

---

## Validação

- **Login com CAPTCHA/2FA real (RFC-015):** confirmado nesta sessão com conta
  real da Vitaease no Mercado Livre — cookies HttpOnly capturados
  (`ssid`, `nsa_rotok`, etc.), sessão marcada `active`.
- **Descoberta pós-fix (versão trilha linear, ANTES da reescrita BFS):**
  validada com sucesso — 2 candidatos (`search.products`, `product.search`)
  encontrados em 4 páginas, confirmando que o bypass do WAF (Bug 4) e os
  fixes de matching (Bugs 1-3) funcionaram de ponta a ponta.
- **Motor BFS (versão final, pós-reescrita):** implementado mas **ainda não
  re-testado** nesta sessão — a `WebSession` usada nos testes anteriores
  expirou (TTL de 30 min) antes da reescrita ser validada. Próxima sessão
  deve reconectar e confirmar que a exploração multi-área automática funciona
  como esperado.

---

## Limitações Conhecidas

1. **Binário `chrome-for-testing` não persistente** (ver Bug 5) — precisa de
   volume Docker ou reinstalação manual após recriação do container.
2. **BFS ainda não validado end-to-end** — arquitetura implementada mas
   pendente de teste real após a reescrita.
3. **TTL de sessão (30 min) é curto para sessões de debug longas** — vale
   considerar aumentar para uso em desenvolvimento/teste, mantendo o valor
   menor em produção.
4. **`playwright-web-connector` e `playwright-mcp` (porta 8931) agora têm
   configs divergentes** — o primeiro tem user-agent/args customizados, o
   segundo não. Isso é intencional (só o motor de descoberta precisa do
   anti-detecção), mas deve ficar registrado para não causar confusão em
   manutenção futura.
5. **Regra de segurança "nunca clica" mantida, mas interpretada de forma
   ampliada:** o hover disparado via `dispatchEvent` tecnicamente não é um
   clique e não navega/submete nada — mas é uma simulação de interação do
   usuário que vale revisar com atenção se a política de segurança do RFC-013
   for auditada formalmente.

---

## Lições (reutilizar)

1. **Debug tapa-buraco em produção é caro.** Boa parte desta sessão foi gasta
   testando hipóteses uma de cada vez contra um site real. Instrumentação de
   debug (raw counts, snapshot preview, mensagens de erro explícitas) deveria
   ter sido adicionada **antes** da primeira tentativa, não depois de 3 fixes
   às cegas.
2. **HTTP 403 com cookies válidos = suspeita de WAF/anti-bot, não de lógica
   de aplicação.** Quando uma extração retorna zero resultados sem exceção,
   verificar o conteúdo real da página (não assumir que é um bug de
   matching) antes de continuar ajustando regex/seletores.
3. **Motores de automação diferentes (Selenium vs Playwright) não
   compartilham proteção anti-detecção automaticamente** — cada infra
   precisa do próprio patch.
4. **`ref` de snapshot de acessibilidade não é atributo DOM.** Não usar como
   seletor CSS; extrair por texto/label é mais robusto e não depende de
   implementação interna do Playwright MCP.
5. **Versões de dependência externas (`@playwright/mcp@latest`) podem mudar
   requisitos de infraestrutura sem aviso** (Bug 5) — fixar versão em vez de
   `@latest` é mais previsível para produção, ao custo de perder patches de
   segurança automáticos.
6. **Trilha linear vs. fila (BFS) é a diferença entre "preciso de mim a cada
   passo" e "funciona sozinho".** Motores de descoberta/crawling devem
   ramificar por padrão, não seguir caminho único, quando o objetivo é
   cobertura ampla.

---

## Referências Cruzadas

- **Sessão anterior (mesma linha do tempo):** `SESSION-2026-08-10-WEB-CONNECTOR-LIVE-LOGIN.md`
- **RFC-013 (Descoberta de capabilities):** `src/docs/foundation/rfc/RFC-013-*.md`
- **RFC-015 (Live Login):** `src/docs/foundation/rfc/RFC-015-Web-Connector-Live-Login.md`
- **ADR-019 (segurança, nunca armazenar credenciais):** `src/docs/foundation/adr/ADR-019.md`
- **Backend:** `base44/functions/webConnectorDiscover/entry.ts`
- **Frontend:** `src/pages/WebConnectorPage.jsx`
- **Infra Playwright MCP:** `PLAYWRIGHT-MCP-SERVER-INFRASTRUCTURE.md`, `/root/playwright-mcp/docker-compose.yml` (VPS)
