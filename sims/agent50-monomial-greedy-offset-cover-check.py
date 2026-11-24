#!/usr/bin/env python3
"""Reproduce the greedy offset-cover check for the rank-five monomial control.

For H[y] = 0x80000000 iff y == 31, every pair of distinct nonzero offsets
occurs as the support of some second-difference constraint. Any separating
set must hit every pair, so at least 30 of the 31 nonzero offsets are needed.
Conversely, any 30 offsets suffice. This is a deterministic table-only check,
not a runtime benchmark.
"""

from __future__ import annotations

from itertools import combinations
import json

RANK = 5
SIZE = 1 << RANK
LAST = SIZE - 1
OUTPUT_WORD = 0x80000000
TABLE = [OUTPUT_WORD if q == LAST else 0 for q in range(SIZE)]
CONSTRAINTS = [(q, delta) for q in range(SIZE) for delta in range(1, SIZE)]
ALL_MASK = (1 << len(CONSTRAINTS)) - 1
ALL_PAIRS = set(combinations(range(1, SIZE), 2))


def offset_masks() -> dict[int, int]:
    """Return one integer bitset per nonzero offset."""
    masks: dict[int, int] = {}
    for offset in range(1, SIZE):
        mask = 0
        for index, (base, delta) in enumerate(CONSTRAINTS):
            second_difference = (
                TABLE[base]
                ^ TABLE[base ^ delta]
                ^ TABLE[base ^ offset]
                ^ TABLE[base ^ delta ^ offset]
            )
            if second_difference:
                mask |= 1 << index
        masks[offset] = mask
    return masks


def greedy_cover(masks: dict[int, int]) -> tuple[list[int], int]:
    """Greedy maximum-new-coverage; deterministic ties go to smaller offsets."""
    uncovered = ALL_MASK
    remaining = set(masks)
    selected: list[int] = []
    while uncovered:
        best = max(
            remaining,
            key=lambda offset: ((masks[offset] & uncovered).bit_count(), -offset),
        )
        gain = (masks[best] & uncovered).bit_count()
        if gain == 0:
            break
        selected.append(best)
        uncovered &= ~masks[best]
        remaining.remove(best)
    return selected, uncovered.bit_count()


def verify_pair_supports() -> set[tuple[int, int]]:
    """Verify all two-element supports induced by q,q+delta != LAST."""
    supports: set[tuple[int, int]] = set()
    for base, delta in CONSTRAINTS:
        other = base ^ delta
        if base == LAST or other == LAST:
            continue
        first = LAST ^ base
        second = LAST ^ other
        supports.add(tuple(sorted((first, second))))
    return supports


def verify_every_30_offset_set_covers(masks: dict[int, int]) -> bool:
    """A 30-set is all nonzero offsets except one; verify all 31 such sets."""
    for excluded in range(1, SIZE):
        covered = 0
        for offset in range(1, SIZE):
            if offset != excluded:
                covered |= masks[offset]
        if covered != ALL_MASK:
            return False
    return True


def main() -> None:
    masks = offset_masks()
    fixed_pair_passed = (masks[1] | masks[2]) == ALL_MASK
    selected, uncovered = greedy_cover(masks)
    pair_supports = verify_pair_supports()
    every_30_set_covers = verify_every_30_offset_set_covers(masks)
    minimum_cover_size = SIZE - 2
    result = {
        "rank": RANK,
        "constraint_count": len(CONSTRAINTS),
        "fixed_pair_offsets": [1, 2],
        "fixed_pair_passed": fixed_pair_passed,
        "greedy_tie_break": "smallest offset",
        "greedy_offsets": selected,
        "greedy_offset_count": len(selected),
        "uncovered_constraints": uncovered,
        "pair_support_count": len(pair_supports),
        "all_two_element_pair_supports_present": pair_supports == ALL_PAIRS,
        "every_30_offset_set_covers": every_30_set_covers,
        "minimum_cover_proven": True,
        "minimum_cover_size": minimum_cover_size,
        "signature_probe_count_per_basis": SIZE - 1,
        "greedy_probe_count_per_basis": 1 + len(selected),
        "query_saving_vs_signature": (SIZE - 1) - (1 + len(selected)),
    }
    assert not fixed_pair_passed
    assert selected == list(range(1, SIZE - 1))
    assert uncovered == 0
    assert pair_supports == ALL_PAIRS
    assert every_30_set_covers
    assert len(selected) == minimum_cover_size
    assert result["greedy_probe_count_per_basis"] == SIZE - 1
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
