#!/usr/bin/env python3
"""Exact best-anchor-pair full-path comparison for the current m=7 and m=8 policies.

For each basis vector, the learner may choose any two of the five successful
anchors. The selected pair minimizes new oracle queries. The current-trial
extras are processed in ascending cache-cost order, assigning the highest
basis-extension probability to the cheapest extra.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import itertools
import json
import math
import secrets
import statistics
from fractions import Fraction
from pathlib import Path

M8_FACE_SET = (
    (0, 1, 4), (0, 1, 3), (0, 1, 2), (0, 1, 5), (0, 1, 7),
    (1, 6, 7), (1, 3, 6), (1, 5, 6), (1, 4, 6),
    (2, 6, 7), (2, 3, 6), (2, 5, 6), (2, 4, 6), (0, 2, 6),
)
M7_TRIAL_CAP = 18
M8_TRIAL_CAP = 14
MASK32 = (1 << 32) - 1


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
    independent = []
    for earlier_count in range(extra_count):
        earlier = rank_distribution(dimension, earlier_count)
        independent.append(sum(
            mass * (1 - Fraction(2**rank, 2**dimension))
            for rank, mass in enumerate(earlier)
        ))
    return expected_rank, independent


def exact_coefficients(m: int, extra_count: int, miss: Fraction, kmax: int):
    a_values = []
    beta_values = [[] for _ in range(extra_count)]
    for failed_trials in range(kmax + 1):
        prior = rank_distribution(27, m * failed_trials)
        a = Fraction(0)
        beta = [Fraction(0) for _ in range(extra_count)]
        for rank, mass in enumerate(prior):
            if not mass:
                continue
            dimension = 27 - rank
            expected_extra_rank, independent = extra_statistics(
                dimension, extra_count
            )
            a += mass * (81 - rank - 3 * expected_extra_rank)
            for j in range(extra_count):
                beta[j] += mass * independent[j]
        a_values.append(a)
        for j in range(extra_count):
            beta_values[j].append(beta[j])

    base = Fraction(0)
    beta_total = [Fraction(0) for _ in range(extra_count)]
    for failed_trials in range(kmax + 1):
        weight = (1 - miss) * (miss**failed_trials)
        base += weight * a_values[failed_trials]
        for j in range(extra_count):
            beta_total[j] += weight * beta_values[j][failed_trials]
    base += (miss ** (kmax + 1)) * 54
    return base, beta_total


def best_pair_probe_sets(model, face_index: int):
    complement = model["faces"][face_index]
    anchors = [i for i in range(model["m"]) if i not in complement]
    output = []
    for extra in complement:
        pairs = []
        for p, q in itertools.combinations(anchors, 2):
            pairs.append((
                1 << extra,
                (1 << extra) | (1 << p),
                (1 << extra) | (1 << q),
            ))
        output.append(pairs)
    return output


def exact_order_dp(model, face_set, m: int, extra_count: int, kmax: int):
    face_indices = [model["faces"].index(face) for face in face_set]
    face_count = len(face_indices)
    states = 1 << face_count
    kernel_count = len(model["kernels"])
    all_kernels = (1 << kernel_count) - 1
    p_rank5 = model["p"]

    remaining = [0] * states
    covered = [0] * states
    remaining[0] = all_kernels
    for mask in range(1, states):
        bit = mask & -mask
        local_index = bit.bit_length() - 1
        previous = mask ^ bit
        face_index = face_indices[local_index]
        remaining[mask] = remaining[previous] & model["fail_masks"][face_index]
        covered[mask] = covered[previous] | model["cover_masks"][face_index]

    remaining_count = [value.bit_count() for value in remaining]
    covered_count = [value.bit_count() for value in covered]
    final_remaining = remaining_count[-1]
    miss = 1 - p_rank5 + p_rank5 * Fraction(final_remaining, kernel_count)
    successful_kernels = kernel_count - final_remaining
    if successful_kernels <= 0:
        raise ValueError("face set has no successful kernels")

    base_coordinate, beta = exact_coefficients(m, extra_count, miss, kmax)
    probes = [
        best_pair_probe_sets(model, face_index)
        for face_index in face_indices
    ]

    dp: list[Fraction | None] = [None] * states
    parent: list[tuple[int, int] | None] = [None] * states
    dp[0] = Fraction(0)
    for mask in range(states):
        if dp[mask] is None:
            continue
        reach = 1 - p_rank5 + p_rank5 * Fraction(
            remaining_count[mask], kernel_count
        )
        for local_index in range(face_count):
            bit = 1 << local_index
            if mask & bit:
                continue
            next_mask = mask | bit
            new_queries = covered_count[next_mask] - covered_count[mask]
            newly_succeeded = (
                remaining_count[mask] - remaining_count[next_mask]
            )
            current_cache = covered[next_mask]
            costs = []
            for extra_index in range(extra_count):
                costs.append(min(
                    sum(not ((current_cache >> query_mask) & 1) for query_mask in pair)
                    for pair in probes[local_index][extra_index]
                ))
            costs.sort()
            coordinate_transition = (
                (1 - miss)
                * Fraction(newly_succeeded, successful_kernels)
                * sum(beta[j] * costs[j] for j in range(extra_count))
            )
            candidate = dp[mask] + reach * new_queries + coordinate_transition
            if dp[next_mask] is None or candidate < dp[next_mask]:
                dp[next_mask] = candidate
                parent[next_mask] = (mask, local_index)

    full = states - 1
    total = (dp[full] - miss + (1 - miss) * base_coordinate) / (1 - miss)
    order_indices = []
    mask = full
    while mask:
        previous, local_index = parent[mask]
        order_indices.append(face_indices[local_index])
        mask = previous
    order_indices.reverse()
    order = [model["faces"][index] for index in order_indices]
    return {
        "total": total,
        "miss": miss,
        "remaining_kernels": final_remaining,
        "base_coordinate": base_coordinate,
        "beta": beta,
        "order": order,
    }


def face_data_for_order(model, order):
    width = model["m"]
    sequence_indices = [model["faces"].index(face) for face in order]
    metrics = model["evaluate"](sequence_indices) if "evaluate" in model else None
    remaining = (1 << len(model["kernels"])) - 1
    covered = 0
    previous_count = len(model["kernels"])
    final_remaining = None
    raw = []
    for face, face_index in zip(order, sequence_indices):
        covered |= model["cover_masks"][face_index]
        remaining &= model["fail_masks"][face_index]
        current_count = remaining.bit_count()
        anchors = [i for i in range(width) if i not in face]
        costs = []
        for extra in face:
            pair_costs = []
            for p, q in itertools.combinations(anchors, 2):
                probes = (
                    1 << extra,
                    (1 << extra) | (1 << p),
                    (1 << extra) | (1 << q),
                )
                pair_costs.append(sum(
                    not ((covered >> query_mask) & 1)
                    for query_mask in probes
                ))
            costs.append(min(pair_costs))
        costs.sort()
        raw.append((previous_count - current_count, tuple(costs)))
        previous_count = current_count
        final_remaining = current_count
    successful = len(model["kernels"]) - final_remaining
    weights = [(Fraction(count, successful), costs) for count, costs in raw]
    return weights, final_remaining


def expected_coordinate(model, order, m: int, extra_count: int, kmax: int):
    face_data, final_remaining = face_data_for_order(model, order)
    kernel_count = len(model["kernels"])
    miss = 1 - model["p"] + model["p"] * Fraction(final_remaining, kernel_count)
    expected = Fraction(0)
    by_failed_trials = {}
    for failed_trials in range(kmax + 1):
        prior = rank_distribution(27, m * failed_trials)
        conditional = Fraction(0)
        for rank, mass in enumerate(prior):
            if not mass:
                continue
            dimension = 27 - rank
            extra_rank, independent = extra_statistics(dimension, extra_count)
            face_expectation = sum(
                probability * (
                    81 - rank - 3 * extra_rank
                    + sum(Fraction(cost) * probability_independent
                          for cost, probability_independent
                          in zip(costs, independent))
                )
                for probability, costs in face_data
            )
            conditional += mass * face_expectation
        by_failed_trials[failed_trials] = conditional
        expected += (1 - miss) * (miss**failed_trials) * conditional
    expected += (miss ** (kmax + 1)) * 54
    return expected, by_failed_trials, miss


def pair_signature_check(table):
    checked = 0
    for a in range(1, 32):
        for b in range(a + 1, 32):
            signatures = {
                (table[x] ^ table[x ^ a], table[x] ^ table[x ^ b])
                for x in range(32)
            }
            if len(signatures) != 32:
                raise AssertionError(
                    f"anchor-pair derivative signature collision for ({a},{b})"
                )
            checked += 1
    return checked


class SeededCounterTape:
    def __init__(self, master_seed: bytes, seed: int):
        self.master_seed = master_seed
        self.seed = int(seed).to_bytes(8, "big")
        self.counter = 0

    def draw(self) -> int:
        payload = (
            self.master_seed + self.seed + self.counter.to_bytes(8, "big")
        )
        self.counter += 1
        return int.from_bytes(hashlib.sha256(payload).digest()[:4], "big")


def simulate_one(replay, master_seed, width, face_sequence, trial_cap,
                 replicate, mode, direction_domain, holdout_domain):
    tape = SeededCounterTape(master_seed, direction_domain + replicate)
    cache = {}

    def ask(value):
        key = value & MASK32
        if key not in cache:
            cache[key] = replay.oracle(key)
        return cache[key]

    def fifth_derivative(directions):
        result = 0
        for subset in range(32):
            value = 0
            for bit, direction in enumerate(directions):
                if (subset >> bit) & 1:
                    value ^= direction
            result ^= ask(value)
        return result & MASK32

    trial_directions = []
    anchors = None
    successful_complement = None
    witness = 0
    trials = 0
    for _ in range(trial_cap):
        directions = [tape.draw() for _ in range(width)]
        trial_directions.append(directions)
        found = False
        for complement in face_sequence:
            face = [
                direction for index, direction in enumerate(directions)
                if index not in complement
            ]
            observed = fifth_derivative(face)
            if observed:
                anchors = face
                successful_complement = complement
                witness = observed
                found = True
                break
        trials += 1
        if found:
            break
    if not witness or anchors is None or successful_complement is None:
        raise AssertionError("witness fallback in replay")

    witness_queries = len(cache)

    def section_input(coordinate):
        value = 0
        for bit, anchor in enumerate(anchors):
            if (coordinate >> bit) & 1:
                value ^= anchor
        return value & MASK32

    section = [ask(section_input(index)) for index in range(32)]
    section_queries = len(cache)

    for p, q in itertools.combinations(range(5), 2):
        signatures = {
            (section[x] ^ section[x ^ (1 << p)],
             section[x] ^ section[x ^ (1 << q)])
            for x in range(32)
        }
        if len(signatures) != 32:
            raise AssertionError("successful section has a non-separating pair")

    if mode == "standard":
        input_basis = [1 << bit for bit in range(32)]
        first_to_recover = 0
        quotient_basis = []
        correction_basis = []
    else:
        input_basis = list(anchors)
        if mode == "all-trial":
            for trial in trial_directions[:-1]:
                for candidate in trial:
                    if replay.gf2_rank_vectors(input_basis + [candidate]) > len(input_basis):
                        input_basis.append(candidate)
            current_extras = [
                trial_directions[-1][index] for index in successful_complement
            ]
            def extra_cost(candidate):
                best = None
                for p, q in itertools.combinations(range(5), 2):
                    candidates = (
                        candidate,
                        candidate ^ anchors[p],
                        candidate ^ anchors[q],
                    )
                    cost = sum((value & MASK32) not in cache for value in candidates)
                    key = (cost, p, q)
                    if best is None or key < best:
                        best = key
                return best[0]
            current_extras.sort(key=extra_cost)
            for candidate in current_extras:
                if replay.gf2_rank_vectors(input_basis + [candidate]) > len(input_basis):
                    input_basis.append(candidate)
        for bit in range(32):
            candidate = 1 << bit
            if replay.gf2_rank_vectors(input_basis + [candidate]) > len(input_basis):
                input_basis.append(candidate)
            if len(input_basis) == 32:
                break
        if len(input_basis) != 32:
            raise AssertionError("could not extend input basis")
        first_to_recover = 5
        quotient_basis = [1 << bit for bit in range(5)]
        correction_basis = [0] * 5

    express = replay.build_basis_solver(input_basis)
    for basis_index in range(first_to_recover, 32):
        vector = input_basis[basis_index]
        best = None
        for p, q in itertools.combinations(range(5), 2):
            candidates = (
                vector,
                vector ^ anchors[p],
                vector ^ anchors[q],
            )
            cost = sum((value & MASK32) not in cache for value in candidates)
            key = (cost, p, q)
            if best is None or key < best:
                best = key
        _, p, q = best
        f0 = ask(vector)
        f1 = ask(vector ^ anchors[p])
        f2 = ask(vector ^ anchors[q])
        matches = []
        for candidate in range(32):
            correction = f0 ^ section[candidate]
            if (
                correction == (f1 ^ section[candidate ^ (1 << p)])
                and correction == (f2 ^ section[candidate ^ (1 << q)])
            ):
                matches.append((candidate, correction))
        if len(matches) != 1:
            raise AssertionError(
                f"basis recovery did not identify a unique coordinate: {matches}"
            )
        quotient_basis.append(matches[0][0])
        correction_basis.append(matches[0][1])

    coordinate_queries = len(cache)

    def model_value(value):
        coefficients = express(value)
        quotient = 0
        correction = 0
        for index in range(32):
            if (coefficients >> index) & 1:
                quotient ^= quotient_basis[index]
                correction ^= correction_basis[index]
        return (section[quotient] ^ correction) & MASK32

    holdout_tape = SeededCounterTape(master_seed, holdout_domain + replicate)
    for _ in range(64):
        value = holdout_tape.draw()
        if model_value(value) != replay.oracle(value):
            raise AssertionError(f"holdout mismatch at {value:#x}")

    return {
        "total": len(cache),
        "trials": trials,
        "witness": witness_queries,
        "coordinate": coordinate_queries - section_queries,
    }


def randomized_replay(replay, replicates: int, seed_hex: str):
    master_seed = bytes.fromhex(seed_hex)
    if len(master_seed) != 32:
        raise ValueError("seed must contain exactly 64 hex characters")
    configurations = {
        "m7": (7, None, M7_TRIAL_CAP, 0x57000000, 0x58000000),
        "m8": (8, M8_FACE_SET, M8_TRIAL_CAP, 0x55000000, 0x56000000),
    }
    summaries = {}
    for policy, (width, face_sequence, trial_cap, direction_domain, holdout_domain) in configurations.items():
        if face_sequence is None:
            face_sequence = replay_checker.M7_SEQUENCE
        modes = {}
        for mode in ("standard", "anchor", "all-trial"):
            rows = [
                simulate_one(
                    replay, master_seed, width, face_sequence, trial_cap,
                    replicate, mode, direction_domain, holdout_domain
                )
                for replicate in range(replicates)
            ]
            totals = [row["total"] for row in rows]
            witnesses = [row["witness"] for row in rows]
            coordinates = [row["coordinate"] for row in rows]
            trials = [row["trials"] for row in rows]
            ordered = sorted(totals)
            modes[mode] = {
                "mean_total": statistics.mean(totals),
                "se_total": statistics.stdev(totals) / math.sqrt(replicates),
                "mean_witness": statistics.mean(witnesses),
                "se_witness": statistics.stdev(witnesses) / math.sqrt(replicates),
                "mean_coordinate": statistics.mean(coordinates),
                "se_coordinate": statistics.stdev(coordinates) / math.sqrt(replicates),
                "mean_trials": statistics.mean(trials),
                "failure_rate": sum(value > 1 for value in trials) / replicates,
                "median": statistics.median(totals),
                "p90": ordered[math.floor(0.90 * (replicates - 1))],
                "p95": ordered[math.floor(0.95 * (replicates - 1))],
                "max": max(totals),
            }
        summaries[policy] = modes
    return {
        "master_seed": seed_hex,
        "replicates": replicates,
        "holdouts_per_policy_mode": replicates * 64,
        "summary": summaries,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--replay-replicates", type=int, default=0)
    parser.add_argument("--seed", default=None)
    args = parser.parse_args()
    if args.replay_replicates not in (0,) and args.replay_replicates < 2:
        parser.error("--replay-replicates must be 0 or at least 2")

    checker = load_sibling(
        "agent2-rankfive-eight-direction-witness.py", "agent2_m7_m8_checker"
    )
    replay = load_sibling(
        "agent2-rankfive-m8-query-replay.py", "agent2_m7_m8_replay"
    )
    global replay_checker
    replay_checker = checker

    pair_count = pair_signature_check(replay.TABLE)
    model7 = checker.build_model(7)
    model8 = checker.build_model(8)
    m7 = exact_order_dp(model7, checker.M7_SEQUENCE, 7, 2, 20)
    m8 = exact_order_dp(model8, M8_FACE_SET, 8, 3, 16)

    def components(model, result, m, extra_count, kmax):
        coordinate, _, miss = expected_coordinate(
            model, result["order"], m, extra_count, kmax
        )
        metrics = checker.evaluate([
            model["faces"].index(face) for face in result["order"]
        ], model=model) if False else None
        # The witness expectation is evaluated with the same exact face order.
        remaining = (1 << len(model["kernels"])) - 1
        expected_faces = Fraction(0)
        covered = 0
        previous = len(model["kernels"])
        for face in result["order"]:
            face_index = model["faces"].index(face)
            reach = 1 - model["p"] + model["p"] * Fraction(remaining.bit_count(), len(model["kernels"]))
            expected_faces += reach
            remaining &= model["fail_masks"][face_index]
            covered |= model["cover_masks"][face_index]
        miss_check = 1 - model["p"] + model["p"] * Fraction(remaining.bit_count(), len(model["kernels"]))
        # Expected witness query count is obtained from the checker evaluator.
        eval_metrics = checker.evaluate(model, [
            model["faces"].index(face) for face in result["order"]
        ])
        return {
            "witness_queries": float(eval_metrics["Q"]),
            "coordinate_queries": float(coordinate),
            "total_queries": float(eval_metrics["Q"] + coordinate),
            "miss_probability": float(miss_check),
            "expected_face_evaluations": float(expected_faces / (1 - miss_check)),
            "expected_direction_words": float(m / (1 - miss_check)),
            "order": [list(face) for face in result["order"]],
        }

    exact = {
        "pair_signature_pairs_checked": pair_count,
        "all_pairs_injective": True,
        "m7": components(model7, m7, 7, 2, 20),
        "m8": components(model8, m8, 8, 3, 16),
    }
    exact["m7_minus_m8_total"] = (
        exact["m7"]["total_queries"] - exact["m8"]["total_queries"]
    )
    output = {"exact": exact}
    if args.replay_replicates:
        seed = args.seed or secrets.token_hex(32)
        output["randomized_replay"] = randomized_replay(
            replay, args.replay_replicates, seed
        )
    print(json.dumps(output, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
