const TEMPORAL_DIRECT = ["hoje","today","amanha","tomorrow","ontem","yesterday","semana","week","mes","month","ano","year","segunda","terca","quarta","quinta","sexta","sabado","domingo"];
const EVENT_TYPES = ["reuniao","reunioes","meeting","compromisso","compromissos","evento","eventos","event","events","agendamento","lembrete","reminder","call","chamada"];
const TIME_REFS = ["hora","horario","schedule","agenda","calendario","calendar"];
const RELATIVE_PHRASES = ["esta semana","proximo","proxima","next","fim de semana","fds"];
const MIN_SCORE_THRESHOLD = 0.20;

function firstMatch(lower, list) {
  for (const s of list) {
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "u");
    if (pattern.test(lower)) return s;
  }
  return null;
}
function score(lower) {
  let s = 0;
  if (firstMatch(lower, TEMPORAL_DIRECT)) s += 0.15;
  if (firstMatch(lower, EVENT_TYPES)) s += 0.35;
  if (firstMatch(lower, TIME_REFS)) s += 0.20;
  if (firstMatch(lower, RELATIVE_PHRASES)) s += 0.15;
  return Math.min(s, 1.0);
}

// Usando as palavras EXATAS (sem acento) que existem de verdade no arquivo
const cases = [
  { msg: "quais são minhas tarefas de hoje?", expectTrigger: false },
  { msg: "resuma o que conversamos essa semana", expectTrigger: false },
  { msg: "o que devo priorizar hoje?", expectTrigger: false },
  { msg: "pesquise as noticias de hoje sobre X", expectTrigger: false },
  { msg: "tenho reuniao hoje?", expectTrigger: true },
  { msg: "qual e minha agenda de amanha?", expectTrigger: true },
  { msg: "que compromissos tenho essa semana?", expectTrigger: true },
  { msg: "confira meu calendario", expectTrigger: true },
];
let allPass = true;
for (const c of cases) {
  const lower = c.msg.toLowerCase();
  const sc = score(lower);
  const triggered = sc >= MIN_SCORE_THRESHOLD;
  const pass = triggered === c.expectTrigger;
  if (!pass) allPass = false;
  console.log(`${pass ? 'OK ' : 'FALHOU'} | score=${sc.toFixed(2)} | dispara=${triggered} | "${c.msg}"`);
}
console.log(allPass ? "\nTODOS OS CASOS PASSARAM" : "\nALGUM CASO FALHOU");
