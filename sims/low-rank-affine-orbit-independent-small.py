"""Independent tiny-width black-box inversion proof checker, standard library only."""

from itertools import combinations, permutations
from random import Random


def apply(columns, x):
    value = 0
    for index, column in enumerate(columns):
        if (x >> index) & 1:
            value ^= column
    return value


def rank(columns):
    # Brute-force all linear combinations, avoiding the JavaScript pivot code.
    return len({apply(columns, x) for x in range(1 << len(columns))}).bit_length() - 1


def repair(observed, n):
    k = rank(observed)
    kept = next(c for c in combinations(range(n), k)
                if rank([observed[i] for i in c]) == k)
    repaired = list(observed)
    independent = [observed[i] for i in kept]
    for i in range(n):
        if i in kept:
            continue
        unit = next(1 << j for j in range(n)
                    if rank(independent + [1 << j]) == len(independent) + 1)
        repaired[i] = unit
        independent.append(unit)
    assert rank(repaired) == n
    assert sum(x != y for x, y in zip(repaired, observed)) == n - k
    assert rank([x ^ y for x, y in zip(repaired, observed)]) <= n - k
    return repaired, n - k


def recover(table, r, target):
    n = (len(table) - 1).bit_length()
    cache = {}

    def query(x):
        cache.setdefault(x, table[x])
        return cache[x]

    origin = query(0)
    observed = [query(1 << i) ^ origin for i in range(n)]
    repaired, d = repair(observed, n)
    inverse = {apply(repaired, x): x for x in range(1 << n)}
    assert len(inverse) == 1 << n
    z = inverse[target ^ origin]
    current = z
    for step in range(1, (1 << min(n, r + d)) + 1):
        following = inverse[query(current) ^ origin]
        if following == z:
            return current, len(cache), d, step
        current = following
    raise AssertionError("invariant-coset cycle bound failed")


def main():
    total_tables = 0
    eligible = 0
    targets = 0
    by_nullity = [0, 0, 0]
    max_queries = 0
    for table in permutations(range(8)):
        total_tables += 1
        origin = table[0]
        residual = [table[x] ^ x ^ origin for x in range(8)]
        # Enumerate the entire residual span explicitly without JS elimination.
        span = {0}
        for value in residual:
            span.update({u ^ value for u in tuple(span)})
        if len(span) > 4:
            continue
        eligible += 1
        for secret in range(8):
            found, queries, d, _ = recover(table, 2, table[secret])
            assert found == secret
            assert queries <= 12
            targets += 1
            by_nullity[d] += 1
            max_queries = max(max_queries, queries)

    rng = Random(0x1A1B2026)
    trials = 2000
    random_targets = 0
    by_nullity4 = [0, 0, 0]
    max_queries4 = 0
    for _ in range(trials):
        # A concrete random non-affine rank-two coset permutation under
        # independent, hidden invertible affine input and output maps.
        while True:
            input_matrix = [rng.randrange(16) for _ in range(4)]
            if rank(input_matrix) == 4:
                break
        while True:
            output_matrix = [rng.randrange(16) for _ in range(4)]
            if rank(output_matrix) == 4:
                break
        in_offset, out_offset = rng.randrange(16), rng.randrange(16)
        blocks = [rng.sample(range(4), 4) for _ in range(4)]

        def permute(z):
            return (z & 3) | (blocks[z & 3][z >> 2] << 2)

        table = tuple(apply(output_matrix,
                            permute(apply(input_matrix, x) ^ in_offset)) ^ out_offset
                      for x in range(16))
        assert len(set(table)) == 16
        core = [apply(output_matrix, apply(input_matrix, 1 << i)) for i in range(4)]
        residual = [table[x] ^ table[0] ^ apply(core, x) for x in range(16)]
        span = {0}
        for value in residual:
            span.update({u ^ value for u in tuple(span)})
        assert len(span) <= 4
        for secret in range(16):
            found, queries, d, _ = recover(table, 2, table[secret])
            assert found == secret
            assert queries <= 21
            random_targets += 1
            by_nullity4[d] += 1
            max_queries4 = max(max_queries4, queries)

    print({"exhaustive_n3": {"tables": total_tables, "eligible": eligible,
                              "targets": targets, "by_nullity": by_nullity,
                              "max_queries": max_queries},
           "random_n4": {"samples": trials, "targets": random_targets,
                         "by_nullity": by_nullity4, "max_queries": max_queries4},
           "all_passed": True})


if __name__ == "__main__":
    main()
