#!/usr/bin/env python3
"""Quantitative extension-count peer check for the common-basis lemma."""
from collections import Counter
from fractions import Fraction
from itertools import combinations, permutations
import json
import math


def apply_columns(columns, value):
    result = 0
    for index, column in enumerate(columns):
        if (value >> index) & 1:
            result ^= column
    return result


def is_basis(vectors, width):
    return len({apply_columns(vectors, x) for x in range(1 << width)}) == (1 << width)


def quantitative_bound(width):
    ordered_common = math.prod(
        (1 << width) - (1 << (k + 1)) + k + 1 for k in range(width))
    ordered_all_bases = math.prod(
        (1 << width) - (1 << k) for k in range(width))
    unordered_common = (ordered_common + math.factorial(width) - 1) // math.factorial(width)
    probability = Fraction(ordered_common, ordered_all_bases)
    return {
        "ordered_common_bases_lower_bound": ordered_common,
        "unordered_common_bases_lower_bound": unordered_common,
        "ordered_input_bases": ordered_all_bases,
        "uniform_random_basis_success_lower_bound": str(probability),
        "uniform_random_basis_success_lower_bound_decimal": float(probability),
    }


def width_three_distribution():
    width = 3
    nonzero = tuple(range(1, 1 << width))
    bases = tuple(B for B in combinations(nonzero, width) if is_basis(B, width))
    distribution = Counter()
    for image_order in permutations(nonzero):
        g = dict(zip(nonzero, image_order))
        common = sum(is_basis(tuple(g[x] for x in B), width) for B in bases)
        distribution[common] += 1
    assert len(bases) == 28
    assert distribution == Counter({21: 1344, 22: 2352, 24: 1176, 28: 168})
    assert min(distribution) == 21
    assert quantitative_bound(3)["unordered_common_bases_lower_bound"] == 21
    return {
        "all_permutations_of_nonzero_vectors": 5040,
        "input_bases_per_permutation": len(bases),
        "common_basis_count_distribution": dict(sorted(distribution.items())),
        "minimum_common_bases": min(distribution),
    }


def main():
    result = {
        "width_three_exhaustive_distribution": width_three_distribution(),
        "bound_width_3": quantitative_bound(3),
        "bound_width_4": quantitative_bound(4),
        "bound_width_5": quantitative_bound(5),
        "bound_width_32": quantitative_bound(32),
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
