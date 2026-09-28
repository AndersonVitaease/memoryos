# GitHub App bootstrap — eng-mcp (GH-APP-TOKEN-01)

O **único** passo manual, uma vez na vida. Depois disto o eng-mcp gera sozinho um
installation token (~1h) sob demanda e o renova antes de expirar; nenhuma PAT
para rotacionar. Nada aqui imprime segredo.

## 1. Criar o GitHub App (UI, ~3 min)

GitHub → foto → **Settings** → **Developer settings** → **GitHub Apps** → **New GitHub App**
(URL direta: https://github.com/settings/apps/new)

| Campo | Valor |
|---|---|
| GitHub App name | `memoryos-eng-mcp` (se ocupado: `memoryos-eng-mcp-av`) |
| Homepage URL | `https://github.com/AndersonVitaease/memoryos` |
| Callback URL | **vazio** |
| Request user authorization (OAuth) during installation | **desmarcado** |
| Setup URL | vazio |
| Webhook → Active | **desmarcado** (webhook desativado) |
| Repository permissions → **Contents** | **Read-only** |
| Repository permissions → **Metadata** | Read-only (obrigatório, vem sozinho) |
| Repository permissions → **Pull requests** | Read-only (usado por `github.read get_pr`) |
| Repository permissions → **Actions** | Read-only (usado por `list_action_runs`) |
| Repository permissions → **Checks** | Read-only (usado por `get_pr` com checks) |
| Todas as outras permissões (repo, org, account) | **No access** |
| Where can this GitHub App be installed? | **Only on this account** |

Mínimo absoluto é Contents + Metadata; as três extras (todas read-only) mantêm
as 10 operações do `engineering.github.read` funcionando. **Nenhuma permissão de
escrita** — o `github-app-verify.sh` reprova (`least privilege FAIL`) se houver.

Clique **Create GitHub App**. Na página do App anote o **App ID** (número, topo da página).

## 2. Gerar a chave privada

Mesma página → seção **Private keys** → **Generate a private key**. O navegador
baixa `memoryos-eng-mcp.AAAA-MM-DD.private-key.pem`. Não abra, não cole em chat.

## 3. Instalar no repositório

Menu esquerdo do App → **Install App** → **Install** na conta `AndersonVitaease`
→ **Only select repositories** → `memoryos` → **Install**.
A URL final é `https://github.com/settings/installations/<NÚMERO>` — esse
número é o **Installation ID**.

## 4. Levar a chave para a VPS (um comando, do seu computador)

```bash
scp ~/Downloads/memoryos-eng-mcp.*.private-key.pem root@<IP_DA_VPS>:/tmp/gh-app.pem && ssh root@<IP_DA_VPS> 'install -m 600 -o root -g root /tmp/gh-app.pem /opt/eng-mcp-secrets/github-app.private-key.pem && shred -u /tmp/gh-app.pem'
```

Depois apague o `.pem` do Downloads (a chave vive só na VPS; se perder, gere outra no passo 2 e revogue a antiga ali mesmo).

## 5. Registrar os 2 IDs (não são segredo) — na VPS

```bash
install -m 600 /dev/null /opt/eng-mcp-secrets/github-app.env && printf 'GITHUB_APP_ID=%s\nGITHUB_INSTALLATION_ID=%s\n' '<APP_ID>' '<INSTALLATION_ID>' > /opt/eng-mcp-secrets/github-app.env
```

## 6. Verificar (read-only)

```bash
/opt/memoryos/eng-mcp/scripts/github-app-verify.sh
```

Esperado (só sha16/veredito):

```
OK   config — appId sha16=… installationId sha16=…
OK   key file mode — 600
OK   private key — RSA, public fingerprint sha16=…
OK   jwt — alg=RS256
OK   installation token — sha16=… expiresAt=… permissions=actions:read,checks:read,contents:read,metadata:read,pull_requests:read selection=selected
OK   least privilege — read-only
OK   GET /repos/AndersonVitaease/memoryos — full_name=AndersonVitaease/memoryos private=…
RESULT GREEN
```

Exit 0 = GREEN, 1 = RED (a linha FAIL diz o quê), 2 = App não configurado.
Falhas comuns: `GITHUB_APP_AUTH_REJECTED` (App ID não bate com a chave, ou relógio
da VPS fora — `timedatectl`), `GITHUB_APP_INSTALLATION_NOT_FOUND` (Installation ID
errado / App não instalado), `key file mode FAIL` (`chmod 600` no .pem).

Com GREEN, avise o supervisor: o deploy governado (wiring do .pem + IDs no
container) é missão separada. **Não revogue a PAT antiga ainda** — só depois do
smoke em produção via App.
