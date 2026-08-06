# RFC-011 — Travelport TripServices GDS Flight Connector

**Status:** Draft (aguardando início da Fase GDS-01)
**ADR relacionada:** ADR-018
**Sprints:** GDS-00 a GDS-08
**Data:** 2026-08-06
**Autor:** MemoryOS Engineering

---

## Contexto

O usuário recebeu credenciais de trial (pré-produção) da **Travelport TripServices JSON API** — a API REST moderna do GDS Galileo (não confundir com Galileo XML/SOAP legado nem com a Universal API antiga). Essa API cobre Flights (Air), Stays (Hotel) e Pay, com OAuth 2.0 two-legged (grant `password`).

Já existe no repositório uma base construída para a **Travellink Web API (Wooba)** — outro provedor de aéreo (consolidadora brasileira), com criptografia RSA-PKCS1, ainda sem credenciais do usuário (pendente desde 2026-07-30). O usuário confirmou explicitamente que quer os **dois conectores simultâneos**: Travelport para voos internacionais (GDS Galileo, cobertura global), Travellink para o mercado doméstico/consolidador brasileiro. Isso não é "qual API escolher" — é o mesmo padrão já resolvido para o WhatsApp (ADR de origem do padrão Provider): **múltiplos backends concorrentes para a mesma capability de domínio**.

### Escopo funcional aprovado pelo usuário

Pacote completo, incremental: **Shopping (busca) → Pricing (precificação) → Booking (reserva/PNR) → Ticketing (emissão) → Exchange (reemissão)**, adicionando o máximo de capabilities possível ao longo do tempo.

### Credenciais recebidas (trial, pré-produção)

| Campo | Valor / Observação |
|---|---|
| Ambiente | Pré-produção (`.pp.` nos endpoints) — **não usar dados sensíveis reais** |
| Username | `TP66208284` |
| Password | fornecida no email |
| Client ID | `2C9uuTkO7EC96maT3ewQLANt6tag6knC` |
| Client Secret | fornecido no email — **parece truncado (3 caracteres), confirmar no MyTravelport antes de cadastrar** |
| PCC | `6LG7_1G` |
| Access Group | `54623514-9FE3-4429-A34A-5EFCE0AFD236` |
| Região | LATAM: Argentina |
| Moeda | ARS |
| GDS Carriers | AA AM AR AV CM IB LA UA UX G3 1G |
| NDC Carriers | AA UA QF SQ |

Todas as credenciais serão cadastradas pelo **próprio usuário** em Base44 Settings > Environment Variables — o MemoryOS/Claude nunca manipula password/client_secret diretamente (mesma política já usada para `WHATSAPP_ACCESS_TOKEN`/`GITHUB_WEBHOOK_SECRET`).

**Nomes de secret propostos:**
```
TRAVELPORT_USERNAME
TRAVELPORT_PASSWORD
TRAVELPORT_CLIENT_ID
TRAVELPORT_CLIENT_SECRET
TRAVELPORT_PCC
TRAVELPORT_ACCESS_GROUP
TRAVELPORT_ENV        # "pp" (pré-produção) | "prod" — default "pp"
```

### Autenticação (confirmada via developer.travelport.com / support.travelport.com)

```
POST https://auth.pp.travelport.net/oauth/token   (pré-produção)
POST https://auth.travelport.net/oauth/token      (produção)

Body (form): grant_type=password, username, password, client_id, client_secret
→ access_token, válido 24h (86.400s)
```

Regras críticas da própria doc Travelport:
- **Cachear e reusar o token até expirar** — não gerar um novo por chamada.
- Rate limit: 50 requisições de token/segundo por IP.
- PCC e Access Group identificam o ponto de venda; forma exata de envio (header vs corpo) varia por endpoint — **confirmar na referência de cada API ao implementar** (Air Shopping primeiro).

**Base paths (pré-produção):**
```
Air:   https://api.pp.travelport.net/11/air/
Hotel: https://api.pp.travelport.net/12/hotel/
Pay:   https://api.pp.travelport.net/11/payment/
```

---

## Decisão Arquitetural

### 1. Backend: proxy genérico (mesmo padrão do `microsoftGraphProxy`)

`base44/functions/travelportProxy/entry.ts` — função Deno única que:
- Gerencia o ciclo de vida do token OAuth (fetch, cache em memória do processo com expiry, refresh transparente quando `< 24h` restantes — **nunca por request**).
- Recebe `{ path, method, body }` do frontend e repassa para o base path correto (Air/Hotel/Pay), injetando `Authorization: Bearer <token>` + headers de PCC/Access Group.
- Não expõe client_secret/password ao frontend em nenhuma circunstância — vivem só nos secrets do backend.

Isso evita replicar a lógica de auth em cada Capability Executor (mesmo motivo do `MicrosoftGraphHelper.graphFetch`).

### 2. Capability Layer: Executors isolados (mesmo padrão ADR-013 do Microsoft Graph)

`src/lib/connector-runtime/connectors/travelport/`:
- `TravelportHelper.ts` — `travelportFetch()`, `ok`/`fail`, constantes de base path.
- `TravelportCapabilityTypes.ts` — interface `TravelportCapability` (id, operations, execute).
- `TravelportCapabilityRegistry.ts` — mapa `operation -> executor`.
- `AirShoppingCapability.ts` — `travelport.air.search` (Shopping/Availability).
- `AirPricingCapability.ts` — `travelport.air.price` (Pricing sobre um shopping result).
- `AirBookingCapability.ts` — `travelport.air.book` (cria PNR/Booking a partir de um priced offer).
- `AirTicketingCapability.ts` — `travelport.air.ticket` (emissão sobre um booking existente).
- `AirExchangeCapability.ts` — `travelport.air.reissue` (reemissão/exchange sobre bilhete já emitido).

### 3. Domain Provider Layer: `FlightProviderRegistry` (NOVO — espelha WhatsApp, não Microsoft)

Diferente do Microsoft Graph (onde os providers eram *estratégias de acesso à mesma API*), aqui temos **APIs concorrentes de verdade** para o mesmo domínio de negócio — exatamente o caso que motivou o padrão original do WhatsApp. Cria-se uma camada de domínio acima dos dois conectores:

```
src/lib/flight/
  FlightProviderTypes.ts       # interface FlightProvider (id, displayName, capabilities, isAvailable, execute)
  FlightProviderRegistry.ts    # singleton HMR-safe, registra os providers no load
  providers/
    TravelportProvider.ts      # delega para TravelportConnector (GDS Galileo, cobertura internacional)
    TravellinkProvider.ts      # delega para o conector Travellink/Wooba já existente (quando credenciado)
```

O Planner continua conhecendo apenas Goals (`flight.search`, `flight.price`, `flight.book`, `flight.ticket`, `flight.reissue`) — nunca sabe se a chamada foi para Travelport ou Travellink. `GoalCapabilityRegistry` mapeia os goals para um **connector lógico único** `"flight-gds"`, cujo shell (`FlightConnector.ts`) delega ao `FlightProviderRegistry` (mesmo padrão do `MicrosoftGraphConnector` delegando ao `MicrosoftProviderRegistry`, mas aqui a política de seleção é por **cobertura de rota/carrier**, não por `workspaceId`).

**Política de seleção inicial (simples, evolui depois):** se a busca cobre uma companhia da lista `GDS Carriers`/`NDC Carriers` do Travelport ou é rota internacional → Travelport. Caso contrário / se Travelport não cobrir → tenta Travellink. Ambos podem rodar em paralelo para `flight.search` (agregação de resultados) quando fizer sentido — decisão de UX a refinar na Fase GDS-08.

### 4. Reversibilidade (ADR-015 / Execution Intelligence)

| Capability | Reversibility | Justificativa |
|---|---|---|
| `flight.search` | `safe` | Só leitura. |
| `flight.price` | `safe` | Cotação, sem efeito no mundo real. |
| `flight.book` | `reversible` | PNR pode ser cancelado antes da emissão (dentro da janela de garantia). |
| `flight.ticket` | `irreversible` | Bilhete emitido não pode ser "desemitido" — só reembolso/reemissão, com custo financeiro real. |
| `flight.reissue` | `irreversible` | Reemissão altera bilhete já emitido, geralmente com multa/diferença tarifária — efeito financeiro real. |

**Isto é significativo:** é o primeiro caso concreto e com credenciais reais onde o Safety Gate (EI-03, ADR-015) tem trabalho de verdade a fazer em produção. As sessões anteriores de Execution Intelligence (EI-04 a EI-07) documentaram explicitamente que a migração do primeiro caller irreversível ficou **deferida por falta de um caso real** ("MemoryOS não tem irreversível urgente em produção — Travellink/passagens pendente de credenciais"). Isso deixou de ser verdade. `flight.ticket` e `flight.reissue` são candidatos naturais para a primeira migração de caller irreversível via `runtime.processCapability()`, com `confirmedByUser` vindo de uma confirmação explícita do usuário no chat antes da emissão.

---

## Fases de Implementação (aditivas, reversíveis)

- **GDS-00 (esta sessão):** Documentação — RFC-011 + ADR-018. Zero código.
- **GDS-01:** `travelportProxy` (backend) — auth + token cache + passthrough genérico. Testável isoladamente com uma chamada de diagnóstico (ex. metadata endpoint), sem nenhuma capability ainda amarrada.
- **GDS-02:** Tipos + `TravelportCapabilityRegistry` (scaffold, zero comportamento) + `TravelportConnector.ts` (shell) registrado no `ConnectorBootstrap`, capability `travelport.air.search` ainda não implementada de fato (stub).
- **GDS-03:** `AirShoppingCapability` real (`flight.search`) — primeira capability funcional, `safe`.
- **GDS-04:** `AirPricingCapability` (`flight.price`) — `safe`.
- **GDS-05:** `AirBookingCapability` (`flight.book`) — `reversible`.
- **GDS-06:** `AirTicketingCapability` (`flight.ticket`) — `irreversible`. Primeiro caller migrado de verdade para `runtime.processCapability()` com fluxo de confirmação no chat.
- **GDS-07:** `AirExchangeCapability` (`flight.reissue`) — `irreversible`.
- **GDS-08:** `FlightProviderRegistry` — abstrai Travelport (ativo) e Travellink (quando credenciado) atrás do mesmo `FlightConnector` lógico. Política de seleção por cobertura de carrier/rota.
- **GDS-09 (opcional, futuro):** Stays (Hotel) e Pay APIs do Travelport, mesmo padrão de Capability Executors.

Cada fase aguarda autorização explícita antes de codar, seguindo a metodologia já estabelecida no projeto (build verde entre fases, nenhuma árvore paralela, nenhum código morto).

---

## Não-Quebra

- Nenhum conector existente é tocado até GDS-08 (Travellink permanece exatamente como está, aguardando suas próprias credenciais).
- `GoalCapabilityRegistry`, `UCRBridge`, `PipelineObservationBridge`, `ConnectorBootstrap` — extensões aditivas apenas (novos mappings/registros), nenhuma edição de lógica existente.
- Cadeia ADR-015 (Execution Intelligence) não é modificada — `flight.ticket`/`flight.reissue` apenas se tornam o primeiro *caller* real, dentro do mecanismo já construído (EI-01 a EI-07).

## Não Feito Ainda

- Nenhum código TypeScript criado (esta é a fase de documentação, GDS-00).
- Nenhum secret cadastrado (o usuário cadastra por conta própria).
- Formato exato de envio do PCC/Access Group por endpoint — confirmar na API Reference do Air Shopping ao iniciar GDS-01/02.
