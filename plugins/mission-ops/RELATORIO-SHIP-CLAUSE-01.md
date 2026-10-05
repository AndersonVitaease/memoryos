# RELATÓRIO SHIP-CLAUSE-01 — Cláusula de ship no DISPATCH_TEMPLATE

Data: 03/10/2026 · Owner: SHIP-CLAUSE-01 · Repo: mission-ops (cwd `/root/.hermes/plugins/mission-ops`)

## Problema

A SNAPSHOT-WRAP-01 entregou código e fechou sem garantir ship — o entregável ficou
na branch do worktree sem merge. O CLOSE-SHIP-VISIBILITY-01 (fechada antes desta)
colocou o guard no close; faltava o worker **nascer sabendo** da regra, no prompt.

## Entrega

1. **Cláusula REPORT-SHIP-02 no `DISPATCH_TEMPLATE`** (`mission_core.py`), inserida
   após a cláusula RESULTADO e antes da RECEITA DE FECHAMENTO:

   > CLÁUSULA DE SHIP (REPORT-SHIP-02): entregável que exige merge/release termina com
   > PARE somente após: (a) branch mergeada em main com prova git.log do commit na main,
   > OU (b) SHIP-\<alvo\>-01 despachada (pane ativo). Entregável só na branch do worktree
   > = FAIL, mesmo com suíte verde.

2. **Headroom preservado** — body renderizado passou de 4095 → **4265** chars
   (limite `DISPATCH_INLINE_LIMIT` = 4400, headroom 135). Para abrir folga,
   a cláusula CLOSE-VERIFY-PATH-01 foi encurtada por remoção de prosa redundante
   ("o deliver_verify do mission_close usa o MESMO resolvedor… verif.json legado
   também resolve…") — **id preservado**; nenhum teste deixa de passar (a suíte
   completa está verde). O texto longo continua no backup
   `mission_core.py.bak-SHIP-CLAUSE-01` (69603 bytes, verificado).

3. **Referência ao guard do close (CLOSE-SHIP-VISIBILITY-01)**: cláusula condicional
   do contrato ("se o template já citar, referenciar em 1 linha") — o template NÃO
   cita o guard, condição não se aplica; não acrescentada.

4. **Testes de contrato** (`test_ship_clause.py`, unittest stdlib):
   - `test_ship_clause` — assertIn da frase-âncora "Entregável só na branch do
     worktree = FAIL, mesmo com suíte verde" + id REPORT-SHIP-02 no body do template;
   - `test_template_length` — body len ≤ `DISPATCH_INLINE_LIMIT` (padrão test_template_ptbr01);
   - `test_clausulas_existentes_intactas` — ids REPORT-QA-01, PROOF-LINT-03,
     ZERO-BASH-BY-DESIGN, DEFER-HOST-SIDE, PROVA DE INGESTÃO, TEMPLATE-PTBR-01,
     VERIFY-TEMPLATE-01, REPORT-HERDR-01, CLOSE-VERIFY-PATH-01, TEMPLATE-PROTOCOL-01
     intactos.

5. **Prova de grep** (`provas_ship_clause_01.py`): renderiza o body e confere
   frase-âncora + limite — saída `ANCHOR-OK` (len=4265, idx_anchor=4046).

## Provas executadas (reais, no cwd)

| Prova | Comando | Resultado |
|---|---|---|
| Teste novo | `python3 test_ship_clause.py -v` | 3/3 OK |
| Suíte plugin | `python3 test_mission_ops.py` | 139 tests, 32.7s, OK |
| Irmã template | `python3 -m unittest tests.test_template_protocol_01` | 12 OK |
| Irmã pt-BR | `python3 test_template_ptbr01.py` | 1 OK |
| Grep âncora | `python3 provas_ship_clause_01.py` | ANCHOR-OK (4265 ≤ 4400) |
| Runner | `python3 /opt/deliver-verify/verify.py --mission SHIP-CLAUSE-01` | verdict: pass |

Manifesto: `verify-SHIP-CLAUSE-01.json` (owner "SHIP-CLAUSE-01", provas tipadas
cmd/file, comando real executado antes de gravar).

## Backup (VERIFY-TEMPLATE-01)

`cp mission_core.py mission_core.py.bak-SHIP-CLAUSE-01` ANTES de editar; tamanho
69603 bytes conferido igual ao original; edição por alteração pontual (2 Edits),
nunca reescrita do arquivo inteiro.

## Dívidas / notas

- Ingestão do contrato ecoada no pane (`CONTRATO OK SHIP-CLAUSE-01`).
- Commit local apenas, sem push/deploy (conforme contrato).
- Fila respeitada: missão só entrou após `CLOSE-SHIP-VISIBILITY-01` constar `closed`
  no ledger (`/root/.hermes/mission-state/CLOSE-SHIP-VISIBILITY-01.json`).
- Um comando de verificação inline (`python3 -c` reload do template) foi negado pelo
  classifier; reformulado conforme REPORT-QA-01 (prova python via script em arquivo
  no cwd) — sem impacto no escopo.
- Memória: não aplicável (nenhum fingerprint de memória a gravar nesta missão).

## Veredito

**PASS** — cláusula REPORT-SHIP-02 no template, headroom saudável (135), suítes
verde (3/3 + 139 + 12 + 1), âncora provada no body renderizado, runner com verdict pass.
