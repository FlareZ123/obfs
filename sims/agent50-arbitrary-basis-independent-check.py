#!/usr/bin/env python3
"""Independent exhaustive GL(3,2)/GL(4,2) basis check for reanchor fixtures."""
import json


def apply_cols(cols, value):
    out = 0
    for bit, col in enumerate(cols):
        if (value >> bit) & 1:
            out ^= col
    return out


def extend(basis, value, width):
    for bit in range(width - 1, -1, -1):
        if not ((value >> bit) & 1):
            continue
        if basis[bit]:
            value ^= basis[bit]
        else:
            basis[bit] = value
            return True
    return False


def rank(cols, width):
    basis = [0] * width
    return sum(extend(basis, col, width) for col in cols)


def inverse(cols, width):
    rows = []
    for row in range(width):
        left = sum(((cols[col] >> row) & 1) << col for col in range(width))
        rows.append([left, 1 << row])
    for pivot in range(width):
        selected = next((i for i in range(pivot, width)
                         if (rows[i][0] >> pivot) & 1), None)
        if selected is None:
            raise ValueError("singular")
        rows[pivot], rows[selected] = rows[selected], rows[pivot]
        for i in range(width):
            if i != pivot and ((rows[i][0] >> pivot) & 1):
                rows[i][0] ^= rows[pivot][0]
                rows[i][1] ^= rows[pivot][1]
    return [sum(((rows[row][1] >> col) & 1) << row
                for row in range(width)) for col in range(width)]


def all_gl(width):
    result = []

    def visit(columns, basis):
        if len(columns) == width:
            result.append(columns[:])
            return
        for vector in range(1, 1 << width):
            next_basis = basis[:]
            if extend(next_basis, vector, width):
                visit(columns + [vector], next_basis)

    visit([], [0] * width)
    return result


def lower_unitriangular(cols, width):
    for i, col in enumerate(cols):
        if col & ((1 << i) - 1) or not ((col >> i) & 1):
            return False
    return True


A3 = [1, 2, 7]


def p3(x):
    z0, z1, z2 = x & 1, (x >> 1) & 1, (x >> 2) & 1
    return z0 | (z1 << 1) | ((z2 ^ ((1 ^ z0) & (1 ^ z1))) << 2)


def a3(x):
    return apply_cols(A3, x)


A4 = [9, 2, 3, 12]
MASKS4 = [0, 1, 14, 111]


def p4(x):
    out = x & 15
    for bit, mask in enumerate(MASKS4):
        out ^= ((mask >> (x & ((1 << bit) - 1))) & 1) << bit
    return out


def a4(x):
    return apply_cols(A4, x)


def enumerate_fixture(width, gl, input_map, permutation):
    counts = []
    for anchor in range(1 << width):
        hidden_anchor = input_map(anchor)
        full_rank = compatible = 0
        for public_basis in gl:
            hidden_basis = [input_map(v) for v in public_basis]
            hidden_inverse = inverse(hidden_basis, width)
            secants = [permutation(hidden_anchor ^ v) ^ permutation(hidden_anchor)
                       for v in hidden_basis]
            full_rank += rank(secants, width) == width
            normalized = [apply_cols(secants, apply_cols(hidden_inverse, 1 << i))
                          for i in range(width)]
            compatible += lower_unitriangular(normalized, width)
        counts.append((full_rank, compatible))
    return counts


def main():
    gl3 = all_gl(3)
    counts3 = enumerate_fixture(3, gl3, a3, p3)
    assert len(gl3) == 168
    assert counts3 == [(144, 144)] * 8

    gl4 = all_gl(4)
    counts4 = enumerate_fixture(4, gl4, a4, p4)
    assert len(gl4) == 20160
    assert counts4 == [(14400, 12480)] * 16

    result = {
        "result": "PASS",
        "width3": {"ordered_bases": len(gl3), "per_anchor_full_rank_compatible": counts3},
        "width4": {"ordered_bases": len(gl4), "per_anchor_full_rank_compatible": counts4},
        "interpretation": "fixed-coordinate counterexamples do not imply all-basis failure; counts are fixture-specific",
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
