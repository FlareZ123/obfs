#!/usr/bin/env python3
"""Exhaustive small-width fallback controls for the rank-r top-derivative learner.

Tests r=2..8 at n=r+2. This is a Python reference harness, not JS/HTTP
validation. Each case is checked over its complete truth table.
"""
import hashlib
import itertools
import json
import math

DELTA = 1e-10


def sha_draw(seed):
    counter = 0
    def draw():
        nonlocal counter
        value = int.from_bytes(
            hashlib.sha256(f"{seed}:{counter}".encode()).digest()[:4], "big"
        )
        counter += 1
        return value
    return draw


def forced_draws(values):
    values = list(values)
    index = 0
    def draw():
        nonlocal index
        value = values[index % len(values)]
        index += 1
        return value
    return draw


def make_coordinate_source(n, r, seed):
    draw = sha_draw(seed)
    affine = [draw() for _ in range(n)]
    offset = draw()
    table = [draw() for _ in range(1 << r)]
    top = 0
    for value in table:
        top ^= value
    if top == 0:
        table[-1] ^= 1
    def oracle(x):
        x &= (1 << n) - 1
        result = offset
        for bit, coefficient in enumerate(affine):
            if (x >> bit) & 1:
                result ^= coefficient
        return (result ^ table[x & ((1 << r) - 1)]) & 0xFFFFFFFF
    return oracle


def exact_anf(ask, n, r):
    coefficients = {0: ask(0)}
    for weight in range(1, r + 1):
        for bits in itertools.combinations(range(n), weight):
            monomial = sum(1 << bit for bit in bits)
            value = ask(monomial)
            subset = (monomial - 1) & monomial
            while True:
                value ^= coefficients[subset]
                if subset == 0:
                    break
                subset = (subset - 1) & monomial
            coefficients[monomial] = value & 0xFFFFFFFF
    def evaluate(x):
        result = 0
        for monomial, coefficient in coefficients.items():
            if (monomial & x) == monomial:
                result ^= coefficient
        return result & 0xFFFFFFFF
    return evaluate


def hybrid_with_fallback(oracle, n, r, draw_witness, draw_verify):
    mask = (1 << n) - 1
    cache = {}
    def ask(x):
        x &= mask
        if x not in cache:
            cache[x] = oracle(x) & 0xFFFFFFFF
        return cache[x]
    def derivative(directions):
        value = 0
        for subset in range(1 << len(directions)):
            point = 0
            for bit, direction in enumerate(directions):
                if (subset >> bit) & 1:
                    point ^= direction
            value ^= ask(point)
        return value & 0xFFFFFFFF

    p = math.prod(1 - 2 ** (i - (r + 1)) for i in range(r))
    cap = math.ceil(math.log(DELTA) / math.log1p(-p))
    witness, anchors, trials = 0, None, 0
    for trial in range(cap):
        # Count every attempted witness trial, including the no-witness fallback.
        trials = trial + 1
        directions = [draw_witness() & mask for _ in range(r + 1)]
        for subset in range(1 << (r + 1)):
            point = 0
            for bit, direction in enumerate(directions):
                if (subset >> bit) & 1:
                    point ^= direction
            ask(point)
        for omitted in range(r + 1):
            candidate = [d for i, d in enumerate(directions) if i != omitted]
            observed = derivative(candidate)
            if observed:
                witness, anchors, trials = observed, candidate, trial + 1
                break
        if witness:
            break

    def fallback(reason):
        return {
            "model": exact_anf(ask, n, r),
            "queries": len(cache),
            "fallback": True,
            "reason": reason,
            "witness_trials": trials,
        }

    if not witness:
        return fallback("no-witness")

    coordinates = []
    for bit in range(n):
        basis, quotient = 1 << bit, 0
        for omitted in range(r):
            directions = [basis] + [
                anchor for i, anchor in enumerate(anchors) if i != omitted
            ]
            observed = derivative(directions)
            if observed not in (0, witness):
                return fallback("signature-overflow")
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
    def evaluate(x):
        quotient = correction = 0
        for bit in range(n):
            if (x >> bit) & 1:
                quotient ^= coordinates[bit]
                correction ^= corrections[bit]
        return (table[quotient] ^ correction) & 0xFFFFFFFF

    verify_n = math.ceil(math.log(DELTA) / math.log(1 - 2 ** (-r)))
    for _ in range(verify_n):
        point = draw_verify() & mask
        if ask(point) != evaluate(point):
            return fallback("verification-mismatch")
    return {
        "model": evaluate,
        "queries": len(cache),
        "fallback": False,
        "reason": None,
        "witness_trials": trials,
    }


def main():
    rows = []
    full_domain_checks = 0
    for r in range(2, 9):
        n = r + 2
        directions = [1 << bit for bit in range(r + 1)]
        first = (1 << r) - 1

        source = make_coordinate_source(n, r, 0x80000000 + r)
        result = hybrid_with_fallback(
            source, n, r, forced_draws(directions), sha_draw(0x81000000 + r)
        )
        assert not result["fallback"]
        for x in range(1 << n):
            assert result["model"](x) == source(x)
            full_domain_checks += 1
        rows.append((r, "positive", result["queries"], result["reason"]))

        if r >= 3:
            base = make_coordinate_source(n, r, 0x82000000 + r)
            support = [r, r + 1] + list(range(r - 3))
            residual_mask = sum(1 << bit for bit in support)
            def lower_residual(x, base=base, residual_mask=residual_mask):
                return base(x) ^ (
                    1 if (x & residual_mask) == residual_mask else 0
                )
            result = hybrid_with_fallback(
                lower_residual, n, r, forced_draws(directions),
                forced_draws([residual_mask])
            )
            assert result["fallback"]
            assert result["reason"] == "verification-mismatch"
            for x in range(1 << n):
                assert result["model"](x) == lower_residual(x)
                full_domain_checks += 1
            rows.append((r, "lower-residual", result["queries"], result["reason"]))

        second = ((1 << (r + 1)) - 1) ^ 1
        def codim_r1(x, first=first, second=second):
            return (
                (1 if (x & first) == first else 0)
                ^ (2 if (x & second) == second else 0)
            )
        result = hybrid_with_fallback(
            codim_r1, n, r, forced_draws(directions), sha_draw(0x83000000 + r)
        )
        assert result["fallback"] and result["reason"] == "signature-overflow"
        for x in range(1 << n):
            assert result["model"](x) == codim_r1(x)
            full_domain_checks += 1
        rows.append((r, "codim-r+1", result["queries"], result["reason"]))

        second_silent = sum(1 << bit for bit in range(2, r + 2))
        def silent(x, first=first, second=second_silent):
            return (
                (1 if (x & first) == first else 0)
                ^ (2 if (x & second) == second else 0)
            )
        result = hybrid_with_fallback(
            silent, n, r, forced_draws(directions),
            forced_draws([second_silent])
        )
        assert result["fallback"] and result["reason"] == "verification-mismatch"
        for x in range(1 << n):
            assert result["model"](x) == silent(x)
            full_domain_checks += 1
        rows.append((r, "silent-codim-r+2", result["queries"], result["reason"]))

        lower_degree = lambda x, r=r: (
            1 if (x & ((1 << (r - 1)) - 1)) == ((1 << (r - 1)) - 1) else 0
        )
        result = hybrid_with_fallback(
            lower_degree, n, r, forced_draws(directions), sha_draw(0x84000000 + r)
        )
        assert result["fallback"] and result["reason"] == "no-witness"
        expected_trials = math.ceil(
            math.log(DELTA) / math.log1p(-math.prod(
                1 - 2 ** (i - (r + 1)) for i in range(r)
            ))
        )
        assert result["witness_trials"] == expected_trials
        for x in range(1 << n):
            assert result["model"](x) == lower_degree(x)
            full_domain_checks += 1
        rows.append((r, "degree-r-1", result["queries"], result["reason"]))

    print(json.dumps({
        "ranks": list(range(2, 9)),
        "cases": len(rows),
        "full_domain_output_checks": full_domain_checks,
        "rows": [
            {"rank": r, "case": case, "queries": queries, "fallback_reason": reason}
            for r, case, queries, reason in rows
        ],
    }, indent=2))


if __name__ == "__main__":
    main()
