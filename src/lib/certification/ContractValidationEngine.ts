/**
 * ContractValidationEngine.ts — EV-5.1
 * Validates input/output schemas for every pipeline stage.
 * A contract violation → FAIL. No exceptions.
 */

export interface ContractSchema {
  requiredFields: string[];
  fieldTypes?: Record<string, "string" | "number" | "boolean" | "object" | "array">;
  allowEmpty?: boolean;
}

export interface ContractValidationResult {
  stageName: string;
  inputValid: boolean;
  outputValid: boolean;
  inputViolations: string[];
  outputViolations: string[];
  passed: boolean;
}

export const STAGE_CONTRACTS: Record<string, { input: ContractSchema; output: ContractSchema }> = {
  Intent: {
    input:  { requiredFields: ["raw"], fieldTypes: { raw: "string" } },
    output: { requiredFields: ["type", "confidence"], fieldTypes: { type: "string", confidence: "number" } },
  },
  Goal: {
    input:  { requiredFields: ["intentType"], fieldTypes: { intentType: "string" } },
    output: { requiredFields: ["type"], fieldTypes: { type: "string" } },
  },
  Planning: {
    input:  { requiredFields: ["goalType"], fieldTypes: { goalType: "string" } },
    output: { requiredFields: ["steps"], allowEmpty: false },
  },
  Decision: {
    input:  { requiredFields: ["plan"], fieldTypes: { plan: "object" } },
    output: { requiredFields: ["decision", "approved"], fieldTypes: { decision: "string", approved: "boolean" } },
  },
  Memory: {
    input:  { requiredFields: [], allowEmpty: true },
    output: { requiredFields: [], allowEmpty: true },
  },
  Knowledge: {
    input:  { requiredFields: [], allowEmpty: true },
    output: { requiredFields: [], allowEmpty: true },
  },
  Connector: {
    input:  { requiredFields: ["connector"], fieldTypes: { connector: "string" } },
    output: { requiredFields: ["available"], fieldTypes: { available: "boolean" } },
  },
  API: {
    input:  { requiredFields: ["endpoint"], fieldTypes: { endpoint: "string" } },
    output: { requiredFields: ["status"], fieldTypes: { status: "number" } },
  },
  Parser: {
    input:  { requiredFields: [], allowEmpty: true },
    output: { requiredFields: ["parsed"], fieldTypes: { parsed: "boolean" } },
  },
  Composer: {
    input:  { requiredFields: [], allowEmpty: true },
    output: { requiredFields: ["composerType"], fieldTypes: { composerType: "string" } },
  },
  Response: {
    input:  { requiredFields: [], allowEmpty: true },
    output: { requiredFields: ["format"], fieldTypes: { format: "string" } },
  },
  Governance: {
    input:  { requiredFields: [], allowEmpty: true },
    output: { requiredFields: [], allowEmpty: true },
  },
  Audit: {
    input:  { requiredFields: [], allowEmpty: true },
    output: { requiredFields: ["auditId"], fieldTypes: { auditId: "string" } },
  },
};

function validate(schema: ContractSchema, data: Record<string, unknown>): string[] {
  const violations: string[] = [];
  if (!schema.allowEmpty && Object.keys(data).length === 0) {
    violations.push("Output is empty — at least one field required");
  }
  for (const field of schema.requiredFields) {
    if (!(field in data) || data[field] === undefined || data[field] === null) {
      violations.push(`Required field "${field}" is missing or null`);
    }
  }
  if (schema.fieldTypes) {
    for (const [field, expectedType] of Object.entries(schema.fieldTypes)) {
      if (field in data) {
        const val = data[field];
        const actualType = Array.isArray(val) ? "array" : typeof val;
        if (actualType !== expectedType) {
          violations.push(`Field "${field}" must be ${expectedType} but got ${actualType}`);
        }
      }
    }
  }
  return violations;
}

export const ContractValidationEngine = Object.freeze({
  validate(
    stageName: string,
    input: Record<string, unknown>,
    output: Record<string, unknown>
  ): ContractValidationResult {
    const contract = STAGE_CONTRACTS[stageName];
    if (!contract) {
      return { stageName, inputValid: true, outputValid: true, inputViolations: [], outputViolations: [], passed: true };
    }
    const inputViolations  = validate(contract.input,  input);
    const outputViolations = validate(contract.output, output);
    return {
      stageName,
      inputValid:       inputViolations.length === 0,
      outputValid:      outputViolations.length === 0,
      inputViolations,
      outputViolations,
      passed:           inputViolations.length === 0 && outputViolations.length === 0,
    };
  },

  validateAll(
    stages: Array<{ name: string; input?: Record<string, unknown>; output?: Record<string, unknown> }>
  ): ContractValidationResult[] {
    return stages.map(s => ContractValidationEngine.validate(s.name, s.input ?? {}, s.output ?? {}));
  },
});