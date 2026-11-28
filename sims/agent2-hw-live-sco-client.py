#!/usr/bin/env python3
"""AALpy hW client that sees only an authenticated HTTP step endpoint."""
from __future__ import annotations

import argparse
import contextlib
import hashlib
import http.client
import json
import random
import sys
import time
from urllib.parse import urlsplit

import numpy as np

from aalpy.base import SUL
from aalpy.learning_algs.resetless.hW import run_hW
from aalpy.learning_algs.resetless.resetless_oracles import RandomWphWOracle


ALPHABET = ("0", "1")


class HttpNoResetMealySUL(SUL):
    """One-session HTTP SUL; no reset and no membership-query operation."""

    def __init__(
        self,
        origin: str,
        method_name: str,
        cookie: str,
        connection: http.client.HTTPConnection,
    ):
        super().__init__()
        parsed = urlsplit(origin)
        if parsed.scheme != "http" or not parsed.hostname or parsed.port is None:
            raise ValueError("expected an explicit local http origin")
        self.connection = connection
        self.method_name = method_name
        self.cookie = cookie
        self.counters = {"pre_calls": 0, "post_calls": 0, "query_calls": 0}
        self.trace = []
        self.latencies_ms = []
        self.rpc_records = []

    def pre(self):
        self.counters["pre_calls"] += 1
        if self.counters["pre_calls"] != 1:
            raise AssertionError("HTTP SUL reset attempted after initial start")

    def post(self):
        self.counters["post_calls"] += 1
        if self.counters["post_calls"] != 1:
            raise AssertionError("unexpected repeated HTTP SUL post")
        self.connection.close()

    def step(self, letter):
        if self.counters["pre_calls"] != 1 or self.counters["post_calls"] != 0:
            raise AssertionError("HTTP step outside the single continuous session")
        if letter not in ALPHABET:
            raise AssertionError(f"unexpected input symbol: {letter!r}")

        body = json.dumps({
            "method": self.method_name,
            "args": [int(letter)],
        }, separators=(",", ":"))
        started = time.perf_counter()
        self.connection.request(
            "POST",
            "/obfs/rpc",
            body=body,
            headers={
                "Content-Type": "application/json",
                "Cookie": self.cookie,
                "Cache-Control": "no-store",
            },
        )
        response = self.connection.getresponse()
        raw = response.read()
        elapsed_ms = (time.perf_counter() - started) * 1000
        self.latencies_ms.append(elapsed_ms)
        self.rpc_records.append({
            "request": {
                "method": "POST",
                "path": "/obfs/rpc",
                "content_type": "application/json",
                "cookie_sha256": hashlib.sha256(self.cookie.encode("utf-8")).hexdigest(),
                "cache_control": "no-store",
                "body": body,
            },
            "response": {
                "status": response.status,
                "content_type": response.getheader("Content-Type"),
                "cache_control": response.getheader("Cache-Control"),
                "nosniff": response.getheader("X-Content-Type-Options"),
                "content_length": response.getheader("Content-Length"),
                "body_bytes": len(raw),
                "body_sha256": hashlib.sha256(raw).hexdigest(),
            },
        })
        if response.status != 200:
            raise RuntimeError(
                f"authorized SCO step returned HTTP {response.status}: "
                f"{raw[:200]!r}"
            )
        payload = json.loads(raw)
        if payload.get("ok") is not True or payload.get("value") not in ("0", "1"):
            raise RuntimeError(f"unexpected SCO RPC response: {payload!r}")
        output = str(payload["value"])
        self.trace.append([letter, output])
        return output

    def query(self, word):
        self.counters["query_calls"] += 1
        raise AssertionError(
            "membership query/reset API is forbidden in the live HTTP experiment"
        )


def percentile(sorted_values, fraction):
    if not sorted_values:
        return None
    index = int(round((len(sorted_values) - 1) * fraction))
    return sorted_values[index]



def fetch_client_module(origin: str):
    parsed = urlsplit(origin)
    if parsed.scheme != "http" or not parsed.hostname or parsed.port is None:
        raise ValueError("expected an explicit local http origin")
    connection = http.client.HTTPConnection(
        parsed.hostname, parsed.port, timeout=20
    )
    try:
        connection.request(
            "GET",
            "/obfs/client.mjs",
            headers={"Cache-Control": "no-store"},
        )
        response = connection.getresponse()
        source_bytes = response.read()
        if response.status != 200:
            raise RuntimeError(
                f"public client module returned HTTP {response.status}"
            )
        set_cookie = response.getheader("Set-Cookie")
        if not set_cookie:
            raise RuntimeError("public client module did not issue a session cookie")
        method_name = response.getheader("X-SCO-Method")
        if not method_name:
            raise RuntimeError("public client module did not publish an RPC method identifier")
        cookie = set_cookie.split(";", 1)[0]
        if not cookie.startswith("session="):
            raise RuntimeError("public client module issued an unexpected cookie")
        source = source_bytes.decode("utf-8")
        token = cookie.split("=", 1)[1]
        source_disclosed = (
            "privateTable" in source
            or "serverCanary" in source
            or token in source
        )
        if source_disclosed:
            raise RuntimeError("public client module contains a private-source marker")
        module_trace = {
            "request": {
                "method": "GET",
                "path": "/obfs/client.mjs",
                "cache_control": "no-store",
            },
            "response": {
                "status": response.status,
                "content_type": response.getheader("Content-Type"),
                "cache_control": response.getheader("Cache-Control"),
                "nosniff": response.getheader("X-Content-Type-Options"),
                "content_length": response.getheader("Content-Length"),
                "set_cookie_present": bool(set_cookie),
                "set_cookie_value_sha256": hashlib.sha256(cookie.encode("utf-8")).hexdigest(),
                "set_cookie_attributes": set_cookie.split(";", 1)[1].strip() if ";" in set_cookie else "",
                "method_name": method_name,
                "body_bytes": len(source_bytes),
                "body_sha256": hashlib.sha256(source_bytes).hexdigest(),
            },
        }
        return connection, cookie, method_name, response.status, len(source_bytes), source_disclosed, module_trace
    except Exception:
        connection.close()
        raise

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--origin", required=True)
    parser.add_argument("--oracle-seed", type=int, required=True)
    parser.add_argument("--random-walk-length", type=int, default=30)
    parser.add_argument("--origin-states", type=int, default=20)
    args = parser.parse_args()

    (
        connection,
        cookie,
        method_name,
        module_status,
        module_bytes,
        module_disclosed,
        module_trace,
    ) = fetch_client_module(args.origin)
    sul = HttpNoResetMealySUL(
        args.origin, method_name, cookie, connection
    )
    random.seed(args.oracle_seed)
    np.random.seed(args.oracle_seed)
    oracle = RandomWphWOracle(
        random_walk_length=args.random_walk_length,
        num_test_origin_states=args.origin_states,
    )

    started = time.perf_counter()
    try:
        with contextlib.redirect_stdout(sys.stderr):
            hypothesis, info = run_hW(
                list(ALPHABET),
                sul,
                oracle,
                automaton_type="mealy",
                query_for_initial_state=False,
                return_data=True,
                print_level=0,
            )
        elapsed = time.perf_counter() - started
        if sul.counters["pre_calls"] != 1 or sul.counters["post_calls"] != 1:
            raise AssertionError(f"unexpected HTTP SUL lifecycle: {sul.counters}")
        if sul.counters["query_calls"] != 0 or sul.num_queries != 0:
            raise AssertionError("hW attempted a forbidden membership query")

        state_indices = {
            id(state): index for index, state in enumerate(hypothesis.states)
        }
        serialized_states = []
        for state in hypothesis.states:
            transitions = {}
            for letter in ALPHABET:
                target = state.transitions.get(letter)
                transitions[letter] = (
                    state_indices[id(target)] if target is not None else None
                )
            serialized_states.append({
                "state_id": repr(state.state_id),
                "output_fun": {
                    letter: state.output_fun[letter]
                    for letter in ALPHABET
                    if letter in state.output_fun
                },
                "transitions": transitions,
            })

        latencies = sorted(sul.latencies_ms)
        result = {
            "status": "completed",
            "client_module_fetch_status": module_status,
            "client_cookie_present": bool(cookie),
            "client_method_name": method_name,
            "client_module_source_bytes": module_bytes,
            "client_module_source_disclosed": module_disclosed,
            "client_module_trace": module_trace,
            "rpc_record_count": len(sul.rpc_records),
            "rpc_trace_sha256": hashlib.sha256(
                json.dumps(sul.rpc_records, sort_keys=True, separators=(",", ":")).encode("utf-8")
            ).hexdigest(),
            "trace": sul.trace,
            "hypothesis_states": serialized_states,
            "pre_calls": sul.counters["pre_calls"],
            "post_calls": sul.counters["post_calls"],
            "query_calls": sul.counters["query_calls"],
            "sul_num_queries": sul.num_queries,
            "sul_num_steps": sul.num_steps,
            "http_step_calls": len(sul.trace),
            "oracle_num_steps": getattr(oracle, "num_steps", None),
            "aalpy_steps_learning_raw": info.get("steps_learning"),
            "aalpy_steps_eq_oracle_raw": info.get("steps_eq_oracle"),
            "learning_rounds": info.get("learning_rounds"),
            "homing_sequence_length": len(info.get("homing_sequence") or []),
            "characterization_set_size": len(info.get("characterization_set") or []),
            "elapsed_seconds": round(elapsed, 6),
            "http_step_latency_ms": {
                "count": len(latencies),
                "mean": round(sum(latencies) / len(latencies), 4) if latencies else None,
                "p50": round(percentile(latencies, 0.50), 4) if latencies else None,
                "p95": round(percentile(latencies, 0.95), 4) if latencies else None,
                "max": round(max(latencies), 4) if latencies else None,
            },
        }
        print(json.dumps(result, separators=(",", ":")), flush=True)
    except Exception as error:
        sul.connection.close()
        failure = {
            "status": "error",
            "error": repr(error),
            "trace": sul.trace,
            "pre_calls": sul.counters["pre_calls"],
            "post_calls": sul.counters["post_calls"],
            "query_calls": sul.counters["query_calls"],
            "sul_num_steps": sul.num_steps,
        }
        print(json.dumps(failure, separators=(",", ":")), flush=True)
        raise


if __name__ == "__main__":
    main()
