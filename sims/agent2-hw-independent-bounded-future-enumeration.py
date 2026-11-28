#!/usr/bin/env python3
"""Independent <=3-state Mealy future-equivalence adversarial enumeration.

Generates twelve deterministic three-state targets with public witness
diversity k=3, then enumerates *every* candidate of 1..3 states and every
candidate initial state. This script does not import an Agent 49 solver or
reconstruction method; it compares all full public traces and uses a product
automaton to detect a different future from the target post-state.

No inference about 16..24-state historical cases is justified by this check.
"""
import random
from itertools import product


def replay(delta, output, initial, inputs):
    state = initial
    trace = []
    for symbol in inputs:
        trace.append((symbol, output[state][symbol]))
        state = delta[state][symbol]
    return tuple(trace), state


def different_future(left_delta, left_out, left_post,
                     right_delta, right_out, right_post):
    visited = set()
    pending = [(left_post, right_post)]
    while pending:
        a, b = pending.pop()
        if (a, b) in visited:
            continue
        visited.add((a, b))
        for symbol in (0, 1):
            if left_out[a][symbol] != right_out[b][symbol]:
                return True
            pending.append((left_delta[a][symbol], right_delta[b][symbol]))
    return False


def public_signature_lower_bound(trace, depth_cap=8):
    """Only aligned public input/output windows; no private states."""
    best = 1
    for depth in range(1, min(depth_cap, len(trace)) + 1):
        response_sets = {}
        for i in range(len(trace) - depth + 1):
            word = tuple(a for a, _ in trace[i:i + depth])
            response = tuple(b for _, b in trace[i:i + depth])
            response_sets.setdefault(word, set()).add(response)
        for signatures in response_sets.values():
            best = max(best, len(signatures))
    return best


def every_candidate_model():
    for n in (1, 2, 3):
        for transitions in product(range(n), repeat=2 * n):
            delta = tuple((transitions[2*s], transitions[2*s+1])
                          for s in range(n))
            for outputs in product((0, 1), repeat=2 * n):
                output = tuple((outputs[2*s], outputs[2*s+1])
                               for s in range(n))
                yield delta, output


def main():
    rng = random.Random(0x2B5F)
    samples = []
    while len(samples) < 12:
        delta = tuple(tuple(rng.randrange(3) for _ in range(2))
                      for _ in range(3))
        output = tuple(tuple(rng.randrange(2) for _ in range(2))
                       for _ in range(3))
        start = rng.randrange(3)
        inputs = tuple(rng.randrange(2) for _ in range(70))
        trace, post = replay(delta, output, start, inputs)
        if public_signature_lower_bound(trace) == 3:
            samples.append((delta, output, post, trace))

    matched_total = 0
    for index, (target_delta, target_out, target_post, trace) in enumerate(samples):
        matches = 0
        candidates_checked = 0
        for delta, output in every_candidate_model():
            for initial in range(len(delta)):
                candidates_checked += 1
                state = initial
                for symbol, observed in trace:
                    if output[state][symbol] != observed:
                        break
                    state = delta[state][symbol]
                else:
                    matches += 1
                    assert not different_future(
                        delta, output, state, target_delta, target_out, target_post
                    ), ("bounded future divergence", index)
        assert candidates_checked == 140484
        matched_total += matches
        print({"case": index, "public_diversity_lower_bound": 3,
               "candidate_roots_checked": candidates_checked,
               "trace_matching_roots": matches})
    print({"cases": len(samples),
           "candidate_roots_checked": len(samples) * 140484,
           "matching_candidate_roots": matched_total,
           "future_differences": 0})


if __name__ == "__main__":
    main()
