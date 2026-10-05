# MISSÃO RD-SEC-SURFACE-01 — Fechar a superfície: systemctl/docker/produção só pela rota governada

**Componente:** eng-mcp (agente host-ops + sudoers + container) · **Prioridade:** 1 · **Autoria:** operator 05/10 ("sim" — fechar rotas não-governadas) · **Contexto:** ponte MCP↔agente viva (bind G3 restaurado 05/10); sudoers com 1 allowlist (`cat` do token); chat Hermes/supervisor mantém terminal host-side por desenho (não fechar).

## Problema
A rota governada (tools eng-mcp → gate MCP → unix socket → agente host argv-exato + audit) convive com rotas laterais não-governadas que alcançam as MESMAS superfícies (systemctl, docker, produção): socket acessível de dentro do container, sudo sem deny-all, endpoints HTTP extras, docker exec como via de diagnóstico. Defesa em profundidade exige que cada superfície só seja alcançável pelo caminho auditado.

## Escopo
1. **Inventário (fase 1, read-only):** mapear TODAS as rotas que alcançam (a) systemctl/unidades do host, (b) docker/containers de produção, (c) o mount de produção (`/opt/eng-mcp-release-data`): sockets, endpoints HTTP do :8787, sudoers existentes, memberships de grupo, binds. Tabela rotas × superfícies × quem alcança.
2. **Fechamentos (fase 2):**
   - socket `/data/host-ops/agent.sock` → 0600, owner `eng-mcp-host-ops:eng-mcp-release` (worker no container NÃO conecta direto; só o gate MCP do servidor);
   - sudoers do `eng-mcp-host-ops`: manter as allowlistas exatas + **deny-all implícito documentado** e prova de que comandos fora da lista recusam;
   - endpoints do :8787: inventário e fechamento (unbind) de rota extra que não seja `/mcp` (se houver; se for do framework, declarar e provar auth obrigatória em TODAS);
   - docker exec: política documentada — negado por padrão (classifier já nega ao worker); uso supervisor apenas com ordem explícita do operator (já é a doutrina).
   - O que exigir root/persistência host-side e for negado ao worker: lista pronta p/ supervisor (DEFER-HOST-SIDE).
3. **Provas (fase 3):** para CADA rota fechada → tentativa de acesso negada (tipada, auditada); para CADA rota governada → segue funcionando (status probe via MCP + shell.run tier-1). Suítes do agente verdes. Prova determinística re-runnable.
4. **Entrega:** RELATORIO + verify.json + tabela rotas × estado (aberta/fechada/governada).

## Restrições
- NÃO fechar: terminal do supervisor (chat Hermes), rota MCP :8787 autenticada, sudoers allowlist do sudo cat.
- Fail-closed: qualquer dúvida → recusa tipada + nota, nunca abertura ampla.
- Backup `.bak-RD-SEC-SURFACE-01` antes de cada mudança; commits na main local.

**RELATÓRIO pt-BR + PARE no pane.**