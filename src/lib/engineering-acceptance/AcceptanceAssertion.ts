/**
 * AcceptanceAssertion.ts — Sprint 6.3.2
 * Assertion helpers for scenario runners
 */

import type { AcceptanceStatus } from "./EAFTypes";

export interface AssertionBuilder {
  pass(detail: string): { status: AcceptanceStatus; detail: string };
  fail(detail: string, rca?: string): { status: AcceptanceStatus; detail: string; rca?: string };
  skip(reason: string): { status: AcceptanceStatus; detail: string };
  blocked(reason: string): { status: AcceptanceStatus; detail: string };
  fromBoolean(ok: boolean, passDetail: string, failDetail: string, rca?: string): {
    status: AcceptanceStatus; detail: string; rca?: string;
  };
}

export const assert: AssertionBuilder = {
  pass: (detail) => ({ status: "PASS", detail }),
  fail: (detail, rca) => ({ status: "FAIL", detail, rca }),
  skip: (reason) => ({ status: "SKIP", detail: reason }),
  blocked: (reason) => ({ status: "BLOCKED", detail: reason }),
  fromBoolean: (ok, passDetail, failDetail, rca) =>
    ok
      ? { status: "PASS", detail: passDetail }
      : { status: "FAIL", detail: failDetail, rca },
};

export function aggregateStatus(statuses: AcceptanceStatus[]): AcceptanceStatus {
  if (statuses.some(s => s === "FAIL")) return "FAIL";
  if (statuses.some(s => s === "BLOCKED")) return "BLOCKED";
  if (statuses.every(s => s === "PASS")) return "PASS";
  if (statuses.some(s => s === "SKIP")) return "SKIP";
  return "PENDING";
}