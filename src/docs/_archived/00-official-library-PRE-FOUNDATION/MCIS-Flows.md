# MCIS-Flows — Fluxos Completos, UML, Diagramas e Exemplos

**Versão:** 1.0  
**Status:** Oficial  
**Parte:** 4 de 4 do MCIS

---

## 1. Diagramas de Estado — ConnectorIntelligence Lifecycle

```
┌────────────────────────────────────────────────────────────────────┐
│          ESTADOS DA INTELIGÊNCIA DO CONNECTOR                      │
└────────────────────────────────────────────────────────────────────┘

              instalação
ABSENT ─────────────────────► REGISTERING
                                    │
                         describe() + validate()
                                    │
                         ┌──────────┴──────────┐
                         │                     │
                   VALID ▼               INVALID ▼
              ┌──────────────┐        ┌──────────────┐
              │   INDEXED    │        │   REJECTED   │
              │ (em todos os │        │              │
              │  Registries) │        └──────────────┘
              └──────┬───────┘
                     │
            disponível para seleção
                     │
              ┌──────▼───────┐
              │   ACTIVE     │◄──── hot update (minor/patch)
              │              │
              └──────┬───────┘
              ┌──────┴───────────────────────┐
              │                              │
        hot remove                    major update
              │                              │
       ┌──────▼───────┐           ┌──────────▼────────┐
       │  UNREGISTERED│           │  MIGRATING        │
       │              │           │  (v1 + v2 ativos) │
       └──────────────┘           └──────────┬────────┘
                                             │ migration complete
                                     ┌───────▼───────┐
                                     │   ACTIVE (v2) │
                                     └───────────────┘
```

---

## 2. Diagrama de Sequência — Auto Registration Completo

```
┌──────────┐  ┌────────────┐  ┌──────────────┐  ┌─────────────┐  ┌──────────┐
│Connector │  │   MCIS     │  │  Capability  │  │  Capability │  │   Core   │
│ (new)    │  │  Registry  │  │   Registry   │  │    Graph    │  │ Planner  │
└────┬─────┘  └─────┬──────┘  └──────┬───────┘  └──────┬──────┘  └────┬─────┘
     │               │               │                  │               │
     │ initialize()  │               │                  │               │
     │───────────────►               │                  │               │
     │               │               │                  │               │
     │ describe()    │               │                  │               │
     │◄──────────────│               │                  │               │
     │               │               │                  │               │
     │SelfDescription│               │                  │               │
     │──────────────►│               │                  │               │
     │               │ validate()    │                  │               │
     │               │               │                  │               │
     │               │ register(caps)│                  │               │
     │               │──────────────►│                  │               │
     │               │               │                  │               │
     │               │ register(entities, actions...)   │               │
     │               │ [parallel to all Registries]     │               │
     │               │               │                  │               │
     │               │ addEdges()    │                  │               │
     │               │──────────────────────────────── ►│               │
     │               │               │                  │               │
     │               │ emit(CONNECTOR_HOT_PLUGGED)       │               │
     │               │──────────────────────────────────────────────── ►│
     │               │               │                  │               │
     │               │               │                  │        ready  │
     │               │               │                  │          ◄────│
```

---

## 3. Diagrama de Sequência — Seleção Inteligente

```
┌──────────┐  ┌──────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────┐
│   Core   │  │ Connector│  │    MCIS      │  │  Policy    │  │ Gmail /  │
│  Planner │  │  Manager │  │  Selection   │  │  Engine    │  │ Outlook  │
└────┬─────┘  └────┬─────┘  └──────┬───────┘  └─────┬──────┘  └────┬─────┘
     │              │               │                 │               │
     │ goal: "send  │               │                 │               │
     │  email João" │               │                 │               │
     │─────────────►│               │                 │               │
     │              │ select(goal)  │                 │               │
     │              │──────────────►│                 │               │
     │              │               │ findByVerb(SEND)│               │
     │              │               │ candidates: [Gmail, Outlook]    │
     │              │               │                 │               │
     │              │               │ checkPerms()    │               │
     │              │               │────────────────►│               │
     │              │               │  ✅ Gmail ok   │               │
     │              │               │◄────────────────│               │
     │              │               │                 │               │
     │              │               │ score(Gmail) = 0.87             │
     │              │               │ score(Outlook) = 0.71           │
     │              │               │                 │               │
     │              │ Gmail selected│                 │               │
     │              │◄──────────────│                 │               │
     │              │               │                 │               │
     │              │ execute(req)  │                 │               │
     │              │──────────────────────────────────────────────── ►│
     │              │               │                 │    response   │
     │              │◄──────────────────────────────────────────────── │
     │ result       │               │                 │               │
     │◄─────────────│               │                 │               │
```

---

## 4. Fluxo 1 — Gmail + Google Calendar (IA + Connector Intelligence)

```
Usuário: "Responda o convite de reunião do João confirmando e atualize meu calendário"

MCIS Discovery:
  goal: "responder convite + criar evento"
  Capabilities needed:
    1. READ_EMAIL (parsing de convite) → Gmail
    2. SEND_EMAIL (resposta) → Gmail
    3. CREATE_CALENDAR_EVENT → Google Calendar
  
  Capability Graph path descoberto automaticamente:
    READ_EMAIL.output[invite_data] ──FEEDS──► CREATE_CALENDAR_EVENT.input
    READ_EMAIL.output[reply_to]   ──FEEDS──► SEND_EMAIL.input[to]

FLUXO:
  Step 1: GmailConnector.SEARCH_EMAILS { subject: "convite", from: "joao*" }
          → { emailId, subject, icalData, from, replyTo }
          
  Step 2: [PARALELO]
    2a: GmailConnector.SEND_EMAIL {
          to: email.replyTo,
          body: "Confirmo presença. Att.",
          inReplyTo: email.emailId
        }
    2b: GoogleCalendarConnector.CREATE_EVENT {
          title: icalData.summary,
          start: icalData.dtstart,
          end: icalData.dtend,
          location: icalData.location,
          attendees: icalData.attendees
        }
  
  Memory Updates (propostos automaticamente via OutputContract):
    - FACT: "Reunião com João confirmada em [data]"
    - EVENT: "[data] - Reunião João - [local]"
    
  Resposta ao usuário: "Confirmei presença e adicionei ao seu calendário."
```

---

## 5. Fluxo 2 — Shopify + Bling + Gmail (Workflow Descoberto pelo MCIS)

```
Evento: ShopifyConnector.ORDER_CREATED (webhook INBOUND)

MCIS Workflow Registry encontra automaticamente:
  Workflow: "Processar Pedido Completo"
  Detectado por: padrão de uso (12x na última semana)
  
  Steps (com mapeamento automático de dados via OutputContract.feedsInto):
  
  Step 1: ShopifyConnector.GET_ORDER { orderId: event.orderId }
          output: { order: { id, customer, items, total, shippingAddress } }
  
  Step 2: BlingConnector.CREATE_INVOICE {
            customer: order.customer,        ← auto-mapped
            items: order.items,              ← auto-mapped
            total: order.total               ← auto-mapped
          }
          output: { invoice: { id, pdfUrl, nfeKey } }
  
  Step 3: GmailConnector.SEND_EMAIL {
            to: order.customer.email,        ← auto-mapped
            subject: "Pedido #" + order.id + " confirmado",
            body: "...",
            attachment: invoice.pdfUrl       ← auto-mapped
          }
  
  Step 4: ShopifyConnector.UPDATE_ORDER_STATUS {
            orderId: order.id,
            status: "invoiced",
            nfeKey: invoice.nfeKey           ← auto-mapped
          }
  
  Execução: Steps 2, 3 em paralelo (CapabilityGraph.canRunInParallel = true)
  Estimativa: 4.1 segundos | Workflow automático: SIM
```

---

## 6. Fluxo 3 — Mercado Livre + Bling + TOTVS (Empresarial E-commerce)

```
Usuário: "Sincronize os pedidos de hoje do Mercado Livre com o ERP"

MCIS Selection:
  COMMERCE.ECOMMERCE.MARKETPLACE → MercadoLivreConnector
  COMMERCE.FINANCIAL.ERP_FINANCIAL → BlingConnector  
  ENTERPRISE.ERP → TOTVSConnector

MCIS Dependency Resolution:
  TOTVSConnector requires: BlingConnector (para NF-e)
  → Verificado: BlingConnector HEALTHY ✅

FLUXO:
  Step 1: MercadoLivreConnector.LIST_ORDERS {
            dateFrom: today_start,
            dateTo: today_end,
            status: "paid"
          }
          output: { orders: [{ id, buyer, items, total }] }
  
  Step 2: [BATCH paralelo para cada pedido]
          BlingConnector.CREATE_INVOICE { ...order_data } → invoice
          
  Step 3: [BATCH paralelo para cada pedido]
          TOTVSConnector.CREATE_ORDER {
            mlOrderId: order.id,
            invoice: invoice,
            items: order.items    ← mapeamento automático ML → TOTVS schema
          }
  
  Memory Update: "37 pedidos ML sincronizados com TOTVS (2026-07-08)"
  
  Sugestão gerada pelo MCIS:
    "Este workflow ocorreu 18 vezes. Deseja automatizar diariamente às 23h?"
```

---

## 7. Fluxo 4 — Sabre + Amadeus + Galileo (Multi-GDS Travel)

```
Usuário: "Pesquise a melhor passagem GRU→LHR para 10 pessoas, executivo, agosto"

MCIS Multi-Connector Selection:
  TRAVEL.GDS → [SabreConnector, AmadeusConnector, GalileoConnector]
  
  Strategy: PARALLEL_ALL (buscar nos 3 simultaneamente)
  Aggregation: MERGE + DEDUPLICATE + RANK_BY_PRICE
  
  Capability Graph:
    SEARCH_FLIGHTS (Sabre)  ──EQUIVALENT──► SEARCH_FLIGHTS (Amadeus)
    SEARCH_FLIGHTS (Sabre)  ──EQUIVALENT──► SEARCH_FLIGHTS (Galileo)

FLUXO PARALELO:
  ┌─────────────────────────────────────────────────────────┐
  │ [PARALELO — timeout grupo: 15s]                         │
  ├─────────────────────────────────────────────────────────┤
  │ SabreConnector.SEARCH_FLIGHTS {                         │
  │   origin: "GRU", destination: "LHR",                   │
  │   date: "2026-08-*", passengers: 10,                    │
  │   cabin: "BUSINESS"                                     │
  │ }                                                       │
  │                                                         │
  │ AmadeusConnector.SEARCH_FLIGHTS { ...same params }      │
  │                                                         │
  │ GalileoConnector.SEARCH_FLIGHTS { ...same params }      │
  └─────────────────────────────────────────────────────────┘
         │
         ▼
  MCIS Aggregator:
    - Normaliza para schema comum (OutputContract de cada GDS)
    - Remove duplicatas (mesmo voo, múltiplos GDS)
    - Rankeia por: preço, conexões, tempo de voo
    - Marca disponibilidade em tempo real
    
  Resultado: Lista unificada + Specialist de Viagem analisa
  Memory Update: "Pesquisa GRU→LHR executivo 10pax agosto 2026"
```

---

## 8. Fluxo 5 — Phantom + LayerZero + Chainlink (Blockchain Intelligence)

```
Usuário: "Faça bridge de 1 ETH para Solana e use no protocolo de yield farming"

MCIS Discovery:
  BLOCKCHAIN.ORACLE    → ChainlinkConnector (preço ETH/SOL)
  BLOCKCHAIN.BRIDGE    → LayerZeroConnector (ETH → Solana)
  BLOCKCHAIN.WALLET    → PhantomConnector (Solana wallet)
  
  Capability Graph path:
    Chainlink.GET_PRICE → informa slippage estimado
    LayerZero.BRIDGE_TOKENS → usa preço para calcular mínimo recebido
    Phantom.CHECK_BALANCE → verifica saldo antes do bridge
    Phantom.CONFIRM_TX → confirma na wallet Solana após bridge

FLUXO:
  Step 1: [PARALELO — verificações]
    1a: ChainlinkConnector.GET_PRICE { pair: "ETH/SOL" }
        → { price: 15.2, timestamp, confidence: 0.99 }
    1b: PhantomConnector.GET_BALANCE { token: "SOL" }
        → { balance: 0.5 SOL } (saldo atual)

  Step 2: [SEGURANÇA — Policy Engine verifica]
    - Valor dentro do limite diário? ✅
    - 2FA confirmado? ✅ (MCF-Security)
    - Slippage aceitável (<1%)? ✅

  Step 3: LayerZeroConnector.BRIDGE_TOKENS {
            fromChain: "ETHEREUM", toChain: "SOLANA",
            token: "ETH", amount: 1.0,
            minReceived: 14.98,  ← calculado do preço Chainlink
            destinationWallet: phantom.publicKey
          }
          → { txHash, estimatedArrival: "~3min" }

  Step 4: [AGUARDAR CONFIRMAÇÃO — polling automático]
    PhantomConnector.GET_TX_STATUS { txHash }
    → CONFIRMED após 3 confirmações

  Step 5: PhantomConnector.CALL_CONTRACT {
            contract: "yield_farming_protocol",
            method: "deposit",
            amount: receivedSOL
          }

  Memory Update: "Bridge 1 ETH → SOL concluído. Depositado em yield farming. tx: 0x..."
```

---

## 9. Fluxo 6 — Zebra + TOTVS (IoT + ERP Industrial)

```
Evento INBOUND: ZebraConnector.ASSET_THRESHOLD_REACHED (estoque crítico)

MCIS Event Registry detecta:
  eventType: "zebra.inventory.threshold_reached"
  canTriggerWorkflows: ["RESTOCK_ORDER_WORKFLOW"]

Workflow automático ativado:
  Step 1: ZebraConnector.GET_INVENTORY_REPORT {
            warehouseId: event.warehouseId,
            belowThreshold: true
          }
          → { items: [{ sku, current, minimum, recommended }] }

  Step 2: TOTVSConnector.CHECK_PENDING_ORDERS {
            skus: items.map(i => i.sku)
          }
          → Filtra items sem pedido em andamento

  Step 3: TOTVSConnector.CREATE_PURCHASE_ORDER {
            supplier: auto-selected via TOTVS supplier registry,
            items: filtered_items.map(i => ({
              sku: i.sku,
              quantity: i.recommended - i.current
            }))
          }

  Step 4: GmailConnector.SEND_EMAIL {
            to: procurement_manager_email,
            subject: "Pedido de reposição automático #XYZ criado",
            body: order_summary
          }

  Tudo disparado automaticamente sem intervenção humana
  via MCIS Workflow Registry + Event Bus
```

---

## 10. Fluxo 7 — Fluxo Financeiro Completo (Bling + Shopify + PagSeguro)

```
Usuário: "Preciso do fluxo de caixa do mês com previsões"

MCIS Selection:
  COMMERCE.FINANCIAL.ERP_FINANCIAL → BlingConnector
  COMMERCE.ECOMMERCE.STOREFRONT    → ShopifyConnector
  COMMERCE.PAYMENT                 → PagSeguroConnector

FLUXO PARALELO:
  [PARALELO]
  1. BlingConnector.GET_CASH_FLOW_REPORT { month: current }
     → { receivables, payables, balance, projections }
  2. ShopifyConnector.GET_REVENUE { month: current }
     → { gmv, orders, refunds, fees }
  3. PagSeguroConnector.GET_TRANSACTIONS { month: current }
     → { received, pending, chargebacks }

CONSOLIDAÇÃO:
  Core + Specialist Financeiro consolida:
    - Total recebido (Bling + PagSeguro)
    - Total pedidos (Shopify)
    - Previsão de recebimentos (Bling payables)
    - Alertas de chargeback (PagSeguro)
    - Projeção do mês (IA baseada em histórico da memória)

MEMÓRIA ATUALIZADA:
  "Fluxo julho/2026: R$125.400 recebido | R$42.100 a receber | R$31.200 a pagar"
```

---

## 11. Fluxo 8 — Fluxo com IA (MCIS + InvokeLLM + Gmail)

```
Usuário: "Analise os últimos 50 e-mails e me dê um resumo das prioridades"

MCIS Discovery:
  READ_EMAIL    → GmailConnector
  SUMMARIZE     → InvokeLLM (Capability interna do MemoryOS)

FLUXO:
  Step 1: GmailConnector.LIST_MESSAGES { limit: 50, unread: true }
          → [{ id, from, subject, snippet, date }]
  
  Step 2: [BATCH paralelo — 10 por vez, max paralelo = 5]
          GmailConnector.READ_EMAIL { messageId: email.id }
          → { body, attachments, thread }
  
  Step 3: InvokeLLM {
            model: "gemini_3_flash",
            prompt: "Analise estes e-mails e classifique por:
                     URGENTE / IMPORTANTE / INFORMATIVO.
                     Para cada categoria liste os top 5 por prioridade.",
            input: emails_full_content
          }
          → { urgent: [...], important: [...], informational: [...] }
  
  MCIS coordena automaticamente:
    - Paginação em batch (evitar rate limit Gmail)
    - Seleção do modelo IA baseada em custo vs. qualidade
    - Auto-mapping: email.body → InvokeLLM.input
    - Memory update com insights gerados

  Resposta: Briefing estruturado de 50 e-mails em ~8 segundos
```

---

## 12. Fluxo 9 — Caso de Falha + Recuperação Automática

```
Fluxo: ShopifyConnector.GET_ORDERS → BlingConnector.CREATE_INVOICE

CENÁRIO DE FALHA:
  BlingConnector: Circuit Breaker OPEN (5 falhas consecutivas)

MCIS Recovery Automático:

  Step 1: BlingConnector UNAVAILABLE detectado
         │
         ▼
  Step 2: CapabilityGraph.findAlternatives("CREATE_INVOICE")
          → [QuickBooksConnector (score: 0.82), ContaAzulConnector (score: 0.71)]
         │
         ▼
  Step 3: MCIS Selection verifica:
          QuickBooksConnector: HEALTHY ✅, permissões ✅
         │
         ▼
  Step 4: Workflow redirecionado para QuickBooksConnector
          Schema auto-mapped: Bling.CreateInvoice → QuickBooks.CreateBill
         │
         ▼
  Step 5: Execução bem-sucedida com QuickBooks
         │
         ▼
  Step 6: Memory Update:
          "NF-e gerada via QuickBooks (Bling temporariamente indisponível)"
         │
         ▼
  Step 7: MCIS Learning:
          Registra: "QuickBooks é fallback confiável para BlingConnector"
          Score do fallback aumentado para uso futuro

  RESULTADO: Zero interrupção para o usuário.
             Fallback automático em < 200ms.
```

---

## 13. Fluxo 10 — Governamental (TOTVS Municipal + Gmail + Google Calendar)

```
Cidadão: "Quero agendar atendimento para obter alvará de funcionamento"

MCIS + Specialist Governamental:
  ENTERPRISE.ERP → TOTVSConnector (ERP Municipal)
  COMMUNICATION.MESSAGING.EMAIL → GmailConnector
  PRODUCTIVITY.CALENDAR → GoogleCalendarConnector

FLUXO:
  Step 1: TOTVSConnector.CHECK_DOCUMENT_REQUIREMENTS {
            documentType: "BUSINESS_LICENSE"
          }
          → { requirements: [...], estimatedDays: 30 }

  Step 2: GoogleCalendarConnector.FIND_AVAILABILITY {
            type: "WALK_IN",
            department: "LICENSES",
            duration: 60
          }
          → { available: ["2026-07-15 09:00", "2026-07-16 14:00"] }

  Step 3: [Usuário seleciona horário]

  Step 4: [PARALELO]
    4a: TOTVSConnector.CREATE_APPOINTMENT {
          type: "BUSINESS_LICENSE",
          dateTime: selected,
          citizenId: userId
        }
        → { appointmentId, protocol }
    4b: GoogleCalendarConnector.CREATE_EVENT {
          title: "Atendimento Prefeitura - Alvará",
          dateTime: selected,
          reminder: 24h
        }
    4c: GmailConnector.SEND_EMAIL {
          to: citizen.email,
          subject: "Agendamento confirmado - Protocolo #XYZ",
          body: requirements + appointmentDetails
        }

  Resultado: Agendamento criado em 3 sistemas simultaneamente
```

---

## 14. UML Completo — Diagrama de Sequência MCIS Geral

```
┌─────────┐  ┌──────────┐  ┌────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────┐
│  User   │  │  Core    │  │ MCIS   │  │  Capability  │  │ Connector  │  │ External │
│         │  │ Planner  │  │ Engine │  │    Graph     │  │  Manager   │  │  System  │
└────┬────┘  └────┬─────┘  └───┬────┘  └──────┬───────┘  └─────┬──────┘  └────┬─────┘
     │             │            │               │                │               │
     │ intent      │            │               │                │               │
     │────────────►│            │               │                │               │
     │             │ discover() │               │                │               │
     │             │───────────►│               │                │               │
     │             │            │ findPath()    │                │               │
     │             │            │──────────────►│                │               │
     │             │            │  workflow     │                │               │
     │             │            │◄──────────────│                │               │
     │             │            │ select()      │                │               │
     │             │            │ score each    │                │               │
     │             │ plan+connectors            │                │               │
     │             │◄───────────│               │                │               │
     │             │            │               │ execute(plan)  │               │
     │             │────────────────────────────────────────────►│               │
     │             │            │               │                │ API call      │
     │             │            │               │                │──────────────►│
     │             │            │               │                │  response     │
     │             │            │               │                │◄──────────────│
     │             │            │               │ recordUsage()  │               │
     │             │            │◄──────────────────────────────│               │
     │             │ result     │               │                │               │
     │             │◄───────────────────────────────────────────│               │
     │ answer      │            │               │                │               │
     │◄────────────│            │               │                │               │
```

---

## 15. Critérios de Certificação MCIS

```
┌──────────────────────────────────────────────────────────────────────┐
│              CRITÉRIOS DE CERTIFICAÇÃO MCIS                          │
├─────────────────────────┬──────────────┬────────────┬───────────────┤
│ Critério                │  COMMUNITY   │  PARTNER   │  CERTIFIED    │
├─────────────────────────┼──────────────┼────────────┼───────────────┤
│ describe() implementado │ Obrigatório  │ Obrigatório│ Obrigatório   │
│ Ontologia mapeada       │ Parcial      │ Completa   │ Completa      │
│ InputContract JSON Sch. │ Obrigatório  │ Obrigatório│ Obrigatório   │
│ OutputContract completo │ Básico       │ Completo   │ Completo      │
│ Natural Language desc.  │ 1 idioma     │ 2 idiomas  │ 3+ idiomas    │
│ Capability Graph edges  │ Recomendado  │ Obrigatório│ Obrigatório   │
│ WorkflowRegistry        │ Não req.     │ Recomendado│ Obrigatório   │
│ MemoryRequirements      │ Básico       │ Completo   │ Completo      │
│ ContextRequirements     │ Básico       │ Completo   │ Completo      │
│ Auto Validation pass    │ Obrigatório  │ Obrigatório│ Obrigatório   │
│ SelectionMetrics impl.  │ Básico       │ Completo   │ Completo      │
│ Usage reporting         │ Básico       │ Completo   │ Completo      │
│ Fallback alternatives   │ Recomendado  │ Obrigatório│ Obrigatório   │
│ Hot Plug support        │ Obrigatório  │ Obrigatório│ Obrigatório   │
│ Version negotiation     │ Obrigatório  │ Obrigatório│ Obrigatório   │
│ Dependency declaration  │ Obrigatório  │ Obrigatório│ Obrigatório   │
│ Review oficial MCIS     │ Não req.     │ Não req.   │ Obrigatório   │
└─────────────────────────┴──────────────┴────────────┴───────────────┘
```

---

## 16. Glossário Oficial MCIS

| Termo | Definição |
|---|---|
| **Connector Intelligence** | Conjunto de metadados semânticos e autodescritivos de um Connector |
| **Self Description** | Documento imutável produzido por um Connector descrevendo suas capacidades |
| **Self Discovery** | Processo automático de descoberta de Connectors pelo Core |
| **Capability Registry** | Catálogo central de todas as capacidades disponíveis no ecossistema |
| **Capability Graph** | Grafo de relações de composição, equivalência e dependência entre capacidades |
| **Entity Registry** | Catálogo das entidades manipuladas por cada Connector |
| **Workflow Registry** | Catálogo de workflows compostos por múltiplos Connectors |
| **Hot Plug** | Registro automático de Connector sem reinicialização do sistema |
| **Hot Remove** | Desregistro automático com failover para alternativas |
| **Hot Update** | Atualização de versão sem interrupção de serviço |
| **Auto Registration** | Processo automático de registro nos Registries na inicialização |
| **Auto Validation** | Validação estrutural e semântica automática do SelfDescription |
| **Auto Certification** | Execução automática de testes de certificação |
| **Version Negotiation** | Seleção automática da melhor versão compatível |
| **Dependency Resolution** | Resolução automática de dependências entre Connectors |
| **Ontologia** | Vocabulário semântico hierárquico universal do ecossistema |
| **Taxonomia** | Classificação hierárquica de capacidades por domínio |
| **Input Contract** | Schema formal do que um Connector aceita como entrada |
| **Output Contract** | Schema formal do que um Connector retorna como saída |
| **Auto-Mapping** | Conversão automática de entidades entre Connectors via ontologia |
| **Selection Score** | Pontuação calculada pelo MCIS para selecionar o melhor Connector |
| **Capability Path** | Sequência de capacidades no grafo para atingir um objetivo |
| **GDS** | Global Distribution System — Sabre, Amadeus, Galileo |

---

## Declaração Final do MCIS

O MemoryOS Connector Intelligence Specification (MCIS) estabelece a **camada de inteligência declarativa** que transforma cada Connector de um executor passivo em um participante autodescritivo e descobrível do ecossistema MemoryOS.

Com o MCIS, o Core nunca precisará conhecer o Gmail, o Shopify, o TOTVS ou qualquer Connector futuro. Ele conhece capacidades. O MCIS resolve automaticamente qual Connector as satisfaz, como compô-los, como selecionar o melhor em cada contexto e como aprender com o uso ao longo do tempo.

Esta é a garantia arquitetural de que o MemoryOS pode crescer para suportar milhões de Connectors e bilhões de capacidades sem nenhuma alteração na arquitetura principal — preservando integralmente os princípios do MAS:

> **O Core pensa. Os Connectors executam.**
> **O MCIS é a ponte inteligente entre os dois.**

---

**MCIS — MemoryOS Connector Intelligence Specification**  
**Versão:** 1.0 · **Status:** Aprovado · **Data:** 2026-07-08  
**Documentos:** MCIS · MCIS-Registry · MCIS-Intelligence · MCIS-Flows