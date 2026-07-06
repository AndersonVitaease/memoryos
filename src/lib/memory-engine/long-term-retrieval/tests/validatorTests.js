/**
 * Validator test cases (Sprint 25 — LTM Retrieval)
 * Tests 15–20: validateRetrievalRequest / validateRetrievalResult
 */

import {
  buildRetrievalRequest,
  buildRetrievalResult,
  validateRetrievalRequest,
  validateRetrievalResult,
} from "../longTermRetrieval";
import { _resetForTests } from "../longTermRetrievalEngine";

export const VALIDATOR_TESTS = [
  {
    id: 15,
    name: "validateRetrievalRequest accepts valid",
    run: () => {
      _resetForTests();
      const req = buildRetrievalRequest({});
      return { v: validateRetrievalRequest(req) };
    },
    assert: ({ v }) => v.valid === true && v.error === null,
  },
  {
    id: 16,
    name: "validateRetrievalRequest rejects null",
    run: () => {
      return { v: validateRetrievalRequest(null) };
    },
    assert: ({ v }) => v.valid === false,
  },
  {
    id: 17,
    name: "validateRetrievalRequest rejects missing fields",
    run: () => {
      return { v: validateRetrievalRequest({ requestId: "x" }) };
    },
    assert: ({ v }) => v.valid === false,
  },
  {
    id: 18,
    name: "validateRetrievalResult accepts valid",
    run: () => {
      _resetForTests();
      const res = buildRetrievalResult({ requestId: "ltr-req-1" });
      return { v: validateRetrievalResult(res) };
    },
    assert: ({ v }) => v.valid === true,
  },
  {
    id: 19,
    name: "validateRetrievalResult rejects null",
    run: () => {
      return { v: validateRetrievalResult(null) };
    },
    assert: ({ v }) => v.valid === false,
  },
  {
    id: 20,
    name: "validateRetrievalResult rejects missing fields",
    run: () => {
      return { v: validateRetrievalResult({ retrievalId: "x" }) };
    },
    assert: ({ v }) => v.valid === false,
  },
];