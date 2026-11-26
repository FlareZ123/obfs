"""Least-privilege process launcher for the live SCO matched-control experiment.

The evaluator remains the trusted parent. The Node server runs as www-data,
the Python learner runs as nobody, and neither child inherits the runner's
environment or capability set.
"""

from __future__ import annotations

import os
import pwd
import shutil
from typing import Mapping, Sequence


def isolation_accounts():
    """Return distinct server and learner accounts."""
    server = pwd.getpwnam("www-data")
    learner = pwd.getpwnam("nobody")
    if server.pw_uid == learner.pw_uid:
        raise RuntimeError("server and learner identities must differ")
    return server, learner


def safe_environment() -> dict[str, str]:
    """Construct the complete allowlisted child environment."""
    result = {
        "PATH": "/usr/bin:/bin",
        "HOME": "/tmp",
        "TMPDIR": "/tmp",
        "LANG": "C.UTF-8",
        "PYTHONNOUSERSITE": "1",
        "PYTHONHASHSEED": "0",
        "PYTHONDONTWRITEBYTECODE": "1",
    }
    if os.environ.get("LD_LIBRARY_PATH"):
        result["LD_LIBRARY_PATH"] = os.environ["LD_LIBRARY_PATH"]
    return result


def command_as(uid: int, gid: int, argv: Sequence[str],
               environment: Mapping[str, str]) -> list[str]:
    """Build a setpriv/env -i command for an unprivileged child."""
    if not argv or not os.path.isabs(argv[0]):
        raise ValueError("child argv must start with an absolute executable path")
    setpriv = "/usr/bin/setpriv"
    env = "/usr/bin/env"
    clean_exec = [
        env,
        "-i",
        *[f"{key}={value}" for key, value in sorted(environment.items())],
        *argv,
    ]
    drop = [
        setpriv,
        f"--reuid={uid}",
        f"--regid={gid}",
        "--clear-groups",
        "--no-new-privs",
        "--bounding-set=-all",
        "--",
        *clean_exec,
    ]
    if os.geteuid() == 0:
        return drop
    sudo = shutil.which("sudo")
    if not sudo:
        raise RuntimeError("sudo is required for cross-UID process isolation")
    # setpriv must start as root to clear the capability bounding set. env -i
    # runs after the UID/GID transition and scrubs variables sudo may preserve.
    return [sudo, "-n", *drop]


def process_uid(pid: int) -> int:
    """Return the effective owner UID of a live process."""
    return os.stat(f"/proc/{pid}").st_uid


def assert_process_uid(pid: int, expected_uid: int, label: str) -> None:
    """Fail closed if the process table does not show the expected UID."""
    actual = process_uid(pid)
    if actual != expected_uid:
        raise RuntimeError(f"{label} UID mismatch: expected {expected_uid}, got {actual}")



def process_security_state(pid: int) -> dict[str, str]:
    """Read the kernel-attested privilege fields for a process."""
    wanted = {"Uid", "NoNewPrivs", "CapEff", "CapBnd"}
    state: dict[str, str] = {}
    with open(f"/proc/{pid}/status", "r", encoding="ascii") as handle:
        for line in handle:
            key, separator, value = line.partition(":")
            if separator and key in wanted:
                state[key] = value.strip().split()[0]
    missing = wanted - set(state)
    if missing:
        raise RuntimeError(f"process {pid} status is missing {sorted(missing)}")
    return state


def assert_process_security_state(pid: int, expected_uid: int, label: str) -> dict[str, str]:
    """Require the expected UID, no-new-privileges, and zero effective/bound caps."""
    assert_process_uid(pid, expected_uid, label)
    state = process_security_state(pid)
    uids = state["Uid"].split()
    if len(uids) < 2 or int(uids[0]) != expected_uid or int(uids[1]) != expected_uid:
        raise RuntimeError(f"{label} real/effective UID mismatch: {state}")
    if state["NoNewPrivs"] != "1":
        raise RuntimeError(f"{label} lacks no-new-privileges: {state}")
    if state["CapEff"] != "0000000000000000":
        raise RuntimeError(f"{label} has effective capabilities: {state}")
    if state["CapBnd"] != "0000000000000000":
        raise RuntimeError(f"{label} has a non-empty capability bounding set: {state}")
    return state
