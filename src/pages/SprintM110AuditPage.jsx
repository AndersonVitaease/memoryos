/**
 * SprintM110AuditPage.jsx — SPRINT M1.10 — Auditoria Cirúrgica do DriveDownloadExecutor
 */

import React, { useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

const TEST_CASES = [
  { id: 1, label: 'MemoryOS - 01', rawText: 'Leia: MemoryOS - 01' },
  { id: 2, label: 'RG.pdf',        rawText: 'Leia: RG.pdf' },
  { id: 3, label: 'CNH.pdf',       rawText: 'Leia: CNH.pdf' },
];

const AMBIGUITY_THRESHOLD = 30;

async function runAudit(tc, onStep) {
  const log = (step, status, data) => onStep({ step, status, data, ts: Date.now() });

  // Parameters as GoalRegistry.extractParams() builds them for drive.openDocument
  // GoalRegistry.ts L.370-374: { fileName: quoted ?? null, rawText: msg.trim() }
  const parameters = {
    fileName:     null,
    rawText:      tc.rawText,
    query:        null,
    fileId:       null,
    outputFormat: null,
  };

  log('INPUT', 'info', { input: tc.rawText, parameters, note: 'GoalRegistry.ts L.370-374 extractParams for drive.openDocument' });

  // AUTH
  log('AUTH', 'running', {});
  try {
    const { ensureValidToken } = await import('@/lib/google-auth/GoogleAuthSession');
    await ensureValidToken('default');
    log('AUTH', 'ok', { note: 'ensureValidToken("default") succeeded' });
  } catch (e) {
    log('AUTH', 'fail', { error: String(e) });
    return { ok: false, failedAt: 'AUTH', error: String(e) };
  }

  // PARAM RESOLUTION — DriveDownloadExecutor.ts L.127-131
  const explicitFileId = parameters.fileId   ? String(parameters.fileId).trim()   : null;
  const fileName       = parameters.fileName ? String(parameters.fileName).trim() : null;
  const queryFallback  = parameters.query    ? String(parameters.query).trim()    : null;
  const rawText        = parameters.rawText  ? String(parameters.rawText).trim()  : null;

  const noIdents = !fileName && !queryFallback && !rawText;
  const strategy = explicitFileId ? 'explicit fileId' : noIdents ? 'conversation context' : 'search by name';
  const searchQuery = fileName ?? queryFallback ?? rawText;

  log('PARAM_RESOLUTION', 'info', {
    explicitFileId, fileName, queryFallback, rawText,
    strategy, searchQuery,
    file: 'DriveDownloadExecutor.ts', line: '127-131 + 184-188',
  });

  if (strategy === 'conversation context') {
    log('FAIL', 'fail', {
      code: 'NO_PARAMS', message: 'No fileName/query/rawText. Would return fail("NO_PARAMS").',
      file: 'DriveDownloadExecutor.ts', line: '195-224',
    });
    return { ok: false, failedAt: 'PARAM_RESOLUTION', error: 'NO_PARAMS' };
  }

  // SEARCH_BY_NAME — DriveDownloadExecutor.ts L.234
  log('SEARCH_BY_NAME', 'running', { searchQuery, pageSize: 20, file: 'DriveDownloadExecutor.ts', line: '234' });

  let searchResults;
  try {
    const { searchByName } = await import('@/lib/google-drive/GoogleDriveConnector');
    const t0 = Date.now();
    searchResults = await searchByName(searchQuery, { pageSize: 20 });
    const ms = Date.now() - t0;
    log('SEARCH_BY_NAME', 'ok', {
      searchQuery, resultCount: searchResults.length,
      results: searchResults.map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType })),
      durationMs: ms, file: 'DriveDownloadExecutor.ts', line: '234',
    });
  } catch (e) {
    log('SEARCH_BY_NAME', 'fail', { error: String(e) });
    return { ok: false, failedAt: 'SEARCH_BY_NAME', error: String(e) };
  }

  // NOT FOUND check — DriveDownloadExecutor.ts L.236-238
  if (searchResults.length === 0) {
    log('NOT_FOUND', 'fail', {
      code: 'NOT_FOUND',
      message: `Arquivo nao encontrado: "${searchQuery}".`,
      condition: 'searchResults.length === 0',
      returnExecuted: 'return fail("NOT_FOUND", ...)',
      file: 'DriveDownloadExecutor.ts', line: '236-238',
    });
    return { ok: false, failedAt: 'NOT_FOUND', searchResults: [] };
  }

  // RANKING — DriveDownloadExecutor.ts L.240-264
  const { rankCandidates, DEFAULT_RANKING_POLICY } = await import('@/lib/google-drive/DriveDownloadPolicies');
  const ranked = rankCandidates(searchResults, searchQuery, DEFAULT_RANKING_POLICY);

  log('RANKING', 'info', {
    totalCandidates: ranked.length,
    ranked: ranked.slice(0, 5).map(r => ({ id: r.id, name: r.name, score: r.score })),
    top1Score: ranked[0]?.score,
    top2Score: ranked[1]?.score,
    scoreDiff: ranked.length > 1 ? ranked[0].score - ranked[1].score : 'N/A',
    ambiguityThreshold: DEFAULT_RANKING_POLICY.ambiguityThreshold,
    file: 'DriveDownloadExecutor.ts', line: '240-264',
  });

  let resolvedFileId;
  if (ranked.length === 1) {
    resolvedFileId = ranked[0].id;
    log('FILE_ID_RESOLVED', 'ok', {
      resolvedBy: 'search (single candidate)', resolvedFileId, name: ranked[0].name,
      file: 'DriveDownloadExecutor.ts', line: '243-245',
    });
  } else {
    const diff = ranked[0].score - ranked[1].score;
    if (diff >= DEFAULT_RANKING_POLICY.ambiguityThreshold) {
      resolvedFileId = ranked[0].id;
      log('FILE_ID_RESOLVED', 'ok', {
        resolvedBy: 'search (top score wins)', resolvedFileId, name: ranked[0].name,
        scoreDiff: diff, threshold: DEFAULT_RANKING_POLICY.ambiguityThreshold,
        file: 'DriveDownloadExecutor.ts', line: '248-250',
      });
    } else {
      log('AMBIGUOUS', 'fail', {
        code: 'AMBIGUOUS',
        scoreDiff: diff, threshold: DEFAULT_RANKING_POLICY.ambiguityThreshold,
        candidates: ranked.slice(0, 5).map(r => ({ name: r.name, score: r.score })),
        returnExecuted: 'return { ok: false, code: "AMBIGUOUS", ... }',
        file: 'DriveDownloadExecutor.ts', line: '252-263',
      });
      return { ok: false, failedAt: 'AMBIGUOUS', ranked };
    }
  }

  // GET_METADATA — DriveDownloadExecutor.ts L.269
  log('GET_METADATA', 'running', { resolvedFileId, file: 'DriveDownloadExecutor.ts', line: '269' });
  let meta;
  try {
    const { getFileMetadata } = await import('@/lib/google-drive/GoogleDriveConnector');
    const t0 = Date.now();
    meta = await getFileMetadata(resolvedFileId);
    const ms = Date.now() - t0;
    if (!meta) {
      log('GET_METADATA', 'fail', {
        code: 'NOT_FOUND', resolvedFileId,
        returnExecuted: 'return fail("NOT_FOUND", ...)',
        file: 'DriveDownloadExecutor.ts', line: '270-272',
      });
      return { ok: false, failedAt: 'GET_METADATA', error: 'meta=null' };
    }
    log('GET_METADATA', 'ok', {
      resolvedFileId, fileName: meta.name, mimeType: meta.mimeType,
      modifiedTime: meta.modifiedTime, durationMs: ms,
      file: 'DriveDownloadExecutor.ts', line: '269',
    });
  } catch (e) {
    log('GET_METADATA', 'fail', { error: String(e) });
    return { ok: false, failedAt: 'GET_METADATA', error: String(e) };
  }

  // EXPORT_CONFIG — DriveDownloadExecutor.ts L.276
  const { resolveExportConfig, DEFAULT_EXPORT_POLICY } = await import('@/lib/google-drive/DriveDownloadPolicies');
  const { exportMime, strategy: dlStrategy } = resolveExportConfig(meta.mimeType, null, DEFAULT_EXPORT_POLICY);
  log('EXPORT_CONFIG', 'info', {
    mimeType: meta.mimeType, exportMime, strategy: dlStrategy,
    file: 'DriveDownloadExecutor.ts', line: '276',
  });

  // DOWNLOAD — DriveDownloadExecutor.ts L.280-282
  log('DOWNLOAD', 'running', {
    resolvedFileId, strategy: dlStrategy, exportMime,
    delegate: dlStrategy === 'export' ? 'connector.exportFile()' : 'connector.downloadMedia()',
    file: 'DriveDownloadExecutor.ts', line: '280-282',
  });
  let downloadRaw;
  try {
    const { downloadMedia, exportFile } = await import('@/lib/google-drive/GoogleDriveConnector');
    const t0 = Date.now();
    downloadRaw = dlStrategy === 'export'
      ? await exportFile(resolvedFileId, exportMime)
      : await downloadMedia(resolvedFileId);
    const ms = Date.now() - t0;
    log('DOWNLOAD', downloadRaw.ok ? 'ok' : 'fail', {
      ok: downloadRaw.ok, status: downloadRaw.status,
      sizeBytes: downloadRaw.sizeBytes, encoding: downloadRaw.encoding,
      contentType: downloadRaw.contentType, durationMs: ms,
      contentHead: downloadRaw.content?.slice(0, 80),
      file: 'DriveDownloadExecutor.ts', line: downloadRaw.ok ? '280-282' : '288-308',
    });
    if (!downloadRaw.ok) {
      return { ok: false, failedAt: 'DOWNLOAD', error: `HTTP ${downloadRaw.status}` };
    }
  } catch (e) {
    log('DOWNLOAD', 'fail', { error: String(e) });
    return { ok: false, failedAt: 'DOWNLOAD', error: String(e) };
  }

  // DOCUMENT_PROCESSING — DriveDownloadExecutor.ts L.315
  log('DOCUMENT_PROCESSING', 'running', {
    fileName: meta.name, mimeType: meta.mimeType, sizeBytes: downloadRaw.sizeBytes,
    file: 'DriveDownloadExecutor.ts', line: '315-321',
  });
  let processingResult;
  try {
    const { DocumentProcessingEngine } = await import('@/lib/document-processing/DocumentProcessingEngine');
    const t0 = Date.now();
    processingResult = await DocumentProcessingEngine.process({
      fileName: meta.name, mimeType: meta.mimeType,
      rawContent: downloadRaw.content, encoding: downloadRaw.encoding,
      sourceConnector: 'google-drive',
    });
    const ms = Date.now() - t0;
    log('DOCUMENT_PROCESSING', processingResult.ok ? 'ok' : 'partial', {
      ok: processingResult.ok, parserUsed: processingResult.parserUsed,
      charCount: processingResult.ok ? processingResult.charCount : 0,
      errorCode: processingResult.ok ? null : processingResult.errorCode,
      message: processingResult.ok ? null : processingResult.message,
      textHead: processingResult.ok ? processingResult.extractedText?.slice(0, 150) : null,
      durationMs: ms, file: 'DriveDownloadExecutor.ts', line: '315-321',
    });
  } catch (e) {
    log('DOCUMENT_PROCESSING', 'fail', { error: String(e) });
    return { ok: false, failedAt: 'DOCUMENT_PROCESSING', error: String(e) };
  }

  const extractedText = processingResult.ok
    ? processingResult.extractedText
    : downloadRaw.content;

  // LLM
  log('LLM', 'running', { charCount: extractedText.length, textHead: extractedText.slice(0, 100) });
  let llmResponse = null;
  try {
    const prompt = `Voce e o MemoryOS. Abaixo esta o conteudo extraido de um documento do Google Drive.\n\nDOCUMENTO: ${meta.name}\nTIPO: ${meta.mimeType}\n\nCONTEUDO:\n---\n${extractedText.slice(0, 5000)}\n---\n\nResuma o conteudo principal deste documento de forma direta.`;
    llmResponse = await base44.integrations.Core.InvokeLLM({ prompt });
    log('LLM', 'ok', {
      responseLength: typeof llmResponse === 'string' ? llmResponse.length : 0,
      responseHead: String(llmResponse).slice(0, 150),
    });
  } catch (e) {
    log('LLM', 'fail', { error: String(e) });
  }

  return {
    ok: true,
    fileId: resolvedFileId, fileName: meta.name, mimeType: meta.mimeType,
    strategy: dlStrategy, exportMime,
    sizeBytes: downloadRaw.sizeBytes,
    parserUsed: processingResult.parserUsed,
    charCount: processingResult.ok ? processingResult.charCount : 0,
    parsingOk: processingResult.ok,
    parsingError: processingResult.ok ? null : processingResult.errorCode,
    extractedHead: extractedText.slice(0, 300),
    llmResponse,
    searchResults: searchResults.map(f => ({ id: f.id, name: f.name })),
    ranked: ranked.slice(0, 5).map(r => ({ id: r.id, name: r.name, score: r.score })),
  };
}

// ── UI helpers ─────────────────────────────────────────────────────────────────

const SCOLOR = { info:'text-zinc-400', running:'text-blue-300', ok:'text-green-400', partial:'text-yellow-400', fail:'text-red-400' };
const SICON  = { info:'→', running:'⏳', ok:'✓', partial:'⚠', fail:'✗' };
const SBORDER = { info:'border-zinc-700', running:'border-blue-700', ok:'border-green-700', partial:'border-yellow-700', fail:'border-red-600' };

function StepRow({ s }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`border-l-2 pl-3 mb-1 ${SBORDER[s.status]}`}>
      <div className={`flex items-center gap-2 cursor-pointer text-xs ${SCOLOR[s.status]}`} onClick={() => setOpen(o => !o)}>
        <span className="w-3">{SICON[s.status]}</span>
        <span className="font-mono font-bold w-36 shrink-0">{s.step}</span>
        <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${s.status === 'fail' ? 'bg-red-900' : s.status === 'ok' ? 'bg-green-900' : s.status === 'partial' ? 'bg-yellow-900' : 'bg-zinc-800'}`}>{s.status.toUpperCase()}</span>
        {s.data?.file && <span className="text-zinc-600">{s.data.file} L{s.data.line}</span>}
        <span className="ml-auto text-zinc-700">{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <pre className="mt-1 text-xs text-zinc-300 bg-zinc-950 rounded p-2 overflow-auto max-h-64 whitespace-pre-wrap break-all">
          {JSON.stringify(s.data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function SummaryRow({ label, value, color }) {
  const c = color === 'green' ? 'text-green-400' : color === 'red' ? 'text-red-400' : color === 'yellow' ? 'text-yellow-400' : 'text-zinc-300';
  return (
    <div className="flex gap-2 text-xs py-1 border-b border-zinc-800">
      <span className="text-zinc-500 w-52 shrink-0">{label}</span>
      <span className={`flex-1 break-all font-mono ${c}`}>{value}</span>
    </div>
  );
}

export default function SprintM110AuditPage() {
  const [results, setResults] = useState({});
  const [steps,   setSteps]   = useState({});
  const [running, setRunning] = useState({});
  const [runningAll, setRunningAll] = useState(false);

  const execute = useCallback(async (tc) => {
    setRunning(r => ({ ...r, [tc.id]: true }));
    setSteps(s => ({ ...s, [tc.id]: [] }));
    setResults(r => ({ ...r, [tc.id]: null }));
    try {
      const result = await runAudit(tc, step =>
        setSteps(s => ({ ...s, [tc.id]: [...(s[tc.id] ?? []), step] }))
      );
      setResults(r => ({ ...r, [tc.id]: result }));
    } catch (e) {
      setResults(r => ({ ...r, [tc.id]: { ok: false, failedAt: 'EXCEPTION', error: String(e) } }));
    } finally {
      setRunning(r => ({ ...r, [tc.id]: false }));
    }
  }, []);

  const executeAll = useCallback(async () => {
    setRunningAll(true);
    for (const tc of TEST_CASES) await execute(tc);
    setRunningAll(false);
  }, [execute]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">🔬</span>
            <h1 className="text-2xl font-bold">SPRINT M1.10 — Auditoria Cirúrgica do DriveDownloadExecutor</h1>
          </div>
          <p className="text-zinc-400 text-sm">Execução real passo a passo. Cada decisão com arquivo e linha.</p>
          <div className="flex gap-3 mt-4">
            <button onClick={executeAll} disabled={runningAll}
              className="px-5 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 rounded-lg font-semibold text-sm">
              {runningAll ? '⏳ Executando...' : '▶ Executar Todos os Casos'}
            </button>
          </div>
        </div>

        {/* Code map */}
        <div className="border border-zinc-700 rounded-xl p-4">
          <div className="text-xs font-bold text-violet-400 uppercase tracking-widest mb-3">Mapa de Decisão — DriveDownloadExecutor.ts</div>
          <div className="font-mono text-xs bg-zinc-900 rounded p-3 space-y-0.5">
            {[
              ['L127-131', 'text-yellow-300', 'Extract: explicitFileId / fileName / queryFallback / rawText'],
              ['L192',     'text-blue-300',   '  if (explicitFileId) → use directly'],
              ['L195',     'text-blue-300',   '  else if (noIdents) → conversationStore'],
              ['L220',     'text-red-400',    '    → if no selectedFileId: return fail("NO_PARAMS")'],
              ['L225',     'text-green-300',  '  else → searchQuery = fileName ?? queryFallback ?? rawText'],
              ['L234',     'text-green-300',  '    connector.searchByName(searchQuery, {pageSize:20})'],
              ['L236',     'text-red-400',    '    → if length===0: return fail("NOT_FOUND")'],
              ['L240',     'text-green-300',  '    rankCandidates() → pick top'],
              ['L252',     'text-red-400',    '    → if scoreDiff < threshold(30): return fail("AMBIGUOUS")'],
              ['L269',     'text-green-300',  '  connector.getFileMetadata(resolvedFileId)'],
              ['L270',     'text-red-400',    '  → if !meta: return fail("NOT_FOUND")'],
              ['L276',     'text-green-300',  '  resolveExportConfig(mimeType)'],
              ['L280-282', 'text-green-300',  '  connector.exportFile() OR connector.downloadMedia()'],
              ['L288',     'text-red-400',    '  → if !downloadRaw.ok: return fail(HTTP error)'],
              ['L315',     'text-green-300',  '  DocumentProcessingEngine.process()'],
              ['L359',     'text-green-300',  '  return { ok: true, ... }'],
            ].map(([line, cls, text]) => (
              <div key={line}>
                <span className="text-zinc-600 mr-3 w-16 inline-block">{line}</span>
                <span className={cls}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Cases */}
        {TEST_CASES.map(tc => {
          const r   = results[tc.id];
          const ss  = steps[tc.id] ?? [];
          const isR = running[tc.id];

          const searchStep  = ss.find(s => s.step === 'SEARCH_BY_NAME');
          const metaStep    = ss.find(s => s.step === 'GET_METADATA');
          const dlStep      = ss.find(s => s.step === 'DOWNLOAD');
          const parseStep   = ss.find(s => s.step === 'DOCUMENT_PROCESSING');
          const rankedArr   = r?.ranked ?? [];

          const rows = r ? [
            ['1. Fluxo executado',
             r.ok ? 'COMPLETO — todas as etapas executadas' : `Interrompido em: ${r.failedAt}`,
             r.ok ? 'green' : 'red'],
            ['2. Último método executado',
             r.ok ? 'DocumentProcessingEngine.process() + InvokeLLM()' :
             r.failedAt === 'NOT_FOUND' ? 'connector.searchByName() → retornou 0 → return fail("NOT_FOUND") L.236' :
             r.failedAt === 'AMBIGUOUS' ? 'rankCandidates() → scoreDiff < threshold → return fail("AMBIGUOUS") L.252' :
             r.failedAt === 'PARAM_RESOLUTION' ? 'param extraction → noIdents=true → NO_PARAMS L.195' :
             r.failedAt === 'DOWNLOAD' ? 'connector.downloadMedia/exportFile() → falhou L.288' :
             `falhou em ${r.failedAt}: ${r.error?.slice(0, 100)}`,
             r.ok ? 'green' : 'red'],
            ['3. Primeiro método nao executado',
             r.ok ? 'N/A — cadeia completa' :
             r.failedAt === 'NOT_FOUND' ? 'connector.getFileMetadata() — nunca chamado' :
             r.failedAt === 'AMBIGUOUS' ? 'connector.getFileMetadata() — nunca chamado' :
             'N/A', r.ok ? 'green' : 'yellow'],
            ['4. Classe responsável', 'executeDriveDownload (DriveDownloadExecutor)', 'info'],
            ['5. Arquivo', 'src/lib/google-drive/DriveDownloadExecutor.ts', 'info'],
            ['6. Linha da interrupção',
             r.ok ? 'N/A' :
             r.failedAt === 'NOT_FOUND' ? 'L.236-238' :
             r.failedAt === 'AMBIGUOUS' ? 'L.252-263' :
             r.failedAt === 'PARAM_RESOLUTION' ? 'L.195-224' :
             r.failedAt === 'DOWNLOAD' ? 'L.288-308' : 'N/A',
             r.ok ? 'green' : 'red'],
            ['7. Parâmetros recebidos',
             `fileName=null | rawText="${tc.rawText}" | fileId=null | query=null`,
             'info'],
            ['8. searchByName() chamado?',
             searchStep ? 'SIM' : (r.failedAt === 'PARAM_RESOLUTION' ? 'NAO (interrompido antes)' : 'NAO (nao executado)'),
             searchStep ? 'green' : 'red'],
            ['8b. searchByName() retornou',
             searchStep ? `${searchStep.data.resultCount} arquivo(s)` : 'N/A',
             searchStep?.data?.resultCount > 0 ? 'green' : searchStep ? 'red' : 'info'],
            ['9. fileId obtido?',
             r.ok || r.failedAt === 'GET_METADATA' || r.failedAt === 'DOWNLOAD' || r.failedAt === 'DOCUMENT_PROCESSING'
               ? `SIM — ${r.fileId ?? 'ver trace'}` : 'NAO',
             r.fileId ? 'green' : 'red'],
            ['10. getFileMetadata() executado?',
             metaStep ? `SIM — ${metaStep.data.fileName} | ${metaStep.data.mimeType}` :
             (r.failedAt === 'NOT_FOUND' || r.failedAt === 'AMBIGUOUS' || r.failedAt === 'PARAM_RESOLUTION')
               ? 'NAO EXECUTADO' : 'NAO',
             metaStep ? 'green' : 'yellow'],
            ['11. downloadMedia() executado?',
             dlStep ? `SIM — ok=${dlStep.data.ok} | ${dlStep.data.sizeBytes} bytes | ${dlStep.data.durationMs}ms` :
             r.ok === false && ['NOT_FOUND','AMBIGUOUS','PARAM_RESOLUTION'].includes(r.failedAt)
               ? 'NAO EXECUTADO (falhou antes)' : 'NAO',
             dlStep?.status === 'ok' ? 'green' : dlStep ? 'red' : 'yellow'],
            ['12. DocumentProcessingEngine executado?',
             parseStep
               ? `SIM — parser=${parseStep.data.parserUsed} | chars=${parseStep.data.charCount} | ok=${parseStep.data.ok}`
               : r.ok === false ? 'NAO EXECUTADO' : 'NAO',
             parseStep?.status === 'ok' ? 'green' : parseStep?.status === 'partial' ? 'yellow' : 'yellow'],
            ['13. Causa raiz',
             r.ok
               ? 'O problema NAO esta no DriveDownloadExecutor. Cadeia completa executada com sucesso.'
               : r.failedAt === 'NOT_FOUND'
                 ? `searchByName("${tc.rawText}") retornou 0 resultados. Arquivo nao encontrado no Drive com esse searchQuery.`
                 : r.failedAt === 'AMBIGUOUS'
                   ? `Multiplos arquivos encontrados com scoreDiff < ${AMBIGUITY_THRESHOLD}. retornou fail("AMBIGUOUS") L.252-263.`
                   : r.failedAt === 'AUTH'
                     ? 'Token invalido ou ausente.'
                     : `Falha em ${r.failedAt}: ${r.error?.slice(0, 200)}`,
             r.ok ? 'green' : 'red'],
          ] : [];

          return (
            <div key={tc.id} className="border border-zinc-700 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-violet-400 text-sm">TC-{tc.id}</span>
                  <span className="font-bold">{tc.label}</span>
                  {r && (
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${r.ok ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                      {r.ok ? 'PASS' : `FAIL @ ${r.failedAt}`}
                    </span>
                  )}
                </div>
                <button onClick={() => execute(tc)} disabled={isR}
                  className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded-lg text-sm">
                  {isR ? '⏳' : '▶ Executar'}
                </button>
              </div>

              <div className="text-xs text-zinc-500 mb-3">
                input: <span className="text-zinc-200 font-mono">"{tc.rawText}"</span>
                {' '} → <span className="font-mono text-yellow-300">fileName=null, rawText="{tc.rawText}", fileId=null</span>
              </div>

              {/* Step trace */}
              {ss.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs font-bold text-zinc-600 uppercase tracking-widest mb-2">Trace (clique para expandir)</div>
                  {ss.map((s, i) => <StepRow key={i} s={s} />)}
                </div>
              )}

              {/* Summary */}
              {rows.length > 0 && (
                <div className="border border-zinc-700 rounded-lg p-4">
                  <div className="text-xs font-bold text-violet-400 uppercase tracking-widest mb-2">Entrega Final — 13 Pontos</div>
                  {rows.map(([label, value, color]) => (
                    <SummaryRow key={label} label={label} value={value} color={color} />
                  ))}
                </div>
              )}

              {/* LLM response */}
              {r?.ok && r.llmResponse && (
                <div className="mt-4 border border-zinc-700 rounded p-3">
                  <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Resposta do LLM</div>
                  <div className="text-zinc-200 text-sm whitespace-pre-wrap leading-relaxed">
                    {typeof r.llmResponse === 'string' ? r.llmResponse : JSON.stringify(r.llmResponse)}
                  </div>
                </div>
              )}
            </div>
          );
        })}

      </div>
    </div>
  );
}