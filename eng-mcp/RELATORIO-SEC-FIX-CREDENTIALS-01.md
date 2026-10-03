# RELATORIO-SEC-FIX-CREDENTIALS-01

## Problema
SEC-SURFACE-01 achou ALTO: `/root/.git-credentials` com token GitHub em texto plano via `credential.helper=store`.

## Inventário (passo 1)
- `git config --global`: `credential.helper=store` (única ocorrência; system não define).
- `/root/.git-credentials`: 1 linha, host `github.com`, usuário `AndersonVitaease`, token prefixo `gith***` (nunca impresso em claro).
- Remotes que dependem do helper (HTTPS com auth):
  - `/opt/memoryos` → `https://AndersonVitaease@github.com/AndersonVitaease/memoryos.git` (único com push).
- Remotes públicos (clone read-only, sem credencial): `/opt/ai-cost-01/llama.cpp`, `/opt/whisper-mcp/whisper.cpp`, `/opt/vlm-local/llama.cpp`, `/opt/memoryos/librechat`, `/root/.nvm`.

## Proposta de migração (passo 2 — ANTES de executar)
- **Preferida: SSH key (ssh-agent) para github.com.** Passos do OPERATOR (consequência externa):
  1. Gerar par local: `ssh-keygen -t ed25519 -C "git@host" -f ~/.ssh/id_ed25519_github`.
  2. Publicar a chave pública em https://github.com/settings/keys (botão "New SSH key").
  3. Trocar remote: `git -C /opt/memoryos remote set-url origin git@github.com:AndersonVitaease/memoryos.git`.
  4. Revogar o PAT antigo em https://github.com/settings/tokens (localizar o token prefixo `gith***`).
  5. Remover `/root/.git-credentials` e `git config --global --unset credential.helper`.
- **Alternativa (adotada parcialmente agora): manter helper store, arquivo 0600 + rotação do token pelo OPERATOR** (mesmo link de revogação acima; novo token substitui a linha do arquivo).

## Executado (passo 3 — só repositório local)
- `chmod 600 /root/.git-credentials` → `stat`: `600 root /root/.git-credentials`. (Já estava 600 no momento da execução; chmod reafirmado idempotente.)
- `credential.helper` mantido como `store` (alternativa 2), pois trocar para SSH exige chave que NÃO podemos criar (escopo proíbe).

## Prova (passo 5)
- `git -C /opt/memoryos ls-remote origin HEAD` → exit 0, SHA `c711a07c46453ae5e173ec2493d718b419701544` (output sem token).
- `stat -c '%a %n' /root/.git-credentials` → `600 /root/.git-credentials`.

## Passos do OPERATOR (não executados — consequência externa)
1. Rotação: criar novo PAT (fine-grained, escopo mínimo) em https://github.com/settings/tokens → atualizar a linha de `/root/.git-credentials`.
2. Revogar o PAT antigo (prefixo `gith***`) no mesmo link.
3. Migração SSH (preferida): https://github.com/settings/keys + `remote set-url` + desativar helper (comandos na proposta acima).

## Dívidas
- Token antigo continua válido até rotação pelo OPERATOR (fora do escopo desta missão).

PASS
PARE