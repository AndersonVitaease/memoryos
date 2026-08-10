# SESSION 2026-08-10 — Web Connector: Extensao Chrome para Sessao Continua (Cloudflare)

**ID:** SESSION-2026-08-10-WEB-CONNECTOR-CHROME-EXTENSION-CLOUDFLARE-PLAN
**Category:** SESSION_KNOWLEDGE
**Status:** PLANEJAMENTO APROVADO (nao implementado)
**Last Updated:** 2026-08-10
**Authority:** ENGINEERING

---

## Contexto

O Web Connector (RFC-012/013/014/015) descobre e executa capabilities em sites
autenticados via Playwright MCP headless. O bloqueio recorrente: sites com
protecao anti-bot (Cloudflare, hCaptcha, Datadome) recusam o navegador headless
por **fingerprint mismatch** — mesmo com o cookie `cf_clearance` capturado num
login manual (modo Live via Selenium/noVNC), o fingerprint do Playwright
headless (TLS, WebGL, canvas, navigator) diverge do navegador real que resolveu
o desafio, e o Cloudflare bloqueia de novo.

**Diagnostico confirmado em producao (2026-08-10):** Bling.com retorna 403
"Executando verificacao de seguranca" (Cloudflare) durante a descoberta, mesmo
apos login Live bem-sucedido. Reautenticar nao resolve — e o site recusando
automacao, nao sessao expirada. O modo Live resolve o **login** (CAPTCHA/2FA
resolvido como humano), mas a **descoberta/uso** subsequente troca pro Playwright
headless e o Cloudflare bloqueia de novo.

---

## Solucao: Extensao Chrome (MemoryOS Browser Bridge)

A extensao roda **dentro do Chrome real do usuario**, que o Cloudflare ja aceitou.
Nao ha fingerprint mismatch porque **e o navegador dele**, com TLS/WebGL/canvas
reais e o cookie `cf_clearance` ja casando com o fingerprint. A descoberta e a
execucao viram content scripts que leem o DOM e preenchem formularios na aba
autenticada — tudo num browser que ja passou no desafio, sem noVNC, sem Selenium,
sem nada headless.

**Troca arquitetural honesta:** a "sessao" deixa de ser cookies guardados no
backend e passa a ser a **aba ativa do usuario**. A extensao faz o trabalho no
cliente e reporta pro MemoryOS via API; o backend deixa de orquestrar o browser
e vira so persistencia + LLM.

---

## Arquitetura

```
Chrome do usuario (autenticado, cf_clearance valido)
  └─ MemoryOS Extension (MV3)
       ├─ content script (le DOM, preenche forms, navega)
       └─ service worker (auth via token do app ja logado, heartbeat)
            ↓ HTTPS
  MemoryOS Backend (inalterado na logica)
       ├─ webConnectorExtension (NOVO: registerSession, submitSnapshot, executeStep)
       ├─ WebSession (entidade existente + campo aditivo source)
       ├─ CapabilityCandidate / CapabilityMap (entidades existentes, reutilizadas)
       └─ InvokeLLM (mesmo prompt de descoberta do webConnectorDiscover)
```

Tres origens de sessao coexistem: `headless` (Playwright), `live` (Selenium),
`extension` (Chrome real). O roteamento do chat/planner ja resolve por
WebSession ativa + CapabilityMap — nao muda nada.

---

## Plano de Implementacao (3 Sprints, 100% aditivo)

### Sprint 1 — Foundation (scaffold + registro de sessao)

- Extensao MV3: manifest, content script, service worker background.
- Auth: a extensao le o token do MemoryOS ja logado no navegador (mesmo dominio)
  — sem novo login.
- Backend function `webConnectorExtension` com operacoes `registerSession`
  (cria `WebSession` status=active) e `heartbeat` (mantem viva / detecta aba
  fechada).
- `WebSession` ganha campo aditivo `source` (`headless` | `live` | `extension`),
  default `headless` — fluxo existente ignora o campo.

**Critério de aceite:** aba autenticada aparece como sessao ativa no
`/connections`.

### Sprint 2 — Descoberta via extensao

- Content script extrai snapshot (arvore de acessibilidade/DOM resumido) + links
  -> POST `submitSnapshot`.
- Backend roda o **mesmo** prompt de descoberta do `webConnectorDiscover` ->
  salva `CapabilityCandidate` (entidade reutilizada, fluxo de validacao admin
  intacto).
- Backend retorna alvos de navegacao -> content script navega (BFS) e envia
  proximo snapshot.
- Toggle no UI: "Descobrir via extensao".

**Critério de aceite:** descobrir capabilities no Bling (Cloudflare) sem 403.

### Sprint 3 — Execucao de capability + hardening

- `webConnectorExtension.executeCapability`: backend envia campos+seletores ->
  content script preenche+submete+captura links (mesmo write-guard do headless,
  no DOM do content script).
- Roteamento do chat funciona inalterado (`WebSiteIntentResolver` ve a sessao
  extension como ativa).
- Hardening: aba fechada -> `status=revoked`; timeout; limpeza; modelo de
  permissoes (so read/fill, nunca escrita sem guard).

**Critério de aceite:** "busque X no Bling" via chat executa a capability e
retorna resultados.

---

## Garantias de Nao-Quebra

- **100% aditivo.** So um campo novo opcional em `WebSession` (`source`,
  default `headless`) e um backend novo (`webConnectorExtension`). Zero mudancas
  em `webConnectorConnect`/`webConnectorDiscover`/`webConnectorLive`/launcher
  Selenium.
- O risco real nao esta no codigo — esta na **publicacao da extensao** (Chrome
  Web Store review) e na distribuicao para o usuario/usuarios.
- As tres origens (headless/live/extension) coexistem; o planner roteia por
  WebSession ativa + CapabilityMap, sem mudanca.

---

## Risco Residual

- Publicacao na Chrome Web Store (review pode levar dias; politica de
  permissoes).
- Distribuicao: usuario precisa instalar a extensao (nao automatico como o app
  web).
- A extensao so funciona quando o Chrome do usuario esta aberto na aba
  autenticada (sessao efemera por natureza, diferente dos cookies persistidos
  no backend).

---

## Referencias Cruzadas

- **RFC-012:** `src/docs/foundation/rfc/RFC-012-Web-Connector-Session-Capture.md`
- **RFC-013:** `src/docs/foundation/rfc/RFC-013-Web-Connector-Capability-Discovery.md`
- **RFC-014:** `src/docs/foundation/rfc/RFC-014-Web-Connector-Runtime-Integration.md`
- **RFC-015:** `src/docs/foundation/rfc/RFC-015-Web-Connector-Live-Login.md`
- **ADR-019:** `src/docs/foundation/adr/ADR-019.md` (nunca armazenar credenciais)
- **Sessao multi-site:** `SESSION-2026-08-10-WEB-CONNECTOR-MULTISITE-ROUTING-PLAN.md`
- **Sessao BFS/anti-bot:** `SESSION-2026-08-10-WEB-CONNECTOR-DISCOVERY-BFS-ANTIBOT-FIX.md`
- **Codigo vivo:** `base44/functions/webConnectorConnect/entry.ts`,
  `base44/functions/webConnectorDiscover/entry.ts`,
  `base44/functions/webConnectorLive/entry.ts`,
  `infra/live-browser/launcher.mjs`,
  `base44/shared/webSessionWarmup.ts