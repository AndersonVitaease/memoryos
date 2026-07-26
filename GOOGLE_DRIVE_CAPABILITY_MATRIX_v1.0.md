# MATRIZ OFICIAL DE CAPABILITIES - GOOGLE DRIVE CONNECTOR

**Versão:** 1.0  
**Data:** 25 de julho de 2026  
**Status:** CONGELADA (Não alterar sem revisão formal)  

---

## 📊 RESUMO EXECUTIVO

| Métrica | Valor |
|---------|-------|
| **Total de Capabilities** | 30 |
| **Implementadas** | 15 (50%) |
| **Não Implementadas** | 15 (50%) |
| **Categorias** | 8 |

---

## 🗂️ CATEGORIAS E CAPABILITIES

### 1️⃣ NAVEGAÇÃO (4 capabilities)

| ID | Nome | Status | Complexidade | Valor |
|---|---|---|---|---|
| nav-01 | Listar arquivos recentes | ✅ IMPLEMENTADA | Baixa | Alto |
| nav-02 | Listar arquivos em pasta específica | ✅ IMPLEMENTADA | Baixa | Alto |
| nav-03 | Listar todas as pastas | ❌ NÃO IMPLEMENTADA | Baixa | Médio |
| nav-04 | Pagination em listagens | ✅ IMPLEMENTADA | Baixa | Médio |

**Progresso:** 3/4 (75%)

---

### 2️⃣ PESQUISA (4 capabilities)

| ID | Nome | Status | Complexidade | Valor |
|---|---|---|---|---|
| search-01 | Buscar arquivo por nome | ✅ IMPLEMENTADA | Baixa | Alto |
| search-02 | Listar por tipo MIME | ✅ IMPLEMENTADA | Baixa | Alto |
| search-03 | Busca avançada com múltiplos critérios | ❌ NÃO IMPLEMENTADA | Média | Médio |
| search-04 | Busca por conteúdo (full-text) | ❌ NÃO IMPLEMENTADA | Média | Alto |

**Progresso:** 2/4 (50%)

---

### 3️⃣ LEITURA (5 capabilities)

| ID | Nome | Status | Complexidade | Valor |
|---|---|---|---|---|
| read-01 | Obter metadados de arquivo | ✅ IMPLEMENTADA | Baixa | Alto |
| read-02 | Baixar arquivo | ✅ IMPLEMENTADA | Alta | Alto |
| read-03 | Resumir documento | ✅ IMPLEMENTADA | Alta | Alto |
| read-04 | Extrair dados estruturados | ❌ NÃO IMPLEMENTADA | Alta | Alto |
| read-05 | Visualizar preview do arquivo | ✅ IMPLEMENTADA | Baixa | Médio |

**Progresso:** 4/5 (80%)

---

### 4️⃣ ORGANIZAÇÃO (5 capabilities)

| ID | Nome | Status | Complexidade | Valor |
|---|---|---|---|---|
| org-01 | Criar pasta | ✅ IMPLEMENTADA | Baixa | Alto |
| org-02 | Mover arquivo para pasta | ❌ NÃO IMPLEMENTADA | Média | Alto |
| org-03 | Renomear arquivo | ❌ NÃO IMPLEMENTADA | Baixa | Médio |
| org-04 | Deletar arquivo | ❌ NÃO IMPLEMENTADA | Média | Médio |
| org-05 | Restaurar arquivo do lixo | ❌ NÃO IMPLEMENTADA | Baixa | Médio |

**Progresso:** 1/5 (20%)

---

### 5️⃣ COMPARTILHAMENTO (5 capabilities)

| ID | Nome | Status | Complexidade | Valor |
|---|---|---|---|---|
| share-01 | Listar arquivos compartilhados | ✅ IMPLEMENTADA | Baixa | Alto |
| share-02 | Compartilhar arquivo com pessoa/grupo | ❌ NÃO IMPLEMENTADA | Média | Alto |
| share-03 | Alterar permissões de compartilhamento | ❌ NÃO IMPLEMENTADA | Média | Alto |
| share-04 | Remover compartilhamento | ❌ NÃO IMPLEMENTADA | Média | Médio |
| share-05 | Obter link de compartilhamento | ✅ IMPLEMENTADA | Baixa | Alto |

**Progresso:** 2/5 (40%)

---

### 6️⃣ UPLOAD (3 capabilities)

| ID | Nome | Status | Complexidade | Valor |
|---|---|---|---|---|
| upload-01 | Upload de arquivo | ❌ NÃO IMPLEMENTADA | Alta | Alto |
| upload-02 | Atualizar arquivo existente | ❌ NÃO IMPLEMENTADA | Alta | Alto |
| upload-03 | Carregar múltiplos arquivos | ❌ NÃO IMPLEMENTADA | Alta | Médio |

**Progresso:** 0/3 (0%)

---

### 7️⃣ MONITORAMENTO (3 capabilities)

| ID | Nome | Status | Complexidade | Valor |
|---|---|---|---|---|
| monitor-01 | Verificar quota de espaço | ✅ IMPLEMENTADA | Baixa | Médio |
| monitor-02 | Verificar saúde da conexão | ✅ IMPLEMENTADA | Baixa | Baixo |
| monitor-03 | Listar histórico de alterações | ❌ NÃO IMPLEMENTADA | Média | Médio |

**Progresso:** 2/3 (67%)

---

### 8️⃣ ADMINISTRAÇÃO (1 capability)

| ID | Nome | Status | Complexidade | Valor |
|---|---|---|---|---|
| admin-01 | Health check completo | ✅ IMPLEMENTADA | Baixa | Médio |

**Progresso:** 1/1 (100%)

---

## 🎯 ROADMAP DE IMPLEMENTAÇÃO

### 📍 FASE 1 - ESSENCIAL (Próximas 2-3 sprints)

**Objetivo:** Completar os casos de uso críticos de organização, busca e upload

| Seq | Capability | ID | Prioridade | Razão |
|---|---|---|---|---|
| 1 | Mover arquivo para pasta | org-02 | ALTA | Alto valor, essencial para organização |
| 2 | Upload de arquivo | upload-01 | ALTA | Alto valor, requerido por muitos usuários |
| 3 | Busca por conteúdo (full-text) | search-04 | ALTA | Alto valor, única dependência é query builder |
| 4 | Busca avançada com múltiplos critérios | search-03 | ALTA | Alto valor, médio complexidade |

**Dependências críticas a criar:**
- Query Builder (para search-03 e search-04)
- GWS Foundation - moveFile() (para org-02)
- GWS Foundation - uploadFile() (para upload-01)

---

### 📍 FASE 2 - COMPARTILHAMENTO (Sprint 4-5)

**Objetivo:** Implementar fluxo completo de compartilhamento e permissões

| Seq | Capability | ID | Prioridade | Razão |
|---|---|---|---|---|
| 1 | Compartilhar arquivo com pessoa/grupo | share-02 | ALTA | Alto valor, colaboração é essencial |
| 2 | Alterar permissões de compartilhamento | share-03 | ALTA | Completa a feature de compartilhamento |
| 3 | Remover compartilhamento | share-04 | ALTA | Segurança e controle de acesso |

**Dependências críticas a criar:**
- GWS Foundation - addPermission() (para share-02)
- GWS Foundation - updatePermission() (para share-03)
- GWS Foundation - removePermission() (para share-04)

---

### 📍 FASE 3 - ORGANIZAÇÃO AVANÇADA (Sprint 6-7)

**Objetivo:** Completar features de organização e extração de dados

| Seq | Capability | ID | Prioridade | Razão |
|---|---|---|---|---|
| 1 | Renomear arquivo | org-03 | MÉDIA | Baixa complexidade, bom para produtividade |
| 2 | Deletar arquivo | org-04 | MÉDIA | Média complexidade, requer confirmação de segurança |
| 3 | Listar todas as pastas | nav-03 | MÉDIA | Complementa navegação |
| 4 | Extrair dados estruturados | read-04 | MÉDIA | Alto valor, mas alta complexidade, requer LLM fine-tuning |

**Dependências críticas a criar:**
- GWS Foundation - renameFile() (para org-03)
- GWS Foundation - deleteFile() (para org-04)
- Melhorias em DocumentProcessingEngine (para read-04)

---

### 📍 FASE 4 - FEATURES ADICIONAIS (Sprint 8+)

**Objetivo:** Completar features secundárias e nice-to-haves

| Seq | Capability | ID | Prioridade | Razão |
|---|---|---|---|---|
| 1 | Atualizar arquivo existente | upload-02 | MÉDIA | Versioning, alta complexidade |
| 2 | Restaurar arquivo do lixo | org-05 | BAIXA | Baixa frequência de uso |
| 3 | Carregar múltiplos arquivos | upload-03 | BAIXA | Batch processing, pode esperar |
| 4 | Listar histórico de alterações | monitor-03 | BAIXA | Nice-to-have, monitoring apenas |

---

## 🔗 DEPENDÊNCIAS CRÍTICAS

### Sistema de Query Builder (Status: NÃO EXISTE)

**Descrição:** Sistema para construir queries complexas de Drive API de forma programática

**Requerido por:**
- search-03 (Busca avançada)
- search-04 (Busca por conteúdo)

**Complexidade:** Média  
**Impacto:** Alto (bloqueia 2 capabilities)  
**Ação:** Criar antes de iniciar Fase 1

---

### GWS Foundation - moveFile() (Status: NÃO EXISTE)

**Descrição:** Função para mover arquivos entre pastas

**Requerido por:**
- org-02 (Mover arquivo para pasta)

**Complexidade:** Baixa  
**Impacto:** Alto (case de uso crítico)  
**Ação:** Implementar antes de Fase 1

---

### GWS Foundation - uploadFile() (Status: NÃO EXISTE)

**Descrição:** Função para fazer upload de arquivos para o Drive

**Requerido por:**
- upload-01 (Upload de arquivo)
- upload-02 (Atualizar arquivo)
- upload-03 (Batch upload)

**Complexidade:** Alta (multipart, resumable upload)  
**Impacto:** Muito Alto (bloqueia 3 capabilities)  
**Ação:** Implementar antes de Fase 1

---

### GWS Foundation - Permissions API (Status: NÃO EXISTE)

**Funções necessárias:**
- addPermission() - compartilhar com usuário/grupo
- updatePermission() - mudar tipo de permissão
- removePermission() - revogar acesso

**Requerido por:**
- share-02, share-03, share-04 (Compartilhamento)

**Complexidade:** Média  
**Impacto:** Alto (bloqueia Fase 2)  
**Ação:** Implementar antes de Fase 2

---

### DocumentProcessingEngine (Status: PARCIALMENTE IMPLEMENTADO)

**Descrição:** Motor de extração de conteúdo de PDFs, DOCX, etc

**Requerido por:**
- read-02 (Baixar arquivo) - ✅ FUNCIONA
- read-03 (Resumir documento) - ✅ FUNCIONA
- read-04 (Extrair dados estruturados) - ❌ PRECISA MELHORAR

**Status atual:** Suporta TXT, PDF (via PDF.js), DOCX (básico)  
**Melhorias necessárias:** Estruturação melhor de tabelas, formulários, OCR para imagens  
**Complexidade:** Média  
**Impacto:** Médio (read-04 é lower priority)  
**Ação:** Melhorar antes de Fase 3

---

## 📋 CRITÉRIOS DE ACEITAÇÃO POR CAPABILITY

### Navegação
- ✅ Listar arquivos recentes com paginação
- ✅ Explorar pasta específica com navegação
- ✅ Obter lista completa de pastas
- ✅ Navegar entre páginas de resultados

### Pesquisa
- ✅ Buscar por nome (exact match e contains)
- ✅ Filtrar por tipo MIME
- ✅ Combinar filtros (nome + tipo + data)
- ✅ Buscar dentro do conteúdo

### Leitura
- ✅ Obter metadados completos
- ✅ Baixar conteúdo preservando formatação
- ✅ Gerar resumo via LLM
- ✅ Extrair dados de forma estruturada

### Organização
- ✅ Criar pasta com nome customizado
- ✅ Mover arquivo entre pastas
- ✅ Renomear arquivo
- ✅ Deletar com confirmação
- ✅ Restaurar do lixo

### Compartilhamento
- ✅ Listar arquivos compartilhados
- ✅ Compartilhar com email/grupo
- ✅ Editar permissões (viewer/editor/owner)
- ✅ Revogar acesso
- ✅ Obter link de compartilhamento

### Upload
- ✅ Upload simples de arquivo
- ✅ Atualizar versão de arquivo
- ✅ Batch upload de múltiplos

### Monitoramento
- ✅ Verificar quota/uso de espaço
- ✅ Verificar conexão com Drive API
- ✅ Listar histórico de mudanças

---

## ⚠️ CONSTRAINTS E LIMITAÇÕES

### Constraints Conhecidas

1. **Quota Limit:** Google Drive API tem quota de 1 milhão de chamadas por dia
2. **Rate Limiting:** Google implementa rate limiting por usuário
3. **Upload Size:** Limite máximo de 5TB por arquivo
4. **Batch Operations:** Nem todas as operações suportam batch
5. **Real-time Sync:** Google Drive não oferece webhooks em tempo real

### Limitações Técnicas

1. **Full-text Search:** Depende do índice do Google Drive (pode ter delay)
2. **Binary Files:** OCR em imagens requer processing adicional
3. **Shared Drives:** Permissões diferentes de "My Drive"
4. **Version History:** Requer API separada (não coberta aqui)

---

## 📌 REGRAS DE CONGELAMENTO

Esta matriz está **CONGELADA** e não deve ser alterada sem:

1. ✅ Revisão e aprovação oficial
2. ✅ Mudança de versão (e.g., 1.0 → 1.1)
3. ✅ Documentação de razão da mudança
4. ✅ Comunicação com equipe de desenvolvimento

**Mudanças permitidas sem revisão:**
- Status de capabilities (IMPLEMENTADA, PARCIAL, etc)
- Progresso em roadmap
- Documentação de dependências resolvidas

**Mudanças que requerem revisão:**
- Adicionar novas capabilities
- Remover capabilities
- Alterar ordem de implementação
- Mudar prioridades

---

## 🎓 MATRIZ DE DECISÃO

### Fatores Considerados na Priorização

**1. Valor para Usuário (40% da decisão)**
- Frequência de uso
- Impacto na produtividade
- Demanda de usuários

**2. Dependências Técnicas (30% da decisão)**
- Bloqueadores existentes
- Impacto em outras features
- Reutilização de código

**3. Simplicidade de Implementação (30% da decisão)**
- Complexidade técnica
- Tempo estimado
- Risco de bugs

### Scores de Exemplo

```
search-03 (Busca avançada):
  Valor: 8/10 (Alto)
  Dependências: 6/10 (Requer Query Builder)
  Simplicidade: 6/10 (Média complexidade)
  Score Final: (8×0.4) + (6×0.3) + (6×0.3) = 6.8/10 → ALTA PRIORIDADE

upload-01 (Upload):
  Valor: 9/10 (Muito Alto)
  Dependências: 5/10 (Requer uploadFile())
  Simplicidade: 4/10 (Alta complexidade)
  Score Final: (9×0.4) + (5×0.3) + (4×0.3) = 6.6/10 → ALTA PRIORIDADE

monitor-03 (Histórico):
  Valor: 6/10 (Médio)
  Dependências: 7/10 (Boa disponibilidade)
  Simplicidade: 6/10 (Média complexidade)
  Score Final: (6×0.4) + (7×0.3) + (6×0.3) = 6.3/10 → BAIXA PRIORIDADE
```

---

**Documento aprovado em: 25 de julho de 2026**  
**Próxima revisão: Sprint 8 ou a pedido**  
**Responsável: Google Drive Connector Team**
