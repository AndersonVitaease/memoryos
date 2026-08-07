# MDS — Architectural Principles Expansion
## Complemento Arquitetural Oficial do MemoryOS

**Versão:** 1.0  
**Status:** Aprovado — Complemento Oficial  
**Data:** 2026-07-10  
**Tipo:** Princípios Arquiteturais Obrigatórios  
**Alinhamento:** MAS 1.0 · MPS · MCF · MCIS · MGIS · MES · MDS 1.0–1.6 · Sprint 17

---

## Declaração

Este documento consolida os princípios arquiteturais descobertos durante a evolução do MemoryOS.

**Não cria novos motores.**  
**Não altera o Roadmap.**  
**Não modifica o Core.**

Seu objetivo é complementar oficialmente a arquitetura com conceitos que passaram a fazer parte da filosofia do MemoryOS.

Todos os princípios descritos aqui são **obrigatórios** nas próximas implementações.

---

## Princípios

---

### 1. Journey-Centric Architecture

O MemoryOS é orientado por **Jornadas**.

A conversa deixa de ser o elemento principal.  
A **Jornada** passa a ser o elemento principal.

**Estrutura obrigatória de uma Jornada:**

```
JourneyRecord {
  journeyId       — ID único
  userId          — proprietário
  identityContext — contexto de identidade ativo
  title           — descrição do objetivo
  goal            — objetivo estruturado
  status          — active | paused | completed | archived
  workingMemory   — memória de trabalho atual
  longTermMemory  — referências de memória de longo prazo
  documents       — documentos associados
  conversations   — conversas relacionadas
  events          — eventos ocorridos
  nextSteps       — próximas ações
  auditTrail      — histórico completo de auditoria
  createdAt       — data de início
  updatedAt       — última atualização
  completedAt     — data de conclusão (opcional)
}
```

**Duração possível de uma Jornada:**

| Duração | Exemplo |
|---|---|
| Minutos | Consulta simples |
| Horas | Reserva de viagem |
| Dias | Processo de contratação |
| Semanas | Abertura de empresa |
| Meses | Processo judicial |
| Anos | Planejamento financeiro de longo prazo |

Uma Jornada permanece ativa **até sua conclusão explícita**.

---

### 2. Persistent Goals

Todo objetivo pode permanecer ativo indefinidamente.

O usuário **nunca precisará reiniciar um processo**.

O MemoryOS deverá lembrar automaticamente:

- onde a pessoa parou;
- documentos enviados;
- decisões tomadas;
- pendências em aberto;
- próximos passos planejados.

**Regra:** Nenhum contexto deve ser perdido entre sessões.

---

### 3. Identity Context

O usuário possui uma única conta.  
Mas pode operar em múltiplos **Contextos de Identidade**.

**Exemplos de contextos:**

| Contexto | Descrição |
|---|---|
| Pessoa Física | CPF, documentos pessoais, saúde, finanças pessoais |
| Empresa | CNPJ, contratos, funcionários, fiscal |
| Projeto | Escopo isolado, membros, entregas |
| Cliente | Representação de terceiro |
| Representação | Procurador, tutor, responsável legal |

**Cada contexto possui isolamento total:**

- Memória própria
- Permissões próprias
- Conectores próprios
- Auditoria própria

**Regra:** Contextos **nunca** devem ser misturados.  
Toda operação deve declarar explicitamente o contexto de identidade ativo.

---

### 4. Adaptive Communication

Toda resposta deve adaptar-se ao perfil do usuário.

**Modos de comunicação disponíveis:**

| Modo | Público-alvo |
|---|---|
| `INFANTIL` | Crianças, linguagem lúdica e simples |
| `BASICO` | Usuários sem formação técnica |
| `INTERMEDIARIO` | Usuários com conhecimento moderado |
| `TECNICO` | Desenvolvedores, analistas |
| `ESPECIALISTA` | Profissionais altamente qualificados |
| `JURIDICO` | Linguagem formal e precisa do direito |
| `MEDICO` | Terminologia clínica e científica |
| `EXECUTIVO` | Resumo objetivo, foco em decisão |

**Regra:** A **informação permanece a mesma**.  
Apenas a **forma de comunicação** se adapta.

---

### 5. Step-by-Step Guidance

O MemoryOS nunca deve sobrecarregar o usuário.

**Regra obrigatória:**

```
Apresentar apenas o PRÓXIMO PASSO.
          ↓
Usuário conclui.
          ↓
Apresentar a PRÓXIMA ETAPA.
```

Jamais apresentar dezenas de etapas desnecessariamente.

**Impacto no Planner:**  
O Planner deve expor ao usuário apenas a etapa imediata, mesmo que o plano interno contenha dezenas de steps.

---

### 6. Conversation Detection

O MemoryOS deve detectar automaticamente o estado da conversa:

| Evento | Descrição |
|---|---|
| `STARTED` | Início de nova conversa |
| `ENDED` | Término natural da conversa |
| `RESUMED` | Retomada após pausa |
| `PAUSED` | Pausa detectada (inatividade) |
| `SPEAKER_CHANGED` | Mudança de interlocutor detectada |

**Regra:** Detecção deve ocorrer **sem depender de integrações específicas**.  
Comportamento detectado por análise de conteúdo e timing.

---

### 7. Behavior Detection First

Antes de criar qualquer integração específica:

```
Detectar comportamento
        ↓
Validar padrão
        ↓
Então considerar integração
```

**Exemplo:**

| Abordagem Errada | Abordagem Correta |
|---|---|
| Depender de API de telefonia para detectar chamada | Detectar padrões de áudio primeiro |
| Depender de webhook de e-mail para detectar mensagem | Detectar padrão de comunicação no conteúdo |

**Regra:** Comportamento detectado precede integração específica.

---

### 8. Event-Driven Architecture

O MemoryOS reage tanto a **intenções** quanto a **eventos externos**.

**Eventos podem originar automaticamente:**

```
Evento detectado
        ↓
┌───────────────────────────────┐
│  Planejamento automático      │
│  Execução de ações            │
│  Notificações ao usuário      │
│  Registro de auditoria        │
│  Aprendizado do sistema       │
└───────────────────────────────┘
```

**Regra:** Nenhum motor deve depender de polling.  
Toda reação deve ser orientada por evento.

---

### 9. Event Bus

Todos os eventos relevantes devem ser publicados no Event Bus Universal.

**Contrato:**

```
Produtor publica evento
        ↓
Event Bus distribui
        ↓
Consumidores interessados reagem
```

**Regra:** Nenhum motor deve depender diretamente de outro.  
O acoplamento ocorre **apenas via eventos**.

```typescript
// Contrato mínimo
interface UniversalEvent {
  eventId:      string;    // único
  type:         string;    // namespace.action
  sourceEngine: string;    // motor produtor
  payload:      object;    // dados do evento
  timestamp:    string;    // ISO 8601
  schemaVersion: string;   // "1.0"
}
```

---

### 10. Transparency by Design

O usuário sempre pode visualizar:

| Dimensão | O que mostrar |
|---|---|
| **Dados** | Quais dados estão sendo utilizados |
| **Fonte** | Qual fonte foi consultada |
| **Acesso** | Quem possui acesso |
| **Permissões** | Quais permissões estão ativas |
| **Políticas** | Políticas aplicadas |
| **Retenção** | Por quanto tempo os dados serão mantidos |

**Regra:** Transparência é parte da **experiência do usuário**, não um recurso opcional.

---

### 11. Human Approval

O nível de confirmação humana é proporcional ao impacto da ação.

**Matriz de aprovação:**

| Tipo de Ação | Nível de Confirmação |
|---|---|
| Consultar informação | Automático — sem confirmação |
| Pesquisar dados | Automático — sem confirmação |
| Preparar reserva / rascunho | Automático — sem confirmação |
| Emitir bilhete / documento oficial | **Confirmação obrigatória** |
| Cancelar reserva / serviço | **Confirmação obrigatória** |
| Movimentação financeira | **Confirmação obrigatória** |
| Exclusão de dados | **Confirmação obrigatória** |
| Ação irreversível | **Confirmação obrigatória + justificativa** |

**Regra:** Toda ação com `requiresApproval=true` no Execution Engine deve bloquear até aprovação explícita.

**Integração com Execution Engine (Sprint 17):**  
O `ApprovalEngine` do `SecurityGate` implementa este princípio.

---

### 12. Official Sources First

Toda integração deve priorizar:

1. APIs oficiais do serviço
2. Dados Abertos governamentais
3. Documentação oficial publicada
4. Integrações autorizadas e certificadas

**Regra:** Nunca depender de métodos não suportados, scraping ou APIs não oficiais.

---

### 13. Government & Citizen Services

O MemoryOS deve estar preparado para auxiliar cidadãos, empresas e profissionais utilizando conectores oficiais.

**Conectores governamentais prioritários (Brasil):**

| Portal | Finalidade |
|---|---|
| gov.br | Autenticação e serviços unificados |
| Receita Federal | CPF, CNPJ, declarações, certidões |
| INSS | Benefícios, aposentadoria, CNIS |
| Anvisa | Medicamentos, produtos, vigilância sanitária |
| Detran | CNH, veículos, infrações |
| INPI | Marcas, patentes, propriedade intelectual |
| Portal Único Siscomex | Importação, exportação, comércio exterior |

**Regra:** Toda integração governamental deve respeitar:
- Autenticação oficial (e-CPF, e-CNPJ, gov.br)
- Autorização explícita do cidadão
- Políticas públicas de uso de dados

---

### 14. Knowledge Translation

O MemoryOS não apenas consulta informações.  
Ele **traduz conhecimento**.

```
Linguagem original (técnica / jurídica / burocrática)
                    ↓
           Knowledge Translation Engine
                    ↓
         Linguagem compreensível ao usuário
         (preservando o significado original)
```

**Regra:** Toda resposta que contenha linguagem técnica, jurídica ou burocrática deve oferecer uma versão traduzida adaptada ao modo de comunicação do usuário (Princípio 4).

**Integração:**  
O Adaptive Communication Mode (Princípio 4) define **como** traduzir.  
O Knowledge Translation define **o que** traduzir.

---

### 15. Arquitetura Evolutiva

Toda nova funcionalidade deve:

- **Reutilizar** o Core existente
- **Reutilizar** os motores já implementados
- **Reutilizar** o Event Bus
- **Reutilizar** o Planner Engine
- **Reutilizar** o Execution Engine (Sprint 17)
- **Reutilizar** o Context Builder

```
Nova funcionalidade
        ↓
Pode ser implementada pelos componentes existentes?
        │
        ├── SIM → Incorporar ao componente existente
        │
        └── NÃO → Justificar formalmente → ADR obrigatório → Criar novo componente
```

**Regra:** Nenhum novo motor deve ser criado sem ADR formal justificando a impossibilidade de reutilização.

---

## Mapa de Integração com Motores Existentes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              ARCHITECTURAL PRINCIPLES — INTEGRATION MAP                     │
├──────────────────────────────┬──────────────────────────────────────────────┤
│ Princípio                    │ Motor(es) Responsável(eis)                   │
├──────────────────────────────┼──────────────────────────────────────────────┤
│ 1. Journey-Centric           │ Memory Engine (MDS v1.6) + Context Builder  │
│ 2. Persistent Goals          │ Goal Intelligence (MGIS) + Memory Engine     │
│ 3. Identity Context          │ Memory Engine + Governance Engine            │
│ 4. Adaptive Communication    │ Learning Engine (MDS v1.4) + LLM Layer       │
│ 5. Step-by-Step Guidance     │ Planner Engine + Execution Engine            │
│ 6. Conversation Detection    │ Memory Engine + Cognitive Orchestrator       │
│ 7. Behavior Detection First  │ Learning Engine + Cognitive Orchestrator     │
│ 8. Event-Driven Architecture │ Universal Event Bus                          │
│ 9. Event Bus                 │ Universal Event Bus                          │
│ 10. Transparency by Design   │ Governance Engine + Audit Trail              │
│ 11. Human Approval           │ Execution Engine SecurityGate (Sprint 17)    │
│ 12. Official Sources First   │ Connector Framework (MCF) + MCIS Registry    │
│ 13. Government & Citizen     │ Connector Framework (MCF) + Provider Adapter │
│ 14. Knowledge Translation    │ Knowledge Engine (MDS v1.5) + LLM Layer      │
│ 15. Arquitetura Evolutiva    │ Todos os Motores — ADR obrigatório           │
└──────────────────────────────┴──────────────────────────────────────────────┘
```

---

## Checklist de Conformidade

A cada nova Sprint, verificar:

```
CHECKLIST — ARCHITECTURAL PRINCIPLES — OBRIGATÓRIO
═══════════════════════════════════════════════════════════════════════════════

JOURNEY-CENTRIC
  [ ] Nova funcionalidade está vinculada a uma Jornada?
  [ ] Jornada persiste entre sessões?

PERSISTENT GOALS
  [ ] Contexto é preservado sem exigir reinício?

IDENTITY CONTEXT
  [ ] Contexto de identidade está declarado?
  [ ] Contextos não estão misturados?

ADAPTIVE COMMUNICATION
  [ ] Respostas se adaptam ao modo do usuário?

STEP-BY-STEP GUIDANCE
  [ ] Apenas o próximo passo é apresentado ao usuário?

CONVERSATION DETECTION
  [ ] Estados de conversa são detectados sem integração específica?

BEHAVIOR DETECTION FIRST
  [ ] Comportamento foi detectado antes de criar integração?

EVENT-DRIVEN ARCHITECTURE
  [ ] Motor reage a eventos (não polling)?
  [ ] Eventos são publicados no Event Bus?

EVENT BUS
  [ ] Nenhum motor chama outro motor diretamente?

TRANSPARENCY BY DESIGN
  [ ] Dados, fonte, acesso e políticas são visíveis ao usuário?

HUMAN APPROVAL
  [ ] Ações de alto impacto possuem confirmação obrigatória?
  [ ] requiresApproval=true está configurado no Execution Engine?

OFFICIAL SOURCES FIRST
  [ ] APIs utilizadas são oficiais e autorizadas?

GOVERNMENT & CITIZEN SERVICES
  [ ] Autenticação governamental é respeitada?
  [ ] Autorização explícita do cidadão está presente?

KNOWLEDGE TRANSLATION
  [ ] Linguagem técnica/jurídica/burocrática é traduzida?

ARQUITETURA EVOLUTIVA
  [ ] Componentes existentes foram reutilizados?
  [ ] ADR foi criado se novo motor foi necessário?
```

---

## Declaração Final

Estes 15 princípios passam a integrar oficialmente a arquitetura do MemoryOS.

São **obrigatórios** em todas as Sprints futuras.

Não alteram o Roadmap.  
Não modificam o Core.  
Não criam novos motores.

São a **filosofia** que orienta como os motores são usados, combinados e evoluídos.

---

**MDS — Architectural Principles Expansion**  
**Data:** 2026-07-10 · **Alinhamento:** MAS · MPS · MCF · MCIS · MGIS · MES · MDS 1.0–1.6 · Sprint 17