/**
 * MANUAL DE INSTRUMENTAÇÃO — Google Drive Flow
 * 
 * Este documento mostra EXATAMENTE onde adicionar console.log para rastrear
 * o fluxo completo de abertura de arquivos.
 * 
 * ⚠️  INSTRUÇÕES TEMPORÁRIAS — Remova após diagnóstico
 */

/**
 * PASSO 1: Adicionar logging de INTENT
 * 
 * Arquivo: src/lib/goals/GoalRegistry.ts
 * Local: Função que retorna o goal
 * 
 * Localize:
 *   export function recognize(input: string): Goal {
 * 
 * Adicione ANTES de "return goal":
 */
const PASSO_1_EXAMPLE = `
  const goal = ... // existing logic
  
  // ← ADICIONE AQUI:
  if (input.includes("pdf") || input.includes("video")) {
    console.log(
      "%c[1-INTENT] %cInput: %s | Goal: %s",
      "color: #FF6B6B; font-weight: bold",
      "color: gray",
      input,
      goal
    );
  }
  
  return goal;
`;

/**
 * PASSO 2: Adicionar logging de ENTITY EXTRACTION
 * 
 * Arquivo: src/lib/google-drive/GoogleDriveCapabilityExecutor.ts
 * Local: Função extractExplicitFileNameHint
 */
const PASSO_2A_EXAMPLE = `
export function extractExplicitFileNameHint(rawQuery: string): string | null {
  const trimmed = rawQuery.trim();
  if (!trimmed) return null;

  const explicitFilePattern = /.../;
  const directMatch = trimmed.match(explicitFilePattern);
  const result = directMatch?.[1]?.trim() ?? null;
  
  // ← ADICIONE AQUI:
  if (rawQuery.includes("pdf") || rawQuery.includes("video")) {
    console.log(
      "%c[2-ENTITY] %cExtracted filename: %s",
      "color: #4ECDC4; font-weight: bold",
      "color: gray",
      result || "(null)"
    );
  }
  
  return result;
}
`;

/**
 * PASSO 2B: Adicionar logging de TYPE INFERENCE
 * 
 * Arquivo: src/lib/google-drive/GoogleDriveCapabilityExecutor.ts
 * Local: Função inferFileTypeFromExplicitFileName
 */
const PASSO_2B_EXAMPLE = `
function inferFileTypeFromExplicitFileName(fileName: string): string | null {
  const ext = fileName.match(/\\.([a-z0-9]{1,6})$/i)?.[1]?.toLowerCase();
  
  let result: string | null = null;
  switch (ext) {
    case "pdf": result = DRIVE_MIME.PDF; break;
    // ... outros casos
    case "mp4": result = "video/*"; break;
    // ... etc
  }
  
  // ← ADICIONE AQUI:
  if (fileName.includes("pdf") || fileName.includes("mp4")) {
    console.log(
      "%c[2-ENTITY] %cFile: %s | Ext: %s | Type: %s",
      "color: #4ECDC4; font-weight: bold",
      "color: gray",
      fileName,
      ext || "(null)",
      result || "(null)"
    );
  }
  
  return result;
}
`;

/**
 * PASSO 3: Adicionar logging de QUERY BUILDER
 * 
 * Arquivo: src/lib/google-drive/GoogleDriveCapabilityExecutor.ts
 * Local: Função buildDriveQuery
 */
const PASSO_3_EXAMPLE = `
export function buildDriveQuery(rawQuery: string): string {
  const intent = parseIntent(rawQuery);
  const parts: string[] = ["trashed=false"];
  
  if (intent.fileType) parts.push(intent.fileType);
  if (intent.nameHint) parts.push(...);
  // ... etc
  
  const finalQuery = parts.join(" and ");
  
  // ← ADICIONE AQUI:
  if (rawQuery.includes("pdf") || rawQuery.includes("video")) {
    console.log(
      "%c[3-QUERY] %s",
      "color: #95E1D3; font-weight: bold; font-size: 12px",
      finalQuery
    );
  }
  
  return finalQuery;
}
`;

/**
 * PASSO 4: Adicionar logging de GOOGLE DRIVE API
 * 
 * Arquivo: src/lib/google-drive/GoogleDriveConnector.ts
 * Local: Função searchFiles ou listFiles
 */
const PASSO_4_EXAMPLE = `
async function searchFiles(query: string): Promise<DriveListResult> {
  // ... chamada à API
  const result = await googleDriveAPI.search({ q: query });
  
  // ← ADICIONE AQUI:
  if (query.includes("pdf") || query.includes("video")) {
    console.log(
      "%c[4-API] %cResults: %d | Files: %O",
      "color: #FFE66D; font-weight: bold",
      "color: gray",
      result.files?.length || 0,
      (result.files || []).map(f => ({ name: f.name, id: f.id, mime: f.mimeType }))
    );
  }
  
  return result;
}
`;

/**
 * PASSO 5: Adicionar logging de FILE SELECTION
 * 
 * Arquivo: src/lib/google-drive/GoogleDriveCapabilityExecutor.ts
 * Local: Função executeDriveCapability, case "drive.openDocument"
 */
const PASSO_5_EXAMPLE = `
case "drive.openDocument": {
  // ... lógica de busca e resolução
  const resolvedFile = ... // file selecionado
  
  // ← ADICIONE AQUI:
  console.log(
    "%c[5-SELECTION] %cFile: %s | ID: %s | MIME: %s",
    "color: #A8E6CF; font-weight: bold",
    "color: gray",
    resolvedFile.name,
    resolvedFile.id,
    resolvedFile.mimeType
  );
  
  // continuar...
}
`;

/**
 * PASSO 6: Adicionar logging de DOWNLOAD EXECUTOR
 * 
 * Arquivo: src/lib/google-drive/GoogleDriveCapabilityExecutor.ts
 * Local: Função executeDriveCapability, case "drive.openDocument"
 */
const PASSO_6_EXAMPLE = `
// ← ADICIONE ANTES de chamar DriveDownloadExecutor:
console.log(
  "%c[6-DOWNLOAD] %cCalling DriveDownloadExecutor | File: %s",
  "color: #FF8B94; font-weight: bold",
  "color: gray",
  resolvedFile.name
);

const downloadResult = await executeDriveDownload(fileId, ...);
`;

/**
 * PASSO 7: Adicionar logging de PROCESSING
 * 
 * Arquivo: src/lib/google-drive/DriveDownloadExecutor.ts
 * Local: Função download/execute
 */
const PASSO_7_EXAMPLE = `
// Dentro de DriveDownloadExecutor, ANTES de chamar DocumentProcessingEngine:

if (isBinaryOnly(mimeType)) {
  console.log(
    "%c[7-PROCESSING] %cBinary file detected - SKIPPING DocumentProcessingEngine | MIME: %s",
    "color: #FFB4A2; font-weight: bold",
    "color: gray",
    mimeType
  );
  // return handle
} else {
  console.log(
    "%c[7-PROCESSING] %cCalling DocumentProcessingEngine | MIME: %s | Size: %d bytes",
    "color: #FFB4A2; font-weight: bold",
    "color: gray",
    mimeType,
    content.length
  );
  // call processing
}
`;

/**
 * PASSO 8: Adicionar logging de RESPONSE
 * 
 * Arquivo: src/lib/connector-runtime-provider/ConnectorResultSynthesizer.ts
 * Local: Função final de síntese
 */
const PASSO_8_EXAMPLE = `
// No final da síntese, ANTES de retornar:

console.log(
  "%c[8-RESPONSE] %cResponse length: %d chars",
  "color: #A0C4FF; font-weight: bold",
  "color: gray",
  synthesis.length
);

return synthesis;
`;

/**
 * ════════════════════════════════════════════════════════════════════════════════
 * COMO EXECUTAR O DIAGNÓSTICO
 * ════════════════════════════════════════════════════════════════════════════════
 * 
 * 1. Abra DevTools (F12) → Console
 * 
 * 2. Digite e execute:
 *    filter("TRACE") ou filter("[")
 * 
 * 3. Execute cada comando no MemoryOS:
 * 
 *    TEST 1: abrir anderson.pdf
 *    TEST 2: abrir video fabrica.mp4
 *    TEST 3: abrir video creatina.mp4
 * 
 * 4. Observe a sequência de logs [1-INTENT] → [2-ENTITY] → [3-QUERY] → ...
 * 
 * 5. Identifique o primeiro ponto onde os logs divergem entre PDF e Vídeo
 * 
 * ════════════════════════════════════════════════════════════════════════════════
 */

/**
 * FILTROS PARA DEVTOOLS
 * 
 * Use estes filtros no console para isolar os logs:
 */

const DEVTOOLS_FILTERS = {
  TODOS: "[TRACE]",
  INTENT: "[1-INTENT]",
  ENTITY: "[2-ENTITY]",
  QUERY: "[3-QUERY]",
  API: "[4-API]",
  SELECTION: "[5-SELECTION]",
  DOWNLOAD: "[6-DOWNLOAD]",
  PROCESSING: "[7-PROCESSING]",
  RESPONSE: "[8-RESPONSE]",
};

/**
 * EXPECTED OUTPUT PARA PDF (funciona):
 * 
 * [1-INTENT] Input: "abrir anderson.pdf" | Goal: drive.openDocument
 * [2-ENTITY] Extracted filename: anderson.pdf
 * [2-ENTITY] File: anderson.pdf | Ext: pdf | Type: application/pdf
 * [3-QUERY] trashed=false and mimeType='application/pdf' and name contains 'anderson.pdf'
 * [4-API] Results: 1 | Files: [{name: "anderson.pdf", id: "123", mime: "application/pdf"}]
 * [5-SELECTION] File: anderson.pdf | ID: 123 | MIME: application/pdf
 * [6-DOWNLOAD] Calling DriveDownloadExecutor | File: anderson.pdf
 * [7-PROCESSING] Calling DocumentProcessingEngine | MIME: application/pdf | Size: 450000 bytes
 * [8-RESPONSE] Response length: 8532 chars
 * 
 * ════════════════════════════════════════════════════════════════════════════════
 * 
 * EXPECTED OUTPUT PARA VÍDEO (não funciona):
 * 
 * ← Compare com PDF e identifique em qual [N] os logs param
 * 
 * ════════════════════════════════════════════════════════════════════════════════
 */

export const INSTRUMENTATION_GUIDE = {
  passo1: "Intent Recognition (GoalRegistry.ts)",
  passo2a: "Entity Extraction - Filename (GoogleDriveCapabilityExecutor.ts)",
  passo2b: "Entity Extraction - Type Inference (GoogleDriveCapabilityExecutor.ts)",
  passo3: "Query Builder (GoogleDriveCapabilityExecutor.ts)",
  passo4: "Google Drive API (GoogleDriveConnector.ts)",
  passo5: "File Selection (GoogleDriveCapabilityExecutor.ts)",
  passo6: "Download Executor (GoogleDriveCapabilityExecutor.ts)",
  passo7: "Document Processing (DriveDownloadExecutor.ts)",
  passo8: "Final Response (ConnectorResultSynthesizer.ts)",
};
