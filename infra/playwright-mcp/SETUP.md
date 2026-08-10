# Playwright MCP — Setup e Manutenção na VPS (RFC-012/013/015)

> Este documento é a **fonte da verdade versionada** pra infraestrutura do
> Playwright MCP na VPS. Antes de 2026-08-10, essa configuração só existia
> como estado manual na VPS (editado via SSH, nunca commitado) — isso levou
> a uma tarde inteira de debug perdida porque `docker compose up -d
> --force-recreate` apagava silenciosamente um binário instalado manualmente,
> sem ninguém lembrar por quê. **Não edite a VPS direto sem atualizar este
> arquivo e o `docker-compose.yml` deste diretório também.**

## Onde tudo vive

| O quê | Onde na VPS | Onde no repo |
|---|---|---|
| Containers Docker | `/root/playwright-mcp/` | `infra/playwright-mcp/docker-compose.yml` |
| Config anti-detecção | `/root/playwright-mcp/config/web-connector-config.json` | `infra/playwright-mcp/config/web-connector-config.json` |
| Binários dos navegadores | volume Docker `playwright-browsers` | — (não versionável, ver "Deploy do zero") |

## Deploy do zero (VPS nova ou recuperação de desastre)

```bash
# 1. Copiar os arquivos deste diretório (docker-compose.yml + config/) pra
#    /root/playwright-mcp/ na VPS (via scp, git clone, ou colar manualmente).

# 2. Subir os containers (cria o volume automaticamente)
cd /root/playwright-mcp
docker compose up -d

# 3. Instalar o navegador Chrome for Testing (obrigatório na primeira vez —
#    NÃO vem na imagem base, e sem o volume configurado corretamente essa
#    instalação seria perdida a cada recriação de container)
docker compose exec playwright-web-connector npx @playwright/mcp install-browser chrome-for-testing

# 4. Confirmar que persistiu de verdade
docker compose exec playwright-web-connector ls /ms-playwright
# Deve listar uma pasta tipo "chromium-1237" — se sumir depois de um
# restart normal, o volume não está montado corretamente.
```

## Restart seguro (rotina, sem perder nada)

```bash
cd /root/playwright-mcp
docker compose restart playwright-web-connector
```

**Nunca use `--force-recreate` por hábito.** Só é necessário quando o
`docker-compose.yml` ou o `config/web-connector-config.json` mudou de
verdade. Um `restart` simples não recria o container, não mexe no volume, e
não perde o navegador instalado.

Se REALMENTE precisar recriar (mudou a imagem, mudou flags do `command`):

```bash
docker compose up -d --force-recreate playwright-web-connector
# Com o volume `playwright-browsers` configurado, o navegador SOBREVIVE a
# isso agora. Se por algum motivo não sobreviver (ex: volume foi removido
# manualmente com `docker volume rm`), rode o passo 3 do "Deploy do zero"
# de novo.
```

## Lições de 2026-08-10 (não repetir)

### 1. `--isolated` é obrigatório

`playwright-web-connector` é usado por **duas operações diferentes** do
Web Connector — descoberta (`webConnectorDiscover`, RFC-013) e execução de
busca (`webConnectorConnect` → `executeCapability`, RFC-014). As duas
compartilham o mesmo container/porta (8932). Sem a flag `--isolated`, o
Playwright MCP trava o perfil do navegador pra uso exclusivo — se uma
operação não fechar limpo (ex: uma descoberta longa interrompida), a
PRÓXIMA chamada (mesmo de uma operação diferente) falha com:

```
Error: Browser is already in use for /root/.cache/ms-playwright-mcp/mcp-chrome-for-testing-<hash>,
use --isolated to run multiple instances of the same browser
```

Esse erro, sem instrumentação, é fácil de confundir com "sessão do usuário
expirou" — foi exatamente isso que aconteceu e consumiu horas de debug.
Com `--isolated`, cada chamada usa um perfil isolado, sem essa disputa.

### 2. Volume persistente pro navegador

Ver comentário no `docker-compose.yml`. Resumo: sem o volume nomeado
`playwright-browsers` montado em `/ms-playwright`, todo `--force-recreate`
apaga o Chrome for Testing baixado manualmente, e a função `executeCapability`
passa a falhar com:

```
Error: Browser "chrome-for-testing" is not installed; expected executable at
/ms-playwright/chromium-1237/chrome-linux64/chrome
```

### 3. Retry automático no código (defesa em profundidade)

Mesmo com os dois fixes acima, o código das funções `webConnectorConnect` e
`webConnectorDiscover` (`base44/functions/`) tem um `callMcpWithRetry` que
detecta especificamente o erro "already in use", força um `browser_close`,
espera 1.5s e tenta de novo automaticamente antes de desistir. Isso é uma
segunda camada de proteção — não confiar só na infra pra nunca falhar.

### 4. User-agent do config precisa de manutenção

`web-connector-config.json` tem um `userAgent` fixo com uma versão de
Chrome específica (151, em agosto/2026). Isso vai ficar desatualizado com o
tempo — uma versão de navegador muito antiga é, ela mesma, um sinal de
automação pra sistemas anti-fraude mais novos (Mercado Livre, etc.).
Revisar periodicamente (a cada poucos meses) e atualizar pra uma versão
atual do Chrome.

### 5. Mensagens de erro pro usuário final devem ser honestas

O pipeline de chat (`src/lib/reasoning/memoryReasoningPlanner.js`, ETAPA
0.7) agora distingue sessão **genuinamente** expirada (site redirecionou
pra `/login`) de qualquer outro erro técnico (infra, timeout, bug). Só o
primeiro caso pede pro usuário reconectar — qualquer outro erro deve
dizer "problema técnico temporário", nunca culpar a sessão do usuário sem
prova. Antes disso, QUALQUER erro (inclusive os de infra acima) virava uma
mensagem enganosa de "reconecte", o que mascarava a causa raiz real e
desperdiçou muito tempo de debug.

## Verificação rápida de saúde

```bash
curl -s http://127.0.0.1:8932/health 2>/dev/null || echo "container nao respondeu"
docker compose ps
docker compose logs --tail=20 playwright-web-connector
```
