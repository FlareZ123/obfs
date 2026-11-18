# Black-box inversion of compatible permutations with an arbitrary linear wrapper

**Date:** 18 November 2026. **Agent:** 2. **Classification:** intermediate theorem + computational validation. Independent review requested before any promotion to `results/`.

## Statement

Let `P` be a 32-bit **compatible permutation**: for every `k`, congruent inputs modulo `2^k` produce congruent outputs modulo `2^k`, and the induced map modulo `2^k` is bijective. Rivest-family integer permutation polynomials satisfy this property. So do triangular bit permutations whose output bit `k` is input bit `k` XOR an arbitrary Boolean function of lower input bits.

Let `L` be an arbitrary unknown invertible linear map on 32-bit vectors over GF(2). The attacker receives only a chosen-input oracle and a published target.

For either one-sided composition

```text
F(x) = L(P(x))
F(x) = P(L(x))
```

the target preimage can be recovered with a small number of black-box queries. The attacker does not need the source, AST, polynomial degree, coefficients, generator seed, permutation internals, or the matrix for `L`.

## Outer-linear theorem: F(x) = L(P(x))

Let `H_k` be the vector subspace of 32-bit words whose low `k` bits are zero.

For every bit position `j`, compatibility and bijectivity imply that `P(0)` and `P(2^j)` agree below bit `j` and differ at bit `j`. Therefore

```text
d_j = P(0) XOR P(2^j)
```

has lowest set bit exactly `j`. The set `{d_j : j >= k}` is triangular and forms a basis of `H_k`.

The attacker can query

```text
D_j = F(0) XOR F(2^j) = L(d_j)
```

so `{D_j : j >= k}` is a basis of the hidden subspace `S_k = L(H_k)`.

For target `y = F(c)` and any candidate `x`:

```text
y XOR F(x) is in S_k
iff P(c) XOR P(x) is in H_k
iff P(c) == P(x) mod 2^k
iff c == x mod 2^k
```

The last equivalence uses bijectivity modulo `2^k`.

This gives a bit-lifting inverter. At step `k`, test the current low-bit prefix against `S_(k+1)`. Membership decides whether bit `k` of the secret is zero or one.

The construction needs 33 initial oracle values, `F(0)` and `F(2^j)` for 32 bit positions, then at most one prefix query per recovered bit. A simple implementation therefore has an upper bound of 65 oracle calls before cache reuse.

## Inner-linear theorem: F(x) = P(L(x))

Define the nested input subspaces

```text
T_k = { v : L(v) is in H_k }.
```

`T_0` is the entire vector space and each `T_(k+1)` has codimension one inside `T_k`.

Take any `v` in `T_k`. Because `L(v)` has low `k` bits zero, compatibility makes `P(L(v))` and `P(0)` agree below bit `k`. Bijectivity on the two children of each residue class modulo `2^k` means their bit-`k` difference is exactly bit `k` of `L(v)`.

Hence, on `T_k`,

```text
ell_k(v) = bit_k(F(v) XOR F(0))
```

is a nonzero GF(2) linear functional and

```text
T_(k+1) = kernel(ell_k | T_k).
```

Starting from the standard basis of `T_0`, the attacker evaluates `ell_k` on the current basis, selects one pivot with label 1, and XOR-eliminates that pivot from every other label-1 basis vector. This yields a basis of `T_(k+1)` and preserves the pivot as a toggle `p_k` in `T_k \ T_(k+1)`.

To invert target `y`, maintain a candidate whose output agrees with `y` modulo `2^k`. XOR with `p_k` preserves all lower congruence bits and flips the unique child at bit `k`; therefore exactly one of the two candidates agrees modulo `2^(k+1)`.

A straightforward basis learner needs at most

```text
1 + 32 + 31 + ... + 1 = 529
```

oracle values to recover the nested flag, plus at most 32 inversion queries. The implementation caches repeated inputs, so the observed distinct-query count is lower.

## Reproducible validation

Implementation: `sims/compatible-permutation-linear-wrapper-blackbox.js`, introduced at commit `0f116cbfb6bec2dfdb82d7853c7ffdab5cea1d13`.

Local runtime: Node `v22.16.0`.

The simulator generates arbitrary-looking invertible 32x32 GF(2) matrices by hundreds of elementary column operations. It validates four compatible-permutation families:

- Rivest permutation polynomials of degrees 3, 7 and 15;
- an independent nonlinear triangular bit-permutation family, where each output bit XORs its input bit with a random nonlinear Boolean function of lower bits.

For each family and each wrapper orientation, 64 deterministic randomized cases were tested, for **512 total published targets**.

| Orientation | Family | Cases | Distinct oracle queries | Median local attack ms |
|---|---|---:|---:|---:|
| outer `L(P(x))` | Rivest degree 3 | 64 | 44-52 | 0.069 |
| outer | Rivest degree 7 | 64 | 45-53 | 0.079 |
| outer | Rivest degree 15 | 64 | 45-55 | 0.096 |
| outer | nonlinear triangular | 64 | 44-52 | 0.196 |
| inner `P(L(x))` | Rivest degree 3 | 64 | 254-300 | 0.142 |
| inner | Rivest degree 7 | 64 | 246-314 | 0.208 |
| inner | Rivest degree 15 | 64 | 249-307 | 0.292 |
| inner | nonlinear triangular | 64 | 233-310 | 0.860 |

All **512/512** target preimages were recovered exactly.

A separate larger local stress run before consolidation exercised 1,536 Rivest-wrapper targets, and an additional 2,000 nonlinear-triangular wrapper targets. All recovered exactly. These stress counts are supporting observations; the committed simulator above is the reproducible evidence pin.

## Consequence

Randomizing an xor/rotation layer into a much larger arbitrary invertible bit-linear matrix does not rescue a compatible permutation when that linear layer appears only on one side. The attack recovers the secret directly from congruence subspaces without reconstructing `P` or `L`.

This is a materially broader stop condition than syntax-aware recognition of xor-shifts or rotations. Any candidate based on a compatible permutation plus a one-sided GF(2)-linear shell should be treated as defeated under a chosen-query attacker.

For COO and SNO, a locally executable public function gives this attacker a natural oracle. For SCO, applicability depends on whether an authorized interface exposes equivalent chosen-input evaluations; the repository threat model permits unlimited legitimate requests but does not imply every internal transform is externally queryable.

## Scope and next discriminator

This theorem covers **one arbitrary linear wrapper on either side**. It does not prove recovery for the general sandwich `L_out(P(L_in(x)))` when both unknown linear maps are unrestricted. The separate exact-three-stage experiment in `sims/permutation-polynomial-linear-shell-blackbox.js` covers wrappers on both sides only for the bounded xor-shift/rotation family.

The unavailable Wang et al. full construction may use expanded MBA identities or interleavings outside both models. A faithful candidate still requires the exact article or author artifact, or an independently specified construction that is evaluated on its own terms.
