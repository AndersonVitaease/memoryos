# Sessao 2026-08-05 — PDF Tools (Stirling-PDF) + OCR Fallback por Visao

**Status:** EXECUTADO e validado em producao.

**Contexto:** O `PdfToolsButton` (componente de acoes PDF integrado ao `FilesTab` e ao `ChatPage`) usa a backend function `stirlingPdfCall` para operacoes em PDFs ingeridos (rotate, addPassword, removePassword, merge, split, repair, pdfToText). O `pdfToText` dependia exclusivamente da extracao de texto do Stirling-PDF self-hosted (VPS). Para PDFs escaneados/imagem (sem camada de texto), a extracao retornava vazio e o fluxo terminava em erro. Adicionalmente, o passo de reparo automatico (`/api/v1/misc/repair`) era lento e instavel no VPS (qpdf retornando "unknown argument", exit code 2 — ver KNOWN-ISSUES).

**Problemas resolvidos:**

1. **PDFs escaneados/imagem sem camada de texto** — extracao do Stirling retornava vazio e o fluxo falhava sem alternativa.
2. **Reparo automatico lento e instavel** — o passo de `/api/v1/misc/repair` adicionava um round-trip inteiro ao Stirling (~5-15s) que quase sempre falhava (bug de qpdf no VPS), atrasando o fallback de OCR.
3. **OCR por visao dependia de conversao PDF->imagem via Stirling** — o endpoint `/api/v1/convert/pdf-to-image` nao existe nessa versao do Stirling-PDF instalada no VPS; o fallback original quebrava na conversao antes de chegar ao LLM de visao.
4. **Latencia do OCR por visao** — a chamada ao Gemini usava `response_json_schema` (structured output) + prompt extenso, adicionando overhead desnecessario.

**Solucao: OCR por visao direto no PDF original (sem conversao Stirling):**

O Gemini (modelo `gemini_3_flash`) suporta PDFs nativamente como `file_urls`. Em vez de converter o PDF em imagens via Stirling (endpoint inexistente), o fallback envia o `file_url` original do PDF direto ao `InvokeLLM` com `model: "gemini_3_flash"`. O LLM de visao faz OCR das paginas e retorna o texto.

**Mudancas (3 arquivos):**

1. **`base44/functions/stirlingPdfCall/entry.ts`** (backend):
   - `pdfToText`: removido o reparo automatico como passo obrigatorio (era lento + instavel). Agora retorna `needOcr: true` imediatamente quando a extracao de texto retorna vazio.
   - Adicionado parametro `forceOcr` — quando `true`, pula o Stirling inteiramente e sinaliza `needOcr` direto (mais rapido para PDFs escaneados conhecidos).
   - Adicionado parametro `skipRepair` — quando `true` ou quando a extracao retorna erro tratavel (400), pula o reparo.
   - Removidas operacoes diagnosticas temporarias (`probeImage`, `swagger`, `pdfToImage`) que nao funcionavam nessa versao do Stirling.

2. **`src/components/projects/PdfToolsButton.jsx`** (frontend):
   - `runOcrFallback()`: simplificado — envia o `doc.file_url` original direto ao `InvokeLLM` com `model: "gemini_3_flash"`, sem `response_json_schema` (texto puro, mais rapido). Aceita retorno como string ou objeto.
   - `runExtractText(forceOcr)`: quando `forceOcr=true`, pula o Stirling inteiramente e vai direto ao Gemini (caminho mais rapido para PDFs escaneados).
   - Adicionada opcao "Extrair por OCR (visao)" no menu (icone `ScanLine`) — chama `runExtractText(true)`.
   - Extraido helper `downloadText(content, suffix)` para evitar duplicacao entre os caminhos de texto extraido e OCR.

**Fluxo final do `pdfToText`:**

```
Usuario clica "Extrair texto"
  -> stirlingPdfCall pdfToText (extracao de texto)
    -> texto extraido com sucesso? -> download .txt
    -> texto vazio (PDF escaneado)? -> needOcr: true
      -> frontend: "Aplicando OCR por visao..."
      -> InvokeLLM (gemini_3_flash, file_urls=[doc.file_url], sem schema)
      -> texto OCR retornado -> download _ocr.txt

Usuario clica "Extrair por OCR (visao)"
  -> runExtractText(true) -> forceOcr -> pula Stirling
  -> InvokeLLM direto -> download _ocr.txt
```

**Otimizacoes de latencia aplicadas:**
1. Reparo automatico removido do caminho padrao (~5-15s economizados por chamada).
2. `forceOcr` permite pular o Stirling inteiramente para PDFs escaneados conhecidos.
3. `response_json_schema` removido do OCR — texto puro e mais rapido que structured output.
4. Prompt do OCR encurtado (de ~400 chars para ~120 chars).

**Dead ends registrados (nao repetir):**
- Endpoint `/api/v1/convert/pdf-to-image` do Stirling-PDF nao existe na versao instalada no VPS — converter PDF em imagem antes de OCR e um caminho morto.
- Reparo via `/api/v1/misc/repair` (qpdf) falha consistentemente no VPS com "unknown argument" — nao confiar no reparo automatico.
- `response_json_schema` em chamadas de OCR adiciona latencia sem beneficio (o texto ja e o retorno natural).

**Nao-quebra verificada:**
- As operacoes `merge`, `split`, `rotate`, `addPassword`, `removePassword`, `repair` continuam 100% intocadas.
- O menu "Extrair texto" mantem comportamento anterior (Stirling primeiro, fallback OCR automatico).
- A nova opcao "Extrair por OCR (visao)" e aditiva.
- `health` e `repair` do backend function continuam disponiveis.

**Validado pelo usuario (2026-08-05 20:11 BRT):** OCR por visao funcionou em PDF escaneado. Otimizacoes de latencia confirmadas apos iteracao.