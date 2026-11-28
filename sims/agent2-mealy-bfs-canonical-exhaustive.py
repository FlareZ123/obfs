#!/usr/bin/env python3
"""Finite exact BFS-state canonicalization controls for binary Mealy tables.

Tests state-renaming, minimality and connectivity invariance. Does not establish
solver speed or validate a particular SMT encoding.
"""
from itertools import product
from math import factorial


def reachable(delta, start=0):
    discovered = {start}
    todo = [start]
    for u in todo:
        for v in delta[u]:
            if v not in discovered:
                discovered.add(v)
                todo.append(v)
    return discovered


def strongly_connected(delta):
    n = len(delta)
    return all(len(reachable(delta, s)) == n for s in range(n))


def minimal(delta, out):
    n = len(delta)
    cls = [None] * n
    for _ in range(n + 1):
        keys = [tuple(out[s]) + (cls[delta[s][0]], cls[delta[s][1]]) for s in range(n)]
        ids = {key: i for i, key in enumerate(dict.fromkeys(keys))}
        update = [ids[key] for key in keys]
        if update == cls:
            return len(set(cls)) == n
        cls = update
    raise RuntimeError("partition nonconvergence")


def canonicalize(delta, out):
    old_to_new = {0: 0}
    order = [0]
    for old in order:
        for t in delta[old]:
            if t not in old_to_new:
                old_to_new[t] = len(order)
                order.append(t)
    if len(order) != len(delta):
        return None
    return (
        tuple(tuple(old_to_new[t] for t in delta[old]) for old in order),
        tuple(out[old] for old in order),
        old_to_new,
    )


def is_bfs_canonical(delta):
    seen = {0}
    for s in range(len(delta)):
        if s not in seen:
            return False
        for t in delta[s]:
            if t not in seen:
                if t != len(seen):
                    return False
                seen.add(t)
    return len(seen) == len(delta)


def prefix_condition(delta):
    # Useful SMT encoding, but not a reachability proof on its own.
    high = 0
    for row in delta:
        for t in row:
            if t > high + 1:
                return False
            high = max(high, t)
    return high == len(delta) - 1


def check(n, all_outputs):
    stats = dict(
        n=n, transition_tables=0, mealy_tables=0, reachable=0, strong=0,
        minimum_strong=0, raw_bfs_canonical=0, uncanonical_representative=0,
        prefix_extra_unreachable=0, prefix_mismatch_reachable=0,
    )
    for transitions in product(range(n), repeat=n * 2):
        delta = tuple(tuple(transitions[s * 2:s * 2 + 2]) for s in range(n))
        stats["transition_tables"] += 1
        prefix = prefix_condition(delta)
        bfs = is_bfs_canonical(delta)
        is_reachable = len(reachable(delta)) == n
        if prefix and not is_reachable:
            stats["prefix_extra_unreachable"] += 1
        if is_reachable and prefix != bfs:
            stats["prefix_mismatch_reachable"] += 1

        outs = (product((0, 1), repeat=2 * n) if all_outputs
                else [tuple(0 for _ in range(n * 2))])
        c = canonicalize(delta, tuple((0, 0) for _ in range(n)))
        if not is_reachable:
            assert c is None, "incorrectly admitted unreachable state"
        else:
            assert c is not None
            d0, _, m0 = c
            assert is_bfs_canonical(d0)
            for old, row in enumerate(delta):
                for a, t in enumerate(row):
                    assert d0[m0[old]][a] == m0[t]

        for output_bits in outs:
            out = tuple(tuple(output_bits[s * 2:s * 2 + 2]) for s in range(n))
            stats["mealy_tables"] += 1
            if is_reachable:
                stats["reachable"] += 1
            strong = strongly_connected(delta)
            if strong:
                stats["strong"] += 1
            if strong and minimal(delta, out):
                stats["minimum_strong"] += 1

            if c is not None:
                dc, oc, m = canonicalize(delta, out)
                assert dc == d0
                assert is_bfs_canonical(dc)
                assert strongly_connected(dc) == strong
                assert minimal(dc, oc) == minimal(delta, out)
                assert all(oc[m[s]] == out[s] for s in range(n))
                if bfs:
                    stats["raw_bfs_canonical"] += 1
                else:
                    stats["uncanonical_representative"] += 1

    # Reachability makes the permutation group fixing state zero act freely.
    assert stats["reachable"] == factorial(n - 1) * stats["raw_bfs_canonical"]
    assert stats["prefix_mismatch_reachable"] == 0
    if all_outputs:
        assert stats["strong"] % factorial(n - 1) == 0
        assert stats["minimum_strong"] % factorial(n - 1) == 0
    return stats


if __name__ == "__main__":
    for n in (1, 2, 3, 4):
        print(check(n, all_outputs=n <= 3))
