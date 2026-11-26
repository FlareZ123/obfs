#!/usr/bin/env python3
"""Independent exhaustive cross-checks for the bounded binary Mealy audit.

Enumerates every labelled complete deterministic binary Mealy machine with
1..N states for two small fixtures. This is a finite regression oracle for
the Z3 k=2/k=3 tests, not a proof for larger machines.
"""
from __future__ import annotations

from collections import deque
from itertools import product
import json
from typing import Any


def replay(
    transitions: list[list[int]],
    outputs: list[list[int]],
    initial: int,
    inputs: list[int],
) -> tuple[list[int], int]:
    state = initial
    observed: list[int] = []
    for symbol in inputs:
        observed.append(outputs[state][symbol])
        state = transitions[state][symbol]
    return observed, state


def strongly_connected(transitions: list[list[int]]) -> bool:
    state_count = len(transitions)
    for start in range(state_count):
        seen = {start}
        pending = [start]
        while pending:
            state = pending.pop()
            for target in transitions[state]:
                if target not in seen:
                    seen.add(target)
                    pending.append(target)
        if len(seen) != state_count:
            return False
    return True


def minimal_mealy(transitions: list[list[int]], outputs: list[list[int]]) -> bool:
    state_count = len(transitions)
    for left in range(state_count):
        for right in range(left + 1, state_count):
            pending = deque([(left, right)])
            seen = {(left, right)}
            distinguishable = False
            while pending and not distinguishable:
                a_state, b_state = pending.popleft()
                for symbol in range(2):
                    if outputs[a_state][symbol] != outputs[b_state][symbol]:
                        distinguishable = True
                        break
                    pair = (
                        transitions[a_state][symbol],
                        transitions[b_state][symbol],
                    )
                    if pair not in seen:
                        seen.add(pair)
                        pending.append(pair)
            if not distinguishable:
                return False
    return True


def future_counterexample(
    target_transitions: list[list[int]],
    target_outputs: list[list[int]],
    target_start: int,
    candidate_transitions: list[list[int]],
    candidate_outputs: list[list[int]],
    candidate_start: int,
) -> list[int] | None:
    """Return a shortest distinguishing suffix, bounded by the product size."""
    target_count = len(target_transitions)
    candidate_count = len(candidate_transitions)
    max_steps = target_count * candidate_count
    pending = deque([(target_start, candidate_start, [])])
    seen = {(target_start, candidate_start)}
    while pending:
        target_state, candidate_state, prefix = pending.popleft()
        if len(prefix) >= max_steps:
            continue
        for symbol in range(2):
            word = prefix + [symbol]
            if target_outputs[target_state][symbol] != candidate_outputs[candidate_state][symbol]:
                return word
            pair = (
                target_transitions[target_state][symbol],
                candidate_transitions[candidate_state][symbol],
            )
            if pair not in seen:
                seen.add(pair)
                pending.append((pair[0], pair[1], word))
    return None


def enumerate_future_divergent_candidates(fixture: dict[str, Any]) -> dict[str, Any]:
    target_transitions = fixture["transitions"]
    target_outputs = fixture["outputs"]
    target_initial = fixture["initial_state"]
    inputs = fixture["inputs"]
    expected_outputs = fixture["observed_outputs"]
    actual_outputs, target_post = replay(
        target_transitions, target_outputs, target_initial, inputs
    )
    if actual_outputs != expected_outputs:
        raise AssertionError(f"{fixture['name']}: fixture trace does not replay")

    target_count = len(target_transitions)
    counts: dict[str, int] = {}
    first_witness: dict[str, Any] | None = None
    for candidate_count in range(1, target_count + 1):
        count = 0
        for flat_transitions in product(
            range(candidate_count), repeat=2 * candidate_count
        ):
            transitions = [
                list(flat_transitions[offset:offset + 2])
                for offset in range(0, 2 * candidate_count, 2)
            ]
            if not strongly_connected(transitions):
                continue
            for flat_outputs in product(range(2), repeat=2 * candidate_count):
                outputs = [
                    list(flat_outputs[offset:offset + 2])
                    for offset in range(0, 2 * candidate_count, 2)
                ]
                if not minimal_mealy(transitions, outputs):
                    continue
                candidate_trace, candidate_post = replay(
                    transitions, outputs, 0, inputs
                )
                if candidate_trace != expected_outputs:
                    continue
                suffix = future_counterexample(
                    target_transitions,
                    target_outputs,
                    target_post,
                    transitions,
                    outputs,
                    candidate_post,
                )
                if suffix is None:
                    continue
                count += 1
                if first_witness is None:
                    first_witness = {
                        "candidate_state_count": candidate_count,
                        "transitions": transitions,
                        "outputs": outputs,
                        "candidate_post_trace_state": candidate_post,
                        "future_counterexample": suffix,
                    }
        counts[str(candidate_count)] = count

    return {
        "fixture": fixture["name"],
        "target_state_count": target_count,
        "target_post_trace_state": target_post,
        "candidate_counts_by_state_count": counts,
        "first_witness": first_witness,
    }


FIXTURES = [
    {
        "name": "two-state-z3-regression",
        "transitions": [[1, 0], [0, 1]],
        "outputs": [[0, 0], [1, 1]],
        "initial_state": 0,
        "inputs": [0, 1, 0],
        "observed_outputs": [0, 1, 1],
        "expected_counts": {"1": 0, "2": 9},
    },
    {
        "name": "three-state-z3-regression",
        "transitions": [[1, 0], [2, 1], [0, 2]],
        "outputs": [[0, 0], [1, 0], [0, 1]],
        "initial_state": 0,
        "inputs": [0, 0, 0, 0],
        "observed_outputs": [0, 1, 0, 0],
        "expected_counts": {"1": 0, "2": 0, "3": 622},
    },
]


def main() -> None:
    results = []
    for fixture in FIXTURES:
        result = enumerate_future_divergent_candidates(fixture)
        if result["candidate_counts_by_state_count"] != fixture["expected_counts"]:
            raise AssertionError(
                f"{fixture['name']}: expected {fixture['expected_counts']}, "
                f"got {result['candidate_counts_by_state_count']}"
            )
        results.append(result)
    print("SMALL_MEALY_EXHAUSTIVE_CROSSCHECK", json.dumps(results, sort_keys=True))


if __name__ == "__main__":
    main()
