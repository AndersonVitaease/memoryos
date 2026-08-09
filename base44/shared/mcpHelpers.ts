/**
 * mcpHelpers — Utilitarios compartilhados para funcoes backend que usam
 * Playwright MCP. Extraido para evitar duplicacao entre webConnectorConnect,
 * webConnectorDiscover e (futuro) bugHunterRun.
 *
 * Modulo plain — so exports, sem Deno.serve. Importado via:
 *   import { withTimeout, extractSnapshotText, extractRunCodeText, makeCallMcp } from '../../shared/mcpHelpers.ts';
 */

export function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('MCP timeout (' + ms + 'ms): ' + label)), ms)),
  ]);
}

// Extrai texto de um snapshot de acessibilidade do Playwright MCP.
// O resultado de browser_snapshot vem como { content: [{ text }] } ou string.
export function extractSnapshotText(snap) {
  if (!snap) return '(no snapshot)';
  if (Array.isArray(snap.content)) return snap.content.map((c) => c.text || '').join('\n');
  if (typeof snap === 'string') return snap;
  return JSON.stringify(snap);
}

// Extrai o valor de retorno de browser_run_code_unsafe / browser_evaluate.
// O callMcp ja desembrulha o resultado (structuredContent ?? content ?? result),
// entao `res` pode vir como array de content items, string, ou objeto cru.
// O tool as vezes envolve o retorno num bloco "### Result\n<valor>\n### ...".
export function extractRunCodeText(res) {
  let text;
  if (Array.isArray(res)) text = res.map((c) => c?.text || '').join('\n');
  else if (res && Array.isArray(res.content)) text = res.content.map((c) => c.text || '').join('\n');
  else if (typeof res === 'string') text = res;
  else text = JSON.stringify(res);
  const m = text.match(/### Result\n([\s\S]*?)(?:\n### |$)/);
  return m ? m[1].trim() : text.trim();
}

// Fabrica um callMcp(limitado por timeout) a partir de uma sessao MCP
// conectada. Centraliza o padrao de callTool + tryRecoverResultFromError +
// isError check que se repete em toda funcao que usa Playwright MCP.
export function makeCallMcp(mcpSession, timeoutMs, tryRecoverResultFromError) {
  return async function callMcp(toolName, args = {}) {
    let result;
    try {
      result = await withTimeout(mcpSession.client.callTool({ name: toolName, arguments: args }), timeoutMs, toolName);
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
}