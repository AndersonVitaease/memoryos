# SECURITY.md
## MemoryOS Security Policy

---

## Princípios de Segurança

O MemoryOS foi projetado com segurança como invariante arquitetural:

1. **Zero Trust** — Toda ação é avaliada pelo SecurityGate antes da execução
2. **Principle of Least Privilege** — Connectors recebem apenas as permissões necessárias
3. **Human Approval Gates** — Ações de risco alto/crítico exigem aprovação humana
4. **Immutable Audit** — AuditTrail é append-only e não pode ser modificado
5. **Identity Isolation** — Contextos são isolados por identidade do usuário

---

## Níveis de Risco

| Nível | Exemplos | Ação |
|---|---|---|
| LOW | Leituras, consultas | Execução automática |
| MEDIUM | Escritas reversíveis | Execução automática + audit |
| HIGH | Escritas irreversíveis | Requer aprovação humana |
| CRITICAL | Exclusões permanentes | Requer aprovação explícita |

---

## Reporte de Vulnerabilidades

Para reportar uma vulnerabilidade de segurança:

1. **Não abra uma issue pública**
2. Envie detalhes ao Core Team via canal seguro
3. Aguarde confirmação em até 48 horas
4. Coordene a divulgação responsável

---

## Política de Patches de Segurança

- Vulnerabilidades críticas: patch em até 24 horas
- Vulnerabilidades altas: patch em até 72 horas
- Vulnerabilidades médias: próximo release
- Todo patch de segurança bypassa período de discussão da RFC

---

*MemoryOS Foundation v1.0.0 — 2026-07-10*