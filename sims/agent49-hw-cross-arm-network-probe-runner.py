#!/usr/bin/env python3
"""Run a red-first probe for cross-arm localhost reachability under the real hW launchers."""
from __future__ import annotations

import importlib.util
import json
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


def main():
    fixture = BASE.BENCHMARK.generate_fixture(3, 0)
    sco_process = None
    ordinary_process = None
    mirror_root = None
    try:
        sco_process, sco_ready, canary, session_token, mirror_root = BASE.start_server(fixture, 0)
        ordinary_process, ordinary_ready = MATCH.start_ordinary_server(
            fixture,
            canary,
            session_token,
            sco_ready["method_name"],
            mirror_root,
        )
        if ordinary_ready["method_name"] != sco_ready["method_name"]:
            raise AssertionError("the two arms did not publish the same method identifier")

        source = HERE / "agent49-hw-cross-arm-network-probe.py"
        destination = mirror_root / "sims" / source.name
        shutil.copy2(source, destination)

        server_user, learner_user = BASE.isolation_accounts()
        child_env = BASE.safe_environment()
        command = BASE.command_as(
            learner_user.pw_uid,
            learner_user.pw_gid,
            [
                sys.executable,
                str(destination),
                "--origin",
                sco_ready["origin"],
            ],
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
            raise TimeoutError("cross-arm network probe exceeded 30 seconds: " + (stderr or "")[-2000:])

        if process.returncode != 0 or not stdout.strip():
            raise RuntimeError(
                "cross-arm learner probe failed: "
                + (stdout or "")[-2000:]
                + "\n"
                + (stderr or "")[-3000:]
            )
        result = json.loads(stdout.strip().splitlines()[-1])

        expected_keys = set(child_env)
        if result.get("uid") != learner_user.pw_uid or result.get("euid") != learner_user.pw_uid:
            raise AssertionError(f"probe did not run as nobody: {result!r}")
        if set(result.get("environment_keys", [])) != expected_keys:
            raise AssertionError(f"probe environment was not scrubbed: {result!r}")
        if result.get("no_new_privs") != "1":
            raise AssertionError(f"probe lacks no-new-privileges: {result!r}")
        if result.get("cap_eff") != "0000000000000000":
            raise AssertionError(f"probe has effective capabilities: {result!r}")
        if result.get("cap_bnd") != "0000000000000000":
            raise AssertionError(f"probe has a non-empty capability bounding set: {result!r}")
        if result.get("sudo_blocked") is not True:
            raise AssertionError(f"probe can elevate with sudo: {result!r}")
        if result.get("status") != "cross_arm_oracle_reproduced":
            raise AssertionError(f"cross-arm oracle was not reproduced: {result!r}")
        if result.get("candidate_port") == result.get("alternate_port"):
            raise AssertionError(f"probe did not find a second listener: {result!r}")
        if result.get("cookies_equal") is not True:
            raise AssertionError(f"the two public module endpoints did not issue the same cookie: {result!r}")
        if result.get("method_names_equal") is not True:
            raise AssertionError(f"the two arms did not share a method identifier: {result!r}")
        if result.get("alternate_authorized_status") != 200:
            raise AssertionError(f"the alternate service did not accept an authorized RPC: {result!r}")
        expected_value = str(fixture.outputs[fixture.initial_state][0])
        if result.get("alternate_rpc_value") != expected_value:
            raise AssertionError(
                f"alternate service returned {result.get('alternate_rpc_value')!r}, "
                f"expected {expected_value!r}"
            )

        result_path = Path.cwd() / "agent49-cross-arm-probe-result.json"
        result_path.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print("CROSS_ARM_NETWORK_ORACLE_PROBE " + json.dumps(result, sort_keys=True), flush=True)
        print(
            "CONFIRMED: a learner with no target seed, state count, or alternate origin "
            "discovered the second localhost service and completed an authorized step.",
            flush=True,
        )
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
