/**
 * index.ts — Specialist Runtime
 * Exports oficiais do modulo Specialist Runtime.
 * MDS v2.0 · Chapter 2 — Engineering Conventions
 */

export { FinancialSpecialist } from "./FinancialSpecialist";
export { LegalSpecialist }     from "./LegalSpecialist";
export { MedicalSpecialist }   from "./MedicalSpecialist";
export { TechSpecialist }      from "./TechSpecialist";
export { runSpecialistTests }  from "./specialistTests";
export type {
  SpecialistDomain,
  SpecialistManifest,
  SpecialistRequest,
  SpecialistResponse,
  SpecialistFact,
  SpecialistHealthResult,
  SpecialistMetrics,
  SpecialistTestReport,
  SpecialistTestResult,
} from "./SpecialistTypes";