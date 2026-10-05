# MISSÃO RD-MOPS-01 — Fix do fd leak do close.lock no mission_close

**Componente:** mission-ops (/root/.hermes/plugins/mission-ops) · **Prioridade:** 1 · **Autoria:** operator 04/10 ("autorizado" à recomendação do ROADMAP v1)

## Problema (2 ocorrências reais em 04/10, provas no ROADMAP.md RD-MOPS-01)

`mission_close` vaza o fd do `close.lock` no processo gateway quando o close reabre por deliver_verify/supervisor_gate: `/root/.hermes/plugins/mission-ops/__init__.py:1867` — o `_lock_fd` não é fechado em `finally`. O flock fica retido pelo processo gateway (pid longo-vivo), e TODO re-close seguinte da mesma missão falha com `CLOSE_BUSY` (Errno 11) até o lock ser removido à mão.

Provas de hoje: closes de SEC-OPERATOR-IDENTITY-01 (14:56 e 18:5x) bloqueados por flock retido no gateway pid 3162929 (`lsof` provou FD `24uW`/`26uW` no arquivo de lock); contorno manual = `rm` do lock (inode novo). Também documentado em `/opt/mission-events/findings-supervisor.md` (2 ocorrências registradas).

## Entrega

1. **Backup pré-mutação**: `__init__.py.bak-RD-MOPS-01` (hash citado no relatório).
2. **Fix**: o fd do close.lock é fechado em `finally` em TODOS os caminhos de saída do mission_close (sucesso, reabertura por gate, recusa) — o lock por inode morre com o processo chamador, nunca sobrevive ao turno.
3. **Teste**: caso de regressão que prova o fechamento (ex.: subprocess que executa o caminho de reabertura e, ao sair, o lock não fica retido — lsof/flock probe).
4. **Prova E2E real**: simular 2 closes com reabertura (missão sintética em ledger de teste) — o 2º close NÃO falha com CLOSE_BUSY sem remoção manual do lock.

## Provas (reais, antes de gravar)

- Suíte do plugin íntegra pós-fix (test_mission_ops.py no mínimo; padrão estrutural).
- Prova E2E do fd (item 3/4) com evidência citada.
- verify.json tipado no cwd + verify.py pass + RELATÓRIO pt-BR íntegra no close (RELATÓRIO-INTEGRA + mission_report_ack).
- ROADMAP.md atualizado: RD-MOPS-01 → resolvido com prova.

## Restrições

- Só o caminho de lock do mission_close (nada de lógica de veredito/gate).
- Zero push (plugin sem remote — premissa PLUGIN-SHIP-01). Commit local de housekeeping próprio.
- Não mexer em missão em voo no plugin (GUARDIAN-MOBILE): o orquestrador serializa por componente — executar na janela.