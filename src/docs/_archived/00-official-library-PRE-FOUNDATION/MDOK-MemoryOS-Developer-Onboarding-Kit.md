# MDOK — MemoryOS Developer Onboarding Kit
## Official Developer Onboarding & Engineering Environment

**Version:** 1.0  
**Status:** Official Engineering Operations  
**Foundation:** v1.0  
**Declared:** 2026-07-10  
**Authority:** Foundation Committee

---

## Objetivo

Criar oficialmente o processo de onboarding técnico do MemoryOS.

Este documento **NÃO altera:** Foundation · Core · Runtime · SDKs · APIs · Governança · MEB · MRI · MQCCS · MERS · MADS · MEOM

Seu objetivo é permitir que qualquer desenvolvedor configure o ambiente completo e entregue sua primeira Task seguindo todos os padrões da plataforma.

---

## Capítulo 1 — Filosofia

Todo novo desenvolvedor deverá conseguir — **sem auxílio externo**:

- Configurar o ambiente
- Executar a plataforma
- Compreender a Foundation
- Implementar uma Task
- Executar os pipelines
- Abrir um Pull Request

---

## Capítulo 2 — Requisitos do Ambiente

| Ferramenta | Versão Mínima | Observação |
|---|---|---|
| Sistema Operacional | macOS 13+ / Ubuntu 22.04+ / Windows 11 (WSL2) | WSL2 obrigatório no Windows |
| Node.js | 20 LTS | Use nvm para gerenciar versões |
| TypeScript | 5.0+ | Instalado via devDependencies |
| Gerenciador de pacotes | pnpm 8+ | `npm install -g pnpm` |
| Docker | 24+ | Docker Desktop recomendado |
| Docker Compose | v2 | Incluído no Docker Desktop |
| Banco de Dados | PostgreSQL 15+ | Via Docker |
| Redis | 7+ | Via Docker |
| Git | 2.40+ | `git --version` para verificar |
| GitHub CLI | 2.40+ | `gh auth login` após instalar |
| VS Code | latest | Editor oficial recomendado |

### Extensões VS Code Recomendadas

```
ms-vscode.vscode-typescript-next
bradlc.vscode-tailwindcss
esbenp.prettier-vscode
dbaeumer.vscode-eslint
eamodio.gitlens
ms-azuretools.vscode-docker
christian-kohler.path-intellisense
usernamehw.errorlens
```

### Variáveis de Ambiente (.env)

```env
# Runtime
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgresql://memoryos:memoryos@localhost:5432/memoryos_dev

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=dev-secret-change-in-production
JWT_EXPIRES_IN=7d

# AI (opcional em dev)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=...

# Observability
LOG_LEVEL=debug
ENABLE_AUDIT_TRAIL=true
```

---

## Capítulo 3 — Instalação

```bash
# 1. Clone do repositório
git clone https://github.com/memoryos/memoryos.git
cd memoryos

# 2. Instalação das dependências
pnpm install

# 3. Configuração do .env
cp .env.example .env
# Editar .env com valores locais

# 4. Inicialização do banco de dados
docker compose up -d postgres redis
pnpm db:migrate
pnpm db:seed

# 5. Execução do Runtime
pnpm dev

# 6. Validação da instalação
pnpm health:check
# Esperado: ✓ Runtime OK | ✓ DB OK | ✓ Redis OK | ✓ EventBus OK
```

---

## Capítulo 4 — Estrutura do Repositório

```
memoryos/
├── src/                    # Código fonte principal
│   ├── core/               # Core Layer — nunca alterar sem RFC
│   ├── runtime/            # Runtime Layer — tipos e contratos
│   ├── services/           # Services Layer — lógica de domínio
│   └── infrastructure/     # Infra — DB, cache, mensageria
├── packages/               # Packages compartilhados (monorepo)
├── sdk/                    # SDK público do MemoryOS
├── connectors/             # Conectores oficiais (MCF)
├── specialists/            # Specialists registrados (MCIS)
├── docs/                   # Documentação oficial (Library)
├── tests/                  # Testes de integração e E2E
├── scripts/                # Scripts de automação (CI/CD, migrations)
├── tools/                  # Ferramentas de desenvolvimento
├── examples/               # Exemplos de uso do SDK e conectores
└── .github/                # GitHub Actions (CI/CD pipeline)
```

| Diretório | Responsabilidade | Pode alterar? |
|---|---|---|
| `src/core/` | Core Layer — interfaces e contratos | Apenas com RFC |
| `src/runtime/` | Tipos e contratos Runtime | Apenas com RFC |
| `src/services/` | Lógica de domínio | Sim, com Task + Review |
| `sdk/` | SDK público | Apenas com RFC (breaking) |
| `connectors/` | Conectores MCF | Sim, com Task + Review |
| `docs/` | Biblioteca Oficial | Apenas com RFC |
| `tests/` | Testes de integração | Sim, sempre atualizar |

---

## Capítulo 5 — Primeira Execução

```bash
# Executar localmente
pnpm dev

# Validar logs
pnpm logs:tail

# Abrir interface (se disponível)
open http://localhost:3000

# Executar todos os testes
pnpm test

# Executar apenas testes unitários
pnpm test:unit

# Verificar observabilidade
pnpm audit:trail:check
pnpm metrics:check
```

**Checklist de saúde esperado:**
- `✓` Runtime iniciado na porta 3000
- `✓` PostgreSQL conectado
- `✓` Redis conectado
- `✓` EventBus inicializado
- `✓` AuditTrail ativo
- `✓` Todos os testes passando

---

## Capítulo 6 — Primeira Task

### Exemplo: Criar um Memory Validator

```bash
# 1. Criar branch
git checkout -b feature/memory-validator-email

# 2. Implementar (src/services/validators/EmailMemoryValidator.ts)
# Seguir os princípios MDS, MRS, MCS

# 3. Executar testes unitários
pnpm test:unit -- EmailMemoryValidator

# 4. Executar MRI
pnpm mri:run

# 5. Executar MQCCS
pnpm mqccs:run

# 6. Executar MERS
pnpm mers:run

# 7. Verificar MADS drift
pnpm mads:check

# 8. Abrir PR
gh pr create --title "feat(validators): add EmailMemoryValidator" \
  --body "Closes #123 — Adds email validation for memory entries"
```

### Template de implementação

```typescript
// src/services/validators/EmailMemoryValidator.ts
// MDS Cap.4 — Validation Layer
// MRS Cap.3 — Service Contract

import { IMemoryValidator } from '@/core/interfaces/IMemoryValidator';
import { IdentityContext } from '@/runtime/types/IdentityContext';
import { ValidationResult } from '@/runtime/types/ValidationResult';

/**
 * Validates email-type memory entries.
 * @implements IMemoryValidator
 * @see MDS Cap.4
 */
export class EmailMemoryValidator implements IMemoryValidator {
  validate(value: string, ctx: IdentityContext): ValidationResult {
    // implementation
  }
}
```

---

## Capítulo 7 — CI/CD

```
Commit
  ↓ Build (tsc --noEmit)
  ↓ Lint (eslint + prettier)
  ↓ Unit Tests (pnpm test:unit)
  ↓ Integration Tests (pnpm test:integration)
  ↓ MRI (pnpm mri:run)
  ↓ MQCCS (pnpm mqccs:run)
  ↓ MERS (pnpm mers:run)
  ↓ MADS (pnpm mads:check)
  ↓ Deploy (apenas em main)
```

| Etapa | Ferramenta | Falha = |
|---|---|---|
| Build | TypeScript compiler | Bloqueador |
| Lint | ESLint + Prettier | Bloqueador |
| Unit Tests | Vitest | Bloqueador |
| Integration Tests | Vitest + testcontainers | Bloqueador |
| MRI | pnpm mri:run | Bloqueador |
| MQCCS | pnpm mqccs:run | Bloqueador |
| MERS | pnpm mers:run | Bloqueador |
| MADS | pnpm mads:check | Bloqueador (Critical drift) |
| Deploy | GitHub Actions + Docker | Somente main aprovado |

---

## Capítulo 8 — Ambientes

| Ambiente | Objetivo | Promoção |
|---|---|---|
| **Local** | Desenvolvimento individual | Manual, sem restrição |
| **Development** | Integração contínua do time | Merge em `develop` + CI pass |
| **QA** | Validação funcional pelo time de QA | Deploy manual por Release Manager |
| **Staging** | Homologação final, espelho de produção | Aprovação do Tech Lead + PO |
| **Production** | Ambiente live | Release tag + MERS Final aprovado |

### Regras de Promoção

- `Local → Development`: PR aprovado + CI passando
- `Development → QA`: Sprint Review aprovado + MERS emitido
- `QA → Staging`: QA sign-off + sem bugs críticos abertos
- `Staging → Production`: Release Manager + Tech Lead + PO + MERS Final

---

## Capítulo 9 — Pair Programming com IA

### Usos permitidos

| Uso | Exemplo | Revisão obrigatória |
|---|---|---|
| Gerar código | "Implementa o método store() conforme IWorkingMemoryStore" | SIM |
| Explicar arquitetura | "Explica o fluxo de eventos no EventBus" | Não (consulta) |
| Escrever testes | "Gera testes unitários para EmailMemoryValidator" | SIM |
| Refatorar | "Refatora para reduzir complexidade ciclomática" | SIM |
| Gerar documentação | "Gera JSDoc para esta função" | SIM |
| Detectar bugs | "Revisa este código por possíveis memory leaks" | SIM |

### Regras obrigatórias

1. **Toda sugestão de código deve ser revisada por um desenvolvedor humano antes do merge**
2. Nunca aceitar código gerado por IA sem entender o que ele faz
3. Nunca usar IA para contornar as validações MRI/MQCCS/MERS
4. Código gerado deve seguir os mesmos padrões que código humano
5. O desenvolvedor é responsável pelo código, independente da origem

---

## Capítulo 10 — Troubleshooting

| Problema | Causa provável | Solução |
|---|---|---|
| `pnpm install` falha | Node.js versão errada | `nvm use 20` |
| Banco indisponível | Docker não iniciado | `docker compose up -d postgres` |
| Redis connection refused | Redis não iniciado | `docker compose up -d redis` |
| `tsc` errors | TypeScript incompatível | `pnpm install` + verificar `tsconfig.json` |
| Dependências circulares | Import incorreto | Verificar imports, usar interfaces |
| Falha no MRI | Cenário de referência não passa | Revisar implementação contra MRI spec |
| Falha no MQCCS | Cobertura abaixo do mínimo | Adicionar testes faltantes |
| Falha no MERS | Architecture/Security score baixo | Revisar MESR report, endereçar bloqueadores |
| Falha no MADS | Drift crítico detectado | Revisar MADS report, corrigir antes do merge |
| Docker sem memória | Recursos insuficientes | Aumentar memória no Docker Desktop (≥ 4GB) |

---

## Capítulo 11 — Checklist do Novo Desenvolvedor

```
□ Ambiente configurado (Node, pnpm, Docker)
□ Repositório clonado e dependências instaladas
□ .env configurado e válido
□ Runtime funcionando (pnpm dev)
□ Todos os testes executados (pnpm test)
□ MRI aprovado localmente
□ MQCCS aprovado localmente
□ Foundation estudada (MV, MPS, MAS, MDS, MRS, MCS)
□ MEOM lido (processo operacional)
□ Primeiro PR aberto
□ Primeira revisão de PR concluída (como reviewer)
□ Primeira Task merged
```

---

## Critérios de Aceitação

- ✓ Qualquer desenvolvedor consegue configurar o ambiente seguindo apenas este guia
- ✓ A primeira Task pode ser implementada sem auxílio externo
- ✓ Todo o pipeline pode ser executado localmente
- ✓ O processo de onboarding está padronizado
- ✓ O tempo médio para entregar a primeira contribuição é minimizado

---

## Declaração Final

O MDOK oficializa o processo de onboarding técnico do MemoryOS.

- A **Foundation** define a plataforma.
- O **MEOM** define como a equipe trabalha.
- O **MDOK** garante que qualquer novo desenvolvedor consiga ingressar no projeto rapidamente, configurar o ambiente, compreender a arquitetura e contribuir seguindo integralmente os padrões de engenharia estabelecidos pela Foundation v1.0.

**Este documento não cria novas funcionalidades. Não altera a arquitetura. Não modifica a Foundation.** Seu único objetivo é reduzir o tempo entre a chegada de um desenvolvedor e sua primeira contribuição de qualidade para o MemoryOS.

---

*MDOK v1.0 — MemoryOS Foundation v1.0 — Declarado em 2026-07-10*