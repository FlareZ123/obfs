#!/usr/bin/env python3
"""No-reset hW-inference benchmark for strongly connected Mealy machines.

The learner sees only a one-shot SUL interface. The exact product-equivalence
checker and initial-trace alignment are evaluator-side and are not passed to
AALpy. AALpy is pinned to 2.0.0 by the manual workflow.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import math
import random
import signal
import sys
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


def trace_matching_candidates(hypothesis, trace):
    """Return every trace-consistent hypothesis start and its post-trace state."""
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
            matches.append({"start": start, "end": state})
    return matches


def product_equivalent(fixture: Fixture, target_start: int, hypothesis_start):
    """Exact BFS product equivalence from arbitrary target/hypothesis states."""
    queue = deque([(target_start, hypothesis_start, tuple())])
    seen = {(target_start, hypothesis_start)}
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


def target_state_after_trace(fixture: Fixture, trace):
    """Replay only the observed input word in the held-out target fixture."""
    state = fixture.initial_state
    for letter, _observed_output in trace:
        state = fixture.transitions[state][ALPHABET.index(letter)]
    return state


def digest_fixture(fixture: Fixture) -> str:
    payload = {
        "state_count": fixture.state_count,
        "transitions": fixture.transitions,
        "outputs": fixture.outputs,
        "initial_state": fixture.initial_state,
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def digest_trace(trace) -> str:
    encoded = json.dumps(
        [[letter, output] for letter, output in trace],
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def derive_step_metrics(total_steps: int, oracle_steps):
    """AALpy oracle steps are a subset of total SUL steps, never additive."""
    if not isinstance(total_steps, int) or total_steps < 0:
        raise ValueError("total_steps must be a nonnegative integer")
    if oracle_steps is None:
        return {
            "steps_total": total_steps,
            "steps_oracle": None,
            "steps_non_oracle": None,
        }
    if not isinstance(oracle_steps, int) or oracle_steps < 0 or oracle_steps > total_steps:
        raise ValueError("oracle_steps must be an integer within total SUL steps")
    return {
        "steps_total": total_steps,
        "steps_oracle": oracle_steps,
        "steps_non_oracle": total_steps - oracle_steps,
    }


def evaluate_hypothesis(fixture: Fixture, hypothesis, trace):
    """Evaluate initial-model and post-trace future equivalence separately."""
    matches = trace_matching_candidates(hypothesis, trace)
    target_post_trace = target_state_after_trace(fixture, trace)
    candidate_results = []
    for match in matches:
        initial_equivalent, initial_counterexample = product_equivalent(
            fixture, fixture.initial_state, match["start"]
        )
        future_equivalent, future_counterexample = product_equivalent(
            fixture, target_post_trace, match["end"]
        )
        candidate_results.append({
            "initial_state_id": repr(match["start"].state_id),
            "post_trace_state_id": repr(match["end"].state_id),
            "full_initial_model_equivalent": initial_equivalent,
            "initial_counterexample": (
                list(initial_counterexample) if initial_counterexample else None
            ),
            "post_trace_future_equivalent": future_equivalent,
            "future_counterexample": (
                list(future_counterexample) if future_counterexample else None
            ),
        })

    complete = all(
        letter in state.transitions and letter in state.output_fun
        for state in hypothesis.states
        for letter in ALPHABET
    )
    initial_flags = [
        item["full_initial_model_equivalent"] for item in candidate_results
    ]
    future_flags = [
        item["post_trace_future_equivalent"] for item in candidate_results
    ]
    candidate_count = len(matches)
    target_initial_present = any(initial_flags)
    target_future_present = any(future_flags)
    all_initial_equivalent = candidate_count > 0 and all(initial_flags)
    all_future_equivalent = candidate_count > 0 and all(future_flags)
    exact_initial_clone = candidate_count == 1 and initial_flags[0]

    return {
        "matches": matches,
        "candidate_results": candidate_results,
        "hypothesis_complete": complete,
        "target_post_trace_state": target_post_trace,
        "candidate_count": candidate_count,
        "attacker_initial_state_identified": candidate_count == 1,
        "target_initial_behavior_present": target_initial_present,
        "all_trace_candidates_initial_equivalent": all_initial_equivalent,
        "attacker_initial_behavior_identified": all_initial_equivalent,
        "target_future_behavior_present": target_future_present,
        "all_trace_candidates_future_equivalent": all_future_equivalent,
        "attacker_future_behavior_identified": all_future_equivalent,
        "exact_initial_clone_success": exact_initial_clone,
        "future_clone_success": all_future_equivalent,
        "ambiguous_initial_state": candidate_count > 1,
        "ambiguous_initial_behavior": (
            target_initial_present and not all_initial_equivalent
        ),
        "ambiguous_future_behavior": (
            target_future_present and not all_future_equivalent
        ),
        "no_trace_matching_candidate": candidate_count == 0,
        "false_initial_convergence": (
            complete and candidate_count > 0 and not target_initial_present
        ),
        "false_future_convergence": (
            complete and candidate_count > 0 and not target_future_present
        ),
    }
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
            "fixture_digest": digest_fixture(fixture),
            "trace_digest": digest_trace(trace),
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
    evaluation = evaluate_hypothesis(fixture, hypothesis, trace)
    candidates = evaluation["matches"]
    if len(candidates) == 1:
        hypothesis.initial_state = candidates[0]["start"]
        hypothesis.current_state = candidates[0]["start"]

    step_metrics = derive_step_metrics(
        sul.num_steps, getattr(oracle, "num_steps", None)
    )
    if info.get("steps_learning") != sul.num_steps:
        raise AssertionError(
            "AALpy steps_learning is expected to equal total SUL steps: "
            f"{info.get('steps_learning')} != {sul.num_steps}"
        )
    fixture_hash = digest_fixture(fixture)
    trace_hash = digest_trace(trace)

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
        "target_post_trace_state": evaluation["target_post_trace_state"],
        "target_minimal": True,
        "target_strongly_connected": True,
        "fixture_generation_attempts": fixture.generation_attempts,
        "fixture_digest": fixture_hash,
        "trace_digest": trace_hash,
        "hypothesis_states": len(hypothesis.states),
        "hypothesis_complete": evaluation["hypothesis_complete"],
        "trace_matching_initial_candidates": evaluation["candidate_count"],
        "trace_matching_candidate_ids": [
            repr(candidate["start"].state_id) for candidate in candidates
        ],
        "candidate_product_results": evaluation["candidate_results"],
        "attacker_initial_state_identified": evaluation["attacker_initial_state_identified"],
        "target_initial_behavior_present": evaluation["target_initial_behavior_present"],
        "all_trace_candidates_initial_equivalent": evaluation["all_trace_candidates_initial_equivalent"],
        "attacker_initial_behavior_identified": evaluation["attacker_initial_behavior_identified"],
        "target_future_behavior_present": evaluation["target_future_behavior_present"],
        "all_trace_candidates_future_equivalent": evaluation["all_trace_candidates_future_equivalent"],
        "attacker_future_behavior_identified": evaluation["attacker_future_behavior_identified"],
        "exact_initial_clone_success": evaluation["exact_initial_clone_success"],
        "exact_clone_success": evaluation["exact_initial_clone_success"],
        "future_clone_success": evaluation["future_clone_success"],
        "ambiguous_initial_state": evaluation["ambiguous_initial_state"],
        "ambiguous_initial_behavior": evaluation["ambiguous_initial_behavior"],
        "ambiguous_future_behavior": evaluation["ambiguous_future_behavior"],
        "no_trace_matching_candidate": evaluation["no_trace_matching_candidate"],
        "false_initial_convergence": evaluation["false_initial_convergence"],
        "false_future_convergence": evaluation["false_future_convergence"],
        "pre_calls": counters["pre_calls"],
        "post_calls": counters["post_calls"],
        "query_calls": counters["query_calls"],
        "sul_num_queries": sul.num_queries,
        "sul_num_steps": sul.num_steps,
        "trace_steps": len(trace),
        "steps_total": step_metrics["steps_total"],
        "steps_oracle": step_metrics["steps_oracle"],
        "steps_non_oracle": step_metrics["steps_non_oracle"],
        "aalpy_steps_learning_raw": info.get("steps_learning"),
        "aalpy_steps_eq_oracle_raw": info.get("steps_eq_oracle"),
        "learning_rounds": info.get("learning_rounds"),
        "homing_sequence_length": len(info.get("homing_sequence") or []),
        "characterization_set_size": len(info.get("characterization_set") or []),
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
                file=sys.stderr,
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
            "initial_state_recovery": "retain every trace-consistent (start, post-trace) hypothesis-state pair",
            "evaluator": "separate exact BFS equivalence from target initial state and from target post-trace state; target is not passed to learner",
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
        "future_clone_successes": sum(
            bool(r.get("future_clone_success")) for r in completed
        ),
        "ambiguous_future_behavior_runs": sum(
            bool(r.get("ambiguous_future_behavior")) for r in completed
        ),
        "false_future_convergences": sum(
            bool(r.get("false_future_convergence")) for r in completed
        ),
        "results": results,
        "elapsed_seconds": round(time.monotonic() - started, 3),
    }
    print(json.dumps(output, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
