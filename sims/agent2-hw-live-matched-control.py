#!/usr/bin/env python3
"""Matched no-reset hW attack against generated SCO and ordinary minified HTTP controls."""
from __future__ import annotations

import argparse
import hashlib
import os
import importlib.util
import json
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE_PATH = Path(__file__).with_name("agent2-hw-live-sco-benchmark.py")
BASE_SPEC = importlib.util.spec_from_file_location("agent2_live_sco_benchmark", BASE_PATH)
if BASE_SPEC is None or BASE_SPEC.loader is None:
    raise RuntimeError(f"cannot load SCO benchmark helpers: {BASE_PATH}")
BASE = importlib.util.module_from_spec(BASE_SPEC)
sys.modules[BASE_SPEC.name] = BASE
BASE_SPEC.loader.exec_module(BASE)
BENCHMARK = BASE.BENCHMARK


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def start_ordinary_server(fixture, canary: str, session_token: str,
                          method_name: str, mirror_root: Path):
    node_path = shutil.which("node")
    if not node_path:
        raise RuntimeError("node is required for the ordinary control")

    script_source = Path(__file__).with_name("agent2-hw-live-ordinary-server.js")
    script_path = mirror_root / "sims" / script_source.name
    shutil.copy2(script_source, script_path)

    command, child_env = BASE.launch_as_user(
        "www-data", node_path, [str(script_path)]
    )
    process = subprocess.Popen(
        command,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        cwd=mirror_root,
        env=child_env,
    )
    machine = {
        "next": [list(row) for row in fixture.transitions],
        "output": [list(row) for row in fixture.outputs],
        "initial_state": fixture.initial_state,
    }
    payload = {
        "machine": machine,
        "canary": canary,
        "method_name": method_name,
        "session_token": session_token,
    }
    try:
        process.stdin.write(json.dumps(payload, separators=(",", ":")) + "\n")
        process.stdin.flush()
        line = BASE.read_line_with_timeout(process.stdout, 30)
        if line.startswith("ERROR "):
            process.wait(timeout=10)
            stderr = process.stderr.read() if process.stderr else ""
            raise RuntimeError("ordinary server initialization failed: " + line[6:] + "\n" + stderr[-4000:])
        if not line.startswith("READY "):
            raise RuntimeError("unexpected ordinary server readiness line: " + line)
        ready = json.loads(line[6:])
        if ready.get("server_kind") != "ordinary-esbuild-minified-control":
            raise AssertionError(f"unexpected ordinary server identity: {ready!r}")
        if ready.get("method_name") != method_name:
            raise AssertionError("ordinary control did not retain the public method identifier")
        expected_uid = BASE.pwd.getpwnam("www-data").pw_uid
        if ready.get("server_uid") != expected_uid:
            raise AssertionError(f"ordinary server UID mismatch: {ready!r}")
        if os.stat(f"/proc/{ready['server_pid']}").st_uid != expected_uid:
            raise AssertionError("ordinary server /proc owner does not match www-data")
        if set(ready.get("server_env_keys", [])) != set(child_env):
            raise AssertionError(f"ordinary server environment was not scrubbed: {ready!r}")
        return process, ready
    except Exception:
        if process.poll() is None:
            process.kill()
        process.wait(timeout=10)
        stderr = process.stderr.read() if process.stderr else ""
        raise RuntimeError("ordinary server failed to start: " + stderr[-4000:])


def invalid_operation_probe(origin: str, method_name: str, session_token: str):
    body = json.dumps(
        {"method": method_name, "args": [2]},
        separators=(",", ":"),
    )
    request = urllib.request.Request(
        origin + "/obfs/rpc",
        data=body.encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Cookie": "session=" + session_token,
            "Cache-Control": "no-store",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            status = response.status
            raw = response.read()
            headers = response.headers
    except urllib.error.HTTPError as error:
        status = error.code
        raw = error.read()
        headers = error.headers
    return {
        "request": {
            "method": "POST",
            "path": "/obfs/rpc",
            "content_type": "application/json",
            "cookie_sha256": sha256_bytes(("session=" + session_token).encode("utf-8")),
            "cache_control": "no-store",
            "body": body,
        },
        "response": {
            "status": status,
            "content_type": headers.get("Content-Type"),
            "cache_control": headers.get("Cache-Control"),
            "nosniff": headers.get("X-Content-Type-Options"),
            "content_length": headers.get("Content-Length"),
            "body_bytes": len(raw),
            "body_sha256": sha256_bytes(raw),
        },
    }


def run_client(origin: str, learner_seed: int, args, mirror_root: Path):
    client_source = Path(__file__).with_name("agent2-hw-live-sco-client.py")
    client_script = mirror_root / "sims" / client_source.name
    shutil.copy2(client_source, client_script)
    command, child_env = BASE.launch_as_user(
        "nobody", sys.executable, [
            str(client_script),
            "--learner-seed", str(learner_seed),
            "--origin", origin,
            "--random-walk-length", str(args.random_walk_length),
            "--origin-states", str(args.origin_states),
        ]
    )
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=args.timeout_seconds + 10,
            check=False,
            cwd=mirror_root,
            env=child_env,
        )
    except subprocess.TimeoutExpired as error:
        return {
            "status": "timeout",
            "partial_stdout": (error.stdout or "")[-2000:],
            "partial_stderr": (error.stderr or "")[-2000:],
        }
    if not completed.stdout.strip():
        raise RuntimeError("hW client returned no JSON; stderr=" + completed.stderr[-3000:])
    result = json.loads(completed.stdout.strip().splitlines()[-1])
    if completed.returncode != 0 or result.get("status") != "completed":
        raise RuntimeError(
            "hW client failed: " + json.dumps(result, sort_keys=True)
            + "\n" + completed.stderr[-3000:]
        )
    process_state = result.get("client_process", {})
    expected_uid = BASE.pwd.getpwnam("nobody").pw_uid
    if process_state.get("Uid") != expected_uid or process_state.get("Euid") != expected_uid:
        raise AssertionError(f"learner UID mismatch: {process_state!r}")
    if process_state.get("NoNewPrivs") != "1" or process_state.get("CapEff") != "0000000000000000":
        raise AssertionError(f"learner privilege state is unsafe: {process_state!r}")
    if process_state.get("SudoBlocked") is not True:
        raise AssertionError(f"learner retained sudo privilege: {process_state!r}")
    if set(process_state.get("EnvironmentKeys", [])) != set(child_env):
        raise AssertionError(f"learner environment was not scrubbed: {process_state!r}")
    return result


def module_public_metadata(trace):
    response = trace["response"]
    return {
        "request": trace["request"],
        "response": {
            key: response[key]
            for key in (
                "status",
                "content_type",
                "cache_control",
                "nosniff",
                "set_cookie_present",
                "set_cookie_value_sha256",
                "set_cookie_attributes",
                "method_name",
            )
        },
    }


def evaluate_client(fixture, client_result):
    trace = client_result["trace"]
    target_post_state = BASE.verify_target_trace(fixture, trace)
    hypothesis = BASE.reconstruct_hypothesis(client_result["hypothesis_states"])
    evaluation = BENCHMARK.evaluate_hypothesis(fixture, hypothesis, trace)
    if evaluation["target_post_trace_state"] != target_post_state:
        raise AssertionError("target post-trace state disagrees with replay")
    summary_keys = (
        "hypothesis_complete",
        "candidate_count",
        "candidate_end_equivalence_classes",
        "candidate_end_behavior_unambiguous",
        "target_initial_behavior_present",
        "all_trace_candidates_initial_equivalent",
        "target_future_behavior_present",
        "all_trace_candidates_future_equivalent",
        "returned_hypothesis_future_behavior_certified",
        "exact_initial_clone_success",
        "future_clone_success",
        "ambiguous_initial_behavior",
        "ambiguous_future_behavior",
        "no_trace_matching_candidate",
        "false_initial_convergence",
        "false_future_convergence",
        "candidate_results",
    )
    return {
        "target_post_trace_state": target_post_state,
        "hypothesis_states": len(hypothesis.states),
        **{key: evaluation[key] for key in summary_keys},
    }


def validate_server_stats(stats, steps: int, label: str):
    expected = {
        "http_requests": steps + 5,
        "rpc_requests": steps + 2,
        "client_module_requests": 2,
        "authorized_rpc_requests": steps + 1,
        "unauthorized_rpc_requests": 1,
    }
    for key, value in expected.items():
        if stats.get(key) != value:
            raise AssertionError(
                f"{label} {key} expected {value}, received {stats.get(key)}; stats={stats}"
            )


def run_one(state_count: int, seed: int, args):
    started = time.perf_counter()
    if args.fixture_family == "random":
        fixture = BENCHMARK.generate_fixture(state_count, seed)
    else:
        fixture = BENCHMARK.generate_delayed_pair_fixture(state_count, seed)
    learner_seed = args.learner_seed

    sco_process = None
    ordinary_process = None
    mirror_root = None
    try:
        sco_process, sco_ready, canary, session_token, mirror_root = BASE.start_server(fixture, seed)
        ordinary_process, ordinary_ready = start_ordinary_server(
            fixture,
            canary,
            session_token,
            sco_ready["method_name"],
            mirror_root,
        )
        if ordinary_ready["method_name"] != sco_ready["method_name"]:
            raise AssertionError("matched arms published different method identifiers")

        sco_preflight = BASE.preflight(
            sco_ready["origin"],
            sco_ready["public_module_path"],
            sco_ready["rpc_path"],
            canary,
            session_token,
            sco_ready["method_name"],
        )
        ordinary_preflight = BASE.preflight(
            ordinary_ready["origin"],
            ordinary_ready["public_module_path"],
            ordinary_ready["rpc_path"],
            canary,
            session_token,
            ordinary_ready["method_name"],
        )
        sco_invalid = invalid_operation_probe(
            sco_ready["origin"], sco_ready["method_name"], session_token
        )
        ordinary_invalid = invalid_operation_probe(
            ordinary_ready["origin"], ordinary_ready["method_name"], session_token
        )
        if sco_invalid != ordinary_invalid:
            raise AssertionError("authorized invalid-argument response traces differ")
        if sco_invalid["response"]["status"] != 403:
            raise AssertionError("authorized invalid-argument probe did not return HTTP 403")

        sco_client = run_client(sco_ready["origin"], learner_seed, args, mirror_root)
        if sco_client.get("status") == "timeout":
            return {
                "status": "timeout",
                "state_count": state_count,
                "seed": seed,
                "learner_seed": learner_seed,
                "timeout_seconds": args.timeout_seconds,
                "fixture_digest": BENCHMARK.digest_fixture(fixture),
                "elapsed_seconds": round(time.perf_counter() - started, 4),
            }
        ordinary_client = run_client(ordinary_ready["origin"], learner_seed, args, mirror_root)
        if ordinary_client.get("status") == "timeout":
            return {
                "status": "timeout",
                "state_count": state_count,
                "seed": seed,
                "learner_seed": learner_seed,
                "timeout_seconds": args.timeout_seconds,
                "fixture_digest": BENCHMARK.digest_fixture(fixture),
                "elapsed_seconds": round(time.perf_counter() - started, 4),
            }

        sco_eval = evaluate_client(fixture, sco_client)
        ordinary_eval = evaluate_client(fixture, ordinary_client)

        sco_stats, sco_stderr = BASE.stop_server(sco_process)
        sco_process = None
        ordinary_stats, ordinary_stderr = BASE.stop_server(ordinary_process)
        ordinary_process = None

        sco_steps = sco_client["sul_num_steps"]
        ordinary_steps = ordinary_client["sul_num_steps"]
        validate_server_stats(sco_stats, sco_steps, "SCO")
        validate_server_stats(ordinary_stats, ordinary_steps, "ordinary")

        sco_module_trace = sco_client["client_module_trace"]
        ordinary_module_trace = ordinary_client["client_module_trace"]
        module_metadata_equal = (
            module_public_metadata(sco_module_trace)
            == module_public_metadata(ordinary_module_trace)
        )
        source_body_different = (
            sco_module_trace["response"]["body_sha256"]
            != ordinary_module_trace["response"]["body_sha256"]
        )
        trace_equal = sco_client["trace"] == ordinary_client["trace"]
        hypothesis_equal = sco_client["hypothesis_states"] == ordinary_client["hypothesis_states"]
        rpc_trace_equal = (
            sco_client["rpc_record_count"] == ordinary_client["rpc_record_count"]
            and sco_client["rpc_trace_sha256"] == ordinary_client["rpc_trace_sha256"]
        )
        invalid_probe_equal = sco_invalid == ordinary_invalid
        preflight_equal = (
            sco_preflight["unauthorized_status"] == ordinary_preflight["unauthorized_status"]
            and sco_preflight["reset_status"] == ordinary_preflight["reset_status"]
            and sco_preflight["session_cookie_issued"] == ordinary_preflight["session_cookie_issued"]
            and sco_preflight["session_token_in_public_module"] == ordinary_preflight["session_token_in_public_module"]
            and sco_preflight["method_name_published"] == ordinary_preflight["method_name_published"]
            and sco_preflight["source_disclosed"] == ordinary_preflight["source_disclosed"]
        )
        stats_equal = sco_stats == ordinary_stats
        evaluation_equal = sco_eval == ordinary_eval

        matched = all((
            trace_equal,
            hypothesis_equal,
            rpc_trace_equal,
            module_metadata_equal,
            source_body_different,
            invalid_probe_equal,
            preflight_equal,
            stats_equal,
            evaluation_equal,
            sco_steps == ordinary_steps,
        ))
        if not matched:
            raise AssertionError(
                "matched-control mismatch: " + json.dumps({
                    "trace_equal": trace_equal,
                    "hypothesis_equal": hypothesis_equal,
                    "rpc_trace_equal": rpc_trace_equal,
                    "module_metadata_equal": module_metadata_equal,
                    "source_body_different": source_body_different,
                    "invalid_probe_equal": invalid_probe_equal,
                    "preflight_equal": preflight_equal,
                    "stats_equal": stats_equal,
                    "evaluation_equal": evaluation_equal,
                    "sco_steps": sco_steps,
                    "ordinary_steps": ordinary_steps,
                }, sort_keys=True)
            )

        return {
            "status": "completed",
            "fixture_family": args.fixture_family,
            "state_count": state_count,
            "seed": seed,
            "learner_seed": learner_seed,
            "fixture_digest": BENCHMARK.digest_fixture(fixture),
            "trace_digest": BENCHMARK.digest_trace(sco_client["trace"]),
            "process_isolation": {
                "sco_server_uid": sco_ready["server_uid"],
                "ordinary_server_uid": ordinary_ready["server_uid"],
                "learner_uid": sco_client["client_process"]["Uid"],
                "learner_no_new_privs": sco_client["client_process"]["NoNewPrivs"] == "1",
                "learner_cap_eff": sco_client["client_process"]["CapEff"],
                "learner_sudo_blocked": sco_client["client_process"]["SudoBlocked"],
                "learner_environment_keys": sco_client["client_process"]["EnvironmentKeys"],
            },
            "sco": {
                "source_disclosed": sco_preflight["source_disclosed"],
                "source_bytes": sco_preflight["source_bytes"],
                "source_sha256": sco_preflight["source_sha256"],
                "client_module_body_sha256": sco_module_trace["response"]["body_sha256"],
                "client_module_body_bytes": sco_module_trace["response"]["body_bytes"],
                "steps_total": sco_steps,
                "steps_oracle": sco_client["oracle_num_steps"],
                "steps_non_oracle": sco_steps - sco_client["oracle_num_steps"],
                "rpc_record_count": sco_client["rpc_record_count"],
                "rpc_trace_sha256": sco_client["rpc_trace_sha256"],
                "learner_elapsed_seconds": sco_client["elapsed_seconds"],
                "server_stats": sco_stats,
                "preflight": sco_preflight,
                "invalid_operation_probe": sco_invalid,
                "evaluation": sco_eval,
            },
            "ordinary": {
                "source_disclosed": ordinary_preflight["source_disclosed"],
                "source_bytes": ordinary_preflight["source_bytes"],
                "source_sha256": ordinary_preflight["source_sha256"],
                "client_module_body_sha256": ordinary_module_trace["response"]["body_sha256"],
                "client_module_body_bytes": ordinary_module_trace["response"]["body_bytes"],
                "steps_total": ordinary_steps,
                "steps_oracle": ordinary_client["oracle_num_steps"],
                "steps_non_oracle": ordinary_steps - ordinary_client["oracle_num_steps"],
                "rpc_record_count": ordinary_client["rpc_record_count"],
                "rpc_trace_sha256": ordinary_client["rpc_trace_sha256"],
                "learner_elapsed_seconds": ordinary_client["elapsed_seconds"],
                "server_stats": ordinary_stats,
                "preflight": ordinary_preflight,
                "invalid_operation_probe": ordinary_invalid,
                "evaluation": ordinary_eval,
            },
            "comparison": {
                "matched": matched,
                "learner_trace_equal": trace_equal,
                "hypothesis_equal": hypothesis_equal,
                "rpc_request_response_trace_equal": rpc_trace_equal,
                "client_module_public_metadata_equal": module_metadata_equal,
                "client_module_source_bodies_differ": source_body_different,
                "authorized_invalid_argument_probe_equal": invalid_probe_equal,
                "preflight_contract_equal": preflight_equal,
                "server_request_counts_equal": stats_equal,
                "exact_evaluation_equal": evaluation_equal,
                "steps_equal": sco_steps == ordinary_steps,
            },
            "elapsed_seconds": round(time.perf_counter() - started, 4),
            "server_stderr": {
                "sco": sco_stderr[-1000:],
                "ordinary": ordinary_stderr[-1000:],
            },
        }
    except Exception as error:
        return {
            "status": "error",
            "fixture_family": args.fixture_family,
            "state_count": state_count,
            "seed": seed,
            "learner_seed": learner_seed,
            "error": repr(error),
            "fixture_digest": BENCHMARK.digest_fixture(fixture),
            "elapsed_seconds": round(time.perf_counter() - started, 4),
        }
    finally:
        if sco_process is not None:
            try:
                BASE.stop_server(sco_process)
            except Exception:
                pass
        if ordinary_process is not None:
            try:
                BASE.stop_server(ordinary_process)
            except Exception:
                pass
        if mirror_root is not None:
            shutil.rmtree(mirror_root, ignore_errors=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture-family", choices=("random", "delayed-pair"), default="random")
    parser.add_argument("--min-states", type=int, default=2)
    parser.add_argument("--max-states", type=int, default=5)
    parser.add_argument("--seeds", type=int, default=2)
    parser.add_argument("--timeout-seconds", type=int, default=120)
    parser.add_argument("--random-walk-length", type=int, default=30)
    parser.add_argument("--origin-states", type=int, default=20)
    parser.add_argument("--learner-seed", type=int, default=20261126)
    args = parser.parse_args()

    if args.fixture_family == "random":
        if not (2 <= args.min_states <= args.max_states <= 12):
            raise ValueError("random fixture range must satisfy 2 <= min <= max <= 12")
    else:
        if not (3 <= args.min_states <= args.max_states <= 64):
            raise ValueError("delayed-pair fixture range must satisfy 3 <= min <= max <= 64")
    if not (1 <= args.seeds <= 20):
        raise ValueError("seeds must be in 1..20")
    if not (1 <= args.timeout_seconds <= 600):
        raise ValueError("timeout_seconds must be in 1..600")
    if not (1 <= args.random_walk_length <= 1000):
        raise ValueError("random_walk_length must be in 1..1000")
    if not (1 <= args.origin_states <= 1000):
        raise ValueError("origin_states must be in 1..1000")

    started = time.perf_counter()
    results = []
    for state_count in range(args.min_states, args.max_states + 1):
        for seed in range(args.seeds):
            results.append(run_one(state_count, seed, args))

    completed = [row for row in results if row["status"] == "completed"]
    timeouts = [row for row in results if row["status"] == "timeout"]
    errors = [row for row in results if row["status"] == "error"]
    output = {
        "benchmark": "agent2-live-http-no-reset-hW-matched-control",
        "aalpy_version": __import__("importlib.metadata", fromlist=["version"]).version("aalpy"),
        "scope": {
            "fixture_family": args.fixture_family,
            "state_counts": [args.min_states, args.max_states],
            "seeds_per_state_count": args.seeds,
            "random_walk_length": args.random_walk_length,
            "origin_states": args.origin_states,
            "timeout_seconds": args.timeout_seconds,
            "learner": "separate Python hW client under uid nobody; fixed learner RNG seed independent of target; scrubbed environment; one-shot HTTP SUL against both arms",
            "SCO_arm": "generated partitionScoAsyncModule/createScoHandler server process run as uid www-data",
            "ordinary_arm": "ordinary Node HTTP step service with esbuild-minified client, server uid www-data, same method ID, cookie, route, request/response contract, and private machine",
            "evaluator": "parent process only; hidden fixture and exact product equivalence checks are not passed to the learner",
            "candidate_scope": "trace-matching states in the returned hW conjecture only, not the full model version space",
            "transport_scope": "local HTTP application-level records; no TLS, WAN, browser module execution, or timing-equivalence claim",
        },
        "total_runs": len(results),
        "completed_runs": len(completed),
        "timeouts": len(timeouts),
        "errors": len(errors),
        "matched_pairs": sum(bool(row.get("comparison", {}).get("matched")) for row in completed),
        "sco_exact_initial_clones": sum(bool(row.get("sco", {}).get("evaluation", {}).get("exact_initial_clone_success")) for row in completed),
        "sco_future_clone_successes": sum(bool(row.get("sco", {}).get("evaluation", {}).get("future_clone_success")) for row in completed),
        "ordinary_exact_initial_clones": sum(bool(row.get("ordinary", {}).get("evaluation", {}).get("exact_initial_clone_success")) for row in completed),
        "ordinary_future_clone_successes": sum(bool(row.get("ordinary", {}).get("evaluation", {}).get("future_clone_success")) for row in completed),
        "total_sco_sul_steps": sum(row.get("sco", {}).get("steps_total", 0) for row in completed),
        "total_ordinary_sul_steps": sum(row.get("ordinary", {}).get("steps_total", 0) for row in completed),
        "total_sco_http_requests": sum(row.get("sco", {}).get("server_stats", {}).get("http_requests", 0) for row in completed),
        "total_ordinary_http_requests": sum(row.get("ordinary", {}).get("server_stats", {}).get("http_requests", 0) for row in completed),
        "elapsed_seconds": round(time.perf_counter() - started, 4),
        "results": results,
    }
    print(json.dumps(output, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
