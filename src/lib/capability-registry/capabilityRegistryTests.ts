// capabilityRegistryTests.ts — stub exports required by CapabilityRegistry page

export interface TestResult {
  name: string;
  passed: boolean;
  durationMs: number;
  detail?: string;
  observation?: string;
  error?: string;
}

export async function runCapabilityRegistryTests(): Promise<TestResult[]> {
  return [];
}