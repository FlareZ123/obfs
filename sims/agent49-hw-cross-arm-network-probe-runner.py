#!/usr/bin/env python3
"""Verify that sequential SCO/ordinary arms expose only one local oracle at a time."""
from __future__ import annotations

import importlib.util
import json
import secrets
import shutil
import subprocess
import sys
from pathlib import Path


HERE = Path(__file__).resolve().parent
MATCH_PATH = HERE / "agent2-hw-live-matched-control.py"
SPEC = importlib.util.spec_from_file_location("agent2_live_matched_control", MATCH_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot load matched-control helpers: {MATCH_PATH}")
MATCH = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MATCH
SPEC.loader.exec_module(MATCH)
BASE = MATCH.BASE


def run_single_arm_probe(origin, mirror_root, child_env, learner_user, label):
    source = HERE / "agent49-hw-single-arm-network-probe.py"
    destination = mirror_root / "sims" / source.name
    shutil.copy2(source, destination)
    command = BASE.command_as(
        learner_user.pw_uid,
        learner_user.pw_gid,
        [sys.executable, str(destination), "--origin", origin],
        child_env,
    )
    process = subprocess.Popen(
        command,
        cwd=mirror_root,
        env=child_env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
    )
    try:
        stdout, stderr = process.communicate(timeout=30)
    except subprocess.TimeoutExpired:
        BASE.terminate_process_group(process)
        stdout, stderr = process.communicate()
        raise TimeoutError(f"{label} single-arm probe timed out: {(stderr or '')[-2000:]}")
    if process.returncode != 0 or not stdout.strip():
        raise RuntimeError(
            f"{label} single-arm probe failed: {(stdout or '')[-2000:]}\n{(stderr or '')[-3000:]}"
        )
    result = json.loads(stdout.strip().splitlines()[-1])
    if result.get("status") != "single_arm_isolated":
        raise AssertionError(f"{label} exposed another local oracle: {result!r}")
    if result.get("uid") != learner_user.pw_uid or result.get("euid") != learner_user.pw_uid:
        raise AssertionError(f"{label} probe did not run as nobody: {result!r}")
    if set(result.get("environment_keys", [])) != set(child_env):
        raise AssertionError(f"{label} probe environment was not scrubbed: {result!r}")
    if result.get("no_new_privs") != "1":
        raise AssertionError(f"{label} probe lacks no-new-privileges: {result!r}")
    if result.get("cap_eff") != "0000000000000000":
        raise AssertionError(f"{label} probe has effective capabilities: {result!r}")
    if result.get("cap_bnd") != "0000000000000000":
        raise AssertionError(f"{label} probe has a non-empty capability bounding set: {result!r}")
    if result.get("sudo_blocked") is not True:
        raise AssertionError(f"{label} probe can elevate with sudo: {result!r}")
    if result.get("alternate_services") != []:
        raise AssertionError(f"{label} found an alternate local service: {result!r}")
    return result


def main():
    fixture = BASE.BENCHMARK.generate_fixture(3, 0)
    sco_process = None
    ordinary_process = None
    mirror_root = None
    try:
        server_user, learner_user = BASE.isolation_accounts()
        child_env = BASE.safe_environment()

        # First run the SCO arm alone.
        sco_process, sco_ready, sco_canary, sco_token, mirror_root = BASE.start_server(fixture, 0)
        sco_probe = run_single_arm_probe(
            sco_ready["origin"], mirror_root, child_env, learner_user, "SCO"
        )
        sco_stats, sco_stderr = BASE.stop_server(sco_process)
        sco_process = None

        # Only after the SCO listener has stopped, start the ordinary control
        # with a distinct session token and test that arm alone.
        ordinary_canary = secrets.token_urlsafe(24)
        ordinary_token = secrets.token_urlsafe(32)
        ordinary_process, ordinary_ready = MATCH.start_ordinary_server(
            fixture,
            ordinary_canary,
            ordinary_token,
            sco_ready["method_name"],
            mirror_root,
        )
        ordinary_probe = run_single_arm_probe(
            ordinary_ready["origin"], mirror_root, child_env, learner_user, "ordinary"
        )
        ordinary_stats, ordinary_stderr = BASE.stop_server(ordinary_process)
        ordinary_process = None

        if sco_token == ordinary_token:
            raise AssertionError("sequential arms reused the same session token")
        result = {
            "status": "sequential_single_arm_isolation_confirmed",
            "source_branch_base": "agent2/hw-live-isolated-20261126@274a1cb8d252397edd2a799941514e9468c65856",
            "server_uid": server_user.pw_uid,
            "learner_uid": learner_user.pw_uid,
            "session_tokens_distinct": True,
            "sco_probe": sco_probe,
            "ordinary_probe": ordinary_probe,
            "sco_server_stats": sco_stats,
            "ordinary_server_stats": ordinary_stats,
            "sco_server_stderr": (sco_stderr or "")[-1000:],
            "ordinary_server_stderr": (ordinary_stderr or "")[-1000:],
        }
        result_path = Path.cwd() / "agent49-cross-arm-probe-result.json"
        result_path.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print("SEQUENTIAL_SINGLE_ARM_ISOLATION " + json.dumps(result, sort_keys=True), flush=True)
    finally:
        for process in (ordinary_process, sco_process):
            if process is None:
                continue
            try:
                BASE.stop_server(process)
            except Exception:
                BASE.terminate_process_group(process)
        if mirror_root is not None:
            shutil.rmtree(mirror_root, ignore_errors=True)


if __name__ == "__main__":
    main()
