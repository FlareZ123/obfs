#!/usr/bin/env python3
"""Exact minimax no-reset learner for the public delayed-pair fixture prior.

This is not a general Mealy learner. It enumerates the 124 distinct target
behaviors in the public delayed-pair generator (N=3..64, initial state chosen
from the maximum-distinguishing pair) and computes the optimal adaptive
query policy over that finite prior.
"""
from __future__ import annotations

import argparse
from collections import Counter, deque
from dataclasses import dataclass
from typing import Callable


@dataclass(frozen=True)
class Candidate:
    candidate_id: int
    state_count: int
    initial_state: int
    transitions: tuple[tuple[int, int], ...]
    outputs: tuple[tuple[str, str], ...]
    max_pair_distinguishing_length: int


def pair_distinguishing_metrics(
    transitions: list[list[int]], outputs: list[list[str]]
) -> tuple[int, tuple[int, int]]:
    """Return maximum shortest distinguishing-word length and lexicographic pair."""
    n = len(transitions)
    pairs = [(left, right) for left in range(n) for right in range(left + 1, n)]
    reverse_edges = {pair: [] for pair in pairs}
    distances: dict[tuple[int, int], int] = {}
    queue: deque[tuple[int, int]] = deque()

    for left, right in pairs:
        if any(outputs[left][symbol] != outputs[right][symbol] for symbol in range(2)):
            distances[(left, right)] = 1
            queue.append((left, right))
        for symbol in range(2):
            next_pair = tuple(sorted((
                transitions[left][symbol], transitions[right][symbol]
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

    if len(distances) != len(pairs):
        raise ValueError("delayed-pair machine is not minimal")
    maximum = max(distances.values())
    pair = min(pair for pair, distance in distances.items() if distance == maximum)
    return maximum, pair


def build_candidates(min_states: int, max_states: int) -> tuple[Candidate, ...]:
    candidates = []
    for n in range(min_states, max_states + 1):
        transitions = []
        outputs = []
        for state in range(n):
            next_one = 1 if state == 0 else 0 if state == 1 else state
            transitions.append([(state + 1) % n, next_one])
            outputs.append(["1" if state == 1 else "0", "0"])
        max_distance, max_pair = pair_distinguishing_metrics(transitions, outputs)
        for initial_state in max_pair:
            candidates.append(
                Candidate(
                    candidate_id=len(candidates),
                    state_count=n,
                    initial_state=initial_state,
                    transitions=tuple(tuple(row) for row in transitions),
                    outputs=tuple(tuple(row) for row in outputs),
                    max_pair_distinguishing_length=max_distance,
                )
            )
    return tuple(candidates)


class MinimaxPriorLearner:
    """Exact worst-case decision-tree policy over candidate/current-state beliefs."""

    def __init__(self, candidates: tuple[Candidate, ...]):
        if not candidates:
            raise ValueError("candidate family must not be empty")
        self.candidates = candidates
        self.memo: dict[tuple[tuple[int, int], ...], int] = {}
        self.active: set[tuple[tuple[int, int], ...]] = set()

    def initial_belief(self) -> tuple[tuple[int, int], ...]:
        return tuple((c.candidate_id, c.initial_state) for c in self.candidates)

    def partition(
        self, belief: tuple[tuple[int, int], ...], symbol: int
    ) -> dict[str, tuple[tuple[int, int], ...]]:
        groups: dict[str, list[tuple[int, int]]] = {}
        for candidate_id, state in belief:
            candidate = self.candidates[candidate_id]
            output = candidate.outputs[state][symbol]
            next_state = candidate.transitions[state][symbol]
            groups.setdefault(output, []).append((candidate_id, next_state))
        return {output: tuple(sorted(group)) for output, group in groups.items()}

    def worst_case_depth(self, belief: tuple[tuple[int, int], ...]) -> int:
        if len(belief) <= 1:
            return 0
        if belief in self.memo:
            return self.memo[belief]
        if belief in self.active:
            return 10**9
        self.active.add(belief)
        best = 10**9
        for symbol in (0, 1):
            groups = self.partition(belief, symbol)
            if len(groups) == 1 and next(iter(groups.values())) == belief:
                continue
            best = min(
                best,
                1 + max(self.worst_case_depth(group) for group in groups.values()),
            )
        self.active.remove(belief)
        self.memo[belief] = best
        return best

    def best_action(
        self, belief: tuple[tuple[int, int], ...]
    ) -> tuple[int, dict[str, tuple[tuple[int, int], ...]]]:
        choices = []
        for symbol in (0, 1):
            groups = self.partition(belief, symbol)
            if len(groups) == 1 and next(iter(groups.values())) == belief:
                continue
            depth = 1 + max(self.worst_case_depth(group) for group in groups.values())
            choices.append((depth, symbol, groups))
        if not choices:
            raise RuntimeError("candidate behaviors are not distinguishable")
        _, symbol, groups = min(choices, key=lambda choice: (choice[0], choice[1]))
        return symbol, groups

    def identify(self, query: Callable[[int], str]) -> tuple[Candidate, list[tuple[int, str]]]:
        belief = self.initial_belief()
        transcript = []
        while len(belief) > 1:
            symbol, groups = self.best_action(belief)
            output = str(query(symbol))
            if output not in groups:
                raise ValueError(f"oracle output {output!r} is inconsistent with all candidates")
            transcript.append((symbol, output))
            belief = groups[output]
        return self.candidates[belief[0][0]], transcript

    def simulate_all(self) -> dict[tuple[int, int], list[tuple[int, str]]]:
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
                raise AssertionError(
                    f"misidentified N={target.state_count}, initial={target.initial_state}"
                )
            traces[(target.state_count, target.initial_state)] = transcript
        return traces


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--min-states", type=int, default=3)
    parser.add_argument("--max-states", type=int, default=64)
    parser.add_argument("--show-target", default="64:3", help="print one path as N:initial_state")
    args = parser.parse_args()
    if args.min_states < 3 or args.max_states < args.min_states:
        parser.error("delayed-pair state range must satisfy 3 <= min <= max")

    candidates = build_candidates(args.min_states, args.max_states)
    learner = MinimaxPriorLearner(candidates)
    depth = learner.worst_case_depth(learner.initial_belief())
    traces = learner.simulate_all()
    lengths = [len(trace) for trace in traces.values()]
    histogram = dict(sorted(Counter(lengths).items()))

    print(f"candidate_count={len(candidates)}")
    print(f"minimax_worst_case_queries={depth}")
    print(f"observed_max_queries={max(lengths)}")
    print(f"mean_queries={sum(lengths) / len(lengths):.6f}")
    print(f"query_count_histogram={histogram}")
    print(f"belief_states_memoized={len(learner.memo)}")
    print(f"max_pair_distinguishing_length={max(c.max_pair_distinguishing_length for c in candidates)}")

    try:
        n_text, state_text = args.show_target.split(":", 1)
        key = (int(n_text), int(state_text))
        trace = traces[key]
        print(f"target={key[0]}:{key[1]}")
        print(f"target_inputs={[symbol for symbol, _ in trace]}")
        print(f"target_outputs={''.join(output for _, output in trace)}")
    except (ValueError, KeyError):
        parser.error(f"--show-target {args.show_target!r} is not in the candidate family")


if __name__ == "__main__":
    main()
