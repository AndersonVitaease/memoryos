// ══════════════════════════════════════════════════════════════════════════════
// AVP-04 — Session Isolation Audit
// ══════════════════════════════════════════════════════════════════════════════

import type { AVPAuditResult } from "../AVPTypes";
import { makeAudit, finalise, finding, makeChain, inp } from "../AVPHelpers";

export async function runAVP04(): Promise<AVPAuditResult> {
  const a = makeAudit("AVP-04", "Session Isolation Audit");

  // Simulate 10 concurrent users, each with 5 sessions
  const users = Array.from({ length: 10 }, (_, u) => ({
    userId:  `user-iso-${u}`,
    sessions: Array.from({ length: 5 }, (_, s) => `sess-iso-${u}-${s}`),
  }));

  const allResults: Array<{ userId: string; sessionId: string; chainId: string; status: string }> = [];

  const promises = users.flatMap(user =>
    user.sessions.map(sessionId => {
      const chain = makeChain(`avp04-${user.userId}-${sessionId}`);
      return chain.execute(inp(`User ${user.userId} session ${sessionId} query`, sessionId, user.userId))
        .then(r => ({
          userId:    r.userId,
          sessionId: r.sessionId,
          chainId:   r.chainId,
          status:    r.status,
        }))
        .catch(() => ({ userId: user.userId, sessionId, chainId: "", status: "FAILED" }));
    })
  );

  const results = await Promise.all(promises);
  allResults.push(...results);

  // User isolation: each result must carry correct userId
  let userMismatches = 0;
  for (const r of results) {
    if (!r.userId) { userMismatches++; continue; }
    // userId must match one of our simulated users
    if (!users.some(u => u.userId === r.userId)) userMismatches++;
  }
  if (userMismatches > 0) {
    finding(a, "CRITICAL", "UserIsolation", `${userMismatches} results had wrong or missing userId`);
    a.score -= 25;
  }

  // Session isolation: each chainId must be unique
  const chainIds = results.map(r => r.chainId).filter(Boolean);
  const uniqueChainIds = new Set(chainIds);
  if (uniqueChainIds.size < chainIds.length) {
    finding(a, "CRITICAL", "SessionIsolation", `Duplicate chainIds detected: ${chainIds.length - uniqueChainIds.size} collisions`);
    a.score -= 30;
  }

  // All must complete
  const failed = results.filter(r => r.status !== "COMPLETED").length;
  if (failed > 0) {
    finding(a, "HIGH", "ExecutionFailure", `${failed}/${results.length} executions failed`);
    a.score -= Math.round((failed / results.length) * 30);
  }

  // Memory isolation: reports must be frozen (no shared mutable state)
  const frozenCheck = await Promise.all(
    users.slice(0, 3).map(u => {
      const chain = makeChain(`avp04-freeze-${u.userId}`);
      return chain.execute(inp("isolation freeze test", u.sessions[0], u.userId)).then(r => Object.isFrozen(r));
    })
  );
  if (frozenCheck.some(ok => !ok)) {
    finding(a, "HIGH", "MemoryIsolation", "ExecutionChainReport is not frozen — shared state risk");
    a.score -= 20;
  }

  a.metrics["totalExecutions"] = results.length;
  a.metrics["uniqueChainIds"]  = uniqueChainIds.size;
  a.metrics["userMismatches"]  = userMismatches;
  a.metrics["failedExecutions"] = failed;
  a.score = Math.max(0, Math.min(100, a.score));
  return finalise(a);
}