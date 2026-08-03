function checkDesvio(serviceId, hasConnector) {
  const _earlyService = serviceId ? { id: serviceId } : null;
  // NOVA condicao (corrigida)
  return Boolean(_earlyService && _earlyService.id === "ai" && hasConnector);
}

const cases = [
  ["ler email", "email", true, false],
  ["quais meus eventos", "agenda", true, false],
  ["traduz isso pra ingles", "ai", true, true],
  ["resume esse texto", "ai", true, true],
  ["lista meus documentos", "documents", true, false],
];

let allPass = true;
for (const [msg, serviceId, hasConnector, expected] of cases) {
  const got = checkDesvio(serviceId, hasConnector);
  const pass = got === expected;
  if (!pass) allPass = false;
  console.log(pass ? 'OK ' : 'FALHOU', '| esperado:', expected, '| deu:', got, '|', msg, `(servico: ${serviceId})`);
}
console.log(allPass ? 'TODOS PASSARAM' : 'ALGUM FALHOU');
