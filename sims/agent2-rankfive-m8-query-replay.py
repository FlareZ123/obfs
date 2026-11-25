#!/usr/bin/env python3
"""Deterministic m=8 live query replay for standard/anchor/all-trial bases.

This is a reproducible simulation against the fixed projected-affine oracle,
not independent randomness or a runtime benchmark. Holdout queries are checked
but are not included in the oracle-query cache totals.
"""
from __future__ import annotations

import hashlib
import math
from statistics import mean

MASKS = [0xC7639C15, 0x32E67AD1, 0xE5AB17C2, 0x4692ED7F, 0x1FA37CC9]
OFFSET = 0x5A9BC7E1
TABLE_TWEAK = 0x9765C3AF
TOP_COEFFICIENT = 0xB1F2257D
REPLICATES = 1000
WIDTH = 8
WITNESS_TRIAL_CAP = 14
FACE_COMPLEMENTS = (
    (0, 1, 4), (0, 1, 3), (0, 1, 2), (0, 1, 5), (0, 1, 7),
    (1, 6, 7), (1, 3, 6), (1, 5, 6), (1, 4, 6),
    (2, 6, 7), (2, 3, 6), (2, 5, 6), (2, 4, 6), (0, 2, 6),
)


def sha_word(seed: int, counter: int) -> int:
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
    value &= 0xFFFFFFFF
    index = sum(parity32(value & mask) << bit for bit, mask in enumerate(MASKS))
    affine = rol32(value, 5) ^ rol32(value, 13)
    return (affine ^ OFFSET ^ TABLE[index]) & 0xFFFFFFFF


def gf2_rank_vectors(vectors: list[int]) -> int:
    pivots: dict[int, int] = {}
    rank = 0
    for value in vectors:
        row = value & 0xFFFFFFFF
        while row:
            pivot = row.bit_length() - 1
            if pivot in pivots:
                row ^= pivots[pivot]
            else:
                pivots[pivot] = row
                rank += 1
                break
    return rank


def build_basis_solver(basis: list[int]):
    """Return the coefficient mask of a vector in an ordered GF(2) basis."""
    pivots: dict[int, tuple[int, int]] = {}
    for index, vector in enumerate(basis):
        row = vector & 0xFFFFFFFF
        coefficients = 1 << index
        for bit in range(31, -1, -1):
            if (row >> bit) & 1:
                if bit in pivots:
                    pivot_row, pivot_coefficients = pivots[bit]
                    row ^= pivot_row
                    coefficients ^= pivot_coefficients
                else:
                    pivots[bit] = (row, coefficients)
                    break
        if row == 0:
            raise AssertionError("input basis is linearly dependent")

    def express(value: int) -> int:
        row = value & 0xFFFFFFFF
        coefficients = 0
        for bit in range(31, -1, -1):
            if (row >> bit) & 1:
                if bit not in pivots:
                    raise ValueError("vector is outside the input basis span")
                pivot_row, pivot_coefficients = pivots[bit]
                row ^= pivot_row
                coefficients ^= pivot_coefficients
        if row:
            raise ValueError("vector is outside the input basis span")
        return coefficients

    return express


def simulate_one(replicate: int, mode: str) -> tuple[int, int, int, int, int]:
    tape = CounterTape(0x55000000 + replicate)
    cache: dict[int, int] = {}
    trial_directions: list[list[int]] = []

    def ask(value: int) -> int:
        key = value & 0xFFFFFFFF
        if key not in cache:
            cache[key] = oracle(key)
        return cache[key]

    def fifth_derivative(directions: list[int]) -> int:
        result = 0
        for subset in range(32):
            value = 0
            for bit, direction in enumerate(directions):
                if (subset >> bit) & 1:
                    value ^= direction
            result ^= ask(value)
        return result & 0xFFFFFFFF

    anchors = None
    witness = 0
    witness_trials = 0
    while witness_trials < WITNESS_TRIAL_CAP:
        directions = [tape.draw() for _ in range(WIDTH)]
        trial_directions.append(directions)
        found = False
        for complement in FACE_COMPLEMENTS:
            face = [
                direction
                for index, direction in enumerate(directions)
                if index not in complement
            ]
            observed = fifth_derivative(face)
            if observed != 0:
                anchors = face
                witness = observed
                found = True
                break
        witness_trials += 1
        if found:
            break

    if witness == 0 or anchors is None:
        raise AssertionError(f"replicate {replicate}: witness fallback")

    witness_queries = len(cache)

    def section_input(coordinate: int) -> int:
        value = 0
        for bit, anchor in enumerate(anchors):
            if (coordinate >> bit) & 1:
                value ^= anchor
        return value & 0xFFFFFFFF

    section = [ask(section_input(index)) for index in range(32)]
    section_queries = len(cache)

    for base in range(32):
        for delta in range(1, 32):
            pair = section[base] ^ section[base ^ delta]
            along_one = pair ^ section[base ^ 1] ^ section[base ^ 1 ^ delta]
            along_two = pair ^ section[base ^ 2] ^ section[base ^ 2 ^ delta]
            if along_one == 0 and along_two == 0:
                raise AssertionError("fixed-pair separation failed")

    if mode == "standard":
        input_basis = [1 << bit for bit in range(32)]
        first_to_recover = 0
        quotient_basis: list[int] = []
        correction_basis: list[int] = []
    else:
        input_basis = list(anchors)
        if mode == "all-trial":
            for trial in trial_directions:
                for candidate in trial:
                    if gf2_rank_vectors(input_basis + [candidate]) > len(input_basis):
                        input_basis.append(candidate)
        for bit in range(32):
            candidate = 1 << bit
            if gf2_rank_vectors(input_basis + [candidate]) > len(input_basis):
                input_basis.append(candidate)
            if len(input_basis) == 32:
                break
        if len(input_basis) != 32:
            raise AssertionError("could not extend anchors to a full input basis")
        first_to_recover = 5
        quotient_basis = [1 << index for index in range(5)]
        correction_basis = [0] * 5

    express = build_basis_solver(input_basis)
    for basis_index in range(first_to_recover, 32):
        basis_vector = input_basis[basis_index]
        f0 = ask(basis_vector)
        f1 = ask(basis_vector ^ anchors[0])
        f2 = ask(basis_vector ^ anchors[1])
        matches = []
        for candidate in range(32):
            correction = f0 ^ section[candidate]
            if (
                correction == (f1 ^ section[candidate ^ 1])
                and correction == (f2 ^ section[candidate ^ 2])
            ):
                matches.append((candidate, correction))
        if len(matches) != 1:
            raise AssertionError(
                f"replicate {replicate}, basis {basis_index}: {matches}"
            )
        quotient_basis.append(matches[0][0])
        correction_basis.append(matches[0][1])

    coordinate_queries = len(cache)

    def model(value: int) -> int:
        coefficients = express(value)
        quotient = 0
        correction = 0
        for index in range(32):
            if (coefficients >> index) & 1:
                quotient ^= quotient_basis[index]
                correction ^= correction_basis[index]
        return (section[quotient] ^ correction) & 0xFFFFFFFF

    holdout_tape = CounterTape(0x56000000 + replicate)
    for _ in range(64):
        value = holdout_tape.draw()
        if model(value) != oracle(value):
            raise AssertionError(f"replicate {replicate}: holdout mismatch {value:#x}")

    return (
        len(cache),
        witness_trials,
        witness_queries,
        section_queries - witness_queries,
        coordinate_queries - section_queries,
    )


def percentile(values: list[int], probability: float) -> int:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, math.floor(probability * (len(ordered) - 1)))]


def main() -> dict[str, object]:
    top = 0
    for value in TABLE:
        top ^= value
    if top != TOP_COEFFICIENT:
        raise AssertionError(f"top coefficient mismatch: {top:#x}")

    patterns = set()
    for complement in FACE_COMPLEMENTS:
        face = [index for index in range(WIDTH) if index not in complement]
        for subset in range(32):
            mask = 0
            for bit, direction in enumerate(face):
                if (subset >> bit) & 1:
                    mask |= 1 << direction
            patterns.add(mask)
    if len(patterns) != 123:
        raise AssertionError(f"face union drift: {len(patterns)}")

    modes = {}
    for mode in ("standard", "anchor", "all-trial"):
        query_counts = []
        trial_counts = []
        parts = []
        for replicate in range(REPLICATES):
            queries, trials, witness, section, coordinate = simulate_one(replicate, mode)
            query_counts.append(queries)
            trial_counts.append(trials)
            parts.append((witness, section, coordinate))
        modes[mode] = {
            "meanQueries": mean(query_counts),
            "median": percentile(query_counts, 0.5),
            "p90": percentile(query_counts, 0.9),
            "p95": percentile(query_counts, 0.95),
            "max": max(query_counts),
            "meanTrials": mean(trial_counts),
            "meanWitness": mean(part[0] for part in parts),
            "meanSectionNew": mean(part[1] for part in parts),
            "meanCoordinateNew": mean(part[2] for part in parts),
        }

    return {
        "replicates": REPLICATES,
        "faceUnion": len(patterns),
        "modes": modes,
        "holdoutsPerMode": REPLICATES * 64,
        "drawMethod": "deterministic SHA-256 counter tapes; replay only",
        "oracle": "same fixed rank-five oracle constants as Agent 43 replay",
    }


if __name__ == "__main__":
    import json
    print(json.dumps(main(), indent=2, sort_keys=True))
