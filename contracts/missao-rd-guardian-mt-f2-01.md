# MISSÃO RD-GUARDIAN-MT-F2-01 — Guardian multi-tenant F2: auth por consolidador (login, usuários, permissões)

**Fonte:** fase F2 de `/opt/operator-harness/doctrine/DESIGN-guardian-mt-01.md` (fechado PASS) · dependência: F1 (na fila após F0) · **Intent do operator 05/10**
**Componente:** mission-ops + camada de auth (`/opt/operator-harness/plugins/mission-ops/` + gateway)
**Decisão de produto (capture `ec4c373d`):** o colaborador faz LOGIN NO HERMES AGENT; cada consolidadora = 1 tenant; colaboradores = usuários do tenant operando como o operador faz hoje.

**Escopo (worker):**
1. **Identidade:** usuário+senha (ou token de dispositivo) por usuário; tenant obrigatório no login; roles por tenant (`owner` consolidadora / `collaborator`).
2. **Sessão:** token de sessão assinado (HMAC, chave do tenant), TTL, revogação; toda ação do usuário carrega `tenantId+userId` no audit (`/data/audit`).
3. **Permissões:** colaborador = operar missões/tools DO SEU tenant; financeiro/aprovação SEMPRE tier operator (nunca interceptável pela camada rápida) — herda a doutrina; owner da consolidadora vê custos do próprio tenant apenas.
4. **Integração com o token de ordem:** ordens de consequência por tenant continuam exigindo o token do OPERATOR global (SEC-OPERATOR-IDENTITY-01) — colaborador NUNCA autoriza produção.
5. **Compatibilidade:** o login do operator (você) continua exatamente como hoje (token de ordem + herdr) — zero quebra.
6. Suítes: login/roles/sessão/audit/permission matrix + existentes verdes.

**Proibido:** armazenar senha em claro; expor material de chave em logs; tocar em produção eng-mcp.
**Entrega:** relatório + verify.json (verdict REAL) + resumo no pane com PASS/FAIL + PARE.
