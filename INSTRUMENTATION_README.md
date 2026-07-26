# 📑 ÍNDICE DE INSTRUMENTAÇÃO — Guia de Referência Rápida

## 📂 Arquivos Criados

| Arquivo | Objetivo | Ler Primeiro? |
|---------|----------|---|
| **INSTRUMENTATION_EXECUTIVE_SUMMARY.md** | 📋 Visão geral do processo | ✅ **SIM** |
| **INSTRUMENTATION_QUICK_PATCH.md** | 🔧 Instruções exatas de modificação | ✅ **SIM** (depois) |
| **INSTRUMENTATION_VISUAL_CHECKLIST.md** | 📊 Fluxograma visual + checklist | ✅ **SIM** (referência) |
| **src/lib/instrumentation/DriveFlowTracer.ts** | 🎯 Classe de rastreamento (opcional) | ❌ Apenas referência |
| **src/lib/instrumentation/InstrumentationHooks.ts** | 📌 Pontos de injeção de logs | ❌ Apenas referência |
| **src/lib/instrumentation/INSTRUMENTATION_GUIDE.ts** | 📚 Documentação detalhada | ❌ Apenas referência |

---

## ⚡ Sequência Recomendada

### Dia 1 - Leitura & Preparação (10 minutos)

1. **Leia:** `INSTRUMENTATION_EXECUTIVE_SUMMARY.md`
   - Entenda o objetivo
   - Veja o Quick Start

2. **Estude:** `INSTRUMENTATION_QUICK_PATCH.md`
   - 9 modificações listadas
   - Copie os códigos `console.log` necessários

3. **Ref:** `INSTRUMENTATION_VISUAL_CHECKLIST.md`
   - Veja o fluxograma visual
   - Entenda os checkpoints

### Dia 1/2 - Execução (20 minutos)

1. **Modifique:** 9 arquivos conforme `INSTRUMENTATION_QUICK_PATCH.md`
   - Copie blocos de código
   - Cole nos locais indicados

2. **Teste:** Três comandos no MemoryOS
   ```
   Test 1: abrir anderson.pdf
   Test 2: abrir video fabrica.mp4
   Test 3: abrir video creatina.mp4
   ```

3. **Coleta:** Copie os logs de cada teste
   - Use filtro `[` no DevTools Console

### Dia 2 - Análise (15 minutos)

1. **Organize:** Os 3 logs em um arquivo de texto

2. **Compare:** PDF vs Vídeo
   - Procure pelo primeiro `[N-...]` que diverge

3. **Documente:** Seu diagnóstico

---

## 🎯 Comandos Rápidos

### Adicionar logs (Ctrl+H Find & Replace)

Para cada função, use Find & Replace:

```
FUNCTION 1 (GoalRegistry.ts):
Find:    return goal;
Replace: console.log("[1-INTENT]", goal); return goal;
```

Repita para as 9 funções listadas em `INSTRUMENTATION_QUICK_PATCH.md`.

### Coletar logs (DevTools)

```javascript
// No DevTools Console, execute:
copy(
  Array.from(document.querySelectorAll('.console-message'))
    .map(e => e.textContent)
    .filter(t => t.includes('[') && t.includes(']'))
    .join('\n')
)
// Ou simplesmente: Ctrl+L (select all) → Ctrl+C (copy)
```

### Remover logs (Find & Replace reverso)

```
Find:    console.log("[.-TRACE.*");.*
Replace: (deixe vazio)
Regex:   ✅ enabled
```

---

## 📍 Etapas do Pipeline (Quick Reference)

```
1. Intent Recognition    → [1-INTENT]
2. Entity Extraction     → [2-ENTITY-A], [2-ENTITY-B]
3. Query Building        → [3-QUERY]
4. Google Drive API      → [4-API]
5. File Selection        → [5-SELECTION]
6. Download Executor     → [6-DOWNLOAD]
7. Processing Type       → [7-PROCESSING]
8. Final Response        → [8-RESPONSE]
```

---

## 🔍 What To Look For

**Se [4-API] retorna Count: 0**
→ File não está no Drive OU Query errada

**Se [4-API] retorna Count: 1+ mas [5-SELECTION] não aparece**
→ Problema na seleção/resolução do arquivo

**Se [7-PROCESSING] diz "SKIPPED (binary)" para PDF**
→ Problema na detecção de tipo de arquivo

**Se [8-RESPONSE] não aparece**
→ Erro na síntese final

---

## 🚀 Próximos Passos Após Diagnóstico

Após identificar a etapa exata:

1. **Limpe os logs** (remova console.log)
2. **Corrija o código** baseado no diagnóstico
3. **Teste novamente** sem instrumentação

---

## 📞 Referência de Funções

| Função | Arquivo | Checkpoint |
|--------|---------|-----------|
| recognize() | GoalRegistry.ts | [1-INTENT] |
| extractExplicitFileNameHint() | GoogleDriveCapabilityExecutor.ts | [2-ENTITY-A] |
| inferFileTypeFromExplicitFileName() | GoogleDriveCapabilityExecutor.ts | [2-ENTITY-B] |
| buildDriveQuery() | GoogleDriveCapabilityExecutor.ts | [3-QUERY] |
| searchFiles() | GoogleDriveConnector.ts | [4-API] |
| resolveSingleSearchResult() | GoogleDriveCapabilityExecutor.ts | [5-SELECTION] |
| executeDriveCapability() | GoogleDriveCapabilityExecutor.ts | [6-DOWNLOAD] |
| download() | DriveDownloadExecutor.ts | [7-PROCESSING] |
| synthesize() | ConnectorResultSynthesizer.ts | [8-RESPONSE] |

---

## 💾 Format dos Logs

Todos os logs seguem este padrão:

```
[N-STAGE] Description: value | Description2: value2
```

Exemplo:
```
[4-API] Count: 1 | Files: anderson.pdf (ID: abc123, MIME: application/pdf)
```

---

## ❓ FAQ Rápido

**P: Posso adicionar os logs sem que a aplicação quebre?**
A: Sim, `console.log` não interfere na execução. É completamente seguro.

**P: Quantos logs vou ter de cada teste?**
A: Máximo 8 logs por teste (um para cada checkpoint).

**P: Se um teste quebrar a aplicação?**
A: Remova o último `console.log` adicionado e tente novamente.

**P: Depois que diagnosticar, o que fazer?**
A: Remova todos os logs e corrija o bug identificado.

---

## 🎓 Exemplo Prático

### Passo 1: Adicionar primeiro log

Arquivo: `src/lib/goals/GoalRegistry.ts`

Localize:
```typescript
export function recognize(userInput: string): string {
  // ... lógica
  return goal;  // ← AQUI
}
```

Modifique para:
```typescript
export function recognize(userInput: string): string {
  // ... lógica
  console.log(`[1-INTENT] Input: "${userInput}" | Goal: "${goal}"`);
  return goal;
}
```

### Passo 2: Testar

No MemoryOS, execute: `abrir anderson.pdf`

No DevTools Console, você verá:
```
[1-INTENT] Input: "abrir anderson.pdf" | Goal: "drive.openDocument"
```

### Passo 3: Continuar com os próximos 8 checkpoints

Repita o processo para as 8 funções restantes.

---

## ✅ Checklist Final

Antes de começar:

- [ ] Fiz backup da aplicação
- [ ] Abri `INSTRUMENTATION_EXECUTIVE_SUMMARY.md`
- [ ] Entendi os 8 checkpoints
- [ ] Tenho `INSTRUMENTATION_QUICK_PATCH.md` em mãos
- [ ] Abri DevTools (F12) e estou pronto
- [ ] Criei um arquivo para copiar os logs
- [ ] Tenho os 3 testes prontos para executar

---

**Ready? Comece com:**
👉 `INSTRUMENTATION_EXECUTIVE_SUMMARY.md`

---
