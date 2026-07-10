// ─── Planner Engine ────────────────────────────────────────────────────────────
// Foundation v1.0 · Goal → ExecutionPlan · Decomposer · Validator · Repository · JourneyBuilder

import type {
  ExecutionPlan, PlanStep, PlanRisk, PlanStatus, PlanPriority,
  PlanValidationResult, ExecStrategy,
} from "./PlannerTypes";
import {
  makePlanId, makeStepId, makeAuditEntry, DEFAULT_RETRY,
} from "./PlannerTypes";
import { plannerEventBus }          from "./PlannerEvents";
import type { Goal }                from "@/lib/goal-engine/GoalTypes";
import { repoGet as getGoal }       from "@/lib/goal-engine/GoalEngine";
import { createWorkingMemoryEngine } from "@/lib/wme";
import { createJourney, addTask }   from "@/lib/journey/JourneyManager";
import { globalCapabilityRegistry } from "@/lib/capabilities/registry/CapabilityRegistry";
import type { IdentityContext }     from "@/lib/wme/types";

const { engine: wme } = createWorkingMemoryEngine();

// ── In-memory repository ──────────────────────────────────────────────────────

const _repo = new Map<string, ExecutionPlan>();

// ── Goal Decomposer ───────────────────────────────────────────────────────────
// Transforms a Goal into PlanSteps via hierarchical decomposition

interface DecompositionPattern {
  keywords: string[];
  strategy: ExecStrategy;
  steps: Array<{
    title: string;
    description: string;
    objective: string;
    requiredCapabilities: string[];
    requiredConnectors: string[];
    approvalRequired: boolean;
    estimatedDuration: string;
  }>;
  risks: Array<{ description: string; level: PlanRisk["level"]; mitigation: string }>;
  estimatedCost: string;
}

const DECOMPOSITION_PATTERNS: DecompositionPattern[] = [
  {
    keywords: ["abertura de empresa", "abrir empresa", "constituir empresa"],
    strategy: "Sequential",
    estimatedCost: "Médio",
    steps: [
      { title: "Definir Tipo Societário", description: "Escolher entre MEI, LTDA, SLU, S/A", objective: "Tipo societário definido", requiredCapabilities: ["mri"], requiredConnectors: [], approvalRequired: true, estimatedDuration: "1 dia" },
      { title: "Pesquisar Nome Empresarial", description: "Verificar disponibilidade do nome na Junta Comercial", objective: "Nome disponível confirmado", requiredCapabilities: ["mri"], requiredConnectors: [], approvalRequired: false, estimatedDuration: "1 dia" },
      { title: "Elaborar Contrato Social", description: "Redigir contrato social ou requerimento MEI", objective: "Contrato social aprovado", requiredCapabilities: ["mri"], requiredConnectors: [], approvalRequired: true, estimatedDuration: "2 dias" },
      { title: "Registrar na Junta Comercial", description: "Protocolar documentos na Junta Comercial", objective: "NIRE obtido", requiredCapabilities: ["mri"], requiredConnectors: [], approvalRequired: false, estimatedDuration: "5-10 dias" },
      { title: "Obter CNPJ na Receita Federal", description: "Solicitar CNPJ via portal Gov.br", objective: "CNPJ emitido", requiredCapabilities: ["mri"], requiredConnectors: [], approvalRequired: false, estimatedDuration: "1 dia" },
      { title: "Inscrição Estadual e Municipal", description: "Registrar nos órgãos estadual e municipal conforme atividade", objective: "Inscrições ativas", requiredCapabilities: ["mri"], requiredConnectors: [], approvalRequired: false, estimatedDuration: "3-5 dias" },
      { title: "Obter Alvará de Funcionamento", description: "Solicitar alvará na prefeitura", objective: "Alvará obtido", requiredCapabilities: ["mri"], requiredConnectors: [], approvalRequired: false, estimatedDuration: "7-15 dias" },
    ],
    risks: [
      { description: "Nome empresarial já registrado", level: "High", mitigation: "Pesquisar variações do nome antes de prosseguir" },
      { description: "Irregularidade no Contrato Social", level: "High", mitigation: "Revisar com advogado especializado" },
      { description: "Atividade incompatível com zoneamento", level: "Medium", mitigation: "Verificar legislação municipal antes de definir endereço" },
    ],
  },
  {
    keywords: ["emissão de nota fiscal", "emitir nota fiscal", "nota fiscal"],
    strategy: "Sequential",
    estimatedCost: "Baixo",
    steps: [
      { title: "Verificar Habilitação do Emissor", description: "Confirmar CNPJ ativo e regime tributário", objective: "Emissor habilitado", requiredCapabilities: ["mri"], requiredConnectors: [], approvalRequired: false, estimatedDuration: "Imediato" },
      { title: "Validar Certificado Digital", description: "Verificar validade do certificado A1/A3", objective: "Certificado válido", requiredCapabilities: ["mri"], requiredConnectors: [], approvalRequired: false, estimatedDuration: "Imediato" },
      { title: "Preencher Dados da NF-e", description: "Informar destinatário, itens, valores e CFOP", objective: "NF-e preenchida corretamente", requiredCapabilities: ["mri"], requiredConnectors: [], approvalRequired: false, estimatedDuration: "30 min" },
      { title: "Transmitir à SEFAZ", description: "Enviar NF-e para autorização eletrônica", objective: "NF-e autorizada", requiredCapabilities: ["mri"], requiredConnectors: [], approvalRequired: false, estimatedDuration: "Imediato" },
      { title: "Armazenar XML e DANFE", description: "Guardar XML autorizado e gerar DANFE", objective: "Documentos armazenados", requiredCapabilities: ["mri"], requiredConnectors: [], approvalRequired: false, estimatedDuration: "Imediato" },
    ],
    risks: [
      { description: "Certificado digital vencido", level: "Critical", mitigation: "Renovar certificado antes de emitir" },
      { description: "Rejeição pela SEFAZ por dados inválidos", level: "High", mitigation: "Validar XML antes de transmitir" },
    ],
  },
  {
    keywords: ["consulta de cpf", "consultar cpf", "verificar cpf"],
    strategy: "Automatic",
    estimatedCost: "Baixo",
    steps: [
      { title: "Acessar Portal da Receita Federal", description: "Navegar ao serviço de consulta de CPF", objective: "Portal acessado", requiredCapabilities: ["mri"], requiredConnectors: [], approvalRequired: false, estimatedDuration: "Imediato" },
      { title: "Informar Dados do Contribuinte", description: "Inserir CPF e data de nascimento", objective: "Consulta enviada", requiredCapabilities: ["mri"], requiredConnectors: [], approvalRequired: false, estimatedDuration: "Imediato" },
      { title: "Obter e Armazenar Comprovante", description: "Baixar comprovante de situação cadastral", objective: "Comprovante obtido", requiredCapabilities: ["mri"], requiredConnectors: [], approvalRequired: false, estimatedDuration: "Imediato" },
    ],
    risks: [
      { description: "CPF irregular ou cancelado", level: "High", mitigation: "Solicitar regularização na Receita Federal" },
    ],
  },
  {
    keywords: ["registro de marca", "registrar marca", "inpi"],
    strategy: "Sequential",
    estimatedCost: "Médio",
    steps: [
      { title: "Pesquisa de Anterioridade", description: "Verificar se marca já existe no banco do INPI", objective: "Ausência de conflito confirmada", requiredCapabilities: ["mri"], requiredConnectors: [], approvalRequired: true, estimatedDuration: "1-2 dias" },
      { title: "Definir Classe de Nice", description: "Identificar a classe de produtos/serviços aplicável", objective: "Classe definida", requiredCapabilities: ["mri"], requiredConnectors: [], approvalRequired: false, estimatedDuration: "1 dia" },
      { title: "Preparar Documentação", description: "Reunir representação gráfica, procuração e GRU", objective: "Documentação completa", requiredCapabilities: ["mri"], requiredConnectors: [], approvalRequired: false, estimatedDuration: "2 dias" },
      { title: "Depositar Pedido no INPI", description: "Protocolar pedido de registro no e-INPI", objective: "Número de processo emitido", requiredCapabilities: ["mri"], requiredConnectors: [], approvalRequired: false, estimatedDuration: "1 dia" },
      { title: "Aguardar Publicação na RPI", description: "Acompanhar publicação na Revista da Propriedade Industrial", objective: "Marca publicada na RPI", requiredCapabilities: ["mri"], requiredConnectors: [], approvalRequired: false, estimatedDuration: "60 dias" },
      { title: "Monitorar Prazo de Oposição", description: "Verificar se há oposições no prazo de 60 dias após publicação", objective: "Prazo de oposição sem conflito", requiredCapabilities: ["mri"], requiredConnectors: [], approvalRequired: true, estimatedDuration: "60 dias" },
    ],
    risks: [
      { description: "Marca confundível com marca anterior", level: "Critical", mitigation: "Realizar pesquisa ampla antes do depósito" },
      { description: "Oposição de terceiros", level: "High", mitigation: "Preparar argumentos de defesa e contestação" },
      { description: "Indeferimento por descritiva", level: "Medium", mitigation: "Escolher marca com maior distintividade" },
    ],
  },
  {
    keywords: ["importação de suplemento", "importar suplemento"],
    strategy: "Sequential",
    estimatedCost: "Alto",
    steps: [
      { title: "Classificar NCM do Produto", description: "Identificar a Nomenclatura Comum do Mercosul do suplemento", objective: "NCM correto identificado", requiredCapabilities: ["mri"], requiredConnectors: [], approvalRequired: false, estimatedDuration: "1 dia" },
      { title: "Regularizar ANVISA", description: "Verificar e obter registro do produto na ANVISA", objective: "Produto regularizado na ANVISA", requiredCapabilities: ["mri"], requiredConnectors: [], approvalRequired: true, estimatedDuration: "30-90 dias" },
      { title: "Habilitar Importador no SISCOMEX", description: "Garantir habilitação da empresa para operações de importação", objective: "Empresa habilitada", requiredCapabilities: ["mri"], requiredConnectors: [], approvalRequired: false, estimatedDuration: "5-10 dias" },
      { title: "Solicitar Licença de Importação (LI)", description: "Registrar LI no SISCOMEX antes do embarque", objective: "LI aprovada", requiredCapabilities: ["mri"], requiredConnectors: [], approvalRequired: true, estimatedDuration: "2-5 dias" },
      { title: "Embarque e Transporte Internacional", description: "Coordenar embarque com fornecedor e agente de cargas", objective: "Carga embarcada com documentação completa", requiredCapabilities: ["mri"], requiredConnectors: [], approvalRequired: false, estimatedDuration: "10-30 dias" },
      { title: "Desembaraço Aduaneiro", description: "Registrar DI e realizar desembaraço na Receita Federal", objective: "Carga liberada", requiredCapabilities: ["mri"], requiredConnectors: [], approvalRequired: false, estimatedDuration: "2-10 dias" },
      { title: "Armazenagem e Distribuição", description: "Receber mercadoria e iniciar distribuição", objective: "Produto disponível para comercialização", requiredCapabilities: ["mri"], requiredConnectors: [], approvalRequired: false, estimatedDuration: "1-3 dias" },
    ],
    risks: [
      { description: "Produto bloqueado pela ANVISA", level: "Critical", mitigation: "Verificar regularização ANVISA antes de iniciar importação" },
      { description: "Retenção aduaneira por documentação incorreta", level: "High", mitigation: "Revisar todos os documentos com despachante aduaneiro" },
      { description: "Variação cambial impactando custo", level: "Medium", mitigation: "Negociar câmbio ou hedge financeiro" },
      { description: "Atraso no transporte internacional", level: "Medium", mitigation: "Trabalhar com múltiplos agentes de carga" },
    ],
  },
];

function decomposeGoal(goal: Goal): { steps: PlanStep[]; risks: PlanRisk[]; strategy: ExecStrategy; estimatedCost: string } {
  const normalized = goal.title.toLowerCase() + " " + goal.primaryObjective.toLowerCase();

  for (const pattern of DECOMPOSITION_PATTERNS) {
    if (pattern.keywords.some(kw => normalized.includes(kw))) {
      const steps: PlanStep[] = pattern.steps.map((s, i) => ({
        id:                    makeStepId(),
        title:                 s.title,
        description:           s.description,
        objective:             s.objective,
        requiredCapabilities:  s.requiredCapabilities,
        requiredKnowledge:     [],
        requiredConnectors:    s.requiredConnectors,
        inputs:                { goalId: goal.id, stepIndex: i },
        outputs:               {},
        dependencies:          i > 0 ? [] : [], // sequential deps built after
        estimatedDuration:     s.estimatedDuration,
        retryPolicy:           DEFAULT_RETRY,
        timeout:               0,
        approvalRequired:      s.approvalRequired,
        executionStrategy:     pattern.strategy,
        status:                "Pending" as const,
        metadata:              {},
      }));

      // Wire sequential dependencies
      if (pattern.strategy === "Sequential") {
        for (let i = 1; i < steps.length; i++) {
          steps[i].dependencies = [steps[i - 1].id];
        }
      }

      const risks: PlanRisk[] = pattern.risks.map(r => ({
        id:          makePlanId("risk"),
        description: r.description,
        level:       r.level,
        mitigation:  r.mitigation,
        alternative: undefined,
        dependency:  undefined,
      }));

      return { steps, risks, strategy: pattern.strategy, estimatedCost: pattern.estimatedCost };
    }
  }

  // Generic fallback decomposition
  const steps: PlanStep[] = [
    {
      id: makeStepId(), title: "Análise e Preparação",
      description: `Analisar requisitos para: ${goal.primaryObjective}`,
      objective: "Requisitos levantados", requiredCapabilities: ["mri"],
      requiredKnowledge: [], requiredConnectors: [], inputs: { goalId: goal.id },
      outputs: {}, dependencies: [], estimatedDuration: "1-2 dias",
      retryPolicy: DEFAULT_RETRY, timeout: 0, approvalRequired: false,
      executionStrategy: "Sequential", status: "Pending", metadata: {},
    },
    {
      id: makeStepId(), title: "Execução Principal",
      description: goal.primaryObjective,
      objective: goal.acceptanceCriteria[0] ?? "Objetivo atingido",
      requiredCapabilities: ["mri"], requiredKnowledge: [], requiredConnectors: [],
      inputs: { goalId: goal.id }, outputs: {}, dependencies: [],
      estimatedDuration: goal.estimatedDuration, retryPolicy: DEFAULT_RETRY,
      timeout: 0, approvalRequired: true, executionStrategy: "Sequential",
      status: "Pending", metadata: {},
    },
    {
      id: makeStepId(), title: "Validação e Encerramento",
      description: "Verificar critérios de aceite e encerrar objetivo",
      objective: "Todos os critérios de aceite atendidos",
      requiredCapabilities: ["mri"], requiredKnowledge: [], requiredConnectors: [],
      inputs: { goalId: goal.id }, outputs: {}, dependencies: [],
      estimatedDuration: "1 dia", retryPolicy: DEFAULT_RETRY,
      timeout: 0, approvalRequired: false, executionStrategy: "Sequential",
      status: "Pending", metadata: {},
    },
  ];
  // Wire deps
  steps[1].dependencies = [steps[0].id];
  steps[2].dependencies = [steps[1].id];

  return {
    steps,
    risks: [{ id: makePlanId("risk"), description: "Objetivo pouco especificado — pode haver retrabalho", level: "Medium", mitigation: "Detalhar requisitos antes de iniciar execução" }],
    strategy: "Sequential",
    estimatedCost: "Médio",
  };
}

// ── PlanValidator ─────────────────────────────────────────────────────────────

export function validatePlan(plan: ExecutionPlan): PlanValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!plan.title?.trim())       errors.push("title is required");
  if (!plan.objective?.trim())   errors.push("objective is required");
  if (!plan.goalId?.trim())      errors.push("goalId is required");
  if (plan.steps.length === 0)   errors.push("at least one step is required");

  const stepIds = new Set(plan.steps.map(s => s.id));

  for (const step of plan.steps) {
    // Orphan dep check
    for (const dep of step.dependencies) {
      if (!stepIds.has(dep)) errors.push(`Step '${step.title}' has unknown dependency '${dep}'`);
    }
    // Cycle detection (simple: step cannot depend on itself)
    if (step.dependencies.includes(step.id)) errors.push(`Step '${step.title}' depends on itself — cycle detected`);
    // Capability check
    for (const cap of step.requiredCapabilities) {
      if (!globalCapabilityRegistry.has(cap)) warnings.push(`Capability '${cap}' not registered (step: ${step.title})`);
    }
  }

  if (plan.confidenceScore < 0.5) warnings.push("Low confidence score");
  if (plan.risks.length === 0)    warnings.push("No risks identified — consider a risk analysis");

  return { valid: errors.length === 0, errors, warnings };
}

// ── ExecutionPlan Repository ──────────────────────────────────────────────────

export function planRepoCreate(plan: ExecutionPlan): void { _repo.set(plan.id, plan); }
export function planRepoGet(id: string): ExecutionPlan | undefined { return _repo.get(id); }
export function planRepoList(): ExecutionPlan[] { return [..._repo.values()]; }

export function planRepoUpdate(id: string, patch: Partial<ExecutionPlan>): ExecutionPlan {
  const p = _repo.get(id);
  if (!p) throw new Error(`ExecutionPlan '${id}' not found`);
  Object.assign(p, patch, { updatedAt: Date.now() });
  plannerEventBus.publish("PlanUpdated", id, { goalId: p.goalId });
  return p;
}

export function planRepoArchive(id: string): ExecutionPlan {
  const p = _repo.get(id);
  if (!p) throw new Error(`ExecutionPlan '${id}' not found`);
  p.status    = "Archived";
  p.updatedAt = Date.now();
  p.auditLog.push(makeAuditEntry("archived"));
  plannerEventBus.publish("PlanArchived", id, { goalId: p.goalId });
  return p;
}

export function planRepoSearch(query: string): ExecutionPlan[] {
  const q = query.toLowerCase();
  return [..._repo.values()].filter(p =>
    p.title.toLowerCase().includes(q) ||
    p.objective.toLowerCase().includes(q) ||
    p.goalId.toLowerCase().includes(q)
  );
}

// ── PlannerEngine (main API) ──────────────────────────────────────────────────

/** 1. Create an ExecutionPlan from a Validated Goal */
export async function createPlan(goalId: string, identityContext: IdentityContext): Promise<ExecutionPlan> {
  const goal = getGoal(goalId);
  if (!goal)                   throw new Error(`Goal '${goalId}' not found`);
  if (goal.status !== "Validated") throw new Error(`Goal must be Validated. Current: ${goal.status}`);

  const { steps, risks, strategy, estimatedCost } = decomposeGoal(goal);

  const plan: ExecutionPlan = {
    id:                makePlanId(),
    goalId:            goal.id,
    title:             goal.title,
    description:       `Execution plan for: ${goal.primaryObjective}`,
    objective:         goal.primaryObjective,
    assumptions:       goal.assumptions,
    constraints:       goal.constraints,
    expectedOutcome:   goal.acceptanceCriteria[0] ?? goal.primaryObjective,
    estimatedDuration: goal.estimatedDuration,
    estimatedCost,
    confidenceScore:   goal.confidenceScore,
    executionStrategy: strategy,
    priority:          goal.priority as PlanPriority,
    steps,
    risks,
    status:            "Draft",
    journeyId:         null,
    auditLog:          [makeAuditEntry("created", { detail: `From Goal: ${goalId}` })],
    createdAt:         Date.now(),
    updatedAt:         Date.now(),
    metadata:          { sourceGoalId: goalId },
  };

  // Store draft in Working Memory
  await wme.store(identityContext, `plan_draft:${plan.id}`, { plan }, { priority: "high" });

  planRepoCreate(plan);
  plannerEventBus.publish("PlanCreated", plan.id, { goalId });
  return plan;
}

/** 2. Validate a plan and transition status */
export function validateAndApprovePlan(planId: string): { plan: ExecutionPlan; validation: PlanValidationResult } {
  const plan = planRepoGet(planId);
  if (!plan) throw new Error(`ExecutionPlan '${planId}' not found`);

  plan.auditLog.push(makeAuditEntry("validation_started"));
  const validation = validatePlan(plan);

  if (validation.valid) {
    plan.status = "Validated";
    plan.auditLog.push(makeAuditEntry("validated", { detail: `${plan.steps.length} steps, ${plan.risks.length} risks` }));
    plannerEventBus.publish("PlanValidated", planId, { goalId: plan.goalId });
  } else {
    plan.status = "Rejected";
    plan.auditLog.push(makeAuditEntry("rejected", { success: false, error: validation.errors.join("; ") }));
    plannerEventBus.publish("PlanRejected", planId, { goalId: plan.goalId });
  }

  plan.updatedAt = Date.now();
  plannerEventBus.publish("PlanUpdated", planId, { goalId: plan.goalId });
  return { plan, validation };
}

/** 3. JourneyBuilder — consumes ExecutionPlan → Journey (replaces direct Goal→Journey) */
export async function buildJourneyFromPlan(planId: string, identityContext: IdentityContext): Promise<string> {
  const plan = planRepoGet(planId);
  if (!plan)                    throw new Error(`ExecutionPlan '${planId}' not found`);
  if (plan.status !== "Validated") throw new Error(`Plan must be Validated. Current: ${plan.status}`);

  const journey = createJourney({
    title:           plan.title,
    objective:       plan.objective,
    description:     plan.description,
    priority:        plan.priority as any,
    owner:           identityContext.userId,
    identityContext,
    goal: {
      title:              plan.title,
      description:        plan.objective,
      subGoals:           plan.steps.map(s => s.title),
      constraints:        plan.constraints,
      acceptanceCriteria: [plan.expectedOutcome],
      expectedOutcome:    plan.expectedOutcome,
      priority:           plan.priority as any,
    },
    metadata: { sourcePlanId: plan.id, sourceGoalId: plan.goalId },
  });

  // Create Journey tasks from PlanSteps
  for (const step of plan.steps) {
    addTask(journey.id, {
      description:        step.title,
      requiredCapability: step.requiredCapabilities[0] ?? "mri",
      dependencies:       [], // step deps are plan-level; task deps resolved at runtime
      input:              { stepId: step.id, planId: plan.id, ...step.inputs },
      output:             {},
      metadata:           {
        sourcePlanId:    plan.id,
        stepId:          step.id,
        approvalRequired: step.approvalRequired,
        strategy:        step.executionStrategy,
      },
    });
  }

  plan.journeyId = journey.id;
  plan.status    = "ConvertedToJourney";
  plan.updatedAt = Date.now();
  plan.auditLog.push(makeAuditEntry("converted_to_journey", { detail: `Journey: ${journey.id}` }));

  await wme.evict(identityContext, `plan_draft:${planId}`).catch(() => {/* ignore */});

  plannerEventBus.publish("PlanConvertedToJourney", planId, { goalId: plan.goalId, journeyId: journey.id });
  return journey.id;
}