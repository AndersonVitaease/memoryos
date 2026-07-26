# 🚦 VISUAL TRACE CHECKLIST

## Instrumentation Flow Map

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ USER INPUT: "abrir anderson.pdf" (PDF) vs "abrir video X.mp4" (VIDEO)
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
                            ↓
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ [1-INTENT] GoalRegistry.ts → recognize()
┃ Output: goal = "drive.openDocument"
┃ PDF: ✅ aparece   |   VIDEO: ✅/❌ ?
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
                            ↓
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ [2-ENTITY-A] GoogleDriveCapabilityExecutor.ts → extractExplicitFileNameHint()
┃ Output: extracted filename = "anderson.pdf" ou "fabrica.mp4"
┃ PDF: ✅ "anderson.pdf"   |   VIDEO: ✅/❌ "fabrica.mp4"?
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
                            ↓
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ [2-ENTITY-B] GoogleDriveCapabilityExecutor.ts → inferFileTypeFromExplicitFileName()
┃ Output: type = "application/pdf" ou "video/*"
┃ PDF: ✅ "application/pdf"   |   VIDEO: ✅/❌ "video/*"?
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
                            ↓
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ [3-QUERY] GoogleDriveCapabilityExecutor.ts → buildDriveQuery()
┃ Output: "trashed=false and mimeType='...' and name contains '...'"
┃ PDF: ✅ "... mimeType='application/pdf' and name contains 'anderson.pdf'"
┃ VIDEO: ✅/❌ "... mimeType contains 'video/' and name contains 'fabrica.mp4'"?
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
                            ↓
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ [4-API] GoogleDriveConnector.ts → searchFiles()
┃ Output: Array of files from Google Drive API
┃ PDF: ✅ Count: 1, [{name: "anderson.pdf", id: "...", mime: "..."}]
┃ VIDEO: ✅/❌ Count: 1, [{name: "fabrica.mp4", ...}] OR Count: 0, []?
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
                            ↓
                     ┌──────┴──────┐
                     ↓             ↓
            Files found ✅    Files NOT found ❌
                     │             │
                     ↓             ↓
┌────────────────────────────────────────────────────┐
┃ [5-SELECTION] File selection → file chosen        ┃
┃ PDF: ✅ Selected   |   VIDEO: ✅/❌ (depends on [4])┃
└────────────────────────────────────────────────────┘
                     ↓
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ [6-DOWNLOAD] GoogleDriveCapabilityExecutor.ts → executeDriveDownload()
┃ Output: "Calling DriveDownloadExecutor"
┃ PDF: ✅ Called   |   VIDEO: ✅/❌ Called?
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
                            ↓
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ [7-PROCESSING] DriveDownloadExecutor.ts → download()
┃ Output: "Calling DocumentProcessingEngine" OR "SKIPPED (binary)"
┃ PDF: ✅ "Calling DocumentProcessingEngine"
┃ VIDEO: ✅/❌ "SKIPPED (binary)" OR "Calling DocumentProcessingEngine"?
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
                            ↓
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ [8-RESPONSE] ConnectorResultSynthesizer.ts → synthesize()
┃ Output: Final response to user
┃ PDF: ✅ "O arquivo PDF foi aberto. Dados extraídos..."
┃ VIDEO: ✅/❌ Response OR Error message?
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

---

## 📍 Checkpoints de Divergência

| Checkpoint | PDF Expected | VIDEO Expected | Your Result |
|---|---|---|---|
| **[1-INTENT]** | ✅ Appears | ✅ Appears | 👈 Check |
| **[2-ENTITY-A]** | ✅ "anderson.pdf" | ✅ "fabrica.mp4" | 👈 Check |
| **[2-ENTITY-B]** | ✅ "pdf" ext | ✅ "mp4" ext | 👈 Check |
| **[3-QUERY]** | ✅ Appears | ✅ Appears | 👈 Check |
| **[4-API]** | ✅ Count: 1 | ✅ Count: 1 OR ❌ Count: 0? | 👈 **KEY** |
| **[5-SELECTION]** | ✅ File selected | ✅ File selected | 👈 Check |
| **[6-DOWNLOAD]** | ✅ Called | ✅ Called | 👈 Check |
| **[7-PROCESSING]** | ✅ Processing | ✅ Skipped (binary) | 👈 Check |
| **[8-RESPONSE]** | ✅ Full response | ✅ Full response | 👈 Check |

---

## 🔴 Critical Decision Points

```
AT [4-API]:
├─ IF Count: 0
│  └─ File doesn't exist in Drive
│     OR Query was wrong
│
└─ IF Count: 1+
   └─ File was found
      Problem is in [5], [6], [7], or [8]
```

---

## 🧩 Copy-Paste Template for Each Test

### Test Result Template

```markdown
## TEST: abrir [FILE]

### Logs Collected:
```
[PASTE ALL LOGS HERE]
```

### Analysis:
- [1-INTENT]: ✅/❌
- [2-ENTITY-A]: ✅/❌
- [2-ENTITY-B]: ✅/❌
- [3-QUERY]: ✅/❌
- [4-API]: ✅/❌ Count: ___ 
- [5-SELECTION]: ✅/❌
- [6-DOWNLOAD]: ✅/❌
- [7-PROCESSING]: ✅/❌
- [8-RESPONSE]: ✅/❌

### First missing checkpoint: [_-_]

### Conclusion:
Failure occurs at stage [N], likely because:
[YOUR ANALYSIS]
```

---

## 🎯 Key Observations to Note

When collecting logs, pay special attention to:

1. **Query differences**
   ```
   PDF Query:    trashed=false and mimeType='application/pdf' and name contains 'anderson.pdf'
   VIDEO Query:  trashed=false and mimeType contains 'video/' and name contains 'fabrica.mp4'
   → Are both queries well-formed?
   ```

2. **API response count**
   ```
   PDF: Count: 1     ✅ Expected
   VIDEO: Count: 0   ❌ File not found
   VIDEO: Count: 1   ✅ File found, but something else fails
   ```

3. **Processing decision**
   ```
   PDF: Calling DocumentProcessingEngine  ✅
   VIDEO: SKIPPED (binary)                ✅ Correct behavior
   VIDEO: Calling DocumentProcessingEngine ❌ Should not process video as document
   ```

---

## 📊 Expected Outcome Scenarios

### Scenario A: API returns 0 results
```
[4-API] Count: 0 | Files: (none)
→ Diagnosis: File not in Drive OR Query construction wrong
→ Check: Query syntax, file name spelling, file sharing settings
```

### Scenario B: File found but selection fails
```
[4-API] Count: 1
[5-SELECTION] ❌ does not appear
→ Diagnosis: File was found but selection logic failed
→ Check: resolveSingleSearchResult() function
```

### Scenario C: Download called but processing fails
```
[6-DOWNLOAD] ✅ appears
[7-PROCESSING] ❌ does not appear
→ Diagnosis: DriveDownloadExecutor executed but failed
→ Check: Download function, binary detection, error handling
```

### Scenario D: Everything runs but response fails
```
[7-PROCESSING] ✅ appears
[8-RESPONSE] ❌ does not appear
→ Diagnosis: Error in synthesis or result formatting
→ Check: ConnectorResultSynthesizer, final response building
```

---

## 🏁 When You're Ready

1. ✅ Follow `INSTRUMENTATION_QUICK_PATCH.md` to add logs
2. ✅ Run the 3 tests and collect all `[N-...]` logs
3. ✅ Fill in this checklist with your findings
4. ✅ Compare PDF vs VIDEO flows
5. ✅ Identify first divergence point
6. ✅ Report the diagnosis

**Example diagnosis:**
```
"The flow diverges at [4-API]. 
For PDF, Count: 1 (file found).
For VIDEO, Count: 0 (file not found).
The query for video might be: trashed=false and mimeType contains 'video/' and name contains 'fabrica.mp4'
This suggests either:
A) The file doesn't exist in Google Drive
B) The query syntax is incorrect
C) The MIME type filter is too restrictive"
```

---
