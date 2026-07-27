/**
 * categoryRouter.js — fonte única de verdade para roteamento de
 * categoria → modelo do OpenRouter. Usado tanto pelo Sistema 1
 * (GoalRegistry, quando a frase bate num sinal exato) quanto pelo
 * Sistema 2 (memoryReasoningPlanner, fallback semântico via
 * serviceDetector).
 */

export const CATEGORY_RULES = [
  { pattern: /traduz|tradução|translate/i,                          model: "google/gemini-3.5-flash" },
  { pattern: /resum|summar/i,                                       model: "anthropic/claude-sonnet-5" },
  { pattern: /gramatica|ortografia|revisar texto|revise este texto/i, model: "openai/gpt-5.6-sol" },
  { pattern: /historia|roteiro(?!.*(video|vendas))|escrita criativa/i, model: "anthropic/claude-opus-5" },
  { pattern: /email formal|redija um email/i,                      model: "openai/gpt-5.6-sol" },
  { pattern: /parafrase|reescreva/i,                                model: "google/gemini-3.5-flash" },
  { pattern: /titulo|manchete/i,                                    model: "openai/gpt-5.6-terra" },
  { pattern: /corrigir bug|corrija esse bug/i,                      model: "anthropic/claude-opus-5" },
  { pattern: /explique este codigo|o que este codigo faz/i,        model: "anthropic/claude-sonnet-5" },
  { pattern: /gerar teste|escreva um teste|teste automatizado/i,   model: "qwen/qwen3-coder-plus" },
  { pattern: /converter codigo|converta este codigo/i,             model: "qwen/qwen3-coder-flash" },
  { pattern: /documentar codigo|documentação tecnica/i,            model: "anthropic/claude-sonnet-5" },
  { pattern: /\bsql\b/i,                                            model: "qwen/qwen3-coder-plus" },
  { pattern: /codigo|código|code/i,                                 model: "qwen/qwen3-coder-plus" },
  { pattern: /raciocinio logico|resolva esta equação/i,            model: "openai/o3-pro" },
  { pattern: /calculo matematico|calcule/i,                        model: "openai/gpt-5.6-sol" },
  { pattern: /planilha|analisar dados/i,                           model: "anthropic/claude-sonnet-5" },
  { pattern: /comparar opções|qual a melhor opção|ajude a decidir/i, model: "anthropic/claude-opus-5" },
  { pattern: /verificar fato|isso é verdade|fact check/i,          model: "perplexity/sonar-pro-search" },
  { pattern: /pesquisa aprofundada|pesquise sobre/i,               model: "perplexity/sonar-deep-research" },
  { pattern: /documento|texto longo|document/i,                    model: "anthropic/claude-opus-5" },
  { pattern: /transcrev|transcri/i,                                 model: "openai/gpt-audio" },
  { pattern: /resumo de transcrição|resumo de reunião/i,           model: "openai/gpt-audio-mini" },
  { pattern: /descreva esta imagem|o que tem nesta imagem/i,       model: "google/gemini-3.6-flash" },
  { pattern: /ocr|leia este texto na imagem/i,                     model: "google/gemini-3.6-flash" },
  { pattern: /sugerir cortes|timestamps do video|extrair citações/i, model: "anthropic/claude-sonnet-5" },
  { pattern: /thumbnail|descrição de video/i,                      model: "openai/gpt-5.6-terra" },
  { pattern: /proposta comercial/i,                                 model: "anthropic/claude-sonnet-5" },
  { pattern: /contrato|explicar documento burocratico/i,           model: "anthropic/claude-opus-5" },
  { pattern: /planejar projeto|planejamento de tarefas|organizar tarefas/i, model: "openai/gpt-5.6-sol" },
  { pattern: /gerar relatorio|escreva um relatorio/i,              model: "anthropic/claude-sonnet-5" },
  { pattern: /brainstorm|gere ideias/i,                            model: "openai/gpt-5.6-terra" },
  { pattern: /swot|analise estrategica/i,                          model: "anthropic/claude-opus-5" },
  { pattern: /descrição de produto/i,                               model: "openai/gpt-5.6-sol" },
  { pattern: /roteiro de vendas|script de vendas|responder objeção|cold call|prospecção|follow-up/i, model: "anthropic/claude-sonnet-5" },
  { pattern: /ata de reuniao|preencher formulario|criar apresentação|estrutura de slides/i, model: "openai/gpt-5.6-sol" },
  { pattern: /resumir historico de conversa/i,                     model: "anthropic/claude-sonnet-5" },
  { pattern: /copywriting|texto publicitario|anuncio|teste ab/i,   model: "anthropic/claude-opus-5" },
  { pattern: /post para instagram|post para redes sociais/i,       model: "openai/gpt-5.6-terra" },
  { pattern: /seo/i,                                                model: "google/gemini-3.5-flash" },
  { pattern: /hashtag|sugestão de legenda/i,                       model: "openai/gpt-5.6-terra" },
  { pattern: /roteiro de video curto/i,                             model: "anthropic/claude-sonnet-5" },
  { pattern: /sugestão de nome|slogan/i,                            model: "openai/gpt-5.6-terra" },
  { pattern: /politica de troca|politica de devolução/i,           model: "openai/gpt-5.6-sol" },
  { pattern: /perguntas frequentes|faq/i,                          model: "openai/gpt-5.6-sol" },
  { pattern: /criar prova|questoes de prova|quiz/i,                model: "anthropic/claude-sonnet-5" },
  { pattern: /corrigir redação|plano de aula/i,                    model: "anthropic/claude-opus-5" },
  { pattern: /explique de forma didatica|explique como se eu tivesse/i, model: "anthropic/claude-sonnet-5" },
  { pattern: /medic|saude|saúde|exame medico|perguntas para o medico/i, model: "anthropic/claude-opus-5" },
  { pattern: /juridic|jurídic|reclamação formal|procon/i,          model: "anthropic/claude-opus-5" },
  { pattern: /financ|contabil|financiamento|emprestimo|produto financeiro|organizar gastos/i, model: "anthropic/claude-sonnet-5" },
  { pattern: /nutri|suplement|cardapio|restrição alimentar/i,      model: "anthropic/claude-sonnet-5" },
  { pattern: /logistic|logístic|supply chain/i,                    model: "openai/gpt-5.6-sol" },
  { pattern: /mensagem de aniversario|mensagem de condolencia|o que cozinhar|lista de compras/i, model: "openai/gpt-5.6-sol" },
  { pattern: /pergunt|ask|query|consult/i,                          model: "openai/gpt-5.6-sol" },
];

export const DEFAULT_MODEL = "openai/gpt-oss-20b";

/**
 * Escolhe o modelo mais adequado para uma mensagem, com base nas
 * CATEGORY_RULES acima (a primeira regra que bater vence). Retorna
 * também qual foi a categoria escolhida, para fins de log/auditoria.
 */
export function pickModelForMessage(message) {
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(message)) {
      return { model: rule.model, matched: true };
    }
  }
  return { model: DEFAULT_MODEL, matched: false };
}
