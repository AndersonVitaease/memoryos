# MGIS-Flows — UML, C4, Diagramas de Sequência e Casos Reais

**Versão:** 1.0  
**Status:** Oficial  
**Parte:** 4 de 4 do MGIS

---

# CAPÍTULO 22 — UML E DIAGRAMAS ARQUITETURAIS

---

## 22.1 Diagrama C4 — Nível de Contexto

```
┌─────────────────────────────────────────────────────────────────────┐
│                    C4 LEVEL 1 — CONTEXTO                            │
└─────────────────────────────────────────────────────────────────────┘

  ┌─────────────────┐
  │    Usuário      │
  │  (pessoa física │
  │   ou jurídica)  │
  └────────┬────────┘
           │ linguagem natural
           ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │                        MemoryOS                                 │
  │                                                                 │
  │  ┌─────────────┐   ┌──────────────┐   ┌─────────────────────┐  │
  │  │   Intent    │→  │     MGIS     │→  │      Planner        │  │
  │  │Understanding│   │  Goal Intel. │   │  + MCIS + Connectors│  │
  │  └─────────────┘   └──────────────┘   └─────────────────────┘  │
  │                            │                                    │
  │                    ┌───────▼────────┐                          │
  │                    │ Memory Engine  │                          │
  │                    └────────────────┘                          │
  └─────────────────────────────────────────────────────────────────┘
           │ resposta estruturada
           ▼
  ┌─────────────────┐
  │    Usuário      │
  └─────────────────┘
```

## 22.2 Diagrama C4 — Nível de Container

```
┌─────────────────────────────────────────────────────────────────────┐
│                    C4 LEVEL 2 — CONTAINERS                          │
└─────────────────────────────────────────────────────────────────────┘

  Intent
  Understanding
      │
      │ Intent
      ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │                   MGIS — Goal Intelligence Engine                │
  │                                                                  │
  │  ┌──────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
  │  │ Goal         │  │ Goal        │  │  Goal Context           │ │
  │  │ Understand.  │  │ Decomposer  │  │  Enricher               │ │
  │  └──────┬───────┘  └──────┬──────┘  └────────────┬────────────┘ │
  │         │                 │                       │             │
  │  ┌──────▼───────┐  ┌──────▼──────┐  ┌────────────▼────────────┐ │
  │  │ Goal         │  │ Goal Graph  │  │  Goal Priority          │ │
  │  │ Classifier   │  │ Engine      │  │  Engine                 │ │
  │  └──────────────┘  └──────┬──────┘  └─────────────────────────┘ │
  │                           │                                      │
  │  ┌────────────────────────▼─────────────────────────────────┐   │
  │  │              Goal Memory Manager                         │   │
  │  │  (active / recurrent / learned / predicted)              │   │
  │  └──────────────────────────────────────────────────────────┘   │
  └──────────────────────────────────┬───────────────────────────────┘
                                     │ GoalPlan
                                     ▼
                              ┌─────────────┐
                              │   Planner   │
                              └──────┬──────┘
                                     │ ExecutionPlan
                                     ▼
                              ┌─────────────┐
                              │    MCIS     │
                              └──────┬──────┘
                                     │ Capabilities
                                     ▼
                              ┌──────────────────┐
                              │ Connector Manager│
                              └──────────────────┘
```

## 22.3 Diagrama de Sequência — Fluxo Completo MGIS

```
┌──────┐  ┌────────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ User │  │  Intent    │  │  MGIS    │  │ Planner  │  │  MCIS    │  │Connector │
│      │  │  Underst.  │  │          │  │          │  │          │  │ Manager  │
└──┬───┘  └─────┬──────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘
   │             │              │              │              │              │
   │ "Quero      │              │              │              │              │
   │  viajar p/  │              │              │              │              │
   │  Londres"   │              │              │              │              │
   │────────────►│              │              │              │              │
   │             │ Intent{...}  │              │              │              │
   │             │─────────────►│              │              │              │
   │             │              │ understand() │              │              │
   │             │              │ decompose()  │              │              │
   │             │              │ prioritize() │              │              │
   │             │              │ contexts()   │              │              │
   │             │              │ conflicts()  │              │              │
   │             │ GoalPlan     │              │              │              │
   │             │◄─────────────│              │              │              │
   │             │              │ GoalPlan     │              │              │
   │             │              │─────────────►│              │              │
   │             │              │              │ build plan   │              │
   │             │              │              │ ExecutionPlan│              │
   │             │              │              │─────────────►│              │
   │             │              │              │              │ discover     │
   │             │              │              │              │ capabilities │
   │             │              │              │              │─────────────►│
   │             │              │              │              │              │ execute
   │             │              │              │              │◄─────────────│
   │             │              │              │◄─────────────│              │
   │ result      │              │              │              │              │
   │◄────────────│              │              │              │              │
```

## 22.4 Diagrama de Estados — Goal Completo

```
         ┌────────────────┐
         │     ABSENT     │
         └───────┬────────┘
                 │ intent received
                 ▼
         ┌────────────────┐
         │    CREATED     │◄──── memory lookup
         └───────┬────────┘
                 │
     ┌───────────┴────────────┐
     │                        │
  needs clarity?         all clear
     │                        │
  CLARIFYING              WAITING
     │                        │
  resolved               policy check
     │                        │
     └────────────┬───────────┘
                  │
       ┌──────────┴──────────┐
       │                     │
   approved               denied
       │                     │
   PLANNING             CANCELLED
       │
   GoalPlan ready
       │
     APPROVED
       │
   user confirms (if req.)
       │
     EXECUTING ◄──────────┐
       │                  │ recovered
   ┌───┼──────────┐        │
   │   │          │     RECOVERING
paused done    failed        │
   │   │          │     ┌────┘
PAUSED COMPLETED FAILED │ retryable?
   │   │          └─────┘
resume archive    not retryable
   │   │               │
   └───►ARCHIVED    CANCELLED
```

---

# CAPÍTULO 23 — CASOS REAIS COMPLETOS

---

## 23.1 Turismo — Viagem Completa

```
GOAL: "Planejar viagem de negócios a Tóquio, próxima semana, 5 dias"

MGIS Decomposição (Travel Specialist consultado):

FASE 1 — VIABILIDADE [PARALLEL]
  ├── Verificar passaporte (validade > 6 meses)
  ├── Verificar visto: brasileiro → Japão (72h free transit ou e-Visa)
  ├── Verificar câmbio BRL/JPY atual (ChainlinkConnector ou FX API)
  └── Verificar alertas de viagem do ITAMARATY

FASE 2 — LOGÍSTICA [após FASE 1 OK]
  ├── Buscar voos GRU→NRT [PARALLEL: SabreConnector + AmadeusConnector]
  ├── Buscar hotéis Tóquio, datas, categoria executiva
  └── Solicitar seguro viagem

FASE 3 — AGENDA [PARALLEL com FASE 2]
  ├── Verificar Google Calendar para conflitos
  ├── Bloquear dias no calendário: "Viagem Tóquio"
  └── Criar reminder para check-in 24h antes (GoogleCalendarConnector)

FASE 4 — FINANCEIRO [após FASE 2]
  ├── Calcular orçamento total estimado (voo + hotel + seguro + diária)
  ├── Verificar limite do cartão corporativo
  └── Se limite OK → aprovar automaticamente via Policy Engine

FASE 5 — NOTIFICAÇÕES
  ├── Enviar itinerário ao gestor (GmailConnector)
  ├── Compartilhar detalhes com equipe
  └── Configurar notificação "voo saindo em X horas"

MGIS Goal Lifecycle: CREATED → PLANNING → APPROVED → EXECUTING
Total automação: 90% | Intervenção humana: escolha do voo e hotel
```

## 23.2 Hospital — Gestão Cirúrgica

```
GOAL: "Agendar cirurgia eletiva — prótese de quadril — paciente João Silva"

MGIS + Medical Specialist Decomposição:

FASE 1 — VERIFICAÇÃO PRÉ [PARALLEL]
  ├── Verificar cobertura do plano de saúde (HealthInsuranceConnector)
  ├── Verificar disponibilidade do cirurgião (GoogleCalendarConnector)
  ├── Verificar disponibilidade do centro cirúrgico (HospitalERPConnector)
  └── Verificar estoque de materiais (ZebraConnector → prótese disponível?)

FASE 2 — EXAMES PRÉ-OPERATÓRIOS [após FASE 1]
  ├── Gerar pedidos de exames obrigatórios
  ├── Agendar exames no laboratório parceiro
  └── Criar workflow: "aguardar resultados + aprovação anestesista"

FASE 3 — AGENDAMENTO [após exames OK]
  ├── Bloquear centro cirúrgico, equipe, UTI (cautela)
  ├── Registrar no prontuário eletrônico (HospitalERPConnector)
  ├── Notificar paciente via SMS + e-mail
  └── Notificar equipe de enfermagem

FASE 4 — PRÉ-OPERATÓRIO (D-1)
  ├── Confirmar presença do paciente
  ├── Liberar medicação pré-anestésica (PharmacyConnector)
  └── Atualizar prontuário com checklist pré-cirúrgico

MGIS Policy check:
  ✅ Cirurgião credenciado pelo plano
  ✅ Material disponível
  ✅ Guia médica emitida
  ⚠️ Cobertura parcial → notificar paciente sobre co-participação
```

## 23.3 Indústria — Linha de Produção

```
GOAL: "Manter disponibilidade de 99% da Linha 3 de produção"
(PERMANENT BACKGROUND GOAL)

MGIS + Industrial Specialist → Background Goal contínuo:

MONITORAMENTO CONTÍNUO (ZebraConnector + IoT Sensors):
  ├── Temperatura das máquinas > threshold? → ALERT
  ├── Vibração anômala? → PREVENTIVE_MAINTENANCE goal derivado
  ├── Estoque de insumos < 20%? → RESTOCK goal derivado
  └── Meta de produção desviando? → EFFICIENCY_ANALYSIS goal derivado

QUANDO: Máquina X temperatura > 85°C
  MGIS cria Goal derivado: "Manutenção preventiva Máquina X"
  → TOTVSConnector: abrir ordem de serviço
  → GmailConnector: notificar manutenção
  → GoogleCalendarConnector: agendar parada programada
  → ZebraConnector: monitorar temperatura até normalização

QUANDO: Estoque produto Y < 50 unidades
  MGIS cria Goal derivado: "Repor produto Y"
  → TOTVSConnector: verificar fornecedores e preços
  → Criar pedido automático se dentro do limite de aprovação
  → BlingConnector: registrar pedido de compra
```

## 23.4 Marketplace — Shopify + Mercado Livre

```
GOAL: "Expandir vendas online integrando Shopify e Mercado Livre"

MGIS Decomposição (Commerce Specialist):

FASE 1 — SINCRONIZAÇÃO DE CATÁLOGO [PARALLEL]
  ├── ShopifyConnector.GET_ALL_PRODUCTS → catálogo completo
  ├── MercadoLivreConnector.LIST_MY_ITEMS → itens já existentes no ML
  └── Identificar gap: produtos no Shopify mas não no ML

FASE 2 — PUBLICAÇÃO NO ML [após FASE 1]
  ├── Para cada produto novo:
  │   ├── Auto-adaptar título (ML tem limite de 60 chars)
  │   ├── Auto-adaptar fotos (ML requere background branco)
  │   └── MercadoLivreConnector.CREATE_ITEM { ... }
  └── Configurar sincronização bidirecional de estoque

FASE 3 — AUTOMAÇÃO CONTÍNUA (Background Goal)
  ├── Shopify.ORDER_CREATED → sincronizar estoque no ML
  ├── ML.SALE → atualizar estoque no Shopify
  ├── ML.QUESTION_RECEIVED → notificar via GmailConnector
  └── Diariamente: sync de preços e disponibilidade

RESULTADO:
  Catálogo unificado | Estoque em tempo real | Vendas +X%
  MGIS Metrics: "Integração gerou +127 vendas em 30 dias"
```

## 23.5 TOTVS + Bling — ERP Industrial Completo

```
GOAL: "Integrar completamente o ERP com o financeiro"

MGIS + Finance Specialist + Industrial Specialist:

MAPEAMENTO:
  TOTVS → gestão de produção, estoque, compras, RH
  Bling  → financeiro, NF-e, contas a pagar/receber

INTEGRAÇÃO AUTOMÁTICA pelo MGIS:

  Pedido de Compra TOTVS
    → MCIS detecta: BlingConnector.CREATE_PAYABLE disponível
    → Cria automaticamente conta a pagar no Bling
    → Notifica financeiro (GmailConnector)

  Venda no Bling
    → MCIS detecta: TOTVSConnector.REDUCE_STOCK disponível
    → Baixa estoque automaticamente no TOTVS

  NF-e emitida no Bling
    → TOTVSConnector.LINK_INVOICE: vincula ao pedido de venda
    → GmailConnector: envia NF-e ao cliente automaticamente

MGIS Background Goal: sincronização em tempo real
  Evento → MCIS discovers capabilities → execute → Memory updates
```

## 23.6 Blockchain — DeFi e Cross-Chain

```
GOAL: "Otimizar rendimento de carteira crypto"
(Finance Specialist + Blockchain Specialist consultados)

MGIS Decomposição:

FASE 1 — DIAGNÓSTICO [PARALLEL]
  ├── PhantomConnector.GET_PORTFOLIO → posições atuais em Solana
  ├── ChainlinkConnector.GET_PRICES → cotações de todos os ativos
  └── LayerZeroConnector.GET_BRIDGE_FEES → custo de bridge entre chains

FASE 2 — ANÁLISE (MGIS + Blockchain Specialist)
  ├── Calcular yield atual por protocolo
  ├── Comparar com oportunidades disponíveis
  └── Identificar realocações com melhor risk/reward

FASE 3 — EXECUÇÃO (com Policy Engine)
  Policy checks:
  ✅ Valor dentro do limite diário
  ✅ Usuário confirmou estratégia
  ✅ Slippage aceitável (< 1%)

  ├── Se bridge necessário: LayerZeroConnector.BRIDGE_TOKENS
  ├── Realocar para protocolo de maior yield
  └── Monitorar continuamente (Background Goal)

GOAL derivado (Conditional):
  SE yield < X% por 3 dias consecutivos → sugerir realocação
```

## 23.7 Smart Home + IoT

```
GOAL PERMANENTE: "Casa inteligente e econômica"
(Background + Conditional Goals)

MGIS Conditional Goals configurados:

  SE temperatura > 26°C E usuário em casa:
    → Ligar ar condicionado na sala (SmartHomeConnector)

  SE usuário sair de casa:
    → Desligar todas as luzes (SmartHomeConnector)
    → Desligar ar condicionado
    → Ativar câmeras de segurança

  SE consumo de energia > 30% acima da média do mês:
    → MGIS cria Goal: "Reduzir consumo de energia"
    → Analisa quais dispositivos consomem mais (ZebraConnector)
    → Sugestões específicas ao usuário
    → Agenda desligamento automático de dispositivos ociosos

  SE pacote FedEx detectado na câmera (IA + Camera):
    → Notificar usuário (GmailConnector + Push notification)
    → Desbloquear porta temporariamente se autorizado
```

## 23.8 Governo Digital — ANEEL + Sabesp

```
GOAL: "Acompanhar automaticamente contas de energia e água"
(Citizen Services Domain)

MGIS Decomposição:

FASE 1 — CONFIGURAÇÃO (uma vez)
  ├── ANEELConnector: autenticar com número da UC (unidade consumidora)
  ├── SabespConnector: autenticar com código do cliente
  └── Configurar alertas personalizados

FASE 2 — MONITORAMENTO CONTÍNUO (Background Goal)
  ├── Todo dia 20: verificar fatura ANEEL e Sabesp disponíveis
  ├── SE fatura > média histórica + 20%: alertar usuário com análise
  ├── SE vencimento em 3 dias: criar Goal "Pagar conta energia"
  └── Histórico de consumo salvo na memória do usuário

GOAL DERIVADO: "Pagar conta energia"
  → Verificar forma de pagamento preferida (Pix, débito automático)
  → Open Banking Connector: executar pagamento
  → BlingConnector: registrar como despesa (se pessoa jurídica)
  → Memory Update: "Conta energia julho paga - R$342"
```

## 23.9 Open Banking — Saúde Financeira Pessoal

```
GOAL PERMANENTE: "Saúde financeira" (PERMANENT + BACKGROUND)

MGIS + Finance Specialist:

MONITORAMENTO AUTOMÁTICO:
  ├── OpenBankingConnector: extrato de todas as contas consolidado
  ├── Detectar gastos anômalos (> 2σ da média)
  ├── Detectar assinaturas esquecidas (recorrências não usadas)
  └── Calcular score de saúde financeira mensal

GOAL DERIVADOS automáticos:
  SE economias < meta mensal:
    → Goal: "Reduzir gastos em X%"
    → MGIS identifica categoria com maior desvio
    → Sugestões específicas

  SE score de crédito caiu:
    → Goal: "Melhorar score de crédito"
    → MGIS decompõe: pagar dívidas pendentes, manter cadastro atualizado

  TODO MÊS NO DIA 5:
    → Relatório financeiro consolidado (automático)
    → Comparação com mês anterior
    → Projeção dos próximos 3 meses
```

## 23.10 Streaming e Entretenimento

```
GOAL: "Encontrar algo bom para assistir hoje à noite"
(INSTANT GOAL — Entertainment Domain)

MGIS (sem Specialists — Goal simples):

CONTEXTO aplicado pela memória:
  → Gosto: ficção científica, thrillers, séries curtas
  → Tem: Netflix, Disney+, Prime Video
  → Último assistido: Dark (S3)
  → Humor atual: quer "algo leve" (detectado pelo contexto da conversa)
  → Tempo disponível: ~2 horas

GOAL DECOMPOSITION:
  → NetflixConnector.GET_RECOMMENDATIONS {
      genres: ["comedy", "light_thriller"],
      duration: "< 120 min OR series episode",
      language: "pt-BR OR en subtitled"
    }
  → Filtrar por: rating > 7.5, lançado nos últimos 2 anos
  → Apresentar top 3 com trailers linkados

RESULTADO: 3 sugestões personalizadas em < 2 segundos
GOAL lifecycle: CREATED → EXECUTING → COMPLETED (todo em < 3s)
```

---

## 24. Integração com Planner — Interface Oficial

```typescript
// Contrato oficial de entrega MGIS → Planner

interface GoalPlanHandoff {
  // GoalPlan produzido pelo MGIS
  goalPlan: GoalPlan;

  // Instruções ao Planner
  plannerInstructions: {
    priorityOrder: string[];        // Ordem de Goals a planejar
    parallelizableGroups: string[][]; // Grupos que podem rodar em paralelo
    criticalPath: string[];         // Goals no caminho crítico
    hardDependencies: GoalDependency[]; // Dependências que não podem ser violadas
    softDependencies: GoalDependency[]; // Dependências preferidas (não bloqueantes)
    timeboxes: GoalTimebox[];       // Janelas de tempo para cada Goal
    fallbackGoals: Record<string, string>; // Goal → GoalFallback se falhar
  };

  // Contexto que o Planner deve passar ao MCIS
  mcisContext: {
    preferredConnectors: string[];
    requiredCapabilities: string[];
    budgetConstraints: BudgetConstraint[];
    performanceRequirements: PerformanceRequirement[];
  };

  // Quando o Planner deve reportar de volta ao MGIS
  checkpoints: PlannerCheckpoint[];
}
```

---

## 25. Declaração Arquitetural Oficial

> **O usuário descreve um objetivo.**  
> **O MemoryOS compreende a intenção.**  
> **O MGIS estrutura o objetivo.**  
> **O Planner cria o plano.**  
> **O MCIS descobre as capacidades.**  
> **Os Connectors executam.**  
> **A Memória aprende continuamente.**

Esta declaração representa a síntese arquitetural completa do pipeline de inteligência do MemoryOS, do qual o MGIS ocupa a posição central de **compreensão e estruturação de objetivos humanos** — a camada que transforma a ambiguidade natural da linguagem humana em intenções estruturadas, priorizadas e prontas para execução determinística.

---

## 26. Tabela de Responsabilidades por Camada (Pipeline Completo)

```
┌──────────────────────────────────────────────────────────────────────────┐
│              RESPONSABILIDADES OFICIAIS — PIPELINE MEMORYOS             │
├─────────────────────┬───────────────────────────┬────────────────────────┤
│ Camada              │ Responsabilidade          │ NÃO faz               │
├─────────────────────┼───────────────────────────┼────────────────────────┤
│ Intent              │ Compreende linguagem       │ Estrutura objectives   │
│ Understanding       │ natural bruta              │                        │
├─────────────────────┼───────────────────────────┼────────────────────────┤
│ MGIS                │ Estrutura, decompõe,       │ Escolhe Connectors     │
│                     │ prioriza e entrega Goals   │ Chama APIs             │
│                     │ ao Planner                 │ Executa ações          │
├─────────────────────┼───────────────────────────┼────────────────────────┤
│ Planner (MAS §4.7)  │ Transforma GoalPlan em     │ Interpreta intenções   │
│                     │ ExecutionPlan sequenciado  │ Seleciona Connectors   │
├─────────────────────┼───────────────────────────┼────────────────────────┤
│ MCIS                │ Descobre capacidades para  │ Cria planos de         │
│                     │ cada step do plano         │ execução               │
├─────────────────────┼───────────────────────────┼────────────────────────┤
│ Connector Manager   │ Seleciona e roteia para    │ Estrutura goals        │
│                     │ o Connector correto        │ Toma decisões negócio  │
├─────────────────────┼───────────────────────────┼────────────────────────┤
│ Connectors (MCF)    │ Executam ações nos         │ Interpretam intenções  │
│                     │ sistemas externos          │ Tomam decisões         │
├─────────────────────┼───────────────────────────┼────────────────────────┤
│ Memory Engine       │ Aprende e preserva         │ Executa ações          │
│                     │ conhecimento continuamente │                        │
└─────────────────────┴───────────────────────────┴────────────────────────┘
```

---

**Documento Oficial:** MGIS-Flows  
**Versão:** 1.0 · **Status:** Aprovado  
**Parte:** 4 de 4 do MGIS

---

**MGIS — MemoryOS Goal Intelligence Specification**  
**Versão:** 1.0 · **Status:** Aprovado · **Data:** 2026-07-08  
**Documentos:** MGIS · MGIS-Engine · MGIS-Lifecycle · MGIS-Flows