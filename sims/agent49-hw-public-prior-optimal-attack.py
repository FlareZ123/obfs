#!/usr/bin/env python3
"""Prior-aware no-reset learner for the public Agent2 random-fixture family.

This is deliberately NOT a general Mealy-machine learner. It demonstrates how
small a public deterministic fixture prior makes the current hW benchmark.
It uses only the public generator definition and a one-shot step(query) oracle.
"""
from __future__ import annotations

import argparse
import random
from collections import Counter
from dataclasses import dataclass
from typing import Callable


@dataclass(frozen=True)
class Candidate:
    candidate_id: int
    state_count: int
    seed: int
    transitions: tuple[tuple[int, int], ...]
    outputs: tuple[tuple[str, str], ...]
    initial_state: int


def is_strongly_connected(transitions: list[list[int]]) -> bool:
    count = len(transitions)
    for start in range(count):
        reached = {start}
        pending = [start]
        while pending:
            state = pending.pop()
            for target in transitions[state]:
                if target not in reached:
                    reached.add(target)
                    pending.append(target)
        if len(reached) != count:
            return False
    return True


def is_minimal_mealy(
    transitions: list[list[int]], outputs: list[list[str]]
) -> bool:
    partition = [0] * len(transitions)
    while True:
        classes: dict[tuple[tuple[str, ...], tuple[int, int]], int] = {}
        refined: list[int] = []
        for state in range(len(transitions)):
            signature = (
                tuple(outputs[state]),
                tuple(partition[transitions[state][symbol]] for symbol in range(2)),
            )
            if signature not in classes:
                classes[signature] = len(classes)
            refined.append(classes[signature])
        if refined == partition:
            return len(set(partition)) == len(transitions)
        partition = refined


def generate_public_fixture(state_count: int, seed: int) -> tuple[
    tuple[tuple[int, int], ...], tuple[tuple[str, str], ...], int
]:
    """Mirror the public generate_fixture(N, seed) definition exactly."""
    rng = random.Random(seed)
    for _attempt in range(1, 10001):
        transitions = [
            [(state + 1) % state_count, rng.randrange(state_count)]
            for state in range(state_count)
        ]
        outputs = [
            [rng.choice(("0", "1")), rng.choice(("0", "1"))]
            for _state in range(state_count)
        ]
        if not is_strongly_connected(transitions):
            continue
        if not is_minimal_mealy(transitions, outputs):
            continue
        initial_state = rng.randrange(state_count)
        return (
            tuple(tuple(row) for row in transitions),
            tuple(tuple(row) for row in outputs),
            initial_state,
        )
    raise RuntimeError(f"could not generate fixture for N={state_count}, seed={seed}")


def build_candidates(min_states: int, max_states: int, seeds: int) -> tuple[Candidate, ...]:
    candidates = []
    for state_count in range(min_states, max_states + 1):
        for seed in range(seeds):
            transitions, outputs, initial_state = generate_public_fixture(state_count, seed)
            candidates.append(
                Candidate(
                    candidate_id=len(candidates),
                    state_count=state_count,
                    seed=seed,
                    transitions=transitions,
                    outputs=outputs,
                    initial_state=initial_state,
                )
            )
    return tuple(candidates)


class MinimaxPriorLearner:
    """Exact worst-case decision-tree policy over a finite candidate family."""

    def __init__(self, candidates: tuple[Candidate, ...]):
        if not candidates:
            raise ValueError("candidate family must not be empty")
        self.candidates = candidates
        self._memo: dict[tuple[tuple[int, int], ...], int] = {}
        self._active: set[tuple[tuple[int, int], ...]] = set()

    def initial_belief(self) -> tuple[tuple[int, int], ...]:
        return tuple((c.candidate_id, c.initial_state) for c in self.candidates)

    def worst_case_depth(self, belief: tuple[tuple[int, int], ...]) -> int:
        if len(belief) <= 1:
            return 0
        if belief in self._memo:
            return self._memo[belief]
        # Returning to an identical belief without eliminating a candidate
        # cannot improve a finite decision tree; the same future policy is
        # available immediately from that belief.
        if belief in self._active:
            return 10**9
        self._active.add(belief)
        best = 10**9
        for symbol in (0, 1):
            groups = self._partition(belief, symbol)
            if len(groups) == 1 and next(iter(groups.values())) == belief:
                continue
            cost = 1 + max(self.worst_case_depth(group) for group in groups.values())
            best = min(best, cost)
        self._active.remove(belief)
        self._memo[belief] = best
        return best

    def _partition(
        self, belief: tuple[tuple[int, int], ...], symbol: int
    ) -> dict[str, tuple[tuple[int, int], ...]]:
        groups: dict[str, list[tuple[int, int]]] = {}
        for candidate_id, state in belief:
            candidate = self.candidates[candidate_id]
            output = candidate.outputs[state][symbol]
            next_state = candidate.transitions[state][symbol]
            groups.setdefault(output, []).append((candidate_id, next_state))
        return {output: tuple(sorted(group)) for output, group in groups.items()}

    def best_action(
        self, belief: tuple[tuple[int, int], ...]
    ) -> tuple[int, dict[str, tuple[tuple[int, int], ...]]]:
        choices = []
        for symbol in (0, 1):
            groups = self._partition(belief, symbol)
            if len(groups) == 1 and next(iter(groups.values())) == belief:
                continue
            depth = 1 + max(self.worst_case_depth(group) for group in groups.values())
            choices.append((depth, symbol, groups))
        if not choices:
            raise RuntimeError("candidate family contains behaviorally indistinguishable hypotheses")
        _, symbol, groups = min(choices, key=lambda choice: (choice[0], choice[1]))
        return symbol, groups

    def identify(self, query: Callable[[int], str]) -> tuple[Candidate, list[tuple[int, str]]]:
        """Identify a target using only query(symbol)->output; no reset required."""
        belief = self.initial_belief()
        transcript: list[tuple[int, str]] = []
        while len(belief) > 1:
            symbol, groups = self.best_action(belief)
            output = str(query(symbol))
            if output not in groups:
                raise ValueError(f"oracle output {output!r} is inconsistent with every candidate")
            transcript.append((symbol, output))
            belief = groups[output]
        candidate_id, _state = belief[0]
        return self.candidates[candidate_id], transcript

    def simulate_all(self) -> dict[tuple[int, int], list[tuple[int, str]]]:
        """Validate the public query callback interface against every candidate."""
        traces = {}
        for target in self.candidates:
            state = [target.initial_state]

            def oracle(symbol: int, candidate: Candidate = target, current=state) -> str:
                old_state = current[0]
                output = candidate.outputs[old_state][symbol]
                current[0] = candidate.transitions[old_state][symbol]
                return output

            identified, transcript = self.identify(oracle)
            if identified.candidate_id != target.candidate_id:
                raise AssertionError(f"policy misidentified {target.state_count}:{target.seed}")
            traces[(target.state_count, target.seed)] = transcript
        return traces


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--min-states", type=int, default=6)
    parser.add_argument("--max-states", type=int, default=12)
    parser.add_argument("--seeds", type=int, default=10, help="candidate seeds are 0..seeds-1")
    parser.add_argument("--show-target", default="6:0", help="print one candidate path as N:seed")
    args = parser.parse_args()
    if args.min_states < 1 or args.max_states < args.min_states or args.seeds < 1:
        parser.error("invalid candidate range")

    candidates = build_candidates(args.min_states, args.max_states, args.seeds)
    learner = MinimaxPriorLearner(candidates)
    initial = learner.initial_belief()
    depth = learner.worst_case_depth(initial)
    traces = learner.simulate_all()
    lengths = [len(trace) for trace in traces.values()]
    histogram = dict(sorted(Counter(lengths).items()))

    print(f"candidate_count={len(candidates)}")
    print(f"minimax_worst_case_queries={depth}")
    print(f"observed_max_queries={max(lengths)}")
    print(f"mean_queries={sum(lengths) / len(lengths):.6f}")
    print(f"query_count_histogram={histogram}")
    print(f"belief_states_memoized={len(learner._memo)}")

    try:
        n_text, seed_text = args.show_target.split(":", 1)
        key = (int(n_text), int(seed_text))
        trace = traces[key]
        print(f"target={key[0]}:{key[1]}")
        print(f"target_inputs={[symbol for symbol, _ in trace]}")
        print(f"target_outputs={''.join(output for _, output in trace)}")
    except (ValueError, KeyError):
        parser.error(f"--show-target {args.show_target!r} is not in the candidate family")


if __name__ == "__main__":
    main()
