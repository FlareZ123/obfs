#!/usr/bin/env python3
"""Independent exact peer check of Agent 2's m=7/m=8 rank-five face policies.

The rank criterion is checked by enumerating every kernel subspace in RREF.
For a 5-column face S with complement T, P|_S is invertible iff the
coordinate projection pi_T restricted to ker(P) is injective, equivalently
has rank m-5. Query unions are coefficient-subset masks, not sampled values.
"""
from __future__ import annotations

import itertools
import json
from fractions import Fraction


M7 = [
    (0, 1), (0, 2), (0, 3), (0, 4), (0, 5),
    (1, 6), (2, 6), (3, 6), (4, 6), (5, 6),
]
M8 = [
    (0, 1, 4), (0, 1, 3), (0, 1, 2), (0, 1, 5), (0, 1, 7),
    (1, 6, 7), (1, 3, 6), (1, 5, 6), (1, 4, 6),
    (2, 6, 7), (2, 3, 6), (2, 5, 6), (2, 4, 6),
    (0, 2, 6),
]
M8_CPP = [
    (1, 3, 7), (0, 1, 7), (1, 5, 7), (1, 6, 7), (1, 4, 7),
    (1, 2, 5), (1, 2, 4), (0, 1, 2), (1, 2, 6),
    (2, 3, 4), (2, 3, 5), (2, 3, 6), (0, 2, 3), (2, 3, 7),
]
DELTA = Fraction(1, 10**10)


def rref_subspaces(width: int, rank: int):
    """Yield each rank-r subspace of GF(2)^width exactly once."""
    for pivots in itertools.combinations(range(width), rank):
        free_columns = [
            [column for column in range(pivot + 1, width) if column not in pivots]
            for pivot in pivots
        ]
        free_bits = sum(map(len, free_columns))
        for assignment in range(1 << free_bits):
            rows = [1 << pivot for pivot in pivots]
            cursor = 0
            for row_index, columns in enumerate(free_columns):
                for column in columns:
                    if (assignment >> cursor) & 1:
                        rows[row_index] |= 1 << column
                    cursor += 1
            yield tuple(rows)


def gf2_rank(rows: list[int] | tuple[int, ...]) -> int:
    pivots: dict[int, int] = {}
    rank = 0
    for value in rows:
        row = value
        while row:
            pivot = row.bit_length() - 1
            if pivot in pivots:
                row ^= pivots[pivot]
            else:
                pivots[pivot] = row
                rank += 1
                break
    return rank


def rank5_probability(width: int) -> Fraction:
    result = Fraction(1)
    for i in range(5):
        result *= 1 - Fraction(1 << i, 1 << width)
    return result


def remaining_kernel_counts(kernels, sequence, kernel_rank: int) -> list[int]:
    remaining = set(range(len(kernels)))
    counts = []
    for complement in sequence:
        failed = set()
        for index in remaining:
            restricted = []
            for row in kernels[index]:
                value = 0
                for position, column in enumerate(complement):
                    value |= ((row >> column) & 1) << position
                restricted.append(value)
            if gf2_rank(restricted) != kernel_rank:
                failed.add(index)
        remaining = failed
        counts.append(len(remaining))
    return counts


def query_increments(width: int, sequence):
    covered: set[int] = set()
    increments = []
    for complement in sequence:
        face_mask = ((1 << width) - 1) ^ sum(1 << i for i in complement)
        face_subsets = set()
        subset = face_mask
        while True:
            face_subsets.add(subset)
            if subset == 0:
                break
            subset = (subset - 1) & face_mask
        increments.append(len(face_subsets - covered))
        covered.update(face_subsets)
    return increments, len(covered)


def evaluate(width: int, sequence):
    kernel_rank = width - 5
    kernels = list(rref_subspaces(width, kernel_rank))
    remaining = remaining_kernel_counts(kernels, sequence, kernel_rank)
    increments, union = query_increments(width, sequence)
    probability_full_rank = rank5_probability(width)
    count = len(kernels)

    prefix_costs = []
    total = 0
    for increment in increments:
        total += increment
        prefix_costs.append(total)

    # Conditional on rank(P)=5, every kernel subspace is equally likely.
    # The cost for a kernel is the query union up to its first successful face,
    # or the full union if none in this finite sequence succeeds.
    previous = count
    weighted_cost = 0
    for index, still_failing in enumerate(remaining):
        first_success = previous - still_failing
        weighted_cost += first_success * prefix_costs[index]
        previous = still_failing
    weighted_cost += previous * union
    conditional_cost = Fraction(weighted_cost, count)

    expected_one_trial = (
        (1 - probability_full_rank) * union
        + probability_full_rank * conditional_cost
    )
    failure = (
        1 - probability_full_rank
        + probability_full_rank * Fraction(remaining[-1], count)
    )
    repeated_queries = (expected_one_trial - failure) / (1 - failure)

    previous = count
    expected_faces_one_trial = Fraction(0)
    for still_failing in remaining:
        reach = (
            1 - probability_full_rank
            + probability_full_rank * Fraction(previous, count)
        )
        expected_faces_one_trial += reach
        previous = still_failing
    expected_faces_repeated = expected_faces_one_trial / (1 - failure)
    expected_direction_words = Fraction(width, 1) / (1 - failure)

    trials = 1
    while failure**trials > DELTA:
        trials += 1
    miss_probability = failure**trials
    witness_query_cap = 1 + trials * (union - 1)

    return {
        "width": width,
        "kernel_count": count,
        "remaining": remaining,
        "increments": increments,
        "query_union": union,
        "rank_probability": probability_full_rank,
        "expected_one_trial": expected_one_trial,
        "failure_probability": failure,
        "repeated_queries": repeated_queries,
        "expected_faces": expected_faces_repeated,
        "expected_direction_words": expected_direction_words,
        "trials": trials,
        "miss_probability": miss_probability,
        "witness_query_cap": witness_query_cap,
        "fast_shift_verifier_cap": witness_query_cap + 96 + 726,
        "signature_verifier_cap": witness_query_cap + 992 + 726,
        "expected_total_with_shift_and_verifier": repeated_queries + 96 + 726,
    }


def ordered_subset_dp(width: int, sequence, kernels):
    """Exact subset DP for the best ordering of a fixed face set."""
    face_count = len(sequence)
    state_count = 1 << face_count
    kernel_rank = width - 5
    kernel_count = len(kernels)

    # Distribution of each kernel's face-failure mask.
    fail_counts = [0] * state_count
    for rows in kernels:
        failure_mask = 0
        for face_index, complement in enumerate(sequence):
            restricted = []
            for row in rows:
                value = 0
                for position, column in enumerate(complement):
                    value |= ((row >> column) & 1) << position
                restricted.append(value)
            if gf2_rank(restricted) != kernel_rank:
                failure_mask |= 1 << face_index
        fail_counts[failure_mask] += 1

    # Superset zeta transform: count kernels that fail every face in mask.
    remaining = fail_counts[:]
    for bit in range(face_count):
        bit_mask = 1 << bit
        for mask in range(state_count):
            if not (mask & bit_mask):
                remaining[mask] += remaining[mask | bit_mask]

    all_directions = (1 << width) - 1
    face_query_masks = []
    for complement in sequence:
        face_mask = all_directions ^ sum(1 << index for index in complement)
        query_mask = 0
        subset = face_mask
        while True:
            query_mask |= 1 << subset
            if subset == 0:
                break
            subset = (subset - 1) & face_mask
        face_query_masks.append(query_mask)

    covered = [0] * state_count
    for mask in range(1, state_count):
        least_bit = mask & -mask
        face_index = least_bit.bit_length() - 1
        covered[mask] = covered[mask ^ least_bit] | face_query_masks[face_index]

    p = rank5_probability(width)
    p_num, p_den = p.numerator, p.denominator
    infinity = 10**100
    best = [infinity] * state_count
    ways = [0] * state_count
    predecessor = [None] * state_count
    best[0] = 0
    ways[0] = 1

    for mask in range(state_count):
        reach_numerator = (
            (p_den - p_num) * kernel_count
            + p_num * remaining[mask]
        )
        available = (state_count - 1) ^ mask
        while available:
            least_bit = available & -available
            face_index = least_bit.bit_length() - 1
            next_mask = mask | least_bit
            new_queries = (
                face_query_masks[face_index] & ~covered[mask]
            ).bit_count()
            candidate = best[mask] + reach_numerator * new_queries
            if candidate < best[next_mask]:
                best[next_mask] = candidate
                ways[next_mask] = ways[mask]
                predecessor[next_mask] = (mask, face_index)
            elif candidate == best[next_mask]:
                ways[next_mask] += ways[mask]
            available ^= least_bit

    order = []
    mask = state_count - 1
    while mask:
        previous, face_index = predecessor[mask]
        order.append(face_index)
        mask = previous
    order.reverse()
    return {
        "expected_one_trial": Fraction(best[-1], p_den * kernel_count),
        "optimal_order_count": ways[-1],
        "one_optimal_order": order,
    }


def collision_bounds(width: int, result):
    union = result["query_union"]
    failure = result["failure_probability"]
    full_rank_probability = Fraction(1)
    for i in range(width):
        full_rank_probability *= 1 - Fraction(1 << i, 1 << 32)
    dependence_probability = 1 - full_rank_probability
    within = Fraction(union, 1) * dependence_probability / (1 - failure)
    cross = (
        Fraction((union - 1) ** 2, 1 << 27)
        * failure
        / (1 - failure) ** 2
    )
    return {
        "dependence_probability": dependence_probability,
        "within_savings_bound": within,
        "cross_savings_bound": cross,
        "total_savings_bound": within + cross,
    }


def as_float(value):
    return float(value)


def main():
    result7 = evaluate(7, M7)
    result8 = evaluate(8, M8)
    result8_cpp = evaluate(8, M8_CPP)
    order_dp7 = ordered_subset_dp(7, M7, list(rref_subspaces(7, 2)))
    order_dp8 = ordered_subset_dp(8, M8, list(rref_subspaces(8, 3)))

    assert order_dp7["expected_one_trial"] == result7["expected_one_trial"]
    assert order_dp8["expected_one_trial"] == result8["expected_one_trial"]
    assert order_dp7["optimal_order_count"] == 28800
    assert order_dp8["optimal_order_count"] == 138240

    assert result7["kernel_count"] == 2667
    assert result8["kernel_count"] == 97155
    assert result7["remaining"] == [1643, 1131, 875, 747, 683, 411, 275, 207, 173, 156]
    assert result8["remaining"] == [
        64387, 48003, 39811, 35715, 33667, 24963, 20611,
        18435, 17347, 11955, 9259, 7911, 7237, 6948,
    ]
    assert result8_cpp["remaining"] == result8["remaining"]
    assert result7["increments"] == [32, 16, 8, 4, 2, 16, 8, 4, 2, 1]
    assert result8["increments"] == [32, 16, 8, 4, 2, 16, 8, 4, 2, 16, 8, 4, 2, 1]
    assert result8_cpp["increments"] == result8["increments"]
    assert result7["query_union"] == 93 and result8["query_union"] == 123
    assert result7["rank_probability"] == Fraction(26043255, 33554432)
    assert result8["rank_probability"] == Fraction(948718575, 1073741824)
    assert result7["failure_probability"] == Fraction(9034517, 33554432)
    assert result8["failure_probability"] == Fraction(192870469, 1073741824)
    assert result7["repeated_queries"] == Fraction(2072004349, 24519915)
    assert result8["repeated_queries"] == Fraction(74212724813, 880871355)
    assert result8_cpp["repeated_queries"] == result8["repeated_queries"]

    collision7 = collision_bounds(7, result7)
    collision8 = collision_bounds(8, result8)
    gap = result7["repeated_queries"] - result8["repeated_queries"]
    lower = gap - collision7["total_savings_bound"]
    upper = gap + collision8["total_savings_bound"]

    assert result7["trials"] == 18 and result7["witness_query_cap"] == 1657
    assert result8["trials"] == 14 and result8["witness_query_cap"] == 1709
    assert result7["fast_shift_verifier_cap"] == 2479 and result7["signature_verifier_cap"] == 3375
    assert result8["fast_shift_verifier_cap"] == 2531 and result8["signature_verifier_cap"] == 3427

    return {
        "m7": {
            "kernels": result7["kernel_count"],
            "remaining": result7["remaining"],
            "increments": result7["increments"],
            "query_union": result7["query_union"],
            "rank_probability": as_float(result7["rank_probability"]),
            "failure_probability": as_float(result7["failure_probability"]),
            "expected_repeated_queries": as_float(result7["repeated_queries"]),
            "expected_faces": as_float(result7["expected_faces"]),
            "expected_direction_words": as_float(result7["expected_direction_words"]),
            "trials": result7["trials"],
            "miss_probability": as_float(result7["miss_probability"]),
            "witness_query_cap": result7["witness_query_cap"],
            "fast_shift_verifier_cap": result7["fast_shift_verifier_cap"],
            "signature_verifier_cap": result7["signature_verifier_cap"],
            "expected_total_with_shift_and_verifier": as_float(result7["expected_total_with_shift_and_verifier"]),
            "collision_savings_bound": as_float(collision7["total_savings_bound"]),
        },
        "m8": {
            "kernels": result8["kernel_count"],
            "remaining": result8["remaining"],
            "increments": result8["increments"],
            "query_union": result8["query_union"],
            "rank_probability": as_float(result8["rank_probability"]),
            "failure_probability": as_float(result8["failure_probability"]),
            "expected_repeated_queries": as_float(result8["repeated_queries"]),
            "expected_faces": as_float(result8["expected_faces"]),
            "expected_direction_words": as_float(result8["expected_direction_words"]),
            "trials": result8["trials"],
            "miss_probability": as_float(result8["miss_probability"]),
            "witness_query_cap": result8["witness_query_cap"],
            "fast_shift_verifier_cap": result8["fast_shift_verifier_cap"],
            "signature_verifier_cap": result8["signature_verifier_cap"],
            "expected_total_with_shift_and_verifier": as_float(result8["expected_total_with_shift_and_verifier"]),
            "collision_savings_bound": as_float(collision8["total_savings_bound"]),
        },
        "fixed_face_set_order_dp": {
            "m7_expected_one_trial": str(order_dp7["expected_one_trial"]),
            "m7_optimal_order_count": order_dp7["optimal_order_count"],
            "m8_expected_one_trial": str(order_dp8["expected_one_trial"]),
            "m8_optimal_order_count": order_dp8["optimal_order_count"],
        },
        "m7_minus_m8_injective_query_gap": as_float(gap),
        "actual_uniform_32bit_gap_interval": [as_float(lower), as_float(upper)],
        "m8_cpp_sequence_ties": (
            result8_cpp["remaining"] == result8["remaining"]
            and result8_cpp["increments"] == result8["increments"]
            and result8_cpp["repeated_queries"] == result8["repeated_queries"]
        ),
        "scope": "exact checker for the supplied sequences; no optimality claim",
    }


if __name__ == "__main__":
    print(json.dumps(main(), indent=2, sort_keys=True))
