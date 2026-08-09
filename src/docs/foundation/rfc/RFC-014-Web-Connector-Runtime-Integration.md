# RFC-014 — Web Connector: Integração ao Runtime e Plano de Escala (Frente C)

**Status:** Draft
**ADR relacionada:** ADR-019
**RFCs dependentes:** RFC-012 (sessão), RFC-013 (capabilities — pode operar com cadastro manual se RFC-013 pausar)
**Sprints:** WEB-CONN-04 (esqueleto do connector), WEB-CONN-05 (integração final)
**Data:** 2026-08-09
**Autores:** Anderson (arquitetura), MemoryOS Engineering (Claude)

---

## Contexto

Esta é a frente que une as anteriores ao SDK de Conectores já existente e congelado (`BaseConnector`, `ConnectorBuilder`, `ConnectorRuntime`, `RuntimeEventBus` — EF-31C, v1.0.0), no mesmo padrão que `GitHubConnector` (EF-33A) e `Base44Connector` (EF-32) já seguem, certificados e testados.

Diferente desses dois, o `WebConnector` é **genérico**: uma única implementação, reutilizada por qualquer site cujo `CapabilityMap` exista (RFC-013) — exatamente como no diagrama de Anderson: 1 connector, N sessões, N empresas.

---

## Escopo funcional

### `WebConnector.ts`

```
src/sdk/connectors/web/WebConnector.ts       — extends BaseConnector
src/sdk/connectors/web/WebConnectorManifest.ts — via ConnectorBuilder
src/sdk/connectors/web/WebStore.ts            — store simulado para testes (padrão GitHubStore.ts)
src/sdk/connectors/web/ef34Tests.ts           — suíte de teste (padrão ef32Tests.ts / ef33aTests.ts)
```

`onExecute()` recebe uma ação (`IConnectorAction`) cujo `capability_id` é resolvido contra o `CapabilityMap` da `WebSession` alvo, e despachado como chamada Playwright MCP via `mcpClientCall` — mesma mecânica de infraestrutura de RFC-012, sem reimplementar nada novo aqui.

### Fila de execução: reaproveitar o Outbox existente, não criar um novo

O MemoryOS já tem um padrão de Outbox durável em produção: entidade `PendingWatchAction`, processado por `WatchOutbox.ts` com retry e TTL de 24h (ADR-012, RFC-005). Ações do Web Connector passam por esse mesmo mecanismo — ou por uma entidade irmã com o mesmo formato (`PendingWebConnectorAction`), se isolar filas por domínio for preferível para não competir com o Watch Engine. **Decisão a confirmar com Anderson antes da implementação** — ambas as opções reaproveitam o padrão já validado, nenhuma exige construir fila do zero.

---

## Critério de não-regressão (obrigatório antes de marcar esta frente como concluída)

Registrar `WebConnector` no `ConnectorRuntime` é a única operação desta frente inteira que toca código compartilhado (`registerConnector`, por design aditivo do SDK — não remove nem modifica os registros existentes). Depois do registro:

- [ ] `GitHubConnector` continua respondendo normalmente (rodar `ef33aTests.ts`)
- [ ] `Base44Connector` continua respondendo normalmente (rodar `ef32Tests.ts`)
- [ ] `bugHunterRun` e `BugHunterConsole` continuam funcionando sem alteração de comportamento
- [ ] `ef34Tests.ts` (novo, do `WebConnector`) passa isoladamente antes do registro

---

## Plano de escala (mesmo código, sem reescrever)

### Fase 1 — MVP (este RFC): dezenas de usuários
1 instância `playwright-web-connector` (RFC-012), fila via Outbox existente, `WebConnector` único registrado no runtime.

### Fase 2 — Produção: centenas a milhares de usuários
- Escalar horizontalmente: mais instâncias Playwright na VPS (ou VPS adicional), cada uma um novo `MCPServerConfig`.
- `WebConnector` ganha lógica simples de dispatch (menos ocupado / round-robin) entre servers saudáveis — `health()` de cada conector já existe de graça via `BaseConnector`.
- Profundidade da fila (`status=pending` na entidade de outbox) vira o sinal objetivo de "precisa de mais workers".
- **Zero mudança no código do `WebConnector`** — só mais registros de `MCPServerConfig` e o dispatcher lendo a lista.

### Fase 3 — Enterprise: dezenas de milhares a milhões de usuários
- Pool de workers Playwright migra para infraestrutura dedicada orquestrada (Kubernetes ou equivalente), fora do Base44 — troca de configuração, não de arquitetura, porque o Base44 nunca rodou os browsers diretamente, sempre falou com eles via MCP.
- Autoscaling do pool baseado na métrica de profundidade de fila que já existe desde a Fase 1.
- Multi-região se necessário: workers replicados, dispatch pelo mais próximo/saudável.

---

## Riscos

| Risco | Mitigação |
|---|---|
| Registro do connector quebra algo nos dois connectors existentes | Critério de não-regressão acima é bloqueante — não avança sem os 3 testes passando |
| Fila compartilhada com Watch Engine gera contenção sob carga | Decisão de isolar (`PendingWebConnectorAction` própria) documentada como opção; escolher com base em volume real, não preventivamente |
| `CapabilityMap` desatualiza quando o site muda de interface | `version` no schema de `CapabilityMap` (RFC-013); reexecutar descoberta quando execuções começam a falhar de forma consistente para um site |

---

## Fora de escopo

- Extensão Chrome (Frente D) — RFC futuro, pós-validação com site real
- Autoscaling automático de fato (Fase 3) — esta RFC documenta o caminho, não implementa Kubernetes agora

---

## Sequenciamento de sprints (visão consolidada RFC-012/013/014)

5 sprints até o Web Connector funcionar ponta a ponta com 1 site real. Extensão Chrome e Fases 2/3 de escala ficam para depois — não bloqueiam esta sequência.

| Sprint | Entrega | Depende de | Risco |
|---|---|---|---|
| **0** | Fundação: entidade `WebSession` + novo `MCPServerConfig` (`playwright-web-connector`) | nada | baixo |
| **1** (WEB-CONN-01) | Captura de sessão: função `webConnectorConnect`, página "conectar novo sistema", cookies salvos e reutilizáveis | Sprint 0 | baixo — mecânico |
| **2** (WEB-CONN-04, parcial) | Esqueleto do `WebConnector.ts` no padrão `BaseConnector`, ações básicas (`navigate`/`snapshot`) sobre uma `WebSession` existente, `ef34Tests.ts` | Sprint 1 | baixo |
| **3** (WEB-CONN-02) | Spike de descoberta de capabilities — motor LLM+Playwright cataloga operações num site de teste | Sprint 1 | **alto** — gate GO/NO-GO próprio (RFC-013) |
| **4** (WEB-CONN-05) | Integração final: registro do `WebConnector` no `ConnectorRuntime`, fila via Outbox, testes de não-regressão | Sprints 2 e 3* | médio |

\* Se o Sprint 3 não passar no critério de sucesso do spike (RFC-013), o Sprint 4 não trava — capabilities entram cadastradas manualmente como fallback, e a integração segue normalmente.

**Resultado ao fim do Sprint 4:** Web Connector registrado e funcional, conectando 1 site real por sessão capturada (sem senha armazenada), executando ações via fila durável, sem regressão em `GitHubConnector`/`Base44Connector`/Bug Hunter.

---

*RFC-014 — Web Connector: Integração ao Runtime e Escala — 2026-08-09 — Draft*
