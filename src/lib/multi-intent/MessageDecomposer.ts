/**
 * MessageDecomposer.ts — Motor de Múltiplas Intenções (Parte 4: Decompositor v1)
 *
 * ATENÇÃO: esta é, deliberadamente, a peça mais arriscada do motor —
 * diferente dos providers do Search Engine (que reconhecem palavras-
 * chave específicas com boa precisão), separar uma frase em múltiplos
 * pedidos de forma confiável, sem LLM, é bem mais sujeito a erro. Esta
 * é a primeira versão; espera-se precisar de ajuste depois de testes
 * reais (Parte 5).
 *
 * Estratégia: divide por separadores fortes — pontuação de fim de
 * frase, ponto e vírgula, conectores explícitos ("e depois", "e
 * também"), e vírgula seguida de verbo de comando reconhecido (com ou
 * sem "e" no meio: ", confere" e ", e confere" ambos separam).
 *
 * Deliberadamente CONSERVADOR: na dúvida, NÃO separa — um "e" ligando
 * substantivos (ex: "servidor mcp e conector") ou dentro de um nome
 * próprio não deve quebrar a frase.
 */

import type { DecomposedIntent } from "./IntentTypes";

const COMMAND_VERBS = [
  "verifica", "verifique", "confere", "confira", "agenda", "agende",
  "manda", "mande", "envia", "envie", "le", "lê", "leia", "resume",
  "resuma", "pesquisa", "pesquise", "cria", "crie", "abre", "abra",
  "busca", "busque", "procura", "procure", "lista", "liste", "deleta",
  "delete", "exclui", "exclua", "renomeia", "renomeie", "copia", "copie",
  "move", "mova", "baixa", "baixe", "desconecta", "desconecte",
  "conecta", "conecte", "adiciona", "adicione", "existe", "tem",
].join("|");

const SEPARATOR_RE = new RegExp(
  // FIX: "ponto + maiúscula" era genérico demais — quebrava o corpo do email
  // ("Assunto: Ola.\n\nOlá, tudo bem" virava 2 fragmentos, separando o corpo
  // do comando). Agora só separa se a próxima palavra for um verbo de comando.
  `\\.\\s+(?=(?:${COMMAND_VERBS})\\b)` +
  // FIX: verbo de comando no início de linha (após linha em branco) separa —
  // "Anderson Pires\n\nliste meus arquivos" separa o "liste" como 2ª intenção
  // sem quebrar o corpo do email (que não tem linha em branco + comando).
  `|\\n\\s*\\n(?=(?:${COMMAND_VERBS})\\b)` +
  "|;\\s*" +
  "|\\s+e\\s+depois\\s+" +
  "|\\s+e\\s+tamb[ée]m\\s+" +
  "|\\s+depois\\s+disso\\s*,?\\s*" +
  `|,\\s+(?:e\\s+)?(?=(?:${COMMAND_VERBS})\\b)` +
  // FIX: " e " + verbo de comando (sem vírgula) também separa — evita que
  // "...corpo X e liste meus arquivos" vaze a 2ª intenção no corpo do email.
  `|\\s+e\\s+(?=(?:${COMMAND_VERBS})\\b)`,
  "gi"
);

const MIN_FRAGMENT_LENGTH = 3;

export function decomposeMessage(message: string): DecomposedIntent[] {
  if (!message || !message.trim()) return [];

  const fragments = message
    .split(SEPARATOR_RE)
    .map((f) => f.trim())
    .filter((f) => f.length >= MIN_FRAGMENT_LENGTH);

  if (fragments.length <= 1) {
    return [{ id: "intent-0", text: message.trim(), order: 0 }];
  }

  return fragments.map((text, i) => ({ id: `intent-${i}`, text, order: i }));
}