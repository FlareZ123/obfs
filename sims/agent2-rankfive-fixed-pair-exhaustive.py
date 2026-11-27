#!/usr/bin/env python3
"""Exhaustively check the rank-five fixed-pair shift condition for the exact PR #373 table."""
from __future__ import annotations

import hashlib
import json

MASKS = [
    0xC7639C15,
    0x32E67AD1,
    0xE5AB17C2,
    0x4692ED7F,
    0x1FA37CC9,
]
TABLE_XOR = 0x9765C3AF
RANK = 5
SIZE = 1 << RANK


def gf2_rank(vectors: list[int], width: int = 32) -> int:
    pivots = [0] * width
    rank = 0
    for value in vectors:
        x = value & 0xFFFFFFFF
        for bit in range(width - 1, -1, -1):
            if ((x >> bit) & 1) == 0:
                continue
            if pivots[bit]:
                x ^= pivots[bit]
            else:
                pivots[bit] = x
                rank += 1
                break
    return rank


def private_table() -> list[int]:
    values = [
        int.from_bytes(
            hashlib.sha256(f"private-table-rank5/{i}".encode("ascii")).digest()[:4],
            "big",
        )
        for i in range(SIZE)
    ]
    values[31] ^= TABLE_XOR
    return values


def private_source(table: list[int]) -> str:
    """Reproduce the exact privateSource() string from the pinned HTTP harness."""
    lines = [
        'const OBFS_PRIVATE_MASK0=0xc7639c15;',
        'const OBFS_PRIVATE_MASK1=0x32e67ad1;',
        'const OBFS_PRIVATE_MASK2=0xe5ab17c2;',
        'const OBFS_PRIVATE_MASK3=0x4692ed7f;',
        'const OBFS_PRIVATE_MASK4=0x1fa37cc9;',
        *[f'const OBFS_PRIVATE_T{i}={value};' for i, value in enumerate(table)],
        'const OBFS_PRIVATE_OFFSET=0x5a9bc7e1;',
        'function obfsPrivateParity(x){',
        '  x^=x>>>16;x^=x>>>8;x^=x>>>4;x^=x>>>2;x^=x>>>1;',
        '  return x&1;',
        '}',
        'export async function protectedGenericFive(input){',
        '  const x=input>>>0;',
        '  const z0=obfsPrivateParity(x&OBFS_PRIVATE_MASK0);',
        '  const z1=obfsPrivateParity(x&OBFS_PRIVATE_MASK1);',
        '  const z2=obfsPrivateParity(x&OBFS_PRIVATE_MASK2);',
        '  const z3=obfsPrivateParity(x&OBFS_PRIVATE_MASK3);',
        '  const z4=obfsPrivateParity(x&OBFS_PRIVATE_MASK4);',
        '  const index=z0|(z1<<1)|(z2<<2)|(z3<<3)|(z4<<4);',
        '  const affine=((x<<5)|(x>>>27))^((x<<13)|(x>>>19));',
        '  let nonlinear=0;',
        '  switch(index){',
        *[f'    case {i}: nonlinear=OBFS_PRIVATE_T{i};break;' for i in range(SIZE)],
        '  }',
        '  return (affine^OBFS_PRIVATE_OFFSET^nonlinear)>>>0;',
        '}',
        'export function publicIdentity(value){return value>>>0;}',
    ]
    return "\n".join(lines)


def check_exact_second_difference_zeros(table: list[int]) -> int:
    """For every q,delta!=0, the only nonzero u with D_u D_delta H(q)=0 is u=delta."""
    checks = 0
    for q in range(SIZE):
        for delta in range(1, SIZE):
            for u in range(1, SIZE):
                if u == delta:
                    continue
                value = (
                    table[q]
                    ^ table[q ^ delta]
                    ^ table[q ^ u]
                    ^ table[q ^ u ^ delta]
                )
                checks += 1
                if value == 0:
                    raise AssertionError(
                        f"extra second-difference zero: q={q}, delta={delta}, u={u}"
                    )
    return checks


def check_differential_uniformity(table: list[int]) -> int:
    """For each nonzero delta, every derivative value must occur exactly twice."""
    derivative_value_checks = 0
    for delta in range(1, SIZE):
        counts: dict[int, int] = {}
        for q in range(SIZE):
            value = table[q] ^ table[q ^ delta]
            counts[value] = counts.get(value, 0) + 1
            derivative_value_checks += 1
        assert len(counts) == SIZE // 2
        assert set(counts.values()) == {2}
    return derivative_value_checks


def fixed_pair_failures(table: list[int]) -> tuple[int, int]:
    """Check all ordered independent (u,v), all q, and all nonzero delta."""
    pair_count = 0
    tested_constraints = 0
    for u in range(1, SIZE):
        for v in range(1, SIZE):
            if v == u:
                continue  # Over F2, distinct nonzero vectors are independent.
            pair_count += 1
            for q in range(SIZE):
                for delta in range(1, SIZE):
                    along_u = (
                        table[q]
                        ^ table[q ^ delta]
                        ^ table[q ^ u]
                        ^ table[q ^ u ^ delta]
                    )
                    along_v = (
                        table[q]
                        ^ table[q ^ delta]
                        ^ table[q ^ v]
                        ^ table[q ^ v ^ delta]
                    )
                    tested_constraints += 1
                    if along_u == 0 and along_v == 0:
                        raise AssertionError(
                            f"fixed-pair failure: u={u}, v={v}, q={q}, delta={delta}"
                        )
    return pair_count, tested_constraints


def main() -> None:
    table = private_table()
    top = 0
    for value in table:
        top ^= value
    assert gf2_rank(MASKS) == RANK
    assert top == 0xB1F2257D
    source = private_source(table)
    source_sha256 = hashlib.sha256(source.encode("utf-8")).hexdigest()
    assert source_sha256 == "2b6a7b2cb348cd716e636e8e2da0817d4721a95f98bd45bbd90ffd8a5b366a9d"

    derivative_value_checks = check_differential_uniformity(table)
    exact_zero_checks = check_exact_second_difference_zeros(table)
    pair_count, tested_constraints = fixed_pair_failures(table)
    assert derivative_value_checks == SIZE * (SIZE - 1)
    assert exact_zero_checks == SIZE * (SIZE - 1) * (SIZE - 2)
    assert pair_count == 930
    assert tested_constraints == 930 * SIZE * (SIZE - 1)
    print(json.dumps({
        "rank": RANK,
        "projection_mask_rank": gf2_rank(MASKS),
        "table_top_coefficient": f"0x{top:08x}",
        "source_sha256": source_sha256,
        "source_length": len(source),
        "derivative_value_checks": derivative_value_checks,
        "differential_uniformity": 2,
        "distinct_derivative_values_per_nonzero_delta": SIZE // 2,
        "nontrivial_second_difference_checks": exact_zero_checks,
        "only_nonzero_zero_offset_is_delta": True,
        "ordered_independent_offset_pairs": pair_count,
        "basepoint_shift_constraints_checked": tested_constraints,
        "fixed_pair_violations": 0,
        "conclusion": "the exact source table passes for every possible first-two-anchor pair",
    }, indent=2))


if __name__ == "__main__":
    main()
