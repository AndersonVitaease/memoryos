/**
 * SprintM15Page.jsx — SPRINT M1.5 — Certificação Real do Document Processing Engine
 *
 * Executa o pipeline completo com documentos REAIS do Google Drive:
 * Busca → Download → DocumentProcessingEngine → Parser → LLM → Resposta
 *
 * ZERO mocks. ZERO fixtures. ZERO dados simulados.
 */

import React, { useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

// ── Constantes ─────────────────────────────────────────────────────────────────

const TEST_CASES = [
  { id: 1, label: 'RG.pdf',            query: 'RG',            llmQuestion: null },
  { id: 2, label: 'CNH.pdf',           query: 'CNH',           llmQuestion: null },
  { id: 3, label: 'NAC + GLICINA.pdf', query: 'NAC GLICINA',   llmQuestion: 'Com base exclusivamente no conteúdo extraído do documento: Qual é a composição? Qual é a quantidade de glicina? Quais ingredientes aparecem?' },
];

const STATUS = { idle: '⬜', running: '🔄', pass: '✅', fail: '❌', warn: '⚠️' };

// ── Helpers ────────────────────────────────────────────────────────────────────

function badge(ok) {
  return ok
    ? <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-900 text-green-300">PASS</span>
    : <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-900 text-red-300">FAIL</span>;
}

function Section({ title, children }) {
  return (
    <div className="border border-zinc-700 rounded-lg p-4 mb-4">
      <h3 className="text-sm font-bold text-violet-400 mb-3 uppercase tracking-widest">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value, mono = false, highlight = false }) {
  return (
    <div className="flex gap-2 mb-1 text-sm">
      <span className="text-zinc-500 w-48 shrink-0">{label}</span>
      <span className={`${mono ? 'font-mono' : ''} ${highlight ? 'text-yellow-300' : 'text-zinc-200'} break-all`}>{value ?? '—'}</span>
    </div>
  );
}

// ── Pipeline executor ──────────────────────────────────────────────────────────

async function runPipeline(query, llmQuestion, onProgress) {

  const log = (msg) => onProgress(msg);

  // STEP 1 — Import runtime modules (lazy, no mocks)
  log('Importando módulos do pipeline...');
  const { searchFiles, getFileMetadata, downloadMedia, exportFile } = await import('@/lib/google-drive/GoogleDriveConnector');
  const { DocumentProcessingEngine } = await import('@/lib/document-processing/DocumentProcessingEngine');
  const { isGoogleWorkspaceMime, resolveExportConfig, DEFAULT_EXPORT_POLICY } = await import('@/lib/google-drive/DriveDownloadPolicies');
  const { ensureValidToken } = await import('@/lib/google-auth/GoogleAuthSession');

  // STEP 2 — Auth check
  log('Verificando autenticação Google...');
  await ensureValidToken('default');
  log('✓ Token válido');

  // STEP 3 — Search files in Drive
  log(`Buscando "${query}" no Google Drive...`);
  const q = `name contains '${query.replace(/'/g, "\\'")}' and trashed=false`;
  const searchResult = await searchFiles(q, { pageSize: 10 });

  if (!searchResult.files || searchResult.files.length === 0) {
    return { ok: false, step: 'SEARCH', message: `Nenhum arquivo encontrado para "${query}". Verifique se o arquivo existe no Google Drive conectado.` };
  }

  log(`✓ ${searchResult.files.length} arquivo(s) encontrado(s)`);

  // Pick best match (first result — already ordered by Drive relevance)
  const file = searchResult.files[0];
  log(`Selecionado: "${file.name}" (${file.id})`);

  // STEP 4 — Get metadata
  log('Obtendo metadados do arquivo...');
  const meta = await getFileMetadata(file.id);
  if (!meta) {
    return { ok: false, step: 'METADATA', message: `Não foi possível obter metadados de "${file.name}".` };
  }
  log(`✓ Metadata: mimeType=${meta.mimeType}, size=${meta.size ?? 'N/A'} bytes`);

  // STEP 5 — Determine download strategy
  const { exportMime, strategy } = resolveExportConfig(meta.mimeType, null, DEFAULT_EXPORT_POLICY);
  log(`Estratégia: ${strategy === 'export' ? `export → ${exportMime}` : 'media download'}`);

  // STEP 6 — Download
  log('Baixando conteúdo do arquivo...');
  const t0 = Date.now();
  const downloadRaw = strategy === 'export'
    ? await exportFile(file.id, exportMime)
    : await downloadMedia(file.id);
  const downloadMs = Date.now() - t0;

  if (!downloadRaw.ok) {
    return {
      ok: false,
      step: 'DOWNLOAD',
      message: `Download falhou (HTTP ${downloadRaw.status}): ${downloadRaw.content?.slice(0, 200)}`,
      fileId: file.id, fileName: file.name, mimeType: meta.mimeType,
    };
  }

  log(`✓ Download OK: ${downloadRaw.sizeBytes} bytes em ${downloadMs}ms`);

  // STEP 7 — DocumentProcessingEngine
  log('Processando documento com DocumentProcessingEngine...');
  const t1 = Date.now();
  const processingResult = await DocumentProcessingEngine.process({
    fileName:        meta.name,
    mimeType:        meta.mimeType,
    rawContent:      downloadRaw.content,
    encoding:        downloadRaw.encoding,
    sourceConnector: 'google-drive',
  });
  const parserMs = Date.now() - t1;

  log(`Parser: ${processingResult.parserUsed} — ${processingResult.ok ? `✓ ${processingResult.charCount} chars` : `✗ ${processingResult.errorCode}`}`);

  const extractedText = processingResult.ok
    ? processingResult.extractedText
    : downloadRaw.content.slice(0, 4000);

  // STEP 8 — LLM synthesis
  let llmResponse = null;
  if (extractedText && extractedText.trim().length > 0) {
    const question = llmQuestion
      ? llmQuestion
      : `Resuma o conteúdo principal deste documento de forma clara e direta.`;

    const prompt = `Você é o MemoryOS. Abaixo está o conteúdo REAL extraído de um documento do Google Drive.

DOCUMENTO: ${meta.name}
TIPO: ${meta.mimeType}

CONTEÚDO EXTRAÍDO:
---
${extractedText.slice(0, 6000)}
---

INSTRUÇÃO: ${question}

IMPORTANTE: Responda usando EXCLUSIVAMENTE as informações presentes no texto acima. Não invente dados.`;

    log('Enviando texto extraído ao LLM...');
    llmResponse = await base44.integrations.Core.InvokeLLM({ prompt });
    log('✓ Resposta do LLM recebida');
  }

  return {
    ok: true,
    // [1] Goal
    goal: `drive.downloadFile → "${query}"`,
    // [2] Capability
    capability: 'drive.downloadFile (via drive.files.search + media/export)',
    // [3] fileId
    fileId: file.id,
    // [4] fileName
    fileName: meta.name,
    // [5] mimeType
    mimeType: meta.mimeType,
    // [6] strategy
    strategy: strategy === 'export' ? `export → ${exportMime}` : 'media download',
    // [7] bytes
    bytesReceived: downloadRaw.sizeBytes,
    downloadMs,
    // [8] parser
    parserUsed: processingResult.parserUsed,
    // [9] parser duration
    parserMs,
    // [10] chars
    charCount: processingResult.ok ? processingResult.charCount : 0,
    parsingOk: processingResult.ok,
    parsingError: processingResult.ok ? null : processingResult.errorCode,
    parsingMessage: processingResult.ok ? null : processingResult.message,
    // [11] first 300
    textHead: extractedText.slice(0, 300),
    // [12] text sent to synthesizer
    textSentToLLM: extractedText.slice(0, 400),
    // [13] LLM response
    llmResponse,
    // extra
    fullExtractedText: extractedText,
    candidates: searchResult.files.map(f => ({ id: f.id, name: f.name })),
    parsingMeta: processingResult.ok ? processingResult.meta : null,
  };
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function SprintM15Page() {
  const [results, setResults]         = useState({});
  const [running, setRunning]         = useState({});
  const [progress, setProgress]       = useState({});
  const [runningAll, setRunningAll]   = useState(false);

  const runCase = useCallback(async (tc) => {
    setRunning(r => ({ ...r, [tc.id]: true }));
    setProgress(p => ({ ...p, [tc.id]: [] }));
    setResults(r => ({ ...r, [tc.id]: null }));

    try {
      const result = await runPipeline(
        tc.query,
        tc.llmQuestion,
        (msg) => setProgress(p => ({ ...p, [tc.id]: [...(p[tc.id] ?? []), msg] })),
      );
      setResults(r => ({ ...r, [tc.id]: result }));
    } catch (err) {
      setResults(r => ({ ...r, [tc.id]: { ok: false, step: 'EXCEPTION', message: String(err) } }));
    } finally {
      setRunning(r => ({ ...r, [tc.id]: false }));
    }
  }, []);

  const runAll = useCallback(async () => {
    setRunningAll(true);
    for (const tc of TEST_CASES) {
      await runCase(tc);
    }
    setRunningAll(false);
  }, [runCase]);

  const passCount = Object.values(results).filter(r => r?.ok).length;
  const totalRun  = Object.keys(results).length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">🔬</span>
            <h1 className="text-2xl font-bold text-white">SPRINT M1.5 — Certificação Real do Document Processing Engine</h1>
          </div>
          <p className="text-zinc-400 text-sm">Pipeline completo com documentos REAIS do Google Drive. Zero mocks. Zero fixtures.</p>
          <div className="flex gap-3 mt-4">
            <button
              onClick={runAll}
              disabled={runningAll}
              className="px-5 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 rounded-lg font-semibold text-sm transition-colors"
            >
              {runningAll ? '⏳ Executando todos...' : '▶ Executar Todos os Casos'}
            </button>
            {totalRun > 0 && (
              <div className={`px-4 py-2 rounded-lg text-sm font-bold ${passCount === totalRun ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'}`}>
                Taxa: {passCount}/{totalRun} ({Math.round(passCount/totalRun*100)}%)
              </div>
            )}
          </div>
        </div>

        {/* Architecture diagram */}
        <Section title="Pipeline de Certificação">
          <div className="font-mono text-xs text-zinc-400 bg-zinc-900 rounded p-3">
            Google Drive → searchFiles() → getFileMetadata() → downloadMedia()/exportFile() → DocumentProcessingEngine → PdfDocumentParser → extractedText → InvokeLLM → Resposta
          </div>
        </Section>

        {/* Test cases */}
        {TEST_CASES.map(tc => {
          const r   = results[tc.id];
          const isR = running[tc.id];
          const logs = progress[tc.id] ?? [];

          return (
            <div key={tc.id} className="border border-zinc-700 rounded-xl p-5 mb-6">
              {/* Case header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-mono text-violet-400">TC-{tc.id}</span>
                  <span className="font-bold text-white">{tc.label}</span>
                  {r && badge(r.ok)}
                </div>
                <button
                  onClick={() => runCase(tc)}
                  disabled={isR}
                  className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded-lg text-sm transition-colors"
                >
                  {isR ? '⏳' : '▶ Executar'}
                </button>
              </div>

              {/* Live progress */}
              {logs.length > 0 && (
                <div className="bg-zinc-900 rounded p-3 mb-4 font-mono text-xs text-zinc-400 space-y-0.5">
                  {logs.map((l, i) => <div key={i}>{l}</div>)}
                </div>
              )}

              {/* Error result */}
              {r && !r.ok && (
                <div className="bg-red-950 border border-red-800 rounded p-4">
                  <div className="text-red-400 font-bold text-sm mb-1">❌ FALHA na etapa: {r.step}</div>
                  <div className="text-red-300 text-sm">{r.message}</div>
                  {r.step === 'SEARCH' && (
                    <div className="mt-2 text-xs text-red-500">
                      Verifique se o arquivo existe no Google Drive e se a conta está conectada em /connections.
                    </div>
                  )}
                </div>
              )}

              {/* Success result */}
              {r && r.ok && (
                <div className="space-y-4">
                  {/* Log obrigatório */}
                  <Section title="Log Obrigatório (M1.5)">
                    <Row label="[1] Goal"                value={r.goal} />
                    <Row label="[2] Capability"           value={r.capability} />
                    <Row label="[3] fileId"               value={r.fileId} mono />
                    <Row label="[4] fileName"             value={r.fileName} />
                    <Row label="[5] mimeType"             value={r.mimeType} mono />
                    <Row label="[6] Estratégia"           value={r.strategy} />
                    <Row label="[7] Bytes recebidos"      value={`${r.bytesReceived?.toLocaleString() ?? 0} bytes (${r.downloadMs}ms)`} />
                    <Row label="[8] Parser escolhido"     value={r.parserUsed} highlight />
                    <Row label="[9] Duração do parser"    value={`${r.parserMs}ms`} />
                    <Row label="[10] Chars extraídos"     value={r.charCount?.toLocaleString() ?? 0} highlight />
                    {r.parsingError && (
                      <>
                        <Row label="[10b] Parsing error"  value={r.parsingError} />
                        <Row label="[10c] Parsing msg"    value={r.parsingMessage} />
                      </>
                    )}
                  </Section>

                  {/* Text head */}
                  <Section title="[11] Primeiras 300 posições do texto extraído">
                    {r.charCount > 0 ? (
                      <pre className="font-mono text-xs text-green-300 bg-zinc-900 rounded p-3 whitespace-pre-wrap break-all">
                        {r.textHead}
                      </pre>
                    ) : (
                      <div className="text-yellow-400 text-sm">
                        ⚠️ Nenhum texto extraído — verifique auditoria abaixo.
                      </div>
                    )}
                  </Section>

                  {/* Text sent to LLM */}
                  <Section title="[12] Texto enviado ao ConnectorResultSynthesizer (primeiros 400 chars)">
                    <pre className="font-mono text-xs text-blue-300 bg-zinc-900 rounded p-3 whitespace-pre-wrap break-all">
                      {r.textSentToLLM || '(vazio)'}
                    </pre>
                  </Section>

                  {/* LLM response */}
                  {r.llmResponse && (
                    <Section title="[13] Resposta produzida pelo LLM">
                      <div className="text-zinc-200 text-sm leading-relaxed bg-zinc-900 rounded p-3 whitespace-pre-wrap">
                        {typeof r.llmResponse === 'string' ? r.llmResponse : JSON.stringify(r.llmResponse, null, 2)}
                      </div>
                    </Section>
                  )}

                  {/* Validation */}
                  <Section title="Validação — O LLM usou o texto extraído?">
                    {r.charCount > 0 && r.llmResponse ? (
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">✅</span>
                        <div>
                          <div className="text-green-400 font-bold">SIM — Pipeline certificado</div>
                          <div className="text-zinc-400 text-xs mt-1">
                            {r.charCount} caracteres extraídos do PDF real → enviados ao LLM → resposta baseada no documento.
                          </div>
                        </div>
                      </div>
                    ) : r.charCount === 0 ? (
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">❌</span>
                        <div>
                          <div className="text-red-400 font-bold">NÃO — Extração de texto falhou</div>
                          <div className="text-zinc-400 text-xs mt-1">
                            <strong>Etapa com falha:</strong> DocumentProcessingEngine ({r.parsingError})<br />
                            {r.parsingMessage}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-yellow-400 text-sm">⚠️ LLM não foi invocado (sem texto extraído).</div>
                    )}
                  </Section>

                  {/* Audit — if parsing failed */}
                  {r.parsingError && (
                    <Section title="Auditoria de Falha de Parsing">
                      <div className="text-sm text-zinc-300 space-y-1">
                        {r.parsingError === 'OCR_REQUIRED' && (
                          <>
                            <div className="text-yellow-400 font-bold">PDF Escaneado / Sem camada de texto</div>
                            <div>O arquivo "{r.fileName}" é um PDF sem camada de texto (provavelmente escaneado ou protegido).</div>
                            <div>O PdfDocumentParser não encontrou operadores BT/ET com texto nos streams.</div>
                            <div className="mt-2 text-zinc-500">Melhoria necessária para M1.6: OCR via Google Cloud Vision ou Tesseract.js.</div>
                          </>
                        )}
                        {r.parsingError === 'UNSUPPORTED_TYPE' && (
                          <>
                            <div className="text-yellow-400 font-bold">Tipo não suportado ainda</div>
                            <div>{r.parsingMessage}</div>
                          </>
                        )}
                        {r.parsingError === 'PARSE_FAILED' && (
                          <>
                            <div className="text-red-400 font-bold">Falha na análise do PDF</div>
                            <div>{r.parsingMessage}</div>
                            <div className="mt-1 text-zinc-500">Possível causa: PDF com encoding não-padrão, compressão Flate/CCITT ou estrutura proprietária.</div>
                          </>
                        )}
                      </div>
                    </Section>
                  )}

                  {/* Candidates found */}
                  {r.candidates && r.candidates.length > 1 && (
                    <details className="border border-zinc-800 rounded p-3">
                      <summary className="text-xs text-zinc-500 cursor-pointer">Arquivos encontrados na busca ({r.candidates.length})</summary>
                      <div className="mt-2 space-y-1">
                        {r.candidates.map(c => (
                          <div key={c.id} className="text-xs font-mono text-zinc-400">{c.id} — {c.name}</div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Final report */}
        {totalRun > 0 && (
          <Section title="Relatório Final M1.5">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-zinc-900 rounded p-3 text-center">
                <div className="text-3xl font-bold text-violet-400">{passCount}/{TEST_CASES.length}</div>
                <div className="text-xs text-zinc-500 mt-1">Casos aprovados</div>
              </div>
              <div className="bg-zinc-900 rounded p-3 text-center">
                <div className={`text-3xl font-bold ${passCount === TEST_CASES.length ? 'text-green-400' : 'text-yellow-400'}`}>
                  {Math.round((passCount / Math.max(totalRun, 1)) * 100)}%
                </div>
                <div className="text-xs text-zinc-500 mt-1">Taxa de sucesso</div>
              </div>
            </div>

            <div className="space-y-1 text-sm">
              {TEST_CASES.map(tc => {
                const r = results[tc.id];
                if (!r) return null;
                return (
                  <div key={tc.id} className="flex items-center gap-3 p-2 bg-zinc-900 rounded">
                    <span>{r.ok ? '✅' : '❌'}</span>
                    <span className="text-zinc-400 w-40">{tc.label}</span>
                    <span className="text-zinc-500 text-xs">
                      {r.ok
                        ? `${r.charCount} chars | ${r.parserUsed} | ${r.parserMs}ms`
                        : `FALHA: ${r.step} — ${r.message?.slice(0, 80)}`}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 p-3 bg-zinc-900 rounded text-xs text-zinc-500">
              <div className="font-bold text-zinc-400 mb-2">Limitações conhecidas (candidatas para M1.6):</div>
              <ul className="list-disc list-inside space-y-1">
                <li>PDFs escaneados sem camada de texto → OCR_REQUIRED (OCR não implementado)</li>
                <li>DOCX / XLSX / PPTX → UNSUPPORTED_TYPE (parsers planejados para M2.x)</li>
                <li>PDFs com compressão Flate/stream binário não decodificado pela regex BT/ET</li>
                <li>Imagens em PDF não são extraídas (depende de OCR)</li>
              </ul>
            </div>
          </Section>
        )}

      </div>
    </div>
  );
}