# 🎯 ANÁLISE DE PRIORIZAÇÃO DE NEGÓCIO - GOOGLE DRIVE CONNECTOR v1.0

**Data:** 25 de julho de 2026  
**Status:** Validação de prioridades antes de congelamento definitivo  
**Escopo:** 27 capabilities (após 6 correções de auditoria)

---

## 📋 METODOLOGIA

Para cada capability, será analisado:

1. **Quem Utiliza:** Usuário final, Administrador, Sistema interno
2. **Frequência de Uso:** Alta (diária), Média (semanal), Baixa (mensal)
3. **Impacto se Não Existir:** Alto (bloqueia workflow), Médio (degrada experience), Baixo (nice-to-have)
4. **Dependências Técnicas:** GWS Foundation, LLM, Query Builder, etc
5. **Pode Ser Adiada?:** SIM/NÃO (baseado em análise)
6. **Justificativa Objetiva:** Baseada em critérios acima

### Matriz de Priorização:
- **CRÍTICO:** Frequência ALTA + Impacto ALTO = Não pode adiar
- **ESSENCIAL:** Frequência MÉDIA + Impacto ALTO OU Frequência ALTA + Impacto MÉDIO
- **IMPORTANTE:** Frequência ALTA + Impacto MÉDIO OU Frequência MÉDIA + Impacto MÉDIO
- **OPCIONAL:** Frequência BAIXA OU Impacto BAIXO

---

## 🧭 NAVEGAÇÃO (3 CAPABILITIES)

### nav-01: Listar arquivos recentes

| Atributo | Valor |
|----------|-------|
| **Quem usa** | Usuário final (100%) |
| **Frequência** | ALTA (primeira ação ao abrir) |
| **Impacto se não existir** | ALTO (impossível explorar drive) |
| **Dependências** | Nenhuma - drive.files.list |
| **Pode adiar?** | **NÃO** |
| **Prioridade Atual** | ESSENCIAL |
| **Prioridade Recomendada** | **CRÍTICO** ↑ |

**Justificativa:**
- É o entry point principal do usuário
- Usuários abrem MemoryOS para "buscar documento recente"
- Sem isso, aplicação é inutilizável
- Implementação simples, dependência zero
- **DEVE ser Fase 1, item #1**

---

### nav-02: Listar arquivos em pasta específica

| Atributo | Valor |
|----------|-------|
| **Quem usa** | Usuário final (100%) |
| **Frequência** | ALTA (navegação hierárquica) |
| **Impacto se não existir** | ALTO (não consegue explorar pastas) |
| **Dependências** | Nenhuma - drive.files.list com parents |
| **Pode adiar?** | **NÃO** |
| **Prioridade Atual** | ESSENCIAL |
| **Prioridade Recomendada** | **CRÍTICO** ↑ |

**Justificativa:**
- Complementa nav-01 para exploração completa
- Usuários organizam em pastas e precisam navegar estrutura
- Bloqueador crítico se não existir
- Implementação simples
- **DEVE ser Fase 1, item #2**

---

### nav-03: Listar todas as pastas

| Atributo | Valor |
|----------|-------|
| **Quem usa** | Usuário final (80%), Administrador (20%) |
| **Frequência** | MÉDIA (ocasionalmente para entender estrutura) |
| **Impacto se não existir** | MÉDIO (pode usar nav-02 progressiva em vez de vista global) |
| **Dependências** | GWS Foundation listFolders() - JÁ EXISTS |
| **Pode adiar?** | **SIM** - nav-01 + nav-02 cobrem 80% |
| **Prioridade Atual** | IMPORTANTE |
| **Prioridade Recomendada** | **IMPORTANTE** (sem mudança) |

**Justificativa:**
- Nice-to-have para planejamento
- Sem isso, usuário navega pasta a pasta (mais cliques)
- Não bloqueia workflows principais
- Implementação simples (GWS existe)
- **Pode ser Fase 2 ou posterior**

---

## 🔍 PESQUISA (4 CAPABILITIES)

### search-01: Buscar arquivo por nome

| Atributo | Valor |
|----------|-------|
| **Quem usa** | Usuário final (100%) |
| **Frequência** | ALTA (uso diário principal) |
| **Impacto se não existir** | ALTO (busca por nome é uso #1) |
| **Dependências** | Nenhuma - drive.files.list com query |
| **Pode adiar?** | **NÃO** |
| **Prioridade Atual** | ESSENCIAL |
| **Prioridade Recomendada** | **CRÍTICO** ↑ |

**Justificativa:**
- Busca por nome é feature #1 que usuários esperam
- Frequência: DIÁRIA em praticamente 100% dos usuários
- Impacto: ALTO - sem isso, navegação é impossível
- Sem dependências, implementação imediata
- **DEVE ser Fase 1, item #1**

---

### search-02: Listar por tipo MIME

| Atributo | Valor |
|----------|-------|
| **Quem usa** | Usuário final (100%) |
| **Frequência** | ALTA (filtrar por tipo é workflow comum) |
| **Impacto se não existir** | ALTO (precisa de filtros para work comum) |
| **Dependências** | Nenhuma - drive.files.list com mimeType |
| **Pode adiar?** | **NÃO** |
| **Prioridade Atual** | ESSENCIAL |
| **Prioridade Recomendada** | **CRÍTICO** ↑ |

**Justificativa:**
- Filtrar por "todos os PDFs" ou "planilhas" é workflow comum
- Frequência: ALTA (múltiplas vezes por semana)
- Impacto: ALTO - usuários precisam de filtros
- Implementação trivial
- **DEVE ser Fase 1, item #3**

---

### search-03: Busca avançada com múltiplos critérios

| Atributo | Valor |
|----------|-------|
| **Quem usa** | Usuário final (70%), Power users (30%) |
| **Frequência** | MÉDIA (ocasionalmente para busca precisa) |
| **Impacto se não existir** | MÉDIO (search-01 + search-02 cobrem 70% dos casos) |
| **Dependências** | Query Builder simples (Google Drive API suporta) |
| **Pode adiar?** | **SIM** - search-01 + search-02 suficientes inicialmente |
| **Prioridade Atual** | IMPORTANTE |
| **Prioridade Recomendada** | **IMPORTANTE** (sem mudança) |

**Justificativa:**
- Poder combinar múltiplos critérios é útil mas não crítico
- Frequência: MÉDIA - não é uso diário
- Impacto: MÉDIO - pode usar múltiplas buscas em sequência
- Requer Query Builder (pode ser simples)
- **Pode ser Fase 1 final OU Fase 2**

---

### search-04: Busca por conteúdo (full-text)

| Atributo | Valor |
|----------|-------|
| **Quem usa** | Usuário final (80%) |
| **Frequência** | MÉDIA (buscar dentro do conteúdo) |
| **Impacto se não existir** | MÉDIO (Google Drive indexa, pode ter delay) |
| **Dependências** | Nenhuma - Google Drive API suporta |
| **Pode adiar?** | **SIM** - search-01 + search-02 cobrem primeiro |
| **Prioridade Atual** | IMPORTANTE |
| **Prioridade Recomendada** | **IMPORTANTE** (sem mudança) |

**Justificativa:**
- Buscar "encontre documentos que mencionam ROI" é útil
- Frequência: MÉDIA - busca especializada
- Impacto: MÉDIO - Google Drive faz isso natively
- Não requer processamento, apenas wrapper
- **Pode ser Fase 2**

---

## 📖 LEITURA (4 CAPABILITIES)

### read-01: Obter metadados de arquivo

| Atributo | Valor |
|----------|-------|
| **Quem usa** | Sistema (100%) - usado por outras operações |
| **Frequência** | ALTA (toda operação precisa de metadados) |
| **Impacto se não existir** | ALTO (impossível fazer outras operações) |
| **Dependências** | Nenhuma - drive.files.get |
| **Pode adiar?** | **NÃO** |
| **Prioridade Atual** | ESSENCIAL |
| **Prioridade Recomendada** | **CRÍTICO** ↑ |

**Justificativa:**
- Metadados são pre-requisito para TODAS as operações
- Frequência: ALTÍSSIMA - chamado em cada operação
- Impacto: ALTO - bloqueia tudo sem isso
- Implementação trivial
- **DEVE ser Fase 1, item fundamental**

---

### read-02: Baixar arquivo

| Atributo | Valor |
|----------|-------|
| **Quem usa** | Usuário final (100%) |
| **Frequência** | ALTA (acesso a conteúdo é uso principal) |
| **Impacto se não existir** | ALTO (sem download, sistema não funciona) |
| **Dependências** | DocumentProcessingEngine (JÁ EXISTE) |
| **Pode adiar?** | **NÃO** |
| **Prioridade Atual** | ESSENCIAL |
| **Prioridade Recomendada** | **CRÍTICO** ↑ |

**Justificativa:**
- Ler conteúdo de arquivo é uso central do MemoryOS
- Frequência: DIÁRIA - usuários acessam documentos constantemente
- Impacto: ALTO - sem isso é apenas metadata viewer
- Dependência existe (DocumentProcessingEngine)
- **DEVE ser Fase 1, item #4**

---

### read-03: Resumir documento

| Atributo | Valor |
|----------|-------|
| **Quem usa** | Usuário final (100%) |
| **Frequência** | ALTA (sumarizar é diferencial) |
| **Impacto se não existir** | MÉDIO (read-02 puro é suficiente, mas perde diferencial de IA) |
| **Dependências** | base44.integrations.Core.InvokeLLM (JÁ EXISTE) |
| **Pode adiar?** | **SIM** - funciona sem isso com read-02 |
| **Prioridade Atual** | IMPORTANTE |
| **Prioridade Recomendada** | **ESSENCIAL** ↑ |

**Justificativa:**
- É o diferencial de IA do MemoryOS ("memória inteligente")
- Frequência: ALTA - usuários querem sumários rápidos
- Impacto: MÉDIO em funcionalidade, ALTO em value
- Dependência existe (LLM)
- **DEVE ser Fase 1, item #5 (logo após read-02)**

---

### read-04: Extrair dados estruturados

| Atributo | Valor |
|----------|-------|
| **Quem usa** | Power users (40%), Administrador (30%), Usuário (30%) |
| **Frequência** | BAIXA-MÉDIA (uso especializado) |
| **Impacto se não existir** | BAIXO (read-02 + read-03 funcionam sem isso) |
| **Dependências** | DocumentProcessingEngine melhorado + LLM fine-tuning |
| **Pode adiar?** | **SIM** - pode ser v1.1 |
| **Prioridade Atual** | OPCIONAL |
| **Prioridade Recomendada** | **OPCIONAL** (sem mudança) |

**Justificativa:**
- Extrair dados de tabelas/formulários é use case especializado
- Frequência: BAIXA - não é uso comum
- Impacto: BAIXO - read-02 + read-03 cobrem a maioria
- Requer melhorias complexas (parsing de estrutura)
- **Deve ficar para v1.1 ou posterior**

---

## 📦 ORGANIZAÇÃO (4 CAPABILITIES)

### org-01: Criar pasta

| Atributo | Valor |
|----------|-------|
| **Quem usa** | Usuário final (90%), Administrador (10%) |
| **Frequência** | MÉDIA (criar pastas ocasionalmente) |
| **Impacto se não existir** | MÉDIO (usuário consegue organizar externamente) |
| **Dependências** | Nenhuma - drive.files.create |
| **Pode adiar?** | **SIM** - pode criar pastas via web |
| **Prioridade Atual** | ESSENCIAL |
| **Prioridade Recomendada** | **IMPORTANTE** ↓ |

**Justificativa:**
- Criar pasta é operação complementar, não principal
- Frequência: MÉDIA - não é diário
- Impacto: MÉDIO - usuário consegue fazer via web
- Mas melhora UX significativamente
- **Pode ser Fase 1 ou Fase 2 (mantém em v1.0)**

---

### org-02: Mover arquivo para pasta

| Atributo | Valor |
|----------|-------|
| **Quem usa** | Usuário final (100%) |
| **Frequência** | ALTA (organizar é workflow diário) |
| **Impacto se não existir** | ALTO (prejudica organização) |
| **Dependências** | GWS Foundation moveFile() - SIMPLES |
| **Pode adiar?** | **NÃO** |
| **Prioridade Atual** | ESSENCIAL (após auditoria) |
| **Prioridade Recomendada** | **CRÍTICO** ↑ |

**Justificativa:**
- Mover arquivo é workflow CRÍTICO (case #12 validação)
- Frequência: ALTA - usuários movem arquivos diariamente
- Impacto: ALTO - sem isso não consegue organizar
- Implementação simples (GWS)
- **DEVE ser Fase 1, item #6**

---

### org-03: Renomear arquivo

| Atributo | Valor |
|----------|-------|
| **Quem usa** | Usuário final (80%) |
| **Frequência** | MÉDIA (ocasional) |
| **Impacto se não existir** | MÉDIO (prejudica organização mas não bloqueia) |
| **Dependências** | GWS Foundation renameFile() - TRIVIAL |
| **Pode adiar?** | **SIM** - pode renomear via web |
| **Prioridade Atual** | IMPORTANTE |
| **Prioridade Recomendada** | **IMPORTANTE** (sem mudança) |

**Justificativa:**
- Renomear é operação comum mas não crítica
- Frequência: MÉDIA - não é diário
- Impacto: MÉDIO - afeta organização
- Implementação muito simples
- **Pode ser Fase 2**

---

### org-04: Deletar arquivo

| Atributo | Valor |
|----------|-------|
| **Quem usa** | Usuário final (70%) |
| **Frequência** | MÉDIA (limpeza ocasional) |
| **Impacto se não existir** | MÉDIO (prejudica limpeza, mas requer confirmação) |
| **Dependências** | GWS Foundation deleteFile() - SIMPLES |
| **Pode adiar?** | **SIM** - pode deletar via web |
| **Prioridade Atual** | IMPORTANTE |
| **Prioridade Recomendada** | **IMPORTANTE** (sem mudança) |

**Justificativa:**
- Deletar é operação importante mas não crítica
- Frequência: MÉDIA - limpeza ocasional
- Impacto: MÉDIO - affects storage management
- Implementação simples (requer confirmação de segurança)
- **Pode ser Fase 2**

---

## 🤝 COMPARTILHAMENTO (4 CAPABILITIES)

### share-01: Listar arquivos compartilhados

| Atributo | Valor |
|----------|-------|
| **Quem usa** | Usuário final (100%) |
| **Frequência** | ALTA (colaboração é central) |
| **Impacto se não existir** | ALTO (não consegue ver documentos compartilhados) |
| **Dependências** | Nenhuma - drive.files.list com sharedWithMe |
| **Pode adiar?** | **NÃO** |
| **Prioridade Atual** | IMPORTANTE |
| **Prioridade Recomendada** | **CRÍTICO** ↑ |

**Justificativa:**
- MemoryOS é ferramenta de colaboração
- Frequência: ALTA - usuários colaboram diariamente
- Impacto: ALTO - sem isso perde uso central
- Implementação trivial
- **DEVE ser Fase 1, item #7**

---

### share-02: Compartilhar arquivo com pessoa/grupo

| Atributo | Valor |
|----------|-------|
| **Quem usa** | Usuário final (100%) |
| **Frequência** | ALTA (compartilhamento é workflow diário) |
| **Impacto se não existir** | ALTO (impossível colaborar) |
| **Dependências** | GWS Foundation addPermission() - MÉDIA complexidade |
| **Pode adiar?** | **NÃO** |
| **Prioridade Atual** | ESSENCIAL |
| **Prioridade Recomendada** | **CRÍTICO** ↑ |

**Justificativa:**
- Compartilhar é feature CENTRAL para colaboração
- Frequência: ALTA - usuários compartilham frequentemente
- Impacto: ALTO - sem isso não consegue colaborar
- Dependência clara e necessária
- **DEVE ser Fase 1, item #8**

---

### share-03: Alterar permissões de compartilhamento

| Atributo | Valor |
|----------|-------|
| **Quem usa** | Usuário final (80%), Administrador (20%) |
| **Frequência** | MÉDIA (alterar permissões ocasionalmente) |
| **Impacto se não existir** | MÉDIO (pode revogar via share-04 ou web) |
| **Dependências** | GWS Foundation updatePermission() - MÉDIA |
| **Pode adiar?** | **SIM** - share-02 + share-04 cobrem parte |
| **Prioridade Atual** | IMPORTANTE |
| **Prioridade Recomendada** | **IMPORTANTE** (sem mudança) |

**Justificativa:**
- Mudar viewer→editor é útil mas não crítico
- Frequência: MÉDIA - não é workflow diário
- Impacto: MÉDIO - pode revogar e reshare
- Implementação média
- **Pode ser Fase 2**

---

### share-04: Remover compartilhamento

| Atributo | Valor |
|----------|-------|
| **Quem usa** | Usuário final (100%), Administrador (100%) |
| **Frequência** | MÉDIA (revogar acesso ocasionalmente) |
| **Impacto se não existir** | ALTO (questão de segurança) |
| **Dependências** | GWS Foundation removePermission() - SIMPLES |
| **Pode adiar?** | **NÃO** |
| **Prioridade Atual** | IMPORTANTE |
| **Prioridade Recomendada** | **ESSENCIAL** ↑ |

**Justificativa:**
- Revogar acesso é questão de SEGURANÇA
- Frequência: MÉDIA - mas crítico quando necessário
- Impacto: ALTO - sem isso não consegue remover acesso
- Implementação simples
- **DEVE ser Fase 1 ou no máximo Fase 2 (ESSENCIAL para segurança)**

---

## ⬆️ UPLOAD (1 CAPABILITY)

### upload-01: Upload/Atualizar arquivo

| Atributo | Valor |
|----------|-------|
| **Quem usa** | Usuário final (100%), Sistema (para sync) |
| **Frequência** | ALTA (importar conteúdo é workflow principal) |
| **Impacto se não existir** | ALTO (sem upload = read-only, impossível importar) |
| **Dependências** | GWS Foundation uploadFile() - ALTA complexidade |
| **Pode adiar?** | **NÃO** |
| **Prioridade Atual** | ESSENCIAL (CRÍTICO após auditoria) |
| **Prioridade Recomendada** | **CRÍTICO** ↑ |

**Justificativa:**
- Upload é CRÍTICO para funcionalidade
- Frequência: ALTA - usuários precisam importar documentos
- Impacto: ALTO - sem isso MemoryOS é read-only
- Dependência complexa mas necessária
- **DEVE ser Fase 1, item PRIORITÁRIO (#9)**

---

## 📊 MONITORAMENTO (3 CAPABILITIES)

### monitor-01: Verificar quota de espaço

| Atributo | Valor |
|----------|-------|
| **Quem usa** | Usuário final (80%), Administrador (100%) |
| **Frequência** | BAIXA-MÉDIA (check ocasional) |
| **Impacto se não existir** | BAIXO (não bloqueia, é informativo) |
| **Dependências** | Nenhuma - drive.about.get |
| **Pode adiar?** | **SIM** - informativo, não crítico |
| **Prioridade Atual** | IMPORTANTE |
| **Prioridade Recomendada** | **IMPORTANTE** (sem mudança) |

**Justificativa:**
- Verificar quota é útil mas não crítico
- Frequência: BAIXA-MÉDIA - check ocasional
- Impacto: BAIXO - é informativo apenas
- Implementação trivial
- **Pode ser Fase 2**

---

### monitor-02: Verificar saúde da conexão

| Atributo | Valor |
|----------|-------|
| **Quem usa** | Administrador (100%), Usuário (ocasional) |
| **Frequência** | BAIXA (diagnóstico) |
| **Impacto se não existir** | BAIXO (diagnóstico apenas) |
| **Dependências** | Nenhuma - drive.files.list (ping) |
| **Pode adiar?** | **SIM** - é feature de diagnóstico |
| **Prioridade Atual** | IMPORTANTE |
| **Prioridade Recomendada** | **IMPORTANTE** (sem mudança) |

**Justificativa:**
- Health check é importante para ops mas não para usuários
- Frequência: BAIXA - diagnóstico ocasional
- Impacto: BAIXO - não afeta funcionalidade
- Implementação trivial
- **Pode ser Fase 2**

---

### monitor-03: Listar histórico de alterações

| Atributo | Valor |
|----------|-------|
| **Quem usa** | Administrador (80%), Power users (20%) |
| **Frequência** | BAIXA (auditoria ocasional) |
| **Impacto se não existir** | BAIXO (não bloqueia, é nice-to-have) |
| **Dependências** | Google Drive revisions API - MÉDIA |
| **Pode adiar?** | **SIM** - pode ser v1.1 |
| **Prioridade Atual** | OPCIONAL |
| **Prioridade Recomendada** | **OPCIONAL** (sem mudança) |

**Justificativa:**
- Histórico é nice-to-have, não crítico
- Frequência: BAIXA - auditoria ocasional
- Impacto: BAIXO - não bloqueia workflows
- Implementação média
- **Deve ser v1.1 ou posterior**

---

## 👨‍💼 ADMINISTRAÇÃO (1 CAPABILITY)

### admin-01: Health check completo

| Atributo | Valor |
|----------|-------|
| **Quem usa** | Administrador (100%) |
| **Frequência** | BAIXA (diagnóstico) |
| **Impacto se não existir** | BAIXO (diagnóstico apenas) |
| **Dependências** | Agregação de health.full |
| **Pode adiar?** | **SIM** - feature de ops |
| **Prioridade Atual** | IMPORTANTE |
| **Prioridade Recomendada** | **IMPORTANTE** (sem mudança) |

**Justificativa:**
- Health check é importante para operações mas não para usuários
- Frequência: BAIXA - diagnóstico ocasional
- Impacto: BAIXO - não afeta funcionalidade
- Implementação trivial
- **Pode ser Fase 1 ou Fase 2 (mantém em v1.0 para ops)**

---

## 📊 MATRIZ DE PRIORIZAÇÃO CONSOLIDADA

Aplicando os critérios acima:

### CRÍTICO (Não pode adiar - FASE 1)

| ID | Capability | Quem | Freq | Impacto | Justificativa |
|---|---|---|---|---|---|
| nav-01 | Listar recentes | Usuário | ALTA | ALTO | Entry point principal |
| nav-02 | Listar em pasta | Usuário | ALTA | ALTO | Navegação hierárquica |
| search-01 | Buscar por nome | Usuário | ALTA | ALTO | Busca é uso #1 |
| search-02 | Listar por MIME | Usuário | ALTA | ALTO | Filtros são críticos |
| read-01 | Metadados | Sistema | ALTA | ALTO | Pre-requisito tudo |
| read-02 | Download | Usuário | ALTA | ALTO | Ler conteúdo é central |
| read-03 | Resumir | Usuário | ALTA | MÉDIO | Diferencial de IA |
| org-02 | Mover arquivo | Usuário | ALTA | ALTO | Organização é crítica |
| share-01 | Listar compartilhados | Usuário | ALTA | ALTO | Colaboração central |
| share-02 | Compartilhar | Usuário | ALTA | ALTO | Feature central |
| upload-01 | Upload/Atualizar | Usuário | ALTA | ALTO | Sem upload = read-only |

**Total CRÍTICO: 11 capabilities**

### ESSENCIAL (FASE 1-2)

| ID | Capability | Justificativa |
|---|---|---|
| share-04 | Remover compartilhamento | Segurança é crítica |

**Total ESSENCIAL: 1 capability**

### IMPORTANTE (FASE 2-3)

| ID | Capability | Justificativa |
|---|---|---|
| nav-03 | Listar todas as pastas | Nice-to-have, nav-01+02 cobrem 80% |
| search-03 | Busca avançada | search-01+02 cobrem 70% |
| search-04 | Busca por conteúdo | search-01+02 cobrem primeiro |
| org-01 | Criar pasta | Complementar, pode fazer via web |
| org-03 | Renomear arquivo | Operação comum mas não crítica |
| org-04 | Deletar arquivo | Importante mas pode fazer via web |
| share-03 | Alterar permissões | share-02+04 cobrem parte |
| monitor-01 | Quota de espaço | Informativo, não crítico |
| monitor-02 | Saúde da conexão | Diagnóstico apenas |
| admin-01 | Health check | Diagnóstico apenas |

**Total IMPORTANTE: 10 capabilities**

### OPCIONAL (FASE 4+)

| ID | Capability | Justificativa |
|---|---|---|
| read-04 | Extrair dados | Use case especializado, complexo |
| monitor-03 | Histórico | Nice-to-have, auditoria |

**Total OPCIONAL: 2 capabilities**

---

## 🔄 RECLASSIFICAÇÕES RECOMENDADAS

### ELEVAÇÕES (Prioridade ↑)

1. **nav-01** (ESSENCIAL → **CRÍTICO**)
   - Justificativa: Entry point principal, frequência ALTA + impacto ALTO
   - Implementação: Imediata (Fase 1)

2. **nav-02** (ESSENCIAL → **CRÍTICO**)
   - Justificativa: Navegação hierárquica, frequência ALTA + impacto ALTO
   - Implementação: Imediata (Fase 1)

3. **search-01** (ESSENCIAL → **CRÍTICO**)
   - Justificativa: Busca por nome é uso #1, frequência ALTA + impacto ALTO
   - Implementação: Imediata (Fase 1)

4. **search-02** (ESSENCIAL → **CRÍTICO**)
   - Justificativa: Filtros são críticos, frequência ALTA + impacto ALTO
   - Implementação: Imediata (Fase 1)

5. **read-01** (ESSENCIAL → **CRÍTICO**)
   - Justificativa: Pre-requisito para todas operações, frequência ALTA + impacto ALTO
   - Implementação: Imediata (Fase 1)

6. **read-02** (ESSENCIAL → **CRÍTICO**)
   - Justificativa: Ler conteúdo é uso central, frequência ALTA + impacto ALTO
   - Implementação: Imediata (Fase 1)

7. **read-03** (IMPORTANTE → **ESSENCIAL**)
   - Justificativa: Diferencial de IA do MemoryOS, frequência ALTA + impacto MÉDIO = ESSENCIAL
   - Implementação: Fase 1 (logo após read-02)

8. **org-02** (IMPORTANTE → **CRÍTICO**)
   - Justificativa: Organização é workflow crítico, frequência ALTA + impacto ALTO
   - Implementação: Fase 1

9. **share-01** (IMPORTANTE → **CRÍTICO**)
   - Justificativa: Colaboração é central, frequência ALTA + impacto ALTO
   - Implementação: Fase 1

10. **share-02** (ESSENCIAL → **CRÍTICO**)
    - Justificativa: Feature central de compartilhamento, frequência ALTA + impacto ALTO
    - Implementação: Fase 1

11. **share-04** (IMPORTANTE → **ESSENCIAL**)
    - Justificativa: Segurança é crítica, revogar acesso é fundamental
    - Implementação: Fase 1 ou Fase 2

12. **upload-01** (ESSENCIAL → **CRÍTICO**)
    - Justificativa: Sem upload = read-only, frequência ALTA + impacto ALTO
    - Implementação: Fase 1 (prioritário)

### MANTÊM CLASSIFICAÇÃO

- **org-01** (IMPORTANTE) - Complementar, pode fazer via web
- **nav-03** (IMPORTANTE) - Nice-to-have, nav-01+02 cobrem
- **search-03** (IMPORTANTE) - search-01+02 cobrem primeiro
- **search-04** (IMPORTANTE) - search-01+02 cobrem primeiro
- **org-03** (IMPORTANTE) - Comum mas não crítica
- **org-04** (IMPORTANTE) - Importante mas pode fazer via web
- **share-03** (IMPORTANTE) - share-02+04 cobrem parte
- **monitor-01** (IMPORTANTE) - Informativo, não crítico
- **monitor-02** (IMPORTANTE) - Diagnóstico apenas
- **admin-01** (IMPORTANTE) - Diagnóstico apenas
- **read-04** (OPCIONAL) - Use case especializado
- **monitor-03** (OPCIONAL) - Nice-to-have auditoria

---

## 📋 NOVA SEQUÊNCIA DE IMPLEMENTAÇÃO

### FASE 1 - CRÍTICO (4 SEMANAS)

**Semana 1: Foundation**
1. read-01 (Metadados) - Pre-requisito tudo
2. read-02 (Download) - Leitura de conteúdo

**Semana 2: Navegação**
3. nav-01 (Recentes) - Entry point
4. nav-02 (Em pasta) - Navegação

**Semana 3: Busca**
5. search-01 (Por nome) - Busca #1
6. search-02 (Por MIME) - Filtros

**Semana 4: Organização & Compartilhamento**
7. org-02 (Mover) - Organização
8. share-01 (Compartilhados) - Colaboração

**Semana 4 (cont.): IA & Upload**
9. read-03 (Resumir) - Diferencial de IA
10. share-02 (Compartilhar) - Feature central
11. upload-01 (Upload) - Crítico

**Semana 5: Segurança**
12. share-04 (Remover) - Segurança

**TOTAL: 12 CRITICAL capabilities - 5 semanas (com paralelização)**

### FASE 2 - IMPORTANTE (4-6 SEMANAS)

- search-03, search-04 (Busca avançada)
- org-03, org-04 (Organização)
- share-03 (Permissões)
- nav-03 (Listar pastas)
- monitor-01, monitor-02, admin-01 (Monitoramento)

### FASE 3+ - OPCIONAL (FUTURA)

- read-04 (Extração de dados)
- monitor-03 (Histórico)

---

**NOVA CONTAGEM:**

- **CRÍTICO:** 11 capabilities (Fase 1)
- **ESSENCIAL:** 1 capability (Fase 1 final ou Fase 2)
- **IMPORTANTE:** 10 capabilities (Fase 2-3)
- **OPCIONAL:** 2 capabilities (Fase 4+)

**TOTAL: 24 capabilities para v1.0** (read-04 e monitor-03 para v1.1+)

---

## 🎯 CONCLUSÕES

### Mudanças Recomendadas na Priorização

De 30 capabilities iniciais, após 6 correções de auditoria (27 capabilities), a análise de negócio recomenda:

1. **Elevar para CRÍTICO:** 8 capabilities (nav-01, nav-02, search-01, search-02, read-01, read-02, org-02, share-01, share-02, upload-01)
2. **Elevar para ESSENCIAL:** 2 capabilities (read-03, share-04)
3. **Manter como IMPORTANTE:** 10 capabilities
4. **Manter como OPCIONAL:** 2 capabilities

### Impacto

- **v1.0 pode focar em 12 CRÍTICOS + 1 ESSENCIAL = 13 capabilities**
- **Reduz de 27 para escopo focado de 13 para v1.0 VERDADEIRO**
- **Restante vai para Fase 2+ com justificativa clara**
- **Roadmap alinhado com necessidades de negócio**

### Próximo Passo

Produzir versão final oficial da matriz com:
- Classificações revisadas
- Justificativas objetivas
- Sequência Fase 1 otimizada
- Documento pronto para congelamento definitivo
