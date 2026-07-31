function normalize(text) {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const PATTERNS = [
  /mostr(e|a|ar)\s+.{0,15}conteudo/,
  /conteudo\s+(completo|inteiro|integral)/,
  /documento\s+(completo|inteiro)/,
  /arquivo\s+(completo|inteiro)/,
  /texto\s+completo/,
  /na\s+integra/,
  /o\s+que\s+tem\s+(no|nesse|neste)\s+(documento|arquivo)/,
  /le(ia|r)\s+o\s+documento\s+inteiro/,
];

function detectFullDocumentRequest(message) {
  const norm = normalize(message);
  return PATTERNS.some((p) => p.test(norm));
}

const cases = [
  ['me mostre o conteúdo', true],
  ['mostra o conteúdo desse arquivo', true],
  ['quero o conteúdo completo', true],
  ['me mostra o documento inteiro', true],
  ['o que tem nesse documento?', true],
  ['leia o documento inteiro pra mim', true],
  ['na íntegra, o que diz o contrato?', true],
  ['quais são minhas tarefas pendentes?', false],
  ['resuma o documento', false],  // resumo != conteudo completo, intencional
  ['o que você acha desse documento?', false],
  ['mostra minhas decisões', false],
];

let allPass = true;
for (const [msg, expected] of cases) {
  const got = detectFullDocumentRequest(msg);
  const pass = got === expected;
  if (!pass) allPass = false;
  console.log(pass ? 'OK ' : 'FALHOU', '| esperado:', expected, '| deu:', got, '|', msg);
}
console.log(allPass ? 'TODOS PASSARAM' : 'ALGUM FALHOU');
