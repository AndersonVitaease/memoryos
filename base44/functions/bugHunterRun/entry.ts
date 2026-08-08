/**
 * bugHunterRun — Orquestrador autonomo do Bug Hunter.
 *
 * Loop LLM + Playwright MCP que navega o app publicado, interage com a pagina,
 * detecta bugs (erros de console, fluxos quebrados, anomalias visuais) e cria
 * registros em BugFinding. Cada passo:
 *   1. browser_snapshot   -> ler arvore de acessibilidade (estado da pagina)
 *   2. browser_console_messages -> capturar erros de JS
 *   3. InvokeLLM           -> decide proxima acao + detecta bug (JSON estruturado)
 *   4. executar acao       -> browser_click / browser_type / browser_navigate / ...
 *   5. se bug detectado    -> criar BugFinding (dedupe por titulo)
 * Termina quando o LLM sinaliza done ou atinge maxSteps. Fecha o browser no fim
 * para liberar RAM na VPS.
 *
 * Admin-only: cria dados e dirige um browser remoto.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { connect as mcpConnect, resolveHeaders as mcpResolveHeaders, tryRecoverResultFromError } from '../../shared/mcpClient.ts';

const PLAYWRIGHT_SERVER_NAME = 'playwright-bug-hunter';
const MAX_SNAPSHOT_CHARS = 12000;
const MAX_HISTORY_ITEMS = 12;

const MEMORYOS_ARCHITECTURE_BRIEF = [
  'MEMORYOS ARCHITECTURE — CONNECTORS AND CAPABILITIES TO PROBE AUTONOMOUSLY:',
  'The MemoryOS chat routes user requests to external connectors. Each connector has capabilities. When a user asks the chat to do something, the planner should route to the RIGHT connector. Your job is to probe EACH connector by asking the chat to perform a representative capability, then evaluate the response.',
  '',
  'CONNECTORS:',
  '1. Google Workspace (Gmail: readInbox/sendEmail, Drive: listFiles/downloadFile/uploadFile/createFolder/delete/rename, Calendar: listEvents/createEvent, Profile)',
  '2. Microsoft 365 (Outlook Mail: readInbox/sendEmail, Outlook Calendar: listEvents/createEvent, OneDrive: listFiles/downloadFile, Contacts, Excel, Word, PowerPoint, OneNote, Teams, SharePoint, ToDo)',
  '3. GitHub (searchCode, listRepos, readRepo, createIssue)',
  '4. WhatsApp (sendMessage)',
  '5. Memori/Mem0 MCP (remember, recall)',
  '6. Stirling-PDF (rotate, merge, split, extractText, passwordProtect)',
  '',
  'BUG CRITERIA (report a finding when ANY of these happen):',
  '- RAW internal error exposed to user (e.g. "token not configured", "[connector.capability] error", stack traces, JSON error objects) instead of a friendly "you need to connect X" message.',
  '- WRONG CONNECTOR ROUTING: the chat routes to the wrong connector (e.g. runs a Gmail function when asked about Outlook/Microsoft 365).',
  '- Empty or blank response from the assistant.',
  '- Response that does NOT demonstrate memory continuity (ignores prior context).',
  '- Console JavaScript errors.',
  '- BEHAVIOR BUG / TEIMOSIA: the assistant REFUSES to repeat or re-run an action when the user explicitly asks again, claiming it already did ("ja pesquisei", "pesquisei 3 vezes", "ja respondi", "nao preciso pesquisar de novo", "I already searched"). The correct behavior is to re-execute or re-search when the user requests it again, not to argue. This is a BEHAVIOR bug (category: functional), not an error. Detect it especially when the CONVERSATION GOAL is a repetition test.',
  '',
  'NOTE: An integration not being connected is NOT a bug by itself. But if the chat shows a raw technical error string instead of guiding the user to connect, THAT is a bug (error exposure).'
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
    bug_detected: { type: 'boolean', description: 'true if a bug was found on the current page' },
    bug: {
      type: 'object',
      description: 'Bug details (only when bug_detected=true)',
      properties: {
        title: { type: 'string' },
        severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
        description: { type: 'string' },
        category: { type: 'string', enum: ['ui', 'functional', 'broken_flow', 'error', 'performance', 'auth', 'data', 'other'] },
        expected: { type: 'string' },
        actual: { type: 'string' }
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
  // Textarea do chat (placeholder "Converse com sua memoria...")
  const chatMatch = snapshotText.match(/(?:textbox|input|textarea)[^\n]*?(?:Converse|memoria|mensagem)[^\n]*?\[ref=(\w+)\]/i);
  if (chatMatch) refs.chatInput = chatMatch[1];
  // Campos de login — non-greedy [^\n]*? captura o PRIMEIRO ref apos o label,
  // nao o ultimo ref da linha (greedy pegava o ref do link "Cadastre-se").
  const emailMatch = snapshotText.match(/(?:textbox|input)[^\n]*?(?:email|e-mail)[^\n]*?\[ref=(\w+)\]/i);
  if (emailMatch) refs.email = emailMatch[1];
  const passwordMatch = snapshotText.match(/(?:textbox|input)[^\n]*?(?:password|senha)[^\n]*?\[ref=(\w+)\]/i);
  if (passwordMatch) refs.password = passwordMatch[1];
  const submitMatch = snapshotText.match(/(?:button)[^\n]*?(?:Entrar|Login|Sign in|Acessar|Continuar|Acessar conta|Entrar na conta)[^\n]*?\[ref=(\w+)\]/i);
  if (submitMatch) refs.submit = submitMatch[1];
  return refs;
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

function buildConversationPrompt(targetUrl, scenario, history, snapshotText, consoleErrorsText, ctx, refs) {
  const _refs = refs || {};
  const historyText = history.map((h) => `${h.step}. ${h.action}: ${h.description}${h.error ? ' [ERROR: ' + h.error + ']' : ''}`).join('\n') || '(none yet)';
  const loginHint = (ctx && ctx.loginEmail && ctx.loginPassword)
    ? '\nLOGIN CREDENTIALS (use them if you encounter a login page): email="' + ctx.loginEmail + '" password="' + ctx.loginPassword + '". Fill the email field, click continue/next, fill the password field, then submit. Do NOT report the login flow itself as a bug.'
    : '\nNo login credentials were provided. If the app requires login, report it as a bug (category: auth) and set done=true.';
  const goal = scenario || "Autonomously probe the MemoryOS chat by asking targeted questions about EACH connector and capability listed in the ARCHITECTURE BRIEF. For each connector, ask ONE question that exercises a representative capability, evaluate the response against the BUG CRITERIA, then move to the next connector. Cover ALL connectors — do not stop after finding one bug.";
  return [
    'You are an autonomous QA agent ("Bug Hunter") testing a chat application called MemoryOS.',
    'Your job is to have a natural multi-turn CONVERSATION with the app to find bugs. You do NOT need anyone to feed you questions - you generate the questions yourself based on the conversation so far.',
    '',
    'TARGET URL: ' + targetUrl,
    'CONVERSATION GOAL: ' + goal,
    loginHint,
    '',
    MEMORYOS_ARCHITECTURE_BRIEF,
    '',
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
    'CONVERSATION HISTORY SO FAR:',
    historyText,
    '',
    'CURRENT PAGE SNAPSHOT (accessibility tree; element refs like ref="s1e2" are clickable targets; look for the chat input textarea field):',
    snapshotText.slice(0, MAX_SNAPSHOT_CHARS),
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
    '- NEVER use browser_navigate to go to a URL you are already on. If the Page URL in the snapshot matches your target, INTERACT with the page (click/type) instead of navigating.',
    '- For browser_navigate: set next_action.url to the full URL. Without url the action is skipped.',
    '- For browser_click: set next_action.target to a ref from the snapshot (e.g. "s1e2"). Without target the action is skipped.',
    '- For browser_type: set next_action.target (ref from snapshot) AND next_action.text (the text to type). Without either, the action is skipped. Set next_action.submit=true to press Enter after typing.',
    '',
    'TASK (autonomous - you decide what to ask, nobody feeds you questions):',
    '1. LOGIN: If the DETECTED ELEMENT REFS above show an Email field AND Password field, log in: browser_type target="' + (_refs.email || '<email-ref>') + '" text="' + (ctx.loginEmail || '<email>') + '", then browser_type target="' + (_refs.password || '<password-ref>') + '" text="' + (ctx.loginPassword || '<password>') + '" submit=true. Then next step browser_snapshot. If no email/password refs detected, you are already logged in — skip to step 4. Do NOT report login as a bug.',
    '2. If you are NOT on a login page and NOT in the chat, use browser_navigate ONCE to reach the chat URL. Do not repeat the navigation.',
    '3. If the assistant has JUST responded to your last question: EVALUATE the response. A bug is any of: empty/blank response, an error message shown to the user, a response that does NOT demonstrate memory continuity, broken or missing UI elements, or console errors. If you find one, set bug_detected=true with full details. Do NOT report the same bug twice.',
    '4. PROBE EACH CONNECTOR: Work through the connectors listed in the ARCHITECTURE BRIEF above, ONE at a time. For each connector, ask the chat ONE question that exercises a representative capability (e.g. "voce consegue listar meus emails recentes do Outlook?" for Microsoft 365 Outlook, "quais arquivos voce encontra no meu Google Drive sobre X?" for Google Drive, "voce consegue criar um evento na minha agenda do Google Calendar?" for Calendar, "voce consegue buscar codigo no GitHub?" for GitHub). Ask ONE question at a time, wait for the response (browser_snapshot next step), evaluate it against the BUG CRITERIA, then move to the next connector. Do NOT combine multiple connectors into one question. Use browser_type with target="' + (_refs.chatInput || '<chat-input-ref>') + '" text="<your question>" submit=true to type and send the message in one step.',
    '5. After sending a message, set next_action.tool to browser_snapshot so you can read the response on the next step. NEVER send two messages in a row without reading the response in between.',
    '6. Set done=true ONLY when you have probed EVERY connector listed in the ARCHITECTURE BRIEF above. Finding a bug does NOT mean done — continue to the next connector. You have maxSteps turns; use them all to cover every connector. If the chat is completely broken (not just one error), then done=true.',
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
    const { targetUrl, maxSteps = 5, scenario, mode = 'explore', loginEmail, loginPassword } = body;
    const _envEmail = (typeof Deno !== 'undefined' && Deno.env) ? (Deno.env.get('BUGHUNTER_TEST_EMAIL') || '') : '';
    const _envPass = (typeof Deno !== 'undefined' && Deno.env) ? (Deno.env.get('BUGHUNTER_TEST_PASSWORD') || '') : '';
    const finalLoginEmail = loginEmail || _envEmail || undefined;
    const finalLoginPassword = loginPassword || _envPass || undefined;
    const finalMode = mode !== 'explore' ? mode : (_envEmail ? 'conversation' : 'explore');
    if (!targetUrl) return Response.json({ error: 'Missing required field: targetUrl' }, { status: 400 });

    const servers = await base44.asServiceRole.entities.MCPServerConfig.filter({ name: PLAYWRIGHT_SERVER_NAME });
    if (servers.length === 0) return Response.json({ error: "MCPServerConfig '" + PLAYWRIGHT_SERVER_NAME + "' not found" }, { status: 404 });
    const server = servers[0];

    // Connect to Playwright MCP ONCE — all tool calls share the same browser session.
    // Without this, each mcpClientCall creates a new session and browser_snapshot
    // sees about:blank (the page from a previous navigate is in a different session).
    const { headers, error: headerError } = mcpResolveHeaders(server);
    if (headerError) return Response.json({ error: headerError }, { status: 500 });

    let mcpSession = null;
    try {
      mcpSession = await mcpConnect(server.server_url, headers);
    } catch (e) {
      return Response.json({ error: 'MCP connect failed: ' + e.message, run_id: 'bugHunter_' + Date.now() }, { status: 502 });
    }

    const runId = 'bugHunter_' + Date.now();
    const callMcp = async (toolName, args = {}) => {
      let result;
      try {
        result = await mcpSession.client.callTool({ name: toolName, arguments: args });
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

    // Navigate with retry — descarta 502 transitório (cold-start do Base44) antes de falhar.
    // After successful navigate, wait 2s for SPA to render before snapshot.
    const navigateWithRetry = async (url, attempts = 3) => {
      let lastErr = null;
      for (let i = 0; i < attempts; i++) {
        try {
          const result = await callMcp('browser_navigate', { url });
          // Give the SPA time to render after navigation
          try { await callMcp('browser_wait_for', { time: 2 }); } catch (e) { /* best-effort */ }
          return result;
        } catch (e) {
          lastErr = e;
          const msg = String(e.message || e);
          // 502/503/504/transient — tenta de novo apos pausa curta
          if (/50[234]|Bad Gateway|timeout|ECONNRESET|ETIMEDOUT|fetch failed/i.test(msg) && i < attempts - 1) {
            await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
            continue;
          }
          throw e;
        }
      }
      throw lastErr;
    };

    const findings = [];
    const history = [];
    const reportedBugSignatures = new Set();
    const START = Date.now();

    // Step 0: navigate to target (com retry para descartar 502 transitório)
    try {
      await navigateWithRetry(targetUrl);
      history.push({ step: 0, action: 'browser_navigate', description: 'Navigated to ' + targetUrl });
    } catch (e) {
      return Response.json({ ok: false, error: 'Initial navigate failed: ' + e.message, run_id: runId, history }, { status: 502 });
    }

    // Deterministic login pre-step (conversation mode com credenciais).
    // O LLM e instavel em preencher login multi-campo; fazemos deterministicamente
    // quando detectamos email+password no snapshot inicial. Tambem espera 5s
    // para o SPA inicializar (conversation.isInitialized) antes do snapshot.
    if (finalMode === 'conversation' && finalLoginEmail && finalLoginPassword) {
      try {
        try { await callMcp('browser_wait_for', { time: 5 }); } catch (e) { /* best-effort */ }
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

    for (let step = 1; step <= maxSteps; step++) {
      // Gather page context
      let snapshotText = '(snapshot failed)';
      let consoleErrors = [];
      try { snapshotText = extractSnapshotText(await callMcp('browser_snapshot', {})); } catch (e) { /* non-fatal */ }
      try { consoleErrors = extractConsoleErrors(await callMcp('browser_console_messages', { level: 'error' })); } catch (e) { /* non-fatal */ }
      const consoleErrorsText = consoleErrors.map((m) => '[' + (m.type || 'error') + '] ' + (m.text || '')).join('\n').slice(0, 2000) || '(none)';
      const refs = extractElementRefs(snapshotText);

      // LLM decision
      let decision = null;
      try {
        const promptFn = finalMode === 'conversation' ? buildConversationPrompt : buildPrompt;
        const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: promptFn(targetUrl, scenario, history.slice(-MAX_HISTORY_ITEMS), snapshotText, consoleErrorsText, { loginEmail: finalLoginEmail, loginPassword: finalLoginPassword }, refs),
          response_json_schema: DECISION_SCHEMA,
        });
        decision = llmRes;
      } catch (e) {
        history.push({ step, action: 'llm_decision', description: 'LLM call failed', error: e.message });
        break;
      }

      if (!decision || typeof decision !== 'object') {
        history.push({ step, action: 'llm_decision', description: 'LLM returned invalid decision', error: 'invalid' });
        break;
      }

      // Bug detection (dedupe by title signature)
      if (decision.bug_detected && decision.bug && decision.bug.title) {
        const sig = String(decision.bug.title).toLowerCase().slice(0, 60);
        // INFRA FILTER: 502/503/504 Bad Gateway e about:blank sao falhas da
        // plataforma Base44 (cold-start/timeout do app publicado), nao bugs do
        // MemoryOS. Ignora silenciosamente em vez de criar BugFinding (ruido).
        const _bugText = (String(decision.bug.title) + ' ' + String(decision.bug.description || '') + ' ' + String(decision.bug.actual || '') + ' ' + String(decision.bug.expected || '')).toLowerCase();
        // INFRA FILTER: 502/503/504 Bad Gateway e about:blank sao falhas da
        // plataforma Base44 (cold-start/timeout do app publicado), nao bugs do
        // MemoryOS. Ignora silenciosamente em vez de criar BugFinding (ruido).
        if (/50[234]|bad gateway|about:blank/.test(_bugText)) {
          history.push({ step, action: 'infra_skip', description: 'Bug ignored: infra 502/503/504/about:blank (not a MemoryOS bug)' });
        }
        // SELF-LIMITATION FILTER: "chat input not found/missing/inaccessible"
        // e variantes sao falsos positivos do proprio hunter — ele acabou os
        // passos antes de chegar no chat, ou nao completou o login. O campo
        // de mensagem do ChatPage e um <textarea> normal (sempre presente).
        // Nao e bug do MemoryOS; e limitacao do robo. Ignora.
        else if (/chat input (field )?(not found|missing|inaccessible|not visible|not present|not available)|input field (not found|missing|inaccessible)|cannot find (the )?(chat )?input|no (chat )?input (field|element|area)/.test(_bugText)) {
          history.push({ step, action: 'self_limitation_skip', description: 'Bug ignored: hunter self-limitation (chat input not found = ran out of steps / did not reach chat page, not a MemoryOS bug)' });
        } else if (!reportedBugSignatures.has(sig)) {
          reportedBugSignatures.add(sig);
          const b = decision.bug;
          try {
            const finding = await base44.entities.BugFinding.create({
              run_id: runId,
              target_url: targetUrl,
              title: b.title,
              description: b.description || '',
              severity: b.severity || 'medium',
              category: b.category || 'functional',
              steps_to_reproduce: JSON.stringify(history.map((h) => ({ step: h.step, action: h.action, description: h.description })), null, 2),
              expected: b.expected || '',
              actual: b.actual || '',
              console_errors: consoleErrors.map((m) => m.text || '').join('\n').slice(0, 4000),
              status: 'open',
            });
            findings.push({ id: finding.id, title: finding.title, severity: finding.severity, category: finding.category });
          } catch (e) {
            // finding creation failed; continue exploring
          }
        }
      }

      if (decision.done) {
        history.push({ step, action: 'done', description: decision.reasoning || 'Agent signaled completion' });
        break;
      }

      // Execute next action — build args from flat fields (more reliable than nested object from LLM)
      const na = decision.next_action;
      if (na && na.tool && na.tool !== 'none') {
        // Construct args from flat fields based on tool type
        let args = {};
        if (na.tool === 'browser_navigate') {
          args = { url: na.url };
        } else if (na.tool === 'browser_click') {
          args = { target: na.target, element: na.element || '' };
        } else if (na.tool === 'browser_type') {
          args = { target: na.target, text: na.text, submit: na.submit === true };
        } else if (na.tool === 'browser_press_key') {
          args = { key: na.key };
        } else {
          // browser_snapshot, browser_navigate_back, browser_close — no args needed
        }
        const argsStr = JSON.stringify(args).slice(0, 300);
        try {
          if (na.tool === 'browser_navigate') {
            if (!args.url || typeof args.url !== 'string') {
              history.push({ step, action: na.tool, description: (na.description || '') + ' [skipped: no url]', args: argsStr });
            } else {
              await navigateWithRetry(args.url);
              history.push({ step, action: na.tool, description: na.description || '', args: argsStr });
            }
          } else if (na.tool === 'browser_click' || na.tool === 'browser_type') {
            if (!args.target || typeof args.target !== 'string') {
              history.push({ step, action: na.tool, description: (na.description || '') + ' [skipped: no target]', args: argsStr });
            } else {
              await callMcp(na.tool, args);
              history.push({ step, action: na.tool, description: na.description || '', args: argsStr });
            }
          } else {
            await callMcp(na.tool, args);
            history.push({ step, action: na.tool, description: na.description || '', args: argsStr });
          }
        } catch (e) {
          history.push({ step, action: na.tool, description: na.description || '', error: e.message, args: argsStr });
        }
      } else {
        history.push({ step, action: 'none', description: 'No action' });
      }
    }

    // Close browser to free RAM on the VPS, then terminate the MCP session
    try { await callMcp('browser_close', {}); } catch (e) { /* best-effort */ }
    try {
      if (mcpSession.transportUsed === 'streamable-http' && typeof mcpSession.transport.terminateSession === 'function') {
        await mcpSession.transport.terminateSession();
      }
      await mcpSession.client.close();
    } catch (e) { /* best-effort */ }

    return Response.json({
      ok: true,
      run_id: runId,
      targetUrl,
      stepsExecuted: history.length - 1,
      findingsCreated: findings.length,
      findings,
      history,
      durationMs: Date.now() - START,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}