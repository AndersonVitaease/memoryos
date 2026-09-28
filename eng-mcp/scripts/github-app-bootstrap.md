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

## Manifest flow (GITHUB-APP-BOOTSTRAP-01) — preferred path, 1 click + 1 code

1. `engineering.github.app.bootstrap` (read-only) returns `launcherDataUrl` / `launcherHtml`: a self-submitting
   form POST to `https://github.com/settings/apps/new?state=<csrf>` carrying a read-only manifest
   (contents/metadata/pull_requests/actions/checks = read; webhook inactive; loopback redirect_url).
2. Operator opens it, checks every permission is Read-only, clicks **Create GitHub App**, then copies the URL from
   the address bar (`http://127.0.0.1:65535/...?code=...&state=...` — the page itself fails to load, by design).
   The code is valid 1h and single-use. Then **Install App** → only the `memoryos` repository.
3. Host: `printf '%s' '<URL>' | GITHUB_APP_LAUNCH_STATE_FILE=<launch-state.json> node --import tsx scripts/github-app-convert.ts`
   → PEM 0600 at `/opt/eng-mcp-secrets/github-app.private-key.pem`, IDs 0600 at `github-app.env`
   (`PENDING_INSTALL` exit 3 if not installed yet → install, then `--resolve-installation`).
4. Wire into the runner: `LoadCredential=github-app-private-key:/opt/eng-mcp-secrets/github-app.private-key.pem`
   and `LoadCredential=github-app-env:/opt/eng-mcp-secrets/github-app.env` (governed: `engineering.vps.systemd.credential`),
   runner restart, redeploy. The runner forwards only the numeric IDs + the key path; `githubAppDockerArgs`
   mounts the key read-only at `/run/secrets/github-app-key` (all-or-nothing — partial config = PAT path).
5. E2E: `scripts/github-app-verify.sh` GREEN + `engineering.github.read get_repo` in production.

## PEM rotation

`scripts/github-app-rotate.ts`: new key from GitHub UI → `github-app.private-key.pem.new` (0600) → the script proves
GitHub accepts the NEW key (`GET /app`) before swapping (old kept as `.prev`; `--rollback`) → runner restart +
redeploy (LoadCredential copies are taken at unit start) → the installation-token cache is keyed by the key file
identity (inode/mtime/size), so the next call mints with the new key → E2E → operator deletes the old key in the
GitHub UI using the printed `oldKeyGithubFingerprint`.
