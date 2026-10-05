# MISSÃO RD-HOST-01 — Deploy host-side da ponte systemd governada (eng-mcp-host-ops)

**Fonte:** RELATORIO-ENG-HOST-GOVERNED-OPS-01 L89–98 (comandos prontos) · ROADMAP P2 · **Intent do operator 05/10 ("despache todas") + token de ordem ativo**
**Consequência:** `consequence: true` (host-side: useradd, units, sudoers, restart do release-runner)

**Escopo (worker, tudo via tools governadas `engineering.host.*` / `engineering.vps.*` com preauth):**
1. Executar a sequência do relatório L89–98: useradd do serviço, units `*-agent`/`*-probe` (systemd), sudoers 0440 (deny-all + linhas allowlist), `/data/host-ops`, restart do `eng-mcp-release-runner`.
2. Provas: units active, sudoers com modo 0440 e conteúdo exato do relatório, restart do runner com volta honesta (health), agente rodando.
3. Suíte hostOpsAgent existente verde (socket 0600 já na produção via RD-SEC-SURFACE-01).

**Proibido:** qualquer sudoers fora do que está no relatório; tocar em panes em voo.
**Entrega:** relatório + verify.json (verdict REAL) + resumo no pane com PASS/FAIL + PARE. Qualquer recusa tipada do preauth = PARE com o motivo (nunca contorno).
