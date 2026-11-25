#!/usr/bin/env python3
"""No-reset hW-inference benchmark for strongly connected Mealy machines.

The learner sees only a one-shot SUL interface. The exact product-equivalence
checker and initial-trace alignment are evaluator-side and are not passed to
AALpy. AALpy is pinned to 2.0.0 by the manual workflow.
"""
from __future__ import annotations

import argparse
import importlib.metadata
import json
import math
import random
import signal
import time
from collections import deque
from dataclasses import dataclass

from aalpy.base import SUL
from aalpy.learning_algs.resetless.hW import run_hW
from aalpy.learning_algs.resetless.resetless_oracles import RandomWphWOracle


ALPHABET = ("0", "1")
OUTPUTS = ("0", "1")


@dataclass(frozen=True)
class Fixture:
    state_count: int
    transitions: tuple[tuple[int, int], ...]
    outputs: tuple[tuple[str, str], ...]
    initial_state: int
    generation_attempts: int


class RunTimeout(Exception):
    pass


def alarm_handler(_signum, _frame):
    raise RunTimeout("per-run timeout")


def is_strongly_connected(transitions: list[list[int]]) -> bool:
    n = len(transitions)
    for start in range(n):
        seen = {start}
        todo = [start]
        while todo:
            state = todo.pop()
            for nxt in transitions[state]:
                if nxt not in seen:
                    seen.add(nxt)
                    todo.append(nxt)
        if len(seen) != n:
            return False
    return True


def is_minimal_mealy(
    transitions: list[list[int]], outputs: list[list[str]]
) -> bool:
    n = len(transitions)
    partition = [0] * n
    while True:
        signatures = [
            (
                tuple(outputs[state]),
                tuple(partition[transitions[state][a]] for a in range(2)),
            )
            for state in range(n)
        ]
        classes = {}
        refined = []
        for signature in signatures:
            if signature not in classes:
                classes[signature] = len(classes)
            refined.append(classes[signature])
        if refined == partition:
            break
        partition = refined
    return len(set(partition)) == n


def generate_fixture(state_count: int, seed: int) -> Fixture:
    rng = random.Random(seed)
    for attempt in range(1, 10001):
        # Input 0 is a directed cycle, making the machine strongly connected.
        transitions = [
            [(state + 1) % state_count, rng.randrange(state_count)]
            for state in range(state_count)
        ]
        outputs = [
            [rng.choice(OUTPUTS), rng.choice(OUTPUTS)]
            for _ in range(state_count)
        ]
        if not is_strongly_connected(transitions):
            continue
        if not is_minimal_mealy(transitions, outputs):
            continue
        return Fixture(
            state_count=state_count,
            transitions=tuple(tuple(row) for row in transitions),
            outputs=tuple(tuple(row) for row in outputs),
            initial_state=rng.randrange(state_count),
            generation_attempts=attempt,
        )
    raise RuntimeError(
        f"could not generate a minimal strongly connected {state_count}-state fixture"
    )


class NoResetMealySUL(SUL):
    """Duck-compatible AALpy SUL that permits one initialization only."""

    def __init__(self, initialize, step_impl, counters):
        super().__init__()
        self._initialize = initialize
        self._step_impl = step_impl
        self._counters = counters

    def pre(self):
        self._counters["pre_calls"] += 1
        if self._counters["pre_calls"] != 1:
            raise AssertionError("SUL reset attempted after initial start")
        self._initialize()

    def post(self):
        self._counters["post_calls"] += 1
        if self._counters["post_calls"] != 1:
            raise AssertionError("unexpected repeated SUL post")
        # Deliberately do not reset, rewind, or alter the current state.

    def step(self, letter):
        if self._counters["pre_calls"] != 1 or self._counters["post_calls"] != 0:
            raise AssertionError("step outside the single continuous session")
        if letter not in ALPHABET:
            raise AssertionError(f"unexpected input symbol: {letter!r}")
        return self._step_impl(letter)

    def query(self, word):
        self._counters["query_calls"] += 1
        raise AssertionError(
            "membership query/reset API is forbidden in the no-reset experiment"
        )


def make_sul(fixture: Fixture):
    runtime = {"state": None}
    trace = []
    counters = {"pre_calls": 0, "post_calls": 0, "query_calls": 0}

    def initialize():
        runtime["state"] = fixture.initial_state

    def step_impl(letter):
        input_index = ALPHABET.index(letter)
        state = runtime["state"]
        output = fixture.outputs[state][input_index]
        runtime["state"] = fixture.transitions[state][input_index]
        trace.append((letter, output))
        return output

    return NoResetMealySUL(initialize, step_impl, counters), trace, counters


def trace_matching_starts(hypothesis, trace):
    matches = []
    for start in hypothesis.states:
        state = start
        for letter, observed_output in trace:
            if state.output_fun.get(letter) != observed_output:
                break
            state = state.transitions.get(letter)
            if state is None:
                break
        else:
            matches.append(start)
    return matches


def product_equivalent(fixture: Fixture, hypothesis, hypothesis_start):
    """Exact BFS product-equivalence check from target initial / candidate start."""
    queue = deque([(fixture.initial_state, hypothesis_start, tuple())])
    seen = {(fixture.initial_state, hypothesis_start)}
    while queue:
        target_state, hypothesis_state, prefix = queue.popleft()
        for input_index, letter in enumerate(ALPHABET):
            target_output = fixture.outputs[target_state][input_index]
            hypothesis_output = hypothesis_state.output_fun.get(letter)
            if hypothesis_output != target_output:
                return False, prefix + (letter,)
            next_hypothesis = hypothesis_state.transitions.get(letter)
            if next_hypothesis is None:
                return False, prefix + (letter,)
            next_target = fixture.transitions[target_state][input_index]
            pair = (next_target, next_hypothesis)
            if pair not in seen:
                seen.add(pair)
                queue.append((next_target, next_hypothesis, prefix + (letter,)))
    return True, None


def run_one(
    state_count: int,
    seed: int,
    timeout_seconds: int,
    random_walk_length: int,
    origin_states: int,
):
    fixture = generate_fixture(state_count, seed)
    sul, trace, counters = make_sul(fixture)
    oracle_seed = (seed * 0x9E3779B1 + state_count * 0x85EBCA77) & 0xFFFFFFFF
    random.seed(oracle_seed)
    oracle = RandomWphWOracle(
        random_walk_length=random_walk_length,
        num_test_origin_states=origin_states,
    )

    old_handler = signal.signal(signal.SIGALRM, alarm_handler)
    signal.alarm(timeout_seconds)
    started = time.monotonic()
    try:
        hypothesis, info = run_hW(
            list(ALPHABET),
            sul,
            oracle,
            automaton_type="mealy",
            query_for_initial_state=False,
            return_data=True,
            print_level=0,
        )
    except RunTimeout:
        return {
            "state_count": state_count,
            "seed": seed,
            "oracle_seed": oracle_seed,
            "status": "timeout",
            "elapsed_seconds": round(time.monotonic() - started, 3),
            "pre_calls": counters["pre_calls"],
            "post_calls": counters["post_calls"],
            "query_calls": counters["query_calls"],
            "trace_steps": len(trace),
        }
    except Exception as error:
        return {
            "state_count": state_count,
            "seed": seed,
            "oracle_seed": oracle_seed,
            "status": "error",
            "error": f"{type(error).__name__}: {error}",
            "elapsed_seconds": round(time.monotonic() - started, 3),
            "pre_calls": counters["pre_calls"],
            "post_calls": counters["post_calls"],
            "query_calls": counters["query_calls"],
            "trace_steps": len(trace),
        }
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old_handler)

    elapsed = time.monotonic() - started
    candidates = trace_matching_starts(hypothesis, trace)
    candidate_results = []
    for candidate in candidates:
        equivalent, counterexample = product_equivalent(
            fixture, hypothesis, candidate
        )
        candidate_results.append({
            "state_id": repr(candidate.state_id),
            "product_equivalent": equivalent,
            "counterexample": list(counterexample) if counterexample else None,
        })

    complete = all(
        letter in state.transitions and letter in state.output_fun
        for state in hypothesis.states
        for letter in ALPHABET
    )
    equivalent_count = sum(
        1 for item in candidate_results if item["product_equivalent"]
    )
    unique_trace_start = len(candidates) == 1
    exact_clone = (
        unique_trace_start
        and equivalent_count == 1
        and candidate_results[0]["product_equivalent"]
    )

    if unique_trace_start:
        hypothesis.initial_state = candidates[0]
        hypothesis.current_state = candidates[0]

    if counters["pre_calls"] != 1 or counters["post_calls"] != 1:
        raise AssertionError(f"unexpected SUL lifecycle: {counters}")
    if counters["query_calls"] != 0 or sul.num_queries != 0:
        raise AssertionError("the learner used a resettable membership query")
    if sul.num_steps != len(trace):
        raise AssertionError(
            f"SUL step counter mismatch: {sul.num_steps} != {len(trace)}"
        )

    return {
        "state_count": state_count,
        "seed": seed,
        "oracle_seed": oracle_seed,
        "status": "completed",
        "target_initial_state": fixture.initial_state,
        "target_minimal": True,
        "target_strongly_connected": True,
        "fixture_generation_attempts": fixture.generation_attempts,
        "hypothesis_states": len(hypothesis.states),
        "hypothesis_complete": complete,
        "trace_matching_initial_candidates": len(candidates),
        "trace_matching_candidate_ids": [
            repr(candidate.state_id) for candidate in candidates
        ],
        "candidate_product_results": candidate_results,
        "attacker_initial_state_identified": unique_trace_start,
        "exact_clone_success": exact_clone,
        "pre_calls": counters["pre_calls"],
        "post_calls": counters["post_calls"],
        "query_calls": counters["query_calls"],
        "sul_num_queries": sul.num_queries,
        "sul_num_steps": sul.num_steps,
        "trace_steps": len(trace),
        "oracle_num_steps": getattr(oracle, "num_steps", None),
        "learning_rounds": info.get("learning_rounds"),
        "steps_learning": info.get("steps_learning"),
        "steps_eq_oracle": info.get("steps_eq_oracle"),
        "homing_sequence_length": len(info.get("homing_sequence", [])),
        "characterization_set_size": len(info.get("characterization_set", [])),
        "elapsed_seconds": round(elapsed, 3),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--min-states", type=int, default=2)
    parser.add_argument("--max-states", type=int, default=12)
    parser.add_argument("--seeds", type=int, default=2)
    parser.add_argument("--timeout-seconds", type=int, default=60)
    parser.add_argument("--random-walk-length", type=int, default=30)
    parser.add_argument("--origin-states", type=int, default=20)
    args = parser.parse_args()
    if not (2 <= args.min_states <= args.max_states <= 12):
        raise SystemExit("state range must be within [2,12]")
    if args.seeds < 1 or args.seeds > 20:
        raise SystemExit("--seeds must be in [1,20]")

    results = []
    started = time.monotonic()
    for state_count in range(args.min_states, args.max_states + 1):
        for seed in range(args.seeds):
            result = run_one(
                state_count,
                seed,
                args.timeout_seconds,
                args.random_walk_length,
                args.origin_states,
            )
            results.append(result)
            print(
                "HW_NO_RESET_RESULT " + json.dumps(result, sort_keys=True),
                flush=True,
            )

    completed = [r for r in results if r["status"] == "completed"]
    output = {
        "experiment": "AALpy 2.0.0 hW with no-reset RandomWphWOracle",
        "scope": {
            "state_counts": [args.min_states, args.max_states],
            "seeds_per_state_count": args.seeds,
            "input_alphabet": list(ALPHABET),
            "output_alphabet": list(OUTPUTS),
            "strong_connectivity": "input 0 forms a directed cycle",
            "minimality": "partition-refinement checked",
            "oracle": {
                "type": "RandomWphWOracle",
                "random_walk_length": args.random_walk_length,
                "origin_states": args.origin_states,
            },
            "query_for_initial_state": False,
            "reset_policy": "one pre() initialization; post() is a no-op; query() raises",
            "initial_state_recovery": "match the entire observed continuous trace against every hypothesis state",
            "evaluator": "exact BFS product equivalence; target is not passed to learner",
        },
        "aalpy_version": importlib.metadata.version("aalpy"),
        "total_runs": len(results),
        "completed_runs": len(completed),
        "timeouts": sum(r["status"] == "timeout" for r in results),
        "errors": sum(r["status"] == "error" for r in results),
        "exact_clone_successes": sum(
            bool(r.get("exact_clone_success")) for r in completed
        ),
        "initial_state_identified": sum(
            bool(r.get("attacker_initial_state_identified")) for r in completed
        ),
        "results": results,
        "elapsed_seconds": round(time.monotonic() - started, 3),
    }
    print(json.dumps(output, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
