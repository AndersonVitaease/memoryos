# github-app-bootstrap-01 — PAT DE USUÁRIO → GITHUB APP (com bootstrap guiado do App)

Contexto: gh-app-token-01 (fechada 28/09) entregou `src/githubAppAuth.ts` (JWT RS256 → installation token de
~10min, cache single-flight, fail-closed, scrub) — commit `d4ea66f9`, SEM deploy e SEM App criado. Este gate
fecha a última milha: o App em si e a aposentadoria do PAT de usuário.

## Restrição de fronteira (inegociável)
O OPERATOR é quem cria o App (autoridade da conta GitHub não delega para a VPS). A missão reduz o esforço dele
a **1 clique + 1 código**, via MANIFEST FLOW oficial:
1. Tool `engineering.github.app.bootstrap` (novo verbo read-only): gera o manifest JSON (nome, permissões
   **read-only**: Contents:read, Metadata:read — NADA de write; webhooks: off; callback URL loopback) + a URL
   pronta `https://github.com/settings/apps/new?state=<manifest>` e entrega ao operator.
2. Operator: abre o link, confere permissões, clica "Create GitHub App", copia o **one-time code**.
3. Operator cola o código no chat. A missão: troca o código (`POST /app-manifests/<code>/conversions`) →
   recebe app_id + PEM → grava `/opt/eng-mcp-secrets/github-app.private-key.pem` (permissão 600, mesmo padrão
   de higiene da pat-hygiene: segredo nunca em nome de arquivo nem em log) → grava config
   (`GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID`) → valida E2E a troca de token real → redeploy do :8787.
4. **Aposentadoria do PAT**: com o App validado, mapear consumidores do PAT, propor ao operator a revogação
   (a revogação em si é decisão dele — nunca automática). `git.push` continua no `git-credentials` do operator
   (fora de escopo, decisão separada — gh-app-token-01 §1).

## Entrega
- Módulo bootstrap no eng-mcp + deploy no :8787; E2E real do manifest conversion (com o código real do
  operator, que chega DURANTE a missão via supervisor) — a troca é única; se o código expirar (1h), regenerar
  o link e pedir outro.
- Rotação de PEM documentada e testada: generate new key no GitHub → trocar o arquivo → cache invalidado →
  E2E → revogar a antiga (proposta de trilha `mcp-import`/audit).
- Relatório: /opt/memoryos/eng-mcp/RELATORIO-github-app-bootstrap-01.md + verify-<missionId>.json (dono no manifesto — runner exige).
- Trilha: nenhum valor de PEM/JWT/token em log; scrub obrigatório (padrão gh-app-token-01).

## Passo 0 (AGORA, antes do deploy): preparar o material do operator
Entregar ao supervisor o link do manifest + instruções de 2 linhas, para o operator clicar CEDO (a troca do
código pode acontecer depois, quando o deploy estiver pronto).

## Restrições
- Componente eng-mcp (livre após close da mcp-import-gate-01). Deploy :8787 autorizado.
- Não abrir: gpu-watchdog (01c acabou de fechar — estabilizar), deliver-verify, mission-ops, guardian-compute
  (volume em decisão), fast-router/shadow-router (sombra).
- PAT de usuário NUNCA removido nem revogado automaticamente; fallback precisa continuar de pé até revogação
  decidida pelo operator.