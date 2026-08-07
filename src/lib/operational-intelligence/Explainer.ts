/**
 * Explainer.ts — OIE Fase 5 (Sprint 8) — modulo final
 *
 * Responsabilidade unica: consumir EvidencePackets (Fase 4.5) e produzir
 * EXPLICACOES — cadeia causal + citacoes de evidencia + recomendacao
 * consultiva. Deterministico: templates por findingType, sem LLM. Cada
 * citacao referencia um claim do packet (source + locator + value), entao
 * a explicacao e sempre aterrada — nunca inventa dados.
 *
 * MISSAO OIE: explicar continuamente o comportamento do MemoryOS.
 * Consultivo: recomenda, NUNCA age. O produto final do engine e a
 * explicacao que o usuario/admin le para entender "por que o sistema
 * fez X" ou "por que isto e uma regressao".
 *
 * PRINCIPIOS: read-only, deterministico, templates, sem nova entidade.
 */

import type { EvidencePacket, EvidenceClaim } from "./EvidenceEngine";

// ── Tipos ────────────────────────────────────────────────────────────────────

export type Severity = "info" | "warning" | "critical";

export interface Explanation {
  readonly findingType: string;
  readonly title: string;
  readonly severity: Severity;
  readonly causalChain: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly recommendation: string;
}

export interface ExplanationSummary {
  readonly total: number;
  readonly critical: number;
  readonly warning: number;
  readonly info: number;
  readonly byFindingType: Readonly<Record<string, number>>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function cite(claim: EvidenceClaim): string {
  return `[${claim.source} ${claim.locator}] ${claim.value}`;
}

function firstClaim(packet: EvidencePacket, source: EvidenceClaim["source"]): EvidenceClaim | undefined {
  return packet.claims.find((c) => c.source === source);
}

function claimsBySource(packet: EvidencePacket, source: EvidenceClaim["source"]): EvidenceClaim[] {
  return packet.claims.filter((c) => c.source === source);
}

// ── Template Registry ─────────────────────────────────────────────────────────

type TemplateFn = (packet: EvidencePacket) => Omit<Explanation, "findingType">;

const TEMPLATES: Record<string, TemplateFn> = {
  // ── Coverage Analyzer (Fase 3) ───────────────────────────────────────────
  NoConnectorExecution: (p) => ({
    title: "Intencao sem execucao de connector",
    severity: "warning",
    causalChain: [
      "O usuario registrou uma intencao (InteractionEvent) para esta execucao.",
      "O Planner nao produziu nenhum ExecutionObservation — caiu em fallback LLM/memoria.",
      "Nenhuma capability de connector rodou, embora a intencao pareca requerer acao.",
    ],
    evidenceRefs: p.claims.map(cite),
    recommendation: "Verificar se o Planner esta classificando esta intencao como general_conversation por engano (IdentityBypass / PlannerFallbackLoop).",
  }),

  PartialRepositoryTraversal: (p) => {
    const intent = firstClaim(p, "InteractionEvent");
    const execs = claimsBySource(p, "ExecutionObservation");
    return {
      title: "Varredura parcial do repositorio",
      severity: "warning",
      causalChain: [
        `A intencao pediu "todo/all" ${intent ? `(${intent.value})` : ""}.`,
        `So rodaram capabilities singulares: ${execs.map((e) => e.locator).join(", ")}.`,
        "Nenhuma capability de list/search foi disparada — o sistema leu um item quando o usuario pediu a totalidade.",
      ],
      evidenceRefs: p.claims.map(cite),
      recommendation: "O Plano deveria incluir uma capability list/search antes do get/read. Verificar o GoalCapabilityRegistry para este goalType.",
    };
  },

  AllExecutionsFailed: (p) => ({
    title: "Todas as execucoes falharam",
    severity: "critical",
    causalChain: [
      "Todas as ExecutionObservation desta execucao terminaram failed/timeout/blocked.",
      "O pipeline provavelmente entregou uma resposta generica (SilentFallback) por cima do erro.",
      "O usuario recebeu algo, mas a acao pedida nao foi cumprida.",
    ],
    evidenceRefs: p.claims.map(cite),
    recommendation: "Inspecionar os error_signature das observacoes (ex: Timeout, AuthenticationError). Corrigir a causa raiz antes de qualquer resposta ao usuario.",
  }),

  PartialSuccess: (p) => ({
    title: "Execucao parcial (mix sucesso + falha)",
    severity: "warning",
    causalChain: [
      "A execucao mistura steps com sucesso e falha.",
      "Possivel terminacao antecipada (UnexpectedEarlyTermination) ou dependencia quebrada entre steps.",
      "O resultado final pode estar incompleto sem o sistema perceber.",
    ],
    evidenceRefs: p.claims.map(cite),
    recommendation: "Revisar a ordem e as dependencias dos steps no ExecutionPlan. Considerar transacao/rollback para steps com falha parcial.",
  }),

  CoverageGap: (p) => ({
    title: "Capabilities esperadas nao executaram",
    severity: "warning",
    causalChain: [
      "O ArchitectureMap esperava capabilities para este goalType.",
      "A execucao nao disparou todas as capabilities mapeadas (CoverageGap).",
      "O sistema pode estar usando um caminho mais curto que omite passos arquiteturais.",
    ],
    evidenceRefs: p.claims.map(cite),
    recommendation: "Verificar divergencia entre o GoalCapabilityRegistry e o plano efetivamente gerado. Possivel drift arquitetural.",
  }),

  // ── Decision Analyzer (Fase 2.5) ─────────────────────────────────────────
  SameIntentMultipleGoals: (p) => ({
    title: "Mesma intencao roteada para goals diferentes",
    severity: "warning",
    causalChain: [
      "O mesmo intent_hash levou a goalTypes distintos em execucoes separadas.",
      "O Planner nao e deterministico para esta intencao — perde repetibilidade.",
      "O usuario faz a mesma pergunta e obtem respostas/caminhos diferentes.",
    ],
    evidenceRefs: p.claims.map(cite),
    recommendation: "Auditar o ConversationGoalBridge / PrimaryConversationRouter para esta classe de intencao. Considerar fixacao deterministica de goal.",
  }),

  RepeatedQuestion: (p) => ({
    title: "Pergunta repetida pelo usuario",
    severity: "info",
    causalChain: [
      "O mesmo intent_hash apareceu multiplas vezes na sessao.",
      "Sinal de insatisfacao: a resposta anterior provavelmente nao resolveu.",
      "Pode indicar SilentFallback anterior ou resposta generica que nao cumpriu o pedido.",
    ],
    evidenceRefs: p.claims.map(cite),
    recommendation: "Revisar a primeira resposta dada para este intent_hash. Se foi fallback generico, promover a resolucao real.",
  }),

  // ── Regression Analyzer (Fase 4) ──────────────────────────────────────────
  new_error_signature: (p) => {
    const claim = p.claims[0];
    return {
      title: "Nova assinatura de erro apareceu",
      severity: "critical",
      causalChain: [
        "Um error_signature que nao existia na sprint baseline apareceu na sprint atual.",
        claim ? `Contagem: ${claim.value}.` : "",
        "Sinal de regressao introduzida nesta versao — falha antes ausente.",
      ].filter(Boolean),
      evidenceRefs: p.claims.map(cite),
      recommendation: "Bisect entre as duas sprints para localizar o commit que introduziu o erro. Priorizar correcao antes de promocao.",
    };
  },

  new_behavior_signature: (p) => {
    const claim = p.claims[0];
    return {
      title: "Novo padrao de comportamento anormal",
      severity: "warning",
      causalChain: [
        "Um behavior_signature novo apareceu na sprint atual.",
        claim ? `Contagem: ${claim.value}.` : "",
        "Falha silenciosa nova — o sistema termina 'ok' mas nao cumpre o pedido.",
      ].filter(Boolean),
      evidenceRefs: p.claims.map(cite),
      recommendation: "Investigar o cenario que dispara este behavior_signature. Pode ser regressao funcional mesmo sem erro explicito.",
    };
  },

  failure_rate_increase: (p) => {
    const claim = p.claims[0];
    return {
      title: "Taxa de falha subiu entre sprints",
      severity: "critical",
      causalChain: [
        "A failure rate da sprint atual e significativamente maior que a baseline.",
        claim ? `Comparativo: ${claim.value}.` : "",
        "Mesmo sem novas assinaturas, o sistema falhou mais vezes — degradacao de confiabilidade.",
      ].filter(Boolean),
      evidenceRefs: p.claims.map(cite),
      recommendation: "Verificar se ha load maior, timeout diminuido, ou recurso compartilhado saturado. Considerar rollback se ultrapassar limiar critico.",
    };
  },

  // ── Anomaly Predictor (Sprint 11 — preditivo deterministico) ───────────────
  failure_rate_rising: (p) => ({
    title: "Taxa de falha em tendencia de alta",
    severity: "warning",
    causalChain: [
      `Regressao linear (least-squares) sobre buckets de failure_rate mostra slope positivo: ${p.summary}.`,
      "O sistema ainda nao cruzou o limiar critico, mas a direcao e de degradacao.",
      "Se a tendencia persistir, a confiabilidade cai antes do proximo alerta critico.",
    ],
    evidenceRefs: p.claims.map(cite),
    recommendation: "Investigar a causa do aumento (load, timeout, recurso saturado). Agir antes do breach — nao esperar virar critical.",
  }),

  failure_rate_projected_breach: (p) => ({
    title: "Taxa de falha projetada para cruzar limiar critico",
    severity: "critical",
    causalChain: [
      `A tendencia de failure_rate, extrapolada, cruza o limiar critico dentro do horizonte configurado: ${p.summary}.`,
      "Predicao deterministica (least-squares sobre buckets recentes), nao palpite.",
      "Sem intervencao, o sistema atinge failure rate critico no bucket projetado.",
    ],
    evidenceRefs: p.claims.map(cite),
    recommendation: "Intervencao imediata: identificar o connector/assinatura que puxa a taxa e aplicar correcao ou rollback. Nao esperar o breach.",
  }),

  connector_degradation: (p) => {
    const sevClaim = p.claims.find((c) => c.locator === "prediction.severity");
    const severity: Severity = sevClaim?.value === "critical" ? "critical" : "warning";
    return {
      title: "Connector em degradacao",
      severity,
      causalChain: [
        `A failure_rate deste connector sobe por bucket (slope positivo): ${p.summary}.`,
        severity === "critical"
          ? "A projecao cruza o limiar critico dentro do horizonte — breach iminente."
          : "A projecao ainda nao cruza o limiar critico, mas a direcao e de degradacao.",
        "Degradacao de connector individual precede queda de confiabilidade global.",
      ],
      evidenceRefs: p.claims.map(cite),
      recommendation: "Verificar tokens, rate limits, scopes e saude do endpoint deste connector. Considerar circuit breaker preventivo.",
    };
  },

  error_signature_accelerating: (p) => ({
    title: "Assinatura de erro acelerando",
    severity: "warning",
    causalChain: [
      `Uma error_signature cresce por bucket (slope positivo): ${p.summary}.`,
      "Erro que era ocasional vira recorrente — tendencia de normalizacao da falha.",
      "Se nao contido, domina o ranking de erros e eleva a failure rate global.",
    ],
    evidenceRefs: p.claims.map(cite),
    recommendation: "Bisect para localizar a introducao da assinatura. Corrigir antes que vire padrao dominante.",
  }),
};

// ── Explainer ─────────────────────────────────────────────────────────────────

export const Explainer = {
  /**
   * Explica um unico EvidencePacket usando o template do seu findingType.
   * Se nao houver template, gera uma explicacao generica com os claims.
   */
  explain(packet: EvidencePacket): Explanation {
    const builder = TEMPLATES[packet.findingType];
    if (builder) {
      return Object.freeze({ findingType: packet.findingType, ...builder(packet) });
    }
    return Object.freeze({
      findingType: packet.findingType,
      title: packet.summary,
      severity: "info" as Severity,
      causalChain: ["Finding sem template dedicado — ver os claims abaixo."],
      evidenceRefs: packet.claims.map(cite),
      recommendation: "Adicionar um template ao Explainer para este findingType.",
    });
  },

  /**
   * Explica todos os packets de uma vez.
   */
  explainAll(packets: readonly EvidencePacket[]): Explanation[] {
    return packets.map((p) => this.explain(p));
  },

  /**
   * Agrega explicacoes em um sumario para dashboards.
   */
  summarize(explanations: readonly Explanation[]): ExplanationSummary {
    const byFindingType: Record<string, number> = {};
    let critical = 0, warning = 0, info = 0;
    for (const e of explanations) {
      byFindingType[e.findingType] = (byFindingType[e.findingType] ?? 0) + 1;
      if (e.severity === "critical") critical++;
      else if (e.severity === "warning") warning++;
      else info++;
    }
    return Object.freeze({
      total: explanations.length,
      critical,
      warning,
      info,
      byFindingType: Object.freeze(byFindingType),
    });
  },
};