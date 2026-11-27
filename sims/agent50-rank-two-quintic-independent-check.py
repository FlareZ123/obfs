#!/usr/bin/env python3
"""Independent check of the affine-wrapped rank-two quintic oracle fixture.

No repository JavaScript inverter or matrix helper is imported. The script
rebuilds the fixed affine wrappers, checks the exact rank-two decomposition,
verifies the seven-dimensional joint-radical core, and independently performs
deterministic GF(2) low-rank target inversion.
"""
from itertools import combinations
import json
import random

MASK = (1 << 32) - 1
BITS = 32


def u32(value):
    return value & MASK


def make_rng(seed):
    state = seed & MASK

    def next_u32():
        nonlocal state
        state ^= (state << 13) & MASK
        state &= MASK
        state ^= state >> 17
        state &= MASK
        state ^= (state << 5) & MASK
        state &= MASK
        return state

    return next_u32


def make_linear_transform(seed):
    next_u32 = make_rng(seed)
    columns = [1 << bit for bit in range(BITS)]
    for _ in range(512):
        a, b = next_u32() % BITS, next_u32() % BITS
        if a == b:
            b = (b + 1) % BITS
        if (next_u32() & 1) == 0:
            columns[a], columns[b] = columns[b], columns[a]
        else:
            columns[b] = u32(columns[b] ^ columns[a])
    return columns


def apply_columns(columns, value):
    result = 0
    for bit, column in enumerate(columns):
        if (value >> bit) & 1:
            result ^= column
    return u32(result)


def extend_basis(basis, vector):
    remaining = u32(vector)
    for bit in range(BITS - 1, -1, -1):
        if not ((remaining >> bit) & 1):
            continue
        if basis[bit]:
            remaining = u32(remaining ^ basis[bit])
        else:
            basis[bit] = remaining
            return True
    return False


def column_rank(columns):
    basis = [0] * BITS
    return sum(extend_basis(basis, column) for column in columns)


def inverse_columns(columns):
    rows = []
    for row in range(BITS):
        left = sum(((columns[col] >> row) & 1) << col
                   for col in range(BITS))
        rows.append([left, 1 << row])
    for pivot in range(BITS):
        selected = next((row for row in range(pivot, BITS)
                         if (rows[row][0] >> pivot) & 1), None)
        if selected is None:
            raise ValueError("singular matrix")
        rows[pivot], rows[selected] = rows[selected], rows[pivot]
        for row in range(BITS):
            if row != pivot and ((rows[row][0] >> pivot) & 1):
                rows[row][0] ^= rows[pivot][0]
                rows[row][1] ^= rows[pivot][1]
    return [
        sum(((rows[row][1] >> column) & 1) << row
            for row in range(BITS))
        for column in range(BITS)
    ]


def core_permutation(value):
    value = u32(value)
    first = 128 if (value & 31) == 31 else 0
    second = 256 if (value & 124) == 124 else 0
    return u32(value ^ first ^ second)


def make_fixture():
    input_columns = make_linear_transform(0x12345678)
    output_columns = make_linear_transform(0x9ABCDEF0)
    input_bias, output_bias = 0x13579BDF, 0x2468ACE0

    def oracle(value):
        hidden = u32(apply_columns(input_columns, value) ^ input_bias)
        return u32(apply_columns(output_columns,
                                 core_permutation(hidden)) ^ output_bias)

    output_directions = [
        apply_columns(output_columns, 1 << 7),
        apply_columns(output_columns, 1 << 8),
    ]
    affine_columns = [
        apply_columns(output_columns,
                      apply_columns(input_columns, 1 << bit))
        for bit in range(BITS)
    ]
    constant = u32(apply_columns(output_columns, input_bias) ^ output_bias)

    def represented(value):
        hidden = u32(apply_columns(input_columns, value) ^ input_bias)
        first, second = (hidden & 31) == 31, (hidden & 124) == 124
        displacement = ((output_directions[0] if first else 0) ^
                        (output_directions[1] if second else 0))
        return u32(constant ^ apply_columns(affine_columns, value) ^
                   displacement)

    return oracle, represented, input_columns, output_columns, affine_columns, output_directions


def fifth_difference_pair(directions):
    result = 0
    for subset in range(1 << 5):
        value = 0
        for index, direction in enumerate(directions):
            if (subset >> index) & 1:
                value ^= direction
        first = 1 if (value & 31) == 31 else 0
        second = 1 if (value & 124) == 124 else 0
        result ^= first | (second << 1)
    return result


def verify_joint_radical():
    basis = [1 << bit for bit in range(7)]
    four_tuples = list(combinations(basis, 4))
    radical = [
        value for value in range(1 << 7)
        if all(fifth_difference_pair((value, *directions)) == 0
               for directions in four_tuples)
    ]
    assert radical == [0], radical
    assert fifth_difference_pair((1, 2, 4, 8, 16)) == 1
    assert fifth_difference_pair((4, 8, 16, 32, 64)) == 2
    return {"core_width": 7, "radical_size": 1,
            "joint_radical_codimension": 7}


def invert_rank_r(oracle, target, rank_bound):
    calls = 0

    def query(value):
        nonlocal calls
        calls += 1
        return u32(oracle(u32(value)))

    constant = query(0)
    columns = [u32(query(1 << bit) ^ constant) for bit in range(BITS)]
    basis, free_columns = [0] * BITS, []
    for index, column in enumerate(columns):
        if not extend_basis(basis, column):
            free_columns.append(index)
    nullity = len(free_columns)
    if nullity > rank_bound:
        raise ValueError("rank bound violated")

    completed = columns[:]
    for column in free_columns:
        for bit in range(BITS):
            direction = 1 << bit
            if extend_basis(basis, direction):
                completed[column] = u32(columns[column] ^ direction)
                break
        else:
            raise ValueError("could not complete affine interpolant")

    inverse = inverse_columns(completed)
    wanted = apply_columns(inverse, u32(target ^ constant))
    current = wanted
    orbit_bound = 1 << min(BITS, rank_bound + nullity)
    for orbit_calls in range(1, orbit_bound + 1):
        following = apply_columns(
            inverse, u32(query(current) ^ constant))
        if following == wanted:
            return {"preimage": current, "oracle_calls": calls,
                    "nullity": nullity, "orbit_calls": orbit_calls,
                    "orbit_bound": orbit_bound}
        current = following
    raise ValueError("orbit bound exhausted")


def main():
    oracle, represented, input_columns, output_columns, affine_columns, W = make_fixture()
    assert column_rank(input_columns) == BITS
    assert column_rank(output_columns) == BITS
    assert column_rank(affine_columns) == BITS
    assert column_rank(W) == 2

    rng = random.Random(20261124)
    checked = [0, 1, MASK, 0x4F0FF4EB]
    checked.extend(rng.getrandbits(BITS) for _ in range(10_000))
    for value in checked:
        assert oracle(value) == represented(value)

    radical = verify_joint_radical()
    secrets = [
        0x4F0FF4EB, 0xC108ECDD, 0xA58A6017, 0x34F93989,
        0x640944AC, 0x805D7DB1, 0xC2B25462, 0x7CF97486,
    ]
    expected_calls = [39, 40, 34, 40, 35, 40, 36, 40]
    expected_orbits = [6, 7, 1, 7, 2, 7, 3, 7]
    receipts = []
    loose_bound_receipts = []
    for index, secret in enumerate(secrets):
        target = oracle(secret)
        result = invert_rank_r(oracle, target, rank_bound=2)
        loose = invert_rank_r(oracle, target, rank_bound=5)
        assert result["preimage"] == secret == loose["preimage"]
        assert oracle(result["preimage"]) == target
        assert result["nullity"] == loose["nullity"] == 1
        assert result["orbit_bound"] == 8 and loose["orbit_bound"] == 64
        assert result["oracle_calls"] == loose["oracle_calls"] == expected_calls[index]
        assert result["orbit_calls"] == loose["orbit_calls"] == expected_orbits[index]
        receipts.append({
            "secret": f"0x{secret:08x}", "target": f"0x{target:08x}",
            "preimage": f"0x{result['preimage']:08x}",
            "calls": result["oracle_calls"], "nullity": result["nullity"],
            "orbit_calls": result["orbit_calls"],
        })
        loose_bound_receipts.append({
            "calls": loose["oracle_calls"], "nullity": loose["nullity"],
            "orbit_calls": loose["orbit_calls"], "orbit_bound": loose["orbit_bound"],
        })

    print(json.dumps({
        "result": "PASS",
        "rank_affine_part": column_rank(affine_columns),
        "rank_nonlinear_output_displacement": column_rank(W),
        "joint_radical": radical,
        "affine_decomposition_checks": len(checked),
        "target_recoveries": len(receipts),
        "total_rank_two_oracle_calls": sum(x["calls"] for x in receipts),
        "rank_bound_5_worst_case_query_cap_eight_targets": 8 * (BITS + 1 + 64),
        "receipts": receipts,
        "rank_bound_5_receipts": loose_bound_receipts,
        "scope": "independent finite/algebraic fixture check; not an arbitrary-JavaScript security result",
    }, indent=2))


if __name__ == "__main__":
    main()
