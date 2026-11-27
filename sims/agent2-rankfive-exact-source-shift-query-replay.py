#!/usr/bin/env python3
"""Deterministic paired query-count replay for the frozen PR #373 rank-five source."""
from __future__ import annotations

import hashlib
import json
import random
import statistics

MASKS = [0xC7639C15, 0x32E67AD1, 0xE5AB17C2, 0x4692ED7F, 0x1FA37CC9]
TABLE_XOR = 0x9765C3AF
OFFSET = 0x5A9BC7E1
U32 = 0xFFFFFFFF
RANK = 5
SIZE = 1 << RANK
VERIFY_SAMPLES = 726
REPLICATES = 100
SOURCE_SHA256 = "2b6a7b2cb348cd716e636e8e2da0817d4721a95f98bd45bbd90ffd8a5b366a9d"


def private_table() -> list[int]:
    values = [
        int.from_bytes(hashlib.sha256(f"private-table-rank5/{i}".encode("ascii")).digest()[:4], "big")
        for i in range(SIZE)
    ]
    values[31] ^= TABLE_XOR
    return values


TABLE = private_table()


def rotl32(value: int, amount: int) -> int:
    value &= U32
    return ((value << amount) | (value >> (32 - amount))) & U32


def oracle(value: int) -> int:
    x = value & U32
    index = 0
    for bit, mask in enumerate(MASKS):
        index |= ((x & mask).bit_count() & 1) << bit
    affine = rotl32(x, 5) ^ rotl32(x, 13)
    return (affine ^ OFFSET ^ TABLE[index]) & U32


def ask_factory(cache: dict[int, int]):
    def ask(value: int) -> int:
        x = value & U32
        if x not in cache:
            cache[x] = oracle(x)
        return cache[x]
    return ask


def derivative(directions: list[int], ask) -> int:
    result = 0
    for subset in range(1 << len(directions)):
        point = 0
        for bit, direction in enumerate(directions):
            if (subset >> bit) & 1:
                point ^= direction
        result ^= ask(point)
    return result & U32


def learn(seed: int, strategy: str) -> tuple[int, int]:
    witness_rng = random.Random(seed)
    verify_rng = random.Random(seed + 0x70000000)
    cache: dict[int, int] = {}
    ask = ask_factory(cache)

    witness = 0
    anchors = None
    witness_trials = 0
    for trial in range(27):
        directions = [witness_rng.getrandbits(32) for _ in range(6)]
        for omitted in range(6):
            face = [d for i, d in enumerate(directions) if i != omitted]
            observed = derivative(face, ask)
            if observed:
                witness = observed
                anchors = face
                witness_trials = trial + 1
                break
        if witness:
            break
        witness_trials = trial + 1
    if not witness or anchors is None:
        raise RuntimeError("witness cap exhausted; this replay only measures the fast path")

    # The successful witness face already contains all 32 section-table points.
    section = []
    for y in range(SIZE):
        point = 0
        for bit, anchor in enumerate(anchors):
            if (y >> bit) & 1:
                point ^= anchor
        section.append(ask(point))

    coordinates: list[int] = []
    corrections: list[int] = []
    for bit in range(32):
        basis = 1 << bit
        if strategy == "signature":
            quotient = 0
            for omitted in range(RANK):
                directions = [basis] + [a for i, a in enumerate(anchors) if i != omitted]
                observed = derivative(directions, ask)
                if observed not in (0, witness):
                    raise RuntimeError("signature overflow; source promise violated")
                if observed == witness:
                    quotient |= 1 << omitted
        elif strategy == "shift":
            f0 = ask(basis)
            f1 = ask(basis ^ anchors[0])
            f2 = ask(basis ^ anchors[1])
            candidates = []
            for quotient in range(SIZE):
                l0 = f0 ^ section[quotient]
                l1 = f1 ^ section[quotient ^ 1]
                l2 = f2 ^ section[quotient ^ 2]
                if l0 == l1 == l2:
                    candidates.append((quotient, l0))
            if len(candidates) != 1:
                raise RuntimeError(f"shift ambiguity: bit={bit}, candidates={len(candidates)}")
            quotient, correction = candidates[0]
            coordinates.append(quotient)
            corrections.append(correction)
            continue
        else:
            raise ValueError(strategy)
        coordinates.append(quotient)
        corrections.append(ask(basis) ^ section[quotient])

    def model(value: int) -> int:
        x = value & U32
        quotient = 0
        linear = 0
        for bit in range(32):
            if (x >> bit) & 1:
                quotient ^= coordinates[bit]
                linear ^= corrections[bit]
        return (section[quotient] ^ linear) & U32

    for _ in range(VERIFY_SAMPLES):
        point = verify_rng.getrandbits(32)
        if ask(point) != model(point):
            raise RuntimeError("postfit verifier mismatch")

    return len(cache), witness_trials


def main() -> None:
    table_xor = 0
    for value in TABLE:
        table_xor ^= value
    assert table_xor == 0xB1F2257D

    # Reconstruct and pin the source string used by the HTTP harness.
    lines = [
        'const OBFS_PRIVATE_MASK0=0xc7639c15;',
        'const OBFS_PRIVATE_MASK1=0x32e67ad1;',
        'const OBFS_PRIVATE_MASK2=0xe5ab17c2;',
        'const OBFS_PRIVATE_MASK3=0x4692ed7f;',
        'const OBFS_PRIVATE_MASK4=0x1fa37cc9;',
        *[f'const OBFS_PRIVATE_T{i}={value};' for i, value in enumerate(TABLE)],
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
    source = "\n".join(lines)
    source_hash = hashlib.sha256(source.encode("utf-8")).hexdigest()
    assert source_hash == SOURCE_SHA256

    signature = []
    shift = []
    for replicate in range(REPLICATES):
        seed = 0xA5000000 + replicate
        signature.append(learn(seed, "signature"))
        shift.append(learn(seed, "shift"))
    savings = [a[0] - b[0] for a, b in zip(signature, shift)]
    assert all(value == 896 for value in savings)

    print(json.dumps({
        "source_sha256": source_hash,
        "source_top_coefficient": f"0x{table_xor:08x}",
        "replicates": REPLICATES,
        "verify_samples_per_run": VERIFY_SAMPLES,
        "signature_mean_distinct_queries": statistics.mean(x[0] for x in signature),
        "shift_mean_distinct_queries": statistics.mean(x[0] for x in shift),
        "mean_distinct_queries_saved": statistics.mean(savings),
        "min_distinct_queries_saved": min(savings),
        "max_distinct_queries_saved": max(savings),
        "witness_trials_mean": statistics.mean(x[1] for x in signature),
        "witness_trials_max": max(x[1] for x in signature),
        "matched_random_tapes": True,
        "note": "deterministic Python reference replay; not CSPRNG, Node learner, or HTTP evidence",
    }, indent=2))


if __name__ == "__main__":
    main()
