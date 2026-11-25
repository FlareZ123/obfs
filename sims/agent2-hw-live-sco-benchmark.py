#!/usr/bin/env python3
"""Run the no-reset hW learner as a separate HTTP client against a SCO server."""
from __future__ import annotations

import argparse
import importlib.metadata
import hashlib
import importlib.util
import json
import selectors
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from types import SimpleNamespace

MODULE_PATH = Path(__file__).with_name("agent2-hw-no-reset-benchmark.py")
SPEC = importlib.util.spec_from_file_location("agent2_hw_no_reset_benchmark", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot load benchmark module: {MODULE_PATH}")
BENCHMARK = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = BENCHMARK
SPEC.loader.exec_module(BENCHMARK)


def read_line_with_timeout(stream, timeout_seconds: float) -> str:
    selector = selectors.DefaultSelector()
    selector.register(stream, selectors.EVENT_READ)
    try:
        if not selector.select(timeout_seconds):
            raise TimeoutError("timed out waiting for Node SCO server")
        line = stream.readline()
        if not line:
            raise RuntimeError("Node SCO server closed stdout before readiness")
        return line.rstrip("\n")
    finally:
        selector.close()


def start_server(fixture, seed: int):
    node_path = shutil.which("node")
    sudo_path = shutil.which("sudo")
    if not node_path or not sudo_path:
        raise RuntimeError("node and sudo are required for isolated live SCO server")
    identity = subprocess.run(
        [sudo_path, "-n", "-u", "nobody", "--", "/usr/bin/id", "-u"],
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )
    if identity.returncode != 0 or identity.stdout.strip() != "65534":
        raise RuntimeError(
            "could not launch the SCO server as uid nobody: "
            + identity.stderr.strip()
        )

    # GitHub-hosted runners keep /home/runner/work non-traversable to
    # unprivileged users. Mirror only public compiler/runtime code into a
    # world-readable tree so uid nobody can load the server entry. The private
    # application module remains in the server's separate 0700 temp root.
    repository_root = Path(__file__).resolve().parents[1]
    mirror_root = Path(tempfile.mkdtemp(prefix="obfs-agent2-live-server-"))
    mirror_root.chmod(0o755)
    process = None
    try:
        shutil.copytree(repository_root / "src", mirror_root / "src")
        shutil.copytree(repository_root / "node_modules", mirror_root / "node_modules")
        mirrored_sims = mirror_root / "sims"
        mirrored_sims.mkdir()
        shutil.copy2(
            Path(__file__).with_name("agent2-hw-live-sco-server.js"),
            mirrored_sims / "agent2-hw-live-sco-server.js",
        )
        server_script = mirrored_sims / "agent2-hw-live-sco-server.js"
        command = [
            sudo_path, "-n", "-u", "nobody", "--", node_path, str(server_script)
        ]
        process = subprocess.Popen(
            command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            cwd=mirror_root,
        )
        machine = {
            "next": [list(row) for row in fixture.transitions],
            "output": [list(row) for row in fixture.outputs],
            "initial_state": fixture.initial_state,
        }
        canary = f"agent2-live-sco-private-canary-{fixture.state_count}-{seed}"
        session_token = secrets.token_urlsafe(32)
        payload = {
            "machine": machine,
            "canary": canary,
            "partition_seed": f"agent2-live-sco-{fixture.state_count}-{seed}",
            "session_token": session_token,
        }
        try:
            process.stdin.write(json.dumps(payload, separators=(",", ":")) + "\n")
            process.stdin.flush()
            line = read_line_with_timeout(process.stdout, 30)
        except Exception as error:
            if process.poll() is None:
                process.kill()
            process.wait(timeout=10)
            stderr = process.stderr.read() if process.stderr else ""
            raise RuntimeError(
                f"Node SCO server failed before readiness: {error}; "
                f"stderr={stderr[-4000:]}"
            ) from error

        if line.startswith("ERROR "):
            process.wait(timeout=10)
            stderr = process.stderr.read() if process.stderr else ""
            raise RuntimeError(
                "Node SCO server initialization failed: "
                + line[6:]
                + "\n"
                + stderr[-4000:]
            )
        if not line.startswith("READY "):
            process.kill()
            process.wait(timeout=10)
            stderr = process.stderr.read() if process.stderr else ""
            raise RuntimeError(
                "unexpected Node SCO server readiness line: "
                + line
                + "\n"
                + stderr[-4000:]
            )
        ready = json.loads(line[6:])
        if ready.get("partition_names") != ["step"]:
            raise AssertionError(f"unexpected public SCO methods: {ready!r}")
        return process, ready, canary, session_token, mirror_root
    except Exception:
        if process is not None:
            if process.poll() is None:
                process.kill()
            process.wait(timeout=10)
        shutil.rmtree(mirror_root, ignore_errors=True)
        raise

def preflight(
    origin: str,
    public_path: str,
    rpc_path: str,
    canary: str,
    session_token: str,
    method_name: str,
):
    with urllib.request.urlopen(origin + public_path, timeout=10) as response:
        if response.status != 200:
            raise AssertionError(f"public module returned HTTP {response.status}")
        public_source = response.read().decode("utf-8")
        set_cookie = response.headers.get("Set-Cookie")
        published_method_name = response.headers.get("X-SCO-Method")

    cookie_value = set_cookie.split(";", 1)[0] if set_cookie else None
    session_cookie_issued = cookie_value == "session=" + session_token
    method_name_published = published_method_name == method_name
    if not method_name_published:
        raise AssertionError("public module response did not publish its RPC method identifier")
    session_token_in_public_module = session_token in public_source
    source_disclosed = any(
        token in public_source
        for token in (canary, "privateTable", "serverCanary", session_token)
    )
    if not session_cookie_issued:
        raise AssertionError("public module response did not issue the expected session cookie")
    if not method_name_published:
        raise AssertionError("public module response did not publish the expected RPC method")
    if source_disclosed:
        raise AssertionError("private source marker or session token appeared in public module")

    denied_request = urllib.request.Request(
        origin + rpc_path,
        data=json.dumps({"method": "unauthorized-probe", "args": [0]}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(denied_request, timeout=10) as response:
            unauthorized_status = response.status
    except urllib.error.HTTPError as error:
        unauthorized_status = error.code
        error.read()
    if unauthorized_status != 403:
        raise AssertionError(
            f"unauthenticated RPC expected 403, received {unauthorized_status}"
        )

    try:
        with urllib.request.urlopen(origin + "/obfs/reset", timeout=10) as response:
            reset_status = response.status
    except urllib.error.HTTPError as error:
        reset_status = error.code
        error.read()
    if reset_status != 404:
        raise AssertionError(f"unexpected reset route status: {reset_status}")

    return {
        "source_disclosed": source_disclosed,
        "session_cookie_issued": session_cookie_issued,
        "session_token_in_public_module": session_token_in_public_module,
        "method_name_published": method_name_published,
        "source_bytes": len(public_source.encode("utf-8")),
        "source_sha256": hashlib.sha256(public_source.encode("utf-8")).hexdigest(),
        "unauthorized_status": unauthorized_status,
        "reset_status": reset_status,
    }


def stop_server(process):
    if process.poll() is not None:
        stderr = process.stderr.read() if process.stderr else ""
        return None, stderr
    try:
        process.stdin.write(json.dumps({"command": "shutdown"}) + "\n")
        process.stdin.flush()
        line = read_line_with_timeout(process.stdout, 15)
        if not line.startswith("STATS "):
            raise RuntimeError("unexpected Node SCO shutdown line: " + line)
        stats = json.loads(line[6:])
        process.wait(timeout=10)
        stderr = process.stderr.read() if process.stderr else ""
        return stats, stderr
    except Exception:
        process.kill()
        process.wait(timeout=10)
        stderr = process.stderr.read() if process.stderr else ""
        raise RuntimeError("failed to stop Node SCO server: " + stderr)


def reconstruct_hypothesis(serialized_states):
    states = [
        SimpleNamespace(
            state_id=spec["state_id"],
            output_fun=dict(spec["output_fun"]),
            transitions={},
        )
        for spec in serialized_states
    ]
    for state, spec in zip(states, serialized_states):
        for letter, target_index in spec["transitions"].items():
            if target_index is not None:
                if not 0 <= target_index < len(states):
                    raise AssertionError("hypothesis transition index out of range")
                state.transitions[letter] = states[target_index]
    return SimpleNamespace(states=states)


def verify_target_trace(fixture, trace):
    state = fixture.initial_state
    for letter, observed_output in trace:
        input_index = BENCHMARK.ALPHABET.index(letter)
        expected_output = fixture.outputs[state][input_index]
        if expected_output != observed_output:
            raise AssertionError(
                f"HTTP trace differs from target at state {state}, input {letter}"
            )
        state = fixture.transitions[state][input_index]
    return state


def run_one(state_count: int, seed: int, args):
    started = time.perf_counter()
    fixture = BENCHMARK.generate_fixture(state_count, seed)
    oracle_seed = (
        seed * 0x9E3779B1 + state_count * 0x85EBCA77
    ) & 0xFFFFFFFF
    server_process = None
    server_root = None
    server_stats = None
    server_stderr = ""
    try:
        server_process, ready, canary, session_token, server_root = start_server(fixture, seed)
        preflight_result = preflight(
            ready["origin"],
            ready["public_module_path"],
            ready["rpc_path"],
            canary,
            session_token,
            ready["method_name"],
        )
        client_script = Path(__file__).with_name("agent2-hw-live-sco-client.py")
        command = [
            sys.executable,
            str(client_script),
            "--origin", ready["origin"],
            "--oracle-seed", str(oracle_seed),
            "--random-walk-length", str(args.random_walk_length),
            "--origin-states", str(args.origin_states),
        ]
        try:
            client_process = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=args.timeout_seconds + 10,
                check=False,
            )
        except subprocess.TimeoutExpired as error:
            return {
                "state_count": state_count,
                "seed": seed,
                "oracle_seed": oracle_seed,
                "status": "timeout",
                "timeout_seconds": args.timeout_seconds,
                "partial_stdout": (error.stdout or "")[-2000:],
                "partial_stderr": (error.stderr or "")[-2000:],
                "fixture_digest": BENCHMARK.digest_fixture(fixture),
                "elapsed_seconds": round(time.perf_counter() - started, 4),
            }
        if not client_process.stdout.strip():
            raise RuntimeError(
                "HTTP hW client returned no JSON; stderr="
                + client_process.stderr[-3000:]
            )
        client_result = json.loads(client_process.stdout.strip().splitlines()[-1])
        if client_process.returncode != 0 or client_result.get("status") != "completed":
            raise RuntimeError(
                "HTTP hW client failed: "
                + json.dumps(client_result, sort_keys=True)
                + "\n"
                + client_process.stderr[-3000:]
            )

        trace = client_result["trace"]
        target_post_state = verify_target_trace(fixture, trace)
        hypothesis = reconstruct_hypothesis(client_result["hypothesis_states"])
        evaluation = BENCHMARK.evaluate_hypothesis(fixture, hypothesis, trace)
        if evaluation["target_post_trace_state"] != target_post_state:
            raise AssertionError("target post-trace state disagrees with replay")

        steps_total = client_result["sul_num_steps"]
        if steps_total != len(trace) or steps_total != client_result["http_step_calls"]:
            raise AssertionError("HTTP step, SUL step, and trace counts disagree")
        if client_result["aalpy_steps_learning_raw"] != steps_total:
            raise AssertionError("AALpy steps_learning does not equal total SUL steps")
        step_metrics = BENCHMARK.derive_step_metrics(
            steps_total, client_result["oracle_num_steps"]
        )

        server_stats, server_stderr = stop_server(server_process)
        server_process = None
        expected_steps = steps_total
        if server_stats["http_requests"] != expected_steps + 4:
            raise AssertionError(f"unexpected total HTTP request count: {server_stats}")
        if server_stats["rpc_requests"] != expected_steps + 1:
            raise AssertionError(f"unexpected RPC request count: {server_stats}")
        if server_stats["client_module_requests"] != 2:
            raise AssertionError(f"unexpected client-module requests: {server_stats}")
        if not preflight_result["session_cookie_issued"]:
            raise AssertionError("parent preflight did not observe the session cookie")
        if preflight_result["session_token_in_public_module"]:
            raise AssertionError("session token leaked into the public module body")
        if client_result["client_module_fetch_status"] != 200:
            raise AssertionError("learner did not fetch the public client module")
        if not client_result["client_cookie_present"]:
            raise AssertionError("learner did not obtain a session cookie from HTTP")
        if client_result["client_method_name"] != ready["method_name"]:
            raise AssertionError("learner did not obtain the public RPC method identifier")
        if server_stats["authorized_rpc_requests"] != expected_steps:
            raise AssertionError(f"unexpected authorized RPC requests: {server_stats}")
        if server_stats["unauthorized_rpc_requests"] != 1:
            raise AssertionError(f"unexpected unauthorized RPC requests: {server_stats}")

        result = {
            "state_count": state_count,
            "seed": seed,
            "oracle_seed": oracle_seed,
            "status": "completed",
            "target_initial_state": fixture.initial_state,
            "target_post_trace_state": target_post_state,
            "fixture_generation_attempts": fixture.generation_attempts,
            "fixture_digest": BENCHMARK.digest_fixture(fixture),
            "trace_digest": BENCHMARK.digest_trace(trace),
            "source_disclosed": preflight_result["source_disclosed"],
            "session_cookie_issued": preflight_result["session_cookie_issued"],
            "session_token_in_public_module": preflight_result["session_token_in_public_module"],
            "client_module_fetch_status": client_result["client_module_fetch_status"],
            "client_cookie_present": client_result["client_cookie_present"],
            "method_name_published": preflight_result["method_name_published"],
            "client_method_name": client_result["client_method_name"],
            "client_method_name_matches": client_result["client_method_name"] == ready["method_name"],
            "client_module_source_disclosed": client_result["client_module_source_disclosed"],
            "source_bytes": preflight_result["source_bytes"],
            "source_sha256": preflight_result["source_sha256"],
            "unauthorized_status": preflight_result["unauthorized_status"],
            "reset_status": preflight_result["reset_status"],
            "partition_names": ready["partition_names"],
            "server_user_isolated": True,
            "server_stats": server_stats,
            "server_stderr": server_stderr[-1000:],
            "pre_calls": client_result["pre_calls"],
            "post_calls": client_result["post_calls"],
            "query_calls": client_result["query_calls"],
            "sul_num_queries": client_result["sul_num_queries"],
            "sul_num_steps": steps_total,
            "http_step_calls": client_result["http_step_calls"],
            "steps_total": step_metrics["steps_total"],
            "steps_oracle": step_metrics["steps_oracle"],
            "steps_non_oracle": step_metrics["steps_non_oracle"],
            "aalpy_steps_learning_raw": client_result["aalpy_steps_learning_raw"],
            "aalpy_steps_eq_oracle_raw": client_result["aalpy_steps_eq_oracle_raw"],
            "http_step_latency_ms": client_result["http_step_latency_ms"],
            "learner_elapsed_seconds": client_result["elapsed_seconds"],
            "hypothesis_states": len(hypothesis.states),
            "hypothesis_complete": evaluation["hypothesis_complete"],
            "trace_matching_initial_candidates": evaluation["candidate_count"],
            "trace_matching_candidate_ids": [
                repr(match["start"].state_id) for match in evaluation["matches"]
            ],
            "candidate_product_results": evaluation["candidate_results"],
            "candidate_end_equivalence_classes": evaluation["candidate_end_equivalence_classes"],
            "candidate_end_behavior_unambiguous": evaluation["candidate_end_behavior_unambiguous"],
            "target_initial_behavior_present": evaluation["target_initial_behavior_present"],
            "all_trace_candidates_initial_equivalent": evaluation["all_trace_candidates_initial_equivalent"],
            "target_future_behavior_present": evaluation["target_future_behavior_present"],
            "all_trace_candidates_future_equivalent": evaluation["all_trace_candidates_future_equivalent"],
            "returned_hypothesis_future_behavior_certified": evaluation["returned_hypothesis_future_behavior_certified"],
            "exact_initial_clone_success": evaluation["exact_initial_clone_success"],
            "future_clone_success": evaluation["future_clone_success"],
            "ambiguous_initial_state": evaluation["ambiguous_initial_state"],
            "ambiguous_initial_behavior": evaluation["ambiguous_initial_behavior"],
            "ambiguous_future_behavior": evaluation["ambiguous_future_behavior"],
            "no_trace_matching_candidate": evaluation["no_trace_matching_candidate"],
            "false_initial_convergence": evaluation["false_initial_convergence"],
            "false_future_convergence": evaluation["false_future_convergence"],
            "elapsed_seconds": round(time.perf_counter() - started, 4),
        }
        return result
    except Exception as error:
        return {
            "state_count": state_count,
            "seed": seed,
            "oracle_seed": oracle_seed,
            "status": "error",
            "error": repr(error),
            "fixture_digest": BENCHMARK.digest_fixture(fixture),
            "elapsed_seconds": round(time.perf_counter() - started, 4),
        }
    finally:
        if server_process is not None:
            try:
                stop_server(server_process)
            except Exception:
                pass
        if server_root is not None:
            shutil.rmtree(server_root, ignore_errors=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--min-states", type=int, default=2)
    parser.add_argument("--max-states", type=int, default=5)
    parser.add_argument("--seeds", type=int, default=2)
    parser.add_argument("--timeout-seconds", type=int, default=30)
    parser.add_argument("--random-walk-length", type=int, default=30)
    parser.add_argument("--origin-states", type=int, default=20)
    args = parser.parse_args()
    if not (2 <= args.min_states <= args.max_states <= 12):
        raise ValueError("state range must satisfy 2 <= min <= max <= 12")
    if not (1 <= args.seeds <= 20):
        raise ValueError("seeds must be in 1..20")

    started = time.perf_counter()
    results = []
    for state_count in range(args.min_states, args.max_states + 1):
        for seed in range(args.seeds):
            results.append(run_one(state_count, seed, args))

    completed = [row for row in results if row["status"] == "completed"]
    timeouts = [row for row in results if row["status"] == "timeout"]
    errors = [row for row in results if row["status"] == "error"]
    output = {
        "benchmark": "agent2-live-http-no-reset-hW",
        "aalpy_version": importlib.metadata.version("aalpy"),
        "scope": {
            "state_counts": [args.min_states, args.max_states],
            "seeds_per_state_count": args.seeds,
            "random_walk_length": args.random_walk_length,
            "origin_states": args.origin_states,
            "timeout_seconds": args.timeout_seconds,
            "learner_process": "separate Python subprocess; receives only HTTP origin, fetches the public module, and obtains its RPC method identifier and session cookie from response headers",
            "server_process": "Node SCO process run as uid nobody; private fixture and per-run session token supplied over stdin and held in server memory/private temp directory",
            "evaluator": "parent process only; target fixture is not passed to learner subprocess",
            "candidate_scope": "trace-matching states in the returned conjecture only, not the full model version space",
        },
        "total_runs": len(results),
        "completed_runs": len(completed),
        "timeouts": len(timeouts),
        "errors": len(errors),
        "exact_initial_clone_successes": sum(
            bool(row.get("exact_initial_clone_success")) for row in completed
        ),
        "future_clone_successes": sum(
            bool(row.get("future_clone_success")) for row in completed
        ),
        "candidate_end_behavior_unambiguous_runs": sum(
            bool(row.get("candidate_end_behavior_unambiguous")) for row in completed
        ),
        "ambiguous_initial_behavior_runs": sum(
            bool(row.get("ambiguous_initial_behavior")) for row in completed
        ),
        "ambiguous_future_behavior_runs": sum(
            bool(row.get("ambiguous_future_behavior")) for row in completed
        ),
        "false_future_convergences": sum(
            bool(row.get("false_future_convergence")) for row in completed
        ),
        "total_sul_steps": sum(row.get("steps_total", 0) for row in completed),
        "total_http_requests": sum(
            row.get("server_stats", {}).get("http_requests", 0) for row in completed
        ),
        "elapsed_seconds": round(time.perf_counter() - started, 4),
        "results": results,
    }
    print(json.dumps(output, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
