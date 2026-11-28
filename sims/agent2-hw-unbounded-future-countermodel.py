#!/usr/bin/env python3
"""Construct strongly connected Mealy countermodels beyond a trace-derived bound.

For any finite binary input/output trace of length T, two models with T+1
states can reproduce every observed pair yet disagree on the next input 0.
This is a scope guard, not a solver-speed or actual attack demonstration.
"""
import random
from itertools import product


def construct(trace, next_zero_output):
    n = len(trace) + 1
    delta = [[0, 0] for _ in range(n)]
    output = [[0, 0] for _ in range(n)]
    for index, (letter, bit) in enumerate(trace):
        delta[index][letter] = index + 1
        output[index][letter] = bit
    delta[-1][0] = 0
    delta[-1][1] = 0
    output[-1][0] = next_zero_output
    return delta, output


def replay(delta, output, trace, next_input=0):
    state = 0
    for letter, bit in trace:
        assert output[state][letter] == bit
        state = delta[state][letter]
    return state, output[state][next_input]


def assert_strongly_connected(delta):
    n = len(delta)
    for start in range(n):
        visited = {start}
        queue = [start]
        for node in queue:
            for dest in delta[node]:
                if dest not in visited:
                    visited.add(dest)
                    queue.append(dest)
        assert len(visited) == n


def main():
    rng = random.Random(0xA2749)
    count = 0
    for length in range(21):
        if length <= 6:
            traces = product(product((0, 1), repeat=2), repeat=length)
        else:
            traces = [
                tuple((rng.randrange(2), rng.randrange(2))
                      for _ in range(length))
                for _ in range(200)
            ]
        for trace in traces:
            control = construct(trace, 0)
            divergent = construct(trace, 1)
            assert_strongly_connected(control[0])
            assert_strongly_connected(divergent[0])
            assert replay(*control, trace) == (length, 0)
            assert replay(*divergent, trace) == (length, 1)
            count += 1
    print({"traces": count, "max_trace_length": 20,
           "assertion": "strongly connected next-output-divergent pair"})


if __name__ == "__main__":
    main()
