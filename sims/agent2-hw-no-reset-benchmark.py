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

import numpy as np
import signal
import sys
import time
from collections import deque
from dataclasses import dataclass

from aalpy.base import SUL
from aalpy.learning_algs.resetless.hW import hW
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


def pair_distinguishing_metrics(transitions, outputs):
    """Return exact shortest distinguishing-word lengths for all state pairs."""
    state_count = len(transitions)
    pairs = [
        (left, right)
        for left in range(state_count)
        for right in range(left + 1, state_count)
    ]
    reverse_edges = {pair: [] for pair in pairs}
    distances = {}
    queue = deque()

    for left, right in pairs:
        if any(outputs[left][symbol] != outputs[right][symbol] for symbol in range(2)):
            distances[(left, right)] = 1
            queue.append((left, right))
        for symbol in range(2):
            next_pair = tuple(sorted((
                transitions[left][symbol],
                transitions[right][symbol],
            )))
            if next_pair[0] != next_pair[1]:
                reverse_edges[next_pair].append((left, right))

    while queue:
        next_pair = queue.popleft()
        next_distance = distances[next_pair] + 1
        for previous_pair in reverse_edges[next_pair]:
            if previous_pair not in distances:
                distances[previous_pair] = next_distance
                queue.append(previous_pair)

    maximum_pair = None
    maximum_length = None
    if distances:
        maximum_length = max(distances.values())
        maximum_pair = min(
            pair for pair, distance in distances.items()
            if distance == maximum_length
        )
    return {
        "distinguishable_pair_count": len(distances),
        "total_pair_count": len(pairs),
        "max_pair_distinguishing_length": maximum_length,
        "max_distinguishing_pair": maximum_pair,
    }


def generate_delayed_pair_fixture(state_count: int, seed: int) -> Fixture:
    """Construct a strongly connected machine with a deliberately rare output split.

    Input 0 is an n-cycle. Input 1 swaps states 0 and 1 and fixes all others.
    Outputs are identical everywhere except that state 1 emits '1' on input 0.
    The two permutations generate a transitive action on unordered state pairs;
    all states are minimal, but some pairs require long distinguishing words.
    """
    if state_count < 3:
        raise ValueError("delayed-pair fixtures require at least 3 states")
    transitions = []
    outputs = []
    for state in range(state_count):
        next_one = 1 if state == 0 else 0 if state == 1 else state
        transitions.append([(state + 1) % state_count, next_one])
        outputs.append(["1" if state == 1 else "0", "0"])

    metrics = pair_distinguishing_metrics(transitions, outputs)
    expected_pairs = state_count * (state_count - 1) // 2
    if metrics["distinguishable_pair_count"] != expected_pairs:
        raise AssertionError("delayed-pair fixture is not minimal")
    if not is_strongly_connected(transitions):
        raise AssertionError("delayed-pair fixture is not strongly connected")

    rng = random.Random(seed)
    initial_state = metrics["max_distinguishing_pair"][rng.randrange(2)]
    return Fixture(
        state_count=state_count,
        transitions=tuple(tuple(row) for row in transitions),
        outputs=tuple(tuple(row) for row in outputs),
        initial_state=initial_state,
        generation_attempts=1,
    )


class InstrumentedRandomWphWOracle(RandomWphWOracle):
    """Record per-equivalence-check learner state, including interrupted checks."""

    def __init__(self, random_walk_length: int, num_test_origin_states: int):
        super().__init__(
            random_walk_length=random_walk_length,
            num_test_origin_states=num_test_origin_states,
        )
        self.rounds = []

    def find_cex(self, hypothesis):
        learner = self.learner
        record = {
            "call_index": len(self.rounds) + 1,
            "hypothesis_size": hypothesis.size,
            "global_trace_steps_before": len(learner.global_trace),
            "oracle_steps_before": self.num_steps,
            "homing_sequence_length_before": len(learner.homing_sequence),
            "characterization_set_size_before": len(learner.W),
        }
        self.rounds.append(record)
        counterexample = None
        try:
            counterexample = super().find_cex(hypothesis)
            return counterexample
        finally:
            record.update({
                "global_trace_steps_after": len(learner.global_trace),
                "oracle_steps_after": self.num_steps,
                "homing_sequence_length_after": len(learner.homing_sequence),
                "characterization_set_size_after": len(learner.W),
                "identified_state_count_after": len(learner.state_map),
                "h_response_state_count_after": len(learner.h_response_map),
                "counterexample_found": counterexample is not None,
                "counterexample_length": (
                    len(counterexample) if counterexample is not None else None
                ),
            })


class InstrumentedHW(hW):
    """Observe which hW subroutine is consuming one-shot SUL steps."""

    def __init__(self, *args, **kwargs):
        self.activity_counts = {}
        self.steps_by_phase = {}
        self.last_activity = "__init__"
        self.last_activity_detail = None
        self.last_step_input = None
        self.last_step_index = 0
        super().__init__(*args, **kwargs)

    def _mark(self, activity: str, detail=None):
        self.last_activity = activity
        self.last_activity_detail = detail
        self.activity_counts[activity] = self.activity_counts.get(activity, 0) + 1

    def step_wrapper(self, letter):
        phase = self.last_activity
        self.steps_by_phase[phase] = self.steps_by_phase.get(phase, 0) + 1
        self.last_step_input = letter
        self.last_step_index = len(self.global_trace) + 1
        return super().step_wrapper(letter)

    def main_loop(self, print_level: int = 2):
        self._mark("main_loop")
        return super().main_loop(print_level=print_level)

    def create_hypothesis(self):
        self._mark("create_hypothesis")
        return super().create_hypothesis()

    def execute_homing_sequence(self):
        self._mark("execute_homing_sequence", len(self.homing_sequence))
        return super().execute_homing_sequence()

    def execute_sequence(self, sequence):
        self._mark("execute_sequence", len(sequence))
        return super().execute_sequence(sequence)

    def execute_conjecture_path(self, start_state, path):
        self._mark("execute_conjecture_path", len(path))
        return super().execute_conjecture_path(start_state, path)

    def find_reachable_incomplete_transition(self, start_state):
        self._mark("find_reachable_incomplete_transition")
        return super().find_reachable_incomplete_transition(start_state)

    def check_conjecture_inconsistencies(self, current_state):
        self._mark("check_conjecture_inconsistencies")
        return super().check_conjecture_inconsistencies(current_state)

    def debug_snapshot(self):
        return {
            "last_activity": self.last_activity,
            "last_activity_detail": self.last_activity_detail,
            "activity_counts": dict(self.activity_counts),
            "steps_by_phase": dict(self.steps_by_phase),
            "last_step_input": self.last_step_input,
            "last_step_index": self.last_step_index,
            "global_trace_steps": len(self.global_trace),
            "homing_sequence": list(self.homing_sequence),
            "homing_sequence_length": len(self.homing_sequence),
            "characterization_set": [list(w) for w in self.W],
            "characterization_set_size": len(self.W),
            "identified_state_count": len(self.state_map),
            "h_response_state_count": len(self.h_response_map),
            "known_state_count": len(self._all_states()),
        }


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
    seen = {(target_start, id(hypothesis_start))}
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
            pair = (next_target, id(next_hypothesis))
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


def hypothesis_states_equivalent(left_state, right_state):
    """Exact product equivalence between two states in the returned conjecture."""
    queue = [(left_state, right_state)]
    seen = {(id(left_state), id(right_state))}
    while queue:
        left, right = queue.pop(0)
        for letter in ALPHABET:
            if left.output_fun.get(letter) != right.output_fun.get(letter):
                return False
            left_next = left.transitions.get(letter)
            right_next = right.transitions.get(letter)
            if left_next is None or right_next is None:
                return False
            pair = (id(left_next), id(right_next))
            if pair not in seen:
                seen.add(pair)
                queue.append((left_next, right_next))
    return True


def evaluate_hypothesis(fixture: Fixture, hypothesis, trace):
    """Offline-certify the returned conjecture's initial and future behavior.

    Candidate enumeration is limited to states in this returned hypothesis;
    it is not an enumeration of every machine consistent with the observed trace.
    The exact product checks are evaluator-only, not learner-side proofs.
    """
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
    end_representatives = []
    for match in matches:
        if not any(
            hypothesis_states_equivalent(representative, match["end"])
            for representative in end_representatives
        ):
            end_representatives.append(match["end"])
    candidate_end_classes = len(end_representatives)
    candidate_end_unambiguous = (
        complete and candidate_count > 0 and candidate_end_classes == 1
    )
    exact_initial_clone = candidate_count == 1 and initial_flags[0]

    return {
        "matches": matches,
        "candidate_results": candidate_results,
        "hypothesis_complete": complete,
        "target_post_trace_state": target_post_trace,
        "candidate_count": candidate_count,
        "candidate_end_equivalence_classes": candidate_end_classes,
        "candidate_end_behavior_unambiguous": candidate_end_unambiguous,
        "attacker_initial_state_identified": candidate_count == 1,
        "target_initial_behavior_present": target_initial_present,
        "all_trace_candidates_initial_equivalent": all_initial_equivalent,
        "returned_hypothesis_initial_behavior_certified": all_initial_equivalent,
        "target_future_behavior_present": target_future_present,
        "all_trace_candidates_future_equivalent": all_future_equivalent,
        "returned_hypothesis_future_behavior_certified": all_future_equivalent,
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
    fixture_family: str,
):
    if fixture_family == "delayed-pair":
        fixture = generate_delayed_pair_fixture(state_count, seed)
    else:
        fixture = generate_fixture(state_count, seed)
    pair_metrics = pair_distinguishing_metrics(fixture.transitions, fixture.outputs)
    target_transitions = [list(row) for row in fixture.transitions]
    target_outputs = [list(row) for row in fixture.outputs]
    target_minimal = is_minimal_mealy(target_transitions, target_outputs)
    target_strongly_connected = is_strongly_connected(target_transitions)
    if not target_minimal or not target_strongly_connected:
        raise AssertionError("generated target must be minimal and strongly connected")
    sul, trace, counters = make_sul(fixture)
    oracle_seed = (seed * 0x9E3779B1 + state_count * 0x85EBCA77) & 0xFFFFFFFF
    random.seed(oracle_seed)
    np.random.seed(oracle_seed)
    oracle = InstrumentedRandomWphWOracle(
        random_walk_length=random_walk_length,
        num_test_origin_states=origin_states,
    )

    old_handler = signal.signal(signal.SIGALRM, alarm_handler)
    signal.alarm(timeout_seconds)
    started = time.monotonic()
    try:
        learner = InstrumentedHW(
            input_al=list(ALPHABET),
            sul=sul,
            automaton_type="mealy",
            eq_oracle=oracle,
            query_for_initial_state=False,
        )
        hypothesis, info = learner.main_loop(print_level=0)
    except RunTimeout:
        learner = oracle.learner
        timeout_debug = None
        if learner is not None:
            timeout_debug = {
                "oracle_call_count": len(oracle.rounds),
                "learning_rounds_observed": max(0, len(oracle.rounds) - 1),
                "learner": (
                    learner.debug_snapshot()
                    if hasattr(learner, "debug_snapshot")
                    else None
                ),
                "last_oracle_rounds": oracle.rounds[-10:],
            }
        return {
            "state_count": state_count,
            "seed": seed,
            "oracle_seed": oracle_seed,
            "fixture_family": fixture_family,
            "max_pair_distinguishing_length": pair_metrics["max_pair_distinguishing_length"],
            "max_distinguishing_pair": pair_metrics["max_distinguishing_pair"],
            "status": "timeout",
            "elapsed_seconds": round(time.monotonic() - started, 3),
            "pre_calls": counters["pre_calls"],
            "post_calls": counters["post_calls"],
            "query_calls": counters["query_calls"],
            "trace_steps": len(trace),
            "timeout_debug": timeout_debug,
            "fixture_digest": digest_fixture(fixture),
            "trace_digest": digest_trace(trace),
        }
    except Exception as error:
        return {
            "state_count": state_count,
            "seed": seed,
            "oracle_seed": oracle_seed,
            "fixture_family": fixture_family,
            "max_pair_distinguishing_length": pair_metrics["max_pair_distinguishing_length"],
            "max_distinguishing_pair": pair_metrics["max_distinguishing_pair"],
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
        "fixture_family": fixture_family,
        "max_pair_distinguishing_length": pair_metrics["max_pair_distinguishing_length"],
        "max_distinguishing_pair": pair_metrics["max_distinguishing_pair"],
        "status": "completed",
        "target_initial_state": fixture.initial_state,
        "target_post_trace_state": evaluation["target_post_trace_state"],
        "candidate_end_equivalence_classes": evaluation["candidate_end_equivalence_classes"],
        "candidate_end_behavior_unambiguous": evaluation["candidate_end_behavior_unambiguous"],
        "target_minimal": target_minimal,
        "target_strongly_connected": target_strongly_connected,
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
        "returned_hypothesis_initial_behavior_certified": evaluation["returned_hypothesis_initial_behavior_certified"],
        "target_future_behavior_present": evaluation["target_future_behavior_present"],
        "all_trace_candidates_future_equivalent": evaluation["all_trace_candidates_future_equivalent"],
        "returned_hypothesis_future_behavior_certified": evaluation["returned_hypothesis_future_behavior_certified"],
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
        "oracle_call_count": len(oracle.rounds),
        "max_homing_sequence_length_observed": max(
            (round["homing_sequence_length_after"] for round in oracle.rounds),
            default=0,
        ),
        "max_characterization_set_size_observed": max(
            (round["characterization_set_size_after"] for round in oracle.rounds),
            default=0,
        ),
        "learner_activity_counts": dict(learner.activity_counts),
        "learner_steps_by_phase": dict(learner.steps_by_phase),
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
    parser.add_argument(
        "--fixture-family",
        choices=("random", "delayed-pair"),
        default="random",
    )
    args = parser.parse_args()
    if args.fixture_family == "random":
        if not (2 <= args.min_states <= args.max_states <= 12):
            raise SystemExit("random fixture state range must be within [2,12]")
    elif not (3 <= args.min_states <= args.max_states <= 64):
        raise SystemExit("delayed-pair fixture state range must be within [3,64]")
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
                args.fixture_family,
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
            "fixture_family": args.fixture_family,
            "state_counts": [args.min_states, args.max_states],
            "seeds_per_state_count": args.seeds,
            "pair_distinguishing_metric": (
                "exact shortest distinguishing input-word length over all unordered target-state pairs"
            ),
            "input_alphabet": list(ALPHABET),
            "output_alphabet": list(OUTPUTS),
            "strong_connectivity": "input 0 forms a directed cycle",
            "minimality": "partition-refinement checked for every fixture; delayed-pair family also records exact pair-distinguishing distances",
            "oracle": {
                "type": "RandomWphWOracle",
                "random_walk_length": args.random_walk_length,
                "origin_states": args.origin_states,
            },
            "query_for_initial_state": False,
            "reset_policy": "one pre() initialization; post() is a no-op; query() raises",
            "initial_state_recovery": "retain every trace-consistent (start, post-trace) hypothesis-state pair",
            "evaluator": "offline exact BFS product equivalence from target initial and post-trace states; target is not passed to learner",
            "candidate_scope": "trace-consistent states in the returned conjecture only; not all machines consistent with the observation",
            "learner_equivalence_oracle": "bounded randomized random-walk tests; heuristic, not exact",
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
