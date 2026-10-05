# MISSÃO RD-LEG-01 — Suíte test_contract_recover.py vermelha: deixar verde ou cancelar com decisão

**Componente:** mission-ops (suíte) · **Prioridade:** 2 · **Fonte:** RELATORIO-SEC-OPERATOR-IDENTITY-01.md L55; missao-orch-contract-recover-01.md · **Autoria:** operator 04/10 ("todo o roadmap")

## Problema
`test_contract_recover.py` vermelha no HEAD do plugin (3F+12E, pré-existente): o contrato TDD do ORCH-CONTRACT-RECOVER-01 fechou sem suíte verde — dívida de TDD viva.

## Entrega (não-quebrante)
1. Diagnóstico honesto: o que o contrato pedia, o que a suíte testa, por que está vermelha (código regrediu? teste obsoleto? comportamento mudado por design?).
2. Decisão binária com justificativa no relatório: (a) fix do teste/código até verde, OU (b) cancelar testes obsoletos com decisão documentada (nunca apagar sem nota do motivo).
3. Estado final: suíte verde OU removida com justificativa citada no relatório e no commit.

## Provas
- Run final da suíte (verde ou remoção justificada); suíte do plugin íntegra (as outras); verify.py pass; RELATÓRIO pt-BR íntegra + ack.

## Restrições
- Zero mudança de comportamento de runtime (close/guard/spend/consumer intocáveis — missões em voo). Só a suíte + o código que ela testa SE a causa for regressão.