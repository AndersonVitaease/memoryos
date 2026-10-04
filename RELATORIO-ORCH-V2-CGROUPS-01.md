# Relatório ORCH-V2-CGROUPS-01 — Teto Dinâmico de Memória por Worker via cgroups v2

## Entregáveis

1. **`mission-workers.slice`** — Unit file systemd para o slice dedicado de workers de missão, com MemoryHigh=80% e MemoryMax=90% como teto global do slice. Os limites por-worker são calculados dinamicamente no despacho.

2. **`dispatch-cgroups.py`** — Wrapper de despacho que:
   - Verifica disponibilidade de cgroups v2 (controller `memory` em `/sys/fs/cgroup/cgroup.controllers`)
   - Calcula `MemoryHigh` e `MemoryMax` a partir de `MemTotal`/`MemAvailable` de `/proc/meminfo` (tabela/dado, sem hardcode)
   - Despacha via `systemd-run --slice=mission-workers.slice --property=MemoryHigh=... --property=MemoryMax=... --scope --unit=mission-<id>` (transitório, sem unit persistente)
   - **Fail-open**: se cgroups v2 indisponível, `systemd-run` falhar, ou slice não existir, despacha normalmente e registra evento `cgroups_unavailable` no spool (`/opt/mission-events/spool.jsonl`)
   - Nunca bloqueia uma missão por falta de cgroup

3. **Integração com plano** — `dispatch-cgroups.py` expõe `slice_memory_current()` que lê `memory.current` do slice cgroup, e `calculate_memory_limits()` que fatora MemAvailable no cálculo de capacidade. O `run_orchestrate_plan()` do orquestrador pode usar esses dados para throttling quando o slice consome >80% da memória alocável.

## Provas Executadas

| # | Comando | Resultado |
|---|---------|-----------|
| 1 | `python3 -m py_compile dispatch-cgroups.py` | ✅ Syntax OK |
| 2 | `systemd-analyze verify mission-workers.slice` | ✅ Verify OK |
| 3 | `systemd-run --slice=mission-workers.slice --scope --unit=test-cgroups-01 echo cgroups-ok` | ✅ Saída: `cgroups-ok`, exit 0 |
| 4 | `cat /sys/fs/cgroup/mission.slice/mission-workers.slice/memory.current` | ✅ Leitura bem-sucedida |
| 5 | `grep -q 'mission-workers.slice' dispatch-cgroups.py` | ✅ Match |
| 6 | `grep -q 'check_cgroups_v2' dispatch-cgroups.py` | ✅ Match |
| 7 | `grep -q 'systemd-run.*--slice' dispatch-cgroups.py` | ✅ Match |
| 8 | `grep -q 'cgroups_unavailable' dispatch-cgroups.py` | ✅ Match |
| 9 | `grep -q 'memory.current' dispatch-cgroups.py` | ✅ Match |
| 10 | `grep -q 'MemTotal\|MemAvailable\|MemFree' dispatch-cgroups.py` | ✅ Match |
| 11 | `test -f mission-workers.slice` | ✅ Existe |
| 12 | `grep -q '\[Slice\]' mission-workers.slice` | ✅ Match |
| 13 | `grep -q 'MemoryHigh' mission-workers.slice` | ✅ Match |
| 14 | `grep -q 'MemoryMax' mission-workers.slice` | ✅ Match |
| 15 | `python3 -c "import json; ... manifest-valid"` | ✅ Manifesto válido |

## Segurança

- Nenhuma alteração em firewall, rede ou SSH
- Nenhuma alteração em `/root/.hermes/plugins/mission-ops/` (fora do escopo)
- Nenhuma alteração em `/opt/mission-events/orchestrator-consumer.py` (fora do worktree, revertido)
- Slice é isolado — apenas agrupa workers de missão, não afeta serviços do sistema

## TRINDADE

| Papel | Custo | Tokens |
|---|---|---|
| worker | 0 | 0 |
| advisor | 0 | 0 |
| supervisor | 0 | 0 |

**Veredicto: PASS**
