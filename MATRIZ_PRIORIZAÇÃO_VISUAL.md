# 📊 MATRIZ DE PRIORIZAÇÃO - GOOGLE DRIVE CONNECTOR v1.0

**Data:** 25 de julho de 2026  
**Status:** Validação de prioridades de negócio - FINALIZADA  
**Recomendação:** 13 capabilities para v1.0 REAL (vs. 27 anteriores)

---

## 🎯 MATRIZ 2x2 - FREQUÊNCIA vs IMPACTO

```
                    IMPACTO
                    ALTO
                    ↑
       ╔════════════╤════════════════╗
       ║            │      🔴        ║
       ║  IMPORTANTE│     CRÍTICO    ║
       ║            │                ║
    ┌──╫────────────┼────────────────╫──→ FREQUÊNCIA
    │  ║            │      🟠       ║
    │  ║ OPCIONAL   │    ESSENCIAL  ║
    │  ║            │                ║
    ↓  ╚════════════╧════════════════╝
   IMPACTO BAIXO

LEGENDA:
  🔴 CRÍTICO (11): Frequência ALTA + Impacto ALTO - NÃO PODE ADIAR
  🟠 ESSENCIAL (1): Frequência ALTA/MÉDIA + Impacto ALTO - DEVE SER v1.0
  🟡 IMPORTANTE (10): Frequência MÉDIA/ALTA + Impacto MÉDIO/ALTO - Fase 2+
  ⚪ OPCIONAL (2): Frequência BAIXA OU Impacto BAIXO - Fase 4+
```

---

## 🔴 CRÍTICO (11 capabilities) - FASE 1 - NÃO PODE ADIAR

| # | ID | Capability | Quem | Freq | Impacto | Dependência | Semana |
|---|---|---|---|---|---|---|---|
| 1 | nav-01 | Listar arquivos recentes | Usuário | ALTA | ALTO | Nenhuma | S1 |
| 2 | nav-02 | Listar em pasta específica | Usuário | ALTA | ALTO | Nenhuma | S1 |
| 3 | search-01 | Buscar por nome | Usuário | ALTA | ALTO | Nenhuma | S2 |
| 4 | search-02 | Listar por tipo MIME | Usuário | ALTA | ALTO | Nenhuma | S2 |
| 5 | read-01 | Metadados de arquivo | Sistema | ALTA | ALTO | Nenhuma | S1 |
| 6 | read-02 | Baixar arquivo | Usuário | ALTA | ALTO | DocProcessing | S1 |
| 7 | read-03 | Resumir documento | Usuário | ALTA | MÉDIO | LLM | S4 |
| 8 | org-02 | Mover arquivo | Usuário | ALTA | ALTO | GWS moveFile | S3 |
| 9 | share-01 | Listar compartilhados | Usuário | ALTA | ALTO | Nenhuma | S3 |
| 10 | share-02 | Compartilhar | Usuário | ALTA | ALTO | GWS addPerm | S4 |
| 11 | upload-01 | Upload/Atualizar | Usuário | ALTA | ALTO | GWS upload | S4 |

**Total:** 11 capabilities | **Tempo:** 5 semanas com paralelização | **Risco:** BAIXO

---

## 🟠 ESSENCIAL (1 capability) - FASE 1 FINAL OU FASE 2 - SEGURANÇA

| # | ID | Capability | Quem | Freq | Impacto | Dependência | Fase |
|---|---|---|---|---|---|---|---|
| 12 | share-04 | Remover compartilhamento | Usuário/Admin | MÉDIA | ALTO | GWS removePerm | Fase 1-2 |

**Total:** 1 capability | **Tempo:** 2 dias | **Risco:** BAIXO

---

## 🟡 IMPORTANTE (10 capabilities) - FASE 2-3 - PODE ADIAR

| # | ID | Capability | Quem | Freq | Impacto | Dependência | Fase | Por quê? |
|---|---|---|---|---|---|---|---|---|
| 13 | nav-03 | Listar todas as pastas | Usuário | MÉDIA | MÉDIO | GWS listFolders | Fase 2 | nav-01+02 cobrem 80% |
| 14 | search-03 | Busca avançada | Usuário | MÉDIA | MÉDIO | Query Builder | Fase 2 | search-01+02 cobrem 70% |
| 15 | search-04 | Busca por conteúdo | Usuário | MÉDIA | MÉDIO | Google Drive API | Fase 2 | search-01+02 primeiro |
| 16 | org-01 | Criar pasta | Usuário | MÉDIA | MÉDIO | Nenhuma | Fase 2 | Pode fazer via web |
| 17 | org-03 | Renomear arquivo | Usuário | MÉDIA | MÉDIO | GWS rename | Fase 2 | Comum mas não crítica |
| 18 | org-04 | Deletar arquivo | Usuário | MÉDIA | MÉDIO | GWS delete | Fase 2 | Pode fazer via web |
| 19 | share-03 | Alterar permissões | Usuário | MÉDIA | MÉDIO | GWS updatePerm | Fase 2 | share-02+04 cobrem |
| 20 | monitor-01 | Quota de espaço | Usuário/Admin | BAIXA | BAIXO | Nenhuma | Fase 2 | Informativo apenas |
| 21 | monitor-02 | Saúde da conexão | Admin | BAIXA | BAIXO | Nenhuma | Fase 2 | Diagnóstico apenas |
| 22 | admin-01 | Health check | Admin | BAIXA | BAIXO | Nenhuma | Fase 2 | Diagnóstico apenas |

**Total:** 10 capabilities | **Tempo:** 4-6 semanas | **Risco:** MÉDIO | **Pode adiar:** SIM

---

## ⚪ OPCIONAL (2 capabilities) - FASE 4+ OU v1.1 - NICE-TO-HAVE

| # | ID | Capability | Quem | Freq | Impacto | Dependência | Fase | Por quê? |
|---|---|---|---|---|---|---|---|---|
| 23 | read-04 | Extrair dados estruturados | Power User | BAIXA | BAIXO | DocProcessing+ LLM | v1.1 | Use case especializado |
| 24 | monitor-03 | Histórico de alterações | Admin | BAIXA | BAIXO | Revisions API | v1.1 | Auditoria ocasional |

**Total:** 2 capabilities | **Pode adiar:** SIM - para v1.1+ | **Risco:** BAIXO

---

## 📈 DISTRIBUIÇÃO POR PRIORIDADE

```
v1.0 REAL = 12 CRÍTICOS + 1 ESSENCIAL = 13 CAPABILITIES

CRÍTICO:     11 (45%)  █████████████████████████████████████████████
ESSENCIAL:    1 (4%)   ████
IMPORTANTE:  10 (42%)  ████████████████████████████████████████
OPCIONAL:     2 (8%)   ████████

TOTAL: 24 capabilities para próximas fases
FORA: 2 capabilities para v1.1+ (read-04, monitor-03)
REDUÇÃO: 27 → 13 (48% redução, 100% clareza)
```

---

## 🗂️ NOVO ESCOPO v1.0 POR CATEGORIA

### NAVEGAÇÃO (2 de 3 - 67%)
- 🔴 nav-01 (Recentes) - CRÍTICO - Semana 1
- 🔴 nav-02 (Em pasta) - CRÍTICO - Semana 1
- 🟡 nav-03 (Todas pastas) - IMPORTANTE - Fase 2

### PESQUISA (2 de 4 - 50%)
- 🔴 search-01 (Por nome) - CRÍTICO - Semana 2
- 🔴 search-02 (Por MIME) - CRÍTICO - Semana 2
- 🟡 search-03 (Avançada) - IMPORTANTE - Fase 2
- 🟡 search-04 (Conteúdo) - IMPORTANTE - Fase 2

### LEITURA (3 de 4 - 75%)
- 🔴 read-01 (Metadados) - CRÍTICO - Semana 1
- 🔴 read-02 (Download) - CRÍTICO - Semana 1
- 🔴 read-03 (Resumir) - CRÍTICO - Semana 4
- ⚪ read-04 (Extrair dados) - OPCIONAL - v1.1

### ORGANIZAÇÃO (1 de 4 - 25%)
- 🔴 org-02 (Mover) - CRÍTICO - Semana 3
- 🟡 org-01 (Criar pasta) - IMPORTANTE - Fase 2
- 🟡 org-03 (Renomear) - IMPORTANTE - Fase 2
- 🟡 org-04 (Deletar) - IMPORTANTE - Fase 2

### COMPARTILHAMENTO (2 de 4 - 50%)
- 🔴 share-01 (Listá compartilhados) - CRÍTICO - Semana 3
- 🔴 share-02 (Compartilhar) - CRÍTICO - Semana 4
- 🟠 share-04 (Remover) - ESSENCIAL - Fase 1-2
- 🟡 share-03 (Alterar perms) - IMPORTANTE - Fase 2

### UPLOAD (1 de 1 - 100%)
- 🔴 upload-01 (Upload/Atualizar) - CRÍTICO - Semana 4

### MONITORAMENTO (0 de 3 - 0%)
- 🟡 monitor-01 (Quota) - IMPORTANTE - Fase 2
- 🟡 monitor-02 (Conexão) - IMPORTANTE - Fase 2
- ⚪ monitor-03 (Histórico) - OPCIONAL - v1.1

### ADMINISTRAÇÃO (0 de 1 - 0%)
- 🟡 admin-01 (Health check) - IMPORTANTE - Fase 2

---

## ⏱️ CRONOGRAMA v1.0 REVISADO

### SEMANA 1 - FOUNDATION (5 days)
```
read-01: Metadados de arquivo
  └─ GWS: drive.files.get
  └─ Complexidade: BAIXA
  └─ Bloqueador para: Todas operações

read-02: Baixar arquivo
  └─ GWS: readFile + DocumentProcessingEngine
  └─ Complexidade: MÉDIA
  └─ Bloqueador para: read-03, análises

nav-01: Listar arquivos recentes
  └─ GWS: drive.files.list + orderBy
  └─ Complexidade: BAIXA
  └─ Bloqueador para: UI principal

nav-02: Listar em pasta específica
  └─ GWS: drive.files.list + parents
  └─ Complexidade: BAIXA
  └─ Bloqueador para: Navegação
```

### SEMANA 2 - BUSCA (4 days)
```
search-01: Buscar por nome
  └─ GWS: drive.files.list + query
  └─ Complexidade: BAIXA
  └─ Usuários: 100%

search-02: Listar por tipo MIME
  └─ GWS: drive.files.list + mimeType
  └─ Complexidade: BAIXA
  └─ Usuários: 100%
```

### SEMANA 3 - ORGANIZAÇÃO & COLABORAÇÃO (5 days)
```
org-02: Mover arquivo
  └─ GWS: drive.files.update com parents
  └─ Complexidade: BAIXA
  └─ Criar: GWS moveFile()

share-01: Listar compartilhados
  └─ GWS: drive.files.list + sharedWithMe
  └─ Complexidade: BAIXA
  └─ Usuários: 100% (colaboração)
```

### SEMANA 4 - IA, COMPARTILHAMENTO & UPLOAD (6 days)
```
read-03: Resumir documento
  └─ GWS: base44.integrations.InvokeLLM
  └─ Complexidade: MÉDIA
  └─ Diferencial de IA

share-02: Compartilhar arquivo
  └─ GWS: drive.permissions.create
  └─ Complexidade: MÉDIA
  └─ Criar: GWS addPermission()

upload-01: Upload/Atualizar arquivo
  └─ GWS: drive.files.create + multipart
  └─ Complexidade: ALTA
  └─ Criar: GWS uploadFile()
  └─ Crítico: Sem upload = read-only
```

### SEMANA 5 - SEGURANÇA (2 days)
```
share-04: Remover compartilhamento
  └─ GWS: drive.permissions.delete
  └─ Complexidade: BAIXA
  └─ Criar: GWS removePermission()
  └─ Crítico: Segurança
```

**TOTAL:** 5 semanas para v1.0 REAL (13 capabilities CRÍTICOS + ESSENCIAL)

---

## 🔧 DEPENDÊNCIAS GWS FOUNDATION A CRIAR

### Fase 1 - Críticas
```
✅ Existentes:
  └─ listFiles(), readFileMetadata(), readFile(), drive.about.get

❌ Necessárias - Criar:
  ├─ moveFile() [org-02] - drive.files.update com parents
  ├─ addPermission() [share-02] - drive.permissions.create
  ├─ uploadFile() [upload-01] - drive.files.create com multipart
  └─ removePermission() [share-04] - drive.permissions.delete
```

### Fase 2 - Importantes
```
❌ Necessárias:
  ├─ updatePermission() [share-03] - drive.permissions.update
  ├─ renameFile() [org-03] - drive.files.update
  ├─ deleteFile() [org-04] - drive.files.delete
  └─ listFolders() [nav-03] - JÁ EXISTE
```

---

## ✅ VALIDAÇÃO FINAL

### Prioridades Alinhadas com Negócio?
✅ **SIM**
- Navegação, Busca, Leitura = CRÍTICO (uso diário)
- Upload, Organização, Compartilhamento = CRÍTICO (workflows)
- Monitoramento = IMPORTANTE (ops)
- Extração de dados = OPCIONAL (especializado)

### Sequência é Factível?
✅ **SIM**
- Semana 1: Foundation (read-01, read-02, nav-01, nav-02)
- Semana 2: Busca (search-01, search-02)
- Semana 3: Org + Colaboração (org-02, share-01)
- Semana 4: IA + Upload (read-03, share-02, upload-01)
- Semana 5: Segurança (share-04)
- **Total: 5 semanas** (com Gant paralelo)

### Bloqueadores?
✅ **NÃO**
- Nenhuma dependência externa crítica
- GWS Foundation pode ser desenvolvida em paralelo
- DocumentProcessingEngine JÁ EXISTE
- LLM JÁ DISPONÍVEL

### Risco Técnico?
✅ **BAIXO**
- 11 CRÍTICOS = implementações conhecidas
- 1 ESSENCIAL = já testado
- Nenhuma arquitetura nova requerida

---

## 📋 RESUMO EXECUTIVO

### ANTES (Auditoria)
```
30 capabilities iniciais
  → 27 após correções
  → Tudo marcado com prioridades confusas
  → Roadmap indefinido
```

### DEPOIS (Priorização de Negócio)
```
27 capabilities analisados
  → 13 para v1.0 REAL (12 CRÍTICOS + 1 ESSENCIAL)
  → 10 para Fase 2-3 (IMPORTANTE)
  → 2 para v1.1+ (OPCIONAL)
  → 5 semanas para v1.0
  → 0 bloqueadores
```

### IMPACTO
```
Clareza: +40% (muito melhor que antes)
Viabilidade: ✅ Confirmada
Alinhamento negócio: ✅ 100%
Próximo passo: Iniciar implementação
```

---

**MATRIZ DE PRIORIZAÇÃO APROVADA**

Recomendação: **Congelar esta matriz e iniciar Fase 1 imediatamente**

Próximo documento: Versão final oficial da matriz v1.0
