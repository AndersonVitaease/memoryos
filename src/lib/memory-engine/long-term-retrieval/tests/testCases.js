/**
 * Aggregated test cases (Sprint 25 — LTM Retrieval)
 *
 * Combina todos os grupos de testes em uma única lista ordenada por id.
 */

import { BUILDER_TESTS } from "./builderTests";
import { VALIDATOR_TESTS } from "./validatorTests";
import { RETRIEVE_TESTS } from "./retrieveTests";
import { RETRIEVE_BY_TESTS } from "./retrieveByTests";
import { MISC_TESTS } from "./miscTests";

export const LTM_RETRIEVAL_TEST_CASES = [
  ...BUILDER_TESTS,
  ...VALIDATOR_TESTS,
  ...RETRIEVE_TESTS,
  ...RETRIEVE_BY_TESTS,
  ...MISC_TESTS,
];