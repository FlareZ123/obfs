#!/usr/bin/env python3
"""Exact rank-five witness accounting for seven/eight direction face policies.

The finite-field counts, query-union costs, and collision bounds are exact.
The eight-direction sequence was discovered heuristically; this checker does
not claim that it is optimal among all possible face sequences.
"""
from __future__ import annotations

import itertools
import math
from fractions import Fraction

M7_SEQUENCE = [
    (0, 1), (0, 2), (0, 3), (0, 4), (0, 5),
    (1, 6), (2, 6), (3, 6), (4, 6), (5, 6),
]
M8_SEQUENCE = [
    (0, 1, 4), (0, 1, 3), (0, 1, 2), (0, 1, 5), (0, 1, 7),
    (1, 6, 7), (1, 3, 6), (1, 5, 6), (1, 4, 6),
    (2, 6, 7), (2, 3, 6), (2, 5, 6), (2, 4, 6),
    (0, 2, 6),
]
# Independent representative returned by the C++ annealer.
M8_CPP_SEQUENCE = [
    (1, 3, 7), (0, 1, 7), (1, 5, 7), (1, 6, 7), (1, 4, 7),
    (1, 2, 5), (1, 2, 4), (0, 1, 2), (1, 2, 6),
    (2, 3, 4), (2, 3, 5), (2, 3, 6), (0, 2, 3), (2, 3, 7),
]
DELTA = Fraction(1, 10**10)


def rref_subspaces(m: int, rank: int):
    """Yield each rank-dimensional subspace of GF(2)^m once in RREF."""
    for pivots in itertools.combinations(range(m), rank):
        free_by_row = [
            [j for j in range(pivot + 1, m) if j not in pivots]
            for pivot in pivots
        ]
        free_count = sum(map(len, free_by_row))
        for assignment in range(1 << free_count):
            rows = [1 << pivot for pivot in pivots]
            bit = 0
            for row, free_columns in enumerate(free_by_row):
                for column in free_columns:
                    if (assignment >> bit) & 1:
                        rows[row] |= 1 << column
                    bit += 1
            yield tuple(rows)


def gf2_rank(row_masks):
    """Exact row rank over GF(2), for small bit-packed matrices."""
    pivots = {}
    rank = 0
    for value in row_masks:
        value = int(value)
        while value:
            pivot = value.bit_length() - 1
            if pivot in pivots:
                value ^= pivots[pivot]
            else:
                pivots[pivot] = value
                rank += 1
                break
    return rank


def rank5_probability(m: int) -> Fraction:
    probability = Fraction(1)
    for i in range(5):
        probability *= 1 - Fraction(2**i, 2**m)
    return probability


def build_model(m: int):
    """Enumerate the kernel subspaces and face-failure/query-cover bitsets."""
    kernel_rank = m - 5
    kernels = list(rref_subspaces(m, kernel_rank))
    faces = list(itertools.combinations(range(m), kernel_rank))
    fail_masks = []
    cover_masks = []

    for complement in faces:
        fail = 0
        for index, rows in enumerate(kernels):
            restricted_rows = [
                sum(((row >> column) & 1) << position
                    for position, column in enumerate(complement))
                for row in rows
            ]
            if gf2_rank(restricted_rows) != kernel_rank:
                fail |= 1 << index
        fail_masks.append(fail)

        face_mask = ((1 << m) - 1) ^ sum(1 << i for i in complement)
        cover = 0
        subset = face_mask
        while True:
            cover |= 1 << subset
            if subset == 0:
                break
            subset = (subset - 1) & face_mask
        cover_masks.append(cover)

    return {
        "m": m,
        "kernel_rank": kernel_rank,
        "kernels": kernels,
        "faces": faces,
        "fail_masks": fail_masks,
        "cover_masks": cover_masks,
        "rank_probability": rank5_probability(m),
        "all_kernels": (1 << len(kernels)) - 1,
    }


def evaluate(model, sequence):
    """Evaluate a fixed ordered face sequence with exact rational arithmetic."""
    faces = model["faces"]
    fail_masks = model["fail_masks"]
    cover_masks = model["cover_masks"]
    kernels = model["kernels"]
    p = model["rank_probability"]
    remaining = model["all_kernels"]
    covered = 0
    expected_queries = Fraction(0)
    expected_faces = Fraction(0)
    rows = []

    assert len(sequence) == len(set(sequence)), "face sequence must be distinct"
    for face_index in sequence:
        reach = 1 - p + p * Fraction(remaining.bit_count(), len(kernels))
        new_covered = covered | cover_masks[face_index]
        increment = new_covered.bit_count() - covered.bit_count()
        expected_queries += reach * increment
        expected_faces += reach
        covered = new_covered
        remaining &= fail_masks[face_index]
        rows.append({
            "face": faces[face_index],
            "reach": reach,
            "new_queries": increment,
            "remaining_kernels": remaining.bit_count(),
            "query_union": covered.bit_count(),
        })

    failure = 1 - p + p * Fraction(remaining.bit_count(), len(kernels))
    repeated_trial_queries = (expected_queries - failure) / (1 - failure)
    return {
        "expected_one_trial_queries": expected_queries,
        "failure_probability": failure,
        "expected_repeated_trial_queries": repeated_trial_queries,
        "expected_faces_one_trial": expected_faces,
        "expected_total_faces": expected_faces / (1 - failure),
        "expected_direction_words": Fraction(model["m"], 1) / (1 - failure),
        "query_union": covered.bit_count(),
        "rows": rows,
    }


def collision_correction_bound(m: int, metrics):
    """Bound savings from 32-bit direction dependence and cross-trial collisions."""
    cmax = metrics["query_union"]
    failure = metrics["failure_probability"]
    dependence = 1 - math.prod(
        (1 - Fraction(2**i, 2**32)) for i in range(m)
    )
    within = Fraction(cmax) * dependence / (1 - failure)
    cross = (
        Fraction((cmax - 1) ** 2, 2**27)
        * failure / (1 - failure) ** 2
    )
    return {
        "direction_dependence_probability": float(dependence),
        "within_trial_savings_bound": float(within),
        "cross_trial_savings_bound": float(cross),
        "total_savings_bound": float(within + cross),
    }


def release_metrics(model, metrics):
    failure = metrics["failure_probability"]
    trials = math.ceil(math.log(float(DELTA)) / math.log(float(failure)))
    assert failure**trials < DELTA <= failure ** (trials - 1)
    cmax = metrics["query_union"]
    witness_cap = cmax + (trials - 1) * (cmax - 1)
    return {
        "trials": trials,
        "witness_miss_probability": float(failure**trials),
        "witness_query_cap": witness_cap,
        "witness_plus_shift_cap": witness_cap + 96,
        "fast_shift_verifier_cap": witness_cap + 96 + 726,
        "signature_verifier_cap": witness_cap + 992 + 726,
        "anchor_basis_promise_shift_cap": witness_cap + 81,
        "anchor_basis_promise_signature_cap": witness_cap + 837,
        "anchor_basis_verified_shift_cap": witness_cap + 81 + 726,
        "anchor_basis_verified_signature_cap": witness_cap + 837 + 726,
        "uncached_additive_total_query_upper_bound_with_shift_and_verifier":
            float(metrics["expected_repeated_trial_queries"] + 96 + 726),
        "uncached_additive_total_query_upper_bound_with_anchor_shift_and_verifier":
            float(metrics["expected_repeated_trial_queries"] + 81 + 726),
    }


def face_sequence_indices(model, sequence):
    index = {face: i for i, face in enumerate(model["faces"])}
    return [index[tuple(face)] for face in sequence]


def exact_order_dp(model, sequence):
    """Prove the best ordering for a fixed selected face set by subset DP."""
    selected = face_sequence_indices(model, sequence)
    k = len(selected)
    states = 1 << k
    kernels = len(model["kernels"])
    p = model["rank_probability"]
    denominator = p.denominator * kernels
    remaining_masks = [0] * states
    cover_unions = [0] * states
    remaining_counts = [0] * states
    cover_counts = [0] * states
    remaining_masks[0] = model["all_kernels"]
    remaining_counts[0] = kernels

    for subset in range(1, states):
        bit = subset & -subset
        position = bit.bit_length() - 1
        previous = subset ^ bit
        face_index = selected[position]
        remaining_masks[subset] = (
            remaining_masks[previous] & model["fail_masks"][face_index]
        )
        cover_unions[subset] = (
            cover_unions[previous] | model["cover_masks"][face_index]
        )
        remaining_counts[subset] = remaining_masks[subset].bit_count()
        cover_counts[subset] = cover_unions[subset].bit_count()

    p_numerator = p.numerator
    p_denominator = p.denominator
    reach_numerators = [
        (p_denominator - p_numerator) * kernels
        + p_numerator * remaining_counts[subset]
        for subset in range(states)
    ]

    dp = [None] * states
    parent = [-1] * states
    optimal_counts = [0] * states
    dp[0] = 0
    optimal_counts[0] = 1
    transitions = 0
    for subset in range(states):
        base = dp[subset]
        for position in range(k):
            bit = 1 << position
            if subset & bit:
                continue
            target = subset | bit
            increment = cover_counts[target] - cover_counts[subset]
            candidate = base + reach_numerators[subset] * increment
            transitions += 1
            if dp[target] is None or candidate < dp[target]:
                dp[target] = candidate
                parent[target] = position
                optimal_counts[target] = optimal_counts[subset]
            elif candidate == dp[target]:
                optimal_counts[target] += optimal_counts[subset]

    full = states - 1
    order = []
    subset = full
    while subset:
        position = parent[subset]
        order.append(sequence[position])
        subset ^= 1 << position
    order.reverse()

    input_cost_numerator = 0
    subset = 0
    for position in range(k):
        target = subset | (1 << position)
        increment = cover_counts[target] - cover_counts[subset]
        input_cost_numerator += reach_numerators[subset] * increment
        subset = target

    failure_numerator = reach_numerators[full]
    optimal_q = Fraction(
        dp[full] - failure_numerator,
        denominator - failure_numerator,
    )
    input_q = Fraction(
        input_cost_numerator - failure_numerator,
        denominator - failure_numerator,
    )
    return {
        "optimal_order": order,
        "optimal_order_count": optimal_counts[full],
        "optimal_q": optimal_q,
        "input_order_q": input_q,
        "expected_query_numerator": dp[full],
        "input_expected_query_numerator": input_cost_numerator,
        "reach_denominator": denominator,
        "failure_numerator": failure_numerator,
        "remaining_kernels": remaining_counts[full],
        "query_union": cover_counts[full],
        "states": states,
        "transitions": transitions,
    }


def trial_direction_cache_costs(model, sequence, metrics):
    """Exact coordinate-stage query expectation with all trial directions in the basis."""
    width = model["m"]
    kernel_count = len(model["kernels"])
    prefix_caches = []
    covered = set()
    for complement in sequence:
        face_mask = ((1 << width) - 1) ^ sum(1 << index for index in complement)
        subset = face_mask
        while True:
            covered.add(subset)
            if subset == 0:
                break
            subset = (subset - 1) & face_mask
        prefix_caches.append(set(covered))

    previous = kernel_count
    weighted_shift = 0
    weighted_signature = 0
    remaining = [row["remaining_kernels"] for row in metrics["rows"]]
    for face_index, still_failing in enumerate(remaining):
        first_success = previous - still_failing
        previous = still_failing
        if first_success == 0:
            continue
        anchors = [index for index in range(width)
                   if index not in sequence[face_index]]
        extras = list(sequence[face_index])
        cache = prefix_caches[face_index]
        shift_extra = 0
        signature_extra = 0
        for extra in extras:
            shift_masks = {
                1 << extra,
                (1 << extra) | (1 << anchors[0]),
                (1 << extra) | (1 << anchors[1]),
            }
            shift_extra += sum(mask not in cache for mask in shift_masks)
            for subset in range((1 << 5) - 1):
                mask = 1 << extra
                for bit, anchor in enumerate(anchors):
                    if (subset >> bit) & 1:
                        mask |= 1 << anchor
                if mask not in cache:
                    signature_extra += 1
        shift_cost = 3 * (32 - width) + shift_extra
        signature_cost = 31 * (32 - width) + signature_extra
        weighted_shift += first_success * shift_cost
        weighted_signature += first_success * signature_cost

    success_count = kernel_count - remaining[-1]
    return {
        "shift_expected": Fraction(weighted_shift, success_count),
        "signature_expected": Fraction(weighted_signature, success_count),
    }


def main():
    model7 = build_model(7)
    model8 = build_model(8)
    seq7 = face_sequence_indices(model7, M7_SEQUENCE)
    seq8 = face_sequence_indices(model8, M8_SEQUENCE)
    seq8_cpp = face_sequence_indices(model8, M8_CPP_SEQUENCE)
    result7 = evaluate(model7, seq7)
    result8 = evaluate(model8, seq8)
    result8_cpp = evaluate(model8, seq8_cpp)
    order_dp7 = exact_order_dp(model7, M7_SEQUENCE)
    order_dp8 = exact_order_dp(model8, M8_SEQUENCE)
    order_dp8_cpp = exact_order_dp(model8, M8_CPP_SEQUENCE)
    trial_cache7 = trial_direction_cache_costs(model7, M7_SEQUENCE, result7)
    trial_cache8 = trial_direction_cache_costs(model8, M8_SEQUENCE, result8)

    assert len(model7["kernels"]) == 2667
    assert len(model8["kernels"]) == 97155
    assert result7["expected_one_trial_queries"] == Fraction(1040519433, 16777216)
    assert result7["failure_probability"] == Fraction(9034517, 33554432)
    assert result7["expected_repeated_trial_queries"] == Fraction(2072004349, 24519915)
    assert [row["new_queries"] for row in result7["rows"]] == [32,16,8,4,2,16,8,4,2,1]
    assert result7["query_union"] == 93
    assert order_dp7["optimal_q"] == result7["expected_repeated_trial_queries"]
    assert order_dp7["input_order_q"] == order_dp7["optimal_q"]
    assert order_dp7["optimal_order_count"] == 28800
    assert order_dp7["states"] == 1024
    assert order_dp7["transitions"] == 5120

    assert result8["expected_one_trial_queries"] == Fraction(37202797641, 536870912)
    assert result8["failure_probability"] == Fraction(192870469, 1073741824)
    assert result8["expected_repeated_trial_queries"] == Fraction(74212724813, 880871355)
    assert [row["new_queries"] for row in result8["rows"]] == [32,16,8,4,2,16,8,4,2,16,8,4,2,1]
    assert result8["query_union"] == 123
    assert result8_cpp["expected_one_trial_queries"] == result8["expected_one_trial_queries"]
    assert result8_cpp["failure_probability"] == result8["failure_probability"]
    assert result8_cpp["expected_repeated_trial_queries"] == result8["expected_repeated_trial_queries"]
    assert [row["new_queries"] for row in result8_cpp["rows"]] == [32,16,8,4,2,16,8,4,2,16,8,4,2,1]
    assert [row["remaining_kernels"] for row in result8_cpp["rows"]] == [64387,48003,39811,35715,33667,24963,20611,18435,17347,11955,9259,7911,7237,6948]
    for order_dp in (order_dp8, order_dp8_cpp):
        assert order_dp["optimal_q"] == result8["expected_repeated_trial_queries"]
        assert order_dp["input_order_q"] == order_dp["optimal_q"]
        assert order_dp["expected_query_numerator"] == 7228875609622710
        assert order_dp["reach_denominator"] == 104319386910720
        assert order_dp["failure_numerator"] == 18738330415695
        assert order_dp["optimal_order_count"] == 138240
        assert order_dp["states"] == 16384
        assert order_dp["transitions"] == 114688
        assert order_dp["remaining_kernels"] == 6948
        assert order_dp["query_union"] == 123
        assert order_dp["optimal_order"] in (M8_SEQUENCE, M8_CPP_SEQUENCE)

    correction7 = collision_correction_bound(7, result7)
    correction8 = collision_correction_bound(8, result8)
    gap = result7["expected_repeated_trial_queries"] - result8["expected_repeated_trial_queries"]
    gap_lower = float(gap) - correction7["total_savings_bound"]
    gap_upper = float(gap) + correction8["total_savings_bound"]
    release7 = release_metrics(model7, result7)
    release8 = release_metrics(model8, result8)

    assert release7["trials"] == 18
    assert release7["witness_query_cap"] == 1657
    assert release7["witness_plus_shift_cap"] == 1753
    assert release7["fast_shift_verifier_cap"] == 2479
    assert release7["signature_verifier_cap"] == 3375
    assert release7["anchor_basis_promise_shift_cap"] == 1738
    assert release7["anchor_basis_promise_signature_cap"] == 2494
    assert release7["anchor_basis_verified_shift_cap"] == 2464
    assert release7["anchor_basis_verified_signature_cap"] == 3220
    assert release8["trials"] == 14
    assert release8["witness_query_cap"] == 1709
    assert release8["witness_plus_shift_cap"] == 1805
    assert release8["fast_shift_verifier_cap"] == 2531
    assert release8["signature_verifier_cap"] == 3427
    assert release8["anchor_basis_promise_shift_cap"] == 1790
    assert release8["anchor_basis_promise_signature_cap"] == 2546
    assert release8["anchor_basis_verified_shift_cap"] == 2516
    assert release8["anchor_basis_verified_signature_cap"] == 3272
    assert trial_cache7["shift_expected"] == Fraction(66220, 837)
    assert trial_cache7["signature_expected"] == Fraction(66545, 81)
    assert trial_cache8["shift_expected"] == Fraction(7100804, 90207)
    assert trial_cache8["signature_expected"] == Fraction(73827200, 90207)
    assert result7["expected_repeated_trial_queries"] + trial_cache7["shift_expected"] == Fraction(4011919249, 24519915)
    assert result8["expected_repeated_trial_queries"] + trial_cache8["shift_expected"] == Fraction(143552075873, 880871355)
    assert result7["expected_repeated_trial_queries"] + trial_cache7["signature_expected"] == Fraction(22216174024, 24519915)
    assert result8["expected_repeated_trial_queries"] + trial_cache8["signature_expected"] == Fraction(795135332813, 880871355)
    assert 0.2536614 < gap_lower < 0.2536615
    assert 0.2537354 < gap_upper < 0.2537356

    print("EXACT SEVEN-DIRECTION BASELINE")
    print("  kernels:", len(model7["kernels"]))
    print("  p(rank 5):", model7["rank_probability"])
    print("  E:", result7["expected_one_trial_queries"])
    print("  f:", result7["failure_probability"])
    print("  Q:", result7["expected_repeated_trial_queries"])
    print("  rows:", [(r["face"], r["new_queries"], r["remaining_kernels"]) for r in result7["rows"]])
    print("  release:", release7)
    print("  collision correction:", correction7)

    print("EXACT EIGHT-DIRECTION CANDIDATE (HEURISTICALLY FOUND)")
    print("  kernels:", len(model8["kernels"]))
    print("  p(rank 5):", model8["rank_probability"])
    print("  E:", result8["expected_one_trial_queries"])
    print("  f:", result8["failure_probability"])
    print("  Q:", result8["expected_repeated_trial_queries"])
    print("  rows:", [(r["face"], r["new_queries"], r["remaining_kernels"]) for r in result8["rows"]])
    print("  release:", release8)
    print("  collision correction:", correction8)
    print("COMPARISON")
    print("  injective-model Q7-Q8:", gap, float(gap))
    print("  actual 32-bit expected-query advantage interval:", gap_lower, gap_upper)
    print("  expected face tests (7,8):",
          float(result7["expected_total_faces"]), float(result8["expected_total_faces"]))
    print("  expected direction words (7,8):",
          float(result7["expected_direction_words"]), float(result8["expected_direction_words"]))
    face_delta = float(result8["expected_total_faces"] - result7["expected_total_faces"])
    print("  extra expected face evaluations (m8 - m7):", face_delta)
    print("  break-even face-evaluation cost in query units:", float(gap) / face_delta)
    print("  all-trial-direction coordinate-stage expected queries (m7/m8):",
          float(trial_cache7["shift_expected"]), float(trial_cache8["shift_expected"]),
          "shift;", float(trial_cache7["signature_expected"]),
          float(trial_cache8["signature_expected"]), "signature")
    print("  witness + coordinate-stage expected queries (m7/m8):",
          float(result7["expected_repeated_trial_queries"] + trial_cache7["shift_expected"]),
          float(result8["expected_repeated_trial_queries"] + trial_cache8["shift_expected"]),
          "shift;", float(result7["expected_repeated_trial_queries"] + trial_cache7["signature_expected"]),
          float(result8["expected_repeated_trial_queries"] + trial_cache8["signature_expected"]),
          "signature")
    print("  fixed-set exact ordering DP (m7,m8):",
          order_dp7["optimal_order_count"], order_dp8["optimal_order_count"],
          "optimal orders; states:", order_dp7["states"], order_dp8["states"])
    face_delta = float(result8["expected_total_faces"] - result7["expected_total_faces"])
    print("  extra expected face evaluations (m8 - m7):", face_delta)
    print("  break-even face-evaluation cost in query units:", float(gap) / face_delta)


if __name__ == "__main__":
    main()
