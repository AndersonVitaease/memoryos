# MGIS-Lifecycle — Aprendizado, Predição, Composição, Ontologia e Specialists

**Versão:** 1.0  
**Status:** Oficial  
**Parte:** 3 de 4 do MGIS

---

# CAPÍTULO 14 — GOAL POLICY

---

## 14.1 Como Políticas Interferem nos Goals

O Policy Engine (MAS §4.6) é acionado pelo MGIS antes de qualquer Goal transitar para PLANNING.

```
┌─────────────────────────────────────────────────────────────────────┐
│              MGIS ↔ POLICY ENGINE — FLUXO DE VERIFICAÇÃO           │
└─────────────────────────────────────────────────────────────────────┘

  Goal criado pelo MGIS (status: WAITING)
         │
         ▼
  Policy Engine verifica:
  ├── 1. AUTORIZAÇÃO DE USUÁRIO
  │       Usuário tem permissão para este tipo de Goal?
  │
  ├── 2. LIMITES E COTAS
  │       Valor financeiro dentro do limite autorizado?
  │       Número de operações dentro da cota?
  │
  ├── 3. APROVAÇÃO HIERÁRQUICA
  │       Goal requer aprovação de supervisor?
  │       Valor > threshold da empresa?
  │
  ├── 4. COMPLIANCE REGULATÓRIO
  │       LGPD: dados pessoais acessados legitimamente?
  │       Menor de idade tentando ação restrita?
  │       Operação financeira dentro das normas do Banco Central?
  │
  ├── 5. RESTRIÇÕES DE HORÁRIO
  │       Operação bancária fora do horário comercial?
  │       Sistema externo em manutenção programada?
  │
  └── 6. RESTRIÇÕES CORPORATIVAS
          Departamento bloqueado para este tipo de Connector?
          Plano contratado não inclui esta capacidade?

  RESULTADO:
  ├── APPROVED → Goal transita para PLANNING
  ├── PENDING_APPROVAL → Goal transita para BLOCKED + deriva Goal de aprovação
  └── DENIED → Goal transita para CANCELLED + motivo explicado ao usuário
```

## 14.2 Exemplos de Policies sobre Goals

```
EXEMPLO 1 — Empresa com threshold de aprovação:
  Goal: "Pagar fornecedor R$120.000"
  Policy: Pagamentos > R$50.000 → aprovação CFO
  
  MGIS ação:
    1. Goal "Pagar fornecedor" → BLOCKED
    2. Goal Derivado criado: "Solicitar aprovação CFO"
    3. GmailConnector envia solicitação ao CFO
    4. CFO responde via e-mail/app
    5. Approval registrada na memória
    6. Goal original → PLANNING

─────────────────────────────────────────────────────────

EXEMPLO 2 — Menor tentando compra de bebida alcoólica:
  Goal: "Comprar cerveja"
  Policy: idade < 18 → HARD_BLOCK
  
  MGIS ação:
    1. Goal → CANCELLED imediatamente
    2. Motivo: "Não autorizado por restrição de idade"
    3. Nenhum Connector é chamado
    4. Nenhuma exceção possível

─────────────────────────────────────────────────────────

EXEMPLO 3 — Horário fora do expediente:
  Goal: "Aprovar pedido de compra urgente"
  Context: 23:47, sábado
  Policy: Aprovações manuais → horário comercial apenas
  
  MGIS ação:
    1. Goal → WAITING (até horário comercial)
    2. Alerta agendado para segunda-feira 08:00
    3. Se marcado CRÍTICO pelo usuário → escalate para aprovador de plantão

─────────────────────────────────────────────────────────

EXEMPLO 4 — Restrição de departamento:
  Goal: "Acessar dados financeiros da empresa"
  User: Estagiário de Marketing
  Policy: Dados financeiros → apenas Financeiro + Diretoria
  
  MGIS ação:
    1. Goal → BLOCKED
    2. Motivo: "Permissão insuficiente para dados financeiros"
    3. Sugestão: "Solicite acesso ao seu gestor"
```

---

# CAPÍTULO 15 — GOAL SPECIALISTS

---

## 15.1 Como Specialists Enriquecem Goals

Os Specialists (MAS §4.3) são consultados pelo MGIS durante a decomposição de Goals complexos para garantir que nenhuma dimensão especializada seja negligenciada.

```
GOAL: "Planejar cirurgia eletiva"
  ↓
MGIS consulta Medical Specialist:
  → Medical Specialist retorna dimensões obrigatórias:
     ✅ Verificar cobertura do plano de saúde
     ✅ Verificar credenciamento do hospital
     ✅ Verificar necessidade de exames pré-operatórios
     ✅ Verificar disponibilidade de UTI
     ✅ Verificar medicamentos pré e pós operatório
     ✅ Verificar transporte e recuperação pós-cirurgia
     ✅ Verificar necessidade de acompanhante
  ↓
MGIS incorpora todas as dimensões no Goal Decomposition
  ↓
Planner recebe GoalPlan completo e clinicamente correto
```

## 15.2 Especialistas Oficiais do MGIS

```typescript
const MGIS_SPECIALISTS = {

  TravelSpecialist: {
    domain: "TRAVEL",
    enrichedDimensions: [
      "flights", "hotels", "insurance", "visa", "passport",
      "currency", "climate", "health_requirements", "local_transport",
      "emergency_contacts", "travel_warnings"
    ]
  },

  FinanceSpecialist: {
    domain: "FINANCE",
    enrichedDimensions: [
      "budget_impact", "tax_implications", "cash_flow_effect",
      "regulatory_compliance", "exchange_rates", "risk_assessment",
      "investment_suitability", "banking_requirements"
    ]
  },

  LegalSpecialist: {
    domain: "LEGAL",
    enrichedDimensions: [
      "regulatory_requirements", "contract_obligations",
      "lgpd_compliance", "labor_law", "intellectual_property",
      "liability_exposure", "dispute_resolution"
    ]
  },

  MedicalSpecialist: {
    domain: "HEALTH",
    enrichedDimensions: [
      "insurance_coverage", "pre_requirements", "contraindications",
      "recovery_plan", "medication", "emergency_protocol"
    ]
  },

  BlockchainSpecialist: {
    domain: "BLOCKCHAIN",
    enrichedDimensions: [
      "gas_fees", "slippage", "smart_contract_risk",
      "regulatory_status", "tax_implications", "wallet_security",
      "network_congestion", "bridge_risk"
    ]
  },

  IndustrialSpecialist: {
    domain: "INDUSTRY",
    enrichedDimensions: [
      "safety_compliance", "environmental_impact",
      "maintenance_schedule", "calibration_requirements",
      "supply_chain_risk", "quality_standards"
    ]
  },

  NutritionSpecialist: {
    domain: "HEALTH.NUTRITION",
    enrichedDimensions: [
      "dietary_restrictions", "nutritional_balance",
      "allergen_check", "meal_planning", "shopping_list"
    ]
  }
};
```

---

# CAPÍTULO 16 — GOAL AGENTS

---

## 16.1 Como Agentes Permanentes Trabalham com Goals

Agentes Permanentes são entidades autônomas que operam em background. O MGIS fornece a eles a camada de compreensão de objetivos.

### 16.2 Goals Recorrentes em Agentes

```
Agente: "FinanceMonitorAgent"
  Background Goal: MONITOR_CASH_FLOW (PERMANENT)
  
  MGIS detecta automaticamente:
    Toda sexta-feira às 17h → o usuário historicamente:
      1. Emite NF-e das vendas da semana → BlingConnector
      2. Gera relatório financeiro → BlingConnector
      3. Envia relatório para sócios → GmailConnector
      4. Atualiza previsão do mês → BlingConnector
  
  MGIS propõe ao usuário:
    "Detectei que você executa o mesmo processo toda sexta.
     Deseja que eu automatize isso como Goal Recorrente?"
  
  Se aprovado:
    GoalTemplate criado e salvo
    Agente executa autonomamente toda sexta
    Usuário notificado ao final
```

### 16.3 Goals Condicionais em Agentes

```typescript
interface ConditionalGoal {
  goalId: string;
  condition: GoalCondition;
  triggerGoal: Goal;
}

// Exemplos de Goals Condicionais:
const examples: ConditionalGoal[] = [
  {
    condition: { type: "PRICE_THRESHOLD", asset: "BTC", below: 200000 },
    triggerGoal: { title: "Comprar Bitcoin", domain: "BLOCKCHAIN" }
  },
  {
    condition: { type: "EMAIL_RECEIVED", from: "cliente@empresa.com", subject_contains: "urgente" },
    triggerGoal: { title: "Responder e-mail urgente do cliente" }
  },
  {
    condition: { type: "STOCK_LEVEL", sku: "PROD-001", below: 50 },
    triggerGoal: { title: "Criar pedido de reposição no TOTVS" }
  },
  {
    condition: { type: "CALENDAR_EVENT", hours_before: 24, event_type: "FLIGHT" },
    triggerGoal: { title: "Check-in online no voo" }
  }
];
```

---

# CAPÍTULO 17 — GOAL LEARNING

---

## 17.1 Aprendizado Automático de Goals

```
┌─────────────────────────────────────────────────────────────────────┐
│              CICLO DE APRENDIZADO DE GOALS                          │
└─────────────────────────────────────────────────────────────────────┘

  Goal executado com sucesso
         │
         ▼
  1. REGISTRAR
     GoalOutcome { success, duration, approach, connectors, userRating }
         │
         ▼
  2. ANALISAR
     ├── É recorrente? (mesmo padrão ≥ 3 vezes)
     ├── Abordagem foi ótima? (latência, custo, sucesso)
     ├── Usuário modificou algo? (feedback implícito)
     └── Há padrão temporal? (sempre às sextas, sempre após X)
         │
         ▼
  3. APRENDER
     ├── Atualizar GoalTemplate preferred approach
     ├── Criar RecurrentGoalPattern se aplicável
     ├── Ajustar pesos do algoritmo de priorização
     └── Atualizar PredictionModel
         │
         ▼
  4. SUGERIR
     ├── "Automatizar este processo?"
     ├── "Criar atalho para este Goal?"
     └── "Configurar execução em background?"
         │
         ▼
  5. EVOLUIR
     → GoalTemplate atualizado na próxima iteração
     → PatternLibrary cresce continuamente
     → MGIS fica progressivamente mais preciso
```

---

# CAPÍTULO 18 — GOAL PREDICTION

---

## 18.1 Motor de Predição

```typescript
interface GoalPredictionEngine {
  // Predizer próximos goals baseado em contexto temporal
  predictNext(
    userId: string,
    context: GoalContext
  ): PredictedGoal[];

  // Predizer baseado em histórico de sequências
  predictFromSequence(
    userId: string,
    recentGoals: Goal[]
  ): PredictedGoal[];

  // Predizer baseado em eventos externos
  predictFromEvent(
    userId: string,
    event: ExternalEvent
  ): PredictedGoal[];
}

interface PredictedGoal {
  goal: GoalTemplate;
  probability: number;      // 0.0 a 1.0
  triggerType: "TEMPORAL" | "SEQUENCE" | "EVENT" | "BEHAVIORAL";
  expectedAt: string;
  rationale: string;
  suggestProactive: boolean; // Sugerir ao usuário antecipadamente?
}
```

## 18.2 Exemplo de Predição Temporal

```
Perfil aprendido do usuário (empresário):

  SEGUNDA-FEIRA:
    08:00 → Verificar e-mails não lidos (GmailConnector)
    09:00 → Revisar pipeline de vendas (CRM Connector)
  
  SEXTA-FEIRA:
    17:00 → Gerar relatório financeiro (BlingConnector)
    17:30 → Emitir NF-e pendentes (BlingConnector)
    18:00 → Enviar resumo semanal para sócios (GmailConnector)
  
  DIA 5 DE CADA MÊS:
    → Pagar fornecedores (BlingConnector)
    → Verificar fluxo de caixa mensal
  
  QUANDO DETECTA E-MAIL DE CLIENTE GRANDE:
    → Priorizar resposta imediatamente

MGIS Prediction às quinta-feira 16:00:
  "Amanhã às 17h, você provavelmente vai executar:
   [Relatório financeiro] + [NF-e pendentes] + [E-mail sócios]
   Deseja que eu prepare tudo antecipadamente?"
```

---

# CAPÍTULO 19 — GOAL COMPOSITION

---

## 19.1 Goals Compostos

Goals compostos são objetivos de alta ordem que só podem ser alcançados através da composição coordenada de múltiplos Goals menores, potencialmente em múltiplos domínios.

```
GOAL COMPOSTO: "Abrir empresa no Brasil"
  │
  FASE 1 — LEGAL (Goals paralelos possíveis)
  ├── Definir tipo societário (SIMPLES, LTDA, SA...)
  ├── Registrar na Receita Federal (CNPJ)
  ├── Registrar na Junta Comercial
  ├── Obter Inscrição Municipal
  └── Obter Inscrição Estadual (se necessário)
  │
  FASE 2 — FINANCEIRO (requer FASE 1)
  ├── Abrir conta pessoa jurídica
  ├── Configurar capital social
  └── Configurar regime tributário
  │
  FASE 3 — TECNOLÓGICO (requer FASE 2)
  ├── Registrar domínio e criar site
  ├── Configurar ERP (TOTVSConnector / BlingConnector)
  ├── Configurar sistema de NF-e
  └── Configurar contas de e-mail corporativo (GmailConnector)
  │
  FASE 4 — OPERACIONAL (requer FASE 3)
  ├── Configurar processos de RH
  ├── Configurar pipeline de vendas
  ├── Configurar presença em marketplace (ShopifyConnector / MLConnector)
  └── Configurar marketing digital (GoogleAdsConnector)
  │
  Sequenciamento automático pelo MGIS:
    FASE 1 pode rodar em paralelo internamente
    FASE 2 aguarda conclusão de FASE 1
    FASE 3 aguarda conclusão de FASE 2
    FASE 4 pode iniciar parcialmente com FASE 3
    
  Estimativa total: 30-60 dias (humanos) + automação máxima possível
```

## 19.2 Goal Discovery

```
GOAL: "Quero vender mais"
  ↓
MGIS Goal Discovery — detecta dimensões implícitas:
  
  DIMENSÃO 1 — PRODUTO
  ├── Otimizar precificação
  ├── Expandir catálogo
  └── Melhorar imagens e descrições (ML, Shopify)
  
  DIMENSÃO 2 — ALCANCE
  ├── SEO e presença orgânica
  ├── Marketplace: Mercado Livre, Amazon
  └── Social commerce: TikTok, Instagram
  
  DIMENSÃO 3 — MARKETING
  ├── Campanhas Meta Ads
  ├── Google Ads
  ├── Afiliados
  └── E-mail marketing
  
  DIMENSÃO 4 — CONVERSÃO
  ├── CRM: follow-up de leads
  ├── Checkout otimizado
  └── Programa de fidelidade
  
  DIMENSÃO 5 — PÓS-VENDA
  ├── Suporte e atendimento
  ├── Logística e prazo de entrega
  └── Reviews e reputação
  
  MGIS apresenta ao usuário:
    "Detectei 5 dimensões para 'vender mais'.
     Por onde prefere começar? Ou posso criar um plano integrado."
```

---

# CAPÍTULO 20 — GOAL ONTOLOGY

---

## 20.1 Ontologia Universal de Goals

```
GOAL_UNIVERSE (raiz)
│
├── PERSONAL
│   ├── HEALTH
│   │   ├── MEDICAL_CARE
│   │   ├── FITNESS
│   │   ├── NUTRITION
│   │   └── MENTAL_HEALTH
│   ├── FINANCE_PERSONAL
│   │   ├── SAVINGS
│   │   ├── INVESTMENT
│   │   ├── DEBT_MANAGEMENT
│   │   └── INSURANCE
│   ├── TRAVEL
│   │   ├── LEISURE
│   │   ├── BUSINESS_TRAVEL
│   │   └── RELOCATION
│   ├── EDUCATION
│   │   ├── FORMAL_EDUCATION
│   │   ├── PROFESSIONAL_DEVELOPMENT
│   │   └── SKILL_ACQUISITION
│   └── LIFESTYLE
│       ├── HOME
│       ├── ENTERTAINMENT
│       └── SOCIAL
│
├── PROFESSIONAL
│   ├── COMMERCE
│   │   ├── ECOMMERCE
│   │   ├── RETAIL
│   │   └── B2B_SALES
│   ├── ENTERPRISE_MANAGEMENT
│   │   ├── FINANCIAL_MANAGEMENT
│   │   ├── HR_MANAGEMENT
│   │   ├── OPERATIONS
│   │   └── LEGAL_COMPLIANCE
│   ├── MARKETING
│   │   ├── DIGITAL_MARKETING
│   │   ├── CONTENT
│   │   └── ANALYTICS
│   └── TECHNOLOGY
│       ├── SOFTWARE_DEVELOPMENT
│       ├── INFRASTRUCTURE
│       └── DIGITAL_TRANSFORMATION
│
├── INDUSTRY_SPECIFIC
│   ├── AGRICULTURE
│   │   ├── CROP_MANAGEMENT
│   │   └── LIVESTOCK
│   ├── ENERGY
│   │   ├── RENEWABLE
│   │   └── UTILITY_MANAGEMENT
│   ├── MANUFACTURING
│   │   ├── PRODUCTION
│   │   └── QUALITY_CONTROL
│   └── LOGISTICS
│       ├── FLEET_MANAGEMENT
│       └── SUPPLY_CHAIN
│
├── GOVERNMENT
│   ├── CITIZEN_SERVICES
│   ├── PUBLIC_ADMINISTRATION
│   ├── REGULATORY_COMPLIANCE
│   └── INFRASTRUCTURE
│
├── BLOCKCHAIN
│   ├── DEFI
│   ├── NFT
│   ├── DAO_GOVERNANCE
│   └── CROSS_CHAIN
│
└── EMERGING
    ├── ARTIFICIAL_INTELLIGENCE
    ├── IOT_MANAGEMENT
    └── SMART_CITY
```

---

# CAPÍTULO 21 — GOAL EVOLUTION

---

## 21.1 Como Goals Evoluem ao Longo do Tempo

```
EVOLUÇÃO DE UM GOAL — CICLO DE VIDA EMPRESARIAL

ANO 1:
  Mission: "Construir negócio sustentável"
  Goal ativo: "Abrir empresa" (COMPLEX)
    └── Subgoals: CNPJ, conta, ERP básico, primeiro cliente

ANO 2:
  Mission: mesma
  Goal ativo: "Estruturar operação" (COMPLEX)
    └── Subgoals: contratar time, CRM, automatizar financeiro, NF-e

ANO 3:
  Mission: mesma
  Goal ativo: "Escalar vendas" (COMPLEX)
    └── Subgoals: marketplaces, ads, afiliados, outbound

ANO 5:
  Mission: mesma
  Goal ativo: "Internacionalizar" (EPIC)
    └── Subgoals: CNPJ no exterior, conta em USD, website EN, logística

ANO 10:
  Mission: mesma
  Goal ativo: "Franquias" (EPIC)
    └── Subgoals: modelo de franquia, manual operacional, ERP franqueados

MGIS aprende esta evolução e:
  → Sugere proativamente os próximos Goals
  → Detecta quando o usuário está pronto para o próximo nível
  → Precarrega GoalPlans para metas futuras esperadas
```

---

**Documento Oficial:** MGIS-Lifecycle  
**Versão:** 1.0 · **Status:** Aprovado  
**Parte:** 3 de 4 do MGIS