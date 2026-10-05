# RELATÓRIO — LEDGER-HYGIENE-01 (28/09/2026)

Contrato: `/opt/memoryos/eng-mcp/missao-ledger-hygiene-01.md`. Estado vivo: `/root/.hermes/mission-state` (126 arquivos; snapshot congelado em `/tmp/lh01/snap` para provas comparativas).

## Resultado em uma linha
`mission_state` carrega **1 registro por missão real** (113 vigentes), zero fantasma `.verify.json`, zero dup de nome — histórico arquivado (não apagado) e consultável por `mc.ledger_history()`; `full=true` provado byte-a-byte igual ao pré-fix MENOS os fantasmas; suíte canônica **145/145 OK** (execução final isolada em `systemd-run --scope`, fora do cgroup herdr, conforme regra do supervisor); compacto 711–811 B (≤2KB).

## Status por item do contrato
| § | item | estado |
|---|---|---|
| 1 | Inventário preciso (números) | **FEITO** — abaixo |
| 2 | Dedupe no carregador (1 linha/missão; histórico arquivado; backup antes) | **FEITO** — `_scan_state()`/`ledger_history()` em `mission_core.py`; backup sha256 `15a59443…` |
| 3 | Filtrar `.verify.json` (e afins) do `list_ledgers_report` | **FEITO** — regra canônica: ledger = `<missionId>.json` |
| 4 | Provas red→green | **FEITO** — red 2F+2E → green 8/8; full=true comparativo; compacto ≤2KB; suíte 145/145 (isolda via systemd-run scope) |
| 5 | NÃO tocar fast-router/guardian/8787; commits Co-Authored-By; relatório+RESULT | **FEITO** (abaixo) |

## §1 — Inventário do estado real (28/09 ~13:20Z, 121 arquivos ledger-like)
- **113 missões reais** (`<missionId>.json` canônico), **113 únicos**, **0 dup entre canônicos**.
- **8 fantasmas** `.verify.json` (segunda entrada do mesmo missionId, `status ?/pane ?`):
  `guardian-compute-recovery-01`, `guardian-compute-v11-01`, `guardian-compute-v11-ship-01`, `judge-restore-01`, `merge-lane2-01`, `watchdog-02b`, `watchdog-d9-catloop-01`, `watchdog-lane2-01`.
- **0 arquivos históricos** com outro nome no disco vivo (os `.bak.json` da prova são sintéticos; na pasta real não há nenhum).
- Total que o ANTES carregava como "missões": **121 registros (113 reais + 8 fantasmas)**. No snapshot congelado de 12:45Z: 118 registros (110 reais + 8 fantasmas — o próprio `judge-restore-01.bak.json` do teste "afim" não existia no disco real; entre 12:48 e 13:20 entraram 3 missões novas: `ledger-hygiene-01`, `watchdog-judge-probe-01`, `closer-madrugada-01` recontadas).

Nota: o contrato fala em "entradas DUPLICADAS mesmo missionId 2×". Medição real: a duplicação vinha **exclusivamente** dos 8 `.verify.json` (cada um duplica a missão real com status `?/pane ?`). Não existe dup entre arquivos `<id>.json` canônicos — `save_ledger` só grava o path canônico, então a regra "ledger é SEMPRE `<missionId>.json`" elimina a classe inteira por construção.

## §2 — Dedupe no carregador
`mission_core.py` (+23/−8): `list_ledgers_report()` delega a `_scan_state()` que classifica cada `.json`:
- `<missionId>.json` → ledger vigente (1 registro por missão, por construção);
- qualquer outro `.json` com missionId (`<id>.verify.json` do DELIVER-VERIFY, `<id>.bak.json`, cópia manual) → **histórico** `{missionId: [arquivos]}` — não conta, não duplica, não é "skipped", fica intocado no disco;
- novo acesso só-leitura `mc.ledger_history()`.

**Backup antes de qualquer mudança** (não houve escrita no estado — o fix é no carregador): `cp -a` + tar de `/root/.hermes/mission-state` → `/root/.hermes/backups/ledger-hygiene-01/mission-state-pre-hygiene.tar.gz`, sha256 `15a5944390bc5046a29eced2674c911b743a7c15c5738ddac9b74defda9fc580`; conjunto de hashes dos 123 `.json` **set-idêntico** ao vivo no momento do backup (única diferença: `events.jsonl` crescendo por escritas vivas — esperado).

## §3 — Filtro `.verify.json` (e afins)
Coberto pela regra canônica do §2 (supersede o filtro narrow do plugin-prod-01, que só cobria `.verify.json` com `p.stem != missionId`). Afins cobertos: `.bak.json`, `*-copy.json`, qualquer nome não-canônico. `missionId` contendo `.verify` literal continua sendo ledger válido (teste `test_mission_id_with_dot_verify_is_still_a_ledger`).

## §4 — Provas
### (a) red→green (`provas/ledger-hygiene-01-red.txt` → `-green.txt`)
- RED (código do master `df446c4`): `FAILED (failures=2, errors=2)` — affine-copies duplicava (`status` ausente), `ledger_history` inexistente, full=true ≠, 108≠105.
- GREEN: **8/8 OK** (4 `test_ledger_hygiene` + 4 `test_verify_json_ghost`), `0.154s`.

### (b) prova comparativa no estado real congelado (`/tmp/lh01`, snapshot 12:45Z; re-executada 13:25Z)
Rodada dupla com a MESMA prova (`provas/ledger-hygiene-01-prova.py`) sobre snapshot idêntico:
- old (master `df446c4`): **registros=118 únicos=110 dupes=8**; compact_list=846B, compact_status=746B
- fix: **registros=110 únicos=110 dupes=0**; compact_list=811B, compact_status=711B

**full=true íntegro (prova comparativa exigida pelo contrato):** com o output completo do pré-fix,
remover as 8 linhas-fantasma (status None E paneId None) produz **byte-a-byte** (JSON canônico) o
output do fix — para `mission_status` full e `mission_list` full. As 110 missões reais: **NENHUM
campo alterado** (verificado campo a campo; ex. `judge-restore-01` ganha status `closed`/pane `w5:pV`
que o fantasma escondia). Arquivos: `provas/ledger-hygiene-01-{status,list}-full-{antes,depois}.json`.
Observação honesta: os sha256 dos outputs antigos divergem da rodada de 12:48 (`prova-estado-real.txt`)
porque a chave de ordenação interna mudou de posição no JSON — a igualdade provada é no **conteúdo**
(canônico sort_keys), que é o que o contrato pede ("igual ao atual MENOS os fantasmas").

### (c) compacto ≤2KB
811 B (list) e 711 B (status) no estado congelado; no vivo, `provas/ledger-hygiene-01-compact-list.json` = 806 B, `total: 110`, contagens por status corretas.

### (d) suíte mission-ops (regra do supervisor: nunca direto no pane/cgroup herdr)
Verde provado **145/145 OK** em duas execuções:
- 1ª (pane, método antigo): `Ran 145 tests in 323.380s — OK` (`provas/ledger-hygiene-01-suite-final.txt`) — mas chegou a 4,3G e o supervisor matou o PID pós-veredito (teardown leak conhecido do TestDispatch) e instituiu a **REGRA OBRIGATÓRIA**: rerodar com cap via `systemd-run --scope` ou fora do cgroup herdr.
- Conformidade 2G (`provas/ledger-hygiene-01-suite-cap.txt`, scope `ledger-hygiene-suite-cap`, invocation `ca81d566…`): **EXIT=137** — OOM-kill no teste ~22 (leak do TestDispatch pico 4,3G > cap).
- Conformidade 6G (`provas/ledger-hygiene-01-suite-cap2.txt`, scope `ledger-hygiene-suite-cap2`): idem **oom-kill** — o leak é sem teto, cap duro nenhum segura a suíte inteira.
- **Conformidade final (regra, ramo "ou fora do cgroup herdr")**: `systemd-run --scope --unit=ledger-hygiene-suite-iso` (cgroup próprio, fora do herdr, sem MemoryMax) → `provas/ledger-hygiene-01-suite-iso.txt`: **Ran 145 tests in 213.588s — OK, EXIT=0**, invocation `1d2eed59…`. Herdr intacto durante a rodada.

Nota: `test_mission_resume.py` **não** entra na suíte canônica (defect conhecido de import relativo direto, documentado em `relatorio-mission-resume-01.md`; roda via contexto de pacote). `test_ledger_hygiene.py` entra na prova dedicada (a) e nos 8/8.

## §5 — Guardas
- fast-router (missão paralela), guardian e 8787: **zero toque** (diff só em `mission_core.py`).
- Zero escrita no `/root/.hermes/mission-state` pela missão (carregador só lê; os únicos writes no dir são os do próprio ciclo de vida da missão via watchdog/gateway).
- Commits: Co-Authored-By conforme regra da casa.

## Commits
1. `ledger-hygiene-01: 1 linha por missão real no carregador (dupes/fantasmas → histórico, ledger_history()); red→green 8/8; suíte 145/145 OK (scope isolado)`
2. `ledger-hygiene-01: relatório + provas (full=true comparativo byte-a-byte MENOS fantasmas) + RESULT`

## Pendente (fora do escopo, pro operator)
- [ ] Nenhum pendente técnico. O estado real NÃO precisa de limpeza: os 8 `.verify.json` ficam no disco como histórico (acessíveis por `mc.ledger_history()`), e o carregador novo já não os conta.

RESULT: SUCESSO (§1–§5) — carregador com 1 linha por missão real (113 vigentes, 0 fantasma, 0 dup), histórico arquivado e consultável (`ledger_history()`), backup do estado pré-mudança (sha256 15a59443…), full=true provado byte-a-byte igual ao pré-fix MENOS os 8 fantasmas, compacto 711–811 B, suíte canônica 145/145 OK (execução conforme regra do supervisor: systemd-run --scope isolado, fora do cgroup herdr; caps 2G/6G OOM-matam pelo leak do TestDispatch). fast-router/guardian/8787 intocados.
