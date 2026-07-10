// ─── Goal Engine ───────────────────────────────────────────────────────────────
// Foundation v1.0 · Builder · Validator · Repository · Integration with Journey Engine

import type {
  Goal, GoalStatus, GoalPriority, GoalComplexity,
  ValidationResult, AnalysisResult,
} from "./GoalTypes";
import { makeGoalId, makeAuditEntry } from "./GoalTypes";
import { analyzeIntent }              from "./GoalAnalyzer";
import { goalEventBus }               from "./GoalEvents";
import { createWorkingMemoryEngine }  from "@/lib/wme";
import { createJourney, addTask }     from "@/lib/journey/JourneyManager";
import type { IdentityContext }       from "@/lib/wme/types";

const { engine: wme } = createWorkingMemoryEngine();

// ── In-memory repository ──────────────────────────────────────────────────────

const _repo = new Map<string, Goal>();

// ── GoalBuilder ───────────────────────────────────────────────────────────────

export interface CreateGoalInput {
  userIntent: string;
  priority?: GoalPriority;
  identityContext: IdentityContext;
  metadata?: Record<string, unknown>;
}

function buildGoal(input: CreateGoalInput, analysis: AnalysisResult): Goal {
  const id  = makeGoalId();
  const now = Date.now();
  return {
    id,
    title:               analysis.suggestedTitle,
    description:         `Goal gerado a partir da intenção: "${input.userIntent}"`,
    userIntent:          input.userIntent,
    primaryObjective:    analysis.primaryObjective,
    secondaryObjectives: analysis.secondaryObjectives,
    constraints:         analysis.constraints,
    assumptions:         analysis.assumptions,
    requiredInformation: analysis.requiredInformation,
    requiredDocuments:   analysis.requiredDocuments,
    acceptanceCriteria:  analysis.acceptanceCriteria,
    priority:            input.priority ?? "Normal",
    estimatedComplexity: analysis.estimatedComplexity,
    estimatedDuration:   analysis.estimatedDuration,
    confidenceScore:     analysis.confidenceScore,
    status:              "Draft",
    journeyId:           null,
    auditLog:            [makeAuditEntry("created", { detail: `Intent: ${input.userIntent}` })],
    createdAt:           now,
    updatedAt:           now,
    metadata:            input.metadata ?? {},
  };
}

// ── GoalValidator ─────────────────────────────────────────────────────────────

export function validateGoal(goal: Goal): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!goal.title?.trim())             errors.push("title is required");
  if (!goal.userIntent?.trim())        errors.push("userIntent is required");
  if (!goal.primaryObjective?.trim())  errors.push("primaryObjective is required");
  if (!goal.acceptanceCriteria.length) errors.push("at least one acceptanceCriteria is required");

  if (goal.confidenceScore < 0.5)      warnings.push("Low confidence score — consider adding more context");
  if (!goal.estimatedDuration)         warnings.push("estimatedDuration not set");
  if (goal.requiredInformation.length === 0) warnings.push("no requiredInformation listed");

  return { valid: errors.length === 0, errors, warnings };
}

// ── GoalRepository ─────────────────────────────────────────────────────────────

export function repoCreate(goal: Goal): void  { _repo.set(goal.id, goal); }
export function repoGet(id: string): Goal | undefined { return _repo.get(id); }
export function repoList(): Goal[] { return [..._repo.values()]; }

export function repoUpdate(id: string, patch: Partial<Goal>): Goal {
  const g = _repo.get(id);
  if (!g) throw new Error(`Goal '${id}' not found`);
  Object.assign(g, patch, { updatedAt: Date.now() });
  return g;
}

export function repoArchive(id: string): Goal {
  const g = _repo.get(id);
  if (!g) throw new Error(`Goal '${id}' not found`);
  g.status    = "Archived";
  g.updatedAt = Date.now();
  g.auditLog.push(makeAuditEntry("archived"));
  goalEventBus.publish("GoalArchived", id);
  return g;
}

export function repoSearch(query: string): Goal[] {
  const q = query.toLowerCase();
  return [..._repo.values()].filter(g =>
    g.title.toLowerCase().includes(q) ||
    g.userIntent.toLowerCase().includes(q) ||
    g.primaryObjective.toLowerCase().includes(q)
  );
}

// ── GoalEngine (main API) ─────────────────────────────────────────────────────

/** 1. Receive intent → analyze → build → store in Working Memory → persist as Draft */
export async function processIntent(input: CreateGoalInput): Promise<Goal> {
  // Analyze
  const analysis = analyzeIntent(input.userIntent);

  // Build
  const goal = buildGoal(input, analysis);
  goal.status = "Analyzing";
  goal.auditLog.push(makeAuditEntry("analyzing", { detail: `Confidence: ${analysis.confidenceScore}` }));

  // Persist temporarily to Working Memory
  await wme.store(
    input.identityContext,
    `goal_draft:${goal.id}`,
    { goal, analysis },
    { priority: "high", metadata: { goalId: goal.id } }
  );

  // Persist to repository
  repoCreate(goal);
  goalEventBus.publish("GoalCreated", goal.id, { meta: { title: goal.title } });

  return goal;
}

/** 2. Validate a Goal — transition Draft/Analyzing → Validated or Rejected */
export async function validateAndPromote(goalId: string): Promise<{ goal: Goal; validation: ValidationResult }> {
  const goal = repoGet(goalId);
  if (!goal) throw new Error(`Goal '${goalId}' not found`);

  goal.status    = "Analyzing";
  goal.updatedAt = Date.now();
  goal.auditLog.push(makeAuditEntry("validation_started"));

  const validation = validateGoal(goal);

  if (validation.valid) {
    goal.status = "Validated";
    goal.auditLog.push(makeAuditEntry("validated", { detail: `Warnings: ${validation.warnings.length}` }));
    goalEventBus.publish("GoalValidated", goalId);
  } else {
    goal.status = "Rejected";
    goal.auditLog.push(makeAuditEntry("rejected", {
      success: false,
      error: validation.errors.join("; "),
    }));
    goalEventBus.publish("GoalRejected", goalId, { meta: { errors: validation.errors } });
  }

  goal.updatedAt = Date.now();
  goalEventBus.publish("GoalUpdated", goalId);
  return { goal, validation };
}

/** 3. Convert a Validated Goal into a Journey via JourneyManager */
export async function convertToJourney(goalId: string, identityContext: IdentityContext): Promise<string> {
  const goal = repoGet(goalId);
  if (!goal) throw new Error(`Goal '${goalId}' not found`);
  if (goal.status !== "Validated") throw new Error(`Goal must be Validated before conversion. Current: ${goal.status}`);

  // JourneyBuilder — builds Journey from Goal
  const journey = createJourney({
    title:           goal.title,
    objective:       goal.primaryObjective,
    description:     goal.description,
    priority:        goal.priority as any,
    owner:           identityContext.userId,
    identityContext,
    goal: {
      title:              goal.title,
      description:        goal.primaryObjective,
      subGoals:           goal.secondaryObjectives,
      constraints:        goal.constraints,
      acceptanceCriteria: goal.acceptanceCriteria,
      expectedOutcome:    goal.acceptanceCriteria[0] ?? goal.primaryObjective,
      priority:           goal.priority as any,
    },
    metadata: { sourceGoalId: goal.id, confidence: goal.confidenceScore },
  });

  // Add tasks for each required document/info as task items
  for (const doc of goal.requiredDocuments.slice(0, 5)) {
    addTask(journey.id, {
      description:         `Obter: ${doc}`,
      requiredCapability:  "mri",
      dependencies:        [],
      input:               { document: doc, goalId: goal.id },
      output:              {},
      metadata:            { sourceGoalId: goal.id },
    });
  }

  // Update goal
  goal.journeyId = journey.id;
  goal.status    = "ConvertedToJourney";
  goal.updatedAt = Date.now();
  goal.auditLog.push(makeAuditEntry("converted_to_journey", { detail: `Journey: ${journey.id}` }));

  // Remove from Working Memory (now permanent in Journey)
  await wme.evict(identityContext, `goal_draft:${goalId}`).catch(() => {/* ignore */});

  goalEventBus.publish("GoalConvertedToJourney", goalId, { journeyId: journey.id });
  goalEventBus.publish("GoalUpdated", goalId);

  return journey.id;
}