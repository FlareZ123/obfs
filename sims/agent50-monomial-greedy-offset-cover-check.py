#!/usr/bin/env python3
"""Reproduce the greedy offset-cover check for the rank-five monomial control.

For this table the minimum separating-set size is exactly 30: every pair of
distinct nonzero offsets occurs as a second-difference support, so any cover
must hit every pair. Any 30 offsets suffice. This does not measure runtime.
"""

from __future__ import annotations

import json

RANK = 5
SIZE = 1 << RANK
OUTPUT_WORD = 0x80000000
TABLE = [OUTPUT_WORD if q == SIZE - 1 else 0 for q in range(SIZE)]
CONSTRAINTS = [(q, delta) for q in range(SIZE) for delta in range(1, SIZE)]
ALL_MASK = (1 << len(CONSTRAINTS)) - 1


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


def main() -> None:
    masks = offset_masks()
    fixed_pair_passed = (masks[1] | masks[2]) == ALL_MASK
    selected, uncovered = greedy_cover(masks)
    result = {
        "rank": RANK,
        "constraint_count": len(CONSTRAINTS),
        "fixed_pair_offsets": [1, 2],
        "fixed_pair_passed": fixed_pair_passed,
        "greedy_tie_break": "smallest offset",
        "greedy_offsets": selected,
        "greedy_offset_count": len(selected),
        "uncovered_constraints": uncovered,
        "signature_probe_count_per_basis": SIZE - 1,
        "greedy_probe_count_per_basis": 1 + len(selected),
        "query_saving_vs_signature": (SIZE - 1) - (1 + len(selected)),
        "minimum_cover_proven": True,
        "minimum_cover_size": SIZE - 2,
        "minimum_cover_argument": "Every two-element subset of nonzero offsets occurs as a support; a hitting set must leave at most one offset outside it.",
    }
    assert not fixed_pair_passed
    assert selected == list(range(1, SIZE - 1))
    assert uncovered == 0
    assert result["greedy_probe_count_per_basis"] == SIZE - 1
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
