# Checkpoint — Pre Supervised Engineering Read Verification

**Data:** 2026-08-20
**Status:** ANTES da implementação

## Contexto

Auditoria anterior confirmou causa raiz:

- OpenHands executou corretamente (retornou `base44-app` como nome do projeto em `package.json`).
- ENG-MCP `engineering.git.status/diff/log` executaram corretamente.
- Porém os steps de verificação eram operações de **git** (status/diff/log) — projetadas para detectar **mudanças de código** (write operations).
- Para tarefas **read-only** de inspeção de arquivo, essas etapas **não conseguem confirmar** que o conteúdo do arquivo foi lido.
- `evaluate` corretamente marcou todos os requisitos como `unverified` (evidence insufficient → unverified).
- Round 2 não resolveu porque os mesmos steps de verificação foram gerados novamente.

## Decisão

Adicionar step condicional `verify-file-read` usando `engineering.file.read` (ENG-MCP) quando:
1. `mode != "write"`
2. A missão contém claramente um arquivo/path extraído deterministicamente (regex, sem LLM).

## Arquivo a alterar

- `src/lib/execution-intelligence/adaptive-process/SupervisedEngineeringProcess.ts`

## Arquivos NÃO alterados

- AdaptiveProcess.ts
- AdaptiveProcessConnector.ts
- OpenHandsConnector.ts
- openHandsTaskProcess
- GoalRegistry.ts
- GoalCapabilityRegistry.ts
- ConnectorRuntimeProvider.ts
- Runtime.ts
- SafetyGate.ts
- ENG-MCP (servidor externo)
- deriveRequirements (método interno, preservado)
- evaluate (método interno, preservado)