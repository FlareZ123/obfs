#!/usr/bin/env python3
"""Independent peer check of the conditional 2n reanchoring bound.

The positive corpus uses compatible triangular permutations, nonzero input/output
offsets, nonzero anchors, arbitrary output GL maps, and flag-preserving input
GL maps so the hidden normalized secant B is lower-unitriangular. A separate
four-bit counterexample shows that arbitrary input GL maps do not preserve this
hidden premise, even when P itself is compatible and the observed secant is
invertible.
"""
import json
import random


def apply_cols(cols, value):
    out = 0
    for i, col in enumerate(cols):
        if (value >> i) & 1:
            out ^= col
    return out


def rank_cols(cols, n):
    basis = [0] * n
    rank = 0
    for value in cols:
        rem = value
        for bit in range(n - 1, -1, -1):
            if not ((rem >> bit) & 1):
                continue
            if basis[bit]:
                rem ^= basis[bit]
            else:
                basis[bit] = rem
                rank += 1
                break
    return rank


def inverse_cols(cols, n):
    rows = []
    for row in range(n):
        left = sum(((cols[col] >> row) & 1) << col for col in range(n))
        rows.append([left, 1 << row])
    for pivot in range(n):
        selected = next((row for row in range(pivot, n)
                         if (rows[row][0] >> pivot) & 1), None)
        if selected is None:
            raise ValueError("singular matrix")
        rows[pivot], rows[selected] = rows[selected], rows[pivot]
        for row in range(n):
            if row != pivot and ((rows[row][0] >> pivot) & 1):
                rows[row][0] ^= rows[pivot][0]
                rows[row][1] ^= rows[pivot][1]
    return [
        sum(((rows[row][1] >> col) & 1) << row for row in range(n))
        for col in range(n)
    ]


def random_linear(n, seed, lower_only=False):
    rng = random.Random(seed)
    cols = [1 << i for i in range(n)]
    for _ in range(20 * n):
        if lower_only:
            if n == 1:
                continue
            a = rng.randrange(1, n)
            b = rng.randrange(a)
            cols[b] ^= cols[a]
        else:
            a, b = rng.sample(range(n), 2)
            if rng.randrange(2):
                cols[a], cols[b] = cols[b], cols[a]
            else:
                cols[b] ^= cols[a]
    return cols


def lower_unitriangular(cols, n):
    for col in range(n):
        for row in range(n):
            bit = (cols[col] >> row) & 1
            if row < col and bit:
                return False
            if row == col and not bit:
                return False
    return True


def random_compatible_permutation(n, seed):
    rng = random.Random(seed)
    tables = {
        j: [rng.randrange(2) for _ in range(1 << j)]
        for j in range(2, n)
    }

    def permutation(value):
        out = value
        for j, table in tables.items():
            out ^= table[value & ((1 << j) - 1)] << j
        return out

    return permutation


def reanchor_invert(oracle, n, anchor, target):
    matrix = [
        oracle(anchor ^ (1 << bit)) ^ oracle(anchor)
        for bit in range(n)
    ]
    inverse = inverse_cols(matrix, n)
    candidate = anchor ^ apply_cols(inverse, target ^ oracle(anchor))
    calls = n + 1
    seen = {anchor}
    seen.update(anchor ^ (1 << bit) for bit in range(n))
    for checks in range(1, n):
        value = oracle(candidate)
        calls += 1
        seen.add(candidate)
        if value == target:
            return candidate, calls, len(seen), checks
        candidate ^= apply_cols(inverse, value ^ target)
    raise AssertionError("candidate did not converge within n-1 checks")


def positive_wrapped_case(n, seed):
    rng = random.Random(seed)
    permutation = random_compatible_permutation(n, seed + 1000)
    # At n=2 every compatible permutation is affine, so arbitrary Lin is valid.
    # For n>=3 use flag-preserving Lin to satisfy the hidden B premise.
    input_cols = random_linear(n, seed + 2000, lower_only=(n > 2))
    output_cols = random_linear(n, seed + 3000, lower_only=False)
    input_inv = inverse_cols(input_cols, n)
    output_inv = inverse_cols(output_cols, n)
    input_offset = 1 + rng.randrange((1 << n) - 1)
    output_offset = 1 + rng.randrange((1 << n) - 1)
    anchor = 1 + rng.randrange((1 << n) - 1)

    def oracle(x):
        hidden = apply_cols(input_cols, x) ^ input_offset
        return apply_cols(output_cols, permutation(hidden)) ^ output_offset

    observed = [
        oracle(anchor ^ (1 << bit)) ^ oracle(anchor)
        for bit in range(n)
    ]
    normalized = [apply_cols(output_inv, col) for col in observed]
    normalized = [
        apply_cols(normalized, apply_cols(input_inv, 1 << bit))
        for bit in range(n)
    ]
    assert rank_cols(observed, n) == n
    assert lower_unitriangular(normalized, n)

    secret = rng.randrange(1 << n)
    target = oracle(secret)
    recovered, calls, distinct, checks = reanchor_invert(
        oracle, n, anchor, target)
    assert recovered == secret
    assert calls <= 2 * n and distinct <= 2 * n
    return {
        "calls": calls,
        "distinct": distinct,
        "candidate_checks": checks,
        "anchor_nonzero": anchor != 0,
        "input_offset_nonzero": input_offset != 0,
        "output_offset_nonzero": output_offset != 0,
    }


def arbitrary_input_wrapper_counterexample():
    # P0=x0, P1=x1, P2=x2 XOR (x0 AND NOT x1), and
    # P3=x3 XOR table3(x0,x1,x2): a compatible triangular permutation.
    tables = {2: [0, 1, 0, 0], 3: [1, 1, 1, 1, 0, 0, 0, 1]}

    def permutation(value):
        out = value
        for j, table in tables.items():
            out ^= table[value & ((1 << j) - 1)] << j
        return out

    # Columns: Lin(e0)=e1, Lin(e1)=e0+e2+e3, Lin(e2)=e2,
    # Lin(e3)=e0+e1. This is invertible but not flag-preserving.
    input_cols = [2, 13, 4, 3]
    input_inv = inverse_cols(input_cols, 4)
    input_offset, anchor, secret = 11, 9, 0

    def oracle(x):
        return permutation(apply_cols(input_cols, x) ^ input_offset)

    observed = [
        oracle(anchor ^ (1 << bit)) ^ oracle(anchor)
        for bit in range(4)
    ]
    normalized = [
        apply_cols(observed, apply_cols(input_inv, 1 << bit))
        for bit in range(4)
    ]
    assert rank_cols(observed, 4) == 4
    assert not lower_unitriangular(normalized, 4)

    inverse = inverse_cols(observed, 4)
    target = oracle(secret)
    candidate = anchor ^ apply_cols(inverse, target ^ oracle(anchor))
    path = []
    for check in range(1, 4):
        value = oracle(candidate)
        path.append({"candidate": candidate, "value": value,
                     "matches": value == target})
        if value == target:
            break
        candidate ^= apply_cols(inverse, value ^ target)
    assert all(not item["matches"] for item in path)
    return {
        "n": 4,
        "P_tables": tables,
        "input_columns": input_cols,
        "input_offset": input_offset,
        "anchor": anchor,
        "secret": secret,
        "target": target,
        "observed_matrix_columns": observed,
        "normalized_B_columns": normalized,
        "normalized_B_rows": [
            sum(((normalized[col] >> row) & 1) << col for col in range(4))
            for row in range(4)
        ],
        "candidate_checks": path,
        "interpretation": "not a counterexample to the conditional theorem; its hidden B premise is false",
    }



def chain_permutation_32(value):
    out = value
    for bit in range(2, 32):
        dependency = ((value >> (bit - 1)) & 1) & ((value >> (bit - 2)) & 1)
        out ^= dependency << bit
    return out & 0xFFFFFFFF


def wrapped_chain_32_case():
    rng = random.Random(20261124)
    input_cols = random_linear(32, 20261124, lower_only=True)
    output_cols = random_linear(32, 20261125, lower_only=False)
    input_inv = inverse_cols(input_cols, 32)
    output_inv = inverse_cols(output_cols, 32)
    input_offset = 1 + rng.randrange((1 << 32) - 1)
    output_offset = 1 + rng.randrange((1 << 32) - 1)
    anchor = 1 + rng.randrange((1 << 32) - 1)

    def oracle(x):
        hidden = apply_cols(input_cols, x) ^ input_offset
        return apply_cols(output_cols, chain_permutation_32(hidden)) ^ output_offset

    observed = [
        oracle(anchor ^ (1 << bit)) ^ oracle(anchor)
        for bit in range(32)
    ]
    normalized = [apply_cols(output_inv, col) for col in observed]
    normalized = [
        apply_cols(normalized, apply_cols(input_inv, 1 << bit))
        for bit in range(32)
    ]
    assert rank_cols(observed, 32) == 32
    assert lower_unitriangular(normalized, 32)

    receipts = []
    for _ in range(8):
        secret = rng.getrandbits(32)
        target = oracle(secret)
        recovered, calls, distinct, checks = reanchor_invert(
            oracle, 32, anchor, target)
        assert recovered == secret and calls <= 64 and distinct <= 64
        receipts.append({
            "secret": f"0x{secret:08x}",
            "target": f"0x{target:08x}",
            "calls": calls,
            "distinct": distinct,
            "candidate_checks": checks,
        })
    return {
        "n": 32,
        "input_offset": f"0x{input_offset:08x}",
        "output_offset": f"0x{output_offset:08x}",
        "anchor": f"0x{anchor:08x}",
        "input_linear_part_lower_unitriangular": True,
        "output_linear_part_invertible": True,
        "observed_matrix_rank": 32,
        "hidden_B_lower_unitriangular": True,
        "two_n_cap_per_target": 64,
        "total_calls": sum(x["calls"] for x in receipts),
        "receipts": receipts,
    }


def main():
    results = {
        n: [positive_wrapped_case(n, 100000 * n + seed)
            for seed in range(100)]
        for n in range(2, 9)
    }
    summary = {
        n: {
            "cases": len(cases),
            "max_calls": max(x["calls"] for x in cases),
            "max_distinct_queries": max(x["distinct"] for x in cases),
            "max_candidate_checks": max(x["candidate_checks"] for x in cases),
            "all_nonzero_anchors_and_offsets": all(
                x["anchor_nonzero"] and x["input_offset_nonzero"] and
                x["output_offset_nonzero"] for x in cases),
        }
        for n, cases in results.items()
    }
    assert all(summary[n]["max_calls"] <= 2 * n for n in summary)
    counterexample = arbitrary_input_wrapper_counterexample()
    wrapped32 = wrapped_chain_32_case()
    print(json.dumps({
        "result": "PASS",
        "positive_wrapped_cases": sum(x["cases"] for x in summary.values()),
        "positive_summary_by_width": summary,
        "wrapped_32bit_chain_case": wrapped32,
        "arbitrary_input_wrapper_counterexample": counterexample,
        "scope": "finite independent validation of the stated hidden-B premise; not a universal black-box result",
    }, indent=2))


if __name__ == "__main__":
    main()
