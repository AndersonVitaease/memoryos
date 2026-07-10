# GOVERNANCE.md
## MemoryOS Platform Governance

---

## Estrutura de Governança

O MemoryOS é governado por um processo formal e aberto, definido no MPEGS.

### Papéis

| Papel | Responsabilidade |
|---|---|
| **Core Team** | Aprovação de RFCs críticas, guardiões da Foundation |
| **Contributors** | Propõem RFCs, implementam features, revisam ADRs |
| **Specialists** | Revisores técnicos por domínio |
| **Community** | Feedback, issues, discussões abertas |

---

## Processo de Decisão

Toda decisão arquitetural segue o fluxo:

```
Proposta (RFC) → Discussão → Votação → ADR → Implementação → Release
```

### Critérios de Votação para RFC

| Tipo | Quórum | Aprovação |
|---|---|---|
| Minor (PATCH) | Core Team (1+) | Maioria simples |
| Feature (MINOR) | Core Team (2+) | Maioria simples |
| Breaking (MAJOR) | Core Team (todos) | Unanimidade |
| Critical | Core Team + Specialists | Supermaioria (75%) |

---

## Política de RFC

- RFCs são abertas para discussão pública por **mínimo 14 dias**
- RFCs críticas têm **mínimo 30 dias**
- Toda RFC deve ter ADR correspondente antes da implementação
- Nenhuma RFC pode ser retroativa

---

## Política de Depreciação

1. RFC de depreciação deve ser aprovada
2. Período de grace mínimo: **6 meses**
3. Aviso em todos os artefatos afetados
4. Migration guide obrigatório
5. Remoção só ocorre em release MAJOR

---

## Invariantes Permanentes

Estas regras nunca podem ser alteradas, nem por RFC:

1. O Core nunca conhece implementações concretas
2. Toda ação de alto risco exige aprovação humana
3. O AuditTrail é imutável
4. A Foundation v1.0 é a baseline de referência
5. Toda evolução passa por MRI + MQCCS antes do release

---

*Governança definida pelo MPEGS — MemoryOS Foundation v1.0.0*