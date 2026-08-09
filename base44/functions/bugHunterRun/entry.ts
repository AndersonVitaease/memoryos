/**
 * bugHunterRun — Orquestrador autonomo do Bug Hunter (modo simples + continuo encadeado).
 *
 * MODO SIMPLES (legacy): um bloco de ate maxSteps passos. Cria BugHunterRun, navega,
 * loop LLM + Playwright, cria BugFindings, finaliza status=completed.
 *
 * MODO CONTINUO (continuous=true): encadeia varios blocos (chunks) numa MESMA
 * conversa do MemoryOS, para construir um contexto grande (150-200+ perguntas) e
 * testar a memoria de longa duracao. Cada chunk roda ate o ORCAMENTO DE TEMPO
 * (~230s, margem segura sob o limite de 5min da plataforma), captura/injeta o
 * session_id do chat via localStorage (browser_evaluate) para retomar a conversa,
 * e persiste status='awaiting_next_chunk' para o frontend encadear o proximo.
 * O usuario pode parar a qualquer momento (stop_requested na entidade).
 *
 * Admin-only: cria dados e dirige um browser remoto.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { connect as mcpConnect, resolveHeaders as mcpResolveHeaders, tryRecoverResultFromError } from '../../shared/mcpClient.ts';

const PLAYWRIGHT_SERVER_NAME = 'playwright-bug-hunter';
const MAX_SNAPSHOT_CHARS = 12000;
const MAX_HISTORY_ITEMS = 12;
const MAX_PRIOR_QUESTIONS = 40;  // Limita historico de perguntas no prompt para evitar LLM lento
// Orcamento de tempo por chunk: 200s deixa margem segura sob o limite de 5min
// (300s) da plataforma, considerando login (~10s) + navigate + capture (~10s).
const TIME_BUDGET_MS = 600000;  // 10 minutos — deixa rodar mesmo com loop DOM
// Timeout por chamada MCP: nenhuma chamada individual pode bloquear o loop por
// mais que isso. Sem este guardiao, um snapshot/navigate pendurado no Playwright
// trava o loop e a funcao morre no limite de 300s sem persistir o resultado.
const MCP_CALL_TIMEOUT_MS = 20000;
// Timeout para TODAS as chamadas SDK (entity filter/update/create). Sem isto, uma
// chamada SDK pendurada sob carga da plataforma trava a funcao ate o limite de
// 300s e a entidade fica presa em "running" para sempre. 8s e suficiente para
// operacoes normais; se passar, aborta e segue (best-effort).
const SDK_TIMEOUT_MS = 8000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('MCP timeout (' + ms + 'ms): ' + label)), ms)),
  ]);
}

const MEMORYOS_ARCHITECTURE_BRIEF = [
  'MEMORYOS ARCHITECTURE — CONNECTORS AND CAPABILITIES TO PROBE AUTONOMOUSLY:',
  'The MemoryOS chat routes user requests to external connectors. Your job: probe each connector by asking the chat to perform a representative capability, then READ the response on the next step.',
  '',
  'CONNECTORS:',
  '1. Google Workspace (Gmail: readInbox/sendEmail, Drive: listFiles/downloadFile/uploadFile/createFolder/delete/rename, Calendar: listEvents/createEvent, Profile)',
  '2. Microsoft 365 (Outlook Mail: readInbox/sendEmail, Outlook Calendar: listEvents/createEvent, OneDrive: listFiles/downloadFile, Contacts, Excel, Word, PowerPoint, OneNote, Teams, SharePoint, ToDo)',
  '3. GitHub (searchCode, listRepos, readRepo, createIssue)',
  '4. WhatsApp (sendMessage)',
  '5. Memori/Mem0 MCP (remember, recall)',
  '6. Stirling-PDF (rotate, merge, split, extractText, passwordProtect)',
  '',
  'OBSERVATION RULES (neutral — observe what happens, do NOT hunt for specific bug types):',
  '- After sending a question, you MUST take a browser_snapshot on the next step and READ the assistant response before deciding anything.',
  '- You may ONLY set bug_detected=true on a step where you just READ the assistant response. NEVER on a send or navigate step.',
  '- To report a bug you MUST quote the EXACT response text the assistant returned in bug.actual. If you cannot quote real response text, set bug_detected=false.',
  '- An integration not being connected is NOT a bug. A friendly prompt to connect is correct behavior. Only report a bug if the assistant shows a RAW technical error string (stack trace, JSON error object, "token not configured") visible to the user.',
  '- You CANNOT see which connector was called internally. You can only observe the text returned to the user. Do NOT report "wrong connector routing" — you have no way to observe that from the page.',
  '- Console JavaScript errors that break functionality may be reported, but only if the page is actually broken (not just a transient network error).'
].join('\n');

const DECISION_SCHEMA = {
  type: 'object',
  properties: {
    reasoning: { type: 'string', description: 'Brief reasoning about the current page state and what to do next' },
    next_action: {
      type: 'object',
      properties: {
        tool: { type: 'string', enum: ['browser_navigate', 'browser_click', 'browser_type', 'browser_snapshot', 'browser_navigate_back', 'browser_press_key', 'none'] },
        url: { type: 'string', description: 'URL for browser_navigate (e.g. "https://example.com/page")' },
        target: { type: 'string', description: 'Element ref from the snapshot for browser_click/browser_type (e.g. "s1e2")' },
        element: { type: 'string', description: 'Human-readable description of the target element (optional)' },
        text: { type: 'string', description: 'Text to type into the field for browser_type' },
        submit: { type: 'boolean', description: 'For browser_type: press Enter after typing (true to send chat message / submit form)' },
        key: { type: 'string', description: 'Key to press for browser_press_key (e.g. "Enter")' },
        description: { type: 'string', description: 'Human-readable description of what this action does' }
      },
      required: ['tool']
    },
    bug_detected: { type: 'boolean', description: 'true ONLY on a READ step (after snapshotting the assistant response). You must quote response text in bug.actual. false on send/navigate steps.' },
    bug: {
      type: 'object',
      description: 'Bug details (only when bug_detected=true)',
      properties: {
        title: { type: 'string' },
        severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
        description: { type: 'string' },
        category: { type: 'string', enum: ['ui', 'functional', 'broken_flow', 'error', 'performance', 'auth', 'data', 'other'] },
        expected: { type: 'string' },
        actual: { type: 'string', description: 'EXACT assistant response text you observed on the page (not inference). Required to report a bug.' }
      }
    },
    done: { type: 'boolean', description: 'true when exploration is complete' }
  },
  required: ['next_action', 'bug_detected', 'done']
};

function extractSnapshotText(snap) {
  if (!snap) return '(no snapshot)';
  if (Array.isArray(snap.content)) return snap.content.map((c) => c.text || '').join('\n');
  if (typeof snap === 'string') return snap;
  return JSON.stringify(snap);
}

function extractConsoleErrors(cons) {
  if (!cons) return [];
  if (Array.isArray(cons.messages)) return cons.messages;
  if (Array.isArray(cons)) return cons;
  return [];
}

// Extrai refs de elementos conhecidos deterministicamente da arvore de
// acessibilidade (snapshot). O LLM e instavel em procurar o textarea do chat
// num snapshot de milhares de chars; aqui achamos por regex e injetamos o ref
// direto no prompt, eliminando a dependencia de "o LLM achou o ref certo".
function extractElementRefs(snapshotText) {
  const refs = {};
  if (!snapshotText || typeof snapshotText !== 'string') return refs;
  // Extrai email/password/submit ANTES do chatInput para o fallback poder exclui-los.
  const emailMatch = snapshotText.match(/(?:textbox|input)[^\n]*?(?:email|e-mail)[^\n]*?\[ref=(\w+)\]/i);
  if (emailMatch) refs.email = emailMatch[1];
  const passwordMatch = snapshotText.match(/(?:textbox|input)[^\n]*?(?:password|senha)[^\n]*?\[ref=(\w+)\]/i);
  if (passwordMatch) refs.password = passwordMatch[1];
  const submitMatch = snapshotText.match(/(?:button)[^\n]*?(?:Entrar|Login|Sign in|Acessar|Continuar|Acessar conta|Entrar na conta)[^\n]*?\[ref=(\w+)\]/i);
  if (submitMatch) refs.submit = submitMatch[1];
  // Chat input: busca linha-a-linha por textbox/textarea com ref E palavra-chave de chat.
  // O ref pode vir ANTES ou DEPOIS do placeholder no snapshot do Playwright, entao
  // verificamos a keyword em qualquer posicao da linha (nao so entre role e ref).
  const chatKeywords = /converse|memoria|mensagem|pergunte|digite|type a|message|chat|ask|escreva|escrever|enviar|pergunta|diga/i;
  const lines = snapshotText.split('\n');
  for (const line of lines) {
    if (/(?:textbox|textarea)/i.test(line) && /\[ref=(\w+)\]/.test(line) && chatKeywords.test(line)) {
      const m = line.match(/\[ref=(\w+)\]/);
      if (m) { refs.chatInput = m[1]; break; }
    }
  }
  // Fallback: se nao achou por palavras-chave, pega a ultima textbox/textarea com ref
  // que nao seja email/password (na pagina de chat so ha um textarea visivel — o input).
  if (!refs.chatInput) {
    const allInputs = [...snapshotText.matchAll(/(?:textbox|textarea)[^\n]*?\[ref=(\w+)\]/gi)];
    if (allInputs.length > 0) {
      const excluded = new Set([refs.email, refs.password].filter(Boolean));
      const candidate = allInputs.map((m) => m[1]).reverse().find((r) => !excluded.has(r));
      if (candidate) refs.chatInput = candidate;
    }
  }
  return refs;
}

// Extrai o valor de retorno de browser_evaluate. O Playwright MCP devolve o
// resultado como texto no formato "### Result\n<valor>\n### Ran Playwright code\n...".
// Esta funcao pega o conteudo entre "### Result\n" e o proximo "### " (ou fim).
function extractEvaluateText(res) {
  let text = '';
  if (Array.isArray(res) && res[0] && typeof res[0].text === 'string') text = res.map((c) => c.text || '').join('\n');
  else if (res && Array.isArray(res.content)) text = res.content.map((c) => c.text || '').join('\n');
  else if (typeof res === 'string') text = res;
  else text = JSON.stringify(res);
  const m = text.match(/### Result\n([\s\S]*?)(?:\n### |$)/);
  return m ? m[1].trim() : text.trim();
}

function buildPrompt(targetUrl, scenario, history, snapshotText, consoleErrorsText) {
  const historyText = history.map((h) => `${h.step}. ${h.action}: ${h.description}${h.error ? ' [ERROR: ' + h.error + ']' : ''}`).join('\n') || '(none yet)';
  const goal = scenario || 'Freely explore the app by clicking links and buttons, filling forms, and navigating between pages. Look for JavaScript console errors, broken flows, missing content, visual glitches, and auth issues.';
  return [
    'You are an autonomous QA agent ("Bug Hunter") testing a web application for bugs.',
    'You control a headless browser via Playwright MCP tools. You explore the app, interact with it, and report bugs you find.',
    '',
    'TARGET URL: ' + targetUrl,
    'EXPLORATION GOAL: ' + goal,
    '',
    'AVAILABLE PLAYWRIGHT MCP TOOLS (set next_action.tool and the corresponding flat fields):',
    '- browser_navigate       fields: url="https://..."                                      -> open a URL',
    '- browser_click          fields: target="s1e2" element="login button"                    -> click an element (target is the ref from the snapshot)',
    '- browser_type          fields: target="s1e2" text="hello" submit=true                   -> type text into an input (target is the ref; submit=true presses Enter after)',
    '- browser_press_key     fields: key="Enter"                                             -> press a keyboard key',
    '- browser_snapshot      fields: (none)                                                  -> re-read the page structure',
    '- browser_navigate_back fields: (none)                                                  -> go back to previous page',
    '- none                   fields: (none)                                                  -> do nothing this step',
    '',
    'NOTE: "target" must be a ref string from the snapshot above (e.g. "s1e2"). "element" is a human-readable description (optional). For browser_type, set submit=true to press Enter after typing (useful for sending a chat message or submitting a form).',
    '',
    'PREVIOUS ACTIONS TAKEN:',
    historyText,
    '',
    'CURRENT PAGE SNAPSHOT (accessibility tree; element refs like ref="s1e2" are clickable targets):',
    snapshotText.slice(0, MAX_SNAPSHOT_CHARS),
    '',
    'CONSOLE ERRORS ON CURRENT PAGE:',
    consoleErrorsText || '(none)',
    '',
    'TASK:',
    '1. Analyze the snapshot and console errors. If you spot a bug (JS error, broken flow, missing/empty content, visual anomaly, auth failure), set bug_detected=true and fill in the bug details (title, severity, category, expected vs actual). Do NOT report the same bug twice. NOTE: transient 502/503/504 Bad Gateway on a navigation attempt is NOT a bug — the orchestrator already retries those; only report it as a bug if the page is genuinely broken after a successful load (missing content, JS errors, broken flow).',
    '2. Decide the next action to keep exploring. Pick a tool and its args. For browser_click/browser_type, use a ref that exists in the snapshot above. Do NOT re-navigate to the same URL you are already on.',
    '3. Set done=true when you have explored the main flows or keep re-encountering the same state.',
    '',
    'Return only the JSON matching the schema.'
  ].join('\n');
}

function buildConversationPrompt(targetUrl, scenario, history, snapshotText, consoleErrorsText, ctx, refs, priorQuestions) {
  const _refs = refs || {};
  const _prior = priorQuestions || [];
  const historyText = history.map((h) => `${h.step}. ${h.action}: ${h.description}${h.error ? ' [ERROR: ' + h.error + ']' : ''}`).join('\n') || '(none yet)';
  const loginHint = (ctx && ctx.loginEmail && ctx.loginPassword)
    ? '\nLOGIN CREDENTIALS (use them if you encounter a login page): email="' + ctx.loginEmail + '" password="' + ctx.loginPassword + '". Fill the email field, click continue/next, fill the password field, then submit. Do NOT report the login flow itself as a bug.'
    : '\nNo login credentials were provided. If the app requires login, report it as a bug (category: auth) and set done=true.';
  const goal = scenario || "Autonomously probe the MemoryOS chat by asking targeted questions about EACH connector and capability listed in the ARCHITECTURE BRIEF. For each connector, ask ONE question that exercises a representative capability, evaluate the response against the BUG CRITERIA, then move to the next connector. Cover ALL connectors — do not stop after finding one bug.";
  const priorBlock = _prior.length > 0
    ? [
      '',
      'QUESTIONS YOU ALREADY ASKED IN PREVIOUS CHUNKS (do NOT repeat any of these — ask something NEW each time. Vary the connector, the capability, or the specifics so every question is fresh):',
      ..._prior.map((q, i) => '  ' + (i + 1) + '. ' + String(q).slice(0, 160)),
      '',
    ].join('\n')
    : '';
  return [
    'You are an autonomous QA agent ("Bug Hunter") testing a chat application called MemoryOS.',
    'Your job is to have a natural multi-turn CONVERSATION with the app to find bugs. You do NOT need anyone to feed you questions - you generate the questions yourself based on the conversation so far.',
    '',
    'TARGET URL: ' + targetUrl,
    'CONVERSATION GOAL: ' + goal,
    loginHint,
    '',
    MEMORYOS_ARCHITECTURE_BRIEF,
    priorBlock,
    'AVAILABLE PLAYWRIGHT MCP TOOLS (set next_action.tool and the corresponding flat fields):',
    '- browser_navigate       fields: url="https://..."                                      -> open a URL',
    '- browser_click          fields: target="s1e2" element="login button"                    -> click an element (target is the ref from the snapshot)',
    '- browser_type          fields: target="s1e2" text="hello" submit=true                   -> type text into an input (target is the ref; submit=true presses Enter after — use this to send a chat message)',
    '- browser_press_key     fields: key="Enter"                                             -> press a keyboard key',
    '- browser_snapshot      fields: (none)                                                  -> re-read the page structure (use AFTER sending a message to read the assistant response)',
    '- browser_navigate_back fields: (none)                                                  -> go back to previous page',
    '- none                   fields: (none)                                                  -> do nothing this step',
    '',
    'NOTE: "target" must be a ref string from the snapshot above (e.g. "s1e2"). For browser_type, set submit=true to press Enter after typing (sends chat message or submits form).',
    '',
    'CONVERSATION HISTORY (this chunk so far):',
    historyText,
    '',
    'CURRENT PAGE SNAPSHOT (accessibility tree; element refs like ref="s1e2" are clickable targets; look for the chat input textarea field):',
    snapshotText.slice(0, 8000),
    '',
    'CONSOLE ERRORS ON CURRENT PAGE:',
    consoleErrorsText || '(none)',
    '',
    'DETECTED ELEMENT REFS (use these EXACT ref strings — do NOT search the snapshot yourself):',
    '- Chat input (textarea): ' + (_refs.chatInput || 'NOT FOUND — if you are on the chat page, take a browser_snapshot next step and it should appear'),
    '- Email field: ' + (_refs.email || 'N/A'),
    '- Password field: ' + (_refs.password || 'N/A'),
    '- Submit/Login button: ' + (_refs.submit || 'N/A'),
    '',
    'CRITICAL RULES:',
    '*** FOR browser_type WITH NEXT_ACTION.TOOL="browser_type": YOU MUST ALWAYS FILL NEXT_ACTION.TEXT. If you do not provide text, the action is SKIPPED and nothing happens. NEVER send browser_type without text. ***',
    '- NEVER use browser_navigate to go to a URL you are already on. If the Page URL in the snapshot matches your target, INTERACT with the page (click/type) instead of navigating.',
    '- For browser_navigate: set next_action.url to the full URL. Without url the action is skipped.',
    '- For browser_click: set next_action.target to a ref from the snapshot (e.g. "s1e2"). Without target the action is skipped.',
    '- For browser_type: set next_action.target (ref from snapshot) AND next_action.text (the text to type). Without either, the action is skipped. Set next_action.submit=true to press Enter after typing.',
    '',
    'TASK (autonomous - you decide what to ask, nobody feeds you questions):',
    '1. LOGIN: If the DETECTED ELEMENT REFS above show an Email field AND Password field, log in: browser_type target="' + (_refs.email || '<email-ref>') + '" text="' + (ctx.loginEmail || '<email>') + '", then browser_type target="' + (_refs.password || '<password-ref>') + '" text="' + (ctx.loginPassword || '<password>') + '" submit=true. Then next step browser_snapshot. If no email/password refs detected, you are already logged in — skip to step 4. Do NOT report login as a bug.',
    '2. If you are NOT on a login page and NOT in the chat, use browser_navigate ONCE to reach the chat URL. Do not repeat the navigation.',
    '3. If the assistant has JUST responded (this is a READ step): EVALUATE the actual response text. To report a bug you MUST quote the exact response text in bug.actual. Only report if the response itself shows a real problem: empty/blank, a raw technical error string visible to the user, or broken/missing UI. If you have not read a response yet this step, set bug_detected=false. Do NOT report the same bug twice.',
    '4. PROBE THE MEMORY / CONNECTORS: Ask ONE NEW question at a time (never repeat a question from the QUESTIONS YOU ALREADY ASKED list). Vary between memory-continuity probes (e.g. "o que voce lembra sobre mim ate agora?", "resuma o que conversamos ate aqui") and connector-capability probes from the ARCHITECTURE BRIEF. Use browser_type with target="' + (_refs.chatInput || '<chat-input-ref>') + '" text="<your question>" submit=true to type and send the message in one step.',
    '5. After sending a message, set next_action.tool to browser_snapshot so you can read the response on the next step. NEVER send two messages in a row without reading the response in between.',
    '6. Set done=true ONLY when you have genuinely finished. The orchestrator will keep asking you to continue if the target is not reached — do NOT declare done prematurely; just keep asking new questions.',
    '',
    'Return only the JSON matching the schema.'
  ].join('\n');
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });

    let body = {};
    try { body = await req.json(); } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }
    const {
      targetUrl,
      maxSteps = 5,
      scenario,
      mode = 'explore',
      loginEmail,
      loginPassword,
      runId: clientRunId,
      continuous = false,
      chatSessionId = '',
      targetQuestions = 0,
      chunkIndex = 0,
    } = body;
    const _envEmail = (typeof Deno !== 'undefined' && Deno.env) ? (Deno.env.get('BUGHUNTER_TEST_EMAIL') || '') : '';
    const _envPass = (typeof Deno !== 'undefined' && Deno.env) ? (Deno.env.get('BUGHUNTER_TEST_PASSWORD') || '') : '';
    const finalLoginEmail = loginEmail || _envEmail || undefined;
    const finalLoginPassword = loginPassword || _envPass || undefined;
    const finalMode = continuous ? 'conversation' : (mode !== 'explore' ? mode : (_envEmail ? 'conversation' : 'explore'));
    if (!targetUrl) return Response.json({ error: 'Missing required field: targetUrl' }, { status: 400 });

    const servers = await base44.asServiceRole.entities.MCPServerConfig.filter({ name: PLAYWRIGHT_SERVER_NAME });
    if (servers.length === 0) return Response.json({ error: "MCPServerConfig '" + PLAYWRIGHT_SERVER_NAME + "' not found" }, { status: 404 });
    const server = servers[0];

    const { headers, error: headerError } = mcpResolveHeaders(server);
    if (headerError) return Response.json({ error: headerError }, { status: 500 });

    let mcpSession = null;
    try {
      mcpSession = await withTimeout(mcpConnect(server.server_url, headers), MCP_CALL_TIMEOUT_MS, 'mcpConnect');
    } catch (e) {
      return Response.json({ error: 'MCP connect failed: ' + e.message, run_id: 'bugHunter_' + Date.now() }, { status: 502 });
    }

    const runId = clientRunId || ('bugHunter_' + Date.now());
    const callMcp = async (toolName, args = {}) => {
      let result;
      try {
        result = await withTimeout(mcpSession.client.callTool({ name: toolName, arguments: args }), MCP_CALL_TIMEOUT_MS, toolName);
      } catch (innerErr) {
        const recovered = tryRecoverResultFromError(innerErr);
        if (!recovered) throw innerErr;
        result = recovered;
      }
      if (result.isError) {
        const errMsg = result.content?.[0]?.text || 'Tool error';
        throw new Error(String(errMsg));
      }
      return result.structuredContent ?? result.content ?? result;
    };

    const navigateWithRetry = async (url, attempts = 2) => {
      let lastErr = null;
      for (let i = 0; i < attempts; i++) {
        try {
          const result = await callMcp('browser_navigate', { url });
          try { await callMcp('browser_wait_for', { time: 2 }); } catch (e) { /* best-effort */ }
          return result;
        } catch (e) {
          lastErr = e;
          const msg = String(e.message || e);
          if (/50[234]|Bad Gateway|timeout|ECONNRESET|ETIMEDOUT|fetch failed/i.test(msg) && i < attempts - 1) {
            await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
            continue;
          }
          throw e;
        }
      }
      throw lastErr;
    };

      // Aguarda os conectores inicializarem (connectionsMounted === true).
  // Sem isto, perguntas são roteadas para general_conversation que diz "não consigo"
  // e todas as execuções falham, aparentando travamento.
  const waitForConnectors = async (maxWaitMs = 30000) => {
    const startWait = Date.now();
    while ((Date.now() - startWait) < maxWaitMs) {
      try {
        const snap = await callMcp('browser_snapshot', {});
        const snapText = extractSnapshotText(snap);
        // Verifica se connectionsMounted === true no __MEMORY_DEBUG__
        // via browser_evaluate (mais confiável que regex no snapshot)
        const checkResult = await callMcp('browser_evaluate', {
          function: "() => { try { return window.__MEMORY_DEBUG__?.React?.connectionsMounted === true; } catch(e) { return false; } }"
        });
        const evalText = extractEvaluateText(checkResult);
        if (evalText === 'true' || evalText === 'true
') {
          return true;  // Conectores prontos
        }
      } catch (e) { /* best-effort */ }
      try { await callMcp('browser_wait_for', { time: 2 }); } catch (e) { /* best-effort */ }
    }
    return false;  // Timeout — conectores não inicializaram a tempo
  };

// Fallback nuclear: digita diretamente no <textarea> via DOM e submete o <form>.// Fallback nuclear: digita diretamente no <textarea> via DOM e submete o <form>\.
    // 100% confiavel — nao depende do LLM escolher o ref certo nem do textarea estar
    // na arvore de acessibilidade (textarea disabled/ausente). Evita o padrao "LLM
    // escolhe div de timestamp -> browser_type falha em 20s -> run trava".
    const typeViaEvaluate = async (text) => {
      const escaped = JSON.stringify(text);
      const fn = '() => {' +
        '  var ta = document.querySelector("textarea[placeholder*=\\"Converse\\"]")' +
        '    || document.querySelector("textarea:not([disabled])");' +
        '  if (!ta) return "no-textarea";' +
        '  if (ta.disabled) return "disabled";' +
        '  var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;' +
        '  setter.call(ta, ' + escaped + ');' +
        '  ta.dispatchEvent(new Event("input", { bubbles: true }));' +
        '  var form = ta.closest("form");' +
        '  if (form) { form.requestSubmit(); return "sent"; }' +
        '  ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));' +
        '  return "enter-dispatched";' +
        '}';
      const r = await callMcp('browser_evaluate', { function: fn });
      return extractEvaluateText(r);
    };

    // ── Estado do chunk ──────────────────────────────────────────────────────
    const findings = [];
    const history = [];
    const reportedBugSignatures = new Set();
    let justSentMessage = false;
    let questionsSent = 0;
    let questionsAnswered = 0;
    let lastSentText = '';
    const transcript = [];

    // ── Estado acumulado (modo continuo): carrega do registro existente ────
    let cumulativeQuestionsSent = 0;
    let cumulativeQuestionsAnswered = 0;
    let cumulativeFindings = 0;
    let cumulativeDurationMs = 0;
    let cumulativeTranscript = [];
    let domFallbackFailCount = 0;  // Detecta loop de retry infinito no typeViaEvaluate
    let existingChunkCount = 0;
    let priorQuestions = [];
    let capturedSessionId = chatSessionId || '';
    let runRecordId = null;

    const isResume = continuous && chunkIndex > 0 && !!chatSessionId;

    if (continuous && isResume) {
      try {
        const rec = (await withTimeout(base44.asServiceRole.entities.BugHunterRun.filter({ run_id: runId }), SDK_TIMEOUT_MS, 'resume_filter'))[0];
        if (rec) {
          runRecordId = rec.id;
          cumulativeQuestionsSent = rec.questions_sent || 0;
          cumulativeQuestionsAnswered = rec.questions_answered || 0;
          cumulativeFindings = rec.findings_count || 0;
          cumulativeDurationMs = rec.duration_ms || 0;
          existingChunkCount = rec.chunk_count || 0;
          try {
            cumulativeTranscript = JSON.parse(rec.transcript || '[]');
            priorQuestions = cumulativeTranscript.map((t) => t.question).filter(Boolean).slice(-MAX_PRIOR_QUESTIONS);  // Últimas MAX_PRIOR_QUESTIONS
          } catch { /* best-effort */ }
        }
      } catch (e) { /* best-effort */ }
    }

    // ── Persiste/cria o registro da run ────────────────────────────────────
    try {
      if (continuous && runRecordId) {
        await withTimeout(base44.asServiceRole.entities.BugHunterRun.update(runRecordId, {
          status: 'running',
          stop_requested: false,
        }), SDK_TIMEOUT_MS, 'resume_update');
      } else {
        const created = await withTimeout(base44.entities.BugHunterRun.create({
          run_id: runId,
          target_url: targetUrl,
          mode: finalMode,
          scenario: scenario || '',
          max_steps: maxSteps,
          status: 'running',
          questions_sent: 0,
          questions_answered: 0,
          findings_count: 0,
          transcript: '[]',
          history: '[]',
          continuous: !!continuous,
          target_questions: targetQuestions || 0,
          chunk_count: 0,
          chat_session_id: chatSessionId || '',
          stop_requested: false,
        }), SDK_TIMEOUT_MS, 'run_create');
        runRecordId = created.id;
      }
    } catch (e) { /* best-effort */ }

    const _isTargetedScenario = !!(scenario && scenario.trim().length > 0);
    const MIN_QUESTIONS = finalMode === 'conversation'
      ? (_isTargetedScenario ? 1 : Math.max(1, Math.min(3, Math.floor((maxSteps - 1) / 2))))
      : 0;
    const START = Date.now();

    // ── Step -1: limpa qualquer browser/sessao MCP pendurada de runs anteriores ──
    // Sem isto, um Chrome orfao de uma run morta pelo limite de 5min da plataforma
    // segura o SingletonLock e a nova run falha com "Browser is already in use".
    try {
      await withTimeout(mcpSession.client.callTool({ name: 'browser_close', arguments: {} }), 5000, 'pre_close');
    } catch (e) { /* best-effort: sem sessao ativa e esperado */ }

    // ── Step 0: navega para o alvo (login ou app) ─────────────────────────
    try {
      await navigateWithRetry(targetUrl);
      history.push({ step: 0, action: 'browser_navigate', description: 'Navigated to ' + targetUrl });
    } catch (e) {
      // Marca como failed ANTES de retornar — sem isto a entidade fica presa em "running".
      if (runRecordId) {
        try { await withTimeout(base44.asServiceRole.entities.BugHunterRun.update(runRecordId, { status: 'failed', history: JSON.stringify(history, null, 2) }), SDK_TIMEOUT_MS, 'nav_fail_persist'); } catch (er) { /* best-effort */ }
      }
      return Response.json({ ok: false, error: 'Initial navigate failed: ' + e.message, run_id: runId, history }, { status: 502 });
    }

    // ── Login deterministico (conversation mode com credenciais) ─────────
    if (finalMode === 'conversation' && finalLoginEmail && finalLoginPassword) {
      try {
        try { await callMcp('browser_wait_for', { time: 8 });  // Aumentado de 5s para 8s (permitir que chat inicialize completamente) } catch (e) { /* best-effort */ }
        const loginSnap = extractSnapshotText(await callMcp('browser_snapshot', {}));
        const loginRefs = extractElementRefs(loginSnap);
        if (loginRefs.email && loginRefs.password) {
          await callMcp('browser_type', { target: loginRefs.email, text: finalLoginEmail });
          if (loginRefs.submit) {
            await callMcp('browser_type', { target: loginRefs.password, text: finalLoginPassword });
            await callMcp('browser_click', { target: loginRefs.submit, element: 'submit button' });
          } else {
            await callMcp('browser_type', { target: loginRefs.password, text: finalLoginPassword, submit: true });
          }
          try { await callMcp('browser_wait_for', { time: 4 }); } catch (e) { /* best-effort */ }
          history.push({ step: 0.5, action: 'auto_login', description: 'Auto-filled login: email + password + submit' });
        } else {
          history.push({ step: 0.5, action: 'auto_login', description: 'No login form detected — already authenticated or no login wall' });
        }
      } catch (e) {
        history.push({ step: 0.5, action: 'auto_login', description: 'Auto-login skipped: ' + e.message });
      }
    }

    // ── Modo continuo: garante /chat com a sessao correta (resume) e captura o session_id (primeiro chunk) ──
    let origin = targetUrl;
    try { origin = new URL(targetUrl).origin; } catch (e) { /* keep targetUrl */ }
    const chatUrl = origin + '/chat';

    if (continuous) {
      // Resume: injeta o session_id no localStorage para o chat carregar a conversa anterior.
      if (chatSessionId) {
        try {
          await callMcp('browser_evaluate', {
            function: '() => { try { localStorage.setItem("memoryos_last_session_id", ' + JSON.stringify(chatSessionId) + '); return true; } catch(e) { return false; } }'
          });
          history.push({ step: 0.7, action: 'inject_session', description: 'Injected chat session_id into localStorage for resume' });
        } catch (e) {
          history.push({ step: 0.7, action: 'inject_session', description: 'Inject session failed: ' + e.message });
        }
      }
      // Navega deterministtamente para /chat (nao depende do LLM achar o chat).
      try {
        await navigateWithRetry(chatUrl);
        try { await callMcp('browser_wait_for', { time: 10 });  // Aumentado de 6s para 10s (conectores precisam inicializar) } catch (e) { /* best-effort */ }
        history.push({ step: 0.8, action: 'browser_navigate', description: 'Navigated to ' + chatUrl });
        
        // CRITICAL: Aguarda os conectores inicializarem antes de enviar perguntas.
        try {
          const connReady = await withTimeout(waitForConnectors(30000), 35000, 'waitForConnectors');
          if (connReady) {
            history.push({ step: 0.81, action: 'connectors_ready', description: 'Connectors initialized (connectionsMounted === true)' });
          } else {
            history.push({ step: 0.81, action: 'connectors_timeout', description: 'Connectors timeout after 30s — proceeding with caution' });
          }
        } catch (e) {
          history.push({ step: 0.81, action: 'connectors_check_failed', description: 'Connectors check failed: ' + e.message });
        }
      } catch (e) {
        history.push({ step: 0.8, action: 'browser_navigate', description: 'Navigate to /chat failed: ' + e.message });
      }
      // Primeiro chunk: captura o session_id que o chat criou.
      if (!chatSessionId) {
        try {
          const r = await callMcp('browser_evaluate', { function: "() => localStorage.getItem('memoryos_last_session_id')" });
          const v = extractEvaluateText(r);
          // browser_evaluate serializa strings de volta com aspas (JSON) — limpa.
          const cleanId = v.replace(/^"|"$/g, '').replace(/\\"/g, '"');
          if (cleanId && cleanId !== 'null' && cleanId !== 'undefined' && cleanId !== '') {
            capturedSessionId = cleanId;
            history.push({ step: 0.9, action: 'capture_session', description: 'Captured chat session_id: ' + capturedSessionId });
        
        // Aguardar conectores novamente (mesmo se é resume — conectores precisam estar prontos)
        try {
          const connReady = await withTimeout(waitForConnectors(15000), 20000, 'waitForConnectors-resume');
          if (connReady) {
            history.push({ step: 0.91, action: 'connectors_ready', description: 'Connectors ready after resume' });
          } else {
            history.push({ step: 0.91, action: 'connectors_timeout', description: 'Connectors timeout after resume (15s) — proceeding' });
          }
        } catch (e) {
          history.push({ step: 0.91, action: 'connectors_check_failed', description: 'Connectors check (resume) failed: ' + e.message });
        }
          } else {
            history.push({ step: 0.9, action: 'capture_session', description: 'No session_id in localStorage yet (chat may still be initializing)' });
          }
        } catch (e) {
          history.push({ step: 0.9, action: 'capture_session', description: 'Capture session failed: ' + e.message });
        }
      }
    }

    // ── Loop principal ──────────────────────────────────────────────────────
    let stoppedByUser = false;
    let timeBudgetHit = false;
    let targetReached = false;

    for (let step = 1; step <= maxSteps; step++) {
      const elapsed = Date.now() - START;
      if (step % 5 === 0) console.log(`[bugHunterRun] Step ${step}, elapsed ${(elapsed/1000).toFixed(1)}s, asked ${cumulativeQuestionsSent + questionsSent}, answered ${cumulativeQuestionsAnswered + questionsAnswered}, findings ${cumulativeFindings + findings.length}`);
      // Stop check (modo continuo): rele o registro a cada 5 passos.
      if (continuous && step % 5 === 0) {
        try {
          const rec = (await withTimeout(base44.asServiceRole.entities.BugHunterRun.filter({ run_id: runId }), SDK_TIMEOUT_MS, 'stop_check'))[0];
          if (rec && rec.stop_requested) {
            stoppedByUser = true;
            history.push({ step, action: 'stopped', description: 'Stop requested by user — ending chunk' });
            break;
          }
        } catch (e) { /* best-effort */ }
      }
      // Orcamento de tempo (todos os modos): termina em ~230s para deixar margem
      // segura sob o limite de 5min (300s) da plataforma e sempre persistir o resultado.
      // STALL DETECTION: se passou 90s sem ler uma resposta nova, chat provavelmente travou
      const timesSinceLastRead = questionsAnswered > 0 ? (Date.now() - START) - (questionsAnswered * 5000) : 0;  // estimate
      if (questionsAnswered > 0 && (Date.now() - START) > 90000 && questionsAnswered === questionsAnswered) {
        // Se estamos enviando mas não lendo respostas, pode estar preso
        if (questionsSent > questionsAnswered + 3) {
          history.push({ step, action: 'stall_detected', description: 'Stall detected: ' + (questionsSent - questionsAnswered) + ' questions unanswered for >90s — stopping to persist' });
          break;
        }
      }
      if ((Date.now() - START) > TIME_BUDGET_MS) {
        timeBudgetHit = true;
        console.log('[bugHunterRun] TIME_BUDGET_HIT at step ' + step + ', elapsed ' + (Date.now() - START) + 'ms');
      history.push({ step, action: 'time_budget', description: 'Time budget reached (' + TIME_BUDGET_MS + 'ms)' + (continuous ? ' — will request next chunk' : ' — finishing run') });
        break;
      }
      // Meta de perguntas (modo continuo): para ao alcancar o alvo acumulado.
      if (continuous && targetQuestions > 0 && (cumulativeQuestionsAnswered + questionsAnswered) >= targetQuestions) {
        targetReached = true;
        history.push({ step, action: 'target_reached', description: 'Target questions reached (' + targetQuestions + ')' });
        break;
      }

      if (justSentMessage) {
        try { await callMcp('browser_wait_for', { time: 6 }); } catch (e) { /* best-effort */ }
      }
      let snapshotText = '(snapshot failed)';
      let consoleErrors = [];
      try {
        snapshotText = extractSnapshotText(await callMcp('browser_snapshot', {}));
      } catch (e) {
        const msg = String(e.message || e);
        if (/MCP timeout/.test(msg)) {
          history.push({ step, action: 'snapshot_timeout', description: 'Snapshot timed out (' + MCP_CALL_TIMEOUT_MS + 'ms) — ending run to persist' });
          break;
        }
        /* non-fatal: keep going with default snapshotText */
      }
      // Hard-stop: se ja passamos de 250s, persiste agora (nao espera a proxima iteracao).
      if ((Date.now() - START) > 250000) {
        console.log('[bugHunterRun] HARD_STOP at step ' + step + ', elapsed ' + (Date.now() - START) + 'ms, asked ' + (cumulativeQuestionsSent + questionsSent));
      history.push({ step, action: 'hard_stop', description: 'Hard stop at >150s — persisting now' });
        break;
      }
      if (justSentMessage && transcript.length > 0) {
        questionsAnswered++;
        const lastEntry = transcript[transcript.length - 1];
        if (lastEntry && !lastEntry.response_evidence) {
          lastEntry.response_evidence = snapshotText.slice(-1500);
          lastEntry.read_step = step;
        }
      }
      // Reseta justSentMessage APOS ler a resposta (snapshot).
      // Também reseta domFallbackFailCount — a pergunta anterior foi lida com sucesso.
      domFallbackFailCount = 0; Sem isto, o LLM
      // envia no passo N (justSentMessage=true), le a resposta no passo N+1, mas
      // justSentMessage continua true -> double_send_prevented bloqueia o proximo
      // envio legítimo, desperdicando steps e fazendo parecer "travado".
      justSentMessage = false;
      try { consoleErrors = extractConsoleErrors(await callMcp('browser_console_messages', { level: 'error' })); } catch (e) { /* non-fatal */ }
      const consoleErrorsText = consoleErrors.map((m) => '[' + (m.type || 'error') + '] ' + (m.text || '')).join('\n').slice(0, 2000) || '(none)';
      const refs = extractElementRefs(snapshotText);

      // Pre-LLM hard stop: o InvokeLLM pode levar ate 60s. Se estamos alem de
      // 170s, nao inicia o LLM — persiste agora para nao ser morto pelo limite
      // de 300s da plataforma no meio do persist final.
      if ((Date.now() - START) > 220000) {
        history.push({ step, action: 'pre_llm_stop', description: 'Hard stop before LLM (>120s) — persisting now' });
        break;
      }
      let decision = null;
      // Heartbeat: persiste updated_date ANTES do InvokeLLM (que pode levar 45s).
      // Sem isto, o frontend nao ve progresso durante o LLM e o watchdog dispara.
      if (runRecordId) {
        try {
          await withTimeout(base44.asServiceRole.entities.BugHunterRun.update(runRecordId, {
            questions_sent: cumulativeQuestionsSent + questionsSent,
            questions_answered: cumulativeQuestionsAnswered + questionsAnswered,
            findings_count: cumulativeFindings + findings.length,
            history: JSON.stringify(history.slice(-12), null, 2),
          }), SDK_TIMEOUT_MS, 'heartbeat');
        } catch (e) { /* best-effort */ }
      }
      try {
        const promptFn = finalMode === 'conversation' ? buildConversationPrompt : buildPrompt;
        const llmRes = await withTimeout(
          base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt: promptFn(targetUrl, scenario, history.slice(-MAX_HISTORY_ITEMS), snapshotText, consoleErrorsText, { loginEmail: finalLoginEmail, loginPassword: finalLoginPassword }, refs, priorQuestions),
            response_json_schema: DECISION_SCHEMA,
          }),
          45000,  // Aumentado de 30s para 45s (prompt pode crescer em modo continuo)
        );
        decision = llmRes;
      } catch (e) {
        history.push({ step, action: 'llm_decision', description: 'LLM call failed', error: e.message });
        break;
      }

      if (!decision || typeof decision !== 'object') {
        history.push({ step, action: 'llm_decision', description: 'LLM returned invalid decision', error: 'invalid' });
        break;
      }

      // Bug detection — dedupe by title signature.
      if (decision.bug_detected && decision.bug && decision.bug.title) {
        if (finalMode === 'conversation' && !justSentMessage) {
          history.push({ step, action: 'bug_suppressed', description: 'bug_detected ignored: conversation mode + no assistant response read yet (send/navigate step)' });
        } else {
          const sig = String(decision.bug.title).toLowerCase().slice(0, 60);
          const responseEvidence = snapshotText.slice(-1500);
          const _bugText = (String(decision.bug.title) + ' ' + String(decision.bug.description || '') + ' ' + String(decision.bug.actual || '') + ' ' + String(decision.bug.expected || '')).toLowerCase();
          if (/50[234]|bad gateway|about:blank/.test(_bugText)) {
            history.push({ step, action: 'infra_skip', description: 'Bug ignored: infra 502/503/504/about:blank (not a MemoryOS bug)' });
          } else if (/chat input (field )?(not found|missing|inaccessible|not visible|not present|not available)|input field (not found|missing|inaccessible)|cannot find (the )?(chat )?input|no (chat )?input (field|element|area)/.test(_bugText)) {
            history.push({ step, action: 'self_limitation_skip', description: 'Bug ignored: hunter self-limitation (chat input not found = ran out of steps / did not reach chat page, not a MemoryOS bug)' });
          } else if (!reportedBugSignatures.has(sig)) {
            reportedBugSignatures.add(sig);
            const b = decision.bug;
            try {
              const finding = await withTimeout(base44.entities.BugFinding.create({
                run_id: runId,
                target_url: targetUrl,
                title: b.title,
                description: b.description || '',
                severity: b.severity || 'medium',
                category: b.category || 'functional',
                steps_to_reproduce: JSON.stringify(history.map((h) => ({ step: h.step, action: h.action, description: h.description })), null, 2),
                expected: b.expected || '',
                actual: '[CAPTURED PAGE CONTENT (last 1500 chars of snapshot)]\n' + responseEvidence + '\n\n[LLM ANALYSIS]\n' + (b.actual || ''),
                console_errors: consoleErrors.map((m) => m.text || '').join('\n').slice(0, 4000),
                status: 'open',
              }), SDK_TIMEOUT_MS, 'finding_create');
              findings.push({ id: finding.id, title: finding.title, severity: finding.severity, category: finding.category });
            } catch (e) { /* finding creation failed; continue exploring */ }
          }
        }
      }

      // Done handling: modo continuo ignora "done" (continua ate tempo/alvo/stop).
      if (decision.done) {
        if (continuous) {
          // PATCH 14: Continuous mode SEMPRE ignora done
          history.push({ step, action: 'done_ignored', description: 'Continuous mode: LLM done ignored (continues until target/stop/time budget)' });
          // NÃO FAZER BREAK em modo contínuo!
        } else if (questionsAnswered < MIN_QUESTIONS) {
          history.push({ step, action: 'done_blocked', description: 'Premature done BLOCKED: only ' + questionsAnswered + '/' + MIN_QUESTIONS + ' questions answered. Forcing continuation.' });
          // NÃO FAZER BREAK até atingir MIN_QUESTIONS!
        } else {
          history.push({ step, action: 'done', description: decision.reasoning || 'Agent signaled completion' });
          break;  // OK: somente break quando conditions estão OK (explore mode + MIN_QUESTIONS atingido)
        }
      }

      const na = decision.next_action;

      // PATCH 13: Força preenchimento de 'text' em browser_type
      if (na && na.tool === 'browser_type' && !na.text) {
        history.push({ step, action: 'browser_type_skipped', description: 'browser_type tool selected but next_action.text was empty — LLM did not provide the text to type. Skipping this action.' });
        na.tool = 'none';  // força 'none' para não executar sem texto
