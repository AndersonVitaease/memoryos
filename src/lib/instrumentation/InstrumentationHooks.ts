/**
 * InstrumentationHooks.ts — Injeção de logging em pontos estratégicos
 * 
 * Arquivo de referência mostrando ONDE adicionar console.log para instrumentação.
 * 
 * Use este arquivo como guia para adicionar logging temporário nas 
 * seguintes funções:
 */

// ════════════════════════════════════════════════════════════════════════════════
// 1. INTENT RECOGNITION (GoalRegistry.ts)
// ════════════════════════════════════════════════════════════════════════════════
/*
Arquivo: src/lib/goals/GoalRegistry.ts
Função: recognize() ou similar

ADICIONE APÓS RECONHECER O GOAL:

  console.log(`[TRACE-1-INTENT] Input: "${userInput}"`);
  console.log(`[TRACE-1-INTENT] Goal recognized: ${recognizedGoal}`);
*/

// ════════════════════════════════════════════════════════════════════════════════
// 2. ENTITY EXTRACTION (GoogleDriveCapabilityExecutor.ts)
// ════════════════════════════════════════════════════════════════════════════════
/*
Arquivo: src/lib/google-drive/GoogleDriveCapabilityExecutor.ts
Função: extractExplicitFileNameHint()

ADICIONE NO FIM DA FUNÇÃO:

  console.log(`[TRACE-2-ENTITY] Input: "${rawQuery}"`);
  console.log(`[TRACE-2-ENTITY] Extracted filename: ${result}`);
*/

// ════════════════════════════════════════════════════════════════════════════════
/*
Arquivo: src/lib/google-drive/GoogleDriveCapabilityExecutor.ts
Função: inferFileTypeFromExplicitFileName()

ADICIONE NO FIM DA FUNÇÃO:

  const ext = fileName.match(/\.([a-z0-9]{1,6})$/i)?.[1]?.toLowerCase();
  const result = ... // your switch logic
  console.log(`[TRACE-2-ENTITY] Filename: "${fileName}"`);
  console.log(`[TRACE-2-ENTITY] Extension: "${ext}"`);
  console.log(`[TRACE-2-ENTITY] Type inferred: "${result}"`);
  return result;
*/

// ════════════════════════════════════════════════════════════════════════════════
// 3. QUERY BUILDER (GoogleDriveCapabilityExecutor.ts)
// ════════════════════════════════════════════════════════════════════════════════
/*
Arquivo: src/lib/google-drive/GoogleDriveCapabilityExecutor.ts
Função: buildDriveQuery()

ADICIONE ANTES DE RETORNAR:

  const finalQuery = parts.join(" and ");
  console.log(`[TRACE-3-QUERY] Query constructed: "${finalQuery}"`);
  return finalQuery;
*/

// ════════════════════════════════════════════════════════════════════════════════
// 4. GOOGLE DRIVE API CALL (GoogleDriveConnector.ts)
// ════════════════════════════════════════════════════════════════════════════════
/*
Arquivo: src/lib/google-drive/GoogleDriveConnector.ts
Função: searchFiles() ou listFiles()

ADICIONE LOGO APÓS A CHAMADA À API:

  console.log(`[TRACE-4-API] Query: "${query}"`);
  console.log(`[TRACE-4-API] Results count: ${searchResult.files?.length || 0}`);
  
  if (searchResult.files?.length > 0) {
    console.log(`[TRACE-4-API] Files returned:`);
    searchResult.files.forEach(f => {
      console.log(`  - ${f.name} (ID: ${f.id}, MIME: ${f.mimeType})`);
    });
  }
*/

// ════════════════════════════════════════════════════════════════════════════════
// 5. FILE SELECTION (GoogleDriveCapabilityExecutor.ts)
// ════════════════════════════════════════════════════════════════════════════════
/*
Arquivo: src/lib/google-drive/GoogleDriveCapabilityExecutor.ts
Função: executeDriveCapability() case "drive.openDocument"

ADICIONE QUANDO UM ARQUIVO FOR SELECIONADO:

  console.log(`[TRACE-5-SELECTION] Selected file: ${selectedFile.name}`);
  console.log(`[TRACE-5-SELECTION] File ID: ${selectedFile.id}`);
  console.log(`[TRACE-5-SELECTION] MIME Type: ${selectedFile.mimeType}`);
*/

// ════════════════════════════════════════════════════════════════════════════════
// 6. DOWNLOAD EXECUTOR CALL
// ════════════════════════════════════════════════════════════════════════════════
/*
Arquivo: src/lib/google-drive/GoogleDriveCapabilityExecutor.ts
Função: executeDriveCapability() case "drive.openDocument"

ADICIONE LOGO ANTES DE CHAMAR DriveDownloadExecutor:

  console.log(`[TRACE-6-DOWNLOAD] DriveDownloadExecutor called with:`);
  console.log(`  - fileId: ${fileId}`);
  console.log(`  - fileName: ${fileName}`);
  
OU LOGO APÓS SE NÃO FOI CHAMADO:

  console.log(`[TRACE-6-DOWNLOAD] ⚠️ DriveDownloadExecutor NOT called`);
  console.log(`[TRACE-6-DOWNLOAD] Reason: ...`);
*/

// ════════════════════════════════════════════════════════════════════════════════
// 7. DOCUMENT PROCESSING ENGINE CALL
// ════════════════════════════════════════════════════════════════════════════════
/*
Arquivo: src/lib/google-drive/DriveDownloadExecutor.ts
Função: executar() ou similar

ADICIONE LOGO ANTES DE CHAMAR DocumentProcessingEngine:

  console.log(`[TRACE-7-PROCESSING] DocumentProcessingEngine called:`);
  console.log(`  - MIME Type: ${mimeType}`);
  console.log(`  - File size: ${content.length} bytes`);
  
OU SE NÃO CHAMAR:

  console.log(`[TRACE-7-PROCESSING] DocumentProcessingEngine NOT called`);
  console.log(`[TRACE-7-PROCESSING] Reason: Binary file (using handle instead)`);
*/

// ════════════════════════════════════════════════════════════════════════════════
// 8. FINAL RESPONSE
// ════════════════════════════════════════════════════════════════════════════════
/*
Arquivo: src/lib/connector-runtime-provider/ConnectorResultSynthesizer.ts
Função: synthesize() ou similar

ADICIONE ANTES DE RETORNAR A RESPOSTA:

  console.log(`[TRACE-8-RESPONSE] Final response sent to user`);
  console.log(`[TRACE-8-RESPONSE] Length: ${response.length} chars`);
*/

// ════════════════════════════════════════════════════════════════════════════════
// CONSOLE GREP PATTERN PARA COLETAR LOGS
// ════════════════════════════════════════════════════════════════════════════════
/*
No DevTools do navegador ou terminal, execute:

  // Filtrar todos os traces
  console.log(
    performance.getEntriesByType("measure")
      .filter(e => e.name.includes("TRACE"))
  );
  
OU use este filtro no DevTools:

  "TRACE"
  
Todos os logs que começam com [TRACE-X-...] aparecerão em sequência.
*/

export const INSTRUMENTATION_HOOKS = {
  "1-INTENT": "[TRACE-1-INTENT]",
  "2-ENTITY": "[TRACE-2-ENTITY]",
  "3-QUERY": "[TRACE-3-QUERY]",
  "4-API": "[TRACE-4-API]",
  "5-SELECTION": "[TRACE-5-SELECTION]",
  "6-DOWNLOAD": "[TRACE-6-DOWNLOAD]",
  "7-PROCESSING": "[TRACE-7-PROCESSING]",
  "8-RESPONSE": "[TRACE-8-RESPONSE]",
};
