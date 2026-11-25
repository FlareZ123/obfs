#!/usr/bin/env python3
"""Compare m=7 and m=8 all-trial basis query costs.

The exact coordinate model accounts for finite GF(2)^27 basis rank, retains
the per-trial injective-subset-sum cache model, and excludes accidental
cross-trial query collisions. Paired randomized replays use an OS-seeded
SHA-256 counter tape and 64 holdouts per replicate.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import secrets
import statistics
from fractions import Fraction
from pathlib import Path

M7_COMPLEMENTS = (
    (0, 1), (0, 2), (0, 3), (0, 4), (0, 5),
    (1, 6), (2, 6), (3, 6), (4, 6), (5, 6),
)
M7_TRIAL_CAP = 18


def load_sibling(filename: str, module_name: str):
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load sibling module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def rank_distribution(dimension: int, vector_count: int) -> list[Fraction]:
    probability = [Fraction(0) for _ in range(dimension + 1)]
    probability[0] = Fraction(1)
    for _ in range(vector_count):
        updated = [Fraction(0) for _ in range(dimension + 1)]
        for rank, mass in enumerate(probability):
            if not mass:
                continue
            in_span = Fraction(2**rank, 2**dimension)
            updated[rank] += mass * in_span
            if rank < dimension:
                updated[rank + 1] += mass * (1 - in_span)
        probability = updated
    assert sum(probability) == 1
    return probability


def extra_statistics(dimension: int, extra_count: int):
    final_rank = rank_distribution(dimension, extra_count)
    expected_rank = sum(
        Fraction(rank) * mass for rank, mass in enumerate(final_rank)
    )
    independent_probabilities = []
    for earlier_count in range(extra_count):
        earlier_rank = rank_distribution(dimension, earlier_count)
        independent_probabilities.append(sum(
            mass * (1 - Fraction(2**rank, 2**dimension))
            for rank, mass in enumerate(earlier_rank)
        ))
    return expected_rank, independent_probabilities


def exact_m7_expectation(checker) -> dict[str, object]:
    model = checker.build_model(7)
    sequence = checker.M7_SEQUENCE
    sequence_indices = [model["faces"].index(face) for face in sequence]
    metrics = checker.evaluate(model, sequence_indices)
    success_count = len(model["kernels"]) - metrics["rows"][-1]["remaining_kernels"]

    covered: set[int] = set()
    previous = len(model["kernels"])
    face_data = []
    for complement, row in zip(sequence, metrics["rows"]):
        face_mask = ((1 << 7) - 1) ^ sum(1 << index for index in complement)
        subset = face_mask
        while True:
            covered.add(subset)
            if subset == 0:
                break
            subset = (subset - 1) & face_mask
        anchors = [index for index in range(7) if index not in complement]
        costs = []
        for extra in complement:
            probes = (
                1 << extra,
                (1 << extra) | (1 << anchors[0]),
                (1 << extra) | (1 << anchors[1]),
            )
            costs.append(sum(probe not in covered for probe in probes))
        first_success = previous - row["remaining_kernels"]
        face_data.append((
            Fraction(first_success, success_count),
            tuple(costs),
        ))
        previous = row["remaining_kernels"]

    assert sum(probability for probability, _ in face_data) == 1
    for direction in range(7):
        assert any(direction not in complement for complement in sequence)

    miss = metrics["failure_probability"]
    by_failed_trials = {}
    for failed_trials in range(21):
        prior_rank = rank_distribution(27, 7 * failed_trials)
        conditional = Fraction(0)
        for rank, rank_mass in enumerate(prior_rank):
            if not rank_mass:
                continue
            dimension = 27 - rank
            expected_extra_rank, independent = extra_statistics(dimension, 2)
            face_cost = Fraction(0)
            for face_probability, costs in face_data:
                cost = (
                    81 - rank - 3 * expected_extra_rank
                    + sum(
                        Fraction(probes) * probability
                        for probes, probability in zip(costs, independent)
                    )
                )
                face_cost += face_probability * cost
            conditional += rank_mass * face_cost
        by_failed_trials[failed_trials] = conditional

    tail_probability = miss**21
    expected_coordinate = sum(
        (1 - miss) * (miss**k) * by_failed_trials[k]
        for k in range(21)
    ) + tail_probability * 54
    tail_error_bound = (
        tail_probability * 81 * Fraction(2**27 - 1, 2 ** (7 * 21))
    )
    expected_witness = metrics["expected_repeated_trial_queries"]
    return {
        "miss_probability": float(miss),
        "expected_failed_trials": float(miss / (1 - miss)),
        "expected_witness_queries": float(expected_witness),
        "coordinate_by_failed_trials": {
            str(k): float(value) for k, value in by_failed_trials.items()
        },
        "expected_coordinate_queries": float(expected_coordinate),
        "expected_total_queries": float(expected_witness + expected_coordinate),
        "tail_probability_at_21": float(tail_probability),
        "tail_error_bound": float(tail_error_bound),
        "successful_face_weights": [
            {
                "complement": list(complement),
                "weight_numerator": (row["remaining_kernels"] if False else 0),
            }
            for complement, row in zip(sequence, metrics["rows"])
        ],
        "model": (
            "Finite GF(2)^27 basis-rank accounting with the per-trial "
            "injective-subset-sum cache model; assumes no accidental "
            "cross-trial oracle-query collisions."
        ),
    }


def randomized_replay_m7(replicates: int, seed_hex: str) -> dict[str, object]:
    master_seed = bytes.fromhex(seed_hex)
    if len(master_seed) != 32:
        raise ValueError("--seed must be exactly 64 hexadecimal characters")

    class SeededCounterTape:
        def __init__(self, seed: int):
            self.seed = int(seed).to_bytes(8, "big")
            self.counter = 0

        def draw(self) -> int:
            payload = master_seed + self.seed + self.counter.to_bytes(8, "big")
            self.counter += 1
            return int.from_bytes(hashlib.sha256(payload).digest()[:4], "big")

    replay = load_sibling(
        "agent2-rankfive-m8-query-replay.py", "agent2_m8_replay_for_m7"
    )
    replay.CounterTape = SeededCounterTape

    def simulate_one(replicate: int, mode: str):
        tape = SeededCounterTape(0x57000000 + replicate)
        cache: dict[int, int] = {}
        trial_directions: list[list[int]] = []

        def ask(value: int) -> int:
            key = value & 0xFFFFFFFF
            if key not in cache:
                cache[key] = replay.oracle(key)
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
        while witness_trials < M7_TRIAL_CAP:
            directions = [tape.draw() for _ in range(7)]
            trial_directions.append(directions)
            found = False
            for complement in M7_COMPLEMENTS:
                face = [
                    direction
                    for index, direction in enumerate(directions)
                    if index not in complement
                ]
                observed = fifth_derivative(face)
                if observed:
                    anchors = face
                    witness = observed
                    found = True
                    break
            witness_trials += 1
            if found:
                break

        if witness == 0 or anchors is None:
            raise AssertionError(f"replicate {replicate}: m=7 witness fallback")
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
                    raise AssertionError("m=7 fixed-pair separation failed")

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
                        if replay.gf2_rank_vectors(input_basis + [candidate]) > len(input_basis):
                            input_basis.append(candidate)
            for bit in range(32):
                candidate = 1 << bit
                if replay.gf2_rank_vectors(input_basis + [candidate]) > len(input_basis):
                    input_basis.append(candidate)
                if len(input_basis) == 32:
                    break
            if len(input_basis) != 32:
                raise AssertionError("m=7 could not extend anchors to a full basis")
            first_to_recover = 5
            quotient_basis = [1 << index for index in range(5)]
            correction_basis = [0] * 5

        express = replay.build_basis_solver(input_basis)
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
                    f"replicate {replicate}, m=7 basis {basis_index}: {matches}"
                )
            quotient_basis.append(matches[0][0])
            correction_basis.append(matches[0][1])

        coordinate_queries = len(cache)

        def model_value(value: int) -> int:
            coefficients = express(value)
            quotient = 0
            correction = 0
            for index in range(32):
                if (coefficients >> index) & 1:
                    quotient ^= quotient_basis[index]
                    correction ^= correction_basis[index]
            return (section[quotient] ^ correction) & 0xFFFFFFFF

        holdout_tape = SeededCounterTape(0x58000000 + replicate)
        for _ in range(64):
            value = holdout_tape.draw()
            if model_value(value) != replay.oracle(value):
                raise AssertionError(
                    f"replicate {replicate}: m=7 holdout mismatch {value:#x}"
                )

        return (
            len(cache),
            witness_trials,
            witness_queries,
            section_queries - witness_queries,
            coordinate_queries - section_queries,
        )

    summary = {}
    for mode in ("standard", "anchor", "all-trial"):
        rows = [simulate_one(index, mode) for index in range(replicates)]
        total = [row[0] for row in rows]
        trials = [row[1] for row in rows]
        witness = [row[2] for row in rows]
        coordinate = [row[4] for row in rows]
        ordered = sorted(total)
        summary[mode] = {
            "mean_total": statistics.mean(total),
            "se_total": statistics.stdev(total) / math.sqrt(replicates),
            "mean_witness": statistics.mean(witness),
            "se_witness": statistics.stdev(witness) / math.sqrt(replicates),
            "mean_coordinate": statistics.mean(coordinate),
            "se_coordinate": statistics.stdev(coordinate) / math.sqrt(replicates),
            "mean_trials": statistics.mean(trials),
            "trial_failure_rate": sum(value > 1 for value in trials) / replicates,
            "median_total": statistics.median(total),
            "p90_total": ordered[math.floor(0.90 * (replicates - 1))],
            "p95_total": ordered[math.floor(0.95 * (replicates - 1))],
            "max_total": max(total),
        }
    return {
        "master_seed": seed_hex,
        "replicates": replicates,
        "holdouts_per_mode": replicates * 64,
        "summary": summary,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--replicates", type=int, default=10_000)
    parser.add_argument("--seed", default=None)
    args = parser.parse_args()
    if args.replicates < 2:
        parser.error("--replicates must be at least 2")

    seed = args.seed or secrets.token_hex(32)
    checker = load_sibling(
        "agent2-rankfive-eight-direction-witness.py", "agent2_rankfive_checker"
    )
    m8 = load_sibling(
        "agent2-rankfive-all-trial-basis-expectation.py", "agent2_m8_expectation"
    )
    exact7 = exact_m7_expectation(checker)
    exact8 = m8.exact_expectation()
    replay7 = randomized_replay_m7(args.replicates, seed)
    replay8 = m8.randomized_replay(args.replicates, seed)
    print(json.dumps({
        "exact_m7": exact7,
        "exact_m8": exact8,
        "m8_minus_m7_expected_total_queries": (
            exact8["expected_total_queries"] - exact7["expected_total_queries"]
        ),
        "randomized_m7": replay7,
        "randomized_m8": replay8,
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
