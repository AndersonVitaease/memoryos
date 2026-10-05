# DESIGN-GUARDIAN-MT-01 — Guardian como produto multi-tenant + layout do Guardian no Hermes agent

**Data:** 2026-10-05 · **Missão:** RD-GUARDIAN-MT-DESIGN-01 · **Natureza:** DESIGN (documento; zero código, zero config de produção)
**Decisão-fonte:** memória durável `ec4c373d` (projeto `guardian-mt`, 05/10 09:47 BRT, force=true por ordem do operator)
**Harness-base:** `/opt/operator-harness/` (commit `cad98ca`) · **Status do produto hoje:** single-tenant — 1 operador (fornecedor), 1 herdr, 1 gateway Hermes, 1 plugin mission-ops, 1 eng-mcp (catálogo v152/152 tools).

**Decisão de contexto (do operator, vale como premissa):**
- O **Guardian será oferecido como harness para CONSOLIDADORAS** — cada consolidadora = **1 tenant** (harness próprio).
- Os **colaboradores** de cada consolidadora acessam o Guardian **diariamente** para executar seu trabalho.
- O **login do usuário final é no HERMES AGENT**, que recebe o **LAYOUT DO GUARDIAN** (item central desta missão).
- O usuário final opera **como o operador faz hoje**: pode acessar o **herdr via terminal** e **todos os outros sistemas**.
- Roadmap de integrações: **P2 Wooba** (primeira; credencial pendente — STATUS-WOOBA-TOOLS-02) → **P3** GDS, emails, chat, outros.

---

## 0. Decisões de desenho tomadas nesta missão (escopo técnico — dono: a missão)

| ID | Decisão | Justificativa |
|---|---|---|
| **D1** | **Silo por tenant** — 1 harness completo (herdr + gateway Hermes + mission-ops + eng-mcp) por consolidadora, com `tenantId` presente em TODO schema desde o dia 1 e valor `default` na operação atual. Não é multi-tenant compartilhado (nem banco, nem pane, nem sandbox compartilhados). | É a leitura literal do contexto ("harness próprio"); isola dados de clientes das consolidadoras por construção (fronteira de implantação > fronteira de código); a operação atual vira o tenant `default` sem migração de dados. |
| **D2** | **`tenantId` ubiquo nos schemas** (ledger, spool, audit, approvals, spend, roadmap, KB-projectId) com default `default`. | Torna a centralização futura (console do fornecedor, §5 F4) uma agregação de dado existente — nunca uma migração. |
| **D3** | **3 papéis**: `collaborator` (usuário final da consolidadora), `tenant-admin` (admin da consolidadora), `operator` (fornecedor — o papel que existe hoje). Papel é atributo da sessão, resolvido server-side no login, nunca autodeclarado (mesma lição da ancestría do R3/R4 da DOCTRINE). | O operator de hoje já é um papel; nada do que existe muda — o produto acrescenta dois papéis abaixo dele. |
| **D4** | **Consequência em duas camadas de token**: o token de ordem do operator-fornecedor (`/data/manifests/operator-order-token.json`, ativo 04/10) continua dono de ship/deploy/infra; **token de consequência de negócio do tenant** (novo, mesmo contrato SEC-OPERATOR-IDENTITY-01, hash 0600 por tenant, allowlist Telegram/chat por tenant) é dono das ações de consequência do NEGÓCIO da consolidadora (ex.: emissão Wooba tier-3). | Emissão de bilhete é consequência externa do negócio do tenant, não do fornecedor; misturar os dois tokens seria o operator-fornecedor aprovar emissão de cliente da consolidadora — violação de fronteira. Mecanismo idêntico ao provado (GUARDIAN-MOBILE-01 approval-card + operator_token). |
| **D5** | **Layout = 2 camadas**: (a) **tema Guardian** = config existente (`tui-theme-boot.json` — cores/brand/strings, `version:1`) — novo arquivo de tema, zero código; (b) **telas/onboarding** = código novo no lado Hermes agent (comandos slash + painéis), único trabalho de desenvolvimento do layout. | O tema já cobre statusGood/Warn/Bad/Critical — a semântica visual de status já existe; o que falta é a organização de telas do colaborador. |
| **D6** | **Credencial de integração por tenant**: Wooba (e futuras P3) têm credencial por consolidadora em vault próprio do tenant (`/root/.hermes/vault/tenants/<tenantId>/`, 0600) — NUNCA em código, config de produção ou env compartilhado. | Cada consolidadora tem account próprio no portal; a credencial do portal de um tenant nunca pode consultar localizador de outro. |
| **D7** | **O herdr é modo avançado, não caminho primário.** O colaborador vive no chat do Hermes agent; `/terminal` abre o pane herdr da sessão DELE dentro do harness DELE (mesmo usuário, mesma identidade). | É a leitura literal do contexto ("acessa o herdr via terminal se desejar"); o terminal é a válvula de escape, o produto é o chat governado. |
| **D8** | **Work manual fora do harness = finding.** Toda tarefa que o colaborador executa manualmente num sistema (portal, email, GDS) quando existe tool governada para ela é registrada como finding no spool (evento `manual_work_detected`), alimentando o roadmap de integrações. | É a doutrina do operator aplicada ao produto; transforma atrito do usuário em fila priorizada por evidência real de uso. |

---

## 1. Modelo multi-tenant

### 1.1 Identidade e schemas (onde o `tenantId` entra)

Todo registro persistido ganha o campo `tenantId` (slug: `^[a-z0-9][a-z0-9-]{2,31}$`, ex. `mt-continental`; a operação atual = `default`). Fronteira por fronteira no mission-ops/herdr de hoje:

| Superfície | Hoje | Corte multi-tenant | Mecanismo |
|---|---|---|---|
| **Ledger** (`/root/.hermes/mission-state/*.json`) | 1 arquivo `<missionId>.json` | campo `tenantId` em todo ledger (default `default`); `mission_list`/`mission_verify`/`close` resolvem por `(tenantId, missionId)`; o case do missionId segue EXATAMENTE igual (regra atual) | campo novo + filtro no `_scan_state` — zero mudança de path (D1: silo) |
| **Spool** (`spool.jsonl`) | eventos de auditoria globais | `tenantId` em cada evento (campo opcional retrocompatível: ausente = `default`) | mesmo jsonl, campo novo — o parse atual ignora campo desconhecido |
| **Fila por tenant** | fila única (roadmap + consumer do orquestrador) | consumer promove somente missões do tenant do seu harness; em console central (F4) a fila é agregada POR `tenantId` (nunca cruzando) | o silo (D1) já isola a fila; o campo habilita a agregação |
| **Pane por tenant** | workspaces do herdr (w7) | dentro do tenant: sem mudança (o herdr inteiro é do tenant). Em console central: painel por `tenantId`, sem interação cross-tenant (leitura agregada apenas) | D1 + D7 |
| **Auth / login** | gateway single-operator (token de ordem; Telegram allowlist global) | login de usuário final no Hermes agent (§1.2); sessão carrega claims `{tenantId, userId, role}` resolvidos server-side | §1.2 |
| **Usuários por tenant** | não existe store de usuários | `users.json` por tenant (0600, gravação atômica — padrão dos intents do approval-card), criado/gerido pelo `tenant-admin` pela tela (nunca shell) | §1.2 |
| **Custo / orçamento** | spend por sessão no ledger (`cost_unmeasured`/`spend`, RD-OPS-03) | `tenantId` no registro de spend; **budget por tenant** (orçamento mensal em config do tenant); estouro → gate tipado `TENANT_BUDGET_EXCEEDED` pausa missões não-críticas e emite card ao tenant-admin — NUNCA corta missão em voo silenciosamente | spend já tem fórmula declarada (tabela de preços); o budget é config-dado por tenant |
| **Sandbox** | vast_sandbox + worktrees do harness | sandbox por tenant (dentro do harness do tenant — isolado por construção). Sandbox NUNCA compartilhada entre tenants (dados de clientes) | D1 |
| **Release / SHIP** | SHIP-<alvo>-NN via missão herdr; push com approval + expectedHead | ship do harness do tenant = pipeline do fornecedor (deploy da imagem do harness); ship de código do tenant (ex.: integração custom) = missão no herdr do tenant com token do tenant-admin (D4) | R2 (SHIP SEMPRE via herdr) mantida; o token muda por camada |
| **Guardas** | supervisor_guard, shell guard (allowlist por componente), tiering 0-3, token de ordem | TODOS mantidos 1:1 no harness de cada tenant; allowlists viram catálogo por tenant (`shell-allowlist-<tenantId>-<componente>.json`); tiering idêntico (financeiro/aprovação NUNCA camada rápida — agora com D4: tier-3 de negócio usa token do tenant-admin) | doutrina R1-R9 aplicada por tenant |
| **KB / memória** | memoryos por projectId (mapa cwd→projeto) | `projectId` por tenant (`<tenantId>-<projeto>`); mapa cwd do tenant resolve dentro do seu harness | resolve_project_for_cwd recebe prefixo |
| **Audit eng-mcp** | jsonl por domínio (`shell-run.jsonl`, `wooba-tools.jsonl`…) | `tenantId` em cada linha (default `default`); hash16 continua como está — nunca token/chat em claro | campo novo, mesmo padrão do spool |

### 1.2 Auth por consolidador (login no Hermes agent)

- **Store:** `/root/.hermes/vault/tenants/<tenantId>/users.json` (0600) — `userId`, hash de senha (bcrypt/argon2, NUNCA plaintext), `role`, `createdAt`, `disabled`. Criação/reset pelo `tenant-admin` via tela do Guardian (§2), com card de aprovação quando o alvo é o próprio tenant-admin (auto-elevação recusada — `TENANT_SELF_ELEVATION_FORBIDDEN`).
- **Login:** na TUI do Hermes agent (primeira tela antes do chat): usuário+senha do tenant. Falha = recusa tipada + evento `login_failed` (hash16 do userId, sem senha) no spool. Sessão = claims `{tenantId, userId, role}` injetados server-side (mesma lição da ancestría do eng-mcp: identidade resolvida pelo servidor, nunca do payload).
- **Propagação dos claims:** env das sessões de agente do tenant (`HERDR_SENDER`/`MISSION_SENDER` já têm o padrão: identidade declarada e verificada por ancestría — `guardian:<tenantId>:<userId>`); todo pane-write e todo audit carrega os claims.
- **Tokens de consequência (D4):** operator-fornecedor mantém `/data/manifests/operator-order-token.json` (já ativo); tenant-admin tem token equivalente por tenant (`operator-allowlist-<tenantId>.json` para a camada 2 Telegram/chat). O guard valida a camada pelo ALVO da ação: infra/ship → token do fornecedor; negócio do tenant → token do tenant. Token de um nível NUNCA aprova ação do outro (`TENANT_TOKEN_SCOPE_MISMATCH`).
- **O que NÃO muda:** o token de ordem do operator de hoje continua funcionando exatamente como está (R4) — o tenant `default` é a operação atual.

### 1.3 Isolamento de custo/orçamento por tenant

- **Medição:** spend já tem fórmula declarada (RD-OPS-03-SPEND-01; tabela `/opt/mission-events/orchestrator-price-table.json` como config-dado). Novo: `tenantId` no registro e **agregação mensal por tenant**.
- **Budget:** config-dado por tenant (`budget.monthlyUsd`, `budget.alertPct`). Alerta em 80% (card ao tenant-admin); 100% → `TENANT_BUDGET_EXCEEDED`: missões novas do tenant entram `waiting_operator` (do tenant-admin) com card de aprovação de estouro; missão em voo NUNCA é morta (liveness honesta — R9).
- **Plano:** a tabela de preços pode diferir por tenant (config-dado por tenant) — a fórmula é a mesma, o preço é dado.

---

## 2. Layout do Guardian no Hermes agent

### 2.1 O que JÁ é config (trabalho: novo arquivo de tema, zero código)

O Hermes agent já expõe tema completo em `tui-theme-boot.json` (`version:1`): cores semânticas (`ok`/`error`/`warn`/`statusGood`/`statusWarn`/`statusBad`/`statusCritical`), cores de composição (selection, diff, completion, syntax), e **brand strings** (`name`, `icon`, `prompt`, `welcome`, `goodbye`, `tool`, `helpHeader`, `bannerLogo`, `bannerHero`).

**Tema "Guardian"** (novo json, mesmo schema — troca de tema é config):
- `name: "Guardian"`, `icon`/`prompt`/`welcome`/`goodbye` em **pt-BR** (R6): welcome = "Bem-vindo ao Guardian. Digite sua mensagem ou /help para os comandos."
- Paleta de trabalho (calma, alto contraste, legível diariamente): fundo escuro neutro; `statusGood/Warn/Bad/Critical` **mantêm a semântica exata que já existe** (verde/âmbar/laranja/vermelho) — os painéis de status do Guardian (§2.3) usam essas chaves, não cores novas.
- Diferencial visual por papel: o chat do `collaborator` usa o tema Guardian; o `operator` (fornecedor) mantém o tema Hermes atual no MESMO binário (tema é config por papel/sessão) — o fornecedor nunca confunde sua tela com a tela do produto.

### 2.2 O que é trabalho NOVO (código no lado Hermes agent)

Três telas + onboarding, todas acessíveis por comando slash e painel fixo — **o chat continua sendo o corpo da tela** (o trabalho do colaborador é conversa com tools governadas; as telas orbitam o chat):

1. **Onboarding do colaborador** (primeiro login de cada `userId`): tela sequencial em 4 passos — (i) quem sou eu (nome, consolidadora/tenantId, papel); (ii) o que posso fazer (pedir ao Guardian: consultar, verificar, preparar ações); (iii) o que NUNCA faço (trabalho manual no portal/GDS quando o Guardian cobre = **finding**, D8; financeiro/aprovação nunca passa pela camada rápida); (iv) atalhos (`/ajuda`, `/missoes`, `/status`, `/terminal`). Conclusão grava `onboarding_completed` no spool (telemetria por tenant; reexibível com `/onboarding`).
2. **Tela Missões** (`/missoes`): lista das missões do USUÁRIO (scopo por claims) — estado (em execução/aguarda aprovação/concluída), dívidas, link do relatório. Leitura do ledger filtrada por `(tenantId, userId)`.
3. **Tela Status** (`/status`): o estado honesto do tenant (R9 — presença ≠ vivo, probes reais): integrações (Wooba: conectada/pendente-credencial), orçamento do mês (consumido/limite), últimas aprovações, versão do harness.
4. **Painel Aprovações** (`/aprovacoes`, visível a `tenant-admin`): os cards `waiting_operator` do tenant (mesma mecanica GUARDIAN-MOBILE-01: intent tipado 0600 + TTL + recusa pós-expiração), com botões APROVAR/CANCELAR que validam o token de consequência do tenant (D4). O colaborador comum vê só as SUAS solicitações pendentes, sem poder aprovar.

**Barra de status (topo, sempre visível):** `Guardian · <Consolidadora (tenantId)> · <userId/papel> · orçamento 43% · Wooba conectada` — todos os campos vêm de config/audit existente; estouro de budget e integração caída mudam a cor via chaves de status do tema (já existentes).

**Comandos slash novos:** `/ajuda` (alias pt-BR do /help), `/missoes`, `/status`, `/aprovacoes`, `/terminal`, `/onboarding`. Nenhum comando executa ação de consequência — aprovação só via painel com token (mesma doutrina: texto no chat não é ordem, R4).

### 2.3 Modo avançado (herdr via terminal)

- `/terminal` abre o pane herdr da sessão do usuário **dentro do harness do tenant** (D7): mesmo usuário, mesmas claims, mesma auditoria (`pane-writes.jsonl` com sender `guardian:<tenantId>:<userId>`).
- Dentro do terminal, o usuário encontra o herdr completo como o operador usa hoje (panes, missões, claudes) — MAS as missões de consequência continuam atrás dos mesmos guardas (o terminal não é bypass: guard é código no caminho, não cortina da TUI).
- Colaborador comum não precisa do terminal nunca; o terminal existe para o usuário avançado da consolidadora — e para o fornecedor operar o harness (como hoje).

---

## 3. Jornada do colaborador (login → trabalho diário)

**Exemplo canônico do dia-a-dia (viaja com o P2 Wooba):**

1. **Login** na TUI Hermes (usuário+senha) → onboarding na primeira vez → barra de status mostra tenant, papel, orçamento, integrações.
2. **Pede em linguagem natural:** "verifique o localizador ABC123, consulte o e-mail do cliente e veja se está tudo pronto para a emissão" → pipeline determinística de 3 tools `wooba.*` (WOOBA-TOOLS-01): verificar localizador → `sales/list` por locator; e-mail → `sales/details` + fallback `ota/customer/search`; prontidão → `TransactionStates` `Issued/Issuing`. **Tier-1 leitura: auto, resposta em segundos** — o colaborador vê um badge de origem da resposta (resposta rápida/verificando) com transparência honesta de latência (regex = custo zero e invisível; camada rápida = centavos; frontier só em decisão/verificação).
3. **Pede consequência:** "emite o bilhete" → **tier-3**: NENHUMA camada rápida aprova, NENHUMA preauth aprova (barreira antes de artefato), parallelismo NUNCA move o gate. O Guardian cria o intent tipado + card ao `tenant-admin` (§2.3/2.4): [APROVAR] [CANCELAR] com TTL; sem toque → permanece pendente, nunca executa por default. Aprovação exige o token de consequência do tenant (D4). **O colaborador nunca vê nem possui esse token.**
4. **Trabalho manual = finding (D8):** se o colaborador executa manualmente algo que o Guardian cobre (ou tenta colar conteúdo externo no chat — proibido; conteúdo externo entra por tool), o evento `manual_work_detected` alimenta o roadmap de integrações do tenant.
5. **Fim do dia:** `/missoes` mostra o que foi executado, com dívidas honestas; `/status` mostra o orçamento consumido pelo tenant.

**Regras duras que atravessam toda a jornada** (iguais à doutrina do operator, agora visíveis ao usuário final): financeiro/aprovação NUNCA na camada rápida; consequência sempre com token verificado (R4); liveness honesta (parado = parado, R9); pt-BR sempre (R6); provas antes de alegar (R8).

---

## 4. Caminho P2 Wooba (primeira integração)

- **Estado real:** desenho concluído (WOOBA-TOOLS-01 closed: 14 tools `wooba.*` no eng-mcp, tiering 0-3, audit `/data/audit/wooba-tools.jsonl`, E2E canônico definido); **implementação WOOBA-TOOLS-02 PAUSED por ordem do operator — travada SOMENTE na credencial sandbox**; retoma só por ordem nova e explícita do operator (sem auto-retomada).
- **Encaixe multi-tenant (decisões D4/D6):**
  - **Credencial por tenant** (D6): a consolidadora tem account próprio no portal Wooba → credencial sandbox/produção por tenant no vault do tenant. A credencial do tenant `default` (a do operator, quando concedida) pilota a implementação; cada novo tenant registra a sua no onboarding do tenant (feito pelo tenant-admin, via tela — a credencial nunca é digitada em chat/código).
  - **Tier-3 de emissão = token do tenant-admin** (D4): a emissão é consequência do negócio da consolidadora — mesmo mecanismo (barreira, TTL, fail-closed), token por tenant.
  - **Allowlist por tenant:** `shell-allowlist-wooba.json` vira base + override por tenant (`shell-allowlist-<tenantId>-wooba.json`).
  - **Audit:** `wooba-tools.jsonl` ganha `tenantId` — a trilha de quem emitiu o quê fica por tenant (obrigatório para portal B2B).
- **Sequência proposta:** (1) operator concede credencial sandbox do tenant `default` → (2) WOOBA-TOOLS-02 (implementação, tiers PLAN/operator grantados pelo operator) → (3) piloto no tenant `default` → (4) template de onboarding de tenant com credencial Wooba própria → (5) rollout P3 (GDS, emails, chat) reutilizando o mesmo padrão de D4/D6.

---

## 5. Migração do hoje (single-tenant) para o multi

**Princípio: zero-breaking para o operador atual.** Todo schema novo aceita `tenantId` ausente = `default`; todo caminho existente continua funcionando sem nenhum campo novo preenchido.

| Fase | Escopo | Quebra o operador atual? |
|---|---|---|
| **F0 — schemas com tenantId** | campo `tenantId` (default `default`) em ledger/spool/audit/spend/approvals/roadmap/KB-projectId; nenhum comportamento novo | Não (campo opcional retrocompatível) |
| **F1 — login + layout Guardian** | store de usuários por tenant, login na TUI, claims server-side, tema Guardian (config), onboarding, `/missoes`/`/status`/`/terminal` | Não — o operator `default` continua entrando como entra hoje (papel `operator` ignora o login novo) |
| **F2 — aprovações do tenant + orçamento** | painel `/aprovacoes` (tenant-admin), token de consequência por tenant (D4), budget por tenant com gate `TENANT_BUDGET_EXCEEDED` | Não — tenant `default` não tem budget configurado (sem gate) e continua com o token do operator |
| **F3 — empacotamento por consolidadora** | bootstrap de 1 harness completo por tenant (imagem/config/vault/allowlists); remotes por tenant (pré-requisito: RD-MOPS-03 — o repo hoje NUNCA teve remote); playbook de onboarding do tenant | Não — o operador atual já roda a instância `default`; novas consolidadoras são instâncias novas |
| **F4 — console central do fornecedor (opcional)** | agregação read-only por `tenantId` (fila, custo, saúde, findings) — leitura agregada, NUNCA interação cross-tenant | Não — é camada nova sobre dado que já existe desde F0 |

**O que NUNCA muda** (em nenhuma fase): contrato do worker (`DISPATCH_TEMPLATE`), guardas (R1-R9), suíte e disciplina de provas, token do operator-fornecedor, tiering 0-3, pt-BR/BRT, herdr como modo avançado.

**Pré-requisitos e dívidas herdas (honestas):**
- **RD-MOPS-03** (backup externo do plugin — repo sem remote): pré-requisito real do empacotamento F3; sem ele, cada harness de tenant é um fork irreprodutível.
- **RD-SEC-03/RD-SEC-05** (provas do guard com token ativo; anti-spoof assinado): o token por tenant (D4) herda as MESMAS dívidas — resolver antes do primeiro tenant real.
- **Reload do gateway host-side** é consequência (padrão GUARDIAN-MOBILE-01/WOBA): cada fase F1-F3 termina em SHIP própria, nunca push direto.
- **Pré-requisito P2:** credencial sandbox Wooba (decisão do operator — STATUS-WOOBA-TOOLS-02 permanece PAUSED até ordem nova).

**Riscos nomeados:**
1. **Duas camadas de token confundirem o guard** → mitigação: o guard valida pelo ALVO da ação (infra/negócio), teste negativo de scope mismatch na suíte por tenant.
2. **Credenciais de tenant vazarem para audit/output** → hash16 sempre, vault 0600, prova negativa na suíte (mesmo padrão GUARDIAN-MOBILE-01).
3. **Colaborador usar o terminal para bypass de guard** → guard é código no caminho (não cortina da TUI); provas negativas pelo terminal também.
4. **Custo de N harnesses** → silo é mais caro que shared por tenant, mas é o isolamento que o produto vende; orçamento por tenant mede e cobra honestamente (F2).

---

## 6. Resumo executivo (1 parágrafo)

O Guardian vira produto mantendo a doutrina intacta e empacotando-a: **1 harness completo por consolidadora** (isolamento por implantação, não por código), com `tenantId` ubiquo desde o dia 1 (a operação atual = tenant `default`, migração zero-breaking em 5 fases F0-F4), login do colaborador no Hermes agent com 3 papéis e claims server-side, **layout Guardian** que reusa o tema config existente (semântica de status já pronta) e acrescenta onboarding + telas Missões/Status/Aprovações com o chat como corpo, herdr como modo avançado, consequência de negócio atrás de token de consequência do tenant-admin (mecânica provada do approval-card), e a P2 Wooba como primeira integração com credencial por tenant — travada hoje apenas na credencial sandbox (STATUS-WOOBA-TOOLS-02, PAUSED por ordem do operator).