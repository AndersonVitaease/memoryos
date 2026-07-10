# Policy Template
## MemoryOS Policy — Template Oficial

---

## Estrutura de uma Policy

```typescript
export interface PolicyRule {
  ruleId:      string;
  name:        string;
  description: string;
  condition:   (context: PolicyContext) => boolean;
  action:      "allow" | "deny" | "require_approval";
  riskLevel:   "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface PolicyContext {
  userId:        string;
  action:        string;
  resource:      string;
  identityContext: string;
  metadata?:     Record<string, unknown>;
}

export class MyPolicy {
  readonly policyId = "my-policy";
  readonly rules: PolicyRule[] = [
    {
      ruleId:      "rule-001",
      name:        "Block unauthorized access",
      description: "Deny access if user is not authorized",
      condition:   (ctx) => !ctx.userId,
      action:      "deny",
      riskLevel:   "HIGH",
    },
  ];

  evaluate(ctx: PolicyContext): { allowed: boolean; reason?: string } {
    for (const rule of this.rules) {
      if (rule.condition(ctx)) {
        return {
          allowed: rule.action === "allow",
          reason:  rule.name,
        };
      }
    }
    return { allowed: true };
  }
}
```

---

*MemoryOS Foundation v1.0.0 — 2026-07-10*