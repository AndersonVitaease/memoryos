function tryRecoverResultFromError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  const jsonStart = msg.indexOf('{');
  if (jsonStart === -1) return null;
  try {
    const parsed = JSON.parse(msg.slice(jsonStart));
    if (parsed && typeof parsed === 'object' && 'result' in parsed && !('error' in parsed)) {
      return parsed.result;
    }
  } catch {}
  return null;
}

// Caso real: erro com resultado de sucesso embutido
const err1 = new Error('Error POSTing to endpoint: {"id":1,"jsonrpc":"2.0","result":{"tools":[{"name":"create_draft","description":"..."}]}}');
const r1 = tryRecoverResultFromError(err1);
console.log('Caso 1 (deve recuperar):', r1 ? 'RECUPEROU, tools: ' + r1.tools.length : 'NAO RECUPEROU', r1 ? 'OK' : 'FALHOU');

// Caso real de erro de verdade (nao deve recuperar) - do proprio search que fizemos antes
const err2 = new Error('Error POSTing to endpoint (HTTP 401): {"jsonrpc":"2.0","error":{"code":-32000,"message":"Bad Request: Server not initialized"},"id":null}');
const r2 = tryRecoverResultFromError(err2);
console.log('Caso 2 (NAO deve recuperar, erro real):', r2, r2 === null ? 'OK' : 'FALHOU');

// Caso de erro sem JSON nenhum
const err3 = new Error('Network timeout');
const r3 = tryRecoverResultFromError(err3);
console.log('Caso 3 (sem JSON, NAO deve recuperar):', r3, r3 === null ? 'OK' : 'FALHOU');
