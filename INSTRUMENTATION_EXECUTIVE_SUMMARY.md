# 📊 INSTRUMENTAÇÃO DO GOOGLE DRIVE FLOW — Guia Executivo

## 🎯 Objetivo

Rastrear a execução completa do pipeline de abertura de arquivos para identificar exatamente **em qual etapa** a busca por vídeos falha.

---

## ⚡ Quick Start

### Fase 1: Preparação (5 minutos)

1. Abra o arquivo de guia:
   - **Arquivo:** `INSTRUMENTATION_QUICK_PATCH.md`
   - Leia as 8 modificações descritas

2. Para cada modificação, você vai:
   - Abrir o arquivo indicado
   - Localizar a função
   - Colar o código `console.log` fornecido

### Fase 2: Adicionar Logs (10 minutos)

Arquivos a modificar (em ordem):

| # | Arquivo | Função | Linhas aprox |
|---|---------|--------|---|
| 1️⃣ | `src/lib/goals/GoalRegistry.ts` | `recognize()` | ? (procure "return goal") |
| 2️⃣ | `src/lib/google-drive/GoogleDriveCapabilityExecutor.ts` | `extractExplicitFileNameHint()` | ~90 (procure "return result") |
| 3️⃣ | `src/lib/google-drive/GoogleDriveCapabilityExecutor.ts` | `inferFileTypeFromExplicitFileName()` | ~125 (procure "switch") |
| 4️⃣ | `src/lib/google-drive/GoogleDriveCapabilityExecutor.ts` | `buildDriveQuery()` | ~180 (procure "return parts") |
| 5️⃣ | `src/lib/google-drive/GoogleDriveConnector.ts` | `searchFiles()` | ? (procure "files.list") |
| 6️⃣ | `src/lib/google-drive/GoogleDriveCapabilityExecutor.ts` | `executeDriveCapability()` | ? (case "drive.openDocument") |
| 7️⃣ | `src/lib/google-drive/GoogleDriveCapabilityExecutor.ts` | `executeDriveCapability()` | ? (antes de "executeDriveDownload") |
| 8️⃣ | `src/lib/google-drive/DriveDownloadExecutor.ts` | `download()` | ? (procure "isBinaryOnly") |
| 9️⃣ | `src/lib/connector-runtime-provider/ConnectorResultSynthesizer.ts` | `synthesize()` | ? (antes do "return") |

### Fase 3: Executar Testes (5 minutos)

1. Abra o navegador com MemoryOS
2. Pressione F12 → Console
3. Execute TESTE 1 e copie os logs
4. Execute TESTE 2 e copie os logs
5. Execute TESTE 3 e copie os logs

---

## 🧪 Os 3 Testes

```bash
TESTE 1 (Baseline - Deve funcionar ✅)
Input:    "abrir anderson.pdf"
Esperado: Arquivo aberto, texto extraído

TESTE 2 (Diagnóstico 1)
Input:    "abrir video fabrica.mp4"
Esperado: Falha (reproduz o bug)

TESTE 3 (Diagnóstico 2)
Input:    "abrir video creatina.mp4"
Esperado: Falha (reproduz o bug)
```

---

## 📋 O que Coletar de Cada Teste

### Para cada teste, copie TODOS os logs que começam com `[N-...]`

**Exemplo de saída completa para PDF:**
```
[1-INTENT] 2026-07-26T... Input: "abrir anderson.pdf" | Goal: "drive.openDocument"
[2-ENTITY-A] Extracted: "anderson.pdf"
[2-ENTITY-B] File: "anderson.pdf" | Ext: "pdf" | Type: "application/pdf"
[3-QUERY] trashed=false and mimeType='application/pdf' and name contains 'anderson.pdf'
[4-API] Count: 1 | Files: anderson.pdf (ID: xxx, MIME: application/pdf)
[5-SELECTION] File: "anderson.pdf" | ID: "xxx" | MIME: "application/pdf"
[6-DOWNLOAD] Calling DriveDownloadExecutor | File: "anderson.pdf"
[7-PROCESSING] Calling DocumentProcessingEngine | MIME: "application/pdf" | Size: 450000 bytes
[8-RESPONSE] Length: 8532 chars
```

---

## 🔍 Como Analisar os Resultados

Após executar os 3 testes, compare as saídas:

### Checklist de Divergência

```
┌─ TESTE 1: PDF funciona
│
├─ [1-INTENT]
│  └─ PDF: ✅ aparece
│     Vídeo: ✅ aparece ou ❌ não aparece?
│
├─ [2-ENTITY-A] + [2-ENTITY-B]
│  └─ PDF: ✅ aparece
│     Vídeo: ✅ aparece ou ❌ não aparece?
│
├─ [3-QUERY]
│  └─ PDF: ✅ aparece
│     Vídeo: ✅ aparece ou ❌ não aparece?
│
├─ [4-API]
│  └─ PDF: ✅ Count: 1
│     Vídeo: ✅ Count: N ou ❌ Count: 0?
│
├─ [5-SELECTION]
│  └─ PDF: ✅ aparece
│     Vídeo: ✅ aparece ou ❌ não aparece?
│
├─ [6-DOWNLOAD]
│  └─ PDF: ✅ aparece
│     Vídeo: ✅ aparece ou ❌ não aparece?
│
├─ [7-PROCESSING]
│  └─ PDF: ✅ Calling DocumentProcessingEngine
│     Vídeo: ✅ SKIPPED ou ❌ não aparece?
│
└─ [8-RESPONSE]
   └─ PDF: ✅ aparece
      Vídeo: ✅ aparece ou ❌ não aparece?
```

---

## 🎯 Hipóteses a Validar

Com base nos logs, você conseguirá confirmar uma das hipóteses:

### Hipótese A: "Arquivo não existe no Drive"
```
[4-API] Count: 0 | Files: (none)
```
✓ Indica que a query foi construída corretamente, mas nenhum arquivo foi encontrado.

### Hipótese B: "Query está construída incorretamente"
```
[3-QUERY] trashed=false and ... ← comparar com [3-QUERY] do PDF
[4-API] Count: 0 | Files: (none)
```
✓ Se query diferente do PDF → problema na construção da query.

### Hipótese C: "Nome do arquivo não foi extraído"
```
❌ [2-ENTITY-A] ou [2-ENTITY-B] não aparecem
```
✓ Indica problema na extração de entidade.

### Hipótese D: "Goal não foi reconhecido"
```
❌ [1-INTENT] não aparece para vídeo
```
✓ Indicates problema no reconhecimento de intent.

### Hipótese E: "Download é chamado mas falha no processamento"
```
[6-DOWNLOAD] aparece
❌ [8-RESPONSE] não aparece ou erro diferente
```
✓ Indica problema no processamento, não na busca.

---

## 📝 Template para Documentar os Resultados

Após coletar os logs, preencha este template:

```markdown
# Resultados da Instrumentação

## TESTE 1: abrir anderson.pdf
- Status: ✅ FUNCIONOU
- [1-INTENT]: ✅ aparece
- [2-ENTITY]: ✅ aparece (PDF)
- [3-QUERY]: ✅ aparece
- [4-API]: ✅ Count: 1
- [5-SELECTION]: ✅ aparece
- [6-DOWNLOAD]: ✅ aparece
- [7-PROCESSING]: ✅ DocumentProcessingEngine chamado
- [8-RESPONSE]: ✅ aparece
- Conclusão: Pipeline completo executado

## TESTE 2: abrir video fabrica.mp4
- Status: ❌ FALHOU
- [1-INTENT]: ✅/❌ aparece?
- [2-ENTITY]: ✅/❌ aparece?
- [3-QUERY]: ✅/❌ aparece? Se sim, qual a query?
- [4-API]: ✅/❌ aparece? Se sim, Count: ?
- [5-SELECTION]: ✅/❌ aparece?
- [6-DOWNLOAD]: ✅/❌ aparece?
- [7-PROCESSING]: ✅/❌ aparece?
- [8-RESPONSE]: ✅/❌ aparece?
- Primeiro log que NÃO aparece: [?-...]
- Conclusão: Falha em [N-...]

## TESTE 3: abrir video creatina.mp4
- Status: ❌ FALHOU
- [Mesmos pontos acima]
- Conclusão: Falha em [N-...]

## Diagnóstico Final
Com base nos 3 testes, o problema está em: [ETAPA]
```

---

## 🛠️ Próximas Etapas (Após Diagnóstico)

Uma vez identificada a etapa exata da falha:

1. **Se [1-INTENT] falha:** Revisar GoalRegistry
2. **Se [2-ENTITY] falha:** Revisar extração de nome/extensão
3. **Se [3-QUERY] falha:** Revisar construção de query
4. **Se [4-API] falha:** Revisar busca no Drive ou arquivo não existe
5. **Se [6-DOWNLOAD] falha:** Revisar roteamento do executor
6. **Se [7-PROCESSING] falha:** Revisar validação de conteúdo binário
7. **Se [8-RESPONSE] falha:** Revisar síntese final

---

## ⚠️  Importante

- ✅ NÃO modifique a lógica, apenas adicione logs
- ✅ Copie TODOS os logs antes de limpar o console
- ✅ Se um teste falhar com erro diferente, anote a mensagem de erro
- ✅ Após diagnosticar, remova TODOS os console.log adicionados

---

## 📞 Suporte

Se precisar de ajuda para localizar as funções:
1. Use Ctrl+Shift+F (Find in Files)
2. Procure pelo nome da função
3. Procure por comentários do tipo "// ──"

---

**Pronto para instrumentar? Comece pelo arquivo:**
👉 `INSTRUMENTATION_QUICK_PATCH.md`
