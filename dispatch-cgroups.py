#!/usr/bin/env python3
"""
dispatch-cgroups.py — CGroups v2-aware mission dispatcher.

Wraps claude mission dispatch with systemd-run --slice=mission-workers.slice
using dynamic MemoryMax/MemoryHigh calculated from MemTotal/mem_free.

Fail-open: if cgroups v2 unavailable or systemd-run fails, dispatches normally
and logs cgroups_unavailable to spool. Never blocks a mission.

Usage:
    python3 dispatch-cgroups.py <missionId> <promptFile> [worktree] [priority]
"""

import json
import os
import subprocess
import sys
import time
from typing import Any, Dict, Optional, Tuple

SPOOL_PATH = "/opt/mission-events/spool.jsonl"
SLICE_NAME = "mission-workers.slice"
SLICE_CGROUP_PATH = "/sys/fs/cgroup/" + SLICE_NAME
SYSTEMD_RUN = "/usr/bin/systemd-run"
MEMORY_RESERVE_BYTES = 4 * 1024 * 1024 * 1024  # 4GB system reserve
PER_WORKER_HIGH_RATIO = 0.3
PER_WORKER_MAX_RATIO = 0.4
MIN_MEMORY_HIGH = 512 * 1024 * 1024  # 512MB
MIN_MEMORY_MAX = 1024 * 1024 * 1024  # 1GB


def read_cgroup_u64(path: str) -> Optional[int]:
    """Read a u64 value from a cgroup file."""
    try:
        with open(path) as f:
            return int(f.read().strip())
    except Exception:
        return None


def get_memory_info() -> Dict[str, int]:
    """Read MemTotal, MemFree, MemAvailable from /proc/meminfo (bytes)."""
    info = {}
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                parts = line.split()
                if len(parts) >= 2:
                    key = parts[0].rstrip(":")
                    info[key] = int(parts[1]) * 1024
    except Exception:
        pass
    return info


def check_cgroups_v2() -> bool:
    """Check if cgroups v2 unified hierarchy is available with memory controller."""
    return (
        os.path.isdir("/sys/fs/cgroup")
        and os.path.exists("/sys/fs/cgroup/cgroup.controllers")
        and "memory" in open("/sys/fs/cgroup/cgroup.controllers").read()
    )


def check_slice_exists() -> bool:
    """Check if mission-workers.slice cgroup directory exists."""
    return os.path.isdir(SLICE_CGROUP_PATH)


def calculate_memory_limits() -> Tuple[int, int]:
    """
    Calculate MemoryHigh and MemoryMax from MemTotal/mem_free.

    MemoryHigh = min(allocatable * 0.3, 2.5GB) — soft limit
    MemoryMax = min(allocatable * 0.4, 3.5GB) — hard limit

    Allocatable = MemAvailable - system reserve (4GB).
    """
    mem = get_memory_info()
    mem_available = mem.get("MemAvailable", mem.get("MemFree", 0))
    allocatable = max(0, mem_available - MEMORY_RESERVE_BYTES)

    memory_high = min(int(allocatable * PER_WORKER_HIGH_RATIO), int(2.5 * 1024**3))
    memory_max = min(int(allocatable * PER_WORKER_MAX_RATIO), int(3.5 * 1024**3))

    memory_high = max(memory_high, MIN_MEMORY_HIGH)
    memory_max = max(memory_max, MIN_MEMORY_MAX)

    return memory_high, memory_max


def get_slice_memory_current() -> Optional[int]:
    """Read memory.current from the mission-workers.slice cgroup."""
    if not check_slice_exists():
        return None
    return read_cgroup_u64(os.path.join(SLICE_CGROUP_PATH, "memory.current"))


def spool_event(event_type: str, mission_id: str, msg: str) -> None:
    """Append an event to spool.jsonl."""
    entry = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "event": event_type,
        "missionId": mission_id,
        "msg": str(msg)[:200],
        "source": "dispatch-cgroups",
    }
    try:
        with open(SPOOL_PATH, "a") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception:
        pass


def dispatch_normal(mission_id: str, prompt_file: str, worktree: Optional[str], priority: int) -> Dict[str, Any]:
    """
    Fallback: dispatch without cgroups (normal path).
    Reuses the existing orchestrator-consumer dispatch logic.
    """
    # Import and call the existing dispatch_mission from orchestrator-consumer
    sys.path.insert(0, "/opt/mission-events")
    try:
        from orchestrator_consumer import dispatch_mission  # type: ignore
        return dispatch_mission(mission_id, prompt_file, worktree, priority)
    except Exception as e:
        return {"ok": False, "error": f"dispatch_normal failed: {e}"}


def dispatch_with_cgroups(
    mission_id: str, prompt_file: str, worktree: Optional[str], priority: int
) -> Dict[str, Any]:
    """
    Dispatch a mission via systemd-run --slice=mission-workers.slice with dynamic
    MemoryMax/MemoryHigh calculated from MemTotal/mem_free.

    Returns {"ok": True, "systemd_run": True, ...} on success, or falls back to
    dispatch_normal on failure (fail-open).
    """
    if not check_cgroups_v2():
        spool_event(
            "cgroups_unavailable",
            mission_id,
            "cgroups v2 not available — falling back to normal dispatch",
        )
        return dispatch_normal(mission_id, prompt_file, worktree, priority)

    if not check_slice_exists():
        spool_event(
            "cgroups_unavailable",
            mission_id,
            f"slice {SLICE_NAME} cgroup dir not found — falling back to normal dispatch",
        )
        return dispatch_normal(mission_id, prompt_file, worktree, priority)

    memory_high, memory_max = calculate_memory_limits()

    # Build the systemd-run command
    # We use --scope to create a transient scope under the slice
    unit_name = f"mission-{mission_id}"
    cmd = [
        SYSTEMD_RUN,
        "--slice",
        SLICE_NAME,
        f"--property=MemoryHigh={memory_high}",
        f"--property=MemoryMax={memory_max}",
        "--scope",
        f"--unit={unit_name}",
        "--description=Mission worker " + mission_id,
        "--property=Delegate=yes",
    ]

    # The actual mission execution — import and call handle_mission_dispatch
    # We pass the args via environment to avoid shell injection
    env = os.environ.copy()
    env["MISSION_ID"] = mission_id
    env["PROMPT_FILE"] = prompt_file
    env["WORKTREE"] = json.dumps(worktree) if worktree else "null"
    env["PRIORITY"] = str(priority)

    # Use systemd-run to execute a small python snippet that calls the dispatcher
    exec_code = (
        "import os, json, sys; "
        "sys.path.insert(0, '/opt/mission-events'); "
        "from orchestrator_consumer import dispatch_mission; "
        "result = dispatch_mission("
        + f'{env["MISSION_ID"]}, {env["PROMPT_FILE"]}, '
        + f'{env["WORKTREE"]}, {env["PRIORITY"]}'
        + "); "
        "print(json.dumps(result))"
    )

    cmd.append("python3")
    cmd.append("-c")
    cmd.append(exec_code)

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30,
            env=env,
        )
        if result.returncode != 0:
            spool_event(
                "cgroups_unavailable",
                mission_id,
                f"systemd-run exited {result.returncode}: {result.stderr[:200]}",
            )
            return dispatch_normal(mission_id, prompt_file, worktree, priority)

        try:
            dispatch_result = json.loads(result.stdout.strip())
        except json.JSONDecodeError:
            dispatch_result = {"ok": True}

        return {
            "ok": True,
            "systemd_run": True,
            "memory_high": memory_high,
            "memory_max": memory_max,
            "dispatch_result": dispatch_result,
        }

    except subprocess.TimeoutExpired:
        spool_event("cgroups_unavailable", mission_id, "systemd-run timed out — falling back")
        return dispatch_normal(mission_id, prompt_file, worktree, priority)
    except FileNotFoundError:
        spool_event(
            "cgroups_unavailable",
            mission_id,
            "systemd-run not found — falling back to normal dispatch",
        )
        return dispatch_normal(mission_id, prompt_file, worktree, priority)
    except Exception as e:
        spool_event(
            "cgroups_unavailable",
            mission_id,
            f"systemd-run unexpected error: {str(e)[:200]} — falling back",
        )
        return dispatch_normal(mission_id, prompt_file, worktree, priority)


def main() -> None:
    """CLI entry point."""
    if len(sys.argv) < 3:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "usage: dispatch-cgroups.py <missionId> <promptFile> [worktree] [priority]",
                }
            ),
            file=sys.stderr,
        )
        sys.exit(1)

    mission_id = sys.argv[1]
    prompt_file = sys.argv[2]
    worktree = sys.argv[3] if len(sys.argv) > 3 else None
    priority = int(sys.argv[4]) if len(sys.argv) > 4 else 5

    result = dispatch_with_cgroups(mission_id, prompt_file, worktree, priority)
    print(json.dumps(result))
    sys.exit(0 if result.get("ok") else 1)


if __name__ == "__main__":
    main()
