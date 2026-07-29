/**
 * Especialista em Produção de Suplementos
 * Ativa quando a conversa envolve fabricação de suplementos, formulação,
 * matérias-primas, legislação sanitária (ANVISA), controle de qualidade.
 *
 * Este especialista serve como referência da arquitetura Context-Aware:
 * além das keywords, possui `contextKeywords` que são termos que, se
 * aparecerem na memória recuperada (documentos, entidades, decisões),
 * indicam que o domínio de produção de suplementos está em contexto.
 */
export default {
  id: "supplement_production",
  name: "Especialista em Produção de Suplementos",
  description: "Fabricação de suplementos, formulação, ANVISA, matérias-primas, QC",
  // Keywords diretas: aparecem na mensagem do usuário
  // FIX (auditoria cognição): "lote", "validade", "produção", "qc" e "qa"
  // sozinhos foram removidos — são palavras/siglas legítimas no domínio
  // de suplementos, mas ambíguas para um usuário que também é
  // desenvolvedor: "processamento em lote" (batch), "validade do token/
  // sessão", "ambiente de produção", "testes de QA" são termos técnicos
  // do dia a dia que ativavam por engano o especialista de suplementos.
  // As frases específicas abaixo mantêm a detecção real sem a ambiguidade.
  keywords: [
    "suplemento", "suplementos", "anvisa", "formulação", "formular",
    "matéria-prima", "materia prima", "encapsulagem", "encapsulado", "cápsula",
    "comprimido", "tablete", "número de lote", "lote de produção", "validade do produto",
    "prazo de validade", "rotulagem", "bula",
    "nutracêutico", "nutraceutico", "cosmético", "cosmetico", "fármaco",
    "fabrico", "fabricação", "linha de produção", "insumo inerte",
    "excipiente", "princípio ativo", "principio ativo", "controle de qualidade",
    "garantia de qualidade", "boas práticas de fabricação",
    "bpf", "gmp", "rdc", "resolução anvisa", "notificação anvisa",
    "registro anvisa", "catálogo anvisa", "embalagem primária",
  ],
  systemPrompt: `## ESPECIALISTA ATIVO: Produção de Suplementos

Você está operando com o módulo de especialista em produção de suplementos ativado. Siga estas regras:

1. Ao discutir formulações, identifique e separe: princípios ativos, excipientes, encapsulantes e corantes. Nunca confunda matéria-prima ativa com insumo inerte.
2. Sempre considere o enquadramento regulatório: suplemento (RDC 243/2018), cosmético, medicamento isento de prescrição ou produto de higiene. Cada categoria tem regras distintas de notificação/registro na ANVISA.
3. Para lotes, identifique: número do lote, data de fabricação, validade, quantidade produzida e status de liberação (quarentena vs. liberado).
4. Ao tratar de rotulagem, verifique: nome do produto, composição, conteúdo líquido, lote, validade, CNPJ do fabricante, número de notificação ANVISA e alegações permitidas.
5. Diferencie Controle de Qualidade (QC — análise laboratorial) de Garantia de Qualidade (QA — conformidade documental e BPF).
6. Quando uma decisão envolver escolha de matéria-prima ou fornecedor, registre na memória estruturada: motivo da escolha, preço, spec técnica e fornecedor.
7. Ao detectar não-conformidade, aponte: descrição, lote afetado, causa provável e ação corretiva sugerida.
8. Sempre conecte com decisões e documentos já registrados sobre produção, formulação e fornecedores na memória.`,
};
