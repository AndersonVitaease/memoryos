# MemoryOS Browser Bridge (Extensao Chrome)

Extensao MV3 que conecta sites autenticados ao MemoryOS, rodando dentro do
Chrome real do usuario (passa por Cloudflare/anti-bot nativamente, sem
Playwright headless nem Selenium/noVNC).

**Estado:** Sprint 1 (Foundation) — scaffold funcional. Descoberta (Sprint 2)
e execucao de capabilities (Sprint 3) virao aditivamente.

## Como instalar (modo desenvolvedor)

1. Abra `chrome://extensions` no Chrome.
2. Ative "Modo do desenvolvedor" (canto superior direito).
3. Clique "Carregar sem compactacao" e selecione esta pasta `extension/`.
4. Fixe o icone da extensao na barra.

## Como usar (Sprint 1)

1. **Autenticar a extensao:** abra o app MemoryOS (`https://ever-mind-core.base44.app`)
   nesta janela do Chrome e faca login normalmente. A extensao captura o token
   de auth automaticamente (content script no dominio do app).
2. **Conectar um site:** navegue ate o site autenticado (ex: Bling, Mercado Livre),
   faca login nele normalmente (resolva CAPTCHA/2FA como humano). Depois clique no
   icone da extensao e em "Conectar este site".
3. A sessao aparece como ativa no `/connections` do MemoryOS (origem `extension`).
4. **Desconectar:** clique no icone da extensao e em "Desconectar". Fechar a aba
   tambem revoga automaticamente.

## Configuracao — dominio do app

O `manifest.json` e o `content-app.js` estao configurados para o dominio
`ever-mind-core.base44.app`. Se o seu app MemoryOS usa outro dominio (ex: um
custom domain), edite:

- `manifest.json` → `host_permissions` e `content_scripts[0].matches`
- `background.js` → constante `APP_DOMAINS`

## Arquitetura

```
Chrome do usuario (autenticado, cf_clearance valido)
  +-- content-app.js  (rodando no dominio do app MemoryOS: captura o token)
  +-- background.js    (service worker: registerSession, heartbeat via alarms,
                       revoke ao detectar aba fechada)
  +-- popup.html/js    (UI: conectar/desconectar o site atual)
       |
       v  HTTPS (Authorization: Bearer <token>)
  MemoryOS Backend — webConnectorExtension (registerSession / heartbeat / revoke)
       |
       v
  WebSession (source = 'extension')
```

O service worker MV3 e efemero; toda logica periodica usa `chrome.alarms`
(heartbeat a cada 5 min, bem abaixo do TTL de 30 min do backend). A deteccao
de aba fechada usa `chrome.tabs.onRemoved` para revogar imediatamente, sem
esperar o proximo alarm.

## Seguranca

- O token de auth do MemoryOS e capturado apenas no dominio do proprio app
  (content script com `matches` restrito) e guardado em `chrome.storage.local`
  (nao sai do navegador a nao ser para chamar as backend functions do MemoryOS).
- Nenhum cookie de auth de sites de terceiros e persistido pela extensao no
  Sprint 1 — a "sessao" e a propria aba ativa do usuario.
- O backend `webConnectorExtension` rejeita operacoes em WebSession de origem
  diferente de `extension`, isolando as tres origens (headless/live/extension).

## Proximos sprints

- **Sprint 2 — Descoberta:** content script no site conectado extrai snapshot +
  links, backend reusa o prompt do `webConnectorDiscover`, salva
  `CapabilityCandidate`. Criterio: descobrir capabilities no Bling sem 403.
- **Sprint 3 — Execucao:** `executeCapability` via content script (preenche
  formulario + submete + captura links), roteamento do chat inalterado,
  hardening (write-guard no DOM, modelo de permissoes).