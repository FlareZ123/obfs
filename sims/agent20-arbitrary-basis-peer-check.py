#!/usr/bin/env python3
"""Independent exhaustive GF(2) check of Agent 2's arbitrary-basis examples.

Enumerates every ordered basis at every anchor for the width-3 and width-4
fixtures. No project helper or third-party dependency is imported.
"""
from __future__ import annotations
import json


def apply_columns(columns: list[int], value: int) -> int:
    out = 0
    for bit, column in enumerate(columns):
        if (value >> bit) & 1:
            out ^= column
    return out


def extend_basis(basis: list[int], vector: int, width: int) -> bool:
    value = vector
    for bit in range(width - 1, -1, -1):
        if not ((value >> bit) & 1):
            continue
        if basis[bit]:
            value ^= basis[bit]
        else:
            basis[bit] = value
            return True
    return False


def rank(columns: list[int], width: int) -> int:
    basis = [0] * width
    result = 0
    for column in columns:
        if extend_basis(basis, column, width):
            result += 1
    return result


def inverse_columns(columns: list[int], width: int) -> list[int]:
    rows = []
    for row in range(width):
        left = sum(((columns[col] >> row) & 1) << col for col in range(width))
        rows.append([left, 1 << row])
    for pivot in range(width):
        selected = next((r for r in range(pivot, width)
                         if (rows[r][0] >> pivot) & 1), None)
        if selected is None:
            raise ValueError("singular matrix")
        rows[pivot], rows[selected] = rows[selected], rows[pivot]
        for row in range(width):
            if row != pivot and ((rows[row][0] >> pivot) & 1):
                rows[row][0] ^= rows[pivot][0]
                rows[row][1] ^= rows[pivot][1]
    return [
        sum(((rows[row][1] >> col) & 1) << row for row in range(width))
        for col in range(width)
    ]


def all_gl_columns(width: int) -> list[list[int]]:
    matrices: list[list[int]] = []

    def visit(columns: list[int], basis: list[int]) -> None:
        if len(columns) == width:
            matrices.append(columns.copy())
            return
        for vector in range(1, 1 << width):
            candidate = basis.copy()
            if extend_basis(candidate, vector, width):
                visit(columns + [vector], candidate)

    visit([], [0] * width)
    return matrices


def lower_unitriangular(columns: list[int], width: int) -> bool:
    for index, column in enumerate(columns):
        if column & ((1 << index) - 1):
            return False
        if ((column >> index) & 1) != 1:
            return False
    return True


# Width-three compatible permutation.
A3_COLUMNS = [1, 2, 7]


def p3(value: int) -> int:
    z0, z1, z2 = value & 1, (value >> 1) & 1, (value >> 2) & 1
    return z0 | (z1 << 1) | ((z2 ^ ((1 ^ z0) & (1 ^ z1))) << 2)


def a3(value: int) -> int:
    return apply_columns(A3_COLUMNS, value)


def f3(value: int) -> int:
    return p3(a3(value))


def check_width_three() -> dict:
    gl = all_gl_columns(3)
    assert len(gl) == 168
    assert len({f3(x) for x in range(8)}) == 8
    standard_ranks = [
        rank([f3(anchor ^ (1 << bit)) ^ f3(anchor) for bit in range(3)], 3)
        for anchor in range(8)
    ]
    assert standard_ranks == [2] * 8

    per_anchor = []
    for anchor in range(8):
        hidden_anchor = a3(anchor)
        full_rank = compatible = 0
        for public_basis in gl:
            hidden_basis = [a3(direction) for direction in public_basis]
            hidden_inverse = inverse_columns(hidden_basis, 3)
            secants = [p3(hidden_anchor ^ direction) ^ p3(hidden_anchor)
                       for direction in hidden_basis]
            full_rank += rank(secants, 3) == 3
            normalized = [
                apply_columns(secants, apply_columns(hidden_inverse, 1 << bit))
                for bit in range(3)
            ]
            compatible += lower_unitriangular(normalized, 3)
        assert (full_rank, compatible) == (144, 144)
        per_anchor.append({"anchor": anchor, "full_rank": full_rank,
                           "compatible": compatible})
    return {
        "basis_count": len(gl),
        "standard_coordinate_secant_ranks": standard_ranks,
        "per_anchor": per_anchor,
        "guaranteed_lower_triangular_coset_size": 2 ** 3,
        "actual_compatible_fraction": "6/7",
    }


# Width-four compatible permutation with an arbitrary invertible input wrapper.
LIN4_COLUMNS = [9, 2, 3, 12]
P4_MASKS = [0, 1, 14, 111]


def p4(value: int) -> int:
    result = value & 15
    for index, mask in enumerate(P4_MASKS):
        prefix = value & ((1 << index) - 1)
        result ^= ((mask >> prefix) & 1) << index
    return result


def a4(value: int) -> int:
    return apply_columns(LIN4_COLUMNS, value)


def f4(value: int) -> int:
    return p4(a4(value))


def check_width_four() -> dict:
    gl = all_gl_columns(4)
    assert len(gl) == 20160
    assert len({f4(x) for x in range(16)}) == 16

    lin_inverse = inverse_columns(LIN4_COLUMNS, 4)
    anchor = 11
    standard_secants = [
        f4(anchor ^ (1 << bit)) ^ f4(anchor) for bit in range(4)
    ]
    standard_b = [
        apply_columns(standard_secants, apply_columns(lin_inverse, 1 << bit))
        for bit in range(4)
    ]
    assert standard_secants == [3, 10, 5, 4]
    assert rank(standard_secants, 4) == 4
    assert standard_b == [15, 10, 8, 12]
    assert not lower_unitriangular(standard_b, 4)

    target = f4(1)
    secant_inverse = inverse_columns(standard_secants, 4)
    candidate = anchor ^ apply_columns(
        secant_inverse, target ^ f4(anchor)
    )
    path = []
    for _ in range(3):
        observed = f4(candidate)
        path.append({"candidate": candidate, "output": observed,
                     "matches_target": observed == target})
        if observed == target:
            break
        candidate ^= apply_columns(secant_inverse, observed ^ target)
    assert target == 5
    assert candidate == 14
    assert [item["candidate"] for item in path] == [14, 6, 9]
    assert [item["output"] for item in path] == [1, 13, 9]
    assert all(not item["matches_target"] for item in path)

    per_anchor = []
    for anchor_value in range(16):
        hidden_anchor = a4(anchor_value)
        full_rank = compatible = 0
        for public_basis in gl:
            hidden_basis = [a4(direction) for direction in public_basis]
            hidden_inverse = inverse_columns(hidden_basis, 4)
            secants = [p4(hidden_anchor ^ direction) ^ p4(hidden_anchor)
                       for direction in hidden_basis]
            full_rank += rank(secants, 4) == 4
            normalized = [
                apply_columns(secants, apply_columns(hidden_inverse, 1 << bit))
                for bit in range(4)
            ]
            compatible += lower_unitriangular(normalized, 4)
        assert (full_rank, compatible) == (14400, 12480)
        per_anchor.append({"anchor": anchor_value, "full_rank": full_rank,
                           "compatible": compatible})
    return {
        "basis_count": len(gl),
        "standard_anchor_11": {
            "secant_columns": standard_secants,
            "secant_rank": 4,
            "normalized_B_columns": standard_b,
            "target": target,
            "fixed_point_cycle": path,
        },
        "per_anchor": per_anchor,
        "guaranteed_lower_triangular_coset_size": 2 ** 6,
        "actual_compatible_fraction": "13/21",
        "compatible_given_full_rank": "13/15",
    }


def main() -> None:
    result = {"width3": check_width_three(), "width4": check_width_four()}
    print("AGENT20_ARBITRARY_BASIS_PEER_CHECK " +
          json.dumps(result, sort_keys=True, separators=(",", ":")))


if __name__ == "__main__":
    main()
