#!/usr/bin/env python3
"""Matched no-reset hW attack against generated SCO and ordinary minified HTTP controls."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import shutil
import secrets
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


def start_ordinary_server(fixture, canary, session_token, method_name, mirror_root: Path):
    node_path = shutil.which("node")
    if not node_path:
        raise RuntimeError("node is required for ordinary control server")
    server_user, _learner_user = BASE.isolation_accounts()
    child_env = BASE.safe_environment()
    script = Path(__file__).with_name("agent2-hw-live-ordinary-server.js")
    server_script = mirror_root / "sims" / script.name
    shutil.copy2(script, server_script)
    command = BASE.command_as(
        server_user.pw_uid,
        server_user.pw_gid,
        [node_path, str(server_script)],
        child_env,
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
        start_new_session=True,
    )
    try:
        machine = {
            "next": [list(row) for row in fixture.transitions],
            "output": [list(row) for row in fixture.outputs],
            "initial_state": fixture.initial_state,
        }
        payload = {
            "machine": machine,
            "canary": canary,
            "session_token": session_token,
            "method_name": method_name,
        }
        process.stdin.write(json.dumps(payload, separators=(",", ":")) + "\n")
        process.stdin.flush()
        line = BASE.read_line_with_timeout(process.stdout, 30)
        if line.startswith("ERROR "):
            raise RuntimeError("ordinary Node server initialization failed: " + line[6:])
        if not line.startswith("READY "):
            raise RuntimeError("unexpected ordinary Node readiness line: " + line)
        ready = json.loads(line[6:])
        if ready.get("method_name") != method_name:
            raise AssertionError(f"ordinary control changed method identifier: {ready!r}")
        if ready.get("uid") != server_user.pw_uid:
            raise AssertionError(f"ordinary server UID mismatch: {ready!r}")
        if set(ready.get("environment_keys", [])) != set(child_env):
            raise AssertionError(f"ordinary server environment was not scrubbed: {ready!r}")
        ready["security_state"] = BASE.assert_process_security_state(ready["pid"], server_user.pw_uid, "ordinary server")
        return process, ready
    except Exception:
        BASE.terminate_process_group(process)
        if process.stderr:
            process.stderr.read()
        raise

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
    """Run the same isolated learner and independent RNG seed against each arm."""
    return BASE.run_client(origin, learner_seed, args, mirror_root)

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


def comparable_invalid_probe(result):
    """Compare public request/response semantics without requiring shared cookies."""
    return {
        "request": {
            key: value
            for key, value in result["request"].items()
            if key != "cookie_sha256"
        },
        "response": result["response"],
    }


def run_one(state_count: int, seed: int, args):
    server_user, learner_user = BASE.isolation_accounts()
    learner_seed = args.learner_seed
    started = time.perf_counter()
    if args.fixture_family == "random":
        fixture = BENCHMARK.generate_fixture(state_count, seed)
    else:
        fixture = BENCHMARK.generate_delayed_pair_fixture(state_count, seed)
    sco_process = None
    ordinary_process = None
    mirror_root = None
    try:
        # Run exactly one service at a time. The other arm must not be available
        # as an alternate localhost oracle to the untrusted learner.
        sco_process, sco_ready, sco_canary, sco_session_token, mirror_root = BASE.start_server(fixture)
        sco_preflight = BASE.preflight(
            sco_ready["origin"],
            sco_ready["public_module_path"],
            sco_ready["rpc_path"],
            sco_canary,
            sco_session_token,
            sco_ready["method_name"],
        )
        sco_invalid = invalid_operation_probe(
            sco_ready["origin"], sco_ready["method_name"], sco_session_token
        )
        if sco_invalid["response"]["status"] != 403:
            raise AssertionError("SCO authorized invalid-argument probe did not return HTTP 403")
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
        sco_eval = evaluate_client(fixture, sco_client)
        sco_stats, sco_stderr = BASE.stop_server(sco_process)
        sco_process = None
        validate_server_stats(sco_stats, sco_client["sul_num_steps"], "SCO")

        # The ordinary arm gets a fresh cookie. The same fixture and learner RNG
        # seed preserve the paired experiment without sharing an auth capability.
        ordinary_canary = secrets.token_urlsafe(24)
        ordinary_session_token = secrets.token_urlsafe(32)
        ordinary_process, ordinary_ready = start_ordinary_server(
            fixture,
            ordinary_canary,
            ordinary_session_token,
            sco_ready["method_name"],
            mirror_root,
        )
        if ordinary_ready["method_name"] != sco_ready["method_name"]:
            raise AssertionError("matched arms published different method identifiers")
        ordinary_preflight = BASE.preflight(
            ordinary_ready["origin"],
            ordinary_ready["public_module_path"],
            ordinary_ready["rpc_path"],
            ordinary_canary,
            ordinary_session_token,
            ordinary_ready["method_name"],
        )
        ordinary_invalid = invalid_operation_probe(
            ordinary_ready["origin"], ordinary_ready["method_name"], ordinary_session_token
        )
        if ordinary_invalid["response"]["status"] != 403:
            raise AssertionError("ordinary authorized invalid-argument probe did not return HTTP 403")
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
        ordinary_eval = evaluate_client(fixture, ordinary_client)
        ordinary_stats, ordinary_stderr = BASE.stop_server(ordinary_process)
        ordinary_process = None
        validate_server_stats(ordinary_stats, ordinary_client["sul_num_steps"], "ordinary")

        sco_steps = sco_client["sul_num_steps"]
        ordinary_steps = ordinary_client["sul_num_steps"]
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
        invalid_probe_equal = (
            comparable_invalid_probe(sco_invalid)
            == comparable_invalid_probe(ordinary_invalid)
        )
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
        session_tokens_distinct = sco_session_token != ordinary_session_token

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
            session_tokens_distinct,
            sco_ready.get("uid") == server_user.pw_uid,
            ordinary_ready.get("uid") == server_user.pw_uid,
            server_user.pw_uid != learner_user.pw_uid,
            sco_client.get("process_isolated") is True,
            ordinary_client.get("process_isolated") is True,
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
                    "steps_equal": sco_steps == ordinary_steps,
                    "session_tokens_distinct": session_tokens_distinct,
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
            "server_user_isolated": (
                sco_ready.get("uid") == server_user.pw_uid
                and ordinary_ready.get("uid") == server_user.pw_uid
                and server_user.pw_uid != learner_user.pw_uid
                and sco_client.get("process_isolated") is True
                and ordinary_client.get("process_isolated") is True
            ),
            "sco": {
                "server_process": {
                    "pid": sco_ready["pid"],
                    "uid": sco_ready["uid"],
                    "environment_keys": sco_ready["environment_keys"],
                    "no_new_privs": sco_ready["security_state"]["NoNewPrivs"],
                    "cap_eff": sco_ready["security_state"]["CapEff"],
                    "cap_bnd": sco_ready["security_state"]["CapBnd"],
                    "private_root_mode": sco_ready["private_root_mode"],
                    "private_file_mode": sco_ready["private_file_mode"],
                },
                "learner_process": {
                    "pid": sco_client["pid"],
                    "uid": sco_client["uid"],
                    "euid": sco_client["euid"],
                    "environment_keys": sco_client["environment_keys"],
                    "no_new_privs": sco_client["no_new_privs"],
                    "cap_eff": sco_client["cap_eff"],
                    "cap_bnd": sco_client["cap_bnd"],
                    "sudo_blocked": sco_client["sudo_blocked"],
                    "learner_seed": sco_client["learner_seed"],
                },
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
                "rpc_trace_full_sha256": sco_client["rpc_trace_full_sha256"],
                "learner_elapsed_seconds": sco_client["elapsed_seconds"],
                "server_stats": sco_stats,
                "preflight": sco_preflight,
                "invalid_operation_probe": sco_invalid,
                "evaluation": sco_eval,
            },
            "ordinary": {
                "server_process": {
                    "pid": ordinary_ready["pid"],
                    "uid": ordinary_ready["uid"],
                    "environment_keys": ordinary_ready["environment_keys"],
                    "no_new_privs": ordinary_ready["security_state"]["NoNewPrivs"],
                    "cap_eff": ordinary_ready["security_state"]["CapEff"],
                    "cap_bnd": ordinary_ready["security_state"]["CapBnd"],
                },
                "learner_process": {
                    "pid": ordinary_client["pid"],
                    "uid": ordinary_client["uid"],
                    "euid": ordinary_client["euid"],
                    "environment_keys": ordinary_client["environment_keys"],
                    "no_new_privs": ordinary_client["no_new_privs"],
                    "cap_eff": ordinary_client["cap_eff"],
                    "cap_bnd": ordinary_client["cap_bnd"],
                    "sudo_blocked": ordinary_client["sudo_blocked"],
                    "learner_seed": ordinary_client["learner_seed"],
                },
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
                "rpc_trace_full_sha256": ordinary_client["rpc_trace_full_sha256"],
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
                "session_tokens_distinct": session_tokens_distinct,
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
    parser.add_argument("--target-seed-mode", choices=("random", "deterministic"), default="random")
    parser.add_argument("--timeout-seconds", type=int, default=120)
    parser.add_argument("--random-walk-length", type=int, default=30)
    parser.add_argument("--origin-states", type=int, default=20)
    parser.add_argument("--learner-seed", type=int, default=41342)
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
        for sample_index in range(args.seeds):
            target_seed = (
                secrets.randbits(64)
                if args.target_seed_mode == "random"
                else sample_index
            )
            results.append(run_one(state_count, target_seed, args))

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
            "target_seed_mode": args.target_seed_mode,
            "target_seed_source": (
                "secrets.randbits(64)"
                if args.target_seed_mode == "random"
                else "deterministic seed indices 0..seeds-1 per state count"
            ),
            "target_seed_behavior_note": (
                "delayed-pair fixture uses only seed parity to select one of two initial states per state count"
                if args.fixture_family == "delayed-pair"
                else "random fixture is generated from the full recorded 64-bit seed"
            ),
            "random_walk_length": args.random_walk_length,
            "origin_states": args.origin_states,
            "learner_seed": args.learner_seed,
            "server_uid": BASE.isolation_accounts()[0].pw_uid,
            "learner_uid": BASE.isolation_accounts()[1].pw_uid,
            "timeout_seconds": args.timeout_seconds,
            "learner": "separate Python hW client runs as uid nobody with a scrubbed environment; both arms receive the same independent learner RNG seed, never target seed/state count",
            "SCO_arm": "generated partitionScoAsyncModule/createScoHandler server process runs as uid www-data with no-new-privs and empty capability bounding set",
            "ordinary_arm": "ordinary Node HTTP step service runs as uid www-data with the same request/response contract and private machine",
            "evaluator": "trusted parent only; target fixture/seed are not passed in learner argv or environment; learner RNG seed is independent of target seed and state count",
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
