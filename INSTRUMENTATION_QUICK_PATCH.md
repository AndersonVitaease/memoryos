/**
 * MAPA DE MODIFICAÇÕES MÍNIMAS PARA INSTRUMENTAÇÃO
 * 
 * Arquivo: QUICK_PATCH_GUIDE.md
 * Objetivo: Mostrar EXATAMENTE onde adicionar console.log em cada arquivo
 */

# 🎯 INSTRUMENTAÇÃO RÁPIDA — Google Drive Flow Tracer

## 📋 Resumo de Arquivos a Modificar

| # | Arquivo | Função | O que adicionar |
|---|---------|--------|-----------------|
| 1 | src/lib/goals/GoalRegistry.ts | recognize() | Log do goal identificado |
| 2 | src/lib/google-drive/GoogleDriveCapabilityExecutor.ts | extractExplicitFileNameHint() | Log do nome de arquivo extraído |
| 3 | src/lib/google-drive/GoogleDriveCapabilityExecutor.ts | inferFileTypeFromExplicitFileName() | Log da extensão e tipo inferido |
| 4 | src/lib/google-drive/GoogleDriveCapabilityExecutor.ts | buildDriveQuery() | Log da query construída |
| 5 | src/lib/google-drive/GoogleDriveConnector.ts | searchFiles() | Log dos resultados do Drive |
| 6 | src/lib/google-drive/GoogleDriveCapabilityExecutor.ts | executeDriveCapability() | Log do arquivo selecionado |
| 7 | src/lib/google-drive/GoogleDriveCapabilityExecutor.ts | executeDriveCapability() | Log antes de chamar Download |
| 8 | src/lib/google-drive/DriveDownloadExecutor.ts | download/execute | Log do tipo de processamento |
| 9 | src/lib/connector-runtime-provider/ConnectorResultSynthesizer.ts | synthesize() | Log da resposta final |

---

## 🔧 MODIFICAÇÃO 1: Intent Recognition

**Arquivo:** `src/lib/goals/GoalRegistry.ts`

Localize a função que retorna o goal reconhecido. Adicione:

```typescript
// Logo ANTES do return
const timestamp = new Date().toISOString();
console.log(
  `%c[1-INTENT] ${timestamp}%c Input: "${userInput}" | Goal: "${goal}"`,
  "background: #FF6B6B; color: white; padding: 2px 4px; border-radius: 2px; font-weight: bold",
  "color: gray"
);
return goal;
```

---

## 🔧 MODIFICAÇÃO 2A: Entity Extraction - Filename

**Arquivo:** `src/lib/google-drive/GoogleDriveCapabilityExecutor.ts`  
**Função:** `extractExplicitFileNameHint()`

Localize o return da função. Adicione:

```typescript
if (result && (result.includes("pdf") || result.includes("mp4") || result.includes("video"))) {
  console.log(
    `%c[2-ENTITY-A]%c Extracted: "${result}"`,
    "background: #4ECDC4; color: white; padding: 2px 4px; border-radius: 2px; font-weight: bold",
    "color: gray"
  );
}
return result;
```

---

## 🔧 MODIFICAÇÃO 2B: Entity Extraction - Type Inference

**Arquivo:** `src/lib/google-drive/GoogleDriveCapabilityExecutor.ts`  
**Função:** `inferFileTypeFromExplicitFileName()`

Localize o return da função. Adicione:

```typescript
const ext = fileName.match(/\.([a-z0-9]{1,6})$/i)?.[1]?.toLowerCase();
// ... seu switch logic aqui
const inferredType = ... // result from switch

if (fileName && (fileName.includes("pdf") || fileName.includes("mp4"))) {
  console.log(
    `%c[2-ENTITY-B]%c File: "${fileName}" | Ext: "${ext}" | Type: "${inferredType}"`,
    "background: #4ECDC4; color: white; padding: 2px 4px; border-radius: 2px; font-weight: bold",
    "color: gray"
  );
}
return inferredType;
```

---

## 🔧 MODIFICAÇÃO 3: Query Builder

**Arquivo:** `src/lib/google-drive/GoogleDriveCapabilityExecutor.ts`  
**Função:** `buildDriveQuery()`

Localize o ponto antes de retornar a query. Adicione:

```typescript
const finalQuery = parts.join(" and ");

if (rawQuery.includes("pdf") || rawQuery.includes("video") || rawQuery.includes("mp4")) {
  console.log(
    `%c[3-QUERY]%c ${finalQuery}`,
    "background: #95E1D3; color: #000; padding: 2px 4px; border-radius: 2px; font-weight: bold; font-family: monospace; font-size: 11px",
    "color: gray; font-family: monospace; font-size: 11px"
  );
}

return finalQuery;
```

---

## 🔧 MODIFICAÇÃO 4: Google Drive API

**Arquivo:** `src/lib/google-drive/GoogleDriveConnector.ts`  
**Função:** `searchFiles()` ou `listFiles()`

Logo após receber o resultado da API, adicione:

```typescript
const result = await drive.files.list({ q: query, ... });

if (query.includes("pdf") || query.includes("video") || query.includes("mp4")) {
  const filesList = (result.data?.files || []).map(f => 
    `${f.name} (ID: ${f.id}, MIME: ${f.mimeType})`
  ).join(" | ");
  
  console.log(
    `%c[4-API]%c Count: ${result.data?.files?.length || 0} | Files: ${filesList || "(none)"}`,
    "background: #FFE66D; color: #000; padding: 2px 4px; border-radius: 2px; font-weight: bold",
    "color: gray; font-family: monospace; font-size: 11px"
  );
}

return result;
```

---

## 🔧 MODIFICAÇÃO 5: File Selection

**Arquivo:** `src/lib/google-drive/GoogleDriveCapabilityExecutor.ts`  
**Função:** `executeDriveCapability()` case `"drive.openDocument"`

Quando um arquivo for selecionado, adicione:

```typescript
// Após resolver qual arquivo será aberto
const selectedFileId = resolvedFile.id;
const selectedFileName = resolvedFile.name;
const selectedMimeType = resolvedFile.mimeType;

console.log(
  `%c[5-SELECTION]%c File: "${selectedFileName}" | ID: "${selectedFileId}" | MIME: "${selectedMimeType}"`,
  "background: #A8E6CF; color: #000; padding: 2px 4px; border-radius: 2px; font-weight: bold",
  "color: gray"
);
```

---

## 🔧 MODIFICAÇÃO 6: Download Executor Call

**Arquivo:** `src/lib/google-drive/GoogleDriveCapabilityExecutor.ts`  
**Função:** `executeDriveCapability()` case `"drive.openDocument"`

Logo ANTES de chamar `DriveDownloadExecutor`, adicione:

```typescript
console.log(
  `%c[6-DOWNLOAD]%c Calling DriveDownloadExecutor | File: "${selectedFileName}"`,
  "background: #FF8B94; color: white; padding: 2px 4px; border-radius: 2px; font-weight: bold",
  "color: gray"
);

const downloadResult = await executeDriveDownload(...);
```

---

## 🔧 MODIFICAÇÃO 7: Processing Type

**Arquivo:** `src/lib/google-drive/DriveDownloadExecutor.ts`  
**Função:** `download()` ou `execute()`

No ponto onde você decide se processa com `DocumentProcessingEngine`, adicione:

```typescript
if (isBinaryOnly(mimeType)) {
  console.log(
    `%c[7-PROCESSING]%c SKIPPED DocumentProcessingEngine (binary) | MIME: "${mimeType}"`,
    "background: #FFB4A2; color: #000; padding: 2px 4px; border-radius: 2px; font-weight: bold",
    "color: gray"
  );
  // return handle
} else {
  console.log(
    `%c[7-PROCESSING]%c Calling DocumentProcessingEngine | MIME: "${mimeType}" | Size: ${content.length} bytes`,
    "background: #FFB4A2; color: #000; padding: 2px 4px; border-radius: 2px; font-weight: bold",
    "color: gray"
  );
  // call processing
}
```

---

## 🔧 MODIFICAÇÃO 8: Final Response

**Arquivo:** `src/lib/connector-runtime-provider/ConnectorResultSynthesizer.ts`  
**Função:** Final da síntese

Logo antes de retornar a resposta, adicione:

```typescript
console.log(
  `%c[8-RESPONSE]%c Length: ${finalResponse.length} chars`,
  "background: #A0C4FF; color: #000; padding: 2px 4px; border-radius: 2px; font-weight: bold",
  "color: gray"
);

return finalResponse;
```

---

## 🎬 Como Executar

### Passo 1: Adicionar os console.log
Copie os 8 blocos de código acima para os arquivos correspondentes.

### Passo 2: Abrir DevTools
- Abra o MemoryOS no navegador
- Pressione F12 → Console

### Passo 3: Executar os testes
```
Test 1: abrir anderson.pdf
Test 2: abrir video fabrica.mp4
Test 3: abrir video creatina.mp4
```

### Passo 4: Analisar os logs
- Copie todos os logs da console
- Procure pelo primeiro `[N-...]` que NÃO aparece para vídeo

---

## 📊 Exemplo de Saída Esperada

### Para PDF (funciona ✅):
```
[1-INTENT] Input: "abrir anderson.pdf" | Goal: "drive.openDocument"
[2-ENTITY-A] Extracted: "anderson.pdf"
[2-ENTITY-B] File: "anderson.pdf" | Ext: "pdf" | Type: "application/pdf"
[3-QUERY] trashed=false and mimeType='application/pdf' and name contains 'anderson.pdf'
[4-API] Count: 1 | Files: anderson.pdf (ID: abc123, MIME: application/pdf)
[5-SELECTION] File: "anderson.pdf" | ID: "abc123" | MIME: "application/pdf"
[6-DOWNLOAD] Calling DriveDownloadExecutor | File: "anderson.pdf"
[7-PROCESSING] Calling DocumentProcessingEngine | MIME: "application/pdf" | Size: 450000 bytes
[8-RESPONSE] Length: 8532 chars
```

### Para Vídeo (não funciona ❌):
```
[1-INTENT] Input: "abrir video fabrica.mp4" | Goal: "drive.openDocument"
[2-ENTITY-A] Extracted: "fabrica.mp4"
[2-ENTITY-B] File: "fabrica.mp4" | Ext: "mp4" | Type: "video/*"
[3-QUERY] trashed=false and mimeType contains 'video/' and name contains 'fabrica.mp4'
[4-API] Count: 0 | Files: (none)   ← AQUI FALHA! Ou aqui:
❌ "O recurso solicitado não foi encontrado"
```

---

## 🔍 Como Interpretar os Resultados

| Primeiro log que NÃO aparece | Diagnóstico |
|---|---|
| `[1-INTENT]` | Goal não foi reconhecido |
| `[2-ENTITY-A]` ou `[2-ENTITY-B]` | Nome/tipo do arquivo não foi extraído |
| `[3-QUERY]` | Query não foi construída corretamente |
| `[4-API]` | API retornou zero resultados |
| `[5-SELECTION]` | Arquivo não foi selecionado |
| `[6-DOWNLOAD]` | DriveDownloadExecutor não foi chamado |
| `[7-PROCESSING]` | Erro no processamento |
| `[8-RESPONSE]` | Erro na síntese final |

---

## ⚠️  Remover os Logs

Após o diagnóstico, remova todos os `console.log` que você adicionou.

Alternativa: Use DevTools → Sources → Search in all files → "[1-INTENT]" para localizar rapidamente.

---
