# Superfícies de produção — rotas × estado (RD-SEC-SURFACE-01, 05/10)

Tabela viva das rotas que alcançam as superfícies de consequência. Defesa em
profundidade: cada superfície deve ser alcançável SOMENTE pelo caminho auditado.
Provas comportamentais re-runnable: `prova-rd-sec-surface-01.py` (cwd do repo).

| Rota | Superfície | Estado | Governança / prova |
|---|---|---|---|
| Gate MCP `POST /mcp` :8787 (127.0.0.1) | produção (todas as tools) | **governada** | bearer do token registry (401 sem auth); audit UCRBridge |
| Gate MCP `POST /mcp-proxy` :8787 | produção (read-only Hermes) | **governada** | dupla: X-Proxy-Secret (constante) + bearer read-only de arquivo (403 sem secret) |
| GET/outras rotas :8787 | — | **fechada** | 404 (só POST /mcp e POST /mcp-proxy existem) |
| Socket `/data/host-ops/agent.sock` | systemctl/units do host | **fechada (código) / runtime pendente supervisor** | código: `chmodSync 0o600` (commit 62145fc9, suíte 50/50); runtime: restart `eng-mcp-host-ops-agent` host-side (classifier nega ao worker) |
| Socket connect por uid alheio | socket | **fechada** | PermissionError EACCES (P5 da prova) |
| Sudo do `eng-mcp-host-ops` | root no host | **governada** | allowlist POR COMANDO EXATO (2 linhas, sem wildcard), deny-all implícito; recusas P1–P3 |
| Sudo `cat` do token de ordem | arquivo de hashes | **governada** | caminho único exato; P4 exit 0 (só hashes, sha16 auditada) |
| docker.sock `/var/run/docker.sock` (root:docker 660) | containers (incl. produção) | **governada por desenho** | grupo `docker` SEM membros; container de produção NÃO monta docker.sock (worker não alcança); host-root = nível supervisor, só com ordem explícita do operator |
| `docker exec` do worker (sessões no container) | produção | **fechada estruturalmente** | sem docker.sock no container — rota não existe para o worker |
| Mount `/opt/eng-mcp-release-data` (host, 700 root) | dados de produção | **governada** | só root host-side (supervisor); container vê subconjunto por bind |
| Bind `production:/data` no container | dados de produção | **governada por desenho** | o servidor MCP precisa ler credentials/audit; residual: container root = host root (sem userns remap) — documentado, não fechável sem mudança de infra |
| Terminal host-side do supervisor (chat Hermes) | tudo | **governada — NÃO fechar** | rota sancionada (contrato) |
| `dokploy-traefik` com docker.sock | containers do dokploy | **residual documentado** | control plane do operator; fora do escopo eng-mcp — nota no relatório |

## Políticas

- **docker exec**: negado por padrão ao worker (sem docker.sock no container;
  classifier nega em sessões de missão). Uso supervisor apenas com ordem
  EXPLÍCITA do operator. Gap observado: sessão host-root não é bloqueada pelo
  classifier para `docker exec` (prova em RD-SEC-SURFACE-01) — coerente com o
  nível supervisor, mas registado como observação de calibração.
- **sudoers**: deny-all implícito documentado no arquivo-fonte
  (`deploy/sudoers-eng-mcp-host-ops`); alterações exigem re-instalação host-side
  com `visudo -c`.
- **Fail-closed**: qualquer rota nova que alcance estas superfícies precisa
  entrar nesta tabela ANTES de ativar.
