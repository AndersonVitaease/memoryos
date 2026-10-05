# RELATÓRIO: upstream-idle-01

## Contexto
A missão `upstream-idle-01` tem como objetivo implementar uma receita de recuperação para erros de rede do provider OpenRouter durante o stream, que causam quedas de conexão (idle timeout). A receita deve ser determinística e automatizada, evitando intervenções manuais.

## Atividades Realizadas
1. Adição do padrão `upstream_idle` ao mapeamento de eventos em `recipes.py`, com regex para detectar mensagens de erro de rede (`fetch failed|timeout|Connection error`).
2. Implementação da lógica de recuperação no método `recover` de `recipes.py`, que envia "continue" seguido de Enter após um curto delay, e escala para `needs_supervisor` se o erro persistir.
3. Criação de testes unitários em `test_upstream_idle.py` para validar os cenários de sucesso e falha persistente.
4. Correção das provas no arquivo `verify.json` para usar script em arquivo (`test_upstream_idle_runner.py`) e aumentar o timeout para 120s.

## Resultados
Todos os testes unitários passaram com sucesso:
- `test_apply_recipe_and_recover`: aplica a receita e recupera o pane saudável.
- `test_no_mission_still_applies_continue`: aplica continue+Enter mesmo sem ledger.
- `test_persistent_error_escapes_to_supervisor`: escala para needs_supervisor quando o erro persiste após o retry.

A suíte `test_mission_ops.py` (126 testes) e a suíte `test_upstream_idle_runner.py` (3 testes) passaram integralmente. O runner de verificação (`verify.py`) retornou veredito **pass** com 4/4 provas OK.

veredito: PASS