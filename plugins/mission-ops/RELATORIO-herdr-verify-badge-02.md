# RELATORIO — HERDR-VERIFY-BADGE-02 (29/09/2026)

## 1. Convenção do manifesto (contrato item 1)

Descoberta (código, não suposição):
- O close (`handle_mission_close`, `__init__.py:1534`) monta o manifesto como
  `os.path.join(ledger["cwd"], "verify.json")` — NOME FIXO `verify.json` no cwd da missão.
- O runner `/opt/deliver-verify/verify.py` (`resolve_manifest`, verify.py:410) resolve
  `verify-<missionId>.json` > `verify.json`, mas o close SÓ testa a existência de
  `verify.json` — se a worker grava `verify-<missionId>.json`, o close roda o runner
  sem manifesto no nome que ele testa e sai fail-open ("verify exit 2 sem provas
  reais parseáveis"), exatamente o sintoma da herdr-verify-template-01.
- Convenção padronizada (UM caminho): **`verify.json` no cwd da missão**, com campo
  `"mission"` == missionId (o runner exige o dono; resolve o collision-fix).

Fix no template (`mission_core.py`, DISPATCH_TEMPLATE): cláusula reescrita para mandar
gravar "COM O NOME EXATO verify.json no cwd da missão", explicitando que
verify-<missionId>.json NÃO fecha.

## 2. jev_gate degradado — causa raiz (contrato item 2)

Repro: `python3 /opt/memoryos/eng-mcp/scripts/jev_gate.py herdr-verify-template-01 '<json>'`
→ pós-investigação o script responde exit 0 com `{"verdict":"NAO",...}` (fail→NAO honesto).

O erro "Command failed" visto no close vem do caminho de exceção: `jev_key()` fazia
`open(CRED_FILE)` sem try — qualquer falha de leitura da credencial (permissão/arquivo
ausente no contexto do chamador) crashava com traceback → exit != 0 → o chamador
(`dist/missionOps.js:133-138`, timeout 8s) capturava e marcava `jevGate: "degraded"`.

Fix mínimo (`jev_gate.py`, `jev_key()`): leitura da credencial embrulhada em try —
falha vira `""` e o main responde `NAO honesto` ("credencial JEV indisponível").
Guardas preservados: credencial nunca em stdout (só `key_hash16`), timeout 3s,
fail→NAO. Pós-fix: repro exit 0, verdict SIM/NAO, nunca crash.

## 3. Provas

- `python3 test_mission_ops.py` → **126/126 OK, exit 0** (pós os 2 fixes).
- Repro jev_gate pós-fix (`/tmp/repro_jev.py`) → exit 0, verdict NAO (honesto),
  latency ~250ms, key_hash16 presente, sem traceback.
- Manifesto tipado gravado em `/root/.hermes/plugins/mission-ops/verify.json`
  (nome que o close lê) com `"mission": "herdr-verify-badge-02"`.
- E2E canário: o close desta própria missão serve de prova — o manifesto segue a
  convenção nova (verify.json no cwd + campo mission) e o deliver_verify do close
  deve sair verdict pass com badge (sem fail-open).

## 4. Não destruído

Zero deploy/restart; só `mission_core.py` (template) + `jev_gate.py`. 8103 intocado.
Nenhuma missão fechada reaberta.
