#!/usr/bin/env python3
"""Deterministic reference simulation for the rank-r top-derivative learner.

Standard-library-only Python reference ports. Tests promised sources
F(x)=A(x)+b+h(Px), rank(P)=r, with a nonzero top ANF coefficient.
The experiment covers r=2..8; r=1 is degenerate because h(Px) is affine
and the first derivative does not annihilate the affine residual.
"""
import hashlib
import json
import math
import statistics

N, DELTA, REPS, HELDOUTS = 32, 1e-10, 50, 128


def draw_stream(seed):
    counter = 0
    def draw():
        nonlocal counter
        value = int.from_bytes(
            hashlib.sha256(f"{seed}:{counter}".encode()).digest()[:4], "big"
        )
        counter += 1
        return value
    return draw


def rank(vectors, n):
    pivots = [0] * n
    result = 0
    for value in vectors:
        x = value
        for bit in range(n - 1, -1, -1):
            if (x >> bit) & 1:
                if pivots[bit]:
                    x ^= pivots[bit]
                else:
                    pivots[bit] = x
                    result += 1
                    break
    return result


def make_source(n, r, seed):
    draw = draw_stream(seed)
    mask = (1 << n) - 1
    projections = []
    while len(projections) < r:
        candidate = draw() & mask
        if rank(projections + [candidate], n) > len(projections):
            projections.append(candidate)
    affine = [draw() for _ in range(n)]
    offset = draw()
    table = [draw() for _ in range(1 << r)]
    top = 0
    for value in table:
        top ^= value
    if top == 0:
        table[-1] ^= 1

    def oracle(value):
        x = value & mask
        index = 0
        for bit, projection in enumerate(projections):
            index |= ((x & projection).bit_count() & 1) << bit
        result = offset
        for bit, coefficient in enumerate(affine):
            if (x >> bit) & 1:
                result ^= coefficient
        return (result ^ table[index]) & 0xFFFFFFFF

    return oracle


def baseline(oracle, n, r, draw):
    mask, count = (1 << n) - 1, 1 << r
    cache = {}

    def ask(value):
        value &= mask
        if value not in cache:
            cache[value] = oracle(value) & 0xFFFFFFFF
        return cache[value]

    p = math.prod(1 - 2 ** (i - r) for i in range(r))
    attempts_cap = math.ceil(math.log(DELTA / 2) / math.log1p(-p))
    verify_n = math.ceil(
        math.log(DELTA / (2 * attempts_cap)) / math.log(1 - 1 / count)
    )
    heldout = [draw() & mask for _ in range(verify_n)]

    for attempt in range(attempts_cap):
        anchors = [draw() & mask for _ in range(r)]
        corners = [0] * count
        for subset in range(1, count):
            low = subset & -subset
            bit = low.bit_length() - 1
            corners[subset] = corners[subset ^ low] ^ anchors[bit]
        table = [ask(value) for value in corners]
        f0 = table[0]
        profiles = [[0] * count for _ in range(count)]
        for s in range(count):
            for t in range(count):
                profiles[s][t] = table[s ^ t] ^ table[s] ^ table[t] ^ f0

        coordinates, corrections = [], []
        for bit in range(n):
            basis = 1 << bit
            f_basis = ask(basis)
            viable = list(range(count))
            for t in range(1, count):
                observed = ask(basis ^ corners[t]) ^ f_basis ^ table[t] ^ f0
                viable = [candidate for candidate in viable
                          if profiles[candidate][t] == observed]
                if not viable:
                    break
            if not viable:
                break
            coordinates.append(viable[0])
            corrections.append(f_basis ^ table[viable[0]])
        if len(coordinates) != n:
            continue

        def evaluate(value):
            q = correction = 0
            for bit in range(n):
                if (value >> bit) & 1:
                    q ^= coordinates[bit]
                    correction ^= corrections[bit]
            return (table[q] ^ correction) & 0xFFFFFFFF

        if all(evaluate(value) == ask(value) for value in heldout):
            return len(cache), attempt + 1, verify_n, evaluate
    raise RuntimeError("baseline exhausted its attempt cap")


def hybrid(oracle, n, r, draw_witness, draw_verify):
    mask = (1 << n) - 1
    cache = {}

    def ask(value):
        value &= mask
        if value not in cache:
            cache[value] = oracle(value) & 0xFFFFFFFF
        return cache[value]

    def derivative(directions):
        result = 0
        for subset in range(1 << len(directions)):
            value = 0
            for bit, direction in enumerate(directions):
                if (subset >> bit) & 1:
                    value ^= direction
            result ^= ask(value)
        return result & 0xFFFFFFFF

    p = math.prod(1 - 2 ** (i - (r + 1)) for i in range(r))
    trials_cap = math.ceil(math.log(DELTA) / math.log1p(-p))
    witness, anchors, trials = 0, None, 0
    for trial in range(trials_cap):
        directions = [draw_witness() & mask for _ in range(r + 1)]
        for subset in range(1 << (r + 1)):
            value = 0
            for bit, direction in enumerate(directions):
                if (subset >> bit) & 1:
                    value ^= direction
            ask(value)
        for omitted in range(r + 1):
            candidate = [d for i, d in enumerate(directions) if i != omitted]
            observed = derivative(candidate)
            if observed:
                witness, anchors, trials = observed, candidate, trial + 1
                break
        if witness:
            break
    if not witness:
        raise RuntimeError("no witness; production code exact-fallbacks")

    coordinates = []
    for bit in range(n):
        basis, quotient = 1 << bit, 0
        for omitted in range(r):
            directions = [basis] + [
                a for i, a in enumerate(anchors) if i != omitted
            ]
            observed = derivative(directions)
            if observed not in (0, witness):
                raise RuntimeError("signature outside rank-r span")
            if observed == witness:
                quotient |= 1 << omitted
        coordinates.append(quotient)

    table = []
    for index in range(1 << r):
        representative = 0
        for bit in range(r):
            if (index >> bit) & 1:
                representative ^= anchors[bit]
        table.append(ask(representative))
    corrections = [
        ask(1 << bit) ^ table[coordinates[bit]] for bit in range(n)
    ]

    def evaluate(value):
        q = correction = 0
        for bit in range(n):
            if (value >> bit) & 1:
                q ^= coordinates[bit]
                correction ^= corrections[bit]
        return (table[q] ^ correction) & 0xFFFFFFFF

    verify_n = math.ceil(math.log(DELTA) / math.log(1 - 2 ** (-r)))
    for _ in range(verify_n):
        value = draw_verify() & mask
        if ask(value) != evaluate(value):
            raise RuntimeError("verification mismatch; production exact-fallbacks")
    return len(cache), trials, verify_n, evaluate


def bounds(n, r):
    p = math.prod(1 - 2 ** (i - (r + 1)) for i in range(r))
    k = math.ceil(math.log(DELTA) / math.log1p(-p))
    m = math.ceil(math.log(DELTA) / math.log(1 - 2 ** (-r)))
    cap = (1 << (r + 1)) + ((1 << (r + 1)) - 1) * (k - 1)
    cap += ((1 << r) - 1) * n + m
    return {
        "witness_probability": p,
        "witness_trials_cap": k,
        "witness_miss_bound": (1 - p) ** k,
        "verification_samples": m,
        "false_accept_bound": (1 - 2 ** (-r)) ** m,
        "fast_query_cap": cap,
        "exact_anf_queries": sum(math.comb(n, j) for j in range(r + 1)),
    }


def main():
    summary = []
    for r in range(2, 9):
        bq, hq, ba, ht = [], [], [], []
        for rep in range(REPS):
            seed = rep + 1000 * r
            oracle = make_source(N, r, 0x70000000 + seed)
            b = baseline(oracle, N, r, draw_stream(0x71000000 + seed))
            h = hybrid(oracle, N, r, draw_stream(0x72000000 + seed),
                       draw_stream(0x73000000 + seed))
            bq.append(b[0])
            hq.append(h[0])
            ba.append(b[1])
            ht.append(h[1])
            assert h[0] <= bounds(N, r)["fast_query_cap"]
            heldout = draw_stream(0x74000000 + seed)
            for _ in range(HELDOUTS):
                x = heldout()
                assert b[3](x) == oracle(x)
                assert h[3](x) == oracle(x)
        bm, hm = statistics.mean(bq), statistics.mean(hq)
        summary.append({
            "rank": r,
            "pairs": REPS,
            "baseline_mean_queries": bm,
            "hybrid_mean_queries": hm,
            "mean_reduction_percent": 100 * (bm - hm) / bm,
            "hybrid_lower_pairs": sum(b > h for b, h in zip(bq, hq)),
            "mean_baseline_attempts": statistics.mean(ba),
            "mean_hybrid_trials": statistics.mean(ht),
            "max_hybrid_queries": max(hq),
            **bounds(N, r),
        })
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
