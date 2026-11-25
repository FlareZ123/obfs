#!/usr/bin/env python3
"""Independent exact check of the fixed six- and seven-direction face orders.

This enumerates all 2D kernels of full-rank 5x7 binary matrices and recomputes
the query-union expectation for the reported ten-face K_{2,5} order. It checks
the fixed order and restart arithmetic; it does not re-prove the C++ DP's
global optimality over all 21-face orders and cutoffs.
"""
from fractions import Fraction
import json


def kernels_2d_rref(width=7):
    """Enumerate every 2D subspace of GF(2)^width in unique RREF form."""
    kernels = []
    for pivot0 in range(width):
        for pivot1 in range(pivot0 + 1, width):
            free0 = [j for j in range(pivot0 + 1, width) if j != pivot1]
            free1 = [j for j in range(pivot1 + 1, width)]
            for assignment in range(1 << (len(free0) + len(free1))):
                row0, row1, bit = 1 << pivot0, 1 << pivot1, 0
                for column in free0:
                    if (assignment >> bit) & 1:
                        row0 |= 1 << column
                    bit += 1
                for column in free1:
                    if (assignment >> bit) & 1:
                        row1 |= 1 << column
                    bit += 1
                kernels.append((row0, row1))
    return kernels


def rank5_probability(width):
    """Probability that a uniform 5-by-width binary matrix has row rank 5."""
    probability = Fraction(1, 1)
    for i in range(5):
        probability *= 1 - Fraction(1, 1 << (width - i))
    return probability


def seven_direction_check():
    kernels = kernels_2d_rref(7)
    assert len(kernels) == 2667
    full_rank_probability = rank5_probability(7)
    complements = [
        (0, 1), (0, 2), (0, 3), (0, 4), (0, 5),
        (1, 6), (2, 6), (3, 6), (4, 6), (5, 6),
    ]

    # A kernel survives while every tested face has singular restriction.
    remaining = [True] * len(kernels)
    queried_vertices = set()
    expected_fresh_trial_queries = Fraction(0, 1)
    increments = []
    remaining_counts = []

    for omitted0, omitted1 in complements:
        face_mask = 0x7F ^ (1 << omitted0) ^ (1 << omitted1)
        vertices = {
            value for value in range(1 << 7)
            if (value & ~face_mask) == 0
        }
        new_queries = len(queried_vertices | vertices) - len(queried_vertices)
        reach_probability = (
            1 - full_rank_probability
            + full_rank_probability * Fraction(sum(remaining), len(kernels))
        )
        expected_fresh_trial_queries += reach_probability * new_queries
        queried_vertices |= vertices
        increments.append(new_queries)

        next_remaining = []
        for survives, (row0, row1) in zip(remaining, kernels):
            a, b = (row0 >> omitted0) & 1, (row0 >> omitted1) & 1
            c, d = (row1 >> omitted0) & 1, (row1 >> omitted1) & 1
            determinant = (a * d) ^ (b * c)
            next_remaining.append(survives and determinant == 0)
        remaining = next_remaining
        remaining_counts.append(sum(remaining))

    failure_probability = (
        1 - full_rank_probability
        + full_rank_probability * Fraction(sum(remaining), len(kernels))
    )
    expected_restarted_queries = (
        expected_fresh_trial_queries - failure_probability
    ) / (1 - failure_probability)

    assert full_rank_probability == Fraction(26043255, 33554432)
    assert increments == [32, 16, 8, 4, 2, 16, 8, 4, 2, 1]
    assert len(queried_vertices) == 93
    assert expected_fresh_trial_queries == Fraction(1040519433, 16777216)
    assert failure_probability == Fraction(9034517, 33554432)
    assert expected_restarted_queries == Fraction(2072004349, 24519915)

    failure_after_17 = failure_probability ** 17
    failure_after_18 = failure_probability ** 18
    assert failure_after_17 > Fraction(1, 10**10)
    assert failure_after_18 < Fraction(1, 10**10)

    return {
        "kernel_count": len(kernels),
        "rank5_probability": str(full_rank_probability),
        "face_complements": complements,
        "new_queries_per_face": increments,
        "remaining_kernel_counts": remaining_counts,
        "union_queries_per_trial": len(queried_vertices),
        "expected_queries_per_fresh_trial": str(expected_fresh_trial_queries),
        "failure_probability_per_trial": str(failure_probability),
        "expected_queries_across_restarts": str(expected_restarted_queries),
        "expected_queries_across_restarts_float": float(expected_restarted_queries),
        "failure_after_17_float": float(failure_after_17),
        "failure_after_18_float": float(failure_after_18),
        "witness_query_cap": 93 + 17 * 92,
        "fast_path_cap": 93 + 17 * 92 + 96 + 726,
        "signature_path_cap": 93 + 17 * 92 + 992 + 726,
    }


def six_direction_check():
    full_rank_probability = rank5_probability(6)
    kernel_vectors = list(range(1, 1 << 6))
    remaining = [True] * len(kernel_vectors)
    queried_vertices = set()
    expected_fresh_trial_queries = Fraction(0, 1)
    increments = []

    for omitted in range(6):
        face_mask = 0x3F ^ (1 << omitted)
        vertices = {
            value for value in range(1 << 6)
            if (value & ~face_mask) == 0
        }
        new_queries = len(queried_vertices | vertices) - len(queried_vertices)
        reach_probability = (
            1 - full_rank_probability
            + full_rank_probability * Fraction(sum(remaining), len(kernel_vectors))
        )
        expected_fresh_trial_queries += reach_probability * new_queries
        queried_vertices |= vertices
        increments.append(new_queries)
        remaining = [
            survives and ((kernel >> omitted) & 1) == 0
            for survives, kernel in zip(remaining, kernel_vectors)
        ]

    failure_probability = (
        1 - full_rank_probability
        + full_rank_probability * Fraction(sum(remaining), len(kernel_vectors))
    )
    expected_restarted_queries = (
        expected_fresh_trial_queries - failure_probability
    ) / (1 - failure_probability)

    assert full_rank_probability == Fraction(615195, 1048576)
    assert increments == [32, 16, 8, 4, 2, 1]
    assert len(queried_vertices) == 63
    assert expected_restarted_queries == Fraction(1706867, 19845)

    return {
        "rank5_probability": str(full_rank_probability),
        "new_queries_per_face": increments,
        "union_queries_per_trial": len(queried_vertices),
        "expected_queries_per_fresh_trial": str(expected_fresh_trial_queries),
        "failure_probability_per_trial": str(failure_probability),
        "expected_queries_across_restarts": str(expected_restarted_queries),
        "expected_queries_across_restarts_float": float(expected_restarted_queries),
    }


def main():
    six = six_direction_check()
    seven = seven_direction_check()
    print(json.dumps({
        "six_direction": six,
        "seven_direction": seven,
        "expected_witness_query_saving": (
            six["expected_queries_across_restarts_float"]
            - seven["expected_queries_across_restarts_float"]
        ),
        "scope": (
            "Independent exact check of the specified face orders and restart "
            "accounting; global optimality is supplied separately by the "
            "exhaustive 2^21-state C++ Bellman/Dinkelbach DP."
        ),
    }, indent=2))


if __name__ == "__main__":
    main()
