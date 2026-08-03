# RFC-006 — Microsoft Graph Connector Expansion (Capability Executors)

**Status:** Proposed
**Categoria:** Connector Expansion
**Prioridade:** High
**Foundation:** v1.0
**Data:** 2026-08-03
**Autor:** MemoryOS Engineering
**Rastreabilidade:** MES §16 (Connector Runtime), MCF (Connector Framework), ADR-005 (Connector Registry), ADR-012 (Watch Engine — padrão de camadas), RFC-005 (Watch Engine — referência de método)

---

## Objetivo

Definir formalmente a expansao do conector Microsoft Graph para cobrir os **11 servicos** do ecossistema Microsoft 365, adotando o padrao de **Capability Executors** (um executor TypeScript por servico) em vez de um switch monolitico no `execute()` do conector.

---

## Contexto

O `MicrosoftGraphConnector` atual (`src/lib/connector-runtime/connectors/MicrosoftGraphConnector.ts`) ja expoe **8 capacidades** (Outlook Mail, Calendar, OneDrive) num unico `switch` dentro de `execute()`. O OAuth completo funciona (MicrosoftAuthSession.js + 4 backend functions + entidade MicrosoftOAuthToken).

O usuario pediu cobertura dos **11 servicos** do Microsoft 365:
- Outlook (Email) — JA existe
- Calendar — JA existe
- OneDrive — JA existe
- Contacts — NOVO
- To Do — NOVO
- OneNote — NOVO
- Teams — NOVO
- SharePoint — NOVO
- Excel Online — NOVO
- Word Online — NOVO
- PowerPoint Online — NOVO

Adicionar 7 servicos novos ao switch atual produziria um arquivo monolitico de 800+ linhas com dezenas de `case` — exatamente o padrao **rejeitado** no passado (dead end: arquitetura monolitica de UI baseada em lista, switches insustentaveis).

---

## Principio

> O Microsoft Graph e uma **unica API oficial** — nao ha provedores concorrentes a abstrair.
> Portanto, o conector Microsoft e **somente um Connector**, nao um Provider (no sentido de troca de backend do WhatsApp).
> Cada servico do Microsoft 365 vira um **Capability Executor** isolado, seguindo o padrao JA estabelecido pelos conectores Google (`GmailCapabilityExecutor`, `GoogleDriveCapabilityExecutor`, `GoogleCalendarCapabilityExecutor`).

### Por que NAO replicar a arquitetura 5-camadas do WhatsApp

O WhatsApp precisou de 5 camadas (Capability / Provider / Event / Observation / Watch) porque **um mesmo servico logico tinha 3 provedores concorrentes** (Meta oficial, Evolution, Baileys). A camada de Provider abstrai QUAL backend usar.

O Microsoft Graph nao tem esse caso — e a unica API oficial. Criar `MicrosoftProviderRegistry` com um unico `GraphProvider` seria **indirecao sem beneficio** (decisao preferida do projeto: nao inflar arquitetura especulativa).

---

## Arquitetura Proposta (Caminho 2 — Capability Executors)

```
MicrosoftGraphConnector.ts (shell fino)
  ├── metadata() / health() / validate() / initialize() / shutdown()  (inalterados)
  └── execute(operation, payload, ctx)
        └── switch(operation)  →  delega ao Capability Executor do servico
              ├── OutlookMailCapability.execute(op, payload, token)      [existente — extrair]
              ├── OutlookCalendarCapability.execute(op, payload, token)  [existente — extrair]
              ├── OneDriveCapability.execute(op, payload, token)         [existente — extrair]
              ├── ContactsCapability.execute(op, payload, token)         [NOVO]
              ├── ToDoCapability.execute(op, payload, token)             [NOVO]
              ├── OneNoteCapability.execute(op, payload, token)          [NOVO]
              ├── TeamsCapability.execute(op, payload, token)           [NOVO]
              ├── SharePointCapability.execute(op, payload, token)       [NOVO]
              ├── ExcelOnlineCapability.execute(op, payload, token)      [NOVO]
              ├── WordOnlineCapability.execute(op, payload, token)       [NOVO]
              └── PowerPointOnlineCapability.execute(op, payload, token) [NOVO]
```

**Shell fino do conector** mantem apenas:
- Token (ensureValidToken / getAccessToken)
- Health / metadata / capabilities list
- Roteamento `operation → capabilityExecutor`
- Log de execucao (duracao, status, errors)

**Cada Capability Executor** e um arquivo isolado responsavel por:
- Os `case` especificos do seu servico (ex.: `mail.list`, `mail.search`, `mail.read`, `mail.send`)
- A chamada direta ao endpoint Graph correspondente
- Validacao de parametros do seu dominio
- Retorno tipado `ConnectorResult`

---

## Estrutura de Arquivos

```
src/lib/connector-runtime/connectors/
  MicrosoftGraphConnector.ts                    # shell fino (edicao)
  microsoft/
    OutlookMailCapability.ts                     # extrair do switch atual
    OutlookCalendarCapability.ts                 # extrair do switch atual
    OneDriveCapability.ts                        # extrair do switch atual
    ContactsCapability.ts                        # NOVO
    ToDoCapability.ts                            # NOVO
    OneNoteCapability.ts                         # NOVO
    TeamsCapability.ts                           # NOVO
    SharePointCapability.ts                      # NOVO
    ExcelOnlineCapability.ts                     # NOVO
    WordOnlineCapability.ts                      # NOVO
    PowerPointOnlineCapability.ts                # NOVO
    MicrosoftGraphHelper.ts                      # graphFetch + ok/fail helpers (extrair)
    MicrosoftCapabilityRegistry.ts               # mapa operation → executor (NOVO)
```

---

## Mapeamento de Capacidades por Servico

### Ja existentes (extrair do switch atual, sem mudar comportamento)

| Servico | Capacidades | Endpoint Graph |
|---|---|---|
| Outlook Mail | `mail.list`, `mail.search`, `mail.read`, `mail.send` | `/me/messages` |
| Calendar | `calendar.list`, `calendar.create` | `/me/events` |
| OneDrive | `files.list`, `files.download` | `/me/drive` |

### Novos (7 servicos)

| Servico | Capacidades propostas | Endpoint Graph | Escopo OAuth |
|---|---|---|---|
| Contacts | `contacts.list`, `contacts.create`, `contacts.search` | `/me/contacts` | `Contacts.ReadWrite` |
| To Do | `todo.listLists`, `todo.listTasks`, `todo.createTask`, `todo.completeTask` | `/me/todo/lists`, `/me/todo/lists/{id}/tasks` | `Tasks.ReadWrite` |
| OneNote | `onenote.listSections`, `onenote.listPages`, `onenote.createPage` | `/me/onenote/sections`, `/me/onenote/pages` | `Notes.ReadWrite` |
| Teams | `teams.listChats`, `teams.listMessages`, `teams.sendMessage` | `/me/chats`, `/chats/{id}/messages` | `Chat.Read`, `ChatMessage.Send` |
| SharePoint | `sites.list`, `sites.listFiles`, `sites.getFile` | `/sites`, `/sites/{id}/drive` | `Sites.ReadWrite.All` |
| Excel Online | `excel.getRange`, `excel.updateRange`, `excel.listWorksheets` | `/me/drive/items/{id}/workbook` | `Files.ReadWrite` |
| Word Online | `word.getText`, `word.listFiles` | `/me/drive/items/{id}/content` | `Files.ReadWrite` |
| PowerPoint Online | `ppt.listSlides`, `ppt.getFile` | `/me/drive/items/{id}/content` | `Files.ReadWrite` |

---

## Caveat Critico — Excel/Word/PowerPoint "Online"

O Microsoft Graph da **acesso a arquivo + leitura/criacao de conteudo programatico**, mas NAO e edicao colaborativa estilo Office Online. As capacidades realistas sao **operacoes programaticas** sobre o arquivo:
- `excel.getRange` / `excel.updateRange` — le/escree celulas via API do workbook
- `word.getText` — extrai texto do .docx
- `ppt.listSlides` — lista slides do .pptx

Nao ha editor web embutido. Esse limite e da propria API Microsoft, nao da arquitetura escolhida.

---

## Escopos OAuth a Adicionar

O `WORKSPACE_SCOPES` em `MicrosoftAuthSession.js` atualmente cobre Mail/Calendar/Files. Expansao necessaria:

```javascript
export const WORKSPACE_SCOPES = [
  // existentes
  "openid", "profile", "email", "offline_access",
  "https://graph.microsoft.com/User.Read",
  "https://graph.microsoft.com/Mail.Read",
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/Calendars.ReadWrite",
  "https://graph.microsoft.com/Files.Read.All",
  // NOVOS — expansao 7 servicos
  "https://graph.microsoft.com/Contacts.ReadWrite",
  "https://graph.microsoft.com/Tasks.ReadWrite",
  "https://graph.microsoft.com/Notes.ReadWrite",
  "https://graph.microsoft.com/Chat.Read",
  "https://graph.microsoft.com/ChatMessage.Send",
  "https://graph.microsoft.com/Sites.ReadWrite.All",
  "https://graph.microsoft.com/Files.ReadWrite",
];
```

**Observacao:** alguns escopos (Chat, SharePoint) exigem consentimento de administrador no tenant Azure. Usuarios pessoais (@outlook.com) podem nao ter acesso a Teams/SharePoint. Documentar essa limitacao na UI de Connections.

---

## Relacao com Camadas Existentes

| Camada | Status para Microsoft | Acao necessaria |
|---|---|---|
| Capability Layer | JA existente no `GoalCapabilityRegistry` (pattern Gmail/Drive/Calendar) | Adicionar mappings `contacts.*`, `todo.*`, `onenote.*`, `teams.*`, `sites.*`, `excel.*`, `word.*`, `ppt.*` |
| Provider Layer | N/A — Graph e unico provedor | Nenhuma (nao replicar padrao WhatsApp) |
| Event Layer | JA coberta — `UCRBridge` emite eventos para qualquer conector | Nenhuma |
| Observation Layer | JA coberta — `PipelineObservationBridge` commita resultados de qualquer conector | Nenhuma |
| Watch Layer (opcional) | Nao implementada para Microsoft | Fase futura: `MicrosoftWatchProvider` se houver demanda de monitoramento proativo (email novo, mensagem de Teams) |

---

## Regras de Implementacao

1. **Extracao primeiro, expansao depois** — os 8 cases existentes sao movidos para `OutlookMailCapability`, `OutlookCalendarCapability`, `OneDriveCapability` SEM mudar comportamento. Build verde, teste de paridade, so entao adicionar os 7 novos.
2. **Shell fino obrigatorio** — `MicrosoftGraphConnector.execute()` nao contem logica de servico, so roteamento `operation → executor`.
3. **Cada executor e testavel isoladamente** — recebe `(operation, payload, accessToken)` e retorna `ConnectorResult`, sem dependencia de estado.
4. **Helper compartilhado** — `MicrosoftGraphHelper.ts` contem `graphFetch()`, `ok()`, `fail()`, `makeLog()` extraidos do conector atual, importados por todos os executors.
5. **Registro centralizado** — `MicrosoftCapabilityRegistry.ts` e um mapa `operation → executor` que o shell consulta. Adicionar um servico novo = adicionar uma entrada no mapa + um arquivo de executor.
6. **Escopos incrementais** — usuario que ja autorizou os escopos antigos nao e forcado a re-autorizar. Escopos novos sao solicitados on-demand no primeiro `execute()` que precisar (mensagens de erro claras指向 /connections).

---

## Fases de Implementacao

- **Fase 0 — Extracao (refator, zero comportamento novo):** Mover 8 cases existentes para 3 executors + extrair helper. Build verde, teste de paridade (mesmas 8 capacidades funcionando).
- **Fase 1 — Registry:** Criar `MicrosoftCapabilityRegistry.ts` + atualizar shell para delegar via mapa. Build verde.
- **Fase 2 — Contacts + To Do:** 2 executors novos + escopos OAuth + mappings no GoalCapabilityRegistry. Validar via chat ("listar meus contatos", "criar tarefa X no To Do").
- **Fase 3 — OneNote + Teams + SharePoint:** 3 executors novos + escopos. Caveat: Teams/SharePoint exigem tenant corporativo.
- **Fase 4 — Excel/Word/PowerPoint Online:** 3 executors novos. Documentar limite de "operacao programatica, nao editor web".
- **Fase 5 (opcional) — Watch Provider:** `MicrosoftWatchProvider` se houver demanda de monitoramento proativo de email/Teams.

Cada fase e **aditiva e reversivel** — nenhuma quebra o conector existente.

---

## Criterios de Aceitacao

- [ ] Os 8 cases existentes continuam funcionando apos extracao (paridade total)
- [ ] `MicrosoftGraphConnector.execute()` tem apenas roteamento, sem logica de servico
- [ ] Cada um dos 7 novos servicos tem seu proprio arquivo de executor isolado
- [ ] `MicrosoftCapabilityRegistry` mapeia todas as operations aos executors
- [ ] `GoalCapabilityRegistry` tem mappings para `contacts.*`, `todo.*`, `onenote.*`, `teams.*`, `sites.*`, `excel.*`, `word.*`, `ppt.*`
- [ ] `WORKSPACE_SCOPES` em `MicrosoftAuthSession.js` inclui os 7 novos escopos
- [ ] UI de Connections documenta que Teams/SharePoint exigem tenant corporativo
- [ ] Build verde apos cada fase
- [ ] Chat consegue resolver e executar goals dos 11 servicos (com escopos autorizados)

---

## Riscos e Mitigacoes

| Risco | Mitigacao |
|---|---|
| Extracao dos 8 cases quebra comportamento existente | Fase 0 e puramente mecanica; teste de paridade antes de avancar |
| Escopos novos exigem re-consentimento de usuarios existentes | Escopos solicitados on-demand, nao no boot; mensagem clara |
| Teams/SharePoint indisponiveis para contas pessoais (@outlook.com) | Documentar na UI; executor retorna erro gracioso "requer tenant corporativo" |
| Excel/Word/PPT "Online" confundido com editor web | Documentar explicitamente: operacoes programaticas sobre arquivo, nao edicao colaborativa |
| Arquivo monolitico volta a crescer se novos servicos forem adicionados ao switch | Obrigar via code review: servico novo = arquivo novo + entrada no registry, nunca case no shell |

---

## Referencias

- `ADR-005` — Connector Registry Consolidation
- `ADR-012` — Watch Engine (padrao de camadas, referencia de decisao Provider vs Connector)
- `RFC-005` — Watch Engine (metodo de verificacao antes de codar)
- `MCF-MemoryOS-Connector-Framework.md` — Connector Framework oficial
- `src/lib/connector-runtime/connectors/MicrosoftGraphConnector.ts` — conector atual
- `src/lib/microsoft-auth/MicrosoftAuthSession.js` — sessao OAuth atual
- `src/lib/google-drive/GoogleDriveCapabilityExecutor.ts` — padrao de Capability Executor a espelhar

---

*RFC-006 — Microsoft Graph Connector Expansion — 2026-08-03 — Proposed*