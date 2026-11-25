#!/usr/bin/env python3
"""Exact finite-quotient query accounting for the m=8 all-trial basis.

The exact model accounts for GF(2)^27 basis-rank dependence across all
previous failed-trial direction vectors and the three non-anchor directions
from the successful trial. It assumes no accidental cross-trial oracle-query
collisions. The optional seeded replay uses the existing 1,000/10,000-case
behavior harness and OS-seeded SHA-256 counter tapes for reproducibility.
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

WIDTH = 8
KERNEL_COUNT = 97_155
SUCCESSFUL_KERNEL_COUNT = 90_207
MISS_PROBABILITY = Fraction(192_870_469, 1_073_741_824)
EXPECTED_WITNESS_QUERIES = Fraction(74_212_724_813, 880_871_355)
FACE_COMPLEMENTS = (
    (0, 1, 4), (0, 1, 3), (0, 1, 2), (0, 1, 5), (0, 1, 7),
    (1, 6, 7), (1, 3, 6), (1, 5, 6), (1, 4, 6),
    (2, 6, 7), (2, 3, 6), (2, 5, 6), (2, 4, 6), (0, 2, 6),
)
REMAINING_KERNELS = (
    64_387, 48_003, 39_811, 35_715, 33_667, 24_963, 20_611,
    18_435, 17_347, 11_955, 9_259, 7_911, 7_237, 6_948,
)


def rank_distribution(dimension: int, vector_count: int) -> list[Fraction]:
    """Exact rank distribution for vector_count uniform vectors in GF(2)^dimension."""
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


def three_extra_statistics(dimension: int) -> tuple[Fraction, list[Fraction]]:
    """Return E[rank of 3 extras] and each extra's probability of extending the basis."""
    final_rank = rank_distribution(dimension, 3)
    expected_rank = sum(Fraction(rank) * mass for rank, mass in enumerate(final_rank))
    independent_probabilities = []
    for earlier_count in range(3):
        earlier_rank = rank_distribution(dimension, earlier_count)
        independent = sum(
            mass * (1 - Fraction(2**rank, 2**dimension))
            for rank, mass in enumerate(earlier_rank)
        )
        independent_probabilities.append(independent)
    return expected_rank, independent_probabilities


def successful_face_data() -> list[tuple[Fraction, tuple[int, ...], tuple[int, ...]]]:
    """First-success weights and uncached shift-probe counts for each omitted triple."""
    covered: set[int] = set()
    previous = KERNEL_COUNT
    result = []
    for complement, remaining in zip(FACE_COMPLEMENTS, REMAINING_KERNELS):
        face_mask = ((1 << WIDTH) - 1) ^ sum(1 << index for index in complement)
        subset = face_mask
        while True:
            covered.add(subset)
            if subset == 0:
                break
            subset = (subset - 1) & face_mask

        anchors = [index for index in range(WIDTH) if index not in complement]
        costs = []
        for extra in complement:
            probes = (
                1 << extra,
                (1 << extra) | (1 << anchors[0]),
                (1 << extra) | (1 << anchors[1]),
            )
            costs.append(sum(probe not in covered for probe in probes))

        first_success = previous - remaining
        result.append((
            Fraction(first_success, SUCCESSFUL_KERNEL_COUNT),
            complement,
            tuple(costs),
        ))
        previous = remaining

    assert previous == 6_948
    assert sum(row[0] for row in result) == 1
    # Every trial direction is included in at least one tested face, so its
    # singleton oracle value is cached when that trial's faces are evaluated.
    for direction in range(WIDTH):
        assert any(direction not in complement for complement in FACE_COMPLEMENTS)
    return result


def coordinate_cost_given_failed_trials(
    failed_trials: int,
    face_data: list[tuple[Fraction, tuple[int, ...], tuple[int, ...]]],
) -> Fraction:
    """Expected coordinate probes conditional on k failed trials before success."""
    prior_rank_distribution = rank_distribution(27, 8 * failed_trials)
    expected = Fraction(0)
    for prior_rank, rank_mass in enumerate(prior_rank_distribution):
        if not rank_mass:
            continue
        remaining_dimension = 27 - prior_rank
        expected_extra_rank, extra_independent = three_extra_statistics(remaining_dimension)
        face_cost = Fraction(0)
        for face_probability, _complement, uncached_extra_probes in face_data:
            # 5 anchors + prior_rank prior-trial vectors + expected current extras;
            # remaining standard-basis vectors each cost 3 probes. Every appended
            # prior-trial vector costs 2 because its singleton value is already cached.
            cost = (
                81
                - prior_rank
                - 3 * expected_extra_rank
                + sum(
                    Fraction(probes) * independent
                    for probes, independent in zip(
                        uncached_extra_probes, extra_independent
                    )
                )
            )
            face_cost += face_probability * cost
        expected += rank_mass * face_cost
    return expected


def exact_expectation() -> dict[str, object]:
    """Evaluate the geometric failed-trial mixture with finite GF(2)^27 ranks."""
    face_data = successful_face_data()
    by_failed_trials = {
        k: coordinate_cost_given_failed_trials(k, face_data)
        for k in range(17)
    }
    miss = MISS_PROBABILITY
    success = 1 - miss
    # For k >= 17 there are at least 136 prior random vectors in GF(2)^27.
    # Rank failure is at most (2^27-1)/2^136; replacing the tail cost by 54
    # therefore contributes less than the explicit bound below.
    tail_probability = miss**17
    coordinate = sum(
        success * (miss**k) * by_failed_trials[k]
        for k in range(17)
    ) + tail_probability * 54
    tail_error_bound = (
        tail_probability
        * 81
        * Fraction(2**27 - 1, 2 ** (8 * 17))
    )
    total = EXPECTED_WITNESS_QUERIES + coordinate
    return {
        "miss_probability": float(miss),
        "expected_failed_trials": float(miss / success),
        "expected_witness_queries": float(EXPECTED_WITNESS_QUERIES),
        "coordinate_by_failed_trials": {
            str(k): float(value) for k, value in by_failed_trials.items()
        },
        "expected_coordinate_queries": float(coordinate),
        "expected_total_queries": float(total),
        "anchor_only_coordinate_baseline": 81,
        "expected_coordinate_saving_vs_anchor_only": float(81 - coordinate),
        "expected_extra_saving_vs_successful_trial_only": float(
            Fraction(7_100_804, 90_207) - coordinate
        ),
        "tail_probability_at_17": float(tail_probability),
        "tail_error_bound": float(tail_error_bound),
        "model": (
            "Exact finite GF(2)^27 basis-rank accounting; assumes no accidental "
            "cross-trial oracle-query collisions."
        ),
    }


def load_replay_module():
    path = Path(__file__).with_name("agent2-rankfive-m8-query-replay.py")
    spec = importlib.util.spec_from_file_location("agent2_m8_query_replay", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load replay module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def randomized_replay(replicates: int, seed_hex: str) -> dict[str, object]:
    """Run paired standard/anchor/all-trial replays from a reproducible OS seed."""
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

    replay = load_replay_module()
    replay.CounterTape = SeededCounterTape
    summary = {}
    for mode in ("standard", "anchor", "all-trial"):
        rows = [replay.simulate_one(index, mode) for index in range(replicates)]
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
    parser.add_argument(
        "--seed",
        default=None,
        help="64-hex OS seed; omitted means generate and print a fresh seed",
    )
    args = parser.parse_args()
    if args.replicates < 2:
        parser.error("--replicates must be at least 2")
    seed = args.seed or secrets.token_hex(32)
    output = {
        "exact": exact_expectation(),
        "randomized_replay": randomized_replay(args.replicates, seed),
    }
    print(json.dumps(output, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
