#!/usr/bin/env python3
"""Independent exact-Fraction check of fixed rank-five witness orders and collision bounds."""
from fractions import Fraction
from itertools import combinations


def rref_2d_kernels(m):
    out = []
    for p0, p1 in combinations(range(m), 2):
        free0 = [j for j in range(p0 + 1, m) if j != p1]
        free1 = [j for j in range(p1 + 1, m)]
        for assignment in range(1 << (len(free0) + len(free1))):
            row0, row1, bit = 1 << p0, 1 << p1, 0
            for j in free0:
                if (assignment >> bit) & 1:
                    row0 |= 1 << j
                bit += 1
            for j in free1:
                if (assignment >> bit) & 1:
                    row1 |= 1 << j
                bit += 1
            out.append((row0, row1))
    return out


def rank5_probability(m):
    p = Fraction(1)
    for i in range(5):
        p *= 1 - Fraction(2**i, 2**m)
    return p


def query_union_for_face(m, omitted):
    face = ((1 << m) - 1)
    for i in omitted:
        face ^= 1 << i
    values = set()
    sub = face
    while True:
        values.add(sub)
        if sub == 0:
            break
        sub = (sub - 1) & face
    return values


def check_seven():
    m = 7
    kernels = rref_2d_kernels(m)
    assert len(kernels) == 2667
    order = [(0, 1), (0, 2), (0, 3), (0, 4), (0, 5),
             (1, 6), (2, 6), (3, 6), (4, 6), (5, 6)]
    p = rank5_probability(m)
    remaining = [True] * len(kernels)
    covered = set()
    expected_trial = Fraction(0)
    rows = []
    for step, (i, j) in enumerate(order, 1):
        reach = 1 - p + p * Fraction(sum(remaining), len(kernels))
        face_queries = query_union_for_face(m, (i, j))
        increment = len(covered | face_queries) - len(covered)
        covered |= face_queries
        expected_trial += reach * increment
        for q, (u, v) in enumerate(kernels):
            if remaining[q]:
                a, b = (u >> i) & 1, (u >> j) & 1
                c, d = (v >> i) & 1, (v >> j) & 1
                if (a * d) ^ (b * c):
                    remaining[q] = False
        rows.append((step, (i, j), sum(remaining), reach, increment, len(covered)))
    f = 1 - p + p * Fraction(sum(remaining), len(kernels))
    q = (expected_trial - f) / (1 - f)
    assert expected_trial == Fraction(1040519433, 16777216)
    assert f == Fraction(9034517, 33554432)
    assert q == Fraction(2072004349, 24519915)
    assert [r[4] for r in rows] == [32, 16, 8, 4, 2, 16, 8, 4, 2, 1]
    assert len(covered) == 93
    return p, expected_trial, f, q, rows


def check_six():
    m = 6
    p = rank5_probability(m)
    # A full-rank 5x6 matrix has a uniform nonzero one-dimensional kernel vector.
    kernel_vectors = list(range(1, 1 << m))
    order = list(range(m))
    covered = set()
    expected_trial = Fraction(0)
    for step, omitted in enumerate(order):
        still_fail = sum(1 for v in kernel_vectors
                         if all(((v >> old) & 1) == 0 for old in order[:step]))
        reach = 1 - p + p * Fraction(still_fail, len(kernel_vectors))
        face_queries = query_union_for_face(m, (omitted,))
        increment = len(covered | face_queries) - len(covered)
        covered |= face_queries
        expected_trial += reach * increment
    f = 1 - p
    q = (expected_trial - f) / (1 - f)
    assert p == Fraction(615195, 1048576)
    assert f == Fraction(433381, 1048576)
    assert expected_trial == Fraction(26673129, 524288)
    assert q == Fraction(1706867, 19845)
    assert len(covered) == 63
    return p, expected_trial, f, q


def dependence_probability(m):
    full_rank = Fraction(1)
    for i in range(m):
        full_rank *= 1 - Fraction(2**i, 2**32)
    return 1 - full_rank


def main():
    p7, e7, f7, q7, rows7 = check_seven()
    p6, e6, f6, q6 = check_six()
    dep7, dep6 = dependence_probability(7), dependence_probability(6)
    within7 = Fraction(93) * dep7 / (1 - f7)
    within6 = Fraction(63) * dep6 / (1 - f6)
    # Across trials, zero is already accounted for by Q=(E-f)/(1-f).
    # For each nonempty subset mask in a fresh trial, its kernel component
    # is uniform in GF(2)^27 conditional on the 5-bit projection; hence a
    # collision with any fixed prior nonzero query point has probability <=2^-27.
    # Summing pairwise opportunities over reached trials gives this bound.
    cross7 = Fraction(92**2, 2**27) * f7 / (1 - f7)**2
    cross6 = Fraction(62**2, 2**27) * f6 / (1 - f6)**2
    total7, total6 = within7 + cross7, within6 + cross6
    gap = q6 - q7
    assert f7**18 < Fraction(1, 10**10) < f7**17
    assert f6**27 < Fraction(1, 10**10) < f6**26
    assert 93 + 17 * 92 == 1657
    assert 63 + 26 * 62 == 1675
    assert 1657 + 96 + 726 == 2479
    assert 1675 + 96 + 726 == 2497
    assert 1657 + 992 + 726 == 3375
    assert 1675 + 992 + 726 == 3393

    print("seven-direction injective-model check")
    print(f"  kernels={len(rref_2d_kernels(7))} p7={p7} ({float(p7):.15f})")
    print(f"  E7={e7} ({float(e7):.12f}) f7={f7} ({float(f7):.15f})")
    print(f"  Q7={q7} ({float(q7):.12f}) union=93")
    print("  prefix (face, remaining kernels, reach probability, new queries):")
    for step, pair, rem, reach, inc, union in rows7:
        print(f"    {step:2d} {pair!s:8s} R={rem:4d} r={float(reach):.12f} +{inc:2d} union={union:2d}")
    print("six-direction injective-model check")
    print(f"  p6={p6} ({float(p6):.15f}) E6={e6} ({float(e6):.12f})")
    print(f"  f6={f6} ({float(f6):.15f}) Q6={q6} ({float(q6):.12f}) union=63")
    print("unconditional collision bounds (expected query savings)")
    print(f"  Pdep7={float(dep7):.15g} within7<{float(within7):.12g} cross7<{float(cross7):.12g} total7<{float(total7):.12g}")
    print(f"  Pdep6={float(dep6):.15g} within6<{float(within6):.12g} cross6<{float(cross6):.12g} total6<{float(total6):.12g}")
    print(f"  injective-model gap Q6-Q7={float(gap):.12f}")
    print(f"  unconditional gap lower>{float(gap-total6):.12f} upper<{float(gap+total7):.12f}")
    print("reliability/caps")
    print(f"  f7^17={float(f7**17):.13g} f7^18={float(f7**18):.13g} trials7=18 witness_cap7=1657")
    print(f"  f6^26={float(f6**26):.13g} f6^27={float(f6**27):.13g} trials6=27 witness_cap6=1675")
    print("  fast caps 2479 / 2497; signature caps 3375 / 3393")


if __name__ == "__main__":
    main()
