#!/usr/bin/env python3
"""Deterministic independent 216-trace stress for public-only Mealy certificates.

Generate minimal strongly connected binary-output/input machines independently
of the passive reconstruction implementation. A planted zero-input Hamiltonian
cycle enforces reachability; random one-edges and outputs create diverse hard
and easy fixtures. This deliberately tests a different distribution from the
historical 36-target hW corpus. Never supply the target table to the public
reconstruction function; only check it independently after inference.
"""
from __future__ import annotations

import argparse
import json
import random
import time
from pathlib import Path

from agent49_hw_passive_reconstruction import (
    derive_certificate,
    verify_public_certificate,
    verify_reconstruction_against_private_fixture,
)


def strongly_connected(delta):
    n = len(delta)
    for root in range(n):
        seen = {root}
        stack = [root]
        while stack:
            for nxt in delta[stack.pop()]:
                if nxt not in seen:
                    seen.add(nxt)
                    stack.append(nxt)
        if len(seen) != n:
            return False
    return True


def minimal(delta, outputs):
    """Partition refinement; distinguish every state by some future output."""
    n = len(delta)
    classes = [tuple(outputs[i]) for i in range(n)]
    for _ in range(n):
        sigs = [
            (classes[i], classes[delta[i][0]], classes[delta[i][1]])
            for i in range(n)
        ]
        codes = {v: k for k, v in enumerate(sorted(set(sigs)))}
        next_classes = [codes[v] for v in sigs]
        if next_classes == classes:
            return len(set(next_classes)) == n
        classes = next_classes
    return len(set(classes)) == n


def generate(rng, n):
    for _ in range(100000):
        order = list(range(n))
        rng.shuffle(order)
        delta = [[None, None] for _ in range(n)]
        for index, state in enumerate(order):
            delta[state][0] = order[(index + 1) % n]
            delta[state][1] = rng.randrange(n)
        outputs = [[rng.randrange(2), rng.randrange(2)] for _ in range(n)]
        if strongly_connected(delta) and minimal(delta, outputs):
            return delta, outputs
    raise RuntimeError("exhausted minimal strongly connected fixture generator")


def run(seed=49, samples_per_n=12, min_n=2, max_n=10, depth=10,
        lengths=(120, 500)):
    rng = random.Random(seed)
    began = time.monotonic()
    summary = {}
    all_complete = []
    for n in range(min_n, max_n + 1):
        for sample in range(samples_per_n):
            delta, outputs = generate(rng, n)
            initial = rng.randrange(n)
            inputs = [rng.randrange(2) for _ in range(max(lengths))]
            for length in lengths:
                state = initial
                public_trace = []
                for a in inputs[:length]:
                    public_trace.append([str(a), str(outputs[state][a])])
                    state = delta[state][a]
                proof = derive_certificate(public_trace, depth)
                k = proof["observational_state_lower_bound"]
                if k > n:
                    raise AssertionError("public trace lower bound exceeds hidden state count")
                certified = proof["bounded_future_uniqueness_certified"]
                if certified:
                    if not verify_public_certificate(public_trace, proof):
                        raise AssertionError("public proof replay rejected")
                    if k == n:
                        row = {
                            "state_count": n, "observed_trace": public_trace,
                            "fixture_table": {
                                "transitions": delta, "outputs": outputs,
                                "initial_state": initial,
                            },
                            "target_post_trace_state": state,
                        }
                        if not verify_reconstruction_against_private_fixture(
                            row, proof
                        ):
                            raise AssertionError("exact hidden fixture mismatch")
                stat = summary.setdefault(str(length), {
                    "trials": 0, "state_count_lb_exact": 0,
                    "complete_bounded_certificates": 0,
                    "complete_hidden_table_matches": 0,
                    "bounded_certificates_with_k_below_hidden_n": 0,
                })
                stat["trials"] += 1
                stat["state_count_lb_exact"] += int(k == n)
                stat["complete_bounded_certificates"] += int(certified)
                stat["complete_hidden_table_matches"] += int(certified and k == n)
                stat["bounded_certificates_with_k_below_hidden_n"] += int(
                    certified and k < n
                )
                if certified:
                    all_complete.append({
                        "n": n, "sample": sample, "length": length,
                        "public_state_bound": k,
                    })
    return {
        "experiment": "independent-minimal-strongly-connected-mealy-stress",
        "rng_seed": seed, "samples_per_state_count": samples_per_n,
        "min_state_count": min_n, "max_state_count": max_n,
        "public_input_depth": depth,
        "public_trace_lengths": list(lengths),
        "fixture_construction": "random two-out machines with input-0 Hamiltonian cycle and output partition minimality",
        "summary": summary,
        "complete_case_metadata": all_complete,
        "wall_seconds": round(time.monotonic() - began, 4),
        "private_fixture_used_for_inference": False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, default=49)
    parser.add_argument("--samples-per-n", type=int, default=12)
    parser.add_argument("--min-n", type=int, default=2)
    parser.add_argument("--max-n", type=int, default=10)
    parser.add_argument("--depth", type=int, default=10)
    parser.add_argument("--lengths", type=int, nargs="+", default=(120, 500),
                        help="Public trace lengths to test, using prefixes of one sampled input stream")
    parser.add_argument("--output")
    args = parser.parse_args()
    if not (1 <= args.samples_per_n <= 10000
            and 1 <= args.min_n <= args.max_n <= 100
            and 1 <= args.depth <= 20
            and len(set(args.lengths)) == len(args.lengths)
            and all(1 <= length <= 100000 for length in args.lengths)):
        raise SystemExit("invalid sample count, state range, or output depth")
    data = run(
        args.seed, args.samples_per_n, args.min_n, args.max_n, args.depth,
        tuple(args.lengths),
    )
    if args.output:
        Path(args.output).write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")
    print("HW_PASSIVE_INDEPENDENT_STRESS",
          json.dumps(data["summary"], sort_keys=True))


if __name__ == "__main__":
    main()
