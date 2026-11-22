#!/usr/bin/env python3
"""Independent Python peer check of Agent 24's common-basis repair proof."""
from collections import Counter
from itertools import permutations
from fractions import Fraction
import json
import random


def apply_columns(columns, coordinates):
    result = 0
    for index, column in enumerate(columns):
        if (coordinates >> index) & 1:
            result ^= column
    return result


def span(columns):
    values = {0}
    for column in columns:
        values |= {value ^ column for value in tuple(values)}
    return values


def rank(columns):
    return len(span(columns)).bit_length() - 1


def dependency_circuit(columns, width):
    candidates = [mask for mask in range(1, 1 << width)
                  if apply_columns(columns, mask) == 0]
    assert candidates
    return min(candidates, key=lambda mask: (mask.bit_count(), mask))


def repair_basis(mapping, width, rng):
    zero = mapping[0]
    basis = [1 << bit for bit in range(width)]
    outputs = [mapping[value] ^ zero for value in basis]
    initial_rank = rank(outputs)
    valid_trials = 0
    replacements = 0
    while rank(outputs) < width:
        circuit = dependency_circuit(outputs, width)
        assert circuit.bit_count() >= 3
        eligible_coordinates = [a for a in range(1 << width) if a & circuit]
        coordinates_drawn = rng.choice(eligible_coordinates)
        candidate = apply_columns(basis, coordinates_drawn)
        valid_trials += 1
        image = mapping[candidate] ^ zero
        if image in span(outputs):
            continue
        replace_index = next(i for i in range(width)
                             if ((coordinates_drawn & circuit) >> i) & 1)
        basis[replace_index] = candidate
        outputs[replace_index] = image
        replacements += 1
        assert rank(outputs) == initial_rank + replacements
        assert rank(basis) == width
    assert rank(outputs) == width
    return {
        "basis": basis,
        "outputs": outputs,
        "initial_rank": initial_rank,
        "replacements": replacements,
        "valid_trials": valid_trials,
    }


def exhaustive_width_three():
    rng = random.Random(20261122)
    initial_ranks = Counter()
    repairs = 0
    max_trials = 0
    max_replacements = 0
    for image_order in permutations(range(1, 8)):
        mapping = (0,) + image_order
        result = repair_basis(mapping, 3, rng)
        assert result["replacements"] == 3 - result["initial_rank"]
        for source, output in zip(result["basis"], result["outputs"]):
            assert mapping[source] ^ mapping[0] == output
        initial_ranks[result["initial_rank"]] += 1
        repairs += result["replacements"] > 0
        max_trials = max(max_trials, result["valid_trials"])
        max_replacements = max(max_replacements, result["replacements"])
    assert initial_ranks == Counter({3: 4032, 2: 1008})
    assert repairs == 1008
    return {
        "zero_fixed_permutations": 5040,
        "initial_rank_histogram": dict(sorted(initial_ranks.items())),
        "permutations_repaired": repairs,
        "max_valid_trials_observed": max_trials,
        "max_replacements": max_replacements,
    }


def hyperplane_completion_witness():
    width = 5
    size = 1 << width
    half = size // 2
    queried = [0, 3, 5, 6, 7, 9, 10, 11, 12, 13]
    proposed = [1, 2, 4, 8, 16]
    assert len(set(queried)) == len(queried)
    assert rank(proposed) == width
    assert len(queried) + width + 1 == half
    partial = {0: 0}
    next_output = 1
    for source in queried + proposed:
        if source not in partial:
            partial[source] = next_output
            next_output += 1
    assert next_output <= half
    used = set(partial.values())
    remaining_outputs = [y for y in range(size) if y not in used]
    mapping = [-1] * size
    for source, target in partial.items():
        mapping[source] = target
    offset = 0
    for source in range(size):
        if mapping[source] == -1:
            mapping[source] = remaining_outputs[offset]
            offset += 1
    assert offset == len(remaining_outputs)
    assert len(set(mapping)) == size
    assert mapping[0] == 0
    assert all(mapping[source] < half for source in queried + proposed)
    image_columns = [mapping[source] for source in proposed]
    assert rank(image_columns) < width
    return {
        "width": width,
        "hyperplane_size": half,
        "distinct_queries_including_zero": len(queried),
        "proposed_basis_size": len(proposed),
        "completed_mapping_is_permutation": True,
        "proposed_output_rank": rank(image_columns),
        "deterministic_lower_bound": half - width,
    }


def column_space_with_circuit(columns, width):
    pivots = [None] * width
    witnesses = [0] * width
    rank_value = 0
    circuit = 0
    for index, column in enumerate(columns):
        value = column
        witness = 1 << index
        for bit in reversed(range(width)):
            if not ((value >> bit) & 1):
                continue
            pivot = pivots[bit]
            if pivot is not None:
                value ^= pivot
                witness ^= witnesses[bit]
            else:
                pivots[bit] = value
                witnesses[bit] = witness
                rank_value += 1
                break
        if value == 0 and circuit == 0:
            circuit = witness

    def representation(target):
        value = target
        mask = 0
        for bit in reversed(range(width)):
            if not ((value >> bit) & 1):
                continue
            pivot = pivots[bit]
            if pivot is None:
                return None
            value ^= pivot
            mask ^= witnesses[bit]
        return mask if value == 0 else None

    return rank_value, circuit, representation


def seeded_xorshift32(seed):
    state = seed & 0xffffffff

    def sample(bound):
        nonlocal state
        state ^= (state << 13) & 0xffffffff
        state ^= state >> 17
        state ^= (state << 5) & 0xffffffff
        state &= 0xffffffff
        return state % bound

    return sample


def width32_reproduction():
    targets = [value for value in range(1, 64) if value & (value - 1)]
    swaps = {}
    for index in range(6, 32):
        high = 1 << index
        low = targets[index - 6]
        swaps[high] = low
        swaps[low] = high

    def oracle(value):
        return swaps.get(value, value)

    width = 32
    limit = 1 << width
    ledger = {}

    def call(value):
        if value not in ledger:
            ledger[value] = oracle(value)
        return ledger[value]

    zero = call(0)
    basis = [1 << bit for bit in range(width)]
    outputs = [call(value) ^ zero for value in basis]
    initial_rank, _circuit, _ = column_space_with_circuit(outputs, width)
    assert initial_rank == 6
    sample = seeded_xorshift32(20261123)
    draws = 0
    valid_trials = 0
    replacements = 0
    while True:
        space_rank, circuit, output_rep = column_space_with_circuit(outputs, width)
        if space_rank == width:
            break
        input_rank, _input_circuit, input_rep = column_space_with_circuit(basis, width)
        assert input_rank == width
        draws += 1
        candidate = sample(limit)
        coordinates_value = input_rep(candidate)
        possible = coordinates_value & circuit
        if possible == 0:
            continue
        valid_trials += 1
        image = call(candidate) ^ zero
        if output_rep(image) is not None:
            continue
        position = next(i for i in range(width) if (possible >> i) & 1)
        basis[position] = candidate
        outputs[position] = image
        replacements += 1
        assert column_space_with_circuit(outputs, width)[0] == space_rank + 1
    assert (draws, valid_trials, replacements, len(ledger)) == (30, 29, 26, 62)
    return {"initial_rank": initial_rank, "final_rank": width,
            "replacements": replacements, "draws": draws,
            "valid_trials": valid_trials, "distinct_oracle_calls": len(ledger)}


def main():
    assert 1 - Fraction(1, 2) / (1 - Fraction(1, 8)) == Fraction(3, 7)
    assert 1 - Fraction(1, 3) / (1 - Fraction(1, 9)) == Fraction(5, 8)
    result = {
        "probability_bounds": {"GF2_circuit_size_at_least_3": "3/7",
                               "GFq_q_ge_3_circuit_size_at_least_2": "5/8"},
        "exhaustive_width_three_repair": exhaustive_width_three(),
        "deterministic_hyperplane_witness": hyperplane_completion_witness(),
        "width32_maximal_deficiency_seeded_repair": width32_reproduction(),
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
