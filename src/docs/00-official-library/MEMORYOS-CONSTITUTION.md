# MEMORYOS-CONSTITUTION.md
# MemoryOS — Constituição Oficial
**Sprint SPR-GOV-01 · Engineering First**
Date: 2026-07-11
Version: 1.0
Status: OFFICIAL · FROZEN

> Princípios imutáveis da plataforma MemoryOS. Nenhum módulo, sprint, ADR ou implementação
> pode violar estes princípios. Alterações requerem votação humana explícita e nova versão major.

---

## Artigo I — Princípios do Pipeline Cognitivo

**P-01** — Somente o Conversation Engine (EF-21) inicia o pipeline cognitivo a partir de uma mensagem de usuário.

**P-02** — Todo Goal nasce exclusivamente no Goal Runtime (EF-01/EF-24). Nenhum outro módulo cria Goals diretamente.

**P-03** — Toda decisão de seleção de capability ou estratégia passa obrigatoriamente pelo Decision Engine (EF-06). Decisões locais hardcoded violam este princípio.

**P-04** — Todo plano de execução nasce exclusivamente no Planning Engine (EF-07). Nenhum módulo cria `ExecutionPlan` fora do Planning Engine.

**P-05** — Toda reflexão sobre o resultado de uma execução passa pelo Reflection Engine (EF-08). Respostas não refletidas não são entregues ao usuário.

**P-06** — Todo acesso a memórias históricas passa pelo Retrieval Engine (EF-13). Nenhum módulo consulta entidades de memória diretamente para fins cognitivos.

**P-07** — O pipeline segue ordem estrita: Intent → Goal → Decision → Planning → Execution → Reflection → Synthesis. Nenhuma etapa pode ser pulada ou reordenada.

**P-08** — O PATH A (interativo) e o PATH B (background) são mutuamente exclusivos para as etapas EF-03, EF-04 e EF-05. Goal Scheduler, Execution Queue e Dispatcher operam exclusivamente em PATH B.

**P-09** — Toda modificação ao pipeline requer ADR aprovada. Nenhum módulo se adiciona ao pipeline por autoconfiguração.

**P-10** — O pipeline é determinístico: dado o mesmo input e estado, o mesmo output é produzido. Aleatoriedade LLM é isolada e controlada via LLM Gateway (EF-23).

---

## Artigo II — Princípios de Memória

**M-01** — Somente o Memory Engine (EF-12) cria objetos `Memory`. Nenhum outro módulo persiste `Memory` diretamente.

**M-02** — Memory é imutável após criação. Nenhum módulo modifica um objeto `Memory` existente. Atualização ocorre via nova `Memory` com referência à anterior.

**M-03** — Somente o Knowledge Engine (EF-10) cria objetos `Knowledge`. `Knowledge` é gerado exclusivamente a partir de `SelfEvaluation` aprovada.

**M-04** — Somente o Learning Engine (EF-11) cria objetos `Learning`. `Learning` é gerado exclusivamente a partir de `Knowledge` aprovado.

**M-05** — A cadeia de proveniência é obrigatória: `SelfEvaluation → Knowledge → Learning → Memory`. Nenhum elo pode ser pulado.

**M-06** — Memory tem score mínimo: apenas Learnings com `learningScore >= 70` geram Memory (Memory Gate).

**M-07** — Somente o Retrieval Engine (EF-13) acessa Memory para fins de consulta cognitiva. Leitura direta de entidades de memória é proibida no pipeline cognitivo.

**M-08** — Memory não tem TTL por padrão. Arquivamento é explícito e auditável.

**M-09** — O Mirror Principle se aplica a Memory: scores e tipos são espelhados de Learning sem recalculação.

---

## Artigo III — Princípios de Capabilities

**C-01** — Capabilities nunca chamam APIs externas diretamente. Todo acesso externo ocorre exclusivamente via Connector Runtime.

**C-02** — Toda Capability deve ter um `CapabilityManifest` registrado no Capability Registry (EF-14) antes de ser executada.

**C-03** — Somente o Capability Runtime (EF-15) executa Capabilities. Nenhum módulo invoca Capability fora do Runtime.

**C-04** — Capabilities são idempotentes quando `idempotent: true` no manifest. O Runtime garante a idempotência.

**C-05** — Capabilities têm timeout máximo definido no manifest. Execução além do timeout é cancelada automaticamente.

**C-06** — Capabilities declaram explicitamente suas permissões no manifest. Execução sem permissão declarada é negada pelo Runtime.

**C-07** — O Capability Registry (EF-14) é o único canonical para discovery de Capabilities. Registries locais são proibidos após INT-04.

---

## Artigo IV — Princípios de Connectors

**CN-01** — O Connector Runtime é o único módulo autorizado a estabelecer conexões com sistemas externos. Módulos cognitivos são proibidos de conectar diretamente.

**CN-02** — Todo Connector deve ter um `ConnectorManifest` registrado antes de ser usado.

**CN-03** — Connectors são stateless. Estado de autenticação é gerenciado pelo Runtime, não pelo Connector.

**CN-04** — Toda ação de Connector é auditada. Nenhuma ação ocorre sem registro de auditoria.

**CN-05** — Rate limits declarados no manifest são respeitados pelo Runtime. Connector não implementa rate limiting próprio.

**CN-06** — Falhas de Connector são reportadas com código estruturado (`FAILED`, `TIMEOUT`, `DENIED`). Strings livres de erro são proibidas como status de retorno.

**CN-07** — Webhooks de Connector são processados pelo Runtime antes de chegarem ao pipeline cognitivo. Nenhum módulo cognitivo recebe webhook diretamente.

---

## Artigo V — Princípios de Segurança

**S-01 (Menor Privilégio)** — Cada módulo opera com o conjunto mínimo de permissões necessárias. Permissões não declaradas no manifest são negadas automaticamente.

**S-02 (Fail Safe)** — Em caso de falha ou estado desconhecido, o sistema nega a operação e registra o evento. Nenhum módulo assume permissão implícita em estado de falha.

**S-03 (Auditabilidade)** — Toda ação de módulo que produz efeito colateral gera um registro de auditoria imutável. Ações sem trilha de auditoria são inválidas.

**S-04 (Determinismo)** — Módulos determinísticos produzem o mesmo output dado o mesmo input. Variáveis externas (tempo, randomização) são declaradas e isoladas.

**S-05 (Isolamento)** — Falha em um módulo não propaga estado corrompido para outros módulos. Contratos de output são validados na fronteira.

**S-06 (Imutabilidade de Contratos)** — Contratos públicos congelados (OFFICIAL-CONTRACTS.md) não podem ser alterados em runtime. Alterações requerem ADR + nova versão.

**S-07 (Validação de Input)** — Todo módulo valida seu input antes de processar. Input inválido retorna erro estruturado, nunca produz output corrompido silenciosamente.

---

## Artigo VI — Princípios de Observabilidade

**O-01** — Todo módulo EF expõe `health()`, `metrics()`, `statistics()` e `logs()` via API unificada.

**O-02** — Health checks são síncronos e retornam em menos de 100ms. Health checks lentos são considerados falhos.

**O-03** — Métricas são cumulativas e nunca resetam em runtime. Reset de métricas requer reinicialização explícita do módulo.

**O-04** — Logs de módulo são estruturados (JSON), nunca strings livres para eventos de sistema.

**O-05** — Toda execução de pipeline produz um `correlationId` que permeia todos os módulos da cadeia. Rastreabilidade end-to-end é obrigatória.

**O-06** — Latência P99 do PATH A não deve exceder 5s. Alertas são gerados acima de 3s. SLA formal: 2s P50.

---

## Artigo VII — Princípios de Governança

**G-01** — A arquitetura só pode ser alterada via ADR aprovada por humano. Nenhuma ferramenta automatizada altera arquitetura sem aprovação explícita.

**G-02** — Canonical Declarations são imutáveis até nova ADR. O canonical atual é a única fonte de verdade para cada recurso.

**G-03** — Status `Official · Frozen` é permanente para contratos. Downgrade de `Frozen` para qualquer outro status é proibido.

**G-04** — Módulos em status `Reserved` não participam do pipeline ativo. Promoção requer ADR aprovada.

**G-05** — Módulos em status `Deprecated` não recebem novas funcionalidades. Apenas correções de segurança críticas são aceitas.

**G-06** — O OFFICIAL-COMPONENT-REGISTRY.md é a fonte de verdade para status de módulos. Discrepâncias entre código e registry são resolvidas pelo registry.

**G-07** — ADRs em status `Proposed` são tratadas como decisões não-tomadas. Código não pode ser implementado baseado em ADR Proposed sem aprovação explícita.

**G-08** — O Architecture Freeze é o estado normal da plataforma. Unfreeze é um evento excepcional documentado e justificado.

---

## Artigo VIII — Princípios de Evolução

**E-01** — Novos módulos EF entram como `Reserved` e progridem para `Official` após certificação completa (28 cenários mínimos + ADR aprovada).

**E-02** — Certificação de módulo EF requer: TypeScript puro, sem side effects externos, 28+ cenários de aceitação, health/metrics/statistics/logs, contrato público.

**E-03** — A promoção de `Reserved` para `Official` não ocorre automaticamente. Requer sprint dedicada, ADR, e aprovação humana.

**E-04** — Módulos Legacy podem coexistir com módulos EF durante o período de migração. Coexistência é temporária e tem data de fim documentada.

**E-05** — Deprecação é irreversível. Um módulo `Deprecated` nunca retorna a `Official`. Funcionalidade deve ser reimplementada como novo módulo.

**E-06** — Breaking changes em contratos públicos requerem nova versão major (v2.0 → v3.0). Backward compatibility é obrigatória dentro da mesma versão major.

---

## Artigo IX — Princípios de Dados

**D-01** — Entidades Base44 são o único mecanismo de persistência oficial. Módulos não implementam storage próprio.

**D-02** — Schemas de entidade são versionados. Migrações de schema são declarativas e reversíveis.

**D-03** — PII (Personally Identifiable Information) nunca é armazenada em campos de metadata, tags ou logs. PII fica exclusivamente em entidades com controle de acesso explícito.

**D-04** — Bulk operations (bulkCreate, bulkUpdate) são preferidas a loops de operações individuais para volumes > 10 registros.

**D-05** — Nenhum campo de entidade armazena blobs, base64 ou conteúdo binário. Arquivos são armazenados via UploadFile e referenciados por URL.

---

## Artigo X — Princípios de Qualidade

**Q-01** — Todo módulo EF tem cobertura mínima de 28 cenários de aceitação antes de ser promovido a `Official`.

**Q-02** — Cenários de hardening (edge cases, failure modes) são obrigatórios e devem representar no mínimo 30% dos cenários totais.

**Q-03** — Nenhum módulo EF usa `any` como tipo TypeScript em sua API pública. Tipos são explícitos e validados.

**Q-04** — Módulos EF são puros por padrão: sem side effects, sem I/O, sem state global. Side effects são declarados explicitamente no manifest.

**Q-05** — Performance: módulos determinísticos (sem LLM) executam em menos de 50ms para inputs típicos.

---

## Histórico de Versões

| Versão | Data | Mudança | Aprovado por |
|---|---|---|---|
| 1.0 | 2026-07-11 | Criação — SPR-GOV-01 | Pendente aprovação humana |

## Referências

- MEMORYOS-ARCHITECTURE-v2.0.md
- OFFICIAL-CONTRACTS.md
- ARCHITECTURE-FREEZE-DECLARATION.md
- OFFICIAL-COMPONENT-REGISTRY.md

---

*SPR-GOV-01 · 2026-07-11 · MemoryOS Architecture v2.0 · OFFICIAL · FROZEN*