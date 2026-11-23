#!/usr/bin/env python3
"""Arbitrary-input-basis reanchor experiments.

This is an empirical supplement to the fixed-coordinate reanchor study.
The attacker receives only a value oracle P (the hidden source generator is
used solely to construct experiments). A sampled ordered basis D is used to
query F(r) and F(r+d_i), form M = E D^{-1}, and try the fixed-point update.
All random-basis samples are uniform over GL(n,2), by sequentially drawing
uniform vectors outside the span of earlier columns.

The Monte Carlo family samples each triangular coordinate function h_j
uniformly from all Boolean truth tables on its j lower input bits. This is
not a claim that every obfuscator candidate has this distribution.
"""
import argparse
import itertools
import json
import math
import random
from collections import Counter


def apply_columns(columns, value):
    out = 0
    for i, column in enumerate(columns):
        if (value >> i) & 1:
            out ^= column
    return out


def reduce_vector(value, pivots, width):
    for bit in range(width - 1, -1, -1):
        if ((value >> bit) & 1) and bit in pivots:
            value ^= pivots[bit]
    return value


def add_pivot(value, pivots, width):
    reduced = reduce_vector(value, pivots, width)
    if reduced == 0:
        return False
    pivots[reduced.bit_length() - 1] = reduced
    return True


def rank_columns(columns, width):
    pivots = {}
    rank = 0
    for column in columns:
        if add_pivot(column, pivots, width):
            rank += 1
    return rank


def inverse_columns(columns, width):
    """Return columns of the inverse of an invertible column-matrix."""
    rows = []
    for i in range(width):
        left = sum(((columns[j] >> i) & 1) << j for j in range(width))
        rows.append(left | (1 << (width + i)))
    for j in range(width):
        pivot = next((i for i in range(j, width)
                      if (rows[i] >> j) & 1), None)
        if pivot is None:
            raise ValueError("singular matrix")
        rows[j], rows[pivot] = rows[pivot], rows[j]
        for i in range(width):
            if i != j and ((rows[i] >> j) & 1):
                rows[i] ^= rows[j]
    inverse_rows = [row >> width for row in rows]
    return tuple(
        sum(((inverse_rows[i] >> j) & 1) << i for i in range(width))
        for j in range(width)
    )


def is_lower_unitriangular(columns, width):
    return all(
        (columns[i] & ((1 << (i + 1)) - 1)) == (1 << i)
        for i in range(width)
    )


def random_triangular_table(width, rng):
    """Uniform random P_j(x)=x_j XOR h_j(x_0,...,x_{j-1})."""
    truth_tables = [rng.getrandbits(1 << j) for j in range(width)]
    values = []
    for x in range(1 << width):
        y = x
        for j, table in enumerate(truth_tables):
            index = x & ((1 << j) - 1)
            if (table >> index) & 1:
                y ^= 1 << j
        values.append(y)
    return values, truth_tables


def random_triangular_oracle(width, rng):
    """Generate the same uniform triangular family, evaluated on demand."""
    truth_tables = [rng.getrandbits(1 << j) for j in range(width)]

    def evaluate(x):
        y = x
        for j, table in enumerate(truth_tables):
            index = x & ((1 << j) - 1)
            if (table >> index) & 1:
                y ^= 1 << j
        return y

    return evaluate, truth_tables


def random_ordered_basis(width, rng):
    """Uniform ordered basis: each new column is uniform outside prior span."""
    pivots = {}
    columns = []
    while len(columns) < width:
        candidate = rng.getrandbits(width)
        if add_pivot(candidate, pivots, width):
            columns.append(candidate)
    return tuple(columns)


def interpolant_matrix(values, anchor, basis, width):
    base = values[anchor]
    differences = tuple(values[anchor ^ d] ^ base for d in basis)
    if rank_columns(differences, width) != width:
        return None
    basis_inverse = inverse_columns(basis, width)
    return tuple(
        apply_columns(differences, basis_inverse[j])
        for j in range(width)
    )


def reanchor_oracle_trial(oracle, width, anchor, target_input, basis):
    """One oracle-only 2n+1 upper-bound trial with no full truth-table allocation."""
    anchor_value = oracle(anchor)
    target_value = oracle(target_input)
    differences = tuple(
        oracle(anchor ^ d) ^ anchor_value for d in basis
    )
    if rank_columns(differences, width) != width:
        return False, False
    basis_inverse = inverse_columns(basis, width)
    matrix = tuple(
        apply_columns(differences, basis_inverse[j])
        for j in range(width)
    )
    matrix_inverse = inverse_columns(matrix, width)
    compatible = is_lower_unitriangular(matrix, width)
    candidate = anchor ^ apply_columns(
        matrix_inverse, anchor_value ^ target_value
    )
    for iteration in range(width):
        observed = oracle(candidate)
        if observed == target_value:
            return True, compatible
        if iteration == width - 1:
            break
        candidate ^= apply_columns(
            matrix_inverse, observed ^ target_value
        )
    return False, compatible


def compatibility_monte_carlo(width, functions, trials, seed):
    rng = random.Random(seed + width * 1000)
    rows = []
    for function_index in range(functions):
        oracle, _ = random_triangular_oracle(width, rng)
        anchor = rng.getrandbits(width)
        base = oracle(anchor)
        common = compatible = 0
        for _ in range(trials):
            basis = random_ordered_basis(width, rng)
            differences = tuple(oracle(anchor ^ d) ^ base for d in basis)
            if rank_columns(differences, width) != width:
                continue
            common += 1
            basis_inverse = inverse_columns(basis, width)
            matrix = tuple(
                apply_columns(differences, basis_inverse[j])
                for j in range(width)
            )
            if is_lower_unitriangular(matrix, width):
                compatible += 1
        rows.append({
            "function": function_index,
            "compatible": compatible,
            "common": common,
            "trials": trials,
            "compatible_rate": compatible / trials,
            "common_rate": common / trials,
            "compatible_given_common": compatible / common if common else 0.0,
        })
    return rows


def reanchor_trial(values, width, anchor, target_input, basis):
    """One oracle-only 2n+1 upper-bound trial; wrappers are normalized to I."""
    anchor_value = values[anchor]
    target_value = values[target_input]
    matrix = interpolant_matrix(values, anchor, basis, width)
    if matrix is None:
        return False, False
    matrix_inverse = inverse_columns(matrix, width)
    compatible = is_lower_unitriangular(matrix, width)
    candidate = anchor ^ apply_columns(
        matrix_inverse, anchor_value ^ target_value
    )
    for iteration in range(width):
        observed = values[candidate]
        if observed == target_value:
            return True, compatible
        if iteration == width - 1:
            break
        candidate ^= apply_columns(
            matrix_inverse, observed ^ target_value
        )
    return False, compatible


def target_success_monte_carlo(width, functions, trials, seed):
    rng = random.Random(seed + width * 5000)
    rows = []
    for function_index in range(functions):
        oracle, _ = random_triangular_oracle(width, rng)
        successes = compatible = 0
        for _ in range(trials):
            anchor = rng.getrandbits(width)
            target_input = rng.getrandbits(width)
            basis = random_ordered_basis(width, rng)
            success, is_compatible = reanchor_oracle_trial(
                oracle, width, anchor, target_input, basis
            )
            successes += int(success)
            compatible += int(is_compatible)
        rows.append({
            "function": function_index,
            "successes": successes,
            "compatible": compatible,
            "trials": trials,
            "target_success_rate": successes / trials,
            "compatible_basis_rate": compatible / trials,
        })
    return rows


def fixed_target_success_monte_carlo(width, functions, trials, seed):
    """Keep one target fixed per sampled P while varying anchor and basis."""
    rng = random.Random(seed + width * 7000)
    rows = []
    for function_index in range(functions):
        oracle, _ = random_triangular_oracle(width, rng)
        target_input = rng.getrandbits(width)
        target_value = oracle(target_input)
        successes = compatible = 0
        for _ in range(trials):
            anchor = rng.getrandbits(width)
            basis = random_ordered_basis(width, rng)
            success, is_compatible = reanchor_oracle_trial(
                oracle, width, anchor, target_input, basis
            )
            successes += int(success)
            compatible += int(is_compatible)
        rows.append({
            "function": function_index,
            "target_input": target_input,
            "target_value": target_value,
            "successes": successes,
            "compatible": compatible,
            "trials": trials,
            "target_success_rate": successes / trials,
            "compatible_basis_rate": compatible / trials,
        })
    return rows


def all_invertible_matrices(width):
    return [
        tuple(columns)
        for columns in itertools.product(range(1 << width), repeat=width)
        if rank_columns(columns, width) == width
    ]


def all_triangular_tables(width):
    total_bits = (1 << width) - 1
    for packed in range(1 << total_bits):
        tables = []
        offset = 0
        for j in range(width):
            size = 1 << j
            tables.append((packed >> offset) & ((1 << size) - 1))
            offset += size
        values = []
        for x in range(1 << width):
            y = x
            for j, table in enumerate(tables):
                if (table >> (x & ((1 << j) - 1))) & 1:
                    y ^= 1 << j
            values.append(y)
        yield values


def exact_width_three_census():
    width = 3
    matrices = all_invertible_matrices(width)
    matrix_inverses = [inverse_columns(a, width) for a in matrices]
    bases = [
        tuple(basis)
        for basis in itertools.combinations(range(1, 1 << width), width)
        if rank_columns(basis, width) == width
    ]
    basis_inverses = [inverse_columns(basis, width) for basis in bases]
    distribution = Counter()
    cases = 0
    for input_matrix, input_inverse in zip(matrices, matrix_inverses):
        for p_values in all_triangular_tables(width):
            values = [
                p_values[apply_columns(input_matrix, x)]
                for x in range(1 << width)
            ]
            for anchor in range(1 << width):
                base_value = values[anchor]
                common = compatible = 0
                for basis, basis_inverse in zip(bases, basis_inverses):
                    differences = tuple(
                        values[anchor ^ d] ^ base_value for d in basis
                    )
                    if rank_columns(differences, width) != width:
                        continue
                    common += 1
                    matrix = tuple(
                        apply_columns(differences, basis_inverse[j])
                        for j in range(width)
                    )
                    normalized = tuple(
                        apply_columns(matrix, input_inverse[j])
                        for j in range(width)
                    )
                    compatible += int(
                        is_lower_unitriangular(normalized, width)
                    )
                distribution[(compatible, common)] += 1
                cases += 1
    assert cases == 172032
    assert distribution == Counter({(24, 24): 86016, (28, 28): 86016})
    return {
        "width": width,
        "input_linear_maps": len(matrices),
        "triangular_permutations": 1 << ((1 << width) - 1),
        "anchors_per_source": 1 << width,
        "unordered_bases": len(bases),
        "source_anchor_cases": cases,
        "distribution": [
            {"compatible": key[0], "common": key[1], "cases": value}
            for key, value in sorted(distribution.items())
        ],
    }


def exact_four_bit_witness():
    width = 4
    input_matrix = (9, 2, 3, 12)
    input_inverse = inverse_columns(input_matrix, width)

    def p(z):
        h1 = (1 >> (z & 1)) & 1
        h2 = (14 >> (z & 3)) & 1
        h3 = (111 >> (z & 7)) & 1
        return z ^ (h1 << 1) ^ (h2 << 2) ^ (h3 << 3)

    values = [
        p(apply_columns(input_matrix, x))
        for x in range(1 << width)
    ]
    matrices = all_invertible_matrices(width)
    per_anchor = []
    standard = (1, 2, 4, 8)
    for anchor in range(1 << width):
        base_value = values[anchor]
        common = compatible = 0
        for basis in matrices:
            differences = tuple(
                values[anchor ^ d] ^ base_value for d in basis
            )
            if rank_columns(differences, width) != width:
                continue
            common += 1
            basis_inverse = inverse_columns(basis, width)
            matrix = tuple(
                apply_columns(differences, basis_inverse[j])
                for j in range(width)
            )
            normalized = tuple(
                apply_columns(matrix, input_inverse[j])
                for j in range(width)
            )
            compatible += int(
                is_lower_unitriangular(normalized, width)
            )
        standard_matrix = interpolant_matrix(values, anchor, standard, width)
        standard_basis_compatible = False
        if standard_matrix is not None:
            standard_normalized = tuple(
                apply_columns(standard_matrix, input_inverse[j])
                for j in range(width)
            )
            standard_basis_compatible = is_lower_unitriangular(
                standard_normalized, width
            )
        per_anchor.append({
            "anchor": anchor,
            "common_ordered_bases": common,
            "compatible_ordered_bases": compatible,
            "standard_basis_compatible": standard_basis_compatible,
        })
    assert all(
        row["common_ordered_bases"] == 14400
        and row["compatible_ordered_bases"] == 12480
        and not row["standard_basis_compatible"]
        for row in per_anchor
    )
    return {
        "width": width,
        "input_matrix": input_matrix,
        "ordered_bases": len(matrices),
        "per_anchor": per_anchor,
    }


def hidden_basis_probability_lower_bound(width):
    lower_unitriangular_count = 1 << (width * (width - 1) // 2)
    gl_order = math.prod((1 << width) - (1 << k) for k in range(width))
    return {
        "width": width,
        "lower_unitriangular_bases": lower_unitriangular_count,
        "all_ordered_bases": gl_order,
        "probability_lower_bound": lower_unitriangular_count / gl_order,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "mode",
        choices=("compat", "target", "target-fixed", "exact3", "fourbit", "lower-bound"),
    )
    parser.add_argument("--widths", nargs="*", type=int, default=[8, 12, 16])
    parser.add_argument("--functions", type=int, default=5)
    parser.add_argument("--trials", type=int, default=20000)
    parser.add_argument("--seed", type=int, default=20261124)
    args = parser.parse_args()

    if args.mode == "compat":
        result = {
            str(width): compatibility_monte_carlo(
                width, args.functions, args.trials, args.seed
            )
            for width in args.widths
        }
    elif args.mode == "target":
        result = {
            str(width): target_success_monte_carlo(
                width, args.functions, args.trials, args.seed
            )
            for width in args.widths
        }
    elif args.mode == "target-fixed":
        result = {
            str(width): fixed_target_success_monte_carlo(
                width, args.functions, args.trials, args.seed
            )
            for width in args.widths
        }
    elif args.mode == "exact3":
        result = exact_width_three_census()
    elif args.mode == "fourbit":
        result = exact_four_bit_witness()
    else:
        result = hidden_basis_probability_lower_bound(32)

    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
