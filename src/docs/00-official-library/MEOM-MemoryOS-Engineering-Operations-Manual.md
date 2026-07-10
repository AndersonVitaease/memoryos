# MEOM — MemoryOS Engineering Operations Manual
## Official Engineering Operations Guide

**Version:** 1.0  
**Status:** Official Engineering Operations  
**Foundation:** v1.0  
**Declared:** 2026-07-10  
**Authority:** Foundation Committee

---

## Objetivo

Criar o manual oficial de operações da equipe de engenharia do MemoryOS.

Este documento **NÃO altera:**
- Foundation · Core · Runtime · APIs · SDKs
- Governança · Roadmap · MERS · MADS

Seu objetivo é definir como o desenvolvimento acontece no dia a dia, garantindo que todas as equipes trabalhem de forma consistente, reproduzível e alinhada à Foundation v1.0.

---

## Capítulo 1 — Filosofia Operacional

| Princípio | Descrição |
|---|---|
| Orientado por evidências | Toda decisão técnica deve ser suportada por dados, métricas ou referência à Foundation |
| Implementação incremental | Entregas pequenas, frequentes e testáveis a cada Sprint |
| Qualidade contínua | MRI + MQCCS + MERS + MADS executados em todo ciclo |
| Automação | Scripts, pipelines e validações automatizadas sempre que possível |
| Revisão técnica obrigatória | Nenhum merge sem Engineering Review aprovado |
| Transparência | Status, blockers e decisões visíveis para toda a equipe |
| Melhoria contínua | Retrospectivas formais e Lessons Learned registrados permanentemente |

---

## Capítulo 2 — Ciclo de Vida de uma Task

```
Backlog → Sprint Planning → Task → Implementação
→ MRI → MQCCS → MERS → Correções → MADS
→ Merge → Release → Monitoramento → Lessons Learned
```

| Etapa | Responsável | Artefato |
|---|---|---|
| Backlog | Product Owner | MEB atualizado |
| Sprint Planning | Tech Lead + PO | Sprint Goal, Task List |
| Task | Desenvolvedor | Branch criado |
| Implementação | Desenvolvedor | Código + Testes + JSDoc |
| MRI | QA + Dev | MRI Report |
| MQCCS | QA | MQCCS Certificate |
| MERS | Eng. Review Specialist | MESR Report |
| Correções | Desenvolvedor | Fixes aplicados |
| MADS | Eng. Review Specialist | Drift Report |
| Merge | Tech Lead | PR aprovado |
| Release | Release Manager | CHANGELOG + Tag |
| Monitoramento | Tech Lead | Alertas configurados |
| Lessons Learned | Time completo | LL registrado no MEB |

---

## Capítulo 3 — Papéis e Responsabilidades

### Tech Lead
- **Responsabilidades:** Coordenar o time técnico, aprovar merges, garantir aderência à Foundation, resolver conflitos arquiteturais
- **Limites:** Não implementa features sem revisar impacto na arquitetura
- **Aprovações:** PR merge, Sprint Goal, decisões de rollback

### Arquiteto
- **Responsabilidades:** Manter a integridade arquitetural, produzir RFCs, revisar ADRs, conduzir auditorias
- **Limites:** Não implementa código de produção diretamente
- **Aprovações:** RFCs, ADRs, changes em interfaces públicas

### Desenvolvedor
- **Responsabilidades:** Implementar Tasks, escrever testes, manter documentação, seguir convenções
- **Limites:** Não faz merge sem aprovação do Tech Lead
- **Aprovações:** Próprias Tasks após MRI + MQCCS pass

### QA
- **Responsabilidades:** Executar MRI, MQCCS, validar critérios de aceitação, relatório de bugs
- **Limites:** Não aprova código sem execução completa dos pipelines
- **Aprovações:** MRI Report, MQCCS Certificate

### Engineering Review Specialist
- **Responsabilidades:** Executar MERS e MADS, emitir MESR, detectar regressões, recomendar refatorações
- **Limites:** Não bloqueia sem evidência técnica documentada
- **Aprovações:** MESR, MADS Drift Report, Quality Gate final

### Product Owner
- **Responsabilidades:** Priorizar backlog, definir critérios de aceitação, validar entrega de valor
- **Limites:** Não aprova merges técnicos
- **Aprovações:** Sprint Goal, Definition of Done de produto

### Release Manager
- **Responsabilidades:** Coordenar releases, CHANGELOG, versionamento, comunicação de mudanças
- **Limites:** Não libera release sem MERS aprovado
- **Aprovações:** Tag de versão, release notes

### AI Specialist (quando aplicável)
- **Responsabilidades:** Integrar capacidades de LLM, validar prompts, garantir determinismo cognitivo
- **Limites:** Não introduz não-determinismo em fluxos críticos sem aprovação do Arquiteto
- **Aprovações:** Integrações de IA, mudanças em pipelines cognitivos

---

## Capítulo 4 — Workflow de Desenvolvimento

### Branches
```
main          — branch estável, somente via PR aprovado
develop       — branch de integração do Sprint
feature/XXX   — branch de feature (ex: feature/wme-ttl-extension)
fix/XXX       — branch de correção
release/vX.Y  — branch de release candidate
hotfix/XXX    — branch de hotfix urgente
```

### Convenção de Commits
```
feat(scope): descrição da feature
fix(scope): descrição da correção
refactor(scope): refatoração sem mudança de comportamento
test(scope): adição ou correção de testes
docs(scope): atualização de documentação
chore(scope): manutenção técnica sem impacto funcional
```

### Pull Requests
- Título segue convenção de commits
- Descrição: problema → solução → impacto → testes realizados
- Mínimo 1 reviewer obrigatório (Tech Lead ou Arquiteto)
- MRI + MQCCS devem passar antes da revisão humana

### Critérios de Merge
- [ ] Todos os testes passando
- [ ] MRI aprovado
- [ ] MQCCS aprovado
- [ ] MERS aprovado (Sprint Review)
- [ ] Reviewer aprovado
- [ ] Sem conflitos

### Rollback
- Critério: bug crítico em produção ou security incident
- Executor: Release Manager + Tech Lead
- Procedimento: reverter tag → comunicar → post-mortem em 48h

---

## Capítulo 5 — Gestão de Sprints

### Planejamento
- Input: MEB priorizado pelo PO
- Output: Sprint Goal + Task List estimada
- Artefato: Sprint Planning Doc no MEB

### Execução
- Daily standups: blockers, progresso, próximos passos
- Branch por feature, commits frequentes e atômicos
- Testes escritos junto com o código (não depois)

### Acompanhamento
- Burndown atualizado diariamente
- Blockers escalonados imediatamente ao Tech Lead
- MERS mid-sprint opcional para Sprints > 2 semanas

### Sprint Review
- Demo das funcionalidades entregues
- MESR apresentado pelo Engineering Review Specialist
- Critérios de aceitação validados pelo PO

### Retrospectiva
- O que funcionou bem?
- O que precisa melhorar?
- Ações concretas para o próximo Sprint
- Lessons Learned registrados permanentemente no MEB

### Artefatos Obrigatórios por Sprint
| Artefato | Responsável |
|---|---|
| MRI Report | QA |
| MQCCS Certificate | QA |
| MESR (MERS Report) | Eng. Review Specialist |
| MADS Drift Report | Eng. Review Specialist |
| Sprint Planning Doc | Tech Lead |
| Lessons Learned | Time completo |
| CHANGELOG atualizado | Release Manager |

---

## Capítulo 6 — Qualidade Contínua

```
Implementação concluída
        ↓
MRI — valida que a implementação segue os cenários da referência
        ↓
MQCCS — certifica compliance, qualidade e cobertura
        ↓
MERS — revisa arquitetura, segurança, performance, engineering score
        ↓
MADS — verifica drift arquitetural e dívida técnica acumulada
        ↓
Aprovação final
```

| Pipeline | Quando executar | Bloqueador |
|---|---|---|
| MRI | Após implementação, antes do PR | SIM |
| MQCCS | Após MRI pass | SIM |
| MERS | Ao final do Sprint | SIM |
| MADS | Após MERS, antes do merge | SIM |

---

## Capítulo 7 — Gestão de Incidentes

### Classificação
| Severidade | Critério | SLA Resposta |
|---|---|---|
| SEV-1 | Sistema indisponível / breach de segurança | < 15 min |
| SEV-2 | Funcionalidade crítica degradada | < 1 hora |
| SEV-3 | Funcionalidade não-crítica afetada | < 4 horas |
| SEV-4 | Bug menor sem impacto ao usuário | Próximo Sprint |

### Fluxo
1. **Detecção** — alerta ou reporte
2. **Classificação** — severidade definida
3. **Priorização** — equipe alocada
4. **Investigação** — root cause analysis
5. **Correção** — hotfix ou fix/branch
6. **Post-mortem** — obrigatório para SEV-1 e SEV-2
7. **Prevenção** — action items registrados no MEB

### Post-mortem (obrigatório SEV-1/SEV-2)
- Timeline do incidente
- Root cause
- Impacto
- Ações de correção tomadas
- Ações de prevenção (com responsável + prazo)

---

## Capítulo 8 — Gestão de Dívida Técnica

### Registro
- Todo item de dívida identificado no MERS/MADS é registrado no MEB
- Campos: origem, impacto, risco, esforço, recomendação, sprint_origin

### Priorização
| Nível | Ação |
|---|---|
| Critical | Resolve no Sprint atual antes de novas features |
| High | Entra obrigatoriamente no próximo Sprint Planning |
| Medium | Priorizado nos próximos 2 Sprints |
| Low | Backlog priorizado |
| Informational | Backlog livre |

### Pagamento
- Reservar ≥ 20% da capacidade do Sprint para dívida técnica
- Itens Critical nunca podem ser adiados

### Métricas
- Dívida introduzida vs resolvida por Sprint
- Trend histórico (MADS Cap.4)
- MTTR por nível de severidade

---

## Capítulo 9 — Gestão de RFCs e ADRs

### Quando abrir uma RFC
- Nova feature com impacto arquitetural
- Breaking change em interface pública
- Adição de novo módulo ou serviço
- Mudança em protocolo ou contrato
- Qualquer alteração nos documentos da Foundation

### Quando criar um ADR
- Toda RFC aprovada gera um ADR
- Decisões técnicas relevantes tomadas durante implementação
- Quando uma abordagem alternativa foi considerada e descartada

### Aprovação
| Tipo | Aprovadores |
|---|---|
| RFC menor | Tech Lead + Arquiteto |
| RFC maior (impacto em Core) | Tech Lead + Arquiteto + Foundation Committee |
| ADR | Arquiteto |

### Relação com a Foundation
- RFC deve referenciar documentos afetados da Foundation
- ADR deve citar a RFC aprovada
- Implementação deve referenciar o ADR no código (comentário ou JSDoc)

---

## Capítulo 10 — Release Management

### Versionamento
```
MAJOR.MINOR.PATCH
MAJOR — breaking changes
MINOR — novas features retrocompatíveis
PATCH — bugfixes e correções menores
```

### Fluxo de Release
1. **Feature Freeze** — branch `release/vX.Y` criado
2. **Release Candidate** — testes de homologação
3. **MERS Final** — Engineering Review do release
4. **Homologação** — validação pelo PO e QA
5. **Produção** — tag + deploy + monitoring
6. **Comunicação** — CHANGELOG publicado

### Rollback
- Critério documentado no runbook
- Executor: Release Manager
- Post-mortem obrigatório

### Comunicação
- CHANGELOG atualizado antes de qualquer release
- Breaking changes destacados explicitamente
- Comunicado interno para o time de engenharia

---

## Capítulo 11 — Métricas Operacionais

| Métrica | Definição | Target |
|---|---|---|
| Lead Time | Criação da task até produção | < 5 dias |
| Cycle Time | Início da implementação até merge | < 3 dias |
| Throughput | Tasks concluídas por Sprint | Crescente |
| Bugs por Sprint | Bugs abertos no Sprint | ↓ trend |
| Retrabalho | % de tasks reabertas | < 10% |
| Dívida Técnica | Pontos acumulados (MADS) | ↓ trend |
| Estabilidade | % uptime / incidentes por mês | ≥ 99.5% |
| MERS Pass Rate | % de Sprints aprovados sem ressalvas | ↑ trend |

---

## Capítulo 12 — Checklist Operacional

Toda Sprint deve responder **SIM** a todas as perguntas:

```
□ Todas as Tasks do Sprint concluídas?
□ MRI aprovado (zero falhas)?
□ MQCCS aprovado (certificação emitida)?
□ MERS aprovado (MESR gerado)?
□ MADS aprovado (drift report sem Critical)?
□ Documentação atualizada (JSDoc + README)?
□ RFCs abertas quando necessário?
□ ADRs criados para decisões relevantes?
□ CHANGELOG atualizado?
□ Lessons Learned registrados no MEB?
□ Dívida técnica Critical zerada?
□ Release preparada (se aplicável)?
```

Qualquer **NÃO** bloqueia o fechamento do Sprint.

---

## Critérios de Aceitação

- ✓ Existe processo operacional completo para equipes de engenharia
- ✓ Todas as etapas do ciclo de desenvolvimento estão documentadas
- ✓ Papéis e responsabilidades estão definidos
- ✓ O fluxo operacional está alinhado à Foundation
- ✓ A equipe pode executar Sprints de forma consistente usando apenas este manual

---

## Declaração Final

O MEOM oficializa a forma como equipes de engenharia implementam, validam, aprovam e evoluem o MemoryOS.

- A **Foundation** define a plataforma.
- O **MEB** define o trabalho.
- O **MRI, MQCCS, MERS e MADS** garantem qualidade.
- O **MEOM** garante que pessoas e ferramentas trabalhem de forma coordenada para transformar a arquitetura em software de produção.

---

*MEOM v1.0 — MemoryOS Foundation v1.0 — Declarado em 2026-07-10*