#!/usr/bin/env python3
"""Independent finite-field peer checks for Agent 2's 22 Nov reanchor report.

This file intentionally does not import repository implementations. It uses
small truth-table maps and direct GF(2) operations to replay the claims.
"""
from itertools import product, permutations
from collections import Counter
import json


def apply_columns(columns, x):
    out = 0
    for i, column in enumerate(columns):
        if (x >> i) & 1:
            out ^= column
    return out


def rank(columns, n):
    return len({apply_columns(columns, x) for x in range(1 << n)}).bit_length() - 1


def is_invertible(columns, n):
    return len({apply_columns(columns, x) for x in range(1 << n)}) == (1 << n)


def inverse_columns(columns, n):
    inverse = []
    for i in range(n):
        target = 1 << i
        preimages = [x for x in range(1 << n) if apply_columns(columns, x) == target]
        assert len(preimages) == 1
        inverse.append(preimages[0])
    return tuple(inverse)


def compatible_maps(n):
    """All triangular bijections P_i(z)=z_i XOR h_i(z_0..z_{i-1})."""
    total_bits = (1 << n) - 1
    for packed in range(1 << total_bits):
        tables = []
        offset = 0
        for i in range(n):
            width = 1 << i
            tables.append((packed >> offset) & ((1 << width) - 1))
            offset += width
        table = []
        for z in range(1 << n):
            y = z
            for i, truth_table in enumerate(tables):
                if (truth_table >> (z & ((1 << i) - 1))) & 1:
                    y ^= 1 << i
            table.append(y)
        assert len(set(table)) == (1 << n)
        yield tuple(table), tuple(tables)


def lower_unitriangular(columns, n):
    return all((columns[i] & ((1 << (i + 1)) - 1)) == (1 << i)
               for i in range(n))


def width_three_census():
    n = 3
    gl = [tuple(cols) for cols in product(range(1 << n), repeat=n)
          if is_invertible(cols, n)]
    assert len(gl) == 168
    ps = list(compatible_maps(n))
    assert len(ps) == 128
    counts = Counter()
    # The z0*z1 ANF coefficient is the parity of the four h2 truth values.
    alpha_one = sum(tables[2].bit_count() & 1 for _P, tables in ps)
    alpha_zero = len(ps) - alpha_one
    for A in gl:
        A_inv = inverse_columns(A, n)
        for P, _tables in ps:
            F = tuple(P[apply_columns(A, x)] for x in range(1 << n))
            good_anchors = 0
            for anchor in range(1 << n):
                base = F[anchor]
                M = tuple(F[anchor ^ (1 << i)] ^ base for i in range(n))
                if not is_invertible(M, n):
                    counts["singular_anchor_matrices"] += 1
                    continue
                # B=M*A^-1, with matrices represented by columns.
                B = tuple(apply_columns(M, A_inv[i]) for i in range(n))
                if lower_unitriangular(B, n):
                    good_anchors += 1
            if good_anchors == (1 << n):
                counts["all_anchors_good"] += 1
            elif good_anchors == 0:
                counts["no_anchor_good"] += 1
            else:
                counts["mixed"] += 1
    assert alpha_one == alpha_zero == 64
    assert counts["all_anchors_good"] == 19968
    assert counts["no_anchor_good"] == 1536
    assert counts["mixed"] == 0
    assert counts["singular_anchor_matrices"] == 12288
    return {
        "GL3": len(gl),
        "compatible_permutations": len(ps),
        "source_pairs": len(gl) * len(ps),
        "alpha_one_permutations": alpha_one,
        "alpha_zero_permutations": alpha_zero,
        **counts,
    }


def analytic_bad_matrix_count():
    n = 3
    gl = [tuple(cols) for cols in product(range(1 << n), repeat=n)
          if is_invertible(cols, n)]
    bad_matrices = 0
    bad_pairs = set()
    bad_pair_counts = Counter()
    for A in gl:
        # Row i of A, packed as a 3-bit vector.
        rows = tuple(sum(((A[j] >> i) & 1) << j for j in range(n))
                     for i in range(n))
        a0, a1, a2 = rows
        v_candidates = [v for v in range(1, 1 << n)
                        if ((a0 & v).bit_count() & 1) == 0
                        and ((a1 & v).bit_count() & 1) == 0]
        assert len(v_candidates) == 1
        v = v_candidates[0]
        assert ((a2 & v).bit_count() & 1) == 1
        d = a0 & a1
        if ((d & v).bit_count() & 1) == 1:
            bad_matrices += 1
            bad_pairs.add((a0, a1))
            bad_pair_counts[(a0, a1)] += 1
    assert bad_matrices == 24
    assert len(bad_pairs) == 6
    assert bad_pairs == {(3, 5), (3, 6), (5, 3), (5, 6), (6, 3), (6, 5)}
    assert set(bad_pair_counts.values()) == {4}
    return {"bad_GL3_matrices": bad_matrices,
            "bad_ordered_row_pairs": len(bad_pairs),
            "bad_pairs": sorted([list(pair) for pair in bad_pairs]),
            "valid_third_rows_per_bad_pair": sorted(set(bad_pair_counts.values())),
            "nonlinear_P_count": 64,
            "product": 64 * bad_matrices}


def common_basis_greedy(F, n, anchor):
    base = F[anchor]
    g = [F[anchor ^ u] ^ base for u in range(1 << n)]
    U = {0}
    W = {0}
    directions = []
    images = []
    while len(directions) < n:
        candidate = next((d for d in range(1 << n)
                          if d not in U and g[d] not in W), None)
        assert candidate is not None
        image = g[candidate]
        directions.append(candidate)
        images.append(image)
        U |= {u ^ candidate for u in tuple(U)}
        W |= {w ^ image for w in tuple(W)}
    assert len({apply_columns(directions, x) for x in range(1 << n)}) == (1 << n)
    assert len({apply_columns(images, x) for x in range(1 << n)}) == (1 << n)
    return directions, images


def exhaustive_common_basis_lemma():
    n = 3
    checked = 0
    for F in permutations(range(1 << n)):
        for anchor in range(1 << n):
            common_basis_greedy(F, n, anchor)
            checked += 1
    assert checked == 40320 * 8
    return {"permutations": 40320, "anchors_each": 8,
            "permutation_anchor_pairs": checked, "failures": 0}


def low_dimension_check():
    out = {}
    for n in (1, 2):
        gl = [tuple(cols) for cols in product(range(1 << n), repeat=n)
              if is_invertible(cols, n)]
        ps = list(compatible_maps(n))
        checked = 0
        for A in gl:
            A_inv = inverse_columns(A, n)
            for P, _tables in ps:
                F = tuple(P[apply_columns(A, x)] for x in range(1 << n))
                first_M = None
                for anchor in range(1 << n):
                    base = F[anchor]
                    M = tuple(F[anchor ^ (1 << i)] ^ base for i in range(n))
                    assert is_invertible(M, n)
                    B = tuple(apply_columns(M, A_inv[i]) for i in range(n))
                    assert lower_unitriangular(B, n)
                    if first_M is None:
                        first_M = M
                    else:
                        assert M == first_M  # affine map: derivative is anchor-independent
                    checked += 1
        out[str(n)] = {"GL": len(gl), "compatible_P": len(ps),
                       "anchor_checks": checked}
    return out


def singular_three_bit_witness():
    def A(x):
        return x ^ (3 if ((x >> 2) & 1) else 0)

    def P(z):
        return z ^ (4 if (z & 3) == 0 else 0)

    def F(x):
        return P(A(x))

    def Finv(y):
        return A(P(y))

    assert len({F(x) for x in range(8)}) == 8
    assert all(Finv(F(x)) == x for x in range(8))
    # Identity embedding into 32 bits preserves the dependent low-three columns.
    def F32(x):
        return P(A(x))

    for anchor in [0, 1, 2, 3, 4, 5, 6, 7,
                   0x12345678, 0x80000000, 0xffffffff]:
        base = F32(anchor)
        cols = tuple(F32(anchor ^ (1 << i)) ^ base for i in range(32))
        assert cols[0] ^ cols[1] ^ cols[2] == 0
        assert all(cols[i] == (1 << i) for i in range(3, 32))
    hidden_directions = (1, 2, 7)  # columns of A^-1 = A
    assert is_invertible(hidden_directions, 3)
    base = F(0)
    native_direction_differences = tuple(F(d) ^ base for d in hidden_directions)
    assert native_direction_differences == (5, 6, 4)
    assert lower_unitriangular(native_direction_differences, 3)
    rows = []
    for r in range(8):
        base = F(r)
        M = tuple(F(r ^ (1 << i)) ^ base for i in range(3))
        assert M[0] ^ M[1] ^ M[2] == 0
        assert rank(M, 3) == 2
        rows.append({"anchor": r, "columns": M})
    return {"all_eight_anchors_rank_2": True,
            "dependent_column_xor": 0,
            "hidden_basis_directions": hidden_directions,
            "hidden_basis_output_differences": native_direction_differences,
            "anchors": rows}


def four_bit_witness():
    A = (9, 2, 3, 12)

    def P(z):
        h1 = (1 >> (z & 1)) & 1
        h2 = (14 >> (z & 3)) & 1
        h3 = (111 >> (z & 7)) & 1
        return z ^ (h1 << 1) ^ (h2 << 2) ^ (h3 << 3)

    assert len({P(z) for z in range(16)}) == 16
    F = tuple(P(apply_columns(A, x)) for x in range(16))
    assert len(set(F)) == 16
    A_inv = inverse_columns(A, 4)
    counts = Counter()
    anchor11 = None
    for anchor in range(16):
        base = F[anchor]
        M = tuple(F[anchor ^ (1 << i)] ^ base for i in range(4))
        if not is_invertible(M, 4):
            counts["singular"] += 1
            continue
        counts["full_rank"] += 1
        B = tuple(apply_columns(M, A_inv[i]) for i in range(4))
        if lower_unitriangular(B, 4):
            counts["compatible"] += 1
        if anchor == 11:
            anchor11 = (M, B)
    assert counts == Counter({"full_rank": 8, "singular": 8, "compatible": 0})
    assert anchor11 == ((3, 10, 5, 4), (15, 10, 8, 12))
    target = F[1]
    assert target == 5
    M = anchor11[0]

    def inverse_M(y):
        return next(x for x in range(16) if apply_columns(M, x) == y)

    x = 11 ^ inverse_M(F[11] ^ target)
    trajectory = [x]
    for _ in range(3):
        x ^= inverse_M(F[x] ^ target)
        trajectory.append(x)
    assert trajectory == [14, 6, 9, 14]
    assert all(F[x] != target for x in trajectory)
    accidental = []
    for anchor in range(16):
        base = F[anchor]
        Mi = tuple(F[anchor ^ (1 << i)] ^ base for i in range(4))
        if not is_invertible(Mi, 4):
            continue
        inv = lambda y: next(x for x in range(16) if apply_columns(Mi, x) == y)
        candidate = anchor ^ inv(base ^ target)
        seen = []
        for _ in range(20):
            seen.append(candidate)
            if F[candidate] == target:
                accidental.append(anchor)
                break
            candidate ^= inv(F[candidate] ^ target)
            if candidate in seen:
                break
    assert accidental == [0, 3]
    return {"full_rank_anchors": counts["full_rank"],
            "singular_anchors": counts["singular"],
            "compatible_anchors": counts["compatible"],
            "anchor_11_M_columns": anchor11[0],
            "anchor_11_B_columns": anchor11[1],
            "target_F_1": target,
            "failed_trajectory": trajectory,
            "accidental_success_anchors_for_same_target": accidental}


def main():
    result = {
        "width_three_census": width_three_census(),
        "analytic_count": analytic_bad_matrix_count(),
        "width_one_two": low_dimension_check(),
        "common_basis_lemma": exhaustive_common_basis_lemma(),
        "three_bit_universally_singular_witness": singular_three_bit_witness(),
        "four_bit_incompatible_witness": four_bit_witness(),
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
