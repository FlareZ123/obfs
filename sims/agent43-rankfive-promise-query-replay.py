#!/usr/bin/env python3
"""Independent Python replay of the rank-five projected-affine query simulation.

This is a deterministic cross-language reproduction, not a cryptographic
independence proof. It uses only the Python standard library.
"""
from __future__ import annotations

import hashlib
import json
import math
from statistics import mean

MASKS = [
    0xC7639C15, 0x32E67AD1, 0xE5AB17C2, 0x4692ED7F, 0x1FA37CC9,
]
OFFSET = 0x5A9BC7E1
TABLE_TWEAK = 0x9765C3AF
SOURCE_HASH = "2b6a7b2cb348cd716e636e8e2da0817d4721a95f98bd45bbd90ffd8a5b366a9d"
TOP_COEFFICIENT = 0xB1F2257D
REPLICATES = 1000
WITNESS_TRIAL_CAP = 18
WITNESS_PROBABILITY = 24519915 / 33554432
FACE_COMPLEMENTS = (
    (0, 1), (0, 2), (0, 3), (0, 4), (0, 5),
    (1, 6), (2, 6), (3, 6), (4, 6), (5, 6),
)


def sha_word(seed: int, counter: int) -> int:
    """Match JS createHash('sha256').update(String(seed)+':'+counter)."""
    payload = f"{seed}:{counter}".encode("ascii")
    return int.from_bytes(hashlib.sha256(payload).digest()[:4], "big")


class CounterTape:
    def __init__(self, seed: int):
        self.seed = seed
        self.counter = 0

    def draw(self) -> int:
        result = sha_word(self.seed, self.counter)
        self.counter += 1
        return result


def parity32(value: int) -> int:
    value &= 0xFFFFFFFF
    value ^= value >> 16
    value ^= value >> 8
    value ^= value >> 4
    value ^= value >> 2
    value ^= value >> 1
    return value & 1


def rol32(value: int, amount: int) -> int:
    value &= 0xFFFFFFFF
    return ((value << amount) | (value >> (32 - amount))) & 0xFFFFFFFF


def make_table() -> list[int]:
    table = [
        int.from_bytes(
            hashlib.sha256(f"private-table-rank5/{index}".encode("ascii")).digest()[:4],
            "big",
        )
        for index in range(32)
    ]
    table[31] ^= TABLE_TWEAK
    return table


TABLE = make_table()


def oracle(value: int) -> int:
    x = value & 0xFFFFFFFF
    index = sum(parity32(x & mask) << bit for bit, mask in enumerate(MASKS))
    affine = rol32(x, 5) ^ rol32(x, 13)
    return (affine ^ OFFSET ^ TABLE[index]) & 0xFFFFFFFF


def source_text() -> str:
    """Recreate the exact emitted ESM source used by the HTTP fixture."""
    lines = [
        "const OBFS_PRIVATE_MASK0=0xc7639c15;",
        "const OBFS_PRIVATE_MASK1=0x32e67ad1;",
        "const OBFS_PRIVATE_MASK2=0xe5ab17c2;",
        "const OBFS_PRIVATE_MASK3=0x4692ed7f;",
        "const OBFS_PRIVATE_MASK4=0x1fa37cc9;",
    ]
    lines.extend(
        f"const OBFS_PRIVATE_T{index}={value};"
        for index, value in enumerate(TABLE)
    )
    lines.extend([
        "const OBFS_PRIVATE_OFFSET=0x5a9bc7e1;",
        "function obfsPrivateParity(x){",
        "  x^=x>>>16;x^=x>>>8;x^=x>>>4;x^=x>>>2;x^=x>>>1;",
        "  return x&1;",
        "}",
        "export async function protectedGenericFive(input){",
        "  const x=input>>>0;",
        "  const z0=obfsPrivateParity(x&OBFS_PRIVATE_MASK0);",
        "  const z1=obfsPrivateParity(x&OBFS_PRIVATE_MASK1);",
        "  const z2=obfsPrivateParity(x&OBFS_PRIVATE_MASK2);",
        "  const z3=obfsPrivateParity(x&OBFS_PRIVATE_MASK3);",
        "  const z4=obfsPrivateParity(x&OBFS_PRIVATE_MASK4);",
        "  const index=z0|(z1<<1)|(z2<<2)|(z3<<3)|(z4<<4);",
        "  const affine=((x<<5)|(x>>>27))^((x<<13)|(x>>>19));",
        "  let nonlinear=0;",
        "  switch(index){",
    ])
    lines.extend(
        f"    case {index}: nonlinear=OBFS_PRIVATE_T{index};break;"
        for index in range(32)
    )
    lines.extend([
        "  }",
        "  return (affine^OBFS_PRIVATE_OFFSET^nonlinear)>>>0;",
        "}",
        "export function publicIdentity(value){return value>>>0;}",
    ])
    return "\n".join(lines)


def gf2_rank(vectors: list[int], width: int) -> int:
    pivots = [0] * width
    rank = 0
    for value in vectors:
        row = value
        for bit in range(width - 1, -1, -1):
            if not ((row >> bit) & 1):
                continue
            if pivots[bit]:
                row ^= pivots[bit]
            else:
                pivots[bit] = row
                rank += 1
                break
    return rank


def face_subset_union_size() -> int:
    """Count distinct subset patterns queried by the ten five-faces of seven directions."""
    patterns: set[int] = set()
    for complement in FACE_COMPLEMENTS:
        face = [index for index in range(7) if index not in complement]
        for subset in range(1 << 5):
            mask = 0
            for bit, direction_index in enumerate(face):
                if (subset >> bit) & 1:
                    mask ^= 1 << direction_index
            patterns.add(mask)
    return len(patterns)


def percentile(values: list[int], p: float) -> int:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, math.floor(p * (len(ordered) - 1)))]


def simulate_one(replicate: int) -> tuple[int, int, int]:
    witness_tape = CounterTape(0x55000000 + replicate)
    cache: dict[int, int] = {}

    def ask(value: int) -> int:
        key = value & 0xFFFFFFFF
        if key not in cache:
            cache[key] = oracle(key)
        return cache[key]

    def fifth_derivative(directions: tuple[int, ...] | list[int]) -> int:
        result = 0
        for subset in range(32):
            value = 0
            for bit, direction in enumerate(directions):
                if (subset >> bit) & 1:
                    value ^= direction
            result ^= ask(value)
        return result & 0xFFFFFFFF

    anchors: list[int] | None = None
    witness = 0
    witness_trials = 0
    while witness_trials < WITNESS_TRIAL_CAP:
        directions = [witness_tape.draw() for _ in range(7)]
        found = False
        for complement in FACE_COMPLEMENTS:
            tuple_directions = [
                direction
                for index, direction in enumerate(directions)
                if index not in complement
            ]
            observed = fifth_derivative(tuple_directions)
            if observed != 0:
                anchors = tuple_directions
                witness = observed
                found = True
                break
        witness_trials += 1
        if found:
            break

    if witness == 0 or anchors is None:
        raise AssertionError(f"replicate {replicate}: unexpected witness fallback")

    def section_input(coordinate: int) -> int:
        value = 0
        for bit, anchor in enumerate(anchors):
            if (coordinate >> bit) & 1:
                value ^= anchor
        return value & 0xFFFFFFFF

    section = [ask(section_input(index)) for index in range(32)]

    # The frozen table is APN, so fixed offsets {1,2} separate every
    # nonzero quotient displacement at every section base.
    for base in range(32):
        for delta in range(1, 32):
            pair = section[base] ^ section[base ^ delta]
            along_one = pair ^ section[base ^ 1] ^ section[base ^ 1 ^ delta]
            along_two = pair ^ section[base ^ 2] ^ section[base ^ 2 ^ delta]
            if along_one == 0 and along_two == 0:
                raise AssertionError("frozen table failed fixed-pair separation")

    coordinates: list[int] = []
    corrections: list[int] = []
    for bit in range(32):
        basis = 1 << bit
        f0 = ask(basis)
        f1 = ask(basis ^ anchors[0])
        f2 = ask(basis ^ anchors[1])
        matches: list[tuple[int, int]] = []
        for candidate in range(32):
            correction = f0 ^ section[candidate]
            if (
                correction == (f1 ^ section[candidate ^ 1])
                and correction == (f2 ^ section[candidate ^ 2])
            ):
                matches.append((candidate, correction))
        if len(matches) != 1:
            raise AssertionError(
                f"replicate {replicate}, basis {bit}: expected one shift match, got {matches}"
            )
        coordinates.append(matches[0][0])
        corrections.append(matches[0][1])

    def model(value: int) -> int:
        quotient = 0
        correction = 0
        x = value & 0xFFFFFFFF
        for bit in range(32):
            if (x >> bit) & 1:
                quotient ^= coordinates[bit]
                correction ^= corrections[bit]
        return (section[quotient] ^ correction) & 0xFFFFFFFF

    # Match the 64 deterministic independent holdouts per replicate.
    holdout_tape = CounterTape(0x56000000 + replicate)
    for _ in range(64):
        value = holdout_tape.draw()
        if model(value) != oracle(value):
            raise AssertionError(f"replicate {replicate}: holdout mismatch at {value:#x}")

    return len(cache), witness_trials, len(cache)


def main() -> dict[str, object]:
    digest = hashlib.sha256(source_text().encode("utf-8")).hexdigest()
    top = 0
    for value in TABLE:
        top ^= value
    if digest != SOURCE_HASH:
        raise AssertionError(f"source hash mismatch: {digest}")
    if gf2_rank(MASKS, 32) != 5:
        raise AssertionError("projection masks are not rank five")
    if top != TOP_COEFFICIENT:
        raise AssertionError(f"top coefficient mismatch: {top:#x}")
    if math.ceil(math.log(1e-10) / math.log(1 - WITNESS_PROBABILITY)) != 18:
        raise AssertionError("unexpected seven-direction trial cap")
    face_patterns = face_subset_union_size()
    if face_patterns != 93:
        raise AssertionError(f"unexpected face subset union size: {face_patterns}")
    witness_query_cap = 1 + WITNESS_TRIAL_CAP * (face_patterns - 1)
    shift_query_cap = 32 * 3
    query_cap = witness_query_cap + shift_query_cap
    if witness_query_cap != 1657 or shift_query_cap != 96 or query_cap != 1753:
        raise AssertionError("worst-case query-cap derivation drift")

    query_counts: list[int] = []
    trial_counts: list[int] = []
    fast_query_counts: list[int] = []
    for replicate in range(REPLICATES):
        queries, trials, fast_queries = simulate_one(replicate)
        query_counts.append(queries)
        trial_counts.append(trials)
        fast_query_counts.append(fast_queries)

    summary = {
        "replicates": REPLICATES,
        "sourceHash": digest,
        "maskRank": gf2_rank(MASKS, 32),
        "tableTopCoefficient": f"0x{top:08x}",
        "meanQueries": mean(query_counts),
        "medianQueries": percentile(query_counts, 0.5),
        "p10Queries": percentile(query_counts, 0.1),
        "p90Queries": percentile(query_counts, 0.9),
        "p95Queries": percentile(query_counts, 0.95),
        "maxQueries": max(query_counts),
        "meanWitnessTrials": mean(trial_counts),
        "maxFastQueries": max(fast_query_counts),
        "faceSubsetPatternsPerTrial": face_patterns,
        "witnessQueryCap": witness_query_cap,
        "shiftQueryCap": shift_query_cap,
        "fallbacks": 0,
        "holdoutEvaluations": REPLICATES * 64,
        "queryCap": query_cap,
        "drawMethod": "deterministic SHA-256 counter tapes; reproducible replay only",
    }
    if summary["meanQueries"] != 181.861:
        raise AssertionError(f"query mean drift: {summary['meanQueries']}")
    if summary["medianQueries"] != 152:
        raise AssertionError(f"median drift: {summary['medianQueries']}")
    if summary["p90Queries"] != 266 or summary["p95Queries"] != 312:
        raise AssertionError("tail percentile drift")
    if summary["maxQueries"] != 542 or summary["meanWitnessTrials"] != 1.388:
        raise AssertionError("max/trial mean drift")
    return summary


if __name__ == "__main__":
    print(json.dumps(main(), indent=2, sort_keys=True))
