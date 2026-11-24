#!/usr/bin/env python3
"""Exhaustive n=4 check for Agent 24's sparse no-flag construction.

This is a finite validation of the 3-bit core and its n=4 extension.
The accompanying im-results proof establishes the construction for all n >= 3.
No third-party dependencies are required.
"""

from itertools import permutations


def parity(value: int) -> int:
    return value.bit_count() & 1


def rank_gf2(vectors: list[int], width: int) -> int:
    pivots: dict[int, int] = {}
    for value in vectors:
        row = value
        while row:
            pivot = row.bit_length() - 1
            if pivot in pivots:
                row ^= pivots[pivot]
            else:
                pivots[pivot] = row
                break
    return len(pivots)


def has_affine_output_component(table: list[int], width: int) -> bool:
    for mask in range(1, 1 << width):
        values = [parity(mask & table[x]) for x in range(1 << width)]
        constant = values[0]
        linear_mask = 0
        for bit in range(width):
            if values[1 << bit] ^ constant:
                linear_mask |= 1 << bit
        if all(values[x] == (constant ^ parity(linear_mask & x))
               for x in range(1 << width)):
            return True
    return False


def main() -> None:
    core = [0, 1, 2, 4, 5, 6, 3, 7]
    assert sorted(core) == list(range(8))
    assert core[0] == 0
    assert [x for x in range(8) if core[x] != x] == [3, 4, 5, 6]
    assert not has_affine_output_component(core, 3)

    core_basis = [1, 2, 4]
    assert rank_gf2(core_basis, 3) == 3
    assert rank_gf2([core[x] for x in core_basis], 3) == 3

    core_displacements = [core[x] ^ x for x in range(8) if core[x] != x]
    assert rank_gf2(core_displacements, 3) == 3

    # F0 acts as the 3-bit core on H0 = span(e1,e2,e3), identity outside.
    width = 4
    size = 1 << width
    values = [core[x] if x < 8 else x for x in range(size)]
    assert sorted(values) == list(range(size))
    support = [x for x in range(size) if values[x] != x]
    assert support == [3, 4, 5, 6]

    full_basis = [1, 2, 4, 8]
    assert rank_gf2(full_basis, width) == width
    assert rank_gf2([values[x] for x in full_basis], width) == width

    # For each h and output mask w, store the constant value of
    # parity(w & (F(x+h) ^ F(x))) over every x, or None if nonconstant.
    const_derivative = [[None] * size for _ in range(size)]
    for h in range(size):
        for mask in range(1, size):
            observed = {
                parity(mask & (values[x ^ h] ^ values[x]))
                for x in range(size)
            }
            if len(observed) == 1:
                const_derivative[h][mask] = next(iter(observed))

    def stage_has_mask(input_basis: tuple[int, ...], stage: int) -> bool:
        # U_stage is the span of the suffix basis. The stage form is 1
        # on d_stage and 0 on every later basis vector.
        constraints = []
        suffix_width = width - stage
        for coefficients in range(1 << suffix_width):
            direction = 0
            for offset in range(suffix_width):
                if (coefficients >> offset) & 1:
                    direction ^= input_basis[stage + offset]
            target = coefficients & 1
            constraints.append((direction, target))

        return any(
            all(const_derivative[direction][mask] == target
                for direction, target in constraints)
            for mask in range(1, size)
        )

    bases_checked = 0
    for candidate in permutations(range(1, size), width):
        if rank_gf2(list(candidate), width) != width:
            continue
        bases_checked += 1
        if all(stage_has_mask(candidate, stage) for stage in range(width)):
            raise AssertionError(
                f"unexpected differential flag for basis {candidate}"
            )

    assert bases_checked == 20160
    print({
        "core_has_common_basis": True,
        "core_has_affine_output_component": False,
        "core_displacement_rank": 3,
        "n4_support": support,
        "n4_common_basis": full_basis,
        "n4_output_basis": [values[x] for x in full_basis],
        "ordered_input_bases_checked": bases_checked,
        "n4_differential_flag_found": False,
    })


if __name__ == "__main__":
    main()
