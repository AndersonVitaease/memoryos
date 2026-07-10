// ─── Conflict Engine ───────────────────────────────────────────────────────────
// Foundation v1.0 · Conflict Detection + Deterministic Resolution

import type {
  SpecialistStrategy, StrategyConflict, ConflictResolution,
  ConflictType, ResolutionRule,
} from "./SFETypes";
import { makeSFEId } from "./SFETypes";

// ── Conflict detection rules ──────────────────────────────────────────────────

type ConflictRule = {
  type: ConflictType;
  description: string;
  domainA: string;
  domainB: string;
  recKeywordA: string;
  recKeywordB: string;
};

const CONFLICT_RULES: ConflictRule[] = [
  { type: "ConflictingPriority",         description: "Regime tributário: Contábil prioriza Simples Nacional mas Tributário pode recomendar Lucro Presumido.", domainA: "contabil", domainB: "tributario", recKeywordA: "regime", recKeywordB: "regime" },
  { type: "ContradictoryConstraint",     description: "ANVISA exige BPF pré-operacional mas Financeiro pode priorizar início de receita antes das adequações.", domainA: "anvisa", domainB: "financeiro", recKeywordA: "boas práticas", recKeywordB: "fluxo" },
  { type: "IncompatibleRisk",            description: "Comércio Exterior depende de registro ANVISA mas pode iniciar habilitação RADAR em paralelo causando conflito de prioridade.", domainA: "comercio_exterior", domainB: "anvisa", recKeywordA: "siscomex", recKeywordB: "registro" },
  { type: "ImpossibleDependency",        description: "RH requer CNPJ do Contábil mas pode tentar registrar eSocial antes da abertura.", domainA: "rh", domainB: "contabil", recKeywordA: "esocial", recKeywordB: "cnpj" },
  { type: "IncompatibleRecommendation",  description: "Jurídico e Compliance podem divergir sobre DPO — Jurídico como função interna vs. Compliance como serviço externo.", domainA: "juridico", domainB: "compliance", recKeywordA: "contrato", recKeywordB: "lgpd" },
];

// ── Detect ─────────────────────────────────────────────────────────────────────

export function detectConflicts(strategies: SpecialistStrategy[]): StrategyConflict[] {
  const conflicts: StrategyConflict[] = [];
  const byDomain = new Map(strategies.map(s => [s.domain, s]));

  for (const rule of CONFLICT_RULES) {
    const sA = byDomain.get(rule.domainA);
    const sB = byDomain.get(rule.domainB);
    if (!sA || !sB) continue;

    const recA = sA.recommendations.find(r =>
      r.title.toLowerCase().includes(rule.recKeywordA) ||
      r.description.toLowerCase().includes(rule.recKeywordA)
    );
    const recB = sB.recommendations.find(r =>
      r.title.toLowerCase().includes(rule.recKeywordB) ||
      r.description.toLowerCase().includes(rule.recKeywordB)
    );
    if (!recA || !recB) continue;

    conflicts.push({
      id:              makeSFEId("conf"),
      type:            rule.type,
      description:     rule.description,
      specialistA:     sA.specialistId,
      specialistB:     sB.specialistId,
      recommendationA: `[${sA.specialistName}] ${recA.title}`,
      recommendationB: `[${sB.specialistName}] ${recB.title}`,
      status:          "Detected",
      detectedAt:      Date.now(),
    });
  }

  // Dependency conflicts: if B depends on A but A has lower confidence
  for (const sB of strategies) {
    for (const depDomain of sB.dependencies) {
      const sA = byDomain.get(depDomain);
      if (!sA) continue;
      if (sA.confidenceLevel < 0.70) {
        conflicts.push({
          id:              makeSFEId("conf"),
          type:            "ImpossibleDependency",
          description:     `${sB.specialistName} depende de ${sA.specialistName} mas confiança de ${sA.specialistName} (${(sA.confidenceLevel*100).toFixed(0)}%) está abaixo do limite.`,
          specialistA:     sB.specialistId,
          specialistB:     sA.specialistId,
          recommendationA: `${sB.specialistName} requer saída de ${sA.specialistName}`,
          recommendationB: `${sA.specialistName} com confiança ${(sA.confidenceLevel*100).toFixed(0)}%`,
          status:          "Detected",
          detectedAt:      Date.now(),
        });
      }
    }
  }

  return conflicts;
}

// ── Resolve ────────────────────────────────────────────────────────────────────

const PRIORITY_ORDER = { Critical: 4, High: 3, Medium: 2, Low: 1 };

function selectWinner(sA: SpecialistStrategy, sB: SpecialistStrategy): { winner: SpecialistStrategy; loser: SpecialistStrategy; rule: ResolutionRule; justification: string } {
  // Rule 1: Higher confidence
  if (Math.abs(sA.confidenceLevel - sB.confidenceLevel) > 0.05) {
    const [winner, loser] = sA.confidenceLevel > sB.confidenceLevel ? [sA, sB] : [sB, sA];
    return { winner, loser, rule: "HigherConfidence", justification: `${winner.specialistName} possui maior nível de confiança (${(winner.confidenceLevel*100).toFixed(0)}% vs ${(loser.confidenceLevel*100).toFixed(0)}%).` };
  }
  // Rule 2: Lower risk exposure
  if (sA.risks.length !== sB.risks.length) {
    const [winner, loser] = sA.risks.length < sB.risks.length ? [sA, sB] : [sB, sA];
    return { winner, loser, rule: "LowerRisk", justification: `${winner.specialistName} apresenta menor exposição a riscos (${winner.risks.length} vs ${loser.risks.length}).` };
  }
  // Rule 3: Goal adherence — more Critical recommendations = higher adherence
  const critA = sA.recommendations.filter(r => r.priority === "Critical").length;
  const critB = sB.recommendations.filter(r => r.priority === "Critical").length;
  if (critA !== critB) {
    const [winner, loser] = critA > critB ? [sA, sB] : [sB, sA];
    return { winner, loser, rule: "GoalAdherence", justification: `${winner.specialistName} tem maior aderência ao Goal com ${Math.max(critA,critB)} recomendações críticas.` };
  }
  // Tie — human approval required
  return { winner: sA, loser: sB, rule: "HumanRequired", justification: `Empate entre ${sA.specialistName} e ${sB.specialistName}. Aprovação humana necessária.` };
}

export function resolveConflicts(conflicts: StrategyConflict[], strategies: SpecialistStrategy[]): StrategyConflict[] {
  const byId = new Map(strategies.map(s => [s.specialistId, s]));

  return conflicts.map(conflict => {
    const sA = byId.get(conflict.specialistA);
    const sB = byId.get(conflict.specialistB);
    if (!sA || !sB) return { ...conflict, status: "Detected" as const };

    const { winner, loser, rule, justification } = selectWinner(sA, sB);

    const resolution: ConflictResolution = {
      rule,
      winner: winner.specialistId,
      loser:  loser.specialistId,
      justification,
      resolvedAt: Date.now(),
    };

    return {
      ...conflict,
      status:     rule === "HumanRequired" ? "RequiresHumanApproval" as const : "Resolved" as const,
      resolution,
    };
  });
}