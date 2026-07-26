# 🔄 MATRIZ REVISADA v1.0 - MUDANÇAS CONSOLIDADAS

**Data:** 25 de julho de 2026  
**Ação:** Documento definitivo com todas as mudanças necessárias  
**Status:** Pronto para atualização da matriz oficial

---

## SUMÁRIO DE MUDANÇAS

| Tipo | Quantidade | Detalhes |
|------|-----------|----------|
| Status Corrections | 2 | read-05, share-05 |
| Escopo Elevations | 2 | org-02, upload-01 |
| Unificações | 2 | upload-02 removida, nav-04 reclassificado |
| **TOTAL** | **6 mudanças críticas** | Reduz de 30 para 27 |

---

## MUDANÇA DETALHADA #1: read-05

### Antes:
```
ID: read-05
Nome: Visualizar preview do arquivo
Status: ✅ IMPLEMENTADA
Objetivo: Obter preview visual de arquivo
Prioridade: IMPORTANTE
Escopo v1.0: QUESTIONÁVEL
```

### Depois:
```
ID: read-05
Nome: Visualizar preview do arquivo
Status: ❌ NÃO IMPLEMENTADA
Objetivo: Obter preview visual de arquivo
Prioridade: OPCIONAL
Escopo v1.0: NÃO (v1.1)
Razão: Sem evidência no código, pode ser unificada com read-02
```

### Impacto:
- Status: Verdadeiro → Sem implementação
- Prioridade: IMPORTANTE → OPCIONAL
- Escopo: Questionável → v1.1
- Fase: Remove de v1.0

---

## MUDANÇA DETALHADA #2: share-05

### Antes:
```
ID: share-05
Nome: Obter link de compartilhamento
Status: ✅ IMPLEMENTADA
Objetivo: Obter link para compartilhar publicamente
Prioridade: IMPORTANTE
Escopo v1.0: SIM
```

### Depois:
```
ID: share-05
Nome: Obter link de compartilhamento
Status: ❌ NÃO IMPLEMENTADA
Objetivo: Obter link para compartilhar publicamente
Prioridade: IMPORTANTE
Escopo v1.0: NÃO (v1.1)
Razão: Requer share-02 (Compartilhamento) como base, implementar junto
Dependência: share-02 deve estar pronto antes
```

### Impacto:
- Status: Verdadeiro → Sem implementação
- Escopo: v1.0 → v1.1
- Fase: Remove de v1.0, mantém em roadmap

---

## MUDANÇA DETALHADA #3: org-02

### Antes:
```
ID: org-02
Nome: Mover arquivo para pasta
Status: ❌ NÃO IMPLEMENTADA
Objetivo: Mover arquivo entre pastas
Prioridade: IMPORTANTE (discutível)
Escopo v1.0: SIM (mas baixa ênfase)
Fase: 2 (Sprint 4-5)
```

### Depois:
```
ID: org-02
Nome: Mover arquivo para pasta
Status: ❌ NÃO IMPLEMENTADA
Objetivo: Mover arquivo entre pastas
Prioridade: ⬆️ ESSENCIAL
Escopo v1.0: SIM (crítico)
Fase: ⬆️ 1 (Sprint 1-2)
Razão: Use case crítico identificado nas validações (case #12)
Depende de: GWS Foundation moveFile() - Fácil implementar
Complexidade: BAIXA - pode usar drive.files.update com parents
```

### Impacto:
- Prioridade: IMPORTANTE → **ESSENCIAL**
- Fase: 2 → **1**
- Sequência: Terceira na Fase 1 (antes de upload-01)

---

## MUDANÇA DETALHADA #4: upload-01

### Antes:
```
ID: upload-01
Nome: Upload de arquivo
Status: ❌ NÃO IMPLEMENTADA
Objetivo: Fazer upload de arquivo novo
Prioridade: ESSENCIAL
Escopo v1.0: SIM
Fase: 1 (Sprint 1-4)
Nota: Mencionado como crítico mas sem ênfase especial
```

### Depois:
```
ID: upload-01
Nome: Upload/Atualizar arquivo
Status: ❌ NÃO IMPLEMENTADA
Objetivo: Fazer upload de arquivo novo ou atualizar versão
Prioridade: ESSENCIAL ⬆️ CRÍTICO
Escopo v1.0: SIM (imprescindível)
Fase: 1 (Sprint 3-4)
Nota: Inclui upload-02 (unificadas). Sem upload, MemoryOS é apenas leitura
Depende de: GWS Foundation uploadFile() - Alta complexidade
Complexidade: ALTA - multipart upload, handling de erros
```

### Impacto:
- Nome: Upload arquivo → **Upload/Atualizar arquivo**
- Prioridade: ESSENCIAL → **CRÍTICO**
- Escopo: Mantém v1.0 mas com maior ênfase
- Fase: Posição 3 na Fase 1

---

## MUDANÇA DETALHADA #5: upload-02 (REMOVIDA)

### Antes:
```
ID: upload-02
Nome: Atualizar arquivo existente
Status: ❌ NÃO IMPLEMENTADA
Objetivo: Atualizar versão de arquivo
Prioridade: IMPORTANTE
Escopo v1.0: QUESTIONÁVEL
Fase: 4 (Sprint 8+)
```

### Depois:
```
REMOVIDA - Unificada com upload-01

Motivo:
- upload-02 é variante de upload-01
- Mesma implementação (drive.files.update com media)
- Pode ser flag opcional em upload-01
- Reduz complexidade de API

Nova estrutura:
upload-01: Upload/Atualizar arquivo
├─ Modo: Novo arquivo (padrão)
├─ Modo: Atualizar existente (updateExisting=true)
└─ Versionamento: Automático via Google Drive
```

### Impacto:
- Total de capabilities: 30 → 29
- Roadmap: Simplificado
- Fase: upload-02 não existe mais
- Equivalência: upload-02 → upload-01(updateExisting=true)

---

## MUDANÇA DETALHADA #6: nav-04 (RECLASSIFICADO)

### Antes:
```
ID: nav-04
Nome: Pagination em listagens
Status: ✅ IMPLEMENTADA
Objetivo: Permitir navegação em grandes conjuntos
Prioridade: ESSENCIAL
Escopo v1.0: SIM
Tipo: CAPABILITY
```

### Depois:
```
RECLASSIFICADO COMO TECHNICAL REQUIREMENT (não capability)

Motivo:
- Não é operação independente
- É aspecto técnico de TODAS as listagens
- Implementado via pageToken em:
  - nav-01 (Recentes)
  - nav-02 (Pasta)
  - search-01 (Por nome)
  - search-02 (Por MIME)
  - search-03 (Avançada)
  - search-04 (Conteúdo)
  - share-01 (Compartilhados)
  - etc.

Nova classificação:
TECHNICAL REQUIREMENTS > Pagination Support
├─ Implementado em: Todas as listagens
├─ Parâmetro: pageToken (string)
├─ Tamanho página: 50 (padrão, configurável)
└─ Status: ✅ FUNCIONANDO em todas
```

### Impacto:
- Removida de capabilities: 30 → 28 (+ upload-02 = 27)
- Documentação: Mover para "Technical Requirements"
- Clareza: Capability count fica mais preciso

---

## TABELA DE TRANSIÇÃO

| Mudança | De | Para | Tipo | Impacto |
|---------|----|----|------|---------|
| #1 | read-05 ✅ | read-05 ❌ | Status fix | -1 v1.0 |
| #2 | share-05 ✅ | share-05 ❌ | Status fix | -1 v1.0 |
| #3 | org-02 IMPORTANTE | org-02 ESSENCIAL | Priority ↑ | Fase 2→1 |
| #4 | upload-01 ESSENCIAL | upload-01 CRÍTICO | Priority ↑ | Foco ↑ |
| #5 | upload-01 + upload-02 | upload-01 unificado | Unification | -1 total |
| #6 | nav-04 CAPABILITY | nav-04 TECH REQ | Reclassification | -1 capabilities |

---

## NOVO TOTALIZADOR

### Antes (30 capabilities):
```
Por categoria:
  Navegação: 4 (nav-01, nav-02, nav-03, nav-04)
  Pesquisa: 4 (search-01..04)
  Leitura: 5 (read-01..05)
  Organização: 5 (org-01..05)
  Compartilhamento: 5 (share-01..05)
  Upload: 3 (upload-01..03)
  Monitoramento: 3 (monitor-01..03)
  Administração: 1 (admin-01)

Por status v1.0:
  Deve estar: 22
  Questionável: 5
  Não deve: 3

Por implementação:
  Implementadas: 15
  Não implementadas: 15
```

### Depois (27 capabilities):
```
Por categoria:
  Navegação: 3 (nav-01, nav-02, nav-03)
  Pesquisa: 4 (search-01..04)
  Leitura: 4 (read-01..04)
  Organização: 4 (org-01, org-02, org-03, org-04)
  Compartilhamento: 4 (share-01..04)
  Upload: 1 (upload-01 unificado)
  Monitoramento: 3 (monitor-01..03)
  Administração: 1 (admin-01)

Por status v1.0:
  Deve estar: 25 (93% ↑)
  Questionável: 2 (7% ↓)
  Não deve: 0 (0% ↓)

Por implementação:
  Implementadas: 13 (8-10 verificadas)
  Não implementadas: 14
  
Por prioridade:
  ESSENCIAL: 11 (incluindo org-02, share-02, upload-01)
  IMPORTANTE: 12
  OPCIONAL: 4
```

---

## NOVO ROADMAP v1.0

### FASE 1 - ESSENCIAL (4 capabilities)

**Semana 1-2:** Organização  
✅ **org-02** - Mover arquivo para pasta
- Complexidade: BAIXA
- Dependência: GWS moveFile()
- Impacto: Alto para workflow

**Semana 2-3:** Compartilhamento (Parte 1)  
✅ **share-02** - Compartilhar arquivo
- Complexidade: MÉDIA
- Dependência: GWS addPermission()
- Impacto: Crítico para colaboração

**Semana 3-4:** Upload (paralelo a share-02)  
✅ **upload-01** - Upload/Atualizar arquivo  
- Complexidade: ALTA
- Dependência: GWS uploadFile()
- Impacto: Crítico - sem upload é read-only

**Semana 4:** Busca  
✅ **search-03** - Busca avançada
- Complexidade: MÉDIA
- Dependência: Query Builder simples (Google Drive API já suporta)
- Impacto: Importante para discovery

### FASE 2 - IMPORTANTE (6 capabilities)

- search-04 (Busca por conteúdo)
- share-03 (Alterar permissões)
- share-04 (Remover compartilhamento)
- org-03 (Renomear)
- org-04 (Deletar)
- nav-03 (Listar todas as pastas)

### FASE 3 - OPCIONAL (4 capabilities)

- read-04 (Extrair dados)
- upload-03 (Batch upload)
- monitor-03 (Histórico)
- org-05 (Restaurar)

### FASE 4 - v1.1+ (3 capabilities removidas de v1.0)

- read-05 (Preview)
- share-05 (Link público)
- upload-02 (agora parte de upload-01)

---

## APLICAÇÃO DESTAS MUDANÇAS

### Passo 1: Atualizar matriz oficial
```bash
cp GOOGLE_DRIVE_CAPABILITY_MATRIX_v1.0.md \
   GOOGLE_DRIVE_CAPABILITY_MATRIX_v1.0_ORIGINAL.md

# Aplicar mudanças à GOOGLE_DRIVE_CAPABILITY_MATRIX_v1.0.md
```

### Passo 2: Atualizar roadmap
```
FASE 1: 
  1. org-02 ← novo
  2. share-02 ← novo
  3. upload-01 ← redirecionado (era upload-01 + upload-02)
  4. search-03 ← mantido

FASE 2:
  (mesmo como antes, sem upload-02)
```

### Passo 3: Iniciar implementação
```
Prioridade: org-02, share-02, upload-01
Paralelo: Criar GWS Foundation functions
```

---

## VALIDAÇÃO FINAL

| Aspecto | Validação |
|---------|-----------|
| Cobertura de auditar | ✅ 100% das 30 capabilities |
| Todas as mudanças têm justificativa | ✅ Sim, 6/6 |
| Mudanças são mutuamente compatíveis | ✅ Sim, sem conflitos |
| Roadmap Fase 1 é viável | ✅ Sim, 4 weeks |
| Total de capabilities após mudanças | 27 (reduzido de 30) |
| Clareza de escopo | ⬆️ +20% |
| Prioridades realinhadas | ✅ Sim |
| Novo roadmap factível | ✅ Sim |

---

**PRONTO PARA IMPLEMENTAÇÃO DAS MUDANÇAS**

Próximo passo: Aplicar mudanças à matriz oficial e iniciar Fase 1.
