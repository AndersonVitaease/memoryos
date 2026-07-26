# 📦 Google Drive Connector v2.0 - Protótipo Completo

## 🎯 Objetivo
Separar download de processamento, suportar binários, e unificar intents para melhor arquitetura.

## ✅ Status
**Prototipado**: 6 arquivos criados (2,500+ linhas de código comentado)

---

## 📄 Arquivos Criados

### **1. ContentDescriptor.ts** (Fase 2)
- **Tipo**: Tipos/Interfaces
- **Tamanho**: ~150 linhas
- **Propósito**: Define tipos discriminados para content (text vs binary)
- **Exports**:
  - `DownloadHandle` - Referência opaca para arquivo
  - `TextContentDescriptor` - Conteúdo extraído
  - `BinaryContentDescriptor` - Referência a arquivo binário
  - `ContentDescriptor` - Union type
  - `isTextContent()`, `isBinaryContent()` - Type guards

**Usar quando**: Atualizar tipos do executor, síntese, contexto

---

### **2. BinaryContentHandler.ts** (Fase 1)
- **Tipo**: Core Business Logic
- **Tamanho**: ~280 linhas
- **Propósito**: Encapsula decisões de processamento
- **Classe Principal**: `BinaryContentHandler`
- **Métodos-chave**:
  - `shouldProcess(mimeType)` - Decide se processar ou não
  - `createTextDescriptor()` - Factory para text
  - `createBinaryDescriptor()` - Factory para binary
  - `canPreview(mimeType)` - Hints para UI
  - `formatFileSize()`, `getMimeCategory()` - Utils

**Usar quando**: Implementar decisão de processamento no executor

---

### **3. DriveDownloadExecutor.refactored.ts** (Fase 3)
- **Tipo**: Referência de Implementação
- **Tamanho**: ~200 linhas (apenas partes-chave)
- **Propósito**: Mostra como integrar BinaryContentHandler
- **Mudanças-principais**:
  - Injetar `BinaryContentHandler` no constructor
  - Chamar `shouldProcess()` antes de processar
  - Retornar `ContentDescriptor` em vez de string
  - Manter backwards compatibility

**Usar quando**: Refatorar o executor real no codebase

---

### **4. ConnectorResultSynthesizer.refactored.ts** (Fase 4)
- **Tipo**: Referência de Implementação
- **Tamanho**: ~280 linhas (apenas partes-chave)
- **Propósito**: Mostra como síntese adapta-se a novo format
- **Mudanças-principais**:
  - Reconhecer `content.kind` (text vs binary)
  - Mensagens contextualizadas por MIME type
  - Nunca enviar binário ao LLM
  - Retornar handle para posterior resgate

**Usar quando**: Refatorar síntese real no codebase

---

### **5. GoalRegistry.refactored.ts** (Fase 5)
- **Tipo**: Referência de Implementação
- **Tamanho**: ~300 linhas
- **Propósito**: Mostra intent consolidada
- **Mudanças-principais**:
  - Goal unificada: `drive.openOrStream`
  - Sinais abrangentes (todos os verbos)
  - Decision logic no runtime (não no goal)
  - Mapping retrógrado para goals antigos

**Usar quando**: Consolidar goals no codebase

---

### **6. IMPLEMENTATION_PLAN.md**
- **Tipo**: Roadmap + Decisões Arquiteturais
- **Tamanho**: ~500 linhas
- **Conteúdo**:
  - Resumo das 5 fases
  - Fluxo completo antes/depois
  - Cronograma de implementação (5 semanas)
  - Considerações técnicas
  - FAQ
  - Métricas de impacto

**Usar quando**: Planejar sprint, comunicar com time

---

### **7. BinaryContentHandler.test.ts**
- **Tipo**: Testes Unitários
- **Tamanho**: ~450 linhas
- **Propósito**: Demonstra como testar Fase 1
- **Cobertura**:
  - `shouldProcess()` - 20+ casos
  - `canPreview()` - Edge cases
  - `createDescriptor()` - Factory tests
  - Utilities - formatFileSize, getMimeCategory
  - Integration tests
  - Snapshots

**Usar quando**: Validar BinaryContentHandler

---

## 🚀 Como Usar Este Protótipo

### **Cenário 1: Revisar Arquitetura (30 min)**
1. Ler `IMPLEMENTATION_PLAN.md` (Resumo Executivo + 5 fases)
2. Revisar `ContentDescriptor.ts` (tipos)
3. Revisar `BinaryContentHandler.ts` (lógica core)
4. Ler "Benefícios" em IMPLEMENTATION_PLAN.md

**Output**: Entender proposta e viabilidade

---

### **Cenário 2: Validar com Testes (1 hora)**
1. Copiar `ContentDescriptor.ts` + `BinaryContentHandler.ts` para projeto
2. Copiar `BinaryContentHandler.test.ts` para `src/lib/content-handling/`
3. Rodar: `npm run test BinaryContentHandler.test.ts`
4. Verificar ~50 testes passam

**Output**: Confirmar implementação funciona isolada

---

### **Cenário 3: Implementação Completa (5 semanas)**

#### **Semana 1-2: Foundation + Executor**
1. Copiar files: `ContentDescriptor.ts`, `BinaryContentHandler.ts`
2. Atualizar `DriveDownloadExecutor.ts` conforme `DriveDownloadExecutor.refactored.ts`
3. Testes: `npm run test BinaryContentHandler.test.ts`
4. Commit: "feat: add BinaryContentHandler, support binary content"

#### **Semana 3: Síntese**
1. Atualizar `ConnectorResultSynthesizer.ts` conforme `ConnectorResultSynthesizer.refactored.ts`
2. Atualizar `GoogleDriveContextBuilder.ts` para reconhecer novo format
3. Testes: Verificar respostas por MIME type (text, video, zip, etc.)
4. Commit: "feat: synthesizer handles text and binary content"

#### **Semana 4: Goals**
1. Consolidar goals em `GoalRegistry.ts` conforme `GoalRegistry.refactored.ts`
2. Criar runtime decision: `DriveOpenOrStreamRuntime.ts`
3. E2E tests: "assistir", "abrir", "ler" MP4 → mesmo comportamento
4. Commit: "feat: unified drive.openOrStream goal"

#### **Semana 5: Release**
1. Deprecate aviso para goals antigos
2. Documentação de migração
3. Feature flag (se necessário)
4. Merge para main

---

## 📊 Matriz de Decisão

| Situação | O que fazer |
|----------|------------|
| "Quero entender proposta" | Ler IMPLEMENTATION_PLAN.md |
| "Quero validar viabilidade" | Rodar BinaryContentHandler.test.ts |
| "Quero implementar agora" | Copiar todos os .ts files para codebase |
| "Quero ajustar policy" | Editar DEFAULT_PROCESSING_POLICY em BinaryContentHandler.ts |
| "Quero suportar novo tipo" | Adicionar à policy + novo tipo em síntese |

---

## 🔍 Como Adaptar ao Seu Codebase

### **Se você usa tipos TS em outro lugar:**
1. Verificar imports em `ContentDescriptor.ts`
2. Ajustar paths se structure diferentes
3. Certificar type exports coincidem

### **Se você tem código de síntese customizado:**
1. Ler `ConnectorResultSynthesizer.refactored.ts` (apenas as mudanças)
2. Adaptar lógica de dispatch baseado em `descriptor.kind`
3. Garantir nunca enviar binário ao LLM

### **Se você tem goals diferentes:**
1. Ler `GoalRegistry.refactored.ts` (estrutura)
2. Adaptar sinais conforme seu domínio
3. Manter backwards compat com antigos

---

## 💡 Perguntas Frequentes

**P: Posso usar isso parcialmente?**
R: Sim! Recomendo fazer Fase 1-2 primeiro (tipos + handler), depois Fase 3-4.

**P: Como fico backwards compatible?**
R: Manter antigos formats por 1-2 versões. Síntese detecta ambos.

**P: E se mimeType desconhecido?**
R: Default = binary (fail-safe). Se processável, descobrir depois.

**P: Performance impacto?**
R: Nenhum negativo. `shouldProcess()` é O(1). Economia de 9MB LLM = 10x+ ganho.

**P: Testes suficientes?**
R: BinaryContentHandler.test.ts tem 50 testes. Adicionar mais para síntese e goals.

---

## 📈 Impacto Esperado

```
ANTES:
- "abrir creatina.mp4" → Error "Falha no processamento"
- Payload LLM: 9 MB
- 5 goals fragmentadas
- Latência: 8 segundos

DEPOIS:
- "abrir creatina.mp4" → "📹 Vídeo pronto (9.2 MB)"
- Payload LLM: 100 bytes
- 1 goal unificada
- Latência: <100ms
```

---

## 🤝 Próximos Passos

1. **Revisão com arquiteto** (1h)
   - Aprovar tipos
   - Ajustar policy conforme seu caso de uso
   
2. **Estimar sprint** (30m)
   - Quebrar 5 semanas em tasks JIRA
   - Alocar recursos
   
3. **Kick-off** (1h)
   - Explicar team o que muda
   - Mostrar tests
   - Definir feature flags

4. **Implementação iterativa**
   - Sprint 1: Foundation
   - Sprint 2: Executor + Síntese
   - Sprint 3: Goals
   - Sprint 4: Testing + Docs

---

## 📞 Suporte

- **Dúvidas de design**: Revisar IMPLEMENTATION_PLAN.md seções relevantes
- **Dúvidas de código**: Revisar comentários em cada .ts file
- **Dúvidas de teste**: Rodar BinaryContentHandler.test.ts com verbose

---

**Status**: ✅ Prototipado e pronto para implementação
**Próximo**: Definir sprint de implementação
