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

const PLAYWRIGHT_SERVER_NAME = 'playwright-bug-hunter';
const MAX_SNAPSHOT_CHARS = 4000;
const MAX_HISTORY_ITEMS = 12;

const DECISION_SCHEMA = {
  type: 'object',
  properties: {
    reasoning: { type: 'string', description: 'Brief reasoning about the current page state and what to do next' },
    next_action: {
      type: 'object',
      properties: {
        tool: { type: 'string', enum: ['browser_navigate', 'browser_click', 'browser_type', 'browser_snapshot', 'browser_go_back', 'browser_press', 'none'] },
        args: { type: 'object', description: 'Tool arguments, e.g. { url }, { element, ref }, { element, ref, text }, { key }' },
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
    'AVAILABLE PLAYWRIGHT MCP TOOLS (use these in next_action.tool):',
    '- browser_navigate   args: { url }                  -> open a URL',
    '- browser_click      args: { element, ref }         -> click an element (ref comes from the snapshot)',
    '- browser_type       args: { element, ref, text }  -> type text into an input',
    '- browser_press      args: { key }                 -> press a keyboard key',
    '- browser_snapshot   args: {}                      -> re-read the page structure',
    '- browser_go_back    args: {}                      -> go back to previous page',
    '- none               args: {}                      -> do nothing this step',
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

function buildConversationPrompt(targetUrl, scenario, history, snapshotText, consoleErrorsText, ctx) {
  const historyText = history.map((h) => `${h.step}. ${h.action}: ${h.description}${h.error ? ' [ERROR: ' + h.error + ']' : ''}`).join('\n') || '(none yet)';
  const loginHint = (ctx && ctx.loginEmail && ctx.loginPassword)
    ? '\nLOGIN CREDENTIALS (use them if you encounter a login page): email="' + ctx.loginEmail + '" password="' + ctx.loginPassword + '". Fill the email field, click continue/next, fill the password field, then submit. Do NOT report the login flow itself as a bug.'
    : '\nNo login credentials were provided. If the app requires login, report it as a bug (category: auth) and set done=true.';
  const goal = scenario || "Test the MemoryOS chat by having a multi-turn conversation. Ask varied questions that probe the user's memory: personal facts, past decisions, tasks, topics, entities. Evaluate whether each assistant response demonstrates continuity (cites prior context), is not empty or broken, and contains no errors.";
  return [
    'You are an autonomous QA agent ("Bug Hunter") testing a chat application called MemoryOS.',
    'Your job is to have a natural multi-turn CONVERSATION with the app to find bugs. You do NOT need anyone to feed you questions - you generate the questions yourself based on the conversation so far.',
    '',
    'TARGET URL: ' + targetUrl,
    'CONVERSATION GOAL: ' + goal,
    loginHint,
    '',
    'AVAILABLE PLAYWRIGHT MCP TOOLS (use these in next_action.tool):',
    '- browser_navigate   args: { url }                  -> open a URL',
    '- browser_click      args: { element, ref }         -> click an element (ref comes from the snapshot)',
    '- browser_type       args: { element, ref, text }   -> type text into the chat input field',
    '- browser_press      args: { key }                  -> press a key (use "Enter" to send a chat message)',
    '- browser_snapshot   args: {}                       -> re-read the page structure (use AFTER sending a message to read the assistant response)',
    '- browser_go_back    args: {}                      -> go back to previous page',
    '- none               args: {}                       -> do nothing this step',
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
    'TASK (autonomous - you decide what to ask, nobody feeds you questions):',
    '1. If you are on a login page, log in using the provided credentials. If no credentials were provided and login is required, report it as a bug (category: auth) and set done=true.',
    '2. If you are NOT yet in the chat: navigate to the chat page (usually the URL path "/chat") or click the chat entry point in the UI.',
    '3. If the assistant has JUST responded to your last question: EVALUATE the response. A bug is any of: empty/blank response, an error message shown to the user, a response that does NOT demonstrate memory continuity (e.g. "I do not have access to that" when it should remember), broken or missing UI elements, or console errors. If you find one, set bug_detected=true with full details (title, severity, category, expected vs actual). Do NOT report the same bug twice.',
    '4. If you have not asked a question yet, or want a follow-up: generate a question YOURSELF that probes the user memory (personal facts, past decisions, tasks, entities, timeline). Make follow-up questions build on the previous answer to test whether the app remembers the conversation. Type the question into the chat input and press Enter to send.',
    '5. After sending a message, set next_action.tool to browser_snapshot so you can read the response on the next step. NEVER send two messages in a row without reading the response in between.',
    '6. Set done=true after you have asked and evaluated several questions (roughly half of maxSteps turns) or if the chat is completely broken.',
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
    if (!targetUrl) return Response.json({ error: 'Missing required field: targetUrl' }, { status: 400 });

    const servers = await base44.asServiceRole.entities.MCPServerConfig.filter({ name: PLAYWRIGHT_SERVER_NAME });
    if (servers.length === 0) return Response.json({ error: "MCPServerConfig '" + PLAYWRIGHT_SERVER_NAME + "' not found" }, { status: 404 });
    const serverId = servers[0].id;

    const runId = 'bugHunter_' + Date.now();
    const callMcp = async (toolName, args = {}) => {
      const res = await base44.functions.invoke('mcpClientCall', { serverId, action: 'call', toolName, arguments: args });
      const data = res?.data ?? res;
      if (data?.error) throw new Error(String(data.error));
      return data?.result ?? data;
    };

    // Navigate with retry — descarta 502 transitório (cold-start do Base44) antes de falhar.
    const navigateWithRetry = async (url, attempts = 3) => {
      let lastErr = null;
      for (let i = 0; i < attempts; i++) {
        try {
          return await callMcp('browser_navigate', { url });
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

    for (let step = 1; step <= maxSteps; step++) {
      // Gather page context
      let snapshotText = '(snapshot failed)';
      let consoleErrors = [];
      try { snapshotText = extractSnapshotText(await callMcp('browser_snapshot', {})); } catch (e) { /* non-fatal */ }
      try { consoleErrors = extractConsoleErrors(await callMcp('browser_console_messages', { level: 'error' })); } catch (e) { /* non-fatal */ }
      const consoleErrorsText = consoleErrors.map((m) => '[' + (m.type || 'error') + '] ' + (m.text || '')).join('\n').slice(0, 2000) || '(none)';

      // LLM decision
      let decision = null;
      try {
        const promptFn = mode === 'conversation' ? buildConversationPrompt : buildPrompt;
        const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: promptFn(targetUrl, scenario, history.slice(-MAX_HISTORY_ITEMS), snapshotText, consoleErrorsText, { loginEmail, loginPassword }),
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
        if (!reportedBugSignatures.has(sig)) {
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

      // Execute next action
      const na = decision.next_action;
      if (na && na.tool && na.tool !== 'none') {
        try {
          const args = na.args || {};
          const result = na.tool === 'browser_navigate' && args.url
            ? await navigateWithRetry(args.url)
            : await callMcp(na.tool, args);
          history.push({ step, action: na.tool, description: na.description || '', args });
        } catch (e) {
          history.push({ step, action: na.tool, description: na.description || '', error: e.message });
        }
      } else {
        history.push({ step, action: 'none', description: 'No action' });
      }
    }

    // Close browser to free RAM on the VPS
    try { await callMcp('browser_close', {}); } catch (e) { /* best-effort */ }

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